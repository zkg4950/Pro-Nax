-- ProNax admin console fixes. Run in Supabase SQL editor. Safe to re-run.

create or replace function public.admin_team_list()
returns table (user_id uuid, email text, display_name text, avatar_url text, is_super boolean, granted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select ur.user_id, p.email, p.display_name, p.avatar_url,
         (ur.role::text = 'admin') as is_super,
         coalesce(ur.created_at, now()) as granted_at
  from public.user_roles ur
  left join public.profiles p on p.id = ur.user_id
  where ur.role::text in ('admin','moderator','support')
    and public.has_role(auth.uid(), 'admin'::app_role)
  order by ur.created_at desc nulls last
$$;
grant execute on function public.admin_team_list() to authenticated;

create or replace function public.is_ip_blocked(_ip text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
      select 1 from public.ip_rules r
      where r.mode = 'allow' and (r.expires_at is null or r.expires_at > now())
        and (_ip = r.ip_address or _ip::inet <<= r.ip_address::inet))
    and exists (
      select 1 from public.ip_rules r
      where r.mode = 'block' and (r.expires_at is null or r.expires_at > now())
        and (_ip = r.ip_address or _ip::inet <<= r.ip_address::inet))
$$;
grant execute on function public.is_ip_blocked(text) to anon, authenticated;

grant select on public.ip_rules to anon, authenticated;
grant insert on public.rate_limit_events to anon, authenticated;
grant all on public.ip_rules to service_role;
grant all on public.rate_limit_events to service_role;

alter table public.ip_rules enable row level security;
alter table public.rate_limit_events enable row level security;

drop policy if exists "ip rules readable" on public.ip_rules;
create policy "ip rules readable" on public.ip_rules for select using (true);

drop policy if exists "admins manage ip rules" on public.ip_rules;
create policy "admins manage ip rules" on public.ip_rules for all to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role))
  with check (public.has_role(auth.uid(),'admin'::app_role));

drop policy if exists "anyone logs rate limit events" on public.rate_limit_events;
create policy "anyone logs rate limit events" on public.rate_limit_events for insert with check (true);

drop policy if exists "staff read rate limit events" on public.rate_limit_events;
create policy "staff read rate limit events" on public.rate_limit_events for select to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role) or public.has_role(auth.uid(),'moderator'::app_role));
