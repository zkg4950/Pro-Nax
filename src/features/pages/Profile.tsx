/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Check, Edit3, Image as ImageIcon, UserPlus, UserCheck, Share2, Settings, BadgeCheck, MoreVertical, Wallet, LogOut, Users, Loader2, Home, Compass, PlaySquare, TrendingUp, History as HistoryIcon, ListVideo, Heart, Bookmark, Upload, Radio, SlidersHorizontal, MessageSquare, MessageCircle, Heart as HeartIcon, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from '@/lib/router-compat';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/loose';
import { useAuthSession } from '@/hooks/useAuthSession';
import { OrbBackground } from '@/components/ui/orb-background';
import { AnimatedCounter, compactFormat } from '@/components/ui/animated-counter';
import paradiseBanner from '@/assets/paradise-banner.jpg';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { openDirectMessage } from '@/hooks/useMessaging';

type Tab = 'videos' | 'liked' | 'saved' | 'following' | 'followers' | 'community';

interface VideoRow {
  id: string;
  title: string;
  thumb_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  monetization_enabled?: boolean | null;
  views?: number;
  views_count?: number;
  ownerName?: string;
  is_short?: boolean | null;
}

interface UserRow {
  id: string;
  name: string;
  initials: string;
  handle?: string | null;
  avatar_url?: string | null;
  followerCount?: number;
}

interface CommunityPost {
  id: string;
  content: string;
  created_at: string;
  creator_id: string;
  creator_name: string;
  creator_handle: string;
  creator_avatar: string;
  is_pinned: boolean;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  media_urls: string[] | null;
  poll_options: any;
  poll_expires_at: string | null;
  post_type: string;
  visibility: string;
  updated_at: string;
}

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

export default function Profile() {
  const navigate = useNavigate();
  const { signOut } = useAuthSession();
  const { handle: handleParam } = useParams<{ handle: string }>();
  const [tab, setTab] = useState<Tab>('videos');

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [name, setName] = useState('Pro Nax User');
  const [handle, setHandle] = useState('pronaxuser');
  const [bio, setBio] = useState('Creator on Pro Nax');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftHandle, setDraftHandle] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const [myVideos, setMyVideos] = useState<VideoRow[]>([]);
  const [likedVideos, setLikedVideos] = useState<VideoRow[]>([]);
  const [savedVideos, setSavedVideos] = useState<VideoRow[]>([]);
  const [following, setFollowing] = useState<UserRow[]>([]);
  const [followers, setFollowers] = useState<UserRow[]>([]);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [videoFilter, setVideoFilter] = useState<'all' | 'shorts' | 'long'>('all');

  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [loading, setLoading] = useState(true);

  // 1) Load auth user + profile (for edit controls and follow state)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        setAuthUserId(u.id);
      }
      setLoading(false);
    })();
  }, []);

  // 2) Load target profile (own or other user's)
  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      
      let targetUserId: string | null = null;
      let targetHandle = handleParam;
      
      if (targetHandle) {
        // Resolve by user id (UUID), handle, username or display name.
        const decoded = decodeURIComponent(targetHandle);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);
        const cols = 'id,display_name,username,handle,avatar_url,bio,is_creator,is_verified,subscribers_count,videos_count';
        const query = isUuid
          ? supabase.from('profiles').select(cols).eq('id', decoded)
          : supabase.from('profiles').select(cols).or(
              `handle.eq.${decoded},username.eq.${decoded},display_name.eq.${decoded}`,
            );
        const { data: rows } = await query.limit(1);
        const profileData = (rows ?? [])[0] ?? null;

        if (profileData) {
          targetUserId = (profileData as any).id;
          setIsOwnProfile(authUser?.id === targetUserId);
        } else {
          // Profile not found, redirect to own profile
          navigate('/profile', { replace: true });
          return;
        }
      } else if (authUser) {
        // Viewing own profile
        targetUserId = authUser.id;
        setIsOwnProfile(true);
      } else {
        // Not logged in and no handle specified
        navigate('/auth', { replace: true });
        return;
      }
      
      setUserId(targetUserId);

      if (!targetUserId) return;

      // Load profile data
      const { data: p } = await supabase.from('profiles').select('*').eq('id', targetUserId).maybeSingle();
      if (p) {
        setName((p as { display_name?: string | null }).display_name || 'Pro Nax User');
        setHandle(((p as { username?: string | null; display_name?: string | null }).username || (p as { display_name?: string | null }).display_name || 'pronaxuser').toString().replace(/\s+/g, '').toLowerCase());
        setBio((p as { bio?: string | null }).bio || '');
        setAvatar((p as { avatar_url?: string | null }).avatar_url || null);
        setBanner((p as { banner_url?: string | null }).banner_url || null);
        setVerified(Boolean((p as { is_verified?: boolean | null }).is_verified));
      }
    })();
  }, [handleParam, navigate]);

  // 3) Stats loaders
  const loadStats = useCallback(async () => {
    if (!userId) return;
    const [a, b, c, viewsRes] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('video_saves').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('videos').select('views_count').eq('owner_id', userId).eq('is_removed', false),
    ]);
    setFollowingCount(a.count ?? 0);
    setFollowersCount(b.count ?? 0);
    setSavedCount(c.count ?? 0);
    const total = (viewsRes.data ?? []).reduce((sum: number, v: any) => sum + (v.views_count ?? 0), 0);
    setTotalViews(total);
    
    // Fetch total likes across all user's videos
    // Sum the denormalized like counters instead of counting the like table.
    const { data: userVideos } = await supabase
      .from('videos')
      .select('likes_count')
      .eq('owner_id', userId)
      .eq('is_removed', false);
    setTotalLikes((userVideos ?? []).reduce((sum: number, v: any) => sum + Number(v.likes_count ?? 0), 0));
    
    // Debug: log following count to help diagnose issue
  }, [userId]);

  // 4) Tab-specific data loaders
  const loadTabData = useCallback(async () => {
    if (!userId) return;
    // Only show liked/saved tabs for own profile
    if ((tab === 'liked' || tab === 'saved') && !isOwnProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (tab === 'videos') {
        const { data } = await supabase
          .from('videos')
          .select('id,title,thumb_url,duration_seconds,created_at,monetization_enabled,views_count,is_short')
          .eq('owner_id', userId)
          .eq('is_removed', false)
          .order('created_at', { ascending: false })
          .limit(50);
        const list = (data ?? []) as VideoRow[];
        list.forEach(v => { v.views = v.views_count ?? 0; });
        setMyVideos(list);
      } else if (tab === 'liked') {
        const { data } = await supabase
          .from('video_likes')
          .select('video_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        const videoIds = (data ?? []).map((r: any) => r.video_id);
        if (videoIds.length > 0) {
          const { data: videos } = await supabase
            .from('videos')
            .select('id,title,thumb_url,duration_seconds,created_at,owner_id,views_count')
            .in('id', videoIds)
            .eq('is_removed', false)
            .order('created_at', { ascending: false });
          const list: VideoRow[] = (videos ?? []) as VideoRow[];
          list.forEach(v => { v.views = v.views_count ?? 0; });
          setLikedVideos(list);
        } else {
          setLikedVideos([]);
        }
      } else if (tab === 'saved') {
        const { data } = await supabase
          .from('video_saves')
          .select('video_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        const videoIds = (data ?? []).map((r: any) => r.video_id);
        if (videoIds.length > 0) {
          const { data: videos } = await supabase
            .from('videos')
            .select('id,title,thumb_url,duration_seconds,created_at,owner_id,views_count')
            .in('id', videoIds)
            .eq('is_removed', false)
            .order('created_at', { ascending: false });
          const list: VideoRow[] = (videos ?? []) as VideoRow[];
          list.forEach(v => { v.views = v.views_count ?? 0; });
          setSavedVideos(list);
        } else {
          setSavedVideos([]);
        }
      } else if (tab === 'following') {
        const { data } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .limit(100);
        const followingIds = (data ?? []).map((r: any) => r.following_id);
        if (followingIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, handle, avatar_url')
            .in('id', followingIds);
          const list: UserRow[] = (profiles ?? []).map((p: any) => {
            const n = p.display_name || 'Creator';
            return { id: p.id, name: n, handle: p.handle, initials: n.slice(0, 2).toUpperCase(), avatar_url: p.avatar_url };
          });
          setFollowing(list);
        } else {
          setFollowing([]);
        }
      } else if (tab === 'followers') {
        const { data } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', userId)
          .limit(100);
        const followerIds = (data ?? []).map((r: any) => r.follower_id);
        if (followerIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, handle, avatar_url')
            .in('id', followerIds);
          const list: UserRow[] = (profiles ?? []).map((p: any) => {
            const n = p.display_name || 'Creator';
            return { id: p.id, name: n, handle: p.handle, initials: n.slice(0, 2).toUpperCase(), avatar_url: p.avatar_url };
          });
          setFollowers(list);
        } else {
          setFollowers([]);
        }
      } else if (tab === 'community') {
        // Preferred path: enriched RPC. Falls back to a direct table read so
        // posts still render when the RPC is not deployed yet.
        const { data, error } = await supabase.rpc('get_channel_community_posts', {
          p_creator_id: userId,
          p_limit: 20,
          p_offset: 0
        });
        if (!error && Array.isArray(data)) {
          setCommunityPosts(data as CommunityPost[]);
        } else {
          const { data: rows } = await supabase
            .from('community_posts')
            .select('*')
            .eq('creator_id', userId)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);
          const { data: prof } = await supabase
            .from('profiles')
            .select('id, display_name, handle, avatar_url')
            .eq('id', userId)
            .maybeSingle();
          const p: any = prof ?? {};
          setCommunityPosts(((rows ?? []) as any[]).map((r) => ({
            ...r,
            creator_name: p.display_name || 'Creator',
            creator_handle: p.handle || '',
            creator_avatar: p.avatar_url || '',
            likes_count: r.likes_count ?? 0,
            comments_count: r.comments_count ?? 0,
            shares_count: r.shares_count ?? 0,
          })) as CommunityPost[]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId, tab, isOwnProfile]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadTabData(); }, [loadTabData]);

  // 5) Realtime — re-sync stats and the relevant tab list
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`profile:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `follower_id=eq.${userId}` }, () => { loadStats(); loadTabData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `following_id=eq.${userId}` }, () => { loadStats(); loadTabData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_saves', filter: `user_id=eq.${userId}` }, () => { loadStats(); if (tab === 'saved') loadTabData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_likes', filter: `user_id=eq.${userId}` }, () => { loadStats(); if (tab === 'liked') loadTabData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videos', filter: `owner_id=eq.${userId}` }, () => { loadStats(); if (tab === 'videos') loadTabData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts', filter: `creator_id=eq.${userId}` }, () => { if (tab === 'community') loadTabData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_post_likes', filter: `user_id=eq.${userId}` }, () => { if (tab === 'community') loadTabData(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, tab, loadStats, loadTabData]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'avatar' | 'banner') => {
    const f = e.target.files?.[0];
    if (!f || !userId || !isOwnProfile) return;
    
    // Upload to R2 using the same mechanism as video uploads
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: 'Please sign in', variant: 'destructive' });
        return;
      }
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/r2-presign`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          fileName: f.name, 
          fileType: f.type, 
          fileSize: f.size,
          folder: kind === 'avatar' ? 'avatars' : 'banners'
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.presignedUrl) {
        toast({ title: 'Upload failed', description: data?.error || 'Failed to get upload URL', variant: 'destructive' });
        return;
      }
      
      // Upload to R2
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', data.presignedUrl, true);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(f);
      });
      
      // Update profile with the public URL
      const col = kind === 'avatar' ? 'avatar_url' : 'banner_url';
      const { error: updateError } = await supabase.from('profiles').update({ [col]: data.publicUrl } as any).eq('id', userId);
      
      if (updateError) {
        console.error('Profile update error:', updateError);
        toast({ title: 'Upload failed', description: updateError.message, variant: 'destructive' });
        return;
      }
      
      // Set the preview with the public URL
      if (kind === 'avatar') {
        setAvatar(data.publicUrl);
      } else {
        setBanner(data.publicUrl);
      }
      
      toast({ title: `${kind === 'avatar' ? 'Profile picture' : 'Banner'} updated successfully`, duration: 3000 });
    } catch (err) {
      console.error('File upload error:', err);
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuggestions, setHandleSuggestions] = useState<string[]>([]);

  // Generate ProNax unique username candidates when the desired one is taken
  const generateSuggestions = useCallback(async (base: string): Promise<string[]> => {
    const clean = base.replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user';
    const rand = () => Math.floor(Math.random() * 9000 + 1000);
    const candidates = Array.from(new Set([
      `${clean}${Math.floor(Math.random() * 90 + 10)}`,
      `${clean}_${rand()}`,
      `${clean}.${Math.floor(Math.random() * 900 + 100)}`.replace('.', ''),
      `real_${clean}`.slice(0, 24),
      `${clean}_official`.slice(0, 24),
      `the${clean}`.slice(0, 24),
    ])).filter(c => /^[a-z0-9_]{3,24}$/.test(c));

    const { data } = await supabase
      .from('profiles')
      .select('username')
      .in('username', candidates);
    const taken = new Set(((data ?? []) as any[]).map(r => String(r.username).toLowerCase()));
    return candidates.filter(c => !taken.has(c)).slice(0, 4);
  }, []);

  const applySuggestion = (s: string) => {
    setDraftHandle(s);
    setHandleSuggestions([]);
    setHandleError(null);
  };

  const saveProfile = async () => {
    if (!userId) { setEditing(false); return; }
    const newName = draftName.trim() || 'Pro Nax User';
    const newHandle = draftHandle.trim().replace(/\s+/g, '').toLowerCase() || 'pronaxuser';
    const newBio = draftBio.trim();

    // Username format
    if (!/^[a-z0-9_]{3,24}$/.test(newHandle)) {
      setHandleError('Use 3–24 letters, numbers or underscores.');
      setHandleSuggestions([]);
      return;
    }

    setHandleError(null);
    setHandleSuggestions([]);

    // Uniqueness pre-check (case-insensitive) — excludes current user
    if (newHandle !== handle) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', newHandle)
        .neq('id', userId)
        .maybeSingle();
      if (existing) {
        setHandleError(`"${newHandle}" already taken. Try one of these:`);
        setHandleSuggestions(await generateSuggestions(newHandle));
        return;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: newName, username: newHandle, bio: newBio } as any)
      .eq('id', userId);
    if (error) {
      // 23505 = unique_violation from the DB constraint
      if ((error as any).code === '23505' || /duplicate|unique/i.test(error.message)) {
        setHandleError(`"${newHandle}" already taken. Try one of these:`);
        setHandleSuggestions(await generateSuggestions(newHandle));
        return;
      }
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    setName(newName); setHandle(newHandle); setBio(newBio);
    setEditing(false);
    toast({ title: 'Profile saved' });
  };


  const stats = [
    { label: 'Videos', value: myVideos.length, tab: 'videos' as Tab },
    ...(isOwnProfile ? [{ label: 'Saved', value: savedCount, tab: 'saved' as Tab }] : []),
    { label: 'Following', value: followingCount, tab: 'following' as Tab },
    { label: 'Followers', value: followersCount, tab: 'followers' as Tab },
    { label: 'Community', value: communityPosts.length, tab: 'community' as Tab },
  ];

  return (
    <div className="flex-1 pb-24 lg:pb-8 px-4 relative">
      <OrbBackground variant="aurora" />

      {/* Banner — K2 x Paradise panoramic */}
      <div className="relative w-full h-28 sm:h-64 lg:h-96 overflow-hidden group">
        <img
          src={banner || paradiseBanner}
          alt="Profile banner"
          className="absolute inset-0 w-full h-full object-contain object-center"
        />
        {/* Aurora tint overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/25 via-transparent to-secondary/25 mix-blend-overlay pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />
        {/* Shimmer light streak */}
        <div className="absolute -inset-x-10 top-0 h-full bg-gradient-to-r from-transparent via-primary/10 to-transparent -skew-x-12 opacity-60 pointer-events-none" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="More options"
              className="hidden absolute top-3 left-3 z-20 w-10 h-10 rounded-full glass-strong border border-border/40 items-center justify-center text-foreground hover:border-primary/60 hover:glow-primary transition-all hover:scale-105 active:scale-95"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={10} className="w-64 max-h-[75vh] overflow-y-auto glass-strong border border-primary/30 rounded-2xl p-2">
            <DropdownMenuItem onClick={() => navigate('/wallet')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium text-foreground focus:bg-primary/15 focus:text-primary">
              <span className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground"><Wallet className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0"><p>Wallet</p><p className="text-[10px] text-muted-foreground">Earnings & coins</p></div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium text-foreground focus:bg-primary/15 focus:text-primary">
              <span className="w-8 h-8 rounded-lg glass border border-border/40 flex items-center justify-center"><Settings className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0"><p>Settings</p><p className="text-[10px] text-muted-foreground">Account, privacy, theme</p></div>
            </DropdownMenuItem>

            {/* Mobile-only navigation (hidden on lg where the sidebar shows) */}
            <div className="lg:hidden">
              <DropdownMenuSeparator className="my-1 bg-border/40" />
              <div className="px-3 pt-1 pb-0.5 text-[9px] font-display tracking-widest uppercase text-muted-foreground/70">Browse</div>
              {[
                { to: '/', label: 'Home', icon: Home },
                { to: '/explore', label: 'Explore', icon: Compass },
                { to: '/shorts', label: 'Shorts', icon: PlaySquare },
                { to: '/trending', label: 'Trending', icon: TrendingUp },
                { to: '/subscriptions', label: 'Subscriptions', icon: Users },
              ].map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} onClick={() => navigate(to)} className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm text-foreground focus:bg-primary/15 focus:text-primary">
                  <span className="w-7 h-7 rounded-lg glass border border-border/40 flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></span>
                  <span>{label}</span>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator className="my-1 bg-border/40" />
              <div className="px-3 pt-1 pb-0.5 text-[9px] font-display tracking-widest uppercase text-muted-foreground/70">Library</div>
              {[
                { to: '/history', label: 'History', icon: HistoryIcon },
                { to: '/playlists', label: 'Playlists', icon: ListVideo },
                { to: '/likes', label: 'Liked', icon: Heart },
                { to: '/saved', label: 'Saved', icon: Bookmark },
              ].map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} onClick={() => navigate(to)} className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm text-foreground focus:bg-primary/15 focus:text-primary">
                  <span className="w-7 h-7 rounded-lg glass border border-border/40 flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></span>
                  <span>{label}</span>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator className="my-1 bg-border/40" />
              <div className="px-3 pt-1 pb-0.5 text-[9px] font-display tracking-widest uppercase text-muted-foreground/70">Creator</div>
              {[
                { to: '/upload', label: 'Upload', icon: Upload },
                { to: '/live', label: 'Go Live', icon: Radio },
                { to: '/studio', label: 'Studio', icon: SlidersHorizontal },
              ].map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} onClick={() => navigate(to)} className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm text-foreground focus:bg-primary/15 focus:text-primary">
                  <span className="w-7 h-7 rounded-lg glass border border-border/40 flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></span>
                  <span>{label}</span>
                </DropdownMenuItem>
              ))}
            </div>

            <DropdownMenuSeparator className="my-1 bg-border/40" />
            <DropdownMenuItem
              onClick={async () => { await signOut(); toast({ title: 'Logged out' }); navigate('/'); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-medium text-destructive focus:bg-destructive/15"
            >
              <span className="w-8 h-8 rounded-lg bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive"><LogOut className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0"><p>Log out</p><p className="text-[10px] text-muted-foreground">End this session</p></div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isOwnProfile && (
          <>
            <button onClick={() => bannerInput.current?.click()} className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-strong border border-border/40 text-xs text-foreground hover:border-primary/60 transition">
              <ImageIcon className="w-3.5 h-3.5" /> Change banner
            </button>
            <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(e) => handleFile(e, 'banner')} />
          </>
        )}
      </div>

      <div className="max-w-[1100px] mx-auto lg:px-6 perspective-container">
        {/* Hero — avatar floats over banner (no glass strip background) */}
        <div className="relative z-10 -translate-y-8 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5">
          <div className="relative w-24 h-24 sm:w-32 sm:h-32 shrink-0 -translate-y-8">
            <div className="relative w-full h-full rounded-full flex items-center justify-center text-2xl sm:text-3xl font-display font-bold text-primary-foreground overflow-hidden gradient-primary">
              {avatar ? <img src={avatar} alt="Avatar" className="w-full h-full object-cover object-center" /> : name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            {isOwnProfile && (
              <>
                <button onClick={() => avatarInput.current?.click()} className="absolute bottom-1 right-1 w-8 h-8 rounded-full glass-strong border border-primary/40 flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition z-10" aria-label="Change profile picture">
                  <Camera className="w-4 h-4" />
                </button>
                <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => handleFile(e, 'avatar')} />
              </>
            )}
          </div>

          <div className="flex-1 min-w-0 sm:pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-aurora break-words">{name}</h1>
              {verified && <BadgeCheck className="w-5 h-5 text-primary shrink-0" />}
            </div>
            <p className="text-sm text-muted-foreground break-all">@{handle}</p>
            {bio && <p className="text-xs text-muted-foreground/90 mt-2 max-w-xl break-words">{bio}</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span><AnimatedCounter value={totalViews} format={compactFormat} className="font-bold text-foreground" /> views</span>
              <span>•</span>
              <span><AnimatedCounter value={totalLikes} format={compactFormat} className="font-bold text-foreground" /> likes</span>
              <span>•</span>
              <span><AnimatedCounter value={followersCount} format={compactFormat} className="font-bold text-foreground" /> followers</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 sm:pb-2">
            {isOwnProfile ? (
              <button onClick={() => { setDraftName(name); setDraftHandle(handle); setDraftBio(bio); setEditing(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-full glass border border-border/40 text-xs font-semibold text-foreground hover:border-primary/60 transition">
                <Edit3 className="w-3.5 h-3.5" /> Edit profile
              </button>
            ) : (
              <button onClick={async () => {
                if (!authUserId || !userId) {
                  toast({ title: 'Please login first', variant: 'destructive' });
                  navigate('/auth');
                  return;
                }
                const { error } = await supabase.rpc('toggle_follow', { p_target: userId });
                if (error) {
                  toast({ title: 'Could not update follow', description: error.message, variant: 'destructive' });
                } else {
                  toast({ title: 'Follow status updated' });
                  loadStats();
                  loadTabData();
                }
              }} className="flex items-center gap-1.5 px-4 py-2 rounded-full gradient-primary text-primary-foreground glow-primary text-xs font-semibold transition">
                <UserPlus className="w-3.5 h-3.5" /> Follow
              </button>
            )}
            {!isOwnProfile && userId && (
              <button
                onClick={async () => {
                  if (!authUserId) {
                    toast({ title: 'Please login first', variant: 'destructive' });
                    navigate('/auth');
                    return;
                  }
                  const { roomId, error } = await openDirectMessage(userId);
                  if (error) {
                    toast({ title: 'Cannot open chat', description: error.message, variant: 'destructive' });
                    return;
                  }
                  navigate(`/inbox?room=${roomId}`);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full glass border border-border/40 text-xs font-semibold transition hover:border-primary/60"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </button>
            )}
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast({ title: 'Profile link copied' }); }} className="hidden p-2 rounded-full glass border border-border/40 text-muted-foreground hover:text-foreground transition" aria-label="Share profile">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mt-5">
          {stats.map((s) => (
            <button
              key={s.label}
              onClick={() => setTab(s.tab)}
              className={`glass-crystal rounded-2xl p-3 text-center transition-all duration-300 hover:scale-105 hover:-translate-y-0.5 ${tab === s.tab ? 'border-primary/60 shadow-[0_0_28px_-6px_hsl(var(--glow-primary)/0.7)]' : 'hover:border-primary/50'}`}
            >
              <div className="text-base sm:text-lg font-display font-bold text-foreground">
                <AnimatedCounter value={s.value} format={compactFormat} />
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mt-6 overflow-x-auto no-scrollbar border-b border-border/30">
          {(['videos', ...(isOwnProfile ? ['liked', 'saved'] : []), 'following', 'followers', 'community'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-xs font-semibold capitalize whitespace-nowrap border-b-2 transition ${tab === t ? 'text-cyan-400 border-cyan-400' : 'text-muted-foreground border-transparent hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Video filter for videos tab */}
        {tab === 'videos' && (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setVideoFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${videoFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
            >
              All
            </button>
            <button
              onClick={() => setVideoFilter('shorts')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${videoFilter === 'shorts' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
            >
              Shorts
            </button>
            <button
              onClick={() => setVideoFilter('long')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${videoFilter === 'long' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
            >
              Long Videos
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="mt-6 perspective-container">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
              ) : tab === 'videos' ? (
                (() => {
                  const filteredVideos = videoFilter === 'all' 
                    ? myVideos 
                    : videoFilter === 'shorts' 
                      ? myVideos.filter(v => v.is_short)
                      : myVideos.filter(v => !v.is_short);
                  return filteredVideos.length === 0 
                    ? <EmptyState text={videoFilter === 'all' ? "You haven't uploaded any videos yet." : `No ${videoFilter} yet.`} />
                    : <VideoGrid videos={filteredVideos} />;
                })()
              ) : tab === 'liked' ? (
                likedVideos.length === 0 ? <EmptyState text="No liked videos yet." />
                : <VideoGrid videos={likedVideos} />
              ) : tab === 'saved' ? (
                savedVideos.length === 0 ? <EmptyState text="No saved videos yet." />
                : <VideoGrid videos={savedVideos} />
              ) : tab === 'following' ? (
                <UserList items={following} kind="following" meId={authUserId} onChange={loadTabData} />
              ) : tab === 'followers' ? (
                <UserList items={followers} kind="followers" meId={authUserId} onChange={loadTabData} />
              ) : tab === 'community' ? (
                <CommunityPosts posts={communityPosts} isOwnProfile={isOwnProfile} onChanged={loadTabData} />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setEditing(false)}>
            <motion.div initial={{ y: 40, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 40, scale: 0.96, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md glass-strong rounded-2xl border border-primary/30 p-5">
              <h3 className="text-base font-display font-bold text-aurora mb-4">Edit profile</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Display name</label>
                  <input value={draftName} maxLength={40} onChange={(e) => setDraftName(e.target.value)} className="mt-1 w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Username</label>
                  <div className={`mt-1 flex items-center bg-muted/40 border rounded-lg focus-within:border-primary/60 ${handleError ? 'border-red-500/60' : 'border-border/40'}`}>
                    <span className="pl-3 text-sm text-muted-foreground">@</span>
                    <input
                      value={draftHandle}
                      maxLength={24}
                      onChange={(e) => { setDraftHandle(e.target.value); if (handleError) setHandleError(null); if (handleSuggestions.length) setHandleSuggestions([]); }}
                      className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  {handleError && (
                    <p className="mt-1 text-[11px] text-red-400">{handleError}</p>
                  )}
                  {handleSuggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {handleSuggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => applySuggestion(s)}
                          className="px-2.5 py-1 rounded-full text-[11px] bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition"
                        >
                          @{s}
                        </button>
                      ))}
                    </div>
                  )}

                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bio</label>
                  <textarea value={draftBio} maxLength={160} rows={3} onChange={(e) => setDraftBio(e.target.value)} className="mt-1 w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none" />
                  <p className="text-[10px] text-muted-foreground text-right mt-1">{draftBio.length}/160</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-full text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={saveProfile} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold gradient-primary text-primary-foreground glow-primary">
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VideoGrid({ videos }: { videos: VideoRow[] }) {
  const hasShorts = videos.some(v => v.is_short);
  const hasLongVideos = videos.some(v => !v.is_short);

  return (
    <div className={`${hasShorts && !hasLongVideos ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
      {videos.map((v) => (
        <Link key={v.id} to={v.is_short ? `/shorts#${v.id}` : `/watch/${v.id}`} className="block group tilt-3d">
          <div className={`relative rounded-lg overflow-hidden bg-muted/20 neon-edge ${v.is_short ? 'aspect-[9/16] max-h-[280px]' : 'aspect-video'}`}>
            {v.thumb_url ? (
              <img src={v.thumb_url} alt={v.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <PlaySquare className="w-12 h-12 text-primary/40" />
              </div>
            )}
            {v.is_short && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            )}
            {fmtDuration(v.duration_seconds) && !v.is_short && (
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-background/80 text-foreground">
                {fmtDuration(v.duration_seconds)}
              </span>
            )}
            {v.is_short && (
              <>
                <span className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1">
                  <PlaySquare className="w-2.5 h-2.5 text-white fill-white" />
                  <span className="text-[10px] font-semibold text-white">{typeof v.views === 'number' ? compactFormat(v.views) : '0'}</span>
                </span>
              </>
            )}
          </div>
          {!v.is_short && (
            <>
              <h3 className="mt-2 text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{v.title}</h3>
              <div className="text-xs text-muted-foreground mt-0.5">
                {typeof v.views === 'number' && <><AnimatedCounter value={v.views} format={compactFormat} /> views · </>}
                {timeAgo(v.created_at)}
              </div>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="glass rounded-xl border border-border/40 p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function UserList({ items, kind, meId, onChange }: { items: UserRow[]; kind: 'following' | 'followers'; meId: string | null; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followedByMap, setFollowedByMap] = useState<Record<string, boolean>>({});

  // Seed initial state
  useEffect(() => {
    if (kind === 'following') {
      setFollowingMap(Object.fromEntries(items.map((u) => [u.id, true])));
      // Check which of these users follow me back (for mutual follow detection)
      if (meId) {
        const ids = items.map(i => i.id);
        if (ids.length) {
          supabase.from('follows').select('follower_id').eq('following_id', meId).in('follower_id', ids).then(({ data }) => {
            setFollowedByMap(Object.fromEntries((data ?? []).map((r: any) => [r.follower_id, true])));
          });
        }
      }
    } else if (meId) {
      // For followers tab — query which of these I currently follow
      const ids = items.map(i => i.id);
      if (!ids.length) return;
      supabase.from('follows').select('following_id').eq('follower_id', meId).in('following_id', ids).then(({ data }) => {
        setFollowingMap(Object.fromEntries((data ?? []).map((r: any) => [r.following_id, true])));
      });
    }
  }, [items, kind, meId]);

  if (items.length === 0) return <EmptyState text={`No ${kind} yet.`} />;

  const toggle = async (u: UserRow) => {
    if (!meId || u.id === meId) return;
    setBusy(u.id);
    const { error } = await supabase.rpc('toggle_follow', { p_target: u.id });
    setBusy(null);
    if (error) { toast({ title: 'Could not update', description: error.message, variant: 'destructive' }); return; }
    setFollowingMap((m) => ({ ...m, [u.id]: !m[u.id] }));
    onChange();
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((u) => {
        const followed = !!followingMap[u.id];
        const isFriend = kind === 'following' ? !!followedByMap[u.id] : followed;
        return (
          <div key={u.id} className="flex items-center gap-3 glass rounded-xl border border-border/40 p-3 tilt-3d">
            <Link to={`/profile/${u.id}`} className="flex flex-1 min-w-0 items-center gap-3" aria-label={`Open ${u.name}'s profile`}>
              <div className="w-11 h-11 rounded-full overflow-hidden gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
                {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" /> : u.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                {u.handle && <p className="text-xs text-muted-foreground truncate">@{u.handle}</p>}
              </div>
            </Link>
            <button
              onClick={() => toggle(u)}
              disabled={busy === u.id || u.id === meId}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition disabled:opacity-50 ${followed ? 'glass border border-primary/40 text-primary' : 'gradient-primary text-primary-foreground glow-primary'}`}
            >
              {isFriend ? <><Users className="w-3.5 h-3.5" /> Friend</> : followed ? <><UserCheck className="w-3.5 h-3.5" /> Following</> : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CommunityPosts({ posts, isOwnProfile, onChanged }: { posts: CommunityPost[]; isOwnProfile: boolean; onChanged: () => void }) {
  const [newPostContent, setNewPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
    });
  }, []);

  const handleCreatePost = async () => {
    if (!newPostContent.trim() && mediaFiles.length === 0) return;
    if (!currentUser) {
      toast({ title: 'Please login to post', variant: 'destructive' });
      return;
    }

    setPosting(true);
    try {
      // Upload media files if any
      let mediaUrls: string[] = [];
      if (mediaFiles.length > 0) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          toast({ title: 'Please sign in', variant: 'destructive' });
          return;
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        for (const file of mediaFiles) {
          const res = await fetch(`${supabaseUrl}/functions/v1/r2-presign`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ 
              fileName: file.name, 
              fileType: file.type, 
              fileSize: file.size,
              folder: 'community-media',
            }),
          });
          const presignData = await res.json();
          if (presignData.error) throw new Error(presignData.error);

          const uploadRes = await fetch(presignData.url, {
            method: 'PUT',
            body: file,
          });
          if (!uploadRes.ok) throw new Error('Upload failed');

          mediaUrls.push(presignData.publicUrl);
        }
      }

      const { error } = await supabase.from('community_posts').insert({
        creator_id: currentUser.id,
        content: newPostContent.trim(),
        post_type: mediaUrls.length > 0 ? 'image' : 'text',
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        visibility: 'public',
      });

      if (error) throw error;
      
      setNewPostContent('');
      setMediaFiles([]);
      toast({ title: 'Post created successfully' });
      // Reload posts
      onChanged();
    } catch (error) {
      console.error('Error creating post:', error);
      toast({ title: 'Failed to create post', variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  const handleLikePost = async (postId: string) => {
    if (!currentUser) {
      toast({ title: 'Please login to like posts', variant: 'destructive' });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('toggle_community_post_like', {
        p_post_id: postId,
        p_user_id: currentUser.id,
      });

      if (error) throw error;
      
      // Reload posts to update like count
      onChanged();
    } catch (error) {
      console.error('Error liking post:', error);
      toast({ title: 'Failed to like post', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {isOwnProfile && (
        <div className="glass rounded-xl border border-border/40 p-4">
          <div className="flex gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={currentUser?.user_metadata?.avatar_url} />
              <AvatarFallback>Me</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Input
                placeholder="Share something with your community..."
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                maxLength={5000}
                className="mb-2"
              />
              
              {/* Media preview */}
              {mediaFiles.length > 0 && (
                <div className="flex gap-2 mb-2">
                  {mediaFiles.map((file, i) => (
                    <div key={i} className="relative w-20 h-20">
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt="" 
                        className="w-full h-full object-cover rounded-lg" 
                      />
                      <button
                        onClick={() => setMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={() => mediaInputRef.current?.click()}
                    className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground transition"
                    title="Add image"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setMediaFiles(prev => [...prev, ...files]);
                    }}
                  />
                </div>
                <button
                  onClick={handleCreatePost}
                  disabled={posting || (!newPostContent.trim() && mediaFiles.length === 0)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {posts.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No community posts yet.</p>
        </div>
      )}

      {posts.map((post) => (
        <div key={post.id} className="glass rounded-xl border border-border/40 p-4">
          <div className="flex gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={post.creator_avatar} />
              <AvatarFallback>{post.creator_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-foreground">{post.creator_name}</span>
                <span className="text-xs text-muted-foreground">@{post.creator_handle}</span>
                <span className="text-xs text-muted-foreground">• {timeAgo(post.created_at)}</span>
                {post.is_pinned && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Pinned</span>
                )}
              </div>
              <p className="text-sm text-foreground mb-3">{post.content}</p>
              
              {post.media_urls && post.media_urls.length > 0 && (
                <div className="flex gap-2 mb-3">
                  {post.media_urls.map((url: string, i: number) => (
                    <img key={i} src={url} alt="" className="w-20 h-20 rounded-lg object-cover" />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <button
                  onClick={() => handleLikePost(post.id)}
                  className="flex items-center gap-1 hover:text-foreground transition"
                >
                  <HeartIcon className="w-4 h-4" />
                  {post.likes_count}
                </button>
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />
                  {post.comments_count}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
