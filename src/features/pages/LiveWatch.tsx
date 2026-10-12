/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState, useRef } from 'react';
import { useParams } from '@/lib/router-compat';
import { Link } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { 
  Radio, Users, MessageSquare, Share2, Heart, Eye, Clock, 
  ChevronLeft, Send, MoreVertical, Volume2, VolumeX, 
  Maximize, Minimize, Settings, Flag, Activity, UserPlus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/loose';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthSession } from '@/hooks/useAuthSession';
import { HlsPlayer } from '@/components/HlsPlayer';
import { ReportModal } from '@/components/ReportModal';
import { LiveWatcherBadge } from '@/components/LiveWatcherBadge';

interface StreamData {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  playback_id: string;
  stream_key: string;
  status: 'live' | 'offline' | 'ended';
  viewer_count: number;
  category: string;
  created_at: string;
  owner_id: string;
  channel: {
    display_name: string;
    avatar_url: string;
    subscribers_count: number;
  };
}

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  message: string;
  created_at: string;
}

export default function LiveWatch() {
  const { playbackId } = useParams();
  const { user } = useAuthSession();
  const [stream, setStream] = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<string>('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Update page title and meta tags when stream data loads
  useEffect(() => {
    if (stream) {
      document.title = `${stream.title} — ${isLive ? 'LIVE • ' : ''}ProNax`;
      
      // Update meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', stream.description || `Watch ${stream.title} live on ProNax.`);
      }
      
      // Update OG tags
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', stream.title);
      }
      
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && stream.thumbnail_url) {
        ogImage.setAttribute('content', stream.thumbnail_url);
      }
    }
  }, [stream, isLive]);

  useEffect(() => {
    loadStreamData();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [playbackId]);

  // Calculate elapsed time for live streams
  useEffect(() => {
    if (!isLive || !stream?.created_at) return;

    const updateElapsedTime = () => {
      const start = new Date(stream.created_at);
      const now = new Date();
      const diff = now.getTime() - start.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        setElapsedTime(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setElapsedTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [isLive, stream?.created_at]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const loadStreamData = async () => {
    try {
      setLoading(true);
      
      // Get stream data
      const { data: streamData, error: streamError } = await supabase
        .from('streams')
        .select('*')
        .eq('mux_playback_id', playbackId ?? '')
        .maybeSingle();

      if (streamError) throw streamError;
      
      if (!streamData) {
        toast.error('Stream not found');
        return;
      }

      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, subscribers_count')
        .eq('id', streamData.user_id)
        .maybeSingle();

      const formattedStream: StreamData = {
        ...streamData,
        playback_id: streamData.mux_playback_id || '',
        owner_id: streamData.user_id,
        channel: {
          display_name: ownerProfile?.display_name || 'Unknown',
          avatar_url: ownerProfile?.avatar_url || '',
          subscribers_count: ownerProfile?.subscribers_count || 0,
        },
      } as StreamData;

      setStream(formattedStream);
      setIsLive(streamData.status === 'live');
      setViewerCount(streamData.viewer_count || 0);

      // Set up real-time updates
      setupRealtimeUpdates(streamData.id);
      
      // Load recent chat messages
      loadChatMessages(streamData.id);
      
    } catch (error) {
      console.error('Error loading stream:', error);
      toast.error('Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeUpdates = (streamId: string) => {
    // Clean up existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    
    const channel = supabase
      .channel(`stream:${streamId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'streams',
        filter: `id=eq.${streamId}`
      }, (payload) => {
        const updated = payload.new as any;
        setStream(prev => prev ? { ...prev, ...updated } : null);
        setViewerCount(updated.viewer_count || 0);
        setIsLive(updated.status === 'live');
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_chat_messages',
        filter: `stream_id=eq.${streamId}`
      }, (payload) => {
        const newMessage = payload.new as any;
        // Only add if not deleted
        if (!newMessage.is_deleted) {
          // Fetch user info for the message
          supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', newMessage.user_id)
            .single()
            .then(({ data: profile }) => {
              setChatMessages(prev => [...prev, {
                id: newMessage.id,
                user_id: newMessage.user_id,
                user_name: profile?.display_name || 'Anonymous',
                user_avatar: profile?.avatar_url || '',
                message: newMessage.body,
                created_at: newMessage.created_at
              }]);
            });
        }
      })
      .subscribe();

    channelRef.current = channel;
  };

  const loadChatMessages = async (streamId: string) => {
    try {
      const { data, error } = await supabase
        .from('live_chat_messages')
        .select(`
          *,
          profiles!user_id (
            display_name,
            avatar_url
          )
        `)
        .eq('stream_id', streamId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!error && data) {
        const formattedMessages = data.map((msg: any) => ({
          id: msg.id,
          user_id: msg.user_id,
          user_name: msg.profiles?.display_name || 'Anonymous',
          user_avatar: msg.profiles?.avatar_url || '',
          message: msg.body,
          created_at: msg.created_at
        }));
        setChatMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  const sendChatMessage = async () => {
    if (!user || !stream || !chatInput.trim()) return;

    // Rate limiting check (2 seconds cooldown)
    const now = Date.now();
    if (now - lastMessageTime < 2000) {
      toast.error('Please wait before sending another message');
      return;
    }

    try {
      // Check rate limit via RPC
      const { data: canSend, error: rateLimitError } = await supabase
        .rpc('rate_limit_chat_message', {
          p_user_id: user.id,
          p_stream_id: stream.id
        });

      if (rateLimitError || !canSend) {
        toast.error('Please wait before sending another message');
        return;
      }

      const { error } = await supabase.from('live_chat_messages').insert({
        stream_id: stream.id,
        user_id: user.id,
        body: chatInput.trim(),
      });

      if (error) throw error;
      
      setLastMessageTime(now);
      setChatInput('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    // In a real implementation, this would control the video player volume
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    // In a real implementation, this would toggle video player fullscreen
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading stream...</p>
        </div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-display font-bold text-primary mb-2">Stream Not Found</h1>
        <p className="text-muted-foreground mb-4">The stream you're looking for doesn't exist or has ended.</p>
        <Link to="/" className="text-primary underline">← Back home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Video Player Section */}
      <div className="relative bg-black aspect-video max-h-[70vh]">
        {stream.status === 'ended' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-white text-lg font-semibold mb-2">Stream Ended</p>
              <p className="text-gray-400 text-sm mb-4">This stream has ended</p>
              {stream.playback_id && (
                <Link 
                  to={`/watch/${stream.playback_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition"
                >
                  <Radio className="w-4 h-4" />
                  Watch Recording
                </Link>
              )}
            </div>
          </div>
        ) : stream.playback_id ? (
          <HlsPlayer
            playbackId={stream.playback_id}
            isLive={isLive}
            onError={(error) => console.error('Player error:', error)}
            onStreamEnded={() => setIsLive(false)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isLive ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Radio className="w-8 h-8 text-white" />
                </div>
                <p className="text-white text-lg font-semibold">Stream is Live</p>
                <p className="text-gray-400 text-sm">Initializing player...</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-white text-lg font-semibold">Stream Offline</p>
                <p className="text-gray-400 text-sm">Stream is not currently live</p>
              </div>
            )}
          </div>
        )}

        {/* Live viewer count overlay */}
        {isLive && (
          <div className="absolute top-4 left-4">
            <LiveWatcherBadge 
              videoId={stream.id} 
              baseViewsCount={viewerCount}
              variant="3d-overlay"
              showText={true}
            />
          </div>
        )}
      </div>

      {/* Stream Info */}
      <div className="container max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start gap-6">
          {/* Main Content */}
          <div className="flex-1">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold mb-2">{stream.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {isLive && elapsedTime && (
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-red-500" />
                      <span className="text-red-400 font-semibold">LIVE</span>
                      <span className="text-muted-foreground">•</span>
                      <span>{elapsedTime}</span>
                    </div>
                  )}
                  {!isLive && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>Started {new Date(stream.created_at).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>{viewerCount.toLocaleString()} viewers</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success('Link copied to clipboard');
                }}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button variant="outline" size="sm" onClick={() => setReportModalOpen(true)}>
                  <Flag className="w-4 h-4 mr-2" />
                  Report
                </Button>
              </div>
            </div>

            {stream.description && (
              <p className="text-muted-foreground mb-6">{stream.description}</p>
            )}

            {/* Chat Section */}
            <div className="glass-strong rounded-xl border border-border/40 overflow-hidden">
              <div className="p-4 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Live Chat</h3>
                  <span className="text-sm text-muted-foreground">({chatMessages.length})</span>
                </div>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>

              <div 
                ref={chatContainerRef}
                className="h-96 overflow-y-auto p-4 space-y-3"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet. Be the first to chat!</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={msg.user_avatar} />
                        <AvatarFallback>{msg.user_name[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{msg.user_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-border/30">
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    placeholder={user ? "Type a message..." : "Sign in to chat"}
                    disabled={!user}
                    className="flex-1"
                  />
                  <Button 
                    onClick={sendChatMessage}
                    disabled={!user || !chatInput.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-80 space-y-4">
            {/* Channel Info */}
            <div className="glass-strong rounded-xl border border-border/40 p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={stream.channel.avatar_url} />
                  <AvatarFallback>{stream.channel.display_name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{stream.channel.display_name}</h3>
                  <p className="text-sm text-muted-foreground">{stream.channel.subscribers_count.toLocaleString()} subscribers</p>
                </div>
              </div>
              <Button className="w-full gradient-primary">
                <UserPlus className="w-4 h-4 mr-2" />
                Follow
              </Button>
            </div>

            {/* Stream Stats */}
            <div className="glass-strong rounded-xl border border-border/40 p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Stream Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium">{stream.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`font-medium ${isLive ? 'text-red-400' : 'text-gray-400'}`}>
                    {stream.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Viewers</span>
                  <span className="font-medium">{viewerCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      <ReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        targetType="video"
        targetId={stream.id}
        targetTitle={stream.title}
        targetChannelName={stream.channel.display_name}
      />
    </div>
  );
}