-- =====================================================================================
-- db/functions_user.sql
-- RPC functions required by the frontend but missing from the external Supabase DB.
-- Idempotent: every function is created with `create or replace` (or dropped first when
-- the return type may have changed). Safe to re-run.
-- =====================================================================================

-- =====================================================================================
-- 1. WATCH HISTORY / VIEWS / RETENTION
-- =====================================================================================

-- record_watch_history(p_video, p_watch_seconds) -> Json
create or replace function public.record_watch_history(
  p_video uuid,
  p_watch_seconds integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return json_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  insert into public.watch_history (user_id, video_id, watch_seconds, watched_at, last_watched_at, updated_at)
  values (v_uid, p_video, coalesce(p_watch_seconds, 0), now(), now(), now())
  on conflict (user_id, video_id) do update
    set watch_seconds = public.watch_history.watch_seconds + coalesce(excluded.watch_seconds, 0),
        last_watched_at = now(),
        updated_at = now();

  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_watch_history(uuid, integer) to authenticated;

-- record_view(p_video, p_watch_seconds, p_ip_hash) -> Json
create or replace function public.record_view(
  p_video uuid,
  p_watch_seconds integer default 0,
  p_ip_hash text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dup integer;
  v_total integer;
begin
  -- Check for duplicate views in last 30 minutes
  select count(*) into v_dup from public.video_views
  where video_id = p_video
    and created_at > now() - interval '30 minutes'
    and ((v_uid is not null and viewer_id = v_uid)
         or (v_uid is null and ip_address is not null and ip_address = p_ip_hash));

  if v_dup = 0 then
    insert into public.video_views (video_id, viewer_id, watch_seconds, ip_address, created_at)
    values (p_video, v_uid, coalesce(p_watch_seconds, 0), p_ip_hash, now());
    
    -- Update the video's view count
    update public.videos
       set views_count = coalesce(views_count, 0) + 1
     where id = p_video;
  end if;

  select count(*) into v_total from public.video_views where video_id = p_video;

  return json_build_object('counted', v_dup = 0, 'views', v_total);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_view(uuid, integer, text) to authenticated, anon;

-- Enable RLS for video_views if not already enabled
do $$
begin
  if not exists (
    select 1 from pg_tables 
    where schemaname = 'public' and tablename = 'video_views'
    and relrowsecurity = true
  ) then
    alter table public.video_views enable row level security;
  end if;
end $$;

-- Allow authenticated users to insert their own views
drop policy if exists "users_insert_own_views" on public.video_views;
create policy "users_insert_own_views" on public.video_views
  for insert to authenticated
  with check (viewer_id = auth.uid() or viewer_id is null);

-- Allow anonymous users to insert views (for view counting)
drop policy if exists "anon_insert_views" on public.video_views;
create policy "anon_insert_views" on public.video_views
  for insert to anon
  with check (true);

-- Allow read access for analytics
drop policy if exists "views_read_for_analytics" on public.video_views;
create policy "views_read_for_analytics" on public.video_views
  for select to authenticated, anon
  using (true);

-- record_heartbeat(p_video, p_seconds) -> Json
create or replace function public.record_heartbeat(
  p_video uuid,
  p_seconds integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    insert into public.watch_history (user_id, video_id, watch_seconds, watched_at, last_watched_at, updated_at)
    values (v_uid, p_video, coalesce(p_seconds, 0), now(), now(), now())
    on conflict (user_id, video_id) do update
      set watch_seconds = public.watch_history.watch_seconds + coalesce(excluded.watch_seconds, 0),
          last_watched_at = now(),
          updated_at = now();
  end if;

  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_heartbeat(uuid, integer) to authenticated;

-- record_watch_progress(p_video, p_seconds) -> Json
create or replace function public.record_watch_progress(
  p_video uuid,
  p_seconds integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    insert into public.watch_history (user_id, video_id, watch_seconds, watched_at, last_watched_at, updated_at)
    values (v_uid, p_video, coalesce(p_seconds, 0), now(), now(), now())
    on conflict (user_id, video_id) do update
      set watch_seconds = greatest(public.watch_history.watch_seconds, coalesce(excluded.watch_seconds, 0)),
          last_watched_at = now(),
          updated_at = now();
  end if;

  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_watch_progress(uuid, integer) to authenticated;

-- get_video_retention(p_video) -> Json (simple watch-seconds histogram)
create or replace function public.get_video_retention(
  p_video uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration numeric;
  v_result json;
begin
  select duration_seconds into v_duration from public.videos where id = p_video;

  if v_duration is null or v_duration <= 0 then
    select json_agg(json_build_object('bucket', b, 'retention', 0))
      into v_result
      from generate_series(0, 9) as b;
    return coalesce(v_result, '[]'::json);
  end if;

  select json_agg(row_to_json(t) order by t.bucket) into v_result
  from (
    select b as bucket,
           coalesce(round(
             (count(*) filter (
               where vv.watch_seconds >= (v_duration * b / 10.0)
             )::numeric / nullif(count(*), 0)) * 100, 1
           ), 0) as retention
    from generate_series(0, 9) as b
    left join public.video_views vv on vv.video_id = p_video
    group by b
  ) t;

  return coalesce(v_result, '[]'::json);
end;
$$;
grant execute on function public.get_video_retention(uuid) to authenticated;

-- =====================================================================================
-- 2. SEARCH / RELATED VIDEOS
-- =====================================================================================

-- search_videos_suggest(p_q, p_limit) -> {id, thumb_url, title}[]
create or replace function public.search_videos_suggest(
  p_q text,
  p_limit integer default 12
)
returns table (
  id uuid,
  thumb_url text,
  title text
)
language sql
security definer
set search_path = public
stable
as $$
  select v.id, v.thumb_url, v.title
  from public.videos v
  where v.status = 'ready'
    and v.visibility = 'public'
    and v.is_removed = false
    and v.title ilike '%' || p_q || '%'
  order by v.views_count desc nulls last
  limit coalesce(p_limit, 12);
$$;
grant execute on function public.search_videos_suggest(text, integer) to authenticated, anon;

-- get_related_videos(p_video, p_limit) -> full video rows
create or replace function public.get_related_videos(
  p_video uuid,
  p_limit integer default 12
)
returns setof public.videos
language sql
security definer
set search_path = public
stable
as $$
  select v.*
  from public.videos v
  where v.id <> p_video
    and v.status = 'ready'
    and v.visibility = 'public'
    and v.is_removed = false
    and (
      v.category = (select category from public.videos where id = p_video)
      or true
    )
  order by
    case when v.category = (select category from public.videos where id = p_video) then 0 else 1 end,
    v.views_count desc nulls last
  limit coalesce(p_limit, 12);
$$;
grant execute on function public.get_related_videos(uuid, integer) to authenticated, anon;

-- =====================================================================================
-- 3. COPYRIGHT / FINGERPRINT DEDUPE
-- =====================================================================================

-- check_and_handle_duplicate_fingerprint(p_fingerprint, p_owner_id, p_video_id, p_video_title)
drop function if exists public.check_and_handle_duplicate_fingerprint(text, uuid, uuid, text);
create or replace function public.check_and_handle_duplicate_fingerprint(
  p_fingerprint text,
  p_owner_id uuid,
  p_video_id uuid,
  p_video_title text
)
returns table (
  claim_id uuid,
  is_duplicate boolean,
  message text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_new_claim_id uuid;
begin
  select cc.id, cc.status
    into v_existing
    from public.copyright_claims cc
   where cc.matched_content_id = p_fingerprint
     and cc.video_id <> p_video_id
     and cc.status not in ('resolved', 'dismissed')
   order by cc.created_at desc
   limit 1;

  if v_existing.id is not null then
    insert into public.copyright_claims (
      claimant_id, claim_type, video_id, matched_content_id, matched_content_title,
      matched_content_owner, status, severity, detected_at
    ) values (
      p_owner_id, 'fingerprint_match', p_video_id, p_fingerprint, p_video_title,
      p_owner_id::text, 'pending', 'medium', now()
    )
    returning id into v_new_claim_id;

    return query select v_new_claim_id, true,
      'Duplicate fingerprint detected; a copyright claim was created.'::text, 'pending'::text;
  else
    return query select null::uuid, false, 'No duplicate fingerprint found.'::text, 'clear'::text;
  end if;
end;
$$;
grant execute on function public.check_and_handle_duplicate_fingerprint(text, uuid, uuid, text) to authenticated;

-- =====================================================================================
-- 4. LIKES / SAVES / FOLLOWS / COMMENTS
-- =====================================================================================

-- toggle_like(p_video, p_creator) -> Json
create or replace function public.toggle_like(
  p_video uuid,
  p_creator uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_liked boolean;
begin
  if v_uid is null then
    return json_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if exists (select 1 from public.video_likes where user_id = v_uid and video_id = p_video) then
    delete from public.video_likes where user_id = v_uid and video_id = p_video;
    update public.videos set likes_count = greatest(coalesce(likes_count, 0) - 1, 0), likes = greatest(coalesce(likes, 0) - 1, 0) where id = p_video;
    v_liked := false;
  else
    insert into public.video_likes (user_id, video_id) values (v_uid, p_video);
    update public.videos set likes_count = coalesce(likes_count, 0) + 1, likes = coalesce(likes, 0) + 1 where id = p_video;
    v_liked := true;
  end if;

  return json_build_object('success', true, 'liked', v_liked);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.toggle_like(uuid, uuid) to authenticated;

-- toggle_save(p_video) -> Json
create or replace function public.toggle_save(
  p_video uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saved boolean;
begin
  if v_uid is null then
    return json_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if exists (select 1 from public.video_saves where user_id = v_uid and video_id = p_video) then
    delete from public.video_saves where user_id = v_uid and video_id = p_video;
    v_saved := false;
  else
    insert into public.video_saves (user_id, video_id) values (v_uid, p_video);
    v_saved := true;
  end if;

  return json_build_object('success', true, 'saved', v_saved);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.toggle_save(uuid) to authenticated;

-- toggle_follow(p_target) -> Json
create or replace function public.toggle_follow(
  p_target uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_following boolean;
begin
  if v_uid is null then
    return json_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if v_uid = p_target then
    return json_build_object('success', false, 'reason', 'cannot_follow_self');
  end if;

  if exists (select 1 from public.follows where follower_id = v_uid and following_id = p_target) then
    delete from public.follows where follower_id = v_uid and following_id = p_target;
    update public.profiles set follower_count = greatest(coalesce(follower_count, 0) - 1, 0) where id = p_target;
    update public.profiles set following_count = greatest(coalesce(following_count, 0) - 1, 0) where id = v_uid;
    v_following := false;
  else
    insert into public.follows (follower_id, following_id) values (v_uid, p_target);
    update public.profiles set follower_count = coalesce(follower_count, 0) + 1 where id = p_target;
    update public.profiles set following_count = coalesce(following_count, 0) + 1 where id = v_uid;
    v_following := true;
  end if;

  return json_build_object('success', true, 'following', v_following);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- post_comment(p_video, p_text, p_parent, p_creator) -> video_comments row
create or replace function public.post_comment(
  p_video uuid,
  p_text text,
  p_parent uuid default null,
  p_creator uuid default null
)
returns public.video_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.video_comments;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.video_comments (video_id, user_id, text, parent_id, created_at, updated_at)
  values (p_video, v_uid, p_text, p_parent, now(), now())
  returning * into v_row;

  update public.videos set comments_count = coalesce(comments_count, 0) + 1 where id = p_video;

  if p_parent is not null then
    update public.video_comments set replies_count = coalesce(replies_count, 0) + 1 where id = p_parent;
  end if;

  return v_row;
end;
$$;
grant execute on function public.post_comment(uuid, text, uuid, uuid) to authenticated;

-- =====================================================================================
-- 5. SHARES / DOWNLOADS
-- =====================================================================================

-- record_share(p_video, p_channel) -> Json
create or replace function public.record_share(
  p_video uuid,
  p_channel text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into public.video_shares (video_id, user_id, platform, shared_at)
  values (p_video, v_uid, coalesce(p_channel, 'unknown'), now());

  update public.videos set shares_count = coalesce(shares_count, 0) + 1 where id = p_video;

  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_share(uuid, text) to authenticated;

-- record_download(p_video) -> Json
create or replace function public.record_download(
  p_video uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into public.activity_log (user_id, action, target_id, target_type, metadata, created_at)
  values (v_uid, 'download', p_video, 'video', json_build_object('video_id', p_video), now());

  return json_build_object('success', true);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_download(uuid) to authenticated;

-- record_video_share(p_video_id, p_platform, p_user_id, p_user_agent, p_ip_address) -> uuid (share id)
create or replace function public.record_video_share(
  p_video_id uuid,
  p_platform text default null,
  p_user_id uuid default null,
  p_user_agent text default null,
  p_ip_address inet default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := coalesce(p_user_id, auth.uid());
begin
  insert into public.video_shares (video_id, user_id, platform, user_agent, ip_address, shared_at)
  values (p_video_id, v_uid, coalesce(p_platform, 'unknown'), p_user_agent, p_ip_address, now())
  returning id into v_id;

  update public.videos set shares_count = coalesce(shares_count, 0) + 1 where id = p_video_id;

  return v_id;
end;
$$;
grant execute on function public.record_video_share(uuid, text, uuid, text, inet) to authenticated, anon;

-- get_video_share_count(p_video_id) -> integer
create or replace function public.get_video_share_count(
  p_video_id uuid
)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from public.video_shares where video_id = p_video_id;
$$;
grant execute on function public.get_video_share_count(uuid) to authenticated, anon;

-- get_video_share_breakdown(p_video_id) -> {platform, count}[]
create or replace function public.get_video_share_breakdown(
  p_video_id uuid
)
returns table (
  platform text,
  count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select vs.platform, count(*)::bigint as count
  from public.video_shares vs
  where vs.video_id = p_video_id
  group by vs.platform
  order by count desc;
$$;
grant execute on function public.get_video_share_breakdown(uuid) to authenticated, anon;

-- =====================================================================================
-- 6. USER SETTINGS
-- =====================================================================================

-- get_user_settings(p_user_id) -> user_settings row(s)
create or replace function public.get_user_settings(
  p_user_id uuid
)
returns setof public.user_settings
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.user_settings
  where user_id = p_user_id;
$$;
grant execute on function public.get_user_settings(uuid) to authenticated;

-- update_user_settings(...) -> boolean
create or replace function public.update_user_settings(
  p_user_id uuid,
  p_autoplay_shorts boolean default null,
  p_autoplay_videos boolean default null,
  p_captions_enabled boolean default null,
  p_captions_language text default null,
  p_custom_settings json default null,
  p_language text default null,
  p_mini_player_enabled boolean default null,
  p_muted boolean default null,
  p_notifications_enabled boolean default null,
  p_playback_speed numeric default null,
  p_quality_preference text default null,
  p_restricted_mode boolean default null,
  p_theme text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (
    user_id, autoplay_shorts, autoplay_videos, captions_enabled, captions_language,
    custom_settings, language, mini_player_enabled, muted, notifications_enabled,
    playback_speed, quality_preference, restricted_mode, theme, updated_at
  ) values (
    p_user_id,
    coalesce(p_autoplay_shorts, true),
    coalesce(p_autoplay_videos, true),
    coalesce(p_captions_enabled, false),
    coalesce(p_captions_language, 'en'),
    coalesce(p_custom_settings, '{}'::json),
    coalesce(p_language, 'en'),
    coalesce(p_mini_player_enabled, true),
    coalesce(p_muted, false),
    coalesce(p_notifications_enabled, true),
    coalesce(p_playback_speed, 1),
    coalesce(p_quality_preference, 'auto'),
    coalesce(p_restricted_mode, false),
    coalesce(p_theme, 'system'),
    now()
  )
  on conflict (user_id) do update set
    autoplay_shorts = coalesce(p_autoplay_shorts, public.user_settings.autoplay_shorts),
    autoplay_videos = coalesce(p_autoplay_videos, public.user_settings.autoplay_videos),
    captions_enabled = coalesce(p_captions_enabled, public.user_settings.captions_enabled),
    captions_language = coalesce(p_captions_language, public.user_settings.captions_language),
    custom_settings = coalesce(p_custom_settings, public.user_settings.custom_settings),
    language = coalesce(p_language, public.user_settings.language),
    mini_player_enabled = coalesce(p_mini_player_enabled, public.user_settings.mini_player_enabled),
    muted = coalesce(p_muted, public.user_settings.muted),
    notifications_enabled = coalesce(p_notifications_enabled, public.user_settings.notifications_enabled),
    playback_speed = coalesce(p_playback_speed, public.user_settings.playback_speed),
    quality_preference = coalesce(p_quality_preference, public.user_settings.quality_preference),
    restricted_mode = coalesce(p_restricted_mode, public.user_settings.restricted_mode),
    theme = coalesce(p_theme, public.user_settings.theme),
    updated_at = now();

  return true;
exception when others then
  return false;
end;
$$;
grant execute on function public.update_user_settings(
  uuid, boolean, boolean, boolean, text, json, text, boolean, boolean, boolean, numeric, text, boolean, text
) to authenticated;

-- =====================================================================================
-- 7. COMMUNITY POSTS
-- =====================================================================================

-- get_channel_community_posts(p_creator_id, p_limit, p_offset)
create or replace function public.get_channel_community_posts(
  p_creator_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  creator_id uuid,
  creator_name text,
  creator_handle text,
  creator_avatar text,
  content text,
  media_urls text[],
  likes_count integer,
  comments_count integer,
  is_pinned boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cp.id,
    cp.creator_id,
    p.display_name as creator_name,
    p.handle as creator_handle,
    p.avatar_url as creator_avatar,
    cp.content,
    cp.media_urls,
    cp.likes_count,
    cp.comments_count,
    cp.is_pinned,
    cp.created_at
  from public.community_posts cp
  left join public.profiles p on p.id = cp.creator_id
  where cp.creator_id = p_creator_id
    and cp.visibility = 'public'
  order by cp.is_pinned desc, cp.created_at desc
  limit coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;
grant execute on function public.get_channel_community_posts(uuid, integer, integer) to authenticated, anon;

-- toggle_community_post_like(p_post_id, p_user_id) -> Json
create or replace function public.toggle_community_post_like(
  p_post_id uuid,
  p_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked boolean;
begin
  if exists (select 1 from public.community_post_likes where post_id = p_post_id and user_id = p_user_id) then
    delete from public.community_post_likes where post_id = p_post_id and user_id = p_user_id;
    update public.community_posts set likes_count = greatest(coalesce(likes_count, 0) - 1, 0) where id = p_post_id;
    v_liked := false;
  else
    insert into public.community_post_likes (post_id, user_id) values (p_post_id, p_user_id);
    update public.community_posts set likes_count = coalesce(likes_count, 0) + 1 where id = p_post_id;
    v_liked := true;
  end if;

  return json_build_object('success', true, 'liked', v_liked);
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.toggle_community_post_like(uuid, uuid) to authenticated;

-- =====================================================================================
-- 8. LIVE CHAT RATE LIMITING
-- =====================================================================================

-- rate_limit_chat_message(p_stream_id, p_user_id) -> boolean (true = allowed)
create or replace function public.rate_limit_chat_message(
  p_stream_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.live_chat_messages
  where stream_id = p_stream_id
    and user_id = p_user_id
    and created_at > now() - interval '10 seconds';

  return v_count < 5;
exception when others then
  return true;
end;
$$;
grant execute on function public.rate_limit_chat_message(uuid, uuid) to authenticated;
