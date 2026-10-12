/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { Bell, Heart, MessageCircle, UserPlus, ShieldAlert, Wallet, Flag, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { useNotifications } from '@/hooks/useInteractions';
import { supabase } from '@/integrations/supabase/loose';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';

const TYPE_LABEL: Record<string, string> = {
  follow: 'started following you',
  like: 'liked your video',
  comment: 'commented on your video',
  moderation: 'moderation update on your video',
  ban: 'your account was actioned',
  report_resolved: 'your report was reviewed',
  payout: 'wallet payout update',
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  moderation: ShieldAlert,
  ban: ShieldAlert,
  report_resolved: Flag,
  payout: Wallet,
};

const TYPE_TINT: Record<string, string> = {
  follow: 'text-primary bg-primary/15',
  like: 'text-destructive bg-destructive/15',
  comment: 'text-accent bg-accent/15',
  moderation: 'text-amber-400 bg-amber-400/10',
  ban: 'text-destructive bg-destructive/15',
  report_resolved: 'text-emerald-400 bg-emerald-400/10',
  payout: 'text-emerald-400 bg-emerald-400/10',
};

interface ActorProfile { id: string; display_name: string | null; avatar_url?: string | null; }
interface VideoMeta { id: string; thumb_url: string | null; title: string | null; }

export function NotificationsBell() {
  const { items, unread, userId, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [actors, setActors] = useState<Record<string, ActorProfile>>({});
  const [videos, setVideos] = useState<Record<string, VideoMeta>>({});

  const { actorIds, videoIds } = useMemo(() => {
    const a = new Set<string>(); const v = new Set<string>();
    for (const n of items) {
      const p = (n.payload || {}) as Record<string, unknown>;
      const actor = (p.follower_id || p.liker_id || p.commenter_id || p.actor_id) as string | undefined;
      if (actor) a.add(actor);
      const vid = (p.video_id) as string | undefined;
      if (vid) v.add(vid);
    }
    return { actorIds: Array.from(a), videoIds: Array.from(v) };
  }, [items]);

  useEffect(() => {
    if (actorIds.length === 0) return;
    const missing = actorIds.filter((id) => !actors[id]);
    if (!missing.length) return;
    supabase.from('profiles').select('id,display_name,avatar_url').in('id', missing).then(({ data }) => {
      if (!data) return;
      setActors((prev) => { const next = { ...prev }; for (const p of data as ActorProfile[]) next[p.id] = p; return next; });
    });
  }, [actorIds, actors]);

  useEffect(() => {
    if (videoIds.length === 0) return;
    const missing = videoIds.filter((id) => !videos[id]);
    if (!missing.length) return;
    supabase.from('videos').select('id,thumb_url,title').in('id', missing).then(({ data }) => {
      if (!data) return;
      setVideos((prev) => { const next = { ...prev }; for (const v of data as VideoMeta[]) next[v.id] = v; return next; });
    });
  }, [videoIds, videos]);

  if (!userId) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && unread > 0) markAllRead(); }}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative w-10 h-10 rounded-full glass-strong border border-border/40 flex items-center justify-center hover:border-primary/50 transition-colors"
        >
          <Bell className="w-4 h-4 text-foreground" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0 glass-strong border-border/40 overflow-hidden" align="end">
        <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-gradient-to-r from-primary/10 via-transparent to-accent/10">
          <p className="text-sm font-semibold">Activity</p>
          <span className="text-[10px] text-muted-foreground">{items.length} recent</span>
        </div>
        <div className="max-h-[440px] overflow-y-auto divide-y divide-border/20">
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">You're all caught up</p>
            </div>
          ) : items.map((n) => {
            const payload = (n.payload || {}) as Record<string, unknown>;
            const actorId = (payload.follower_id || payload.liker_id || payload.commenter_id || payload.actor_id) as string | undefined;
            const videoId = payload.video_id as string | undefined;
            const actor = actorId ? actors[actorId] : undefined;
            const video = videoId ? videos[videoId] : undefined;
            const Icon = TYPE_ICON[n.type] ?? Bell;
            const tint = TYPE_TINT[n.type] ?? 'text-foreground bg-muted/30';
            const label = TYPE_LABEL[n.type] ?? n.type;
            const name = actor?.display_name || 'Someone';
            const initial = (actor?.display_name?.[0] || '?').toUpperCase();

            const inner = (
              <div className={`flex items-start gap-3 p-3 transition-colors hover:bg-muted/20 ${!n.read_at ? 'bg-primary/[0.06]' : ''}`}>
                <div className="relative shrink-0">
                  {actor?.avatar_url ? (
                    <img src={actor.avatar_url} alt={name} className="w-10 h-10 rounded-full object-cover border border-border/40" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-secondary/60 flex items-center justify-center text-xs font-bold text-foreground">
                      {actor ? initial : <Icon className="w-4 h-4" />}
                    </div>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background ${tint}`}>
                    <Icon className="w-3 h-3" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">
                    {actor && <span className="font-semibold">{name} </span>}
                    <span className="text-muted-foreground">{label}</span>
                  </p>
                  {typeof payload.reason === 'string' && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{payload.reason}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {video?.thumb_url ? (
                  <img src={video.thumb_url} alt="" className="w-12 h-12 rounded-md object-cover border border-border/40 shrink-0" />
                ) : videoId ? (
                  <div className="w-12 h-12 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4 text-muted-foreground" />
                  </div>
                ) : null}
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </div>
            );

            const href = typeof n.action_url === 'string' && n.action_url.startsWith('/')
              ? n.action_url
              : videoId
                ? `/watch/${videoId}`
                : actorId
                  ? `/profile/${actorId}`
                  : null;
            return href ? (
              <Link key={n.id} to={href} onClick={() => setOpen(false)} className="block">{inner}</Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
