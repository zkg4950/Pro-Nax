/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearch, Link } from '@tanstack/react-router';
import { Search, X, SlidersHorizontal, Loader2, Clock, Eye, User, PlaySquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/loose';
import { toast } from 'sonner';
import { useAuthSession } from '@/hooks/useAuthSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FeedVideoCard } from '@/components/FeedVideoCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';

interface SearchResult {
  result_type: 'video' | 'channel' | 'playlist';
  id: string;
  title: string;
  description: string;
  thumb_url: string;
  duration_seconds: number | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  owner_id: string;
  category: string | null;
  tags: string[] | null;
  is_short: boolean | null;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  videos_count: number | null;
  rank: number;
}

interface SearchFilters {
  category: string | undefined;
  uploadDate: string | undefined;
  duration: string | undefined;
  type: string | undefined;
  sort: string | undefined;
}

const CATEGORIES = ['All', 'Gaming', 'Music', 'Sports', 'Tech', 'Education', 'Comedy', 'News', 'Cooking', 'Travel'];
const UPLOAD_DATES = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];
const DURATIONS = [
  { value: 'any', label: 'Any duration' },
  { value: 'short', label: 'Under 4 min' },
  { value: 'medium', label: '4–20 min' },
  { value: 'long', label: 'Over 20 min' },
];
const TYPES = [
  { value: 'any', label: 'All' },
  { value: 'video', label: 'Videos' },
  { value: 'short', label: 'Shorts' },
  { value: 'channel', label: 'Channels' },
];
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'date', label: 'Upload date' },
  { value: 'views', label: 'View count' },
  { value: 'rating', label: 'Rating' },
];

export default function SearchResults() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/search' });
  const { user } = useAuthSession();
  const [query, setQuery] = useState(search.q || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    category: search.category ?? undefined,
    uploadDate: search.uploadDate ?? undefined,
    duration: search.duration ?? undefined,
    type: search.type ?? undefined,
    sort: search.sort || 'relevance',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(search.q || '');
    setFilters({
      category: search.category ?? undefined,
      uploadDate: search.uploadDate ?? undefined,
      duration: search.duration ?? undefined,
      type: search.type ?? undefined,
      sort: search.sort || 'relevance',
    });
    setOffset(0);
  }, [search]);

  const performSearch = useCallback(async (newOffset: number) => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('search_videos', {
        p_query: query.trim(),
        p_category: filters.category === 'All' ? undefined : filters.category,
        p_upload_date: filters.uploadDate === 'any' ? undefined : filters.uploadDate,
        p_duration_filter: filters.duration === 'any' ? undefined : filters.duration,
        p_video_type: filters.type === 'any' ? undefined : filters.type,
        p_sort_by: filters.sort || 'relevance',
        p_limit: 20,
        p_offset: newOffset,
        p_include_channels: true,
        p_include_playlists: false,
      });

      if (error) throw error;

      const newResults = (data || []) as SearchResult[];
      
      if (newOffset === 0) {
        setResults(newResults);
      } else {
        setResults((prev) => [...prev, ...newResults]);
      }

      setHasMore(newResults.length >= 20);
      setOffset(newOffset + newResults.length);

      // Log search analytics
      if (newOffset === 0) {
        await supabase.rpc('log_search_analytics', {
          p_user_id: user?.id || undefined,
          p_query: query.trim(),
          p_results_count: newResults.length,
          p_filters: filters as any,
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      // Resilient fallback: if the ranking RPC is unavailable we still return
      // results from a plain table read instead of showing a dead page.
      try {
        const term = query.trim();
        let q = supabase
          .from('videos')
          .select('id,title,description,thumb_url,duration_seconds,views_count,likes_count,comments_count,created_at,owner_id,category,tags,is_short')
          .eq('visibility', 'public')
          .eq('status', 'ready')
          .or(`title.ilike.%${term}%,description.ilike.%${term}%`)
          .order('views_count', { ascending: false, nullsFirst: false })
          .range(newOffset, newOffset + 19);
        if (filters.category && filters.category !== 'All') q = q.eq('category', filters.category);
        const { data: rows } = await q;
        const mapped = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
          ...r,
          result_type: 'video',
          display_name: null,
          handle: null,
          avatar_url: null,
          followers_count: null,
          videos_count: null,
          rank: 0,
        })) as unknown as SearchResult[];
        if (newOffset === 0) setResults(mapped); else setResults((prev) => [...prev, ...mapped]);
        setHasMore(mapped.length >= 20);
        setOffset(newOffset + mapped.length);
      } catch {
        if (newOffset === 0) setResults([]);
        setHasMore(false);
        toast.error('Search failed', { description: 'Please try again later.' });
      }
    } finally {
      setLoading(false);
    }
  }, [query, filters, user?.id]);

  useEffect(() => {
    if (query) {
      const debounceTimer = setTimeout(() => {
        performSearch(0);
      }, 300);
      return () => clearTimeout(debounceTimer);
    }
  }, [query, filters, performSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate({
        to: '/search',
        search: {
          q: query.trim(),
          category: filters.category,
          uploadDate: filters.uploadDate,
          duration: filters.duration,
          type: filters.type,
          sort: filters.sort,
        },
      });
    }
  };

  const updateFilter = (key: keyof SearchFilters, value: string | undefined) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    navigate({
      to: '/search',
      search: {
        q: query,
        category: newFilters.category,
        uploadDate: newFilters.uploadDate,
        duration: newFilters.duration,
        type: newFilters.type,
        sort: newFilters.sort,
      },
    });
  };

  // Infinite scroll
  useEffect(() => {
    if (loading || !hasMore || !query) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          performSearch(offset);
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, hasMore, offset, query]);

  const channels = results.filter((r) => r.result_type === 'channel');
  const videos = results.filter((r) => r.result_type === 'video');

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8">
      {/* Search Header */}
      <div className="mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos, channels..."
              className="pl-10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={!query.trim()}>
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="relative"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
            {(filters.category || filters.uploadDate || filters.duration || filters.type) && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
            )}
          </Button>
        </form>
      </div>

      {/* Filters */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 p-4 bg-muted/50 rounded-lg space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <FilterSelect
              label="Category"
              value={filters.category || 'All'}
              options={CATEGORIES}
              onChange={(v) => updateFilter('category', v === 'All' ? undefined : v)}
            />
            <FilterSelect
              label="Upload date"
              value={filters.uploadDate || 'any'}
              options={UPLOAD_DATES.map((o) => o.label)}
              optionValues={UPLOAD_DATES.map((o) => o.value)}
              onChange={(v) => updateFilter('uploadDate', v === 'any' ? undefined : v)}
            />
            <FilterSelect
              label="Duration"
              value={filters.duration || 'any'}
              options={DURATIONS.map((o) => o.label)}
              optionValues={DURATIONS.map((o) => o.value)}
              onChange={(v) => updateFilter('duration', v === 'any' ? undefined : v)}
            />
            <FilterSelect
              label="Type"
              value={filters.type || 'any'}
              options={TYPES.map((o) => o.label)}
              optionValues={TYPES.map((o) => o.value)}
              onChange={(v) => updateFilter('type', v === 'any' ? undefined : v)}
            />
            <FilterSelect
              label="Sort by"
              value={filters.sort || 'relevance'}
              options={SORT_OPTIONS.map((o) => o.label)}
              optionValues={SORT_OPTIONS.map((o) => o.value)}
              onChange={(v) => updateFilter('sort', v)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({ category: undefined, uploadDate: undefined, duration: undefined, type: undefined, sort: 'relevance' });
              navigate({
                to: '/search',
                search: { q: query, category: undefined, uploadDate: undefined, duration: undefined, type: undefined, sort: undefined },
              });
            }}
          >
            Clear all filters
          </Button>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && results.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Results */}
      {!loading && query && results.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No results found</h3>
          <p className="text-muted-foreground mb-4">Try different keywords or adjust your filters</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {['ai shorts', 'gaming', 'tutorial', 'music', 'comedy'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setQuery(suggestion)}
                className="px-3 py-1 text-sm bg-muted hover:bg-muted/80 rounded-full transition"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Channels Section */}
      {channels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Channels
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((channel) => (
              <Link
                key={channel.id}
                to={`/channel/$handle`}
                params={{ handle: channel.handle || channel.id }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition"
              >
                <Avatar className="w-12 h-12">
                  <AvatarImage src={channel.avatar_url || undefined} />
                  <AvatarFallback>{channel.display_name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{channel.display_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(channel.followers_count || 0)} subscribers
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Videos Section */}
      {videos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PlaySquare className="w-5 h-5" />
            Videos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video) => (
              <FeedVideoCard
                key={video.id}
                id={video.id}
                title={video.title}
                channel="Creator"
                views={video.views_count || 0}
                timeText={formatTimeAgo(video.created_at)}
                durationText={formatDuration(video.duration_seconds)}
                thumbUrl={video.thumb_url}
              />
            ))}
          </div>
        </div>
      )}

      {/* Infinite Scroll Sentinel */}
      {hasMore && !loading && <div ref={sentinelRef} className="h-4" />}

      {/* Loading More */}
      {loading && results.length > 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  optionValues,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionValues?: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm"
      >
        {options.map((opt, i) => (
          <option key={opt} value={optionValues?.[i] || opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
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

function formatNumber(num: number | null): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}