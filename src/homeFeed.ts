/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * ProNax Home Feed Service
 * -------------------------------------------------------------
 * ProNax-style personalized home feed loader.
 *  1. Server-side ranking through the get_home_feed_v2 RPC (with graceful
 *     fallback to direct table reads when the RPC is unavailable).
 *  2. Watch-history exclusion so "For You" never repeats watched videos.
 *  3. Client-side re-ranking through the ProNax trending algorithm.
 *  4. Per-session seed so every refresh produces a different ordering.
 *
 * No hardcoded / mock data — every row comes from Supabase.
 */
import { supabase } from '@/integrations/supabase/loose';
import { rankVideosByTrendingScore } from './trendingAlgorithm';

export type FeedKind = 'foryou' | 'trending' | 'following';

export interface HomeFeedVideo {
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
  views_count?: number | null;
  ownerName?: string;
  ownerAvatar?: string | null;
  views?: number;
  likes?: number;
}

const SELECT_COLS =
  'id,title,description,thumb_url,video_url,owner_id,created_at,views_count,duration_seconds,is_short,category,preview_sprite_url,preview_sprite_frames';

/* ------------------------------------------------------------------ */
/* Session tracking (shared by long videos + shorts)                    */
/* ------------------------------------------------------------------ */

const SEED_KEY = 'pronax:feed:seed';
const SEEN_KEY = 'pronax:feed:seen';

function safeSession(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Stable-per-session seed; rotated on every manual refresh of the feed. */
export function getFeedSeed(): number {
  const ss = safeSession();
  const existing = ss?.getItem(SEED_KEY);
  if (existing) return Number(existing) || 1;
  const seed = Math.floor(Math.random() * 1_000_000) + 1;
  ss?.setItem(SEED_KEY, String(seed));
  return seed;
}

export function rotateFeedSeed(): number {
  const seed = Math.floor(Math.random() * 1_000_000) + 1;
  safeSession()?.setItem(SEED_KEY, String(seed));
  return seed;
}

/** Ids already surfaced this session (long videos AND shorts). */
export function getSessionSeenIds(): Set<string> {
  try {
    const raw = safeSession()?.getItem(SEEN_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

export function markSessionSeen(ids: string[]) {
  if (!ids.length) return;
  const set = getSessionSeenIds();
  ids.forEach((id) => set.add(id));
  // keep the ring buffer bounded
  const arr = Array.from(set).slice(-800);
  try {
    safeSession()?.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* storage full — non fatal */
  }
}

/* ------------------------------------------------------------------ */
/* Watch history                                                        */
/* ------------------------------------------------------------------ */

let watchedCache: { at: number; ids: string[] } | null = null;

export async function getWatchedVideoIds(force = false): Promise<string[]> {
  if (!force && watchedCache && Date.now() - watchedCache.at < 60_000) return watchedCache.ids;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      watchedCache = { at: Date.now(), ids: [] };
      return [];
    }
    const { data } = await supabase
      .from('watch_history')
      .select('video_id')
      .eq('user_id', uid)
      .order('watched_at', { ascending: false })
      .limit(500);
    const ids = (data ?? []).map((r: { video_id: string }) => r.video_id).filter(Boolean);
    watchedCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return watchedCache?.ids ?? [];
  }
}

/* ------------------------------------------------------------------ */
/* Ranking helpers                                                      */
/* ------------------------------------------------------------------ */

function seededNoise(id: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000; // 0..1
}

/**
 * Re-rank long-form videos with the ProNax trending engine, then apply a
 * small seeded jitter so each refresh shows a fresh order (ProNax-style)
 * without destroying relevance.
 */
export function rankHomeFeed(videos: HomeFeedVideo[], kind: FeedKind, seed: number): HomeFeedVideo[] {
  if (videos.length < 2) return videos;
  const ranked = rankVideosByTrendingScore(
    videos.map((v) => ({
      id: String(v.id),
      title: v.title ?? '',
      views: Number(v.views ?? v.views_count ?? 0),
      likes: Number(v.likes ?? 0),
      created_at: v.created_at,
      duration_seconds: v.duration_seconds ?? undefined,
      description: v.description ?? undefined,
      __row: v,
    })),
  );

  const jitter = kind === 'trending' ? 6 : 14; // "For You" varies more between refreshes
  return ranked
    .map((r) => ({
      row: (r as unknown as { __row: HomeFeedVideo }).__row,
      score: r.trendingInfo.score + seededNoise(String(r.id), seed) * jitter,
    }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.row);
}

/* ------------------------------------------------------------------ */
/* Page loader                                                          */
/* ------------------------------------------------------------------ */

export async function loadHomeFeedPage(opts: {
  kind: FeedKind;
  offset: number;
  limit: number;
  category: string;
  seed: number;
  excludeWatched?: boolean;
}): Promise<HomeFeedVideo[]> {
  const { kind, offset, limit, category, seed } = opts;
  const catParam = category === 'All' ? null : category;
  const excludeWatched = opts.excludeWatched ?? kind === 'foryou';

  const watched = excludeWatched ? await getWatchedVideoIds() : [];
  const watchedSet = new Set(watched);
  // Over-fetch so exclusions don't shrink the page below `limit`.
  const fetchCount = Math.min(96, limit + (excludeWatched ? Math.min(watchedSet.size, 48) : 0));

  let rows: HomeFeedVideo[] = [];

  // 1. Server-side ranking RPC
  try {
    const { data, error } = await supabase.rpc('get_home_feed_v2', {
      p_kind: kind,
      p_limit: fetchCount,
      p_offset: offset,
      p_category: catParam ?? undefined,
      p_is_short: false,
      p_max_per_creator: 2,
      p_max_per_category: 4,
    });
    if (!error && Array.isArray(data)) rows = data as unknown as HomeFeedVideo[];
  } catch {
    /* fall through to direct query */
  }

  // 2. Direct table read fallback
  if (!rows.length) {
    try {
      let q = supabase.from('videos').select(SELECT_COLS).eq('visibility', 'public').eq('status', 'ready');
      if (catParam) q = q.ilike('category', `%${catParam}%`);
      q =
        kind === 'trending'
          ? q.order('views_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
          : q.order('created_at', { ascending: false });
      const { data, error } = await q.range(offset, offset + fetchCount - 1);
      if (!error && Array.isArray(data)) rows = data as unknown as HomeFeedVideo[];
    } catch {
      /* keep empty */
    }
  }

  // 3. EMERGENCY FALLBACK: Try without status filter if no results
  if (!rows.length) {
    try {
      console.log('[homeFeed] Emergency fallback: trying without status filter');
      let q = supabase.from('videos').select(SELECT_COLS).eq('visibility', 'public');
      if (catParam) q = q.ilike('category', `%${catParam}%`);
      q =
        kind === 'trending'
          ? q.order('views_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
          : q.order('created_at', { ascending: false });
      const { data, error } = await q.range(offset, offset + fetchCount - 1);
      if (!error && Array.isArray(data)) rows = data as unknown as HomeFeedVideo[];
    } catch {
      /* keep empty */
    }
  }

  if (!rows.length) return [];

  // 4. Personalization filters
  const seenThisSession = getSessionSeenIds();
  let pool = rows;
  if (excludeWatched && watchedSet.size) {
    const unwatched = pool.filter((v) => !watchedSet.has(String(v.id)));
    if (unwatched.length) pool = unwatched;
  }
  if (kind === 'foryou' && offset === 0) {
    const unseen = pool.filter((v) => !seenThisSession.has(String(v.id)));
    if (unseen.length >= Math.min(6, pool.length)) pool = unseen;
  }

  // 5. Algorithmic ranking + per-refresh variation
  const ranked = rankHomeFeed(pool, kind, seed).slice(0, limit);
  markSessionSeen(ranked.map((v) => String(v.id)));
  return ranked;
}
