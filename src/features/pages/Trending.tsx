/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, Clock, Eye, MessageSquare, Heart, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/loose';
import { FeedVideoCard } from '@/components/FeedVideoCard';
import { Loader2 } from 'lucide-react';

interface TrendingVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  thumb_url: string;
  duration_seconds: number;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  owner_id: string;
  velocity_score: number;
  hours_since_publish: number;
  trending_rank: bigint;
  channel_name: string;
  channel_avatar: string;
  rank_change?: number; // Rank change vs previous snapshot
}

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  enabled: boolean;
}

type TimeWindow = '24h' | '7d' | '30d';

export default function Trending() {
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [previousRanks, setPreviousRanks] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    loadCategories();
    loadTrendingVideos();
  }, [selectedCategory, timeWindow]);

  const loadCategories = async () => {
    try {
      const { data } = await supabase
        .from('categories')
        .select('id, slug, name, icon, enabled')
        .eq('enabled', true)
        .order('sort_order', { ascending: true });

      if (data) {
        setCategories(data as Category[]);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadTrendingVideos = async () => {
    setLoading(true);
    try {
      // Map time window to interval
      const windowMap: Record<TimeWindow, string> = {
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
      };

      const categoryParam = selectedCategory === 'all' ? null : selectedCategory;
      
      // Call the trending function
      const { data: trendingData, error } = await supabase.rpc('get_trending_videos', {
        p_category: categoryParam ?? undefined,
        p_region: undefined,
        p_window: windowMap[timeWindow],
        p_limit: 50,
        p_cursor: undefined
      });

      if (error) throw error;

      // Store previous ranks for comparison
      const newRanks = new Map<string, number>();
      const videosWithChange = (trendingData || []).map((video: any) => {
        const oldRank = previousRanks.get(video.id);
        newRanks.set(video.id, Number(video.trending_rank));
        
        return {
          ...video,
          rank_change: oldRank ? Number(video.trending_rank) - oldRank : 0,
        };
      });

      // Fetch channel info for each video
      const videoIds = videosWithChange.map((v: any) => v.owner_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', videoIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const finalVideos = videosWithChange.map((video: any) => ({
        ...video,
        channel_name: profileMap.get(video.owner_id)?.display_name || 'Unknown',
        channel_avatar: profileMap.get(video.owner_id)?.avatar_url || '',
      }));

      setVideos(finalVideos);
      setPreviousRanks(newRanks);
    } catch (error) {
      console.error('Error loading trending videos:', error);
      // Fallback to simple query if RPC not available
      loadFallbackTrending();
    } finally {
      setLoading(false);
    }
  };

  const loadFallbackTrending = async () => {
    try {
      const windowMap: Record<TimeWindow, string> = {
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
      };
      
      const timeThreshold = new Date(Date.now() - (
        timeWindow === '24h' ? 24 * 60 * 60 * 1000 :
        timeWindow === '7d' ? 7 * 24 * 60 * 60 * 1000 :
        30 * 24 * 60 * 60 * 1000
      ));

      const { data: videosData } = await supabase
        .from('videos')
        .select(`
          id,
          title,
          thumb_url,
          duration_seconds,
          views_count,
          comments_count,
          likes_count,
          shares_count,
          created_at,
          owner_id,
          category
        `)
        .eq('visibility', 'public')
        .eq('status', 'ready')
        .gte('created_at', new Date(timeThreshold).toISOString())
        .order('views_count', { ascending: false })
        .limit(50);

      const finalVideos = (videosData || []).map((video: any, index: number) => ({
        ...video,
        velocity_score: video.views_count || 0,
        hours_since_publish: (Date.now() - new Date(video.created_at).getTime()) / (1000 * 60 * 60),
        trending_rank: BigInt(index + 1),
        rank_change: 0,
        channel_name: 'Unknown',
        channel_avatar: '',
      }));

      setVideos(finalVideos);
    } catch (error) {
      console.error('Error loading fallback trending:', error);
      setVideos([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading trending videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Flame className="w-8 h-8 text-orange-500" />
          <h1 className="text-3xl font-bold">Trending</h1>
        </div>
        <p className="text-muted-foreground">Discover what's hot right now on ProNax with our velocity-based ranking algorithm</p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.slug)}
            className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              selectedCategory === cat.slug
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Time Window Switcher */}
      <div className="flex gap-2 mb-6">
        {(['24h', '7d', '30d'] as TimeWindow[]).map((window) => (
          <button
            key={window}
            onClick={() => setTimeWindow(window)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              timeWindow === window
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {window === '24h' ? '24 Hours' : window === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      {/* Trending Videos Grid */}
      {videos.length === 0 ? (
        <div className="text-center py-12">
          <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No trending videos found for this time period.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video, index) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="relative">
                  {/* Trending Rank Badge */}
                  <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 py-1 rounded-md text-sm font-bold shadow-lg">
                    #{video.trending_rank}
                  </div>
                  
                  {/* Rank Change Indicator */}
                  {(video.rank_change ?? 0) !== 0 && (
                    <div className={`absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold ${
                      (video.rank_change ?? 0) > 0 ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                      {(video.rank_change ?? 0) > 0 ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )}
                      {Math.abs(video.rank_change ?? 0)}
                    </div>
                  )}
                  
                  <FeedVideoCard
                    id={video.id}
                    title={video.title}
                    channel={video.channel_name}
                    views={video.views_count}
                    timeText={formatTimeAgo(video.created_at)}
                    durationText={formatDuration(video.duration_seconds)}
                    thumbUrl={video.thumb_url}
                    channelAvatar={video.channel_avatar}
                    topBadge={
                      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 py-1 rounded-md text-sm font-bold shadow-lg">
                        #{video.trending_rank}
                      </div>
                    }
                  />
                  
                  {/* Trending Metrics */}
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>{formatNumber(video.views_count)} views</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-500" />
                      <span className="text-green-500">
                        Velocity: {video.velocity_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatHours(video.hours_since_publish)} old</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatHours(hours: number): string {
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}