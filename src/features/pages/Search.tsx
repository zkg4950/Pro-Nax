/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { useSearchParams } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { Search, Filter, Clock, Eye, Video, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/loose';
import { FeedVideoCard } from '@/components/FeedVideoCard';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SearchResult {
  id: string;
  title: string;
  thumb_url: string;
  duration_seconds: number;
  views_count: number;
  comments_count: number;
  likes: number;
  created_at: string;
  owner_id: string;
  channel_name: string;
  channel_avatar: string;
  category: string;
  type: 'video' | 'channel';
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'videos' | 'channels'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDuration, setFilterDuration] = useState<string>('all');
  const [filterSort, setFilterSort] = useState<string>('relevance');

  useEffect(() => {
    if (query) {
      performSearch(query);
    }
  }, [query, filterType, filterCategory, filterDuration, filterSort]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      let searchResults: SearchResult[] = [];

      // Search videos
      if (filterType === 'all' || filterType === 'videos') {
        let videoQuery = supabase
          .from('videos')
          .select(`
            id,
            title,
            thumb_url,
            duration_seconds,
            views_count,
            comments_count,
            likes,
            created_at,
            owner_id,
            category,
            profiles!owner_id (
              display_name,
              avatar_url
            )
          `)
          .eq('visibility', 'public')
          .eq('status', 'ready')
          .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);

        // Apply category filter
        if (filterCategory !== 'all') {
          videoQuery = videoQuery.eq('category', filterCategory);
        }

        // Apply duration filter
        if (filterDuration === 'short') {
          videoQuery = videoQuery.lte('duration_seconds', 120);
        } else if (filterDuration === 'medium') {
          videoQuery = videoQuery.gte('duration_seconds', 120).lte('duration_seconds', 600);
        } else if (filterDuration === 'long') {
          videoQuery = videoQuery.gte('duration_seconds', 600);
        }

        // Apply sorting
        if (filterSort === 'views') {
          videoQuery = videoQuery.order('views_count', { ascending: false });
        } else if (filterSort === 'date') {
          videoQuery = videoQuery.order('created_at', { ascending: false });
        } else {
          // Relevance sorting (default)
          videoQuery = videoQuery.order('views_count', { ascending: false });
        }

        const { data: videosData, error: videosError } = await videoQuery.limit(50);

        if (!videosError && videosData) {
          const videoResults = videosData.map((video: any) => ({
            ...video,
            channel_name: video.profiles?.display_name || 'Unknown',
            channel_avatar: video.profiles?.avatar_url || '',
            type: 'video' as const,
          }));
          searchResults = [...searchResults, ...videoResults];
        }
      }

      // Search channels
      if (filterType === 'all' || filterType === 'channels') {
        const { data: channelsData, error: channelsError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, subscribers_count, videos_count')
          .ilike('display_name', `%${searchQuery}%`)
          .limit(20);

        if (!channelsError && channelsData) {
          const channelResults = channelsData.map((channel: any) => ({
            id: channel.id,
            title: channel.display_name,
            thumb_url: channel.avatar_url,
            duration_seconds: 0,
            views_count: channel.subscribers_count || 0,
            comments_count: 0,
            likes: 0,
            created_at: new Date().toISOString(),
            owner_id: channel.id,
            channel_name: channel.display_name,
            channel_avatar: channel.avatar_url,
            category: '',
            type: 'channel' as const,
          }));
          searchResults = [...searchResults, ...channelResults];
        }
      }

      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const searchQuery = formData.get('search') as string;
    if (searchQuery) {
      setSearchParams({ q: searchQuery });
    }
  };

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8">
      {/* Search Header */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              name="search"
              defaultValue={query}
              placeholder="Search videos, channels..."
              className="pl-10 h-12 text-lg"
            />
          </div>
          <Button type="submit" size="lg" className="px-8">
            Search
          </Button>
        </form>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <Select value={filterType} onValueChange={(v) => setFilterType(v as 'all' | 'videos' | 'channels')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="videos">Videos</SelectItem>
              <SelectItem value="channels">Channels</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Science & Technology">Science & Tech</SelectItem>
              <SelectItem value="Gaming">Gaming</SelectItem>
              <SelectItem value="Music">Music</SelectItem>
              <SelectItem value="Entertainment">Entertainment</SelectItem>
              <SelectItem value="Education">Education</SelectItem>
              <SelectItem value="Vlogs">Vlogs</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterDuration} onValueChange={setFilterDuration}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Duration</SelectItem>
              <SelectItem value="short">Short (&lt;2min)</SelectItem>
              <SelectItem value="medium">Medium (2-10min)</SelectItem>
              <SelectItem value="long">Long (&gt;10min)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSort} onValueChange={setFilterSort}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="views">Most Viewed</SelectItem>
              <SelectItem value="date">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : query ? (
        <>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              {results.length} results for "{query}"
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No results found for "{query}"</p>
              <p className="text-sm text-muted-foreground mt-2">Try different keywords or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {results.map((result, index) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  {result.type === 'channel' ? (
                    <ChannelResult result={result} />
                  ) : (
                    <FeedVideoCard
                      id={result.id}
                      title={result.title}
                      channel={result.channel_name}
                      views={result.views_count}
                      timeText={formatTimeAgo(result.created_at)}
                      durationText={formatDuration(result.duration_seconds)}
                      thumbUrl={result.thumb_url}
                      channelAvatar={result.channel_avatar}
                    />
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Search for videos, channels, and more</p>
        </div>
      )}
    </div>
  );
}

function ChannelResult({ result }: { result: SearchResult }) {
  return (
    <div className="glass-strong rounded-xl border border-border/40 p-4 hover:border-primary/50 transition cursor-pointer">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground shrink-0">
          {result.channel_name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{result.channel_name}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{formatNumber(result.views_count)} subscribers</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return '';
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
export default SearchPage;
