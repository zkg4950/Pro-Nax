/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/loose";
import { useAuthSession } from "@/hooks/useAuthSession";
import type { ChannelStats, Comment, Video } from "./types";

// Singleton channel management
const channelMap = new Map<string, ReturnType<typeof supabase.channel>>();

/* ---------------- helpers ---------------- */

const fmtDuration = (sec?: number | null) => {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
};

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

const visibilityOf = (v: string | null | undefined): Video["visibility"] => {
  switch ((v ?? "").toLowerCase()) {
    case "private":
      return "Private";
    case "unlisted":
      return "Unlisted";
    case "draft":
      return "Draft";
    default:
      return "Public";
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const toVideo = (r: Row, likes = 0, commentsCount = 0): Video => {
  // Validate video URL - if it's not a valid HTTP/HTTPS URL, use fallback
  const isValidUrl = (url: string | null | undefined) => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const videoUrl = isValidUrl(r.video_url) 
    ? r.video_url 
    : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

  return {
    id: String(r.id),
    title: r.title ?? "Untitled",
    description: r.description ?? "",
    thumbnail: r.thumb_url ?? r.preview_url ?? "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
    videoUrl,
    duration: fmtDuration(r.duration_seconds),
    visibility: visibilityOf(r.visibility),
    monetization: !!r.monetization_enabled,
    adSuitabilityStatus: r.is_pending_review ? "yellow" : "green",
    restrictions: r.age_restriction ? String(r.age_restriction) : "None",
    uploadDate: fmtDate(r.created_at),
    views: r.views_count ?? 0,
    commentsCount,
    likes,
    dislikes: 0,
    likePercentage: likes > 0 ? 100 : 0,
    ctr: 0,
    avgViewDuration: "0:00",
    tags: r.tags ?? [],
    category: r.category ?? "Uncategorized",
    isShort: !!r.is_short,
  };
};

/* ---------------- hook ---------------- */

export function useLiveStudio() {
  const { user, loading: authLoading, signOut } = useAuthSession();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [channelStats, setChannelStats] = useState<ChannelStats | null>(null);
  const [realUsers, setRealUsers] = useState<Array<{ id: string; display_name: string; avatar_url: string }>>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Show loading state for at least 300ms to prevent flickering
      await new Promise(resolve => setTimeout(resolve, 300));
      const [vRes, pRes, fRes, wRes, uRes] = await Promise.all([
        supabase.from("videos").select("id, title, description, thumb_url, preview_url, duration_seconds, visibility, monetization_enabled, is_pending_review, age_restriction, created_at, views_count, tags, category, is_short").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("profiles").select("display_name, avatar_url, bio").eq("id", userId).maybeSingle(),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
        supabase.from("user_wallets").select("balance, total_earned").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("id, display_name, avatar_url").limit(20),
      ]);

      const rows: Row[] = vRes.data ?? [];
      const ids = rows.map((r) => String(r.id));

      const likeMap: Record<string, number> = {};
      const commentCount: Record<string, number> = {};
      let mappedComments: Comment[] = [];

      if (ids.length) {
        const [likesRes, cRes] = await Promise.all([
          supabase.from("video_likes").select("video_id").in("video_id", ids),
          supabase
            .from("video_comments")
            .select("id, text, created_at, user_id, video_id, parent_id")
            .in("video_id", ids)
            .is("parent_id", null)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        (likesRes.data ?? []).forEach((l: Row) => {
          likeMap[l.video_id] = (likeMap[l.video_id] ?? 0) + 1;
        });

        const cRows: Row[] = cRes.data ?? [];
        cRows.forEach((c) => {
          commentCount[c.video_id] = (commentCount[c.video_id] ?? 0) + 1;
        });

        const authorIds = [...new Set(cRows.map((c) => c.user_id).filter(Boolean))];
        const authorMap: Record<string, Row> = {};
        if (authorIds.length) {
          const { data: authors } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", authorIds);
          (authors ?? []).forEach((a: Row) => {
            authorMap[a.id] = a;
          });
        }

        const titleById: Record<string, string> = {};
        rows.forEach((r) => {
          titleById[String(r.id)] = r.title ?? "Untitled";
        });

        mappedComments = cRows.map((c) => {
          const a = authorMap[c.user_id];
          return {
            id: String(c.id),
            videoId: String(c.video_id),
            videoTitle: titleById[String(c.video_id)] ?? "",
            author: a?.display_name || "User",
            avatar: a?.avatar_url || "",
            text: c.text ?? "",
            timeAgo: timeAgo(c.created_at),
            likes: 0,
            heart: false,
            status: "published",
          } as Comment;
        });
      }

      setVideos(rows.map((r) => toVideo(r, likeMap[String(r.id)] ?? 0, commentCount[String(r.id)] ?? 0)));
      setComments(mappedComments);
      setRealUsers((uRes.data ?? []) as any);

      const p: Row = pRes.data ?? {};
      const w: Row = wRes.data ?? {};
      const totalViews = rows.reduce((s, r) => s + (r.views_count ?? 0), 0);

      setChannelStats({
        name: p.display_name || "Your Channel",
        handle: `@${(p.display_name || "channel").toLowerCase().replace(/\s+/g, "")}`,
        avatar: p.avatar_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
        banner: "",
        subscribers: fRes.count ?? 0,
        subscriberChange28Days: 0,
        views28Days: totalViews,
        watchTimeHours28Days: 0,
        estimatedRevenue28Days: Number(w.total_earned ?? 0),
        realtime48HoursViews: 0,
        realtime60MinsViews: 0,
      });
    } catch (e) {
      console.error("[pronax-studio] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    void fetchAll();
  }, [authLoading, fetchAll]);

  useEffect(() => {
    if (!userId) return;
    
    const channelName = `pronax-studio-${userId}`;
    
    // Check if channel already exists (singleton pattern)
    if (channelMap.has(channelName)) {
      const existingChannel = channelMap.get(channelName);
      if (existingChannel) {
        channelRef.current = existingChannel;
        return;
      }
    }
    
    // Create new channel
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos", filter: `owner_id=eq.${userId}` },
        () => void fetchAll()
      )
      .subscribe();
    
    channelMap.set(channelName, ch);
    channelRef.current = ch;
    
    return () => {
      // Only remove if this is the instance that created it
      if (channelRef.current && channelMap.get(channelName) === channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelMap.delete(channelName);
        channelRef.current = null;
      }
    };
  }, [userId]);

  /* ---------------- mutations ---------------- */

  const saveVideo = useCallback(async (updated: Video) => {
    setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    const { error } = await supabase.rpc("creator_update_video", {
      p_video_id: updated.id,
      p_title: updated.title,
      p_description: updated.description,
      p_tags: updated.tags,
      p_category: updated.category,
      p_visibility: updated.visibility.toLowerCase(),
      p_monetization_enabled: updated.monetization,
      p_thumb_url: updated.thumbnail || null,
    });
    if (error) console.error("[pronax-studio] save video failed", error);
  }, []);

  const deleteVideo = useCallback(async (videoId: string) => {
    console.log(`[pronax-studio] Starting deletion for video ID: ${videoId}`);
    try {
      // Call Edge Function to delete video (handles both R2 and database deletion with service role)
      const { error } = await supabase.functions.invoke('delete-video', {
        body: { videoId }
      });

      if (error) {
        console.error("[pronax-studio] Edge Function deletion failed", error);
        return;
      }

      console.log("[pronax-studio] Video deletion successful");
      
      // Update local state
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch (error) {
      console.error("[pronax-studio] delete video error", error);
    }
  }, []);

  const addCommentReply = useCallback(
    async (commentId: string, replyText: string) => {
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, replyText } : c)));
      const { error } = await supabase.rpc("creator_add_comment_reply", {
        p_parent_comment_id: commentId,
        p_reply_text: replyText,
      });
      if (error) console.error("[pronax-studio] reply failed", error);
    },
    []
  );

  const deleteComment = useCallback(async (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    const { error } = await supabase.rpc("creator_delete_comment", {
      p_comment_id: commentId,
    });
    if (error) console.error("[pronax-studio] delete comment failed", error);
  }, []);

  const toggleHeartComment = useCallback((commentId: string) => {
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, heart: !c.heart } : c)));
  }, []);

  const updateChannel = useCallback(
    async (patch: Partial<ChannelStats>) => {
      setChannelStats((prev) => (prev ? { ...prev, ...patch } : prev));
      const upd: { display_name?: string | null; avatar_url?: string | null } = {};
      if (patch.name !== undefined) upd.display_name = patch.name;
      if (patch.avatar !== undefined) upd.avatar_url = patch.avatar;
      if (!Object.keys(upd).length) return;
      const { error } = await supabase.rpc("creator_update_profile", upd);
      if (error) console.error("[pronax-studio] profile update failed", error);
    },
    []
  );

  return {
    isAuthed: !!userId,
    authLoading,
    loading,
    videos,
    comments,
    channelStats,
    realUsers,
    setVideos,
    refresh: fetchAll,
    saveVideo,
    deleteVideo,
    addCommentReply,
    deleteComment,
    toggleHeartComment,
    updateChannel,
    signOut,
  };
}
