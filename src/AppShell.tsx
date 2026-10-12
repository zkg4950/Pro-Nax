/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  Music2,
  Play,
  Volume2,
  VolumeX,
  Plus,
  Video as VideoIcon,
  Send,
  Sparkles,
  Bookmark,
  CheckCircle2,
} from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/loose';
import {
  useLike,
  useComments,
  useFollow,
  useSave,
  recordView,
  recordShare,
} from '@/hooks/useInteractions';
import { useWatchHeartbeat } from '@/hooks/useWatchHeartbeat';
import { analyticsBus } from '@/lib/analyticsBus';
import { ShortsAdSlide } from '@/components/ShortsAdSlide';
import {
  rankShortsByProNaxFYP,
  recordProNaxViewerSignal,
  FYPRankingResult,
} from '@/lib/pronaxShortsAlgorithm';
import { LiveWatcherBadge } from '@/components/LiveWatcherBadge';
import ShareButton from '@/components/ShareButton';

/* ------------------------------------------------------------------ */
/*  Constants + types                                                  */
/* ------------------------------------------------------------------ */

const AD_EVERY_N_SHORTS = 4;

type FeedItem =
  | { kind: 'short'; short: Short }
  | { kind: 'ad'; attributeShortId: string | null; key: string };

interface Short {
  id: string;
  src: string;
  title: string;
  channel: string;
  avatar?: string;
  description: string;
  likes: number;
  comments: number;
  shares: number;
  music: string;
  owner_id?: string;
  tags?: string[];
  fypInfo?: FYPRankingResult;
  views_count?: number;
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/* Safe area and layout constants */
const SAFE_B = 'env(safe-area-inset-bottom, 0px)';
const SAFE_T = 'env(safe-area-inset-top, 0px)';
const RAIL_BOTTOM = '96px'; // Fixed bottom position for action rail
const RAIL_TOP_OFFSET = '88px'; // Top offset to avoid header avatar
const CAPTION_MAX_WIDTH = 'calc(100% - 84px)'; // Constrain width to avoid rail overlap

/* ------------------------------------------------------------------ */
/*  ShortItem                                                          */
/* ------------------------------------------------------------------ */

function ShortItem({
  short,
  active,
  muted,
  onOpenSound,
  onOpenComments,
  hasInteracted,
  onToggleMute,
}: {
  short: Short;
  active: boolean;
  muted: boolean;
  onOpenSound: () => void;
  onOpenComments: () => void;
  hasInteracted: boolean;
  onToggleMute: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [progressPct, setProgressPct] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [watchingCount, setWatchingCount] = useState(0);

  /* Current user */
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }: any) => setCurrentUserId(data.user?.id ?? null))
      .catch(() => setCurrentUserId(null));
  }, []);

  /* Auto-hide controls */
  useEffect(() => {
    if (!paused && active) {
      const timer = setTimeout(() => setShowControls(false), 2500);
      return () => clearTimeout(timer);
    }
    setShowControls(true);
  }, [paused, active]);

  /* Creator */
  const [creatorId, setCreatorId] = useState<string | null>(null);
  useEffect(() => {
    setCreatorId(short.owner_id ?? null);
  }, [short.owner_id]);

  const { liked, count: likeCount, toggle: toggleLike } = useLike(short.id, creatorId);
  const { following: followed, toggle: toggleFollow } = useFollow(creatorId);
  const { comments } = useComments(short.id, creatorId);
  const { saved: bookmarked, count: bookmarkCount, toggle: toggleBookmark } = useSave(short.id);

  /* Watch-time accounting */
  const watchedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const flushWatch = () => {
    const s = Math.round(watchedRef.current);
    if (s > 0) {
      analyticsBus.rpc('record_watch_history', { p_video: short.id, p_watch_seconds: s });
      recordProNaxViewerSignal({
        videoId: short.id,
        watchTimeSeconds: s,
        durationSeconds: videoRef.current?.duration || 15,
        tags: short.tags,
        audioId: short.music,
        liked,
        saved: bookmarked,
      });
    }
    watchedRef.current = 0;
    lastTickRef.current = null;
  };

  /* Live watching count simulation */
  useEffect(() => {
    if (active && !paused) {
      const baseViewers = Math.max(1, Math.floor((short.views_count ?? 0) / 10) || 1);
      setWatchingCount(baseViewers);
      const interval = setInterval(() => {
        setWatchingCount((prev) => {
          const variation = Math.floor(Math.random() * 3) - 1;
          return Math.max(1, prev + variation);
        });
      }, 3000);
      return () => clearInterval(interval);
    }
    setWatchingCount(0);
  }, [active, paused, short.views_count]);

  useEffect(() => {
    if (active) recordView(short.id, 0).catch(() => {});
    else flushWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, short.id]);

  useEffect(() => () => { flushWatch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useWatchHeartbeat({ videoId: active ? short.id : null, isPlaying: active && !paused });

  /* Play / pause on activation */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let playPromise: Promise<void> | undefined;

    if (active) {
      setVideoError(false);
      if (Math.abs(v.currentTime - 0) > 0.5) {
        try { v.currentTime = 0; } catch { /* noop */ }
      }

      const timeoutId = setTimeout(() => {
        if (!v.paused) {
          try { v.pause(); } catch { /* noop */ }
        }
        try {
          const result = v.play();
          if (result instanceof Promise) {
            playPromise = result;
            playPromise
              .then(() => setPaused(false))
              .catch((err: any) => {
                if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
                  setPaused(true);
                } else {
                  console.error('Video playback error:', err);
                  setVideoError(true);
                  setPaused(true);
                }
              });
          } else {
            setPaused(false);
          }
        } catch (e) {
          console.error('Play error:', e);
          setPaused(true);
        }
      }, 50);

      return () => {
        clearTimeout(timeoutId);
        if (playPromise) playPromise.catch(() => {});
      };
    }

    try { v.pause(); } catch { /* noop */ }
  }, [active, hasInteracted]);

  /* Media events */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTU = () => {
      if (v.paused) return;
      setIsBuffering(false);
      const now = performance.now();
      if (lastTickRef.current != null) {
        watchedRef.current += (now - lastTickRef.current) / 1000;
      }
      lastTickRef.current = now;
      if (v.duration) setProgressPct((v.currentTime / v.duration) * 100);
    };
    const onPlay = () => { lastTickRef.current = performance.now(); setIsBuffering(false); setPaused(false); };
    const onPause = () => { lastTickRef.current = null; setIsBuffering(false); setPaused(true); };
    const onEnded = () => { flushWatch(); setIsBuffering(false); };
    const onWaiting = () => setIsBuffering(true);
    const onStalled = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onError = () => {
      console.error('Video element error:', v.error);
      setVideoError(true);
      setIsBuffering(false);
    };

    v.addEventListener('timeupdate', onTU);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('stalled', onStalled);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('error', onError);
    return () => {
      v.removeEventListener('timeupdate', onTU);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('stalled', onStalled);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [short.id]);

  /* Double tap to like */
  const lastTapRef = useRef(0);
  const handleVideoTap = (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const heartId = Date.now();
      setFloatingHearts((prev) => [...prev.slice(-5), { id: heartId, x, y }]);
      setTimeout(() => {
        setFloatingHearts((prev) => prev.filter((h) => h.id !== heartId));
      }, 900);
      if (!liked) toggleLike();
    } else {
      togglePlay();
    }
    lastTapRef.current = now;
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setShowControls(true);
    if (v.paused) {
      try {
        const result = v.play();
        if (result instanceof Promise) {
          result.then(() => setPaused(false)).catch((err: any) => {
            if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
              console.error('Video play error:', err);
              setVideoError(true);
            }
            setPaused(true);
          });
        } else {
          setPaused(false);
        }
      } catch (e) {
        console.error('Play error:', e);
        setPaused(true);
      }
    } else {
      try { v.pause(); } catch { /* noop */ }
      setPaused(true);
    }
  };

  const handleBookmarkToggle = () => toggleBookmark();

  const totalLikes = likeCount;
  const totalComments = comments.length;
  const handle = short.channel.replace(/^@/, '');

  return (
    <section
      data-short-slide
      className="relative h-[100dvh] w-full shrink-0 snap-start snap-always overflow-hidden bg-black select-none"
      onClick={handleVideoTap}
    >
      {/* Video layer - z-0, full-bleed */}
      <video
        ref={videoRef}
        src={short.src}
        className="absolute inset-0 z-0 h-full w-full object-cover object-center"
        loop
        muted={muted}
        playsInline
        preload="metadata"
        controls={false}
        disablePictureInPicture
        poster={undefined}
        // iOS/Android inline playback attributes
        webkit-playsinline="true"
        x5-playsinline="true"
        x5-video-player-type="h5"
        onError={(e) => {
          console.error('Video source error for:', short.src, e);
          setVideoError(true);
          setIsBuffering(false);
        }}
        onLoadStart={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onLoadedData={() => setIsBuffering(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
      />

      {/* Gradient overlays - z-10 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[120px] bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[200px] bg-gradient-to-t from-black/65 via-black/30 to-transparent" />

      {/* Loading indicator - z-20 */}
      {isBuffering && active && !videoError && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <span className="text-[11px] font-medium text-white/70">Buffering…</span>
          </div>
        </div>
      )}

      {/* Error state - z-20 */}
      {videoError && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/60">
          <div className="flex flex-col items-center gap-2 px-8 text-center">
            <VideoIcon className="h-9 w-9 text-white/70" />
            <p className="text-xs font-semibold text-white/80">Video unavailable</p>
            <p className="text-[10px] text-white/50">Scroll to the next short</p>
          </div>
        </div>
      )}

      {/* Double-tap heart particles - z-30 */}
      <AnimatePresence>
        {floatingHearts.map((h) => (
          <motion.div
            key={h.id}
            initial={{ opacity: 1, scale: 0.35, y: 0, rotate: -12 }}
            animate={{ opacity: 0, scale: 1.7, y: -130, rotate: 10 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="pointer-events-none absolute z-30"
            style={{ left: h.x - 26, top: h.y - 26 }}
          >
            <Heart className="h-13 w-13 fill-[#FE2C55] text-[#FE2C55] drop-shadow-[0_4px_12px_rgba(254,44,85,0.5)]" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Top bar - z-20, transparent with scrim only */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-center px-4"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        {/* Following / For You tabs */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => {}}
            className="relative py-1.5 text-sm font-semibold text-white/60 transition-colors hover:text-white"
          >
            Following
          </button>
          <button
            type="button"
            onClick={() => {}}
            className="relative py-1.5 text-sm font-semibold text-white transition-colors"
          >
            For You
            <span className="absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-white" />
          </button>
        </div>

        {/* Profile avatar pinned right */}
        <div className="absolute right-3 top-3">
          <Link
            to="/profile/$handle"
            params={{ handle }}
            onClick={(e) => e.stopPropagation()}
            className="block h-9 w-9 overflow-hidden rounded-full border-2 border-white/70 bg-transparent drop-shadow-lg transition-transform hover:scale-105"
          >
            {short.avatar ? (
              <img src={short.avatar} alt={handle} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-zinc-800 text-sm font-bold text-white">
                {handle[0]?.toUpperCase()}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Play / pause indicator - z-20, centered 64px */}
      <AnimatePresence>
        {paused && !videoError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
          >
            <div className="grid h-16 w-16 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
              <Play className="h-8 w-8 translate-x-[1px] fill-white text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right action rail - z-20 */}
      <div
        className={`absolute right-2 z-20 responsive-rail-gap flex max-h-[calc(100dvh-200px)] flex-col items-center overflow-hidden transition-opacity duration-300 ${
          showControls || paused ? 'opacity-100' : 'opacity-90'
        }`}
        style={{ 
          bottom: RAIL_BOTTOM, 
          top: RAIL_TOP_OFFSET, 
          gap: '20px' 
        }}
      >
        {/* Profile + follow button */}
        <div className="relative flex flex-col items-center gap-1">
          <Link
            to="/profile/$handle"
            params={{ handle }}
            onClick={(e) => e.stopPropagation()}
            className="block h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-white/70 bg-transparent drop-shadow-lg transition-transform hover:scale-105"
          >
            {short.avatar ? (
              <img src={short.avatar} alt={handle} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-zinc-800 text-sm font-bold text-white">
                {handle[0]?.toUpperCase()}
              </span>
            )}
          </Link>
          {creatorId && currentUserId !== creatorId && !followed && (
            <button
              type="button"
              aria-label="Follow creator"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!creatorId) return;
                toggleFollow();
              }}
              className="absolute -bottom-1.5 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-r from-[#FE2C55] to-[#25F4EE] text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
            </button>
          )}
        </div>

        {/* Like */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleLike(); }}
          className="group flex flex-col items-center gap-1 bg-transparent transition-transform active:scale-90"
          aria-label="Like"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <span className="relative grid place-items-center">
            <Heart
              className={`h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-colors ${
                liked ? 'fill-[#FE2C55] text-[#FE2C55]' : 'text-white'
              }`}
            />
            {liked && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0.7 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="pointer-events-none absolute inset-0 rounded-full bg-[#FE2C55]/40 blur-md"
              />
            )}
          </span>
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {formatCount(totalLikes)}
          </span>
        </button>

        {/* Comments */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenComments(); }}
          className="group flex flex-col items-center gap-1 bg-transparent transition-transform active:scale-90"
          aria-label="Comments"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <MessageCircle className="h-7 w-7 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {formatCount(totalComments)}
          </span>
        </button>

        {/* Save */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleBookmarkToggle(); }}
          className="group relative flex flex-col items-center gap-1 bg-transparent transition-transform active:scale-90"
          aria-label="Save"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <span className="relative grid place-items-center">
            <Bookmark
              className={`h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-colors ${
                bookmarked ? 'fill-[#FFC107] text-[#FFC107]' : 'text-white'
              }`}
            />
            {bookmarked && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0.7 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="pointer-events-none absolute inset-0 rounded-full bg-[#FFC107]/40 blur-md"
              />
            )}
          </span>
          <span className="text-[11px] font-semibold text-white drop-shadow leading-none">
            {formatCount(bookmarkCount)}
          </span>
        </button>

        {/* Share - stacked icon-above-label */}
        <div className="flex flex-col items-center gap-1" style={{ minWidth: '44px', minHeight: '44px' }}>
          <ShareButton
            shortId={short.id}
            title={short.title}
            onShareClick={() => { void recordShare(short.id, 'link'); }}
            variant="pronax"
            shareCount={short.shares}
            formatCount={formatCount}
          />
        </div>

        {/* Spinning audio disc / mute toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className="animate-spin-slow relative h-10 w-10 overflow-hidden rounded-full border-2 border-white/40 bg-transparent drop-shadow-lg"
          aria-label={muted ? 'Unmute' : 'Mute'}
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          {short.avatar ? (
            <img src={short.avatar} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-zinc-800 text-white">
              <Music2 className="h-4 w-4" />
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/45">
            {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white/80" />}
          </span>
        </button>
      </div>

      {/* Bottom caption block - z-20 */}
      <div
        className="absolute bottom-0 left-0 z-20 flex flex-col gap-2 overflow-hidden"
        style={{
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          paddingLeft: '12px',
          width: CAPTION_MAX_WIDTH,
          maxWidth: '78%'
        }}
      >
        {/* Username row */}
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/profile/$handle"
            params={{ handle }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            <span className="block h-8 w-8 overflow-hidden rounded-full border border-white/40">
              {short.avatar ? (
                <img src={short.avatar} alt={handle} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-zinc-800 text-[11px] font-bold text-white">
                  {handle[0]?.toUpperCase()}
                </span>
              )}
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-sm font-bold text-white drop-shadow">
                @{handle}
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#25F4EE]" />
            </span>

            {creatorId && currentUserId !== creatorId && !followed ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!creatorId) return;
                  toggleFollow();
                }}
                className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-black transition active:scale-95"
              >
                Follow
              </button>
            ) : followed ? (
              <span className="shrink-0 rounded-full border border-white/40 px-2.5 py-0.5 text-[10px] font-semibold text-white/90">
                Following
              </span>
            ) : null}
          </div>
        </div>

        {/* Title */}
        {short.title && (
          <p 
            className="line-clamp-2 font-semibold leading-snug text-white drop-shadow"
            style={{ fontSize: 'clamp(12px, 2.5vh, 13px)' }}
          >
            {short.title}
          </p>
        )}

        {/* Description with cyan hashtags */}
        {short.description && (
          <p 
            className="line-clamp-2 leading-snug text-white/90 drop-shadow"
            style={{ fontSize: 'clamp(11px, 2.5vh, 12px)' }}
          >
            {short.description.split(' ').map((word, i) =>
              word.startsWith('#') ? (
                <span key={i} className="font-semibold text-[#25F4EE]">
                  {word}{' '}
                </span>
              ) : (
                <span key={i}>{word} </span>
              )
            )}
          </p>
        )}

        {/* Audio pill - single line truncate */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenSound(); }}
          className="flex w-full items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-black/40 px-2.5 py-1.5 backdrop-blur-md"
        >
          <Music2 className="h-3 w-3 shrink-0 text-white" />
          <span 
            className="truncate font-semibold text-white/90"
            style={{ fontSize: 'clamp(10px, 2.5vh, 11px)' }}
          >
            🎵 {short.music}
          </span>
        </button>
      </div>

      {/* Progress bar - z-20, at bottom */}
      <div className="absolute inset-x-0 z-20 h-[3px] bg-white/20" style={{ bottom: SAFE_B }}>
        <div
          className="h-full bg-white transition-[width] duration-150 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CommentsSheet                                                      */
/* ------------------------------------------------------------------ */

function CommentsSheet({ short, onClose }: { short: Short | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const { comments, post } = useComments(short?.id ?? 'none', null);
  if (!short) return null;

  const submit = () => {
    if (!text.trim()) return;
    post(text);
    setText('');
  };

  return (
    <Sheet open={!!short} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="flex h-[78dvh] flex-col rounded-t-2xl border-zinc-800 bg-black p-0 text-white"
        style={{ paddingBottom: SAFE_B }}
      >
        <SheetHeader className="border-b border-zinc-800 px-4 py-3 text-left">
          <SheetTitle className="text-sm font-bold text-white">
            {comments.length} Comments
          </SheetTitle>
          <SheetDescription className="truncate text-xs text-zinc-400">
            {short.title}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {comments.length === 0 && (
            <div className="flex flex-col items-center gap-2 pt-12 text-center">
              <Sparkles className="h-6 w-6 text-zinc-500" />
              <p className="text-xs text-zinc-500">
                No comments yet. Be the first to start the conversation!
              </p>
            </div>
          )}

          {comments.map((c: any) => (
            <div key={c.id} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-xs font-bold text-white">
                {(c.author?.display_name || c.author?.email || '?')[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-zinc-400">
                  {c.author?.display_name || c.author?.email || 'user'} ·{' '}
                  {new Date(c.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="break-words text-xs text-white">{c.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800 px-4 pt-3 pb-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Add comment..."
            maxLength={1000}
            className="flex-1 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#FE2C55] focus:outline-none"
          />
          <Button
            onClick={submit}
            className="rounded-full bg-[#FE2C55] px-4 font-bold text-white hover:bg-[#e02447]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Shorts page                                                        */
/* ------------------------------------------------------------------ */

export function AppShell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'following' | 'fyp'>('fyp');
  const [commentsFor, setCommentsFor] = useState<Short | null>(null);
  const [liveShorts, setLiveShorts] = useState<Short[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  /* Inject responsive CSS for small viewports */
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media (max-height: 600px) {
        .responsive-rail-gap { gap: 16px !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /* Unlock autoplay after first interaction */
  useEffect(() => {
    const handleInteraction = () => setHasInteracted(true);
    const events = ['click', 'touchstart', 'keydown', 'scroll'];
    events.forEach((event) =>
      document.addEventListener(event, handleInteraction, { once: true })
    );
    return () => {
      events.forEach((event) => document.removeEventListener(event, handleInteraction));
    };
  }, []);

  /* MOBILE FIX #7 — page scroll lock; warna address-bar resize par jhatka lagta hai */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  /* Fetch feed */
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        let rows: any[] | null = null;

        const { data: ranked, error: rankedErr } = await supabase.rpc('get_shorts_feed', {
          p_limit: 30,
          p_offset: 0,
        });
        if (!rankedErr && ranked?.length) rows = ranked;

        if (!rows) {
          const { data } = await supabase
            .from('videos')
            .select('id,title,description,video_url,thumb_url,owner_id,tags,views_count')
            .eq('is_short', true)
            .eq('is_removed', false)
            .eq('is_shadow_banned', false)
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(20);
          rows = data ?? [];
        }

        if (!rows.length) {
          setIsLoading(false);
          return;
        }

        const ownerIds = Array.from(new Set(rows.map((v: any) => v.owner_id).filter(Boolean)));
        const videoIds = rows.map((v: any) => v.id);
        const profileMap = new Map<string, any>();
        const likesMap = new Map<string, number>();

        if (ownerIds.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id,display_name,avatar_url,handle')
            .in('id', ownerIds);
          (profs ?? []).forEach((p: any) => profileMap.set(p.id, p));
        }

        if (videoIds.length) {
          const { data: likes } = await supabase
            .from('video_likes')
            .select('video_id')
            .in('video_id', videoIds);
          (likes ?? []).forEach((r: any) => {
            likesMap.set(r.video_id, (likesMap.get(r.video_id) ?? 0) + 1);
          });
        }

        const mapped: Short[] = rows
          .filter((v: any) => v.video_url && typeof v.video_url === 'string' && v.video_url.startsWith('http'))
          .map((v: any) => {
            const prof = profileMap.get(v.owner_id) || {};
            const channelHandle = prof.handle || prof.display_name || 'creator';

            // Fix URL encoding for special characters in filenames
            const parts = String(v.video_url).split('/');
            const encodedVideoUrl = parts
              .map((part, index) => (index === parts.length - 1 ? part.replace(/#/g, '%23') : part))
              .join('/');

            return {
              id: v.id,
              src: encodedVideoUrl,
              title: v.title,
              channel: '@' + channelHandle,
              avatar: prof.avatar_url,
              description: v.description || '',
              likes: likesMap.get(v.id) ?? 0,
              comments: 0,
              shares: 0,
              music: 'Original Sound — ' + (prof.display_name || 'creator'),
              owner_id: v.owner_id,
              tags: Array.isArray(v.tags) ? v.tags : [],
              views_count: v.views_count || 0,
            } as Short;
          });

        setLiveShorts(rankShortsByProNaxFYP(mapped));
      } catch {
        /* silent */
      }
      setIsLoading(false);
    })();
  }, []);

  const allShorts: Short[] = useMemo(() => liveShorts, [liveShorts]);

  const feedItems: FeedItem[] = useMemo(() => {
    const out: FeedItem[] = [];
    allShorts.forEach((s, i) => {
      out.push({ kind: 'short', short: s });
      if ((i + 1) % AD_EVERY_N_SHORTS === 0) {
        out.push({ kind: 'ad', attributeShortId: s.id, key: `ad-${i}-${s.id}` });
      }
    });
    return out;
  }, [allShorts]);

  /* Active slide detection */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll('[data-short-item]'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIdx(Number(entry.target.getAttribute('data-idx')));
          }
        });
      },
      { root: el, threshold: [0.6] }
    );
    items.forEach((it) => observer.observe(it));
    return () => observer.disconnect();
  }, [feedItems.length]);

  return (
    <div className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden bg-black text-white">
      {/* Mobile: full width, Desktop: centered with max width and rounded corners */}
      <div className="relative h-full w-full max-w-[420px] overflow-hidden bg-black sm:my-4 sm:h-[calc(100dvh-2rem)] sm:rounded-xl">

        {/* Snap-mandatory vertical scroller */}
        <div
          ref={containerRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Loading */}
          {isLoading && (
            <div className="grid h-[100dvh] w-full place-items-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <p className="text-xs text-white/60">Loading...</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && allShorts.length === 0 && (
            <div className="grid h-[100dvh] w-full place-items-center px-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/5">
                  <VideoIcon className="h-7 w-7 text-white/80" />
                </span>
                <h1 className="text-base font-bold text-white">No Shorts on FYP</h1>
                <p className="max-w-[16rem] text-xs text-white/60">
                  Upload a vertical short video to start the ProNax Viral Cohort.
                </p>
                <Button
                  onClick={() => navigate({ to: '/upload' })}
                  className="mt-1 rounded-full bg-[#FE2C55] px-5 font-bold text-white hover:bg-[#e02447]"
                >
                  Upload First Short
                </Button>
              </div>
            </div>
          )}

          {/* Feed */}
          {feedItems.map((item, i) => (
            <div
              key={item.kind === 'short' ? item.short.id : item.key}
              data-short-item
              data-idx={i}
              className="h-[100dvh] w-full snap-start snap-always"
            >
              {item.kind === 'short' ? (
                <ShortItem
                  short={item.short}
                  active={activeIdx === i}
                  muted={muted}
                  hasInteracted={hasInteracted}
                  onOpenSound={() => navigate({ to: '/sound/$id', params: { id: item.short.id } })}
                  onOpenComments={() => setCommentsFor(item.short)}
                  onToggleMute={() => setMuted((m) => !m)}
                />
              ) : (
                <ShortsAdSlide
                  attributeToVideoId={item.attributeShortId}
                  active={activeIdx === i}
                  onAdFinished={() => {
                    const el = containerRef.current;
                    if (!el) return;
                    const next = el.querySelector(`[data-idx="${i + 1}"]`);
                    next?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <CommentsSheet short={commentsFor} onClose={() => setCommentsFor(null)} />
      </div>
    </div>
  );
}
