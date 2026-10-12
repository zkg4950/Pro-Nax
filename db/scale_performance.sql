-- =====================================================================
-- ProNax — Scale & performance pack
-- Run this once in the SQL editor. Safe to re-run (idempotent).
--
-- What it does:
--   1. Denormalized counters (likes/comments/views) kept in sync by triggers,
--      so feeds never need to scan the event tables.
--   2. Full-text search column + GIN index used by search_videos().
--   3. Indexes for every hot read path (feed, shorts, channel, history).
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1. Counter columns
-- ---------------------------------------------------------------------
alter table public.videos add column if not exists likes_count    bigint not null default 0;
alter table public.videos add column if not exists comments_count bigint not null default 0;
alter table public.videos add column if not exists views_count    bigint not null default 0;

-- Likes -----------------------------------------------------------------
create or replace function public.sync_video_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.videos set likes_count = likes_count + 1 where id = new.video_id;
  elsif (tg_op = 'DELETE') then
    update public.videos set likes_count = greatest(0, likes_count - 1) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_video_likes_count on public.video_likes;
create trigger trg_video_likes_count
after insert or delete on public.video_likes
for each row execute function public.sync_video_likes_count();

-- Comments --------------------------------------------------------------
create or replace function public.sync_video_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.videos set comments_count = comments_count + 1 where id = new.video_id;
  elsif (tg_op = 'DELETE') then
    update public.videos set comments_count = greatest(0, comments_count - 1) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_video_comments_count on public.comments;
create trigger trg_video_comments_count
after insert or delete on public.comments
for each row execute function public.sync_video_comments_count();

-- Views -----------------------------------------------------------------
create or replace function public.sync_video_views_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.videos set views_count = views_count + 1 where id = new.video_id;
  return null;
end;
$$;

drop trigger if exists trg_video_views_count on public.video_views;
create trigger trg_video_views_count
after insert on public.video_views
for each row execute function public.sync_video_views_count();

-- Backfill existing rows once ------------------------------------------
update public.videos v set
  likes_count    = coalesce((select count(*) from public.video_likes  l where l.video_id = v.id), 0),
  comments_count = coalesce((select count(*) from public.comments     c where c.video_id = v.id), 0),
  views_count    = greatest(v.views_count,
                     coalesce((select count(*) from public.video_views w where w.video_id = v.id), 0));

-- ---------------------------------------------------------------------
-- 2. Full-text search
-- ---------------------------------------------------------------------
alter table public.videos
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'C')
  ) stored;

create index if not exists idx_videos_search_tsv on public.videos using gin (search_tsv);
create index if not exists idx_profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 3. Hot-path indexes
-- ---------------------------------------------------------------------
create index if not exists idx_videos_feed
  on public.videos (created_at desc)
  where visibility = 'public' and status = 'ready';

create index if not exists idx_videos_trending
  on public.videos (views_count desc, created_at desc)
  where visibility = 'public' and status = 'ready';

create index if not exists idx_videos_shorts
  on public.videos (created_at desc)
  where is_short = true and visibility = 'public' and status = 'ready';

create index if not exists idx_videos_owner        on public.videos (owner_id, created_at desc);
create index if not exists idx_videos_category     on public.videos (category, created_at desc);
create index if not exists idx_video_likes_video   on public.video_likes (video_id);
create index if not exists idx_video_likes_user    on public.video_likes (user_id, created_at desc);
create index if not exists idx_video_views_video   on public.video_views (video_id, created_at desc);
create index if not exists idx_comments_video      on public.comments (video_id, created_at desc);
create index if not exists idx_watch_history_user  on public.watch_history (user_id, watched_at desc);
create index if not exists idx_notifications_user  on public.notifications (user_id, created_at desc);
create index if not exists idx_subscriptions_user  on public.subscriptions (subscriber_id);
create index if not exists idx_ip_rules_mode       on public.ip_rules (mode);

analyze public.videos;
