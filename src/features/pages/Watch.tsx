/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useParams, useNavigate } from '@/lib/router-compat';
import { VideoPlayer } from '@/components/VideoPlayer';
import { FeedVideoCard } from '@/components/FeedVideoCard';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ThumbsUp, ThumbsDown, Share2, Download, Bookmark, MoreHorizontal,
  ChevronDown, X, Copy, Check, Send, Facebook, Twitter, MessageCircle, Link2,
  ArrowUpDown, Pin, Flame, Clock, Flag,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/loose';
import { Link } from '@/lib/router-compat';
import { requestAdImpression } from '@/lib/adSdk';
import { ReportModal } from '@/components/ReportModal';
import { useLike, useSave, useComments, recordShare, recordDownload, recordView, useFollow } from '@/hooks/useInteractions';
import { analyticsBus } from '@/lib/analyticsBus';
import { Chapters } from '@/components/Chapters';
import { useCommentLikes } from '@/hooks/useCommentLikes';
import { AdSlot } from '@/components/AdSlot';
import { DynamicAdContainer } from '@/components/DynamicAdContainer';
import { InVideoAdOverlay } from '@/components/InVideoAdOverlay';
import { useVastPreRoll } from '@/hooks/useVastPreRoll';
import { EngineBoundary } from '@/components/EngineBoundary';
import { LiveWatcherBadge } from '@/components/LiveWatcherBadge';
import { useWatchHeartbeat } from '@/hooks/useWatchHeartbeat';



// Loading state for real videos
const loadingState = { 
  title: 'Loading...', 
  channel: 'Creator', 
  channelSubs: '0', 
  views: '0', 
  time: 'Just now', 
  description: 'Loading video details...' 
};

type SuggestedVideo = { id: string; title: string; channel: string; views: string; time: string; duration: string; monetized: boolean; thumbnail?: string; channelAvatar?: string; isShort?: boolean };
type DbVideoRow = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  thumb_url: string | null;
  owner_id: string | null;
  created_at: string;
  views_count: number | null;
  duration_seconds: number | null;
  is_short: boolean | null;
  category: string | null;
};


function fmtViews(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
function fmtTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000); if (m < 60) return `${Math.max(m,1)}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function fmtDur(s: number | null) {
  if (!s || s <= 0) return '';
  const m = Math.floor(s / 60); const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const videoId = id || '1';
  const [dbVideo, setDbVideo] = useState<DbVideoRow | null>(null);
  const [dbCreatorName, setDbCreatorName] = useState<string | null>(null);
  const [dbCreatorAvatar, setDbCreatorAvatar] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dbCreatorId, setDbCreatorId] = useState<string | null>(null);
  const [dbSubtitles, setDbSubtitles] = useState<{ label: string; language: string; src: string; kind?: 'subtitles' | 'captions'; default?: boolean }[]>([]);
  
  useEffect(() => {
    let cancelled = false;
    setDbVideo(null);
    setDbCreatorName(null);
    setDbCreatorAvatar(null);
    setDbCreatorId(null);
    setDbSubtitles([]);
    if (!isUuid(videoId)) return () => { cancelled = true; };
    (async () => {
      const { data: vrow } = await supabase
        .from('videos')
        .select('id,title,description,video_url,thumb_url,owner_id,created_at,views_count,duration_seconds,is_short,category')
        .eq('id', videoId as any)
        .maybeSingle();
      if (cancelled || !vrow) return;
      setDbVideo(vrow as DbVideoRow);
      
      // Redirect short videos to Shorts page
      if ((vrow as any).is_short) {
        navigate(`/shorts/${videoId}`, { replace: true });
        return;
      }
      if ((vrow as any).owner_id) {
        setDbCreatorId((vrow as any).owner_id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name,avatar_url')
          .eq('id', (vrow as any).owner_id)
          .maybeSingle();
        if (!cancelled) {
          setDbCreatorName((profile as any)?.display_name || null);
          setDbCreatorAvatar((profile as any)?.avatar_url || null);
          console.log('Creator profile loaded:', { name: (profile as any)?.display_name, avatar: (profile as any)?.avatar_url });
        }
      }
      
      // Load subtitles from database
      const { data: subtitleData } = await (supabase as any)
        .from('video_subtitles')
        .select('label,language,src,kind,is_default')
        .eq('video_id', videoId);
      
      if (!cancelled && subtitleData) {
        setDbSubtitles(subtitleData.map((sub: any) => ({
          label: sub.label,
          language: sub.language,
          src: sub.src,
          kind: sub.kind as 'subtitles' | 'captions',
          default: sub.is_default,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  // Realtime subscription for video views_count updates
  useEffect(() => {
    if (!isUuid(videoId)) return;
    const ch = supabase
      .channel(`video:${videoId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos', filter: `id=eq.${videoId}` }, (payload) => {
        console.log('Realtime update received:', payload);
        const updated = payload.new as DbVideoRow;
        setDbVideo(updated);
      })
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [videoId]);

  // Record view when video loads - direct call to analytics worker
  useEffect(() => {
    if (!isUuid(videoId)) return;
    console.log('Sending view impression for video:', videoId);
    // Send impression immediately when video page loads
    analyticsBus.impression(videoId, 'watch');
    
    // Also record an immediate view for better counting
    // This ensures views are counted even if user doesn't watch for 5 seconds
    (async () => {
      try {
        await recordView(videoId, 0);
      } catch (err) {
        console.error('Failed to record initial view:', err);
      }
    })();
  }, [videoId]);
  useWatchHeartbeat({ videoId: isUuid(videoId) ? videoId : null, isPlaying });
  const video = useMemo(() => {
    const viewsCount = dbVideo?.views_count;
    return {
      title: dbVideo?.title || loadingState.title,
      channel: dbCreatorName || loadingState.channel,
      channelSubs: loadingState.channelSubs,
      views: typeof viewsCount === 'number' ? fmtViews(viewsCount) : loadingState.views,
      time: dbVideo?.created_at ? fmtTimeAgo(dbVideo.created_at) : loadingState.time,
      description: dbVideo?.description || (dbVideo ? 'No description' : loadingState.description),
    };
  }, [dbVideo, dbCreatorName]);
  const videoSrc = dbVideo?.video_url ?? undefined;
  const posterSrc = dbVideo?.thumb_url ?? undefined;
  const initials = video.channel.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [suggestedVideos, setSuggestedVideos] = useState<SuggestedVideo[]>([]);
  const handleVideoEnded = () => {
    const next = suggestedVideos.find((v) => v.id !== videoId) ?? suggestedVideos[0];
    if (next) navigate(`/watch/${next.id}`);
  };
  const [showFullDesc, setShowFullDesc] = useState(false);

  // Debug follow button check - log once when values change
  useEffect(() => {
    console.log('Follow button check:', { userId: user?.id, dbCreatorId, isOwn: user?.id === dbCreatorId });
  }, [user?.id, dbCreatorId]);

  // Fetch user profile data for avatar in comments
  useEffect(() => {
    if (!user?.id) return;
    
    supabase.from('profiles').select('avatar_url, display_name').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (!error && data) {
        setUserAvatar(data.avatar_url ?? null);
        setUserDisplayName(data.display_name ?? null);
      } else {
        // Fallback to auth metadata
        setUserAvatar(user.user_metadata?.avatar_url ?? null);
        setUserDisplayName(user.user_metadata?.display_name ?? null);
      }
    });
  }, [user?.id]);

  // Related videos engine — tags + category + co-watch signals
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_related_videos', { p_video: videoId, p_limit: 12 });
        if (cancelled || error || !Array.isArray(data) || data.length === 0) return;
        const ownerIds = Array.from(new Set(data.map((r: any) => r.owner_id).filter(Boolean)));
        const relatedIds = data.map((r: any) => r.id).filter(Boolean);
        const [{ data: profs }, { data: videoKinds }] = await Promise.all([
          supabase.from('profiles').select('id,display_name,avatar_url').in('id', ownerIds),
          supabase.from('videos').select('id,is_short').in('id', relatedIds),
        ]);
        const nameMap = new Map<string, string>((profs ?? []).map((p: any) => [p.id, p.display_name || 'Creator']));
        const avatarMap = new Map<string, string | null>((profs ?? []).map((p: any) => [p.id, p.avatar_url]));
        const shortIds = new Set((videoKinds ?? []).filter((v: any) => v.is_short).map((v: any) => String(v.id)));
        setSuggestedVideos(data.map((r: any) => ({
          id: String(r.id),
          title: r.title,
          channel: nameMap.get(r.owner_id) || 'Creator',
          channelAvatar: avatarMap.get(r.owner_id) || undefined,
          views: fmtViews(Number(r.views_count) || 0),
          time: fmtTimeAgo(r.created_at),
          duration: fmtDur(r.duration_seconds) || '0:00',
          monetized: true,
          thumbnail: r.thumb_url,
          isShort: shortIds.has(String(r.id)),
        })));
      } catch { /* keep fallback */ }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  // Real-time backend hooks (creator-aware for notifications)
  const { liked, count: likes, toggle: toggleLike } = useLike(videoId, dbCreatorId);
  const { saved, toggle: toggleSave } = useSave(videoId);
  const { comments: dbComments, post: postDbComment } = useComments(videoId, dbCreatorId);
  const { following: followed, followers: followerCount, toggle: toggleFollow } = useFollow(dbCreatorId);

  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Local UI-only state for comment like animation (per-session)
  const [commentLikes, setCommentLikes] = useState<Record<string, { liked: boolean; disliked: boolean }>>({});
  const [newComment, setNewComment] = useState('');
  const [commentFocused, setCommentFocused] = useState(false);
  const [commentsExpandedMobile, setCommentsExpandedMobile] = useState(false);
  const [sortBy, setSortBy] = useState<'top' | 'newest'>('newest');
  const [theater, setTheater] = useState(false);

  // View count trigger fires once user has actively watched ≥ 5s (from player).
  const handleWatchThreshold = async () => {
    // Optimistic UI update - increment view count immediately
    setDbVideo(prev => prev ? { ...prev, views_count: (prev.views_count || 0) + 1 } : null);
    
    // Record the view in database
    await recordView(videoId, 5);
    supabase.rpc('record_watch_history', { p_video: videoId, p_watch_seconds: 5 });
  };


  // ---------- Report Video ----------
  const [reportOpen, setReportOpen] = useState(false);

  // ---------- Pre-roll Ad (DB-driven via pick_ad_for_video + settle_ad_impression) ----------
  const FALLBACK_AD_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  const AD_LENGTH = 10;

  const [adActive, setAdActive] = useState(false);
  const vastPreRoll = useVastPreRoll();
  const [adRemaining, setAdRemaining] = useState(AD_LENGTH);
  const [adRewarded, setAdRewarded] = useState(false);
  const [pickedAd, setPickedAd] = useState<{ id: string; ad_video_url: string; min_watch_seconds: number } | null>(null);

  // Pick a DB ad for this video on mount / video change
  useEffect(() => {
    let cancelled = false;
    setAdActive(false);
    setAdRewarded(false);
    setPickedAd(null);
    (async () => {
      const { data, error } = await supabase.rpc('pick_ad_for_video', { p_video: videoId });
      if (cancelled) return;
      const ad = (data ?? null) as { id?: string; ad_video_url?: string; min_watch_seconds?: number } | null;
      if (!error && ad && ad.id) {
        setPickedAd({
          id: ad.id,
          ad_video_url: ad.ad_video_url || FALLBACK_AD_URL,
          min_watch_seconds: ad.min_watch_seconds ?? AD_LENGTH,
        });
        setAdRemaining(ad.min_watch_seconds ?? AD_LENGTH);
        setAdActive(true);
      } else {
        setAdRemaining(0);
      }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  useEffect(() => {
    if (!adActive) return;
    if (adRemaining <= 0) return;
    const t = setTimeout(() => setAdRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [adActive, adRemaining]);

  const completeAd = async () => {
    if (adRewarded) {
      setAdActive(false);
      return;
    }
    setAdRewarded(true);
    setAdActive(false);
    const completed = adRemaining <= 0;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: 'Sign in to earn', description: 'Ad completed — sign in to credit the creator wallet.' });
      return;
    }

    // Preferred path: DB-picked ad → settle_ad_impression (70/30 split, ledger, budget)
    if (pickedAd && pickedAd.id) {
      console.log('[ad] Calling settle_ad_impression with:', {
        p_ad_id: pickedAd.id,
        p_video_id: videoId,
        p_creator_id: dbCreatorId,
        p_completed: completed,
      });
      const { data, error } = await supabase.rpc('settle_ad_impression', {
        p_ad_id: pickedAd.id,
        p_video_id: videoId,
        p_creator_id: dbCreatorId ?? '00000000-0000-0000-0000-000000000000',
        p_completed: completed,
      });
      if (error) {
        console.warn('[ad] settle_ad_impression failed', error);
      } else {
        const r = data as { settled?: boolean; creator_share?: number; reason?: string } | null;
        if (r?.settled) {
          toast({
            title: `+$${(r.creator_share ?? 0).toFixed(4)} to creator 💰`,
            description: 'Video ad completed — 55% Creator / 45% Platform split.',
          });
          return;
        }
      }
    }

    // Fallback path: legacy ad SDK impression → record_ad_view (60/40 network flow)
    const impression = await requestAdImpression({
      videoId,
      placementType: 'long_form',
      isShort: false,
      category: dbVideo?.category || undefined,
    });
    if (!impression.filled) {
      toast({ title: 'Ad slot unfilled', description: 'No live ad served this round.' });
      return;
    }
    const { data, error } = await supabase.rpc('record_ad_view_by_placement', {
      p_video_id: videoId,
      p_ad_revenue: impression.revenue,
      p_ad_network: impression.network,
      p_cpm: impression.adjustedCpm || impression.cpm,
      p_country_code: impression.countryCode || null,
      p_country_name: impression.countryName || null,
      p_country_tier: impression.countryTier || null,
      p_placement_type: 'long_form',
      p_category: impression.category || null,
      p_category_multiplier: impression.categoryMultiplier || null,
      p_category_tier: impression.categoryTier || null,
    });
    if (error) {
      toast({ title: 'Reward failed', description: error.message, variant: 'destructive' });
      return;
    }
    const result = data as { paid?: boolean; reason?: string; creator_share?: number } | null;
    if (result?.paid) {
      toast({
        title: `+$${(result.creator_share ?? 0).toFixed(6)} credited 💰`,
        description: `Live ${impression.network.replace('_', ' ')} ad · CPM $${impression.cpm.toFixed(2)}${impression.countryName ? ` · ${impression.countryName}` : ''}.`,
      });
    } else if (result?.reason === 'daily_cap_reached') {
      toast({ title: 'Daily view cap reached', description: 'Max 3 paid views per video per 24h.' });
    }
  };

  // NOTE: Ad does NOT auto-skip. After countdown reaches 0, user must click
  // the manual "Skip Ad" button (which calls completeAd) to resume the video.

  // Map DB comments into the existing UI shape
  type UiComment = {
    id: string; user: string; userHandle: string; userId: string; avatarUrl: string | null;
    verified: boolean; time: string; text: string;
    likes: number; liked: boolean; disliked: boolean; pinned?: boolean;
    parent_id: string | null;
  };
  const commentIds = useMemo(() => dbComments.map((c) => c.id), [dbComments]);
  const { likes: commentLikeMap, toggle: toggleServerCommentLike } = useCommentLikes(commentIds);
  const uiComments: UiComment[] = useMemo(() => dbComments.map((c) => {
    const local = commentLikes[c.id] ?? { liked: false, disliked: false };
    const serverLike = commentLikeMap[c.id] ?? { count: 0, liked: false };
    const name = c.author?.display_name || (c.author?.email?.split('@')[0]) || 'User';
    const handle = c.author?.handle
      || (c.author?.display_name || c.author?.email?.split('@')[0] || 'user').replace(/\s+/g, '').toLowerCase();
    return {
      id: c.id,
      user: name,
      userHandle: handle,
      userId: c.user_id,
      avatarUrl: c.author?.avatar_url ?? null,
      verified: Boolean(c.author?.verified),
      time: new Date(c.created_at).toLocaleString(),
      text: c.text,
      likes: serverLike.count,
      liked: serverLike.liked,
      disliked: local.disliked,
      parent_id: (c as any).parent_id ?? null,
    };
  }), [dbComments, commentLikes, commentLikeMap]);


  const topComments = useMemo(() => uiComments.filter((c) => !c.parent_id), [uiComments]);
  const repliesByParent = useMemo(() => {
    const map: Record<string, UiComment[]> = {};
    uiComments.forEach((c) => {
      const pid = c.parent_id;
      if (pid) (map[pid] ||= []).push(c);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }, [uiComments]);

  const sortedComments = useMemo(() => {
    const arr = [...topComments];
    if (sortBy === 'top') arr.sort((a, b) => b.likes - a.likes);
    return arr;
  }, [topComments, sortBy]);

  // Comment pagination — avoid DOM lag on popular videos
  const COMMENT_PAGE_SIZE = 20;
  const [visibleComments, setVisibleComments] = useState(COMMENT_PAGE_SIZE);
  useEffect(() => { setVisibleComments(COMMENT_PAGE_SIZE); }, [videoId, sortBy]);
  const visibleSorted = useMemo(() => sortedComments.slice(0, visibleComments), [sortedComments, visibleComments]);


  const handleLike = () => toggleLike();

  const handleDownload = async () => {
    // Log to DB (rate-limited 5/day)
    const { data } = await recordDownload(videoId);
    if ((data as any)?.reason === 'rate_limited') {
      toast({ title: 'Download limit reached', description: 'Max 5 downloads per video per day.' });
      return;
    }
    const fileUrl = 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4';
    const fileName = `${video.title.replace(/[^a-z0-9]+/gi, '_')}.mp4`;
    fetch(fileUrl, { mode: 'cors' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast({ title: 'Download complete' });
      })
      .catch(() => {
        window.open(fileUrl, '_blank', 'noopener,noreferrer');
        toast({ title: 'Saving video', description: 'Long-press kar ke "Save to Gallery" choose karein.' });
      });
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      await recordShare(videoId, 'copy_link');
      toast({ title: 'Link copied' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handlePostComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    await postDbComment(text);
    setNewComment('');
    setCommentFocused(false);
  };

  // Reply state (1-level deep)
  const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const handlePostReply = async (parentId: string) => {
    const text = (replyText[parentId] ?? '').trim();
    if (!text) return;
    await postDbComment(text, parentId);
    setReplyText((m) => ({ ...m, [parentId]: '' }));
    setReplyOpen((m) => ({ ...m, [parentId]: false }));
  };

  const toggleCommentLike = (id: string) => { toggleServerCommentLike(id); };
  const toggleCommentDislike = (id: string) => {
    setCommentLikes((m) => ({ ...m, [id]: { liked: false, disliked: !(m[id]?.disliked) } }));
  };


  const formatLikes = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <div className="shrink-0 min-h-0 md:h-[calc(100dvh-3.25rem)] md:max-h-[calc(100dvh-3.25rem)] md:overflow-hidden flex flex-col bg-background px-0">
      <div className={theater ? 'w-full h-full min-h-0 overflow-y-auto scrollbar-thin max-w-[1700px] mx-auto px-0 py-0' : 'w-full md:h-full min-h-0 max-w-[1600px] mx-auto px-0 lg:px-2 py-0 md:grid md:grid-cols-12 md:gap-6 md:items-stretch md:overflow-hidden'}>
        {/* ============= Left Column: Video + Info + Comments (Independent Scroll Panel) ============= */}
        <div className="min-w-0 min-h-0 flex flex-col md:col-span-8 lg:col-span-8 md:h-full md:overflow-y-auto overscroll-contain pr-0 md:pr-2 scrollbar-thin space-y-0 md:space-y-3.5 scroll-gpu">


          {/* Video Player — Sticky on mobile for seamless comment scrolling, relative on desktop */}
          <div className="relative md:rounded-2xl overflow-hidden bg-black aspect-video w-full max-h-[56.25vw] md:max-h-[580px] shrink-0 shadow-2xl sticky top-0 z-30 md:relative">


            {/* Live watching badge — inside the player, top-right corner */}
            <div className="absolute top-2 right-2 z-20 pointer-events-none">
              <LiveWatcherBadge videoId={videoId} baseViewsCount={Number(dbVideo?.views_count || 500)} variant="3d-overlay" showText={false} />
            </div>


            <VideoPlayer
              title={video.title}
              videoId={videoId}
              src={videoSrc}
              poster={posterSrc}
              adVideoSrc={adActive ? (vastPreRoll.adVideoSrc ?? pickedAd?.ad_video_url ?? FALLBACK_AD_URL) : undefined}
              adSkipAvailable={adRemaining <= 0}
              adCountdown={adRemaining}
              onAdEnded={completeAd}
              onAdSkip={completeAd}
              theater={theater}
              onTheaterToggle={() => setTheater((v) => !v)}
              onWatchThreshold={handleWatchThreshold}
              onPlaybackChange={setIsPlaying}
              watchThreshold={5}
              onVideoEnded={handleVideoEnded}
              onWatchProgress={(seconds) => {
                supabase.rpc('record_watch_history', { p_video: videoId, p_watch_seconds: Math.round(seconds) });
              }}
              subtitles={dbSubtitles.length > 0 ? dbSubtitles : [{
                label: 'English',
                language: 'en',
                src: `data:text/vtt;charset=utf-8,${encodeURIComponent('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nWelcome to this video\n\n00:00:03.500 --> 00:00:06.000\nThis is a sample subtitle\n\n00:00:06.500 --> 00:00:09.000\nFor testing purposes')}`,
                kind: 'subtitles',
                default: true
              }]}
            />




            {/* Bottom-center banner ad rendered over the player */}
            <EngineBoundary name="in-video-ad" silent>
              <InVideoAdOverlay paused={adActive} />
            </EngineBoundary>

            <AnimatePresence>

              {!adActive && adRewarded && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-md bg-green-500/90 text-white text-[11px] font-semibold shadow-lg flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> +$0.001 earned
                  <Link to="/wallet" className="ml-2 underline">Wallet →</Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <EngineBoundary name="ad-in-stream" silent>
            <DynamicAdContainer placement="in_stream" className="v3d-stage group relative w-full px-2 pt-2 md:px-0" />
          </EngineBoundary>

          <EngineBoundary name="ad-below-player" silent>
            <AdSlot slot="watch_below_player" />
          </EngineBoundary>

          {/* Video Details, Actions, Channel & Comments Content */}
          <div className="px-3 md:px-0 py-2 md:py-3 space-y-2 md:space-y-3">
            {/* Title + inline meta/description (tap to expand) */}
            <div className="cursor-pointer" onClick={() => setShowFullDesc(!showFullDesc)}>
              <h1 className={`text-[16px] sm:text-lg font-bold text-white leading-snug ${showFullDesc ? '' : 'line-clamp-2'}`}>
                {video.title}
              </h1>
              <div className="mt-1 flex items-center gap-x-1.5 text-[12px] text-white/60 font-medium overflow-hidden">
                <span className="shrink-0">@{video.channel.replace(/\s+/g, '')}</span>
                <span className="shrink-0">{Number(dbVideo?.views_count || 0).toLocaleString()} views</span>
                <span className="shrink-0">{video.time}</span>
                {!showFullDesc && (
                  <span className="truncate text-white/50">{video.description}</span>
                )}
                <span className="shrink-0 text-white font-semibold">{showFullDesc ? 'Show less' : '...more'}</span>
              </div>
              {showFullDesc && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <LiveWatcherBadge videoId={videoId} baseViewsCount={Number(dbVideo?.views_count || 500)} variant="inline" />
                    <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold border border-green-500/20">
                      Monetized
                    </span>
                  </div>
                  <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap">{video.description}</p>
                </div>
              )}
            </div>

            {/* Channel + action icons in one scrollable row */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 md:mx-0 md:px-0">
              <Link
                to={dbCreatorId ? `/profile/${dbCreatorId}` : '/profile'}
                className="shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-display font-bold text-foreground overflow-hidden"
                aria-label={`@${video.channel}`}
              >
                {dbCreatorAvatar ? (
                  <img src={dbCreatorAvatar} alt="Creator avatar" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </Link>

              {(() => {
                const isOwnVideo = Boolean(
                  user?.id &&
                  (dbVideo?.owner_id || dbCreatorId) &&
                  (String(user.id) === String(dbVideo?.owner_id) || String(user.id) === String(dbCreatorId))
                );
                if (isOwnVideo) {
                  return (
                    <Link
                      to={`/studio`}
                      className="shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black hover:bg-white/90 transition-all"
                    >
                      Edit Video
                    </Link>
                  );
                }
                return (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (!dbCreatorId) { toast({ title: 'Creator not found', description: 'Cannot follow this channel yet.', variant: 'destructive' }); return; }
                      toggleFollow();
                      toast({ title: followed ? 'Unfollowed' : `Following ${video.channel}` });
                    }}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${
                      followed
                        ? 'bg-white/10 text-white border border-white/20'
                        : 'bg-white text-black'
                    }`}
                  >
                    {followed ? 'Following' : 'Follow'}
                  </motion.button>
                );
              })()}

              <div className="flex items-center gap-1 ml-auto shrink-0">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleLike}
                  aria-label="Like"
                  className={`h-9 px-2.5 rounded-full hover:bg-white/10 flex items-center gap-1 text-[12px] ${liked ? 'text-white' : 'text-white/80'}`}
                >
                  <ThumbsUp className={`w-5 h-5 ${liked ? 'fill-white' : ''}`} />
                  {formatLikes(likes)}
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShareOpen(true)}
                  aria-label="Share"
                  className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white/80"
                >
                  <Share2 className="w-5 h-5" />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleSave}
                  aria-label={saved ? 'Saved' : 'Save'}
                  className={`h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center ${saved ? 'text-white' : 'text-white/80'}`}
                >
                  <Bookmark className={`w-5 h-5 ${saved ? 'fill-white' : ''}`} />
                </motion.button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="More options"
                      className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white/80"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-56 glass-strong border border-primary/30 rounded-xl p-1.5 shadow-[0_20px_60px_hsla(var(--primary)/0.25)]"
                  >
                    <DropdownMenuItem
                      onClick={handleDownload}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs text-foreground focus:bg-primary/15 focus:text-primary"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="flex-1">Download</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleCopy}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs text-foreground focus:bg-primary/15 focus:text-primary"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span className="flex-1">Copy Video Link</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={toggleSave}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs text-foreground focus:bg-primary/15 focus:text-primary"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span className="flex-1">Save to Playlist</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setReportOpen(true)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs text-red-400 focus:bg-red-500/15 focus:text-red-300"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span className="flex-1">Report Video</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>


            {/* Chapters (auto-parsed from description) */}
            <Chapters
              description={video.description}
              onSeek={(t) => {
                const v = document.querySelector('video') as HTMLVideoElement | null;
                if (v) { v.currentTime = t; v.play?.().catch(() => {}); }
              }}
            />

            {/* Comments — isolated engine: a crash here won't take down the player or feed */}
            <EngineBoundary name="comments" fallback={<div className="text-xs text-white/50 italic py-6">Comments temporarily unavailable.</div>}>
              <div className="pt-2 pb-2">
                {/* Collapsed / Preview Comment Card (Mobile Only when not expanded) */}
                {!commentsExpandedMobile && (
                  <div
                    onClick={() => setCommentsExpandedMobile(true)}
                    className="md:hidden bg-white/5 hover:bg-white/10 rounded-lg p-3 cursor-pointer transition space-y-2 my-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-white">
                        <span>Comments</span>
                        <span className="text-white/60 font-medium text-[11px]">• {dbComments.length}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-white/70 group-hover:text-white transition-colors font-medium">
                        <span>Read all</span>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                    {sortedComments.length > 0 ? (
                      <div className="flex items-center gap-2.5 text-xs">
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden">
                          {sortedComments[0].avatarUrl ? (
                            <img src={sortedComments[0].avatarUrl} alt="Commenter avatar" className="w-full h-full object-cover" />
                          ) : (
                            sortedComments[0].user[0]
                          )}
                        </div>
                        <p className="text-white/80 truncate text-xs flex-1">
                          <span className="font-semibold text-white mr-1">@{sortedComments[0].userHandle}:</span>
                          {sortedComments[0].text}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-white/50 italic">
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                          +
                        </div>
                        <span>Add a comment...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Full Comments Section (Desktop always visible, Mobile when expanded) */}
                <div className={commentsExpandedMobile ? "space-y-4 pt-2 pb-6" : "hidden md:block space-y-4 pt-2 pb-6"}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      {dbComments.length} Comments
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* Collapse button on mobile */}
                      {commentsExpandedMobile && (
                        <button
                          onClick={() => setCommentsExpandedMobile(false)}
                          className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-xs text-white/70 hover:text-white transition"
                        >
                          <span>Close</span>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-xs text-white/70 hover:text-white transition">
                            <ArrowUpDown className="w-3 h-3" />
                            Sort by: <span className="font-medium capitalize text-white">{sortBy}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          className="w-48 bg-zinc-900/95 backdrop-blur-lg border border-white/10 rounded-lg p-1 shadow-xl"
                        >
                          <DropdownMenuItem
                            onClick={() => setSortBy('top')}
                            className="flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer text-xs text-white/70 hover:bg-white/10 hover:text-white"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            <span className="flex-1">Top comments</span>
                            {sortBy === 'top' && <Check className="w-3.5 h-3.5 text-white" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setSortBy('newest')}
                            className="flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer text-xs text-white/70 hover:bg-white/10 hover:text-white"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span className="flex-1">Newest first</span>
                            {sortBy === 'newest' && <Check className="w-3.5 h-3.5 text-white" />}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Comment Input */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} alt="Your avatar" className="w-full h-full object-cover" />
                      ) : (
                        userDisplayName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'Y'
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={newComment}
                        maxLength={1000}
                        onChange={(e) => setNewComment(e.target.value)}
                        onFocus={() => setCommentFocused(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handlePostComment(); }}
                        placeholder="Add a comment..."
                        className="w-full bg-transparent border-b border-white/20 pb-1 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                      />
                      <AnimatePresence>
                        {(commentFocused || newComment) && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center justify-end gap-2 mt-2"
                          >
                            <button
                              onClick={() => { setNewComment(''); setCommentFocused(false); }}
                              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-full"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handlePostComment}
                              disabled={!newComment.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed glow-primary"
                            >
                              <Send className="w-3 h-3" /> Comment
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Comments List */}
                  <AnimatePresence initial={false}>
                    {visibleSorted.map((comment, i) => (
                      <motion.div
                        key={comment.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: Math.min(i * 0.03, 0.2) }}
                        className="flex items-start gap-3"
                      >
                        <Link
                          to={`/channel/${encodeURIComponent(comment.userHandle)}`}
                          title={`View ${comment.user}'s channel`}
                          className={`w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-semibold shrink-0 ring-0 hover:ring-2 hover:ring-primary/60 transition ${
                            comment.user === 'You' ? 'gradient-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground'
                          }`}
                        >
                          {comment.avatarUrl
                            ? <img src={comment.avatarUrl} alt={`${comment.user} avatar`} loading="lazy" className="w-full h-full object-cover" />
                            : comment.user[0]}
                        </Link>
                        <div className="flex-1 min-w-0">
                          {comment.pinned && (
                            <p className="text-[10px] text-primary mb-0.5 flex items-center gap-1 font-semibold">
                              <Pin className="w-2.5 h-2.5 fill-primary" /> Pinned by creator
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <Link to={`/channel/${encodeURIComponent(comment.userHandle)}`} className="text-xs font-semibold text-foreground hover:text-primary transition-colors">@{comment.userHandle}</Link>
                            {comment.verified && <span className="text-[9px] text-primary" title="Verified">✔</span>}
                            <span className="text-[10px] text-muted-foreground">{comment.time}</span>
                          </div>

                          <p className="text-xs text-foreground/85 mt-0.5 break-words">{comment.text}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <motion.button
                              whileTap={{ scale: 0.85 }}
                              onClick={() => toggleCommentLike(comment.id)}
                              className={`flex items-center gap-1 text-xs transition-colors ${
                                comment.liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <ThumbsUp className={`w-3 h-3 ${comment.liked ? 'fill-primary' : ''}`} /> {comment.likes}
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.85 }}
                              onClick={() => toggleCommentDislike(comment.id)}
                              className={`flex items-center gap-1 text-xs transition-colors ${
                                comment.disliked ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <ThumbsDown className={`w-3 h-3 ${comment.disliked ? 'fill-accent' : ''}`} />
                            </motion.button>
                            <button
                              onClick={() => setReplyOpen((m) => ({ ...m, [comment.id]: !m[comment.id] }))}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Reply
                            </button>
                          </div>

                          {/* Reply composer */}
                          {replyOpen[comment.id] && (
                            <div className="mt-2 flex items-start gap-2">
                              <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0 overflow-hidden">
                                {user?.user_metadata?.avatar_url ? (
                                  <img src={user.user_metadata.avatar_url} alt="Your avatar" className="w-full h-full object-cover" />
                                ) : (
                                  user?.user_metadata?.display_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'Y'
                                )}
                              </div>
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={replyText[comment.id] ?? ''}
                                  onChange={(e) => setReplyText((m) => ({ ...m, [comment.id]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handlePostReply(comment.id); }}
                                  placeholder={`Reply to @${comment.user.replace(' ', '')}`}
                                  className="w-full bg-transparent border-b border-border/50 pb-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                                />
                                <div className="flex items-center justify-end gap-2 mt-2">
                                  <button
                                    onClick={() => { setReplyOpen((m) => ({ ...m, [comment.id]: false })); setReplyText((m) => ({ ...m, [comment.id]: '' })); }}
                                    className="px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded-full"
                                  >Cancel</button>
                                  <button
                                    onClick={() => handlePostReply(comment.id)}
                                    disabled={!(replyText[comment.id] ?? '').trim()}
                                    className="px-3 py-1 text-[11px] font-semibold rounded-full gradient-primary text-primary-foreground disabled:opacity-40 glow-primary"
                                  >Reply</button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Nested replies */}
                          {(repliesByParent[comment.id] ?? []).length > 0 && (
                            <div className="mt-3 space-y-2 pl-3 border-l border-border/40">
                              {(repliesByParent[comment.id] ?? []).map((r) => (
                                <div key={r.id} className="flex items-start gap-2">
                                  <Link
                                    to={`/channel/${encodeURIComponent(r.userHandle)}`}
                                    className="w-6 h-6 rounded-full overflow-hidden bg-muted/60 flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 hover:ring-2 hover:ring-primary/60 transition"
                                  >
                                    {r.avatarUrl
                                      ? <img src={r.avatarUrl} alt={`${r.user} avatar`} loading="lazy" className="w-full h-full object-cover" />
                                      : r.user[0]}
                                  </Link>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Link to={`/channel/${encodeURIComponent(r.userHandle)}`} className="text-[11px] font-semibold text-foreground hover:text-primary transition-colors">@{r.userHandle}</Link>
                                      <span className="text-[9px] text-muted-foreground">{r.time}</span>
                                    </div>

                                    <p className="text-[11px] text-foreground/85 mt-0.5 break-words">{r.text}</p>
                                    <button
                                      onClick={() => toggleCommentLike(r.id)}
                                      className={`mt-1 flex items-center gap-1 text-[11px] transition-colors ${
                                        r.liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                      }`}
                                    >
                                      <ThumbsUp className={`w-3 h-3 ${r.liked ? 'fill-primary' : ''}`} /> {r.likes}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {sortedComments.length > visibleComments && (
                    <button
                      onClick={() => setVisibleComments((n) => n + COMMENT_PAGE_SIZE)}
                      className="mt-3 w-full py-2 rounded-lg text-xs font-semibold border border-primary/40 text-primary hover:bg-primary/10 hover:border-primary transition shadow-[0_0_12px_hsla(var(--primary)/0.15)]"
                    >
                      Load {Math.min(COMMENT_PAGE_SIZE, sortedComments.length - visibleComments)} more comments
                    </button>
                  )}
                </div>
              </div>
            </EngineBoundary>

            {/* Suggested Videos — INLINE on mobile/tablet BELOW Comments section */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="-mx-3 md:hidden pt-3 pb-4 border-t border-border/30 space-y-3"
            >
              <div className="flex items-center justify-between px-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="inline-block w-1.5 h-4 rounded-full gradient-primary glow-primary" />
                  Up Next
                </h3>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Recommended</span>
              </div>
              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-3">

                <DynamicAdContainer placement="watch_sidebar" />
                {suggestedVideos.filter((v) => !v.isShort).map((v, i) => (
                  <FeedVideoCard
                    key={v.id}
                    id={v.id}
                    title={v.title}
                    channel={v.channel}
                    viewsText={v.views}
                    timeText={v.time}
                    durationText={v.duration}
                    thumbUrl={v.thumbnail}
                    index={i}
                  />
                ))}
              </div>
              {suggestedVideos.some((v) => v.isShort) && (
                <div className="px-3 pt-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">Shorts</h3>
                    <Link to="/shorts" className="text-xs font-medium text-primary hover:underline">View all</Link>
                  </div>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar rail-gpu pb-2">
                    {suggestedVideos.filter((v) => v.isShort).map((v) => (
                      <Link key={v.id} to={`/shorts/${v.id}`} className="relative aspect-[9/16] w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {v.thumbnail ? (
                          <img src={v.thumbnail} alt={v.title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                        <div className="absolute bottom-2 left-2 right-2 line-clamp-2 text-[11px] font-semibold text-foreground">{v.title}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </motion.section>

          </div>
        </div>

        {/* ============= Right Sidebar — Independent Recommended Feed Scroll Panel ============= */}
        <aside className={theater ? 'hidden' : 'hidden md:block md:col-span-4 lg:col-span-4 h-full min-h-0 overflow-y-auto overscroll-contain pl-0 pr-1 scrollbar-thin scroll-gpu'}>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/20 sticky top-0 bg-background/95 backdrop-blur-md z-10 pt-1 px-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full gradient-primary glow-primary" />
              <h3 className="text-sm font-bold text-white">Up Next</h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Recommended</span>
          </div>
          <div className="px-0 mx-0 w-full flex flex-col gap-1 pb-4">
            <DynamicAdContainer placement="watch_sidebar" />
            {suggestedVideos.map((v, i) => (
              <FeedVideoCard
                key={v.id}
                id={v.id}
                title={v.title}
                channel={v.channel}
                viewsText={v.views}
                timeText={v.time}
                durationText={v.duration}
                thumbUrl={v.thumbnail}
                index={i}
              />
            ))}
          </div>
        </aside>
      </div>

      {/* Share Dialog */}
      <AnimatePresence>
        {shareOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-end lg:items-center justify-center p-4"
            onClick={() => setShareOpen(false)}
          >
            <motion.div
              initial={{ y: 40, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 40, scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md glass-strong rounded-2xl border border-primary/30 p-5 shadow-[0_20px_60px_hsla(var(--primary)/0.25)]"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-display font-bold text-glow">Share</h3>
                <button
                  onClick={() => setShareOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted/60 text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { Icon: MessageCircle, label: 'WhatsApp', color: 'text-green-400', href: `https://wa.me/?text=${encodeURIComponent(video.title + ' ' + shareUrl)}` },
                  { Icon: Twitter, label: 'X', color: 'text-foreground', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(video.title)}&url=${encodeURIComponent(shareUrl)}` },
                  { Icon: Facebook, label: 'Facebook', color: 'text-blue-400', href: `https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
                  { Icon: Link2, label: 'Link', color: 'text-primary', onClick: handleCopy },
                ].map(({ Icon, label, color, href, onClick }) => (
                  <motion.a
                    key={label}
                    href={href}
                    target={href ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    onClick={onClick ? (e) => { e.preventDefault(); onClick(); } : undefined}
                    whileHover={{ scale: 1.08, y: -2 }}
                    whileTap={{ scale: 0.92 }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl glass border border-border/40 hover:border-primary/50 hover:shadow-[0_0_15px_hsla(var(--primary)/0.3)] transition cursor-pointer"
                  >
                    <Icon className={`w-5 h-5 ${color}`} />
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </motion.a>
                ))}
              </div>

              <div className="flex items-center gap-2 glass rounded-lg border border-border/40 p-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-xs text-muted-foreground focus:outline-none truncate px-1"
                />
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    copied ? 'bg-primary/20 text-primary' : 'gradient-primary text-primary-foreground glow-primary'
                  }`}
                >
                  {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Video Modal */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="video"
        targetId={videoId}
        targetTitle={video.title}
        targetChannelName={video.channel}
      />
    </div>
  );
}
