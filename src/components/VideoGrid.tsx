/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useRef } from 'react';
import { Link } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatedCounter, compactFormat } from '@/components/ui/animated-counter';
import { AdSlot } from '@/components/AdSlot';
import { useAdSlot } from '@/hooks/useAdSlot';
import { useIsMobile } from '@/hooks/use-mobile';
import { EngineBoundary } from '@/components/EngineBoundary';


export interface GridVideo {
  id: string;
  title: string;
  thumb_url?: string | null;
  video_url?: string | null;
  owner_id?: string;
  created_at?: string;
  duration_seconds?: number | null;
  ownerName?: string;
  ownerAvatar?: string;
  views?: number;
  is_short?: boolean;
}

function timeAgo(iso?: string) {
  if (!iso) return '';
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

function fmtDuration(s?: number | null) {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function VideoCardTile({ v, i }: { v: GridVideo; i: number }) {
  const views = v.views ?? 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.03 }}
      className="w-full min-w-0"
    >
      <Link
        to={v.is_short ? `/shorts/${v.id}` : `/watch/${v.id}`}
        className="block group w-full v3d-stage"
      >
        <div className="v3d-thumb relative w-full aspect-video overflow-hidden bg-gray-800 rounded-none sm:rounded-2xl">
          {v.thumb_url ? (
            <img
              src={v.thumb_url}
              alt={v.title}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gray-800" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 sm:group-hover:opacity-100 transition-opacity" />
          {fmtDuration(v.duration_seconds) && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {fmtDuration(v.duration_seconds)}
            </span>
          )}
        </div>
        <div className="flex items-start gap-3 mt-2.5 px-3 sm:px-0 w-full">
          <div className="h-9 w-9 shrink-0 rounded-full bg-gray-700 overflow-hidden">
            {v.ownerAvatar ? (
              <img src={v.ownerAvatar} alt={v.ownerName || 'Creator'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-600 text-[10px] font-bold text-white">
                {(v.ownerName || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2  text-[14px] font-medium leading-[20px] text-white">
              {v.title}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[12px] leading-[16px] text-gray-400">
              <span className="truncate max-w-[55%]">@{(v.ownerName || 'creator').replace(/\s+/g, '')}</span>
              <span>•</span>
              <span className="shrink-0">{views > 0 ? <AnimatedCounter value={views} format={compactFormat} /> + ' views' : '0 views'}</span>
              <span>•</span>
              <span className="shrink-0">{timeAgo(v.created_at)}</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}


/**
 * Mobile: virtualized single-column list via @tanstack/react-virtual.
 * Only visible cards are mounted, keeping scrolling silky at 60fps
 * regardless of feed length. Desktop keeps the multi-column grid
 * (content-visibility: auto already skips offscreen paint there).
 */
function MobileVirtualList({ items }: { items: (GridVideo | { __ad: true; key: string })[] }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    // Card ≈ 16:9 thumbnail (screen width) + meta row. Overscan keeps rows warm.
    estimateSize: (i) => ('__ad' in items[i] ? 120 : Math.round((typeof window !== 'undefined' ? window.innerWidth : 390) * 0.5625) + 78),
    overscan: 4,
  });
  return (
    <div
      ref={parentRef}
      className="scroll-gpu overflow-y-auto px-0"
      style={{ height: 'calc(100vh - 140px)', contain: 'strict' }}
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {rowVirtualizer.getVirtualItems().map((row) => {
          const it = items[row.index];
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
              className="pb-4 px-0 sm:px-6 lg:px-8"
            >
              {'__ad' in it ? (
                <EngineBoundary name="ad-feed-row" silent>
                  <AdSlot slot="feed_grid_row" />
                </EngineBoundary>
              ) : (
                <VideoCardTile v={it} i={row.index} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function VideoGrid({ videos, empty }: { videos: GridVideo[]; empty?: string }) {
  const { row: adRow } = useAdSlot('feed_grid_row');
  const isMobile = useIsMobile();
  if (!videos.length) {
    return <div className="text-center py-20 text-muted-foreground text-sm">{empty || 'Nothing here yet.'}</div>;
  }
  // Default cadence: one ad unit every 4th card when admin leaves frequency unset.
  const freq = adRow?.enabled ? (adRow.frequency > 0 ? adRow.frequency : 4) : 0;

  // Mobile → virtualized list (60fps regardless of feed length).
  if (isMobile) {
    const items: (GridVideo | { __ad: true; key: string })[] = [];
    videos.forEach((v, i) => {
      items.push(v);
      if (freq && (i + 1) % freq === 0 && i < videos.length - 1) {
        items.push({ __ad: true, key: `ad-${i}` });
      }
    });
    return <MobileVirtualList items={items} />;
  }

  // Desktop → responsive grid with `content-visibility: auto` per card.
  const gridCls = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-4 px-0 sm:px-6 lg:px-8';
  if (!freq) {
    return (
      <div className={gridCls}>
        {videos.map((v, i) => <VideoCardTile key={v.id} v={v} i={i} />)}
      </div>
    );
  }
  const chunks: GridVideo[][] = [];
  for (let i = 0; i < videos.length; i += freq) chunks.push(videos.slice(i, i + freq));
  return (
    <div className="space-y-5 sm:space-y-6">
      {chunks.map((chunk, ci) => (
        <div key={ci}>
          <div className={gridCls}>
            {chunk.map((v, i) => <VideoCardTile key={v.id} v={v} i={ci * freq + i} />)}
          </div>
          {ci < chunks.length - 1 && (
            <div className="px-4 sm:px-0 mt-5 sm:mt-6">
              <EngineBoundary name="ad-feed-row" silent>
                <AdSlot slot="feed_grid_row" />
              </EngineBoundary>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


export async function enrichVideos(supabase: any, videos: any[]): Promise<GridVideo[]> {
  if (!videos.length) return [];
  const ownerIds = [...new Set(videos.map(v => v.owner_id).filter(Boolean))];
  // Counters are read from the denormalized columns on the video row — never
  // by pulling raw event rows, which would be unbounded on popular videos.
  const { data: profiles } = ownerIds.length
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ownerIds)
    : { data: [] };
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name || 'Creator']));
  const avatarMap = new Map((profiles ?? []).map((p: any) => [p.id, p.avatar_url]));
  return videos.map(v => ({
    ...v,
    ownerName: nameMap.get(v.owner_id) ?? 'Creator',
    ownerAvatar: avatarMap.get(v.owner_id),
    views: Number(v.views_count ?? v.views ?? 0),
  }));
}
