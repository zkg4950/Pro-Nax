-- ProNax — Direct Messaging, Presence, Privacy & Settings backend
-- Run this whole file once in the Supabase SQL editor.
-- Idempotent: safe to re-run.

-- =========================================================
-- 1. TABLES
-- =========================================================

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text
);

create table if not exists public.chat_participants (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default 'epoch',
  muted boolean not null default false,
  primary key (room_id, user_id)
);
create index if not exists chat_participants_user_idx on public.chat_participants(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  video_id uuid references public.videos(id) on delete set null,
  attachment jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_room_idx on public.chat_messages(room_id, created_at desc);

create table if not exists public.chat_typing (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.user_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dm_permission text not null default 'everyone' check (dm_permission in ('everyone','mutuals','none')),
  is_private boolean not null default false,
  hide_liked_videos boolean not null default false,
  hide_watch_history boolean not null default false,
  two_factor_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 2. GRANTS
-- =========================================================
grant select, insert, update, delete on public.chat_rooms to authenticated;
grant select, insert, update, delete on public.chat_participants to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.chat_typing to authenticated;
grant select, insert, update on public.user_presence to authenticated;
grant select on public.user_presence to anon;
grant select, insert, update on public.user_privacy to authenticated;
grant all on public.chat_rooms, public.chat_participants, public.chat_messages,
  public.chat_typing, public.user_presence, public.user_privacy to service_role;

-- =========================================================
-- 3. RLS
-- =========================================================
alter table public.chat_rooms enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_typing enable row level security;
alter table public.user_presence enable row level security;
alter table public.user_privacy enable row level security;

create or replace function public.is_chat_member(_room uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_participants p where p.room_id = _room and p.user_id = _user);
$$;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

drop policy if exists "rooms member read" on public.chat_rooms;
create policy "rooms member read" on public.chat_rooms for select to authenticated
  using (public.is_chat_member(id, auth.uid()));

drop policy if exists "participants read" on public.chat_participants;
create policy "participants read" on public.chat_participants for select to authenticated
  using (public.is_chat_member(room_id, auth.uid()));
drop policy if exists "participants self update" on public.chat_participants;
create policy "participants self update" on public.chat_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "messages member read" on public.chat_messages;
create policy "messages member read" on public.chat_messages for select to authenticated
  using (public.is_chat_member(room_id, auth.uid()));
drop policy if exists "messages member insert" on public.chat_messages;
create policy "messages member insert" on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(room_id, auth.uid()));
drop policy if exists "messages sender update" on public.chat_messages;
create policy "messages sender update" on public.chat_messages for update to authenticated
  using (public.is_chat_member(room_id, auth.uid()));

drop policy if exists "typing member read" on public.chat_typing;
create policy "typing member read" on public.chat_typing for select to authenticated
  using (public.is_chat_member(room_id, auth.uid()));
drop policy if exists "typing self write" on public.chat_typing;
create policy "typing self write" on public.chat_typing for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_chat_member(room_id, auth.uid()));

drop policy if exists "presence public read" on public.user_presence;
create policy "presence public read" on public.user_presence for select using (true);
drop policy if exists "presence self write" on public.user_presence;
create policy "presence self write" on public.user_presence for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "privacy self" on public.user_privacy;
create policy "privacy self" on public.user_privacy for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- blocked_users hardening (table already exists)
alter table public.blocked_users enable row level security;
grant select, insert, delete on public.blocked_users to authenticated;
drop policy if exists "blocks self" on public.blocked_users;
create policy "blocks self" on public.blocked_users for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- =========================================================
-- 4. REALTIME
-- =========================================================
do $$ begin
  begin execute 'alter publication supabase_realtime add table public.chat_messages'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.chat_participants'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.chat_typing'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.user_presence'; exception when others then null; end;
end $$;
alter table public.chat_messages replica identity full;
alter table public.chat_typing replica identity full;

-- =========================================================
-- 5. RPCs — messaging
-- =========================================================

create or replace function public.can_dm(_from uuid, _to uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare perm text; mutual boolean;
begin
  if _from = _to then return true; end if;
  if exists (select 1 from public.blocked_users b
             where (b.blocker_id = _to and b.blocked_id = _from)
                or (b.blocker_id = _from and b.blocked_id = _to)) then
    return false;
  end if;
  select coalesce(p.dm_permission, 'everyone') into perm from public.user_privacy p where p.user_id = _to;
  perm := coalesce(perm, 'everyone');
  if perm = 'none' then return false; end if;
  if perm = 'mutuals' then
    select exists (select 1 from public.follows f1 where f1.follower_id = _from and f1.following_id = _to)
       and exists (select 1 from public.follows f2 where f2.follower_id = _to and f2.following_id = _from)
      into mutual;
    return coalesce(mutual, false);
  end if;
  return true;
end $$;
grant execute on function public.can_dm(uuid, uuid) to authenticated;

create or replace function public.get_or_create_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_other is null or p_other = me then raise exception 'Invalid recipient'; end if;
  if not public.can_dm(me, p_other) then raise exception 'This user does not accept messages from you'; end if;

  select r.id into rid
  from public.chat_rooms r
  join public.chat_participants a on a.room_id = r.id and a.user_id = me
  join public.chat_participants b on b.room_id = r.id and b.user_id = p_other
  where r.is_group = false
  limit 1;

  if rid is not null then return rid; end if;

  insert into public.chat_rooms (created_by) values (me) returning id into rid;
  insert into public.chat_participants (room_id, user_id) values (rid, me), (rid, p_other);
  return rid;
end $$;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

create or replace function public.inbox_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.last_message_at desc), '[]'::json) from (
    select r.id as room_id,
           r.last_message_at,
           r.last_message_preview,
           o.user_id as other_id,
           pr.display_name,
           pr.handle,
           pr.avatar_url,
           pr.is_verified,
           coalesce(up.last_seen_at, 'epoch'::timestamptz) as last_seen_at,
           (coalesce(up.last_seen_at, 'epoch'::timestamptz) > now() - interval '2 minutes') as is_online,
           (select count(*) from public.chat_messages m
             where m.room_id = r.id and m.sender_id <> auth.uid()
               and m.created_at > me.last_read_at) as unread_count
    from public.chat_participants me
    join public.chat_rooms r on r.id = me.room_id
    join public.chat_participants o on o.room_id = r.id and o.user_id <> auth.uid()
    left join public.profiles pr on pr.id = o.user_id
    left join public.user_presence up on up.user_id = o.user_id
    where me.user_id = auth.uid()
  ) x;
$$;
grant execute on function public.inbox_list() to authenticated;

create or replace function public.unseen_chats_count()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(count(*), 0)::int from public.chat_participants me
  where me.user_id = auth.uid()
    and exists (select 1 from public.chat_messages m
                where m.room_id = me.room_id and m.sender_id <> auth.uid()
                  and m.created_at > me.last_read_at);
$$;
grant execute on function public.unseen_chats_count() to authenticated;

create or replace function public.mark_chat_read(p_room uuid)
returns void language sql security definer set search_path = public as $$
  with u as (
    update public.chat_participants set last_read_at = now()
    where room_id = p_room and user_id = auth.uid() returning room_id
  )
  update public.chat_messages m set is_read = true
  from u where m.room_id = u.room_id and m.sender_id <> auth.uid() and m.is_read = false;
$$;
grant execute on function public.mark_chat_read(uuid) to authenticated;

create or replace function public.send_chat_message(p_room uuid, p_body text default null, p_video_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; mid uuid; preview text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.is_chat_member(p_room, me) then raise exception 'Not a member of this chat'; end if;
  if coalesce(trim(p_body), '') = '' and p_video_id is null then raise exception 'Empty message'; end if;

  select user_id into other from public.chat_participants where room_id = p_room and user_id <> me limit 1;
  if other is not null and not public.can_dm(me, other) then raise exception 'You can no longer message this user'; end if;

  insert into public.chat_messages (room_id, sender_id, body, video_id)
  values (p_room, me, nullif(trim(coalesce(p_body, '')), ''), p_video_id)
  returning id into mid;

  preview := coalesce(nullif(trim(coalesce(p_body, '')), ''), 'Shared a video');
  update public.chat_rooms set last_message_at = now(), last_message_preview = left(preview, 140) where id = p_room;
  update public.chat_participants set last_read_at = now() where room_id = p_room and user_id = me;
  delete from public.chat_typing where room_id = p_room and user_id = me;

  if other is not null then
    insert into public.notifications (user_id, type, category, payload, action_url)
    values (other, 'direct_message', 'message',
            jsonb_build_object('room_id', p_room, 'from', me, 'preview', left(preview, 140)),
            '/inbox?room=' || p_room::text);
  end if;

  return json_build_object('id', mid, 'room_id', p_room);
end $$;
grant execute on function public.send_chat_message(uuid, text, uuid) to authenticated;

create or replace function public.set_typing(p_room uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.chat_typing (room_id, user_id, updated_at)
  select p_room, auth.uid(), now()
  where public.is_chat_member(p_room, auth.uid())
  on conflict (room_id, user_id) do update set updated_at = now();
$$;
grant execute on function public.set_typing(uuid) to authenticated;

create or replace function public.touch_presence()
returns void language sql security definer set search_path = public as $$
  insert into public.user_presence (user_id, last_seen_at)
  select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = now();
$$;
grant execute on function public.touch_presence() to authenticated;

-- Mutual contacts with online status (inbox top rail)
create or replace function public.active_contacts()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.is_online desc, x.last_seen_at desc), '[]'::json) from (
    select p.id, p.display_name, p.handle, p.avatar_url,
           coalesce(up.last_seen_at, 'epoch'::timestamptz) as last_seen_at,
           (coalesce(up.last_seen_at, 'epoch'::timestamptz) > now() - interval '2 minutes') as is_online
    from public.follows f1
    join public.follows f2 on f2.follower_id = f1.following_id and f2.following_id = auth.uid()
    join public.profiles p on p.id = f1.following_id
    left join public.user_presence up on up.user_id = p.id
    where f1.follower_id = auth.uid()
    limit 40
  ) x;
$$;
grant execute on function public.active_contacts() to authenticated;

-- =========================================================
-- 6. RPCs — privacy, blocks, sessions
-- =========================================================

create or replace function public.get_my_privacy()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(
    (select row_to_json(p) from public.user_privacy p where p.user_id = auth.uid()),
    json_build_object('user_id', auth.uid(), 'dm_permission', 'everyone', 'is_private', false,
                      'hide_liked_videos', false, 'hide_watch_history', false, 'two_factor_enabled', false)
  );
$$;
grant execute on function public.get_my_privacy() to authenticated;

create or replace function public.update_my_privacy(
  p_dm_permission text default null,
  p_is_private boolean default null,
  p_hide_liked_videos boolean default null,
  p_hide_watch_history boolean default null,
  p_two_factor_enabled boolean default null
) returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  insert into public.user_privacy (user_id) values (me) on conflict (user_id) do nothing;
  update public.user_privacy set
    dm_permission = coalesce(p_dm_permission, dm_permission),
    is_private = coalesce(p_is_private, is_private),
    hide_liked_videos = coalesce(p_hide_liked_videos, hide_liked_videos),
    hide_watch_history = coalesce(p_hide_watch_history, hide_watch_history),
    two_factor_enabled = coalesce(p_two_factor_enabled, two_factor_enabled),
    updated_at = now()
  where user_id = me;
  return public.get_my_privacy();
end $$;
grant execute on function public.update_my_privacy(text, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.block_user(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me then raise exception 'Invalid request'; end if;
  insert into public.blocked_users (blocker_id, blocked_id) values (me, p_user)
  on conflict do nothing;
  delete from public.follows where (follower_id = p_user and following_id = me) or (follower_id = me and following_id = p_user);
  return json_build_object('ok', true);
end $$;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user uuid)
returns json language sql security definer set search_path = public as $$
  delete from public.blocked_users where blocker_id = auth.uid() and blocked_id = p_user;
  select json_build_object('ok', true);
$$;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.list_blocked_users()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', p.id, 'display_name', p.display_name, 'handle', p.handle, 'avatar_url', p.avatar_url,
    'blocked_at', b.created_at)), '[]'::json)
  from public.blocked_users b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
$$;
grant execute on function public.list_blocked_users() to authenticated;

create or replace function public.list_my_sessions()
returns json language sql stable security definer set search_path = public, auth as $$
  select coalesce(json_agg(json_build_object(
    'id', s.id, 'created_at', s.created_at, 'updated_at', s.updated_at,
    'user_agent', s.user_agent, 'ip', host(s.ip))), '[]'::json)
  from auth.sessions s where s.user_id = auth.uid();
$$;
grant execute on function public.list_my_sessions() to authenticated;

create or replace function public.revoke_session(p_id uuid)
returns json language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where id = p_id and user_id = auth.uid();
  select json_build_object('ok', true);
$$;
grant execute on function public.revoke_session(uuid) to authenticated;

-- =========================================================
-- 7. My IP protection status (read-only for the signed-in user)
-- =========================================================
create or replace function public.my_ip_protection_status()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'active_rules', (select count(*) from public.ip_rules where expires_at is null or expires_at > now()),
    'recent_events', (select count(*) from public.rate_limit_events e
                      where e.created_at > now() - interval '24 hours'),
    'account_flagged', (select coalesce(is_bot_flagged, false) from public.profiles where id = auth.uid()),
    'account_banned', (select coalesce(is_banned, false) from public.profiles where id = auth.uid())
  );
$$;
grant execute on function public.my_ip_protection_status() to authenticated;
