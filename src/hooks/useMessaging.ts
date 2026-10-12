/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseAny as supabase } from '@/integrations/supabase/loose';

export interface InboxRoom {
  room_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  other_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_verified?: boolean | null;
  is_online: boolean;
  last_seen_at: string;
  unread_count: number;
}

export interface ChatContact {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  body: string | null;
  video_id: string | null;
  is_read: boolean;
  created_at: string;
}

/** Unread direct-message conversations for the header / mobile nav badge. */
export function useUnseenChats(userId?: string | null) {
  const [count, setCount] = useState(0);
  const instanceId = useRef(Math.random().toString(36).slice(2, 10));

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('unseen_chats_count');
    if (!error && typeof data === 'number') setCount(data);
  }, []);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    refresh();
    const channel = supabase
      .channel(`dm-badge-${userId}-${instanceId.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId, refresh]);

  return { count, refresh };
}

/** Inbox conversation list + mutual online contacts. */
export function useInbox(userId?: string | null) {
  const instanceId = useRef(Math.random().toString(36).slice(2, 10));
  const [rooms, setRooms] = useState<InboxRoom[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [inbox, active] = await Promise.all([
      supabase.rpc('inbox_list'),
      supabase.rpc('active_contacts'),
    ]);
    if (!inbox.error && Array.isArray(inbox.data)) setRooms(inbox.data as InboxRoom[]);
    if (!active.error && Array.isArray(active.data)) setContacts(active.data as ChatContact[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    refresh();
    const channel = supabase
      .channel(`dm-inbox-${userId}-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => refresh())
      .subscribe();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [userId, refresh]);

  return { rooms, contacts, loading, refresh };
}

/** Realtime thread for a single conversation. */
export function useChatThread(roomId?: string | null, userId?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimer = useRef<number | null>(null);
  const instanceId = useRef(Math.random().toString(36).slice(2, 10));

  const load = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, body, video_id, is_read, created_at')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(300);
    setMessages((data as ChatMessage[]) ?? []);
    setLoading(false);
    await supabase.rpc('mark_chat_read', { p_room: roomId });
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    load();
    const channel = supabase
      .channel(`dm-room-${roomId}-${instanceId.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender_id !== userId) supabase.rpc('mark_chat_read', { p_room: roomId });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_typing', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { user_id?: string };
          if (!row.user_id || row.user_id === userId) return;
          setPeerTyping(true);
          if (typingTimer.current) window.clearTimeout(typingTimer.current);
          typingTimer.current = window.setTimeout(() => setPeerTyping(false), 4000);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
    };
  }, [roomId, userId, load]);

  const send = useCallback(
    async (body: string, videoId?: string | null) => {
      if (!roomId) return { error: new Error('No conversation selected') };
      const { error } = await supabase.rpc('send_chat_message', {
        p_room: roomId,
        p_body: body || null,
        p_video_id: videoId ?? null,
      });
      if (!error) load();
      return { error };
    },
    [roomId, load],
  );

  const notifyTyping = useCallback(() => {
    if (roomId) supabase.rpc('set_typing', { p_room: roomId });
  }, [roomId]);

  return { messages, loading, peerTyping, send, notifyTyping, reload: load };
}

/** Heartbeat that keeps the signed-in user marked online. */
export function usePresenceHeartbeat(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
    const beat = () => {
      if (document.visibilityState === 'visible') supabase.rpc('touch_presence');
    };
    beat();
    const interval = window.setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [userId]);
}

/** Open (or create) a 1-on-1 conversation with another user. */
export async function openDirectMessage(otherUserId: string) {
  const { data, error } = await supabase.rpc('get_or_create_dm', { p_other: otherUserId });
  return { roomId: (data as string) ?? null, error };
}
