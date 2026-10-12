-- =====================================================================================
-- db/functions_admin.sql
-- Admin / moderation / ads / copyright RPCs required by the ProNax frontend but missing
-- from the external Supabase DB. Idempotent: every function is `create or replace`.
-- Safe to re-run. Run AFTER db/functions_user.sql and db/admin_console_fixes.sql.
-- =====================================================================================
-- Prerequisites (created elsewhere, re-declared here for safety):
--   enum public.app_role ('admin','moderator','user','support')
--   table public.user_roles(id,user_id,role,created_at)
--   table public.super_admins(user_id,created_at)
--   function public.has_role(_user_id uuid, _role app_role) -> boolean
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0. PREREQUISITE HELPERS (safe to re-run)
-- -------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = (select oid from pg_namespace where nspname = 'public')) then
    create type public.app_role as enum ('admin','moderator','user','support');
  end if;
end
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'::app_role));

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
grant select on public.super_admins to authenticated;
grant all on public.super_admins to service_role;
alter table public.super_admins enable row level security;
drop policy if exists "admins read super_admins" on public.super_admins;
create policy "admins read super_admins" on public.super_admins for select to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role));

-- has_role: SECURITY DEFINER so it bypasses RLS on user_roles (avoids recursion).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;

-- is_super_admin: true if the user is listed in super_admins (the "owner" tier).
create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = _user_id)
   or public.has_role(_user_id, 'admin'::app_role)
$$;
grant execute on function public.is_super_admin(uuid) to authenticated;

-- internal helper: is the caller an admin?
create or replace function public._caller_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin'::app_role)
     or public.is_super_admin(auth.uid())
$$;

-- internal helper: is the caller the owner (super_admin)?
create or replace function public._caller_is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin(auth.uid())
$$;

-- -------------------------------------------------------------------------------------
-- 1. ADMIN BOOTSTRAP & ROLE MANAGEMENT
-- -------------------------------------------------------------------------------------

-- admin_bootstrap_status() -> set of {can_claim_initial_admin, is_admin}
drop function if exists public.admin_bootstrap_status();
create function public.admin_bootstrap_status()
returns table (can_claim_initial_admin boolean, is_admin boolean)
language sql stable security definer set search_path = public as $$
  select
    (not exists (select 1 from public.user_roles where role = 'admin')
     and not exists (select 1 from public.super_admins)),
    public.has_role(auth.uid(), 'admin'::app_role)
$$;
grant execute on function public.admin_bootstrap_status() to authenticated;

-- admin_set_role(p_user, p_role, p_grant) -> Json
drop function if exists public.admin_set_role(uuid, public.app_role, boolean);
create function public.admin_set_role(
  p_user uuid, p_role public.app_role, p_grant boolean
)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_owner() then
    return json_build_object('success', false, 'reason', 'owner only');
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role)
    values (p_user, p_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(),
    case when p_grant then 'grant_role' else 'revoke_role' end,
    'user', p_user::text,
    json_build_object('role', p_role::text, 'grant', p_grant));
  return json_build_object('success', true, 'granted', p_grant, 'role', p_role::text);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean) to authenticated;

-- admin_revoke_admin(p_user) -> Json  (removes all elevated roles)
drop function if exists public.admin_revoke_admin(uuid);
create function public.admin_revoke_admin(p_user uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_owner() then
    return json_build_object('success', false, 'reason', 'owner only');
  end if;
  delete from public.user_roles
   where user_id = p_user and role in ('admin','moderator','support');
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'revoke_admin', 'user', p_user::text, json_build_object('user', p_user::text));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_revoke_admin(uuid) to authenticated;

-- admin_set_owner(p_user, p_grant) -> Json  (super_admins membership)
drop function if exists public.admin_set_owner(uuid, boolean);
create function public.admin_set_owner(p_user uuid, p_grant boolean)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_owner() then
    return json_build_object('success', false, 'reason', 'owner only');
  end if;
  if p_grant then
    insert into public.super_admins (user_id) values (p_user)
    on conflict (user_id) do nothing;
  else
    delete from public.super_admins where user_id = p_user;
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(),
    case when p_grant then 'grant_owner' else 'revoke_owner' end,
    'user', p_user::text, json_build_object('grant', p_grant));
  return json_build_object('success', true, 'granted', p_grant);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_set_owner(uuid, boolean) to authenticated;

-- admin_invite_by_email(p_email) -> Json  (owner only)
drop function if exists public.admin_invite_by_email(text);
create function public.admin_invite_by_email(p_email text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
begin
  if not public._caller_is_owner() then
    return json_build_object('success', false, 'reason', 'owner only', 'granted', false);
  end if;

  -- If a real user already exists with this email, grant admin immediately.
  select id into v_existing from auth.users where lower(email) = lower(p_email) limit 1;
  if v_existing is not null then
    insert into public.user_roles (user_id, role) values (v_existing, 'admin')
    on conflict (user_id, role) do nothing;
    insert into public.admin_invites (email, role, status, invited_by)
    values (p_email, 'admin', 'accepted', v_uid)
    on conflict do nothing;
    insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
    values (v_uid, 'invite_admin', 'user', v_existing::text, json_build_object('email', p_email, 'granted', true));
    return json_build_object('success', true, 'granted', true, 'email', p_email);
  end if;

  -- Otherwise record a pending invite.
  insert into public.admin_invites (email, role, status, invited_by)
  values (p_email, 'admin', 'pending', v_uid)
  on conflict do nothing;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (v_uid, 'invite_admin', 'invite', p_email, json_build_object('email', p_email, 'granted', false));
  return json_build_object('success', true, 'granted', false, 'email', p_email);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm, 'granted', false);
end;
$$;
grant execute on function public.admin_invite_by_email(text) to authenticated;

-- admin_cancel_invite(p_id) -> Json
drop function if exists public.admin_cancel_invite(uuid);
create function public.admin_cancel_invite(p_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_owner() then
    return json_build_object('success', false, 'reason', 'owner only');
  end if;
  delete from public.admin_invites where id = p_id and status = 'pending';
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_cancel_invite(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- 2. USER BANS / FLAGS
-- -------------------------------------------------------------------------------------

-- admin_ban_user(p_user, p_reason, p_until) -> Json
drop function if exists public.admin_ban_user(uuid, text, timestamptz);
create function public.admin_ban_user(
  p_user uuid, p_reason text, p_until timestamptz
)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.profiles
     set is_banned = true,
         status = 'suspended',
         ban_reason = p_reason,
         banned_until = p_until
   where id = p_user;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'ban_user', 'user', p_user::text,
    json_build_object('reason', p_reason, 'until', p_until));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_ban_user(uuid, text, timestamptz) to authenticated;

-- admin_unban_user(p_user) -> Json
drop function if exists public.admin_unban_user(uuid);
create function public.admin_unban_user(p_user uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.profiles
     set is_banned = false, status = 'active', ban_reason = null, banned_until = null
   where id = p_user;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'unban_user', 'user', p_user::text, json_build_object('user', p_user::text));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_unban_user(uuid) to authenticated;

-- admin_flag_bot(p_user, p_flag) -> Json
drop function if exists public.admin_flag_bot(uuid, boolean);
create function public.admin_flag_bot(p_user uuid, p_flag boolean default true)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.profiles
     set is_bot_flagged = p_flag, bot_flagged_at = case when p_flag then now() else null end
   where id = p_user;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), case when p_flag then 'flag_bot' else 'unflag_bot' end,
    'user', p_user::text, json_build_object('flag', p_flag));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_flag_bot(uuid, boolean) to authenticated;

-- admin_unflag_bot(p_user) -> Json
drop function if exists public.admin_unflag_bot(uuid);
create function public.admin_unflag_bot(p_user uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.profiles set is_bot_flagged = false, bot_flagged_at = null where id = p_user;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'unflag_bot', 'user', p_user::text, json_build_object('user', p_user::text));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_unflag_bot(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- 3. STRIKES
-- -------------------------------------------------------------------------------------

-- admin_issue_strike(p_user, p_reason, p_category, p_severity, p_source, p_video_id) -> Json
drop function if exists public.admin_issue_strike(uuid, text, text, integer, text, uuid);
create function public.admin_issue_strike(
  p_user uuid, p_reason text, p_category text,
  p_severity integer default 1, p_source text default 'manual', p_video_id uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  insert into public.user_strikes
    (id, user_id, reason, category, severity, source, issued_by, video_id, created_at, expires_at)
  values
    (v_id, p_user, p_reason, p_category, p_severity, p_source, auth.uid(), p_video_id, now(),
     case when p_severity >= 3 then now() + interval '30 days' else now() + interval '90 days' end);
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'issue_strike', 'user', p_user::text,
    json_build_object('category', p_category, 'severity', p_severity, 'reason', p_reason));
  return json_build_object('success', true, 'strike_id', v_id::text);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_issue_strike(uuid, text, text, integer, text, uuid) to authenticated;

-- admin_revoke_strike(p_strike_id, p_reason) -> Json
drop function if exists public.admin_revoke_strike(uuid, text);
create function public.admin_revoke_strike(p_strike_id uuid, p_reason text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.user_strikes
     set revoked_at = now(), revoked_reason = p_reason
   where id = p_strike_id;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'revoke_strike', 'strike', p_strike_id::text, json_build_object('reason', p_reason));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_revoke_strike(uuid, text) to authenticated;

-- active_strike_count(_user_id) -> integer
drop function if exists public.active_strike_count(uuid);
create function public.active_strike_count(_user_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.user_strikes
   where user_id = _user_id
     and revoked_at is null
     and (expires_at is null or expires_at > now())
$$;
grant execute on function public.active_strike_count(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- 4. WALLETS & WITHDRAWALS
-- -------------------------------------------------------------------------------------

-- admin_adjust_wallet(p_user_id, p_delta, p_set_balance, p_reason) -> Json
drop function if exists public.admin_adjust_wallet(uuid, numeric, numeric, text);
create function public.admin_adjust_wallet(
  p_user_id uuid, p_delta numeric default 0,
  p_set_balance numeric default null, p_reason text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_bal numeric;
  v_earned numeric;
  v_withdrawn numeric;
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;

  insert into public.user_wallets (user_id, balance, total_earned, total_withdrawn, created_at, updated_at)
  values (p_user_id, 0, 0, 0, now(), now())
  on conflict (user_id) do nothing;

  select balance, total_earned, total_withdrawn into v_bal, v_earned, v_withdrawn
  from public.user_wallets where user_id = p_user_id for update;

  if p_set_balance is not null then
    v_bal := p_set_balance;
  else
    v_bal := coalesce(v_bal,0) + coalesce(p_delta,0);
  end if;
  if coalesce(p_delta,0) > 0 then
    v_earned := coalesce(v_earned,0) + coalesce(p_delta,0);
  end if;

  update public.user_wallets
     set balance = v_bal,
         total_earned = v_earned,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'adjust_wallet', 'user', p_user_id::text,
    json_build_object('delta', p_delta, 'set_balance', p_set_balance, 'reason', p_reason));

  return json_build_object('success', true, 'balance', v_bal, 'total_earned', v_earned);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_adjust_wallet(uuid, numeric, numeric, text) to authenticated;

-- request_withdrawal(p_amount, p_method, p_details) -> withdrawal_requests row
drop function if exists public.request_withdrawal(numeric, text, json);
create function public.request_withdrawal(
  p_amount numeric, p_method text default null, p_details json default null
)
returns public.withdrawal_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.withdrawal_requests;
  v_country text;
  v_dest text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Set country to NULL (not stored in profiles table)
  v_country := NULL;
  v_dest := coalesce(p_method, 'wallet');

  insert into public.withdrawal_requests
    (user_id, amount, method, payment_details, country, destination, status, created_at, updated_at)
  values
    (v_uid, p_amount, p_method, coalesce(p_details, '{}'::json), v_country, v_dest, 'pending', now(), now())
  returning * into v_row;

  update public.user_wallets
     set total_withdrawn = coalesce(total_withdrawn,0) + p_amount, updated_at = now()
   where user_id = v_uid;

  return v_row;
exception when others then
  raise;
end;
$$;
grant execute on function public.request_withdrawal(numeric, text, json) to authenticated;

-- admin_mark_withdrawal_processed(p_request_id, p_note) -> Json
drop function if exists public.admin_mark_withdrawal_processed(uuid, text);
create function public.admin_mark_withdrawal_processed(
  p_request_id uuid, p_note text default null
)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.withdrawal_requests
     set status = 'processed', processed_at = now(), admin_note = p_note, updated_at = now()
   where id = p_request_id;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'process_withdrawal', 'withdrawal', p_request_id::text, json_build_object('note', p_note));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_mark_withdrawal_processed(uuid, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 5. VIDEO MODERATION & BOOST
-- -------------------------------------------------------------------------------------

-- admin_moderate_video(p_video, p_action, p_reason) -> Json
--   p_action in ('approve','remove','shadowban','unshadowban','flag','unflag','pending')
drop function if exists public.admin_moderate_video(uuid, text, text);
create function public.admin_moderate_video(
  p_video uuid, p_action text, p_reason text
)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.videos set
    is_removed       = case when p_action = 'remove'      then true else is_removed end,
    is_shadow_banned = case when p_action = 'shadowban'   then true
                             when p_action = 'unshadowban' then false else is_shadow_banned end,
    is_pending_review= case when p_action = 'approve'     then false
                             when p_action = 'pending'     then true  else is_pending_review end,
    moderation_reason= case when p_action in ('remove','shadowban','flag') then p_reason
                             when p_action in ('approve','unshadowban','unflag') then null
                             else moderation_reason end,
    auto_suppressed  = case when p_action = 'flag'        then true
                             when p_action = 'unflag'      then false else auto_suppressed end
   where id = p_video;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'moderate_video', 'video', p_video::text,
    json_build_object('action', p_action, 'reason', p_reason));
  return json_build_object('success', true, 'action', p_action);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_moderate_video(uuid, text, text) to authenticated;

-- admin_set_video_boost(p_video, p_boost_score) -> Json  (canonical overload used by UI)
drop function if exists public.admin_set_video_boost(uuid, numeric);
create function public.admin_set_video_boost(p_video uuid, p_boost_score numeric)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.videos set boost_score = p_boost_score where id = p_video;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'set_boost', 'video', p_video::text, json_build_object('boost_score', p_boost_score));
  return json_build_object('success', true, 'boost_score', p_boost_score);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_set_video_boost(uuid, numeric) to authenticated;

-- delete_video_with_storage(p_video_id) -> Json  (soft-remove + log)
drop function if exists public.delete_video_with_storage(uuid);
create function public.delete_video_with_storage(p_video_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() and auth.uid() is not null then
    -- also allow the owner of the video to delete their own
    if not exists (select 1 from public.videos where id = p_video_id and owner_id = auth.uid()) then
      return json_build_object('success', false, 'reason', 'not authorized');
    end if;
  end if;
  update public.videos set is_removed = true, moderation_reason = 'deleted'
   where id = p_video_id;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'delete_video', 'video', p_video_id::text, json_build_object('video', p_video_id::text));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.delete_video_with_storage(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- 6. APPEALS
-- -------------------------------------------------------------------------------------

-- admin_resolve_appeal(p_appeal_id, p_decision, p_note) -> Json
--   p_decision in ('approved','rejected','pending')
drop function if exists public.admin_resolve_appeal(uuid, text, text);
create function public.admin_resolve_appeal(
  p_appeal_id uuid, p_decision text, p_note text default null
)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  update public.appeals
     set status = p_decision, admin_response = p_decision,
         admin_note = p_note, reviewed_at = now(), updated_at = now()
   where id = p_appeal_id;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'resolve_appeal', 'appeal', p_appeal_id::text,
    json_build_object('decision', p_decision, 'note', p_note));
  return json_build_object('success', true, 'decision', p_decision);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_resolve_appeal(uuid, text, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 7. IP RULES (optional RPCs — the UI also writes the table directly)
-- -------------------------------------------------------------------------------------

-- admin_set_ip_rule(p_ip, p_mode, p_reason, p_expires) -> ip_rules row
drop function if exists public.admin_set_ip_rule(text, text, text, timestamptz);
create function public.admin_set_ip_rule(
  p_ip text, p_mode text, p_reason text default null, p_expires timestamptz default null
)
returns public.ip_rules
language plpgsql security definer set search_path = public as $$
declare
  v_row public.ip_rules;
begin
  if not public._caller_is_admin() then
    raise exception 'admin only';
  end if;
  insert into public.ip_rules (ip_address, mode, reason, expires_at, created_by, created_at, updated_at)
  values (p_ip, p_mode, p_reason, p_expires, auth.uid(), now(), now())
  on conflict do nothing
  returning * into v_row;
  if v_row is null then
    update public.ip_rules
       set mode = p_mode, reason = p_reason, expires_at = p_expires, updated_at = now()
     where ip_address = p_ip
     returning * into v_row;
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'set_ip_rule', 'ip', p_ip,
    json_build_object('mode', p_mode, 'reason', p_reason, 'expires', p_expires));
  return v_row;
exception when others then
  raise;
end;
$$;
grant execute on function public.admin_set_ip_rule(text, text, text, timestamptz) to authenticated;

-- admin_delete_ip_rule(p_ip) -> Json
drop function if exists public.admin_delete_ip_rule(text);
create function public.admin_delete_ip_rule(p_ip text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  delete from public.ip_rules where ip_address = p_ip;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'delete_ip_rule', 'ip', p_ip, json_build_object('ip', p_ip));
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.admin_delete_ip_rule(text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 8. ALGORITHM WEIGHTS
-- -------------------------------------------------------------------------------------

-- update_algorithm_weights(p_weights, p_note) -> Json
drop function if exists public.update_algorithm_weights(json, text);
create function public.update_algorithm_weights(p_weights json, p_note text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_prev json;
begin
  if not public._caller_is_admin() then
    return json_build_object('success', false, 'reason', 'admin only');
  end if;
  select next into v_prev from public.algorithm_audit_log order by created_at desc limit 1;
  insert into public.algorithm_audit_log (previous, next, note, actor, created_at)
  values (coalesce(v_prev, '{}'::json), p_weights, p_note, auth.uid(), now());
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (auth.uid(), 'update_algorithm_weights', 'algorithm', 'weights', json_build_object('note', p_note));
  return json_build_object('success', true, 'weights', p_weights);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.update_algorithm_weights(json, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 9. ADS
-- -------------------------------------------------------------------------------------

-- pick_ad_for_video(p_video) -> Json
drop function if exists public.pick_ad_for_video(uuid);
create function public.pick_ad_for_video(p_video uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_ad_url text;
begin
  select ad_url into v_ad_url
    from public.video_ads
   where video_id = p_video and status = 'active'
   order by created_at desc limit 1;
  if v_ad_url is null then
    return json_build_object('filled', false);
  end if;
  return json_build_object('filled', true, 'ad_url', v_ad_url, 'video_id', p_video);
end;
$$;
grant execute on function public.pick_ad_for_video(uuid) to authenticated;

-- record_ad_view(p_video_id, p_ad_network, p_ad_revenue, p_cpm, p_country_code, p_country_name, p_country_tier) -> Json
--   Credits the video owner's wallet for one served ad impression with geolocation tracking.
drop function if exists public.record_ad_view(uuid, text, numeric, numeric, text, text, text);
create function public.record_ad_view(
  p_video_id uuid, p_ad_network text default null,
  p_ad_revenue numeric default 0, p_cpm numeric default 0,
  p_country_code text default null, p_country_name text default null, p_country_tier text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_gross_revenue numeric := coalesce(p_ad_revenue, 0);
  v_creator_share numeric;
  v_platform_share numeric;
begin
  select owner_id into v_owner from public.videos where id = p_video_id;
  if v_owner is null then
    return json_build_object('success', false, 'reason', 'video not found');
  end if;

  -- Validate revenue (fraud safeguard)
  if v_gross_revenue < 0 then
    return json_build_object('success', false, 'reason', 'invalid negative revenue');
  end if;
  if v_gross_revenue > 1000 then
    insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
    values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'high_revenue_alert', 'video', p_video_id::text,
      json_build_object('revenue', v_gross_revenue, 'network', p_ad_network, 'alert', 'revenue exceeds $1000 per impression'));
  end if;

  -- ENFORCE 55/45 SPLIT
  v_creator_share := round(v_gross_revenue * 0.55, 6);
  v_platform_share := round(v_gross_revenue * 0.45, 6);

  insert into public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
  values (v_owner, v_creator_share, v_creator_share, now(), now())
  on conflict (user_id) do update
    set balance = public.user_wallets.balance + v_creator_share,
        total_earned = public.user_wallets.total_earned + v_creator_share,
        updated_at = now();

  -- Log revenue with CREATOR share and country information
  insert into public.revenue_logs (user_id, video_id, views_count, amount_earned, ad_network, cpm, gross_revenue, country_code, country_name, country_tier, base_cpm, country_multiplier, created_at)
  values (v_owner, p_video_id::text, 1, v_creator_share, p_ad_network, p_cpm, v_gross_revenue, p_country_code, p_country_name, p_country_tier,
    -- Calculate base CPM from effective CPM by removing country multiplier if available
    CASE
      WHEN p_country_multiplier IS NOT NULL AND p_country_multiplier > 0 THEN p_cpm / p_country_multiplier
      ELSE p_cpm
    END,
    COALESCE(p_country_multiplier, 1.0),
    now());

  -- Persist PLATFORM share to platform_revenue table
  insert into public.platform_revenue (source_user_id, video_id, amount, gross_revenue, ad_network, cpm, created_at)
  values (v_owner, p_video_id::text, v_platform_share, v_gross_revenue, p_ad_network, p_cpm, now());

  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'ad_view', 'video', p_video_id::text,
    json_build_object(
      'network', p_ad_network,
      'revenue', v_gross_revenue,
      'cpm', p_cpm,
      'owner', v_owner::text,
      'country_code', p_country_code,
      'country_name', p_country_name,
      'country_tier', p_country_tier
    ));

  return json_build_object(
    'success', true,
    'gross_revenue', v_gross_revenue,
    'creator_share', v_creator_share,
    'platform_share', v_platform_share,
    'owner', v_owner::text,
    'country_code', p_country_code,
    'country_name', p_country_name,
    'country_tier', p_country_tier
  );
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_ad_view(uuid, text, numeric, numeric, text, text, text) to authenticated;

-- settle_ad_impression(p_ad_id, p_completed, p_creator_id, p_video_id) -> setof {creator_share, reason, settled}
drop function if exists public.settle_ad_impression(uuid, boolean, uuid, uuid);
create function public.settle_ad_impression(
  p_ad_id uuid, p_completed boolean, p_creator_id uuid, p_video_id uuid
)
returns table (creator_share numeric, reason text, settled boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_share numeric := 0;
  v_reason text;
begin
  if p_completed then
    v_share := 0;
    v_reason := 'settled';
    -- credit creator wallet (revenue recorded separately via record_ad_view)
    insert into public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
    values (p_creator_id, 0, 0, now(), now())
    on conflict (user_id) do nothing;
  else
    v_share := 0;
    v_reason := 'incomplete';
  end if;
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'settle_ad_impression', 'ad', p_ad_id::text,
    json_build_object('completed', p_completed, 'creator', p_creator_id::text, 'video', p_video_id::text));
  return query select v_share, v_reason, p_completed;
exception when others then
  return query select 0::numeric, sqlerrm, false;
end;
$$;
grant execute on function public.settle_ad_impression(uuid, boolean, uuid, uuid) to authenticated;

-- bump_ad_slot_impression(p_slot) -> void
drop function if exists public.bump_ad_slot_impression(text);
create function public.bump_ad_slot_impression(p_slot text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ad_settings
     set impressions_count = coalesce(impressions_count, 0) + 1, updated_at = now()
   where slot = p_slot;
end;
$$;
grant execute on function public.bump_ad_slot_impression(text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 10. A/B TESTING
-- -------------------------------------------------------------------------------------

-- assign_ab_variant(p_test) -> text  (variant name)
drop function if exists public.assign_ab_variant(text);
create function public.assign_ab_variant(p_test text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing text;
  v_variants json;
  v_n integer;
  v_idx integer;
  v_variant text;
  v_exp_id text;
begin
  -- already assigned?
  select a.variant into v_existing
    from public.ab_assignments a
   where a.test_id = p_test and a.user_id = v_uid
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- find an active experiment/test
  select id, variants into v_exp_id, v_variants
    from public.ab_tests
   where lower(name) = lower(p_test) and status = 'active'
   order by created_at desc limit 1;

  if v_variants is null or jsonb_array_length(v_variants::jsonb) = 0 then
    -- no configured test: deterministic default
    v_variant := case when v_uid is null then 'control'
                      when (mod(abs(hashtext(v_uid::text)), 2) = 0) then 'control' else 'variant' end;
    insert into public.ab_assignments (test_id, experiment_id, user_id, variant, created_at)
    values (p_test, null, coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid), v_variant, now())
    on conflict do nothing;
    return v_variant;
  end if;

  v_n := jsonb_array_length(v_variants::jsonb);
  v_idx := case when v_uid is null then 0 else mod(abs(hashtext(v_uid::text)), v_n) end;
  v_variant := v_variants::jsonb ->> v_idx;

  insert into public.ab_assignments (test_id, experiment_id, user_id, variant, created_at)
  values (p_test, v_exp_id, coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid), v_variant, now())
  on conflict do nothing;

  return v_variant;
exception when others then
  return 'control';
end;
$$;
grant execute on function public.assign_ab_variant(text) to authenticated, anon;

-- record_ab_event(p_test, p_variant, p_event, p_value) -> void
drop function if exists public.record_ab_event(text, text, text, numeric);
create function public.record_ab_event(
  p_test text, p_variant text, p_event text, p_value numeric default 0
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ab_events (test_id, experiment_id, user_id, variant, event, value, created_at)
  select p_test, e.id, auth.uid(), p_variant, p_event, coalesce(p_value, 0), now()
    from public.ab_tests e
   where lower(e.name) = lower(p_test)
   order by e.created_at desc limit 1;
  -- If no matching experiment, still record with null experiment_id.
  if not found then
    insert into public.ab_events (test_id, experiment_id, user_id, variant, event, value, created_at)
    values (p_test, null, auth.uid(), p_variant, p_event, coalesce(p_value, 0), now());
  end if;
exception when others then
  null;
end;
$$;
grant execute on function public.record_ab_event(text, text, text, numeric) to authenticated, anon;

-- -------------------------------------------------------------------------------------
-- 11. COPYRIGHT CLAIMS & EVENT LOGGING
-- -------------------------------------------------------------------------------------

-- create_copyright_claim(...) -> text (claim id)
drop function if exists public.create_copyright_claim(uuid, uuid, text, text, numeric, text, text, text);
create function public.create_copyright_claim(
  p_video_id uuid, p_claimant_id uuid, p_claim_type text,
  p_severity text default 'warning', p_match_percentage numeric default null,
  p_matched_content_id text default null, p_matched_content_title text default null,
  p_matched_content_owner text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.copyright_claims
    (id, video_id, claimant_id, claim_type, severity, status,
     match_percentage, matched_content_id, matched_content_title, matched_content_owner,
     detected_at, created_at, updated_at, notes)
  values
    (v_id, p_video_id, p_claimant_id, p_claim_type, coalesce(p_severity,'warning'), 'active',
     p_match_percentage, p_matched_content_id, p_matched_content_title, p_matched_content_owner,
     now(), now(), now(), null);

  insert into public.copyright_claim_events (claim_id, action, actor_type, actor_id, payload, created_at)
  values (v_id, 'created', 'system', null,
    json_build_object('claim_type', p_claim_type, 'severity', p_severity), now());

  return v_id::text;
exception when others then
  return null;
end;
$$;
grant execute on function public.create_copyright_claim(uuid, uuid, text, text, numeric, text, text, text) to authenticated;

-- create_copyright_claim_from_duplicate(...) -> text
drop function if exists public.create_copyright_claim_from_duplicate(uuid, uuid, uuid, text, numeric);
create function public.create_copyright_claim_from_duplicate(
  p_video_id uuid, p_existing_video_id uuid, p_existing_owner_id uuid,
  p_match_type text, p_confidence numeric
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.copyright_claims
    (video_id, claimant_id, claim_type, severity, status,
     match_percentage, matched_content_id, matched_content_owner, detected_at, created_at, updated_at)
  values
    (p_video_id, p_existing_owner_id, p_match_type, 'warning', 'active',
     p_confidence, p_existing_video_id::text, p_existing_owner_id::text, now(), now(), now())
  returning id into v_id;

  insert into public.copyright_claim_events (claim_id, action, actor_type, actor_id, payload, created_at)
  values (v_id, 'created_from_duplicate', 'system', null,
    json_build_object('match_type', p_match_type, 'confidence', p_confidence,
      'existing_video', p_existing_video_id::text), now());

  return v_id::text;
exception when others then
  return null;
end;
$$;
grant execute on function public.create_copyright_claim_from_duplicate(uuid, uuid, uuid, text, numeric) to authenticated;

-- dispute_copyright_claim(p_claim_id, p_dispute_reason, p_dispute_evidence) -> Json
drop function if exists public.dispute_copyright_claim(uuid, text, text[]);
create function public.dispute_copyright_claim(
  p_claim_id uuid, p_dispute_reason text default null, p_dispute_evidence text[] default null
)
returns json
language plpgsql security definer set search_path = public as $$
begin
  update public.copyright_claims
     set status = 'disputed', dispute_reason = p_dispute_reason,
         dispute_evidence = p_dispute_evidence, updated_at = now()
   where id = p_claim_id;
  insert into public.copyright_claim_events (claim_id, action, actor_type, actor_id, payload, created_at)
  values (p_claim_id, 'disputed', 'user', auth.uid(),
    json_build_object('reason', p_dispute_reason), now());
  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.dispute_copyright_claim(uuid, text, text[]) to authenticated;

-- release_copyright_claim(p_claim_id) -> boolean
drop function if exists public.release_copyright_claim(uuid);
create function public.release_copyright_claim(p_claim_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean := false;
begin
  update public.copyright_claims
     set status = 'released', resolved_at = now(), updated_at = now()
   where id = p_claim_id
   returning true into v_ok;
  if v_ok then
    insert into public.copyright_claim_events (claim_id, action, actor_type, actor_id, payload, created_at)
    values (p_claim_id, 'released', 'admin', auth.uid(), '{}'::json, now());
  end if;
  return coalesce(v_ok, false);
exception when others then
  return false;
end;
$$;
grant execute on function public.release_copyright_claim(uuid) to authenticated;

-- log_ai_evaluation_event(...) -> text (event id)
drop function if exists public.log_ai_evaluation_event(uuid, numeric, text, text, text, json);
create function public.log_ai_evaluation_event(
  p_claim_id uuid, p_merit_score numeric, p_merit_level text,
  p_recommendation text, p_reasoning text, p_fair_use_factors json
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.copyright_claim_events
    (id, claim_id, action, actor_type, actor_id, payload, created_at)
  values
    (v_id, p_claim_id, 'ai_evaluation', 'system', null,
     json_build_object('merit_score', p_merit_score, 'merit_level', p_merit_level,
       'recommendation', p_recommendation, 'reasoning', p_reasoning,
       'fair_use_factors', p_fair_use_factors), now());
  return v_id::text;
exception when others then
  return null;
end;
$$;
grant execute on function public.log_ai_evaluation_event(uuid, numeric, text, text, text, json) to authenticated;

-- log_policy_change_event(...) -> text
drop function if exists public.log_policy_change_event(uuid, uuid, text, text, text);
create function public.log_policy_change_event(
  p_claim_id uuid, p_actor_id uuid, p_old_policy text, p_new_policy text, p_note text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.copyright_claim_events
    (id, claim_id, action, actor_type, actor_id, payload, created_at)
  values
    (v_id, p_claim_id, 'policy_change', 'admin', p_actor_id,
     json_build_object('old_policy', p_old_policy, 'new_policy', p_new_policy, 'note', p_note), now());
  return v_id::text;
exception when others then
  return null;
end;
$$;
grant execute on function public.log_policy_change_event(uuid, uuid, text, text, text) to authenticated;

-- log_status_change_event(...) -> text
drop function if exists public.log_status_change_event(uuid, uuid, text, text, text);
create function public.log_status_change_event(
  p_claim_id uuid, p_actor_id uuid, p_old_status text, p_new_status text, p_note text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.copyright_claim_events
    (id, claim_id, action, actor_type, actor_id, payload, created_at)
  values
    (v_id, p_claim_id, 'status_change', 'admin', p_actor_id,
     json_build_object('old_status', p_old_status, 'new_status', p_new_status, 'note', p_note), now());
  return v_id::text;
exception when others then
  return null;
end;
$$;
grant execute on function public.log_status_change_event(uuid, uuid, text, text, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 12. GENERIC AUDIT LOG
-- -------------------------------------------------------------------------------------

-- log_audit_event(p_action, p_entity_type, p_entity_id, p_severity, p_metadata, p_ip_address, p_user_agent) -> text
drop function if exists public.log_audit_event(text, text, text, text, json, text, text);
create function public.log_audit_event(
  p_action text, p_entity_type text default null, p_entity_id text default null,
  p_severity text default 'info', p_metadata json default null,
  p_ip_address text default null, p_user_agent text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_uid uuid := auth.uid();
  v_email text;
begin
  select email into v_email from public.profiles where id = v_uid;
  insert into public.audit_logs
    (id, action, entity_type, entity_id, severity, metadata,
     user_id, actor_email, ip_address, user_agent, created_at)
  values
    (v_id, p_action, p_entity_type, p_entity_id, coalesce(p_severity,'info'), coalesce(p_metadata,'{}'::json),
     v_uid, v_email, p_ip_address, p_user_agent, now());
  return v_id::text;
exception when others then
  return null;
end;
$$;
grant execute on function public.log_audit_event(text, text, text, text, json, text, text) to authenticated;

-- =====================================================================================
-- END of functions_admin.sql
-- =====================================================================================
