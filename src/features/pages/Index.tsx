/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { PlaySquare, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/loose';

import { AnimatedCounter, compactFormat } from '@/components/ui/animated-counter';
import { LiveNowRail } from '@/components/LiveNowRail';
import { CategoryScroller } from '@/components/CategoryScroller';
import { FeedVideoCard } from '@/components/FeedVideoCard';
import { DynamicAdContainer } from '@/components/DynamicAdContainer';
import { useAdSlot } from '@/hooks/useAdSlot';
import { FeedErrorBoundary } from '@/components/feed/FeedErrorBoundary';
import { FeedSkeleton, EmptyState } from '@/components/feed/FeedSkeleton';

const categories = ['All', 'Gaming', 'Music', 'Sports', 'Tech', 'Education', 'Comedy', 'News', 'Cooking', 'Travel'];

type FeedVideo = {
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
};

type FeedKind = 'foryou' | 'trending' | 'following';

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

function fmtDuration(seconds: number | null) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function enrichVideos(videos: FeedVideo[]): Promise<FeedVideo[]> {
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
  const [cat, setCat] = useState('All');
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [shorts, setShorts] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Ad slot configuration
  const { row: feedAdRow } = useAdSlot('home_feed');
  const feedAdEvery = feedAdRow?.enabled && feedAdRow.html_snippet ? Math.max(1, Number(feedAdRow.frequency) || 6) : 0;

  // Load videos with direct Supabase query (like Explore)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const baseSel = 'id,title,description,thumb_url,video_url,owner_id,created_at,views_count,likes_count,duration_seconds,is_short,category,preview_sprite_url,preview_sprite_frames';
        
        let query = supabase
          .from('videos')
          .select(baseSel)
          .eq('visibility', 'public')
          .eq('status', 'ready')
          .or('is_short.is.null,is_short.eq.false');

        if (cat !== 'All') {
          query = query.ilike('category', cat);
        }

        if (feedKind === 'trending') {
          query = query.order('views_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data, error: queryError } = await query.limit(24);
        
        if (queryError) throw queryError;
        
        if (!cancelled) {
          const enriched = await enrichVideos((data as FeedVideo[]) ?? []);
          setVideos(enriched);
          setHasMore((data?.length ?? 0) >= 24);
        }

        // Load shorts
        const { data: shortData } = await supabase
          .from('videos')
          .select(baseSel)
          .eq('visibility', 'public')
          .eq('status', 'ready')
          .eq('is_short', true)
          .order('created_at', { ascending: false })
          .limit(12);
        
        if (!cancelled) {
          const enrichedShorts = await enrichVideos((shortData as FeedVideo[]) ?? []);
          setShorts(enrichedShorts);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('[Index] Load error:', e);
          setError(e.message || 'Failed to load videos');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [feedKind, cat]);

  // Handle refresh
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      // Reload by triggering the effect
      setCat(prev => prev);
      toast.success('Feed refreshed');
    } catch (e: any) {
      setError(e.message || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  // Handle error retry
  const handleRetry = async () => {
    handleRefresh();
  };

  return (
    <FeedErrorBoundary>
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

        {/* Error State */}
        {error && (
          <div className="px-3 sm:px-4 lg:px-5">
            <EmptyState
              title="Feed Loading Error"
              description={error}
              icon={<RefreshCw className="w-16 h-16 text-red-500" />}
              action={{
                label: 'Retry',
                onClick: handleRetry,
              }}
            />
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="px-3 sm:px-4 lg:px-5">
            <FeedSkeleton count={12} />
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && videos.length === 0 && (
          <div className="px-3 sm:px-4 lg:px-5">
            <EmptyState
              title={feedKind === 'following' ? 'No follows yet' : 'Feed is empty'}
              description={
                feedKind === 'following'
                  ? 'Follow creators to build a personalized feed here.'
                  : 'Be the first to upload — your video will headline this page.'
              }
              icon={<PlaySquare className="w-16 h-16 text-gray-600" />}
              action={{
                label: feedKind === 'following' ? 'Explore creators' : 'Upload your first video',
                onClick: () => {
                  window.location.href = feedKind === 'following' ? '/explore' : '/upload';
                },
              }}
            />
          </div>
        )}

        {/* Feed Content */}
        {!loading && !error && videos.length > 0 && (
          <div className="px-3 sm:px-4 lg:px-5">
            <div className="mb-4 grid w-full grid-cols-1 items-start gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {videos.flatMap((v, i) => {
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
                  </ImpressionCard>,
                ];

                // Add ads if configured
                if (feedAdEvery > 0 && (i + 1) % feedAdEvery === 0) {
                  nodes.push(
                    <DynamicAdContainer 
                      key={`ad-${i}`} 
                      placement="home_feed" 
                      className="v3d-stage group relative w-full px-0 pb-1"
                      index={i}
                    />
                  );
                }

                return nodes;
              })}
            </div>

            {/* Load More Sentinel */}
            {hasMore && cat === 'All' && (
              <div 
                id="feed-sentinel" 
                className="flex items-center justify-center py-6 text-muted-foreground text-xs"
              >
                {'Scroll for more'}
              </div>
            )}
          </div>
        )}

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
    </FeedErrorBoundary>
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