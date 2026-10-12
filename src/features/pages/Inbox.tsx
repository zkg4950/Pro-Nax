/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@/lib/router-compat';
import { ArrowLeft, Check, CheckCheck, Film, Loader2, MessageCircle, Play, Search, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/loose';
import { useAuth } from '@/contexts/AuthContext';
import {
  openDirectMessage,
  useChatThread,
  useInbox,
  usePresenceHeartbeat,
  type InboxRoom,
} from '@/hooks/useMessaging';

function timeAgo(iso?: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

interface VideoLite {
  id: string;
  title: string | null;
  thumb_url: string | null;
  is_short: boolean | null;
  owner_id: string;
}

function VideoMessageCard({ videoId }: { videoId: string }) {
  const [video, setVideo] = useState<VideoLite | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('videos')
      .select('id, title, thumb_url, is_short, owner_id')
      .eq('id', videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setVideo(data as VideoLite | null);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (!video) {
    return <div className="w-56 h-32 rounded-xl bg-white/5 animate-pulse" />;
  }

  return (
    <Link
      to={video.is_short ? `/shorts/${video.id}` : `/watch/${video.id}`}
      className="block w-56 rounded-xl overflow-hidden border border-white/10 bg-black/40 hover:border-cyan-400/50 transition"
    >
      <div className="relative aspect-video bg-black">
        {video.thumb_url ? (
          <img src={video.thumb_url} alt={video.title ?? 'Shared video'} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground"><Film className="w-6 h-6" /></div>
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="h-9 w-9 rounded-full bg-black/60 grid place-items-center"><Play className="w-4 h-4 text-white" /></span>
        </span>
      </div>
      <p className="px-2.5 py-2 text-xs font-medium line-clamp-2">{video.title ?? 'Untitled video'}</p>
    </Link>
  );
}

function VideoPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (videoId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<VideoLite[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (term: string) => {
    setLoading(true);
    let q = supabase
      .from('videos')
      .select('id, title, thumb_url, is_short, owner_id')
      .eq('status', 'ready')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(24);
    if (term.trim()) q = q.ilike('title', `%${term.trim()}%`);
    const { data } = await q;
    setItems((data as VideoLite[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => search(query), 250);
    return () => window.clearTimeout(t);
  }, [open, query, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share a video</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos and shorts" className="pl-9" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          {loading && <div className="col-span-full py-8 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
          {!loading && items.length === 0 && <p className="col-span-full text-sm text-muted-foreground py-6 text-center">No videos found.</p>}
          {items.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                onPick(v.id);
                onOpenChange(false);
              }}
              className="text-left rounded-lg overflow-hidden border border-white/10 hover:border-cyan-400/60 transition"
            >
              <div className="aspect-video bg-black">
                {v.thumb_url ? <img src={v.thumb_url} alt={v.title ?? ''} loading="lazy" className="w-full h-full object-cover" /> : null}
              </div>
              <p className="p-2 text-[11px] line-clamp-2">{v.title ?? 'Untitled'}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Thread({
  room,
  userId,
  onBack,
  onChanged,
}: {
  room: InboxRoom;
  userId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { messages, loading, peerTyping, send, notifyTyping } = useChatThread(room.room_id, userId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, peerTyping]);

  const submit = async (videoId?: string) => {
    const body = text.trim();
    if (!body && !videoId) return;
    setSending(true);
    const { error } = await send(body, videoId ?? null);
    setSending(false);
    if (error) {
      toast({ title: 'Message not sent', description: error.message, variant: 'destructive' });
      return;
    }
    setText('');
    onChanged();
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-3 py-2.5 border-b border-white/10 bg-black/40 backdrop-blur">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <Link to={`/profile/${room.handle ?? room.other_id}`} className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <Avatar className="h-9 w-9"><AvatarImage src={room.avatar_url ?? undefined} /><AvatarFallback>{(room.display_name ?? 'U')[0]}</AvatarFallback></Avatar>
            {room.is_online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-black" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{room.display_name ?? 'ProNax user'}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {peerTyping ? 'typing…' : room.is_online ? 'Active now' : `Active ${timeAgo(room.last_seen_at)} ago`}
            </p>
          </div>
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {loading && <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Say hello to start the conversation.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] space-y-1 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {m.video_id && <VideoMessageCard videoId={m.video_id} />}
                {m.body && (
                  <div className={`px-3.5 py-2 rounded-2xl text-sm break-words ${mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-white/10 text-foreground rounded-bl-md'}`}>
                    {m.body}
                  </div>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {timeAgo(m.created_at)}
                  {mine && (m.is_read ? <CheckCheck className="w-3 h-3 text-cyan-400" /> : <Check className="w-3 h-3" />)}
                </span>
              </div>
            </div>
          );
        })}
        {peerTyping && <p className="text-[11px] text-muted-foreground pl-1">typing…</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 p-3 border-t border-white/10 bg-black/40"
      >
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setPickerOpen(true)} aria-label="Share a video">
          <Film className="w-4 h-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            notifyTyping();
          }}
          placeholder="Send a message…"
          className="rounded-full bg-white/5 border-white/10"
          maxLength={2000}
        />
        <Button type="submit" size="icon" className="h-9 w-9 rounded-full shrink-0" disabled={sending || (!text.trim())}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>

      <VideoPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={(id) => submit(id)} />
    </div>
  );
}

export default function Inbox() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAuthenticated, openAuthModal } = useAuth();
  const userId = user?.id ?? null;
  usePresenceHeartbeat(userId);
  const { rooms, contacts, loading, refresh } = useInbox(userId);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Deep link: /inbox?room=<id> or /inbox?user=<id>
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const other = params.get('user');
    if (room) {
      setActiveRoomId(room);
      return;
    }
    if (other) {
      openDirectMessage(other).then(({ roomId, error }) => {
        if (error) {
          toast({ title: 'Cannot open chat', description: error.message, variant: 'destructive' });
          return;
        }
        setActiveRoomId(roomId);
        refresh();
      });
    }
  }, [userId, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) => (r.display_name ?? '').toLowerCase().includes(q) || (r.handle ?? '').toLowerCase().includes(q),
    );
  }, [rooms, query]);

  const activeRoom = rooms.find((r) => r.room_id === activeRoomId) ?? null;

  if (authLoading) {
    return <main className="min-h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>;
  }

  if (!userId) {
    return (
      <main className="min-h-[60vh] grid place-items-center px-4 text-center">
        <div className="space-y-3">
          <MessageCircle className="w-8 h-8 mx-auto text-primary" />
          <h1 className="text-xl font-bold">Sign in to view your inbox</h1>
          <p className="text-sm text-muted-foreground">Direct messages, shared videos and activity live here.</p>
          <Button onClick={openAuthModal}>Sign in</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full md:h-[calc(100vh-104px)] flex">
      {/* Conversation list */}
      <section className={`w-full md:w-[340px] md:border-r border-white/10 flex flex-col ${activeRoom ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 space-y-3 border-b border-white/10">
          <h1 className="text-lg font-bold">Inbox</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages" className="pl-9 rounded-full bg-white/5 border-white/10 h-9" />
          </div>
          {contacts.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={async () => {
                    const { roomId, error } = await openDirectMessage(c.id);
                    if (error) return toast({ title: 'Cannot open chat', description: error.message, variant: 'destructive' });
                    await refresh();
                    setActiveRoomId(roomId);
                  }}
                  className="flex flex-col items-center gap-1 shrink-0 w-14"
                >
                  <div className="relative">
                    <Avatar className="h-11 w-11 ring-2 ring-cyan-500/40"><AvatarImage src={c.avatar_url ?? undefined} /><AvatarFallback>{(c.display_name ?? 'U')[0]}</AvatarFallback></Avatar>
                    {c.is_online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-black" />}
                  </div>
                  <span className="text-[10px] truncate w-full text-center text-muted-foreground">{c.display_name ?? c.handle ?? 'User'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10 px-6">No conversations yet. Open a creator profile and tap Message.</p>
          )}
          {filtered.map((r) => (
            <button
              key={r.room_id}
              onClick={() => setActiveRoomId(r.room_id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition ${activeRoomId === r.room_id ? 'bg-white/5' : ''}`}
            >
              <div className="relative shrink-0">
                <Avatar className="h-11 w-11"><AvatarImage src={r.avatar_url ?? undefined} /><AvatarFallback>{(r.display_name ?? 'U')[0]}</AvatarFallback></Avatar>
                {r.is_online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-black" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{r.display_name ?? 'ProNax user'}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(r.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs truncate ${r.unread_count > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {r.last_message_preview ?? 'No messages yet'}
                  </p>
                  {r.unread_count > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-black text-[10px] font-bold grid place-items-center">
                      {r.unread_count > 99 ? '99+' : r.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Thread */}
      <section className={`flex-1 min-w-0 ${activeRoom ? 'flex' : 'hidden md:flex'} flex-col`}>
        {activeRoom ? (
          <Thread
            room={activeRoom}
            userId={userId}
            onBack={() => setActiveRoomId(null)}
            onChanged={refresh}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-center px-6">
            <div className="space-y-2">
              <MessageCircle className="w-8 h-8 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Select a conversation to start messaging.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
