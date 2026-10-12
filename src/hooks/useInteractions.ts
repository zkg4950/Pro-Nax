/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/loose';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import { toast } from 'sonner';
import { assertCleanText } from '@/lib/moderation';
import { commentSchema, firstIssue, sanitizeText } from '@/lib/validation';
import { requireVerifiedUser } from '@/lib/authGuards';

// ---------- Auth helper ----------
async function requireAuth(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    toast.error('Sign in required');
    return null;
  }
  return user.id;
}

// ---------- LIKES ----------
export function useLike(videoId: string, creatorId?: string | null) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isTogglingRef = useRef(false);

  const refresh = useCallback(async () => {
    // Skip refresh if we're in the middle of a toggle to avoid double updates
    if (isTogglingRef.current) return;
    const { count: total } = await supabase
      .from('video_likes')
      .select('id', { count: 'exact', head: true })
      .eq('video_id', videoId);
    setCount(total ?? 0);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('video_likes')
        .select('id')
        .eq('video_id', videoId)
        .eq('user_id', user.id)
        .maybeSingle();
      setLiked(!!data);
    }
  }, [videoId]);

  // No polling: realtime pushes updates, and we re-sync when the tab regains
  // focus. Polling every viewer every few seconds does not survive scale.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`likes:${videoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_likes', filter: `video_id=eq.${videoId}` }, refresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIPTION_ERROR') {
          console.error('Likes realtime subscription error');
        }
      });
    
    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [videoId, refresh]);

  const toggle = useCallback(async () => {
    const uid = await requireAuth();
    if (!uid) return;
    if (loading) return; // Prevent double clicks
    setLoading(true);
    isTogglingRef.current = true;
    
    // Capture current state before optimistic update
    const wasLiked = liked;
    
    // Optimistic update
    setLiked(!wasLiked);
    setCount((c) => c + (wasLiked ? -1 : 1));
    
    const { data, error } = await supabase.rpc('toggle_like', { p_video: videoId, p_creator: creatorId ?? null });
    setLoading(false);
    isTogglingRef.current = false;
    if (error) { toast.error(error.message); refresh(); return; }
    const res = data as { liked: boolean; likes: number };
    setLiked(res.liked);
    setCount(res.likes);
  }, [videoId, creatorId, liked, loading, refresh]);

  return { liked, count, loading, toggle };
}

// ---------- SAVES ----------
export function useSave(videoId: string) {
  const [saved, setSaved] = useState(false);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isTogglingRef = useRef(false);

  const refresh = useCallback(async () => {
    // Skip refresh if we're in the middle of a toggle to avoid double updates
    if (isTogglingRef.current) return;
    const { count: total } = await supabase
      .from('video_saves')
      .select('id', { count: 'exact', head: true })
      .eq('video_id', videoId);
    setCount(total ?? 0);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('video_saves')
        .select('id')
        .eq('video_id', videoId)
        .eq('user_id', user.id)
        .maybeSingle();
      setSaved(!!data);
    }
  }, [videoId]);

  // No polling: realtime pushes updates, and we re-sync when the tab regains
  // focus. Polling every viewer every few seconds does not survive scale.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`saves:${videoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_saves', filter: `video_id=eq.${videoId}` }, refresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIPTION_ERROR') {
          console.error('Saves realtime subscription error');
        }
      });
    
    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [videoId, refresh]);

  const toggle = useCallback(async () => {
    const uid = await requireAuth();
    if (!uid) return;
    if (loading) return; // Prevent double clicks
    setLoading(true);
    isTogglingRef.current = true;
    
    // Capture current state before optimistic update
    const wasSaved = saved;
    
    // Optimistic update
    setSaved(!wasSaved);
    setCount((c) => c + (wasSaved ? -1 : 1));
    
    const { data, error } = await supabase.rpc('toggle_save', { p_video: videoId });
    setLoading(false);
    isTogglingRef.current = false;
    if (error) { toast.error(error.message); refresh(); return; }
    const res = data as { saved: boolean; saves: number };
    setSaved(res.saved);
    setCount(res.saves);
    toast.success(res.saved ? 'Saved' : 'Removed from saved');
  }, [videoId, saved, loading, refresh]);

  return { saved, count, loading, toggle };
}

// ---------- FOLLOWS ----------
export function useFollow(targetUserId: string | undefined | null) {
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);

  const refresh = useCallback(async () => {
    if (!targetUserId) return;
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', targetUserId);
    setFollowers(count ?? 0);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();
      setFollowing(!!data);
    }
  }, [targetUserId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime temporarily disabled due to channel subscription issues
  // useEffect(() => {
  //   if (!targetUserId) return;
  //   const channelName = `follows:${targetUserId}`;
  //   
  //   // Clean up existing channel first
  //   supabase.removeChannel(channelName);
  //   
  //   const ch = supabase
  //     .channel(channelName)
  //     .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `following_id=eq.${targetUserId}` }, refresh)
  //     .subscribe((status) => {
  //       if (status === 'SUBSCRIPTION_ERROR') {
  //         console.error('Follow realtime subscription error');
  //       }
  //     });
  //   
  //   return () => { 
  //     supabase.removeChannel(ch); 
  //   };
  // }, [targetUserId, refresh]);

  const toggle = useCallback(async () => {
    const uid = await requireAuth();
    if (!uid || !targetUserId) return;
    setFollowing((p) => !p);
    const { data, error } = await supabase.rpc('toggle_follow', { p_target: targetUserId });
    if (error) { toast.error(error.message); refresh(); return; }
    const res = data as { following: boolean; followers: number };
    setFollowing(res.following);
    setFollowers(res.followers);
  }, [targetUserId, refresh]);

  return { following, followers, toggle };
}

// ---------- SHARES / DOWNLOADS / VIEWS ----------
export async function recordShare(videoId: string, channel = 'link') {
  return supabase.rpc('record_share', { p_video: videoId, p_channel: channel });
}
export async function recordDownload(videoId: string) {
  return supabase.rpc('record_download', { p_video: videoId });
}
export async function recordView(videoId: string, watchSeconds = 0) {
  return supabase.rpc('record_view', { p_video: videoId, p_watch_seconds: watchSeconds, p_ip_hash: null });
}

// ---------- COMMENTS ----------
export interface DbComment {
  id: string;
  video_id: string;
  user_id: string;
  parent_id: string | null;
  text: string;
  created_at: string;
  author?: { id: string; display_name: string | null; email: string | null; handle: string | null; avatar_url: string | null; verified: boolean | null } | null;
}

export function useComments(videoId: string, creatorId?: string | null) {
  const [comments, setComments] = useState<DbComment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('video_comments')
      .select('id, video_id, user_id, parent_id, text, created_at')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as DbComment[];
    // Hydrate authors
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, email, handle, avatar_url, verified')
        .in('id', userIds);
      const map = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
      rows.forEach((r) => { r.author = (map.get(r.user_id) as any) ?? null; });
    }
    setComments(rows);
    setLoading(false);
  }, [videoId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`comments:${videoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_comments', filter: `video_id=eq.${videoId}` }, load)
      .subscribe((status) => {
        if (status === 'SUBSCRIPTION_ERROR') {
          console.error('Comments realtime subscription error');
        }
      });
    
    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [videoId, load]);

  const post = useCallback(async (text: string, parentId?: string | null) => {
    const parsed = commentSchema.safeParse({
      video_id: videoId,
      text: sanitizeText(text, 2000),
      parent_id: parentId ?? null,
    });
    if (!parsed.success) {
      toast.error(firstIssue(parsed.error));
      return;
    }
    try {
      assertCleanText(parsed.data.text, 'comment');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Comment blocked');
      return;
    }
    const verified = await requireVerifiedUser('comment');
    if (!verified) return;
    const { error } = await supabase.rpc('post_comment', {
      p_video: parsed.data.video_id,
      p_text: parsed.data.text,
      p_parent: parsed.data.parent_id ?? null,
      p_creator: creatorId ?? null,
    });
    if (error) toast.error(error.message);
  }, [videoId, creatorId]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('video_comments').delete().eq('id', id);
    if (error) toast.error(error.message);
  }, []);

  return { comments, loading, post, remove };
}

// ---------- NOTIFICATIONS ----------
export interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  payload: any;
  read_at: string | null;
  created_at: string;
  action_url?: string | null;
}

export function useNotifications() {
  const [items, setItems] = useState<DbNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const channelInstanceId = useRef(`instance-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    if (!userId) { setItems([]); setUnread(0); return; }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []) as DbNotification[];
    setItems(rows);
    setUnread(rows.filter((r) => !r.read_at).length);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      // AppHeader mounts desktop and mobile bells together (CSS controls visibility),
      // so each hook instance needs its own topic. Reusing a subscribed topic makes
      // the realtime client reject a second postgres_changes callback.
      .channel(`notifications:${userId}:${channelInstanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, load)
      .subscribe((status) => {
        if (status === 'SUBSCRIPTION_ERROR') {
          console.error('Notifications realtime subscription error');
        }
      });
    
    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
  }, [userId]);

  return { items, unread, userId, markAllRead, refresh: load };
}
