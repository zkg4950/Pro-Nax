/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { PlaySquare, ChevronRight, Loader2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { VideoGridSkeleton } from '@/components/NeonSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { supabase } from '@/integrations/supabase/loose';
import { toast } from 'sonner';


import { AnimatedCounter, compactFormat } from '@/components/ui/animated-counter';
import { LiveNowRail } from '@/components/LiveNowRail';
import { CategoryScroller } from '@/components/CategoryScroller';
import { FeedVideoCard } from '@/components/FeedVideoCard';
import { DynamicAdContainer } from '@/components/DynamicAdContainer';
import { useAdSlot } from '@/hooks/useAdSlot';
import { loadHomeFeedPage, rotateFeedSeed, markSessionSeen } from '@/lib/homeFeed';

type FeedKind = 'foryou' | 'trending' | 'following';

interface FeedVideo {
  id: string;
  title: string;
  description: string | null;
  thumb_url: string | null;
  video_url: string | null;
  owner_id: string;
  created_at: string;
  duration_seconds: number | null;
  is_short: boolean | null;
  category: string | null;
  preview_sprite_url?: string | null;
  preview_sprite_frames?: number | null;
  ownerName?: string;
  ownerAvatar?: string | null;
  views?: number;
  likes?: number;
}

const categories = ['All', 'Gaming', 'Music', 'Sports', 'Tech', 'Education', 'Comedy', 'News', 'Cooking', 'Travel'];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtDuration(s: number | null) {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}


async function enrich(videos: FeedVideo[]): Promise<FeedVideo[]> {
  if (!videos.length) return videos;
  const ownerIds = [...new Set(videos.map(v => v.owner_id))].filter(Boolean);
  const ids = videos.map(v => v.id).filter(Boolean);
  try {
    const [{ data: profiles }, likes] = await Promise.all([
      ownerIds.length ? supabase.from('profiles').select('id, display_name, avatar_url').in('id', ownerIds) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('video_likes').select('video_id').in('video_id', ids) : Promise.resolve({ data: [] }),
    ]);
    const nameMap = new Map((profiles ?? []).map((p: { id: string; display_name?: string | null }) => [p.id, p.display_name || 'Creator']));
    const avatarMap = new Map((profiles ?? []).map((p: { id: string; avatar_url?: string | null }) => [p.id, p.avatar_url]));
    const likeMap = new Map<string, number>();
    (likes?.data ?? []).forEach((r: { video_id: string }) => likeMap.set(r.video_id, (likeMap.get(r.video_id) ?? 0) + 1));
    return videos.map(v => ({
      ...v,
      ownerName: v.ownerName || nameMap.get(v.owner_id) || 'Creator',
      ownerAvatar: v.ownerAvatar || avatarMap.get(v.owner_id),
      likes: v.likes ?? likeMap.get(v.id) ?? 0,
      views: v.views ?? (v as any).views_count ?? 0,
    }));
  } catch {
    return videos.map(v => ({
      ...v,
      ownerName: v.ownerName || 'Creator',
      likes: v.likes ?? 0,
      views: v.views ?? (v as any).views_count ?? 0,
    }));
  }
}

export default function Index() {
  const [feedKind, setFeedKind] = useState<FeedKind>('foryou');
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [shorts, setShorts] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cat, setCat] = useState('All');
  const [hasMore, setHasMore] = useState(true);
  // Rotating on every mount gives ProNax-style "different picks each visit".
  const [seed] = useState(() => rotateFeedSeed());
  const PAGE = 24;


  // Feed pagination — server-ranked RPC (get_home_feed_v2) with watch-history
  // exclusion and ProNax trending re-ranking. See src/lib/homeFeed.ts.
  const loadPage = async (kind: FeedKind, offset: number, category: string): Promise<FeedVideo[]> =>
    (await loadHomeFeedPage({ kind, offset, limit: PAGE, category, seed })) as FeedVideo[];


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setHasMore(true);
      try {
        const first = await loadPage(feedKind, 0, cat);
        if (cancelled) return;
        const enriched = await enrich(first);
        if (cancelled) return;
        const longs = enriched.filter((v) => !v.is_short);
        setVideos(longs.length > 0 ? longs : enriched);
        setHasMore(first.length >= PAGE);

        // Shorts rail — shares the same session tracking as the long feed.
        const { data: shortRows } = await supabase
          .from('videos')
          .select('id,title,thumb_url,video_url,owner_id,created_at,views_count,duration_seconds,is_short,category,description')
          .eq('visibility', 'public')
          .eq('status', 'ready')
          .eq('is_short', true)
          .order('created_at', { ascending: false })
          .limit(24);
        if (cancelled) return;
        const shortList = await enrich(((shortRows ?? []) as unknown as FeedVideo[]).slice(0, 12));
        if (cancelled) return;
        markSessionSeen(shortList.map((s) => String(s.id)));
        setShorts(shortList);
      } catch (e: any) {
        if (!cancelled) {
          console.warn('[index] feed load error', e);
          setVideos([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [feedKind, cat]);

  // Infinite scroll sentinel — disabled when feed is empty or exhausted
  useEffect(() => {
    if (loading || !hasMore || videos.length === 0) return;
    const el = document.getElementById('feed-sentinel');
    if (!el) return;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      try {
        const next = await loadPage(feedKind, videos.length, cat);
        const enriched = await enrich(next);
        setVideos((prev) => [...prev, ...enriched.filter((v) => !v.is_short)]);
        if (next.length < PAGE) setHasMore(false);
      } catch (e) {
        console.error('[index] load more failed', e);
        setHasMore(false);
      } finally {
        setLoadingMore(false);
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, hasMore, loadingMore, videos.length, feedKind, cat]);

  // Realtime — auto-prepend brand-new public videos as they land.
  useEffect(() => {
    const channel = supabase
      .channel('feed:videos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'videos' }, async (payload: { new: FeedVideo & { visibility?: string | null; status?: string | null } }) => {
        const v = payload.new;
        if (!v || v.visibility !== 'public' || v.status !== 'ready' || v.is_short) return;
        if (cat !== 'All' && (v.category || '').toLowerCase() !== cat.toLowerCase()) return;
        const [enriched] = await enrich([v]);
        setVideos((prev) => (prev.some((x) => x.id === enriched.id) ? prev : [enriched, ...prev]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cat]);

  // Auto-refresh for new content (paused when the tab/app is in background)
  useEffect(() => {
    if (loading || !hasMore) return;

    const INTERVAL = 30000;
    const refreshInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const since = new Date(Date.now() - INTERVAL).toISOString();
        const { data: newVideos } = await supabase
          .from('videos')
          .select('id,title,description,thumb_url,video_url,owner_id,created_at,views_count,duration_seconds,is_short,category,preview_sprite_url,preview_sprite_frames')
          .eq('visibility', 'public')
          .eq('status', 'ready')
          .eq('is_short', false)
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(3);

        if (newVideos && newVideos.length > 0) {
          const enriched = await enrich(newVideos);
          setVideos((prev) => {
            const existingIds = new Set(prev.map(v => v.id));
            const freshVideos = enriched.filter(v => !existingIds.has(v.id));
            // Cap the list so long sessions on low-memory phones don't crash.
            return freshVideos.length > 0 ? [...freshVideos, ...prev].slice(0, 120) : prev;
          });
        }
      } catch (error) {
        console.log('[Auto-refresh] Error checking for new videos:', error);
      }
    }, INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [loading, hasMore, cat]);





  const filtered = cat === 'All' ? videos : videos.filter(v => (v.category || '').toLowerCase() === cat.toLowerCase());
  const { row: feedAdRow } = useAdSlot('home_feed');
  const feedAdEvery = feedAdRow?.enabled && feedAdRow.html_snippet ? Math.max(1, Number(feedAdRow.frequency) || 6) : 0;

  return (
    <div className="relative min-h-screen w-full max-w-full flex-1 px-0 pb-20 md:pb-0">

      {/* Feed kind toggle */}
      <div className="flex gap-1 px-3 pt-3 sm:px-4 lg:px-5">
        {(['foryou', 'trending', 'following'] as FeedKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setFeedKind(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              feedKind === k ? 'bg-white text-black font-semibold' : 'bg-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            {k === 'foryou' ? 'For You' : k}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div className="px-3 py-2 sm:px-4 lg:px-5">
        <CategoryScroller items={categories} value={cat} onSelect={setCat} />
      </div>

      <div className="px-3 sm:px-4 lg:px-5"><LiveNowRail /></div>

      {/* Grid */}
      <div className="w-full px-0 pb-4 sm:px-4 lg:px-5">
        {loading ? (
          <VideoGridSkeleton count={9} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={PlaySquare}
            title={feedKind === 'following' ? 'No follows yet' : 'Feed is empty'}
            description={
              feedKind === 'following'
                ? 'Follow creators to build a personalized feed here.'
                : 'Be the first to upload — your video will headline this page.'
            }
            ctaLabel={feedKind === 'following' ? 'Explore creators' : 'Upload your first video'}
            ctaTo={feedKind === 'following' ? '/explore' : '/upload'}
          />
        ) : (
          <div className="mb-4 grid w-full grid-cols-1 items-start gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.flatMap((v, i) => {
              const nodes = [
              <ImpressionCard
                key={v.id}
                videoId={String(v.id)}
                className="card-vis w-full"
              >
                <FeedVideoCard
                  id={String(v.id)}
                  title={v.title}
                  channel={v.ownerName || 'creator'}
                  views={v.views ?? 0}
                  timeText={timeAgo(v.created_at)}
                  durationText={fmtDuration(v.duration_seconds)}
                  thumbUrl={v.thumb_url}
                   channelAvatar={v.ownerAvatar}
                  previewSpriteUrl={v.preview_sprite_url}
                  previewSpriteFrames={v.preview_sprite_frames}
                  index={i}
                />
              </ImpressionCard>
              ];
              if (feedAdEvery > 0 && (i + 1) % feedAdEvery === 0) {
                nodes.push(
                  <DynamicAdContainer key={`ad-${i}`} placement="home_feed" className="v3d-stage group relative w-full px-0 pb-1" />
                );
              }
              return nodes;
            })}
          </div>
        )}
        {!loading && hasMore && cat === 'All' && (
          <div id="feed-sentinel" className="flex items-center justify-center py-6 text-muted-foreground text-xs">
            {loadingMore ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading more…</>) : 'Scroll for more'}
          </div>
        )}
      </div>


      {/* Shorts strip */}
      {shorts.length > 0 && (
        <div className="px-3 lg:px-6 pb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PlaySquare className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-foreground">Shorts</h2>
            </div>
            <Link to="/shorts" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar rail-gpu pb-2">
            {shorts.map((s) => (
              <Link key={s.id} to="/shorts" className="shrink-0 w-32 aspect-[9/16] rounded-lg overflow-hidden relative group" style={{ scrollSnapAlign: 'start' }}>
                {s.thumb_url ? (
                  <img src={s.thumb_url} alt={s.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />

                ) : (
                  <video src={s.video_url || ''} muted className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white font-semibold line-clamp-2">{s.title}</div>
                <div className="absolute top-2 left-2 text-[10px] text-white/80 bg-black/40 backdrop-blur rounded px-1.5">
                  <AnimatedCounter value={s.views ?? 0} format={compactFormat} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useVideoImpression } from '@/hooks/useVideoImpression';

function ImpressionCard({
  videoId,
  className,
  style,
  children,
}: {
  videoId: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useVideoImpression(videoId, 'home');
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}