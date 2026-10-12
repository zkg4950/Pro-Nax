/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/loose';

export interface FeedVideo {
  id: string;
  title: string;
  description: string | null;
  thumb_url: string | null;
  video_url: string | null;
  owner_id: string;
  created_at: string;
  duration_seconds: number | null;
  is_short: boolean | null;
  category: string | null;
  preview_sprite_url?: string | null;
  preview_sprite_frames?: number | null;
  ownerName?: string;
  ownerAvatar?: string | null;
  views?: number;
  likes?: number;
}

export type FeedKind = 'foryou' | 'trending' | 'following';

export interface FeedConfig {
  pageSize: number;
  cacheSize: number;
  enableWatchHistoryFilter: boolean;
  enablePersonalizedFeed: boolean;
}

export interface FeedState {
  videos: FeedVideo[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  lastFetch: number;
  category: string;
  kind: FeedKind;
}

const DEFAULT_CONFIG: FeedConfig = {
  pageSize: 24,
  cacheSize: 100,
  enableWatchHistoryFilter: true,
  enablePersonalizedFeed: true,
};

/**
 * Optimized feed manager with simplified data fetching strategy
 */
export class FeedManager {
  private config: FeedConfig;
  private state: FeedState;
  private cache: Map<string, { data: FeedVideo[]; timestamp: number }> = new Map();
  private watchedCache: Set<string> | null = null;
  private loadingPromise: Promise<void> | null = null;
  private listeners: Set<(state: FeedState) => void> = new Set();

  constructor(config: Partial<FeedConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      videos: [],
      loading: false,
      error: null,
      hasMore: true,
      lastFetch: 0,
      category: 'All',
      kind: 'foryou',
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: FeedState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify listeners of state changes
   */
  private notifyListeners(): void {
    console.log('[FeedManager] Notifying listeners with state:', {
      loading: this.state.loading,
      videosCount: this.state.videos.length,
      error: this.state.error,
      hasMore: this.state.hasMore
    });
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Get watched video IDs (cached)
   */
  private async getWatchedIds(): Promise<Set<string>> {
    if (this.watchedCache) return this.watchedCache;

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return new Set<string>();

      const { data } = await supabase
        .from('watch_history')
        .select('video_id')
        .eq('user_id', auth.user.id)
        .order('watched_at', { ascending: false })
        .limit(300);

      this.watchedCache = new Set<string>((data ?? []).map((h: { video_id: string }) => h.video_id));
      return this.watchedCache;
    } catch {
      return new Set<string>();
    }
  }

  /**
   * Enrich videos with owner information
   */
  private async enrichVideos(videos: FeedVideo[]): Promise<FeedVideo[]> {
    if (!videos.length) return videos;

    const ownerIds = [...new Set(videos.map(v => v.owner_id))].filter(Boolean);
    if (!ownerIds.length) return videos;

    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', ownerIds);

      const nameMap = new Map<string, string>((profiles ?? []).map((p: { id: string; display_name?: string | null }) => [p.id, p.display_name || 'Creator'] as const));
      const avatarMap = new Map<string, string | null>((profiles ?? []).map((p: { id: string; avatar_url?: string | null }) => [p.id, p.avatar_url ?? null] as const));

      return videos.map(v => ({
        ...v,
        ownerName: v.ownerName || nameMap.get(v.owner_id) || 'Creator',
        ownerAvatar: v.ownerAvatar || avatarMap.get(v.owner_id),
        likes: v.likes ?? (v as any).likes_count ?? 0,
        views: v.views ?? (v as any).views_count ?? 0,
      }));
    } catch {
      return videos.map(v => ({
        ...v,
        ownerName: v.ownerName || 'Creator',
        likes: v.likes ?? (v as any).likes_count ?? 0,
        views: v.views ?? (v as any).views_count ?? 0,
      }));
    }
  }

  /**
   * Filter videos based on watch history
   */
  private async filterWatchedVideos(videos: FeedVideo[], kind: FeedKind): Promise<FeedVideo[]> {
    if (!this.config.enableWatchHistoryFilter || kind !== 'foryou') {
      return videos;
    }

    const watchedIds = await this.getWatchedIds();
    if (watchedIds.size > 0) {
      return videos.filter(v => !watchedIds.has(v.id));
    }
    return videos;
  }

  /**
   * Load a single page of videos with robust fallback
   */
  async loadPage(kind: FeedKind, offset: number, category: string): Promise<FeedVideo[]> {
    const cacheKey = `${kind}_${category}_${offset}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1-minute cache
      console.log('[FeedManager] Using cached data for:', cacheKey);
      return cached.data;
    }

    console.log('[FeedManager] Loading page:', { kind, offset, category });

    try {
      const catParam = category === 'All' ? null : category;
      const selectCols = 'id,title,description,thumb_url,video_url,owner_id,created_at,views_count,likes_count,duration_seconds,is_short,category,preview_sprite_url,preview_sprite_frames';
      
      let query = supabase
        .from('videos')
        .select(selectCols)
        .eq('visibility', 'public')
        .eq('status', 'ready');

      if (catParam) {
        query = query.ilike('category', catParam);
      }

      // Order based on feed kind
      if (kind === 'trending') {
        query = query.order('views_count', { ascending: false, nullsFirst: false })
                      .order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      console.log('[FeedManager] Executing Supabase query with range:', offset, 'to', offset + this.config.pageSize - 1);
      const { data, error } = await query.range(offset, offset + this.config.pageSize - 1);

      if (error) {
        console.error('[FeedManager] Database query failed:', error);
        throw error;
      }

      console.log('[FeedManager] Query returned:', data?.length || 0, 'videos');

      // Handle null/undefined data gracefully
      if (!data || data.length === 0) {
        console.log('[FeedManager] No videos found for query:', { kind, offset, category });
        return [];
      }

      // Enrich with owner information
      const enriched = await this.enrichVideos(data as FeedVideo[]);

      // Cache the results
      this.cache.set(cacheKey, {
        data: enriched,
        timestamp: Date.now(),
      });

      // Clean up old cache entries
      this.cleanupCache();

      return enriched;
    } catch (error) {
      console.error('[FeedManager] Load page failed, trying fallback query:', error);
      
      // EMERGENCY FALLBACK: Try a simpler query without status filter
      try {
        console.log('[FeedManager] Emergency fallback: executing simplified query');
        const catParam = category === 'All' ? null : category;
        const simpleSelectCols = 'id,title,description,thumb_url,video_url,owner_id,created_at,views_count,likes_count,duration_seconds,is_short,category';
        
        let fallbackQuery = supabase
          .from('videos')
          .select(simpleSelectCols)
          .eq('visibility', 'public');

        if (catParam) {
          fallbackQuery = fallbackQuery.ilike('category', catParam);
        }

        fallbackQuery = fallbackQuery.order('created_at', { ascending: false });
        
        const { data: fallbackData, error: fallbackError } = await fallbackQuery.range(offset, offset + this.config.pageSize - 1);
        
        if (fallbackError) {
          console.error('[FeedManager] Fallback query also failed:', fallbackError);
          // Instead of throwing, return empty array to prevent infinite loading
          console.log('[FeedManager] Both queries failed, returning empty array to prevent infinite loading');
          return [];
        }

        console.log('[FeedManager] Fallback query returned:', fallbackData?.length || 0, 'videos');
        
        if (!fallbackData || fallbackData.length === 0) {
          return [];
        }

        const enriched = await this.enrichVideos(fallbackData as FeedVideo[]);
        
        this.cache.set(cacheKey, {
          data: enriched,
          timestamp: Date.now(),
        });

        return enriched;
      } catch (fallbackError) {
        console.error('[FeedManager] Fallback query threw exception:', fallbackError);
        // Return empty array to prevent infinite loading state
        console.log('[FeedManager] Fallback exception caught, returning empty array to prevent infinite loading');
        return [];
      }
    }
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }

    // Limit cache size
    if (this.cache.size > this.config.cacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest entries
      const toRemove = entries.slice(0, entries.length - this.config.cacheSize);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Load initial videos with multiple safety mechanisms
   */
  async loadInitial(kind: FeedKind, category: string): Promise<void> {
    if (this.loadingPromise) {
      console.log('[FeedManager] Already loading, waiting for existing promise');
      await this.loadingPromise;
      return;
    }

    console.log('[FeedManager] Starting initial load:', { kind, category });

    // Single safety timeout as backup (increased to 15 seconds to allow for slow connections)
    const timeoutId = setTimeout(() => {
      if (this.state.loading) {
        console.error('[FeedManager] Loading timeout - forcing loading state to false');
        this.state.loading = false;
        this.state.error = 'Loading timeout - please refresh';
        this.notifyListeners();
      }
    }, 15000); // 15 second timeout for slow connections

    this.loadingPromise = (async () => {
      try {
        this.state.loading = true;
        this.state.error = null;
        this.notifyListeners();

        console.log('[FeedManager] Calling loadPage with:', { kind, offset: 0, category });
        const videos = await this.loadPage(kind, 0, category);
        console.log('[FeedManager] loadPage returned:', videos.length, 'videos');
        
        // Filter watched videos for personalized feed
        const filtered = await this.filterWatchedVideos(videos, kind);
        console.log('[FeedManager] After filtering:', filtered.length, 'videos');

        this.state.videos = filtered;
        this.state.hasMore = videos.length >= this.config.pageSize;
        this.state.kind = kind;
        this.state.category = category;
        this.state.lastFetch = Date.now();
        
        // Set loading to false AFTER all other state updates
        this.state.loading = false;
        console.log('[FeedManager] Load complete, setting loading=false');
        this.notifyListeners();
      } catch (error) {
        console.error('[FeedManager] Initial load failed:', error);
        this.state.error = error instanceof Error ? error.message : 'Failed to load feed';
        this.state.videos = [];
        this.state.hasMore = false;
        
        // Set loading to false AFTER all other state updates
        this.state.loading = false;
        console.log('[FeedManager] Load failed, setting loading=false');
        this.notifyListeners();
      } finally {
        // CRITICAL: Ensure loading is ALWAYS set to false, no matter what
        console.log('[FeedManager] FINALLY BLOCK - forcing loading=false');
        this.state.loading = false;
        this.loadingPromise = null;
        clearTimeout(timeoutId);
        this.notifyListeners();
      }
    })();

    await this.loadingPromise;
  }

  /**
   * Load more videos (pagination) with safety mechanisms
   */
  async loadMore(): Promise<void> {
    if (this.state.loading || !this.state.hasMore) {
      return;
    }

    // Safety timeout for loadMore as well
    const timeoutId = setTimeout(() => {
      if (this.state.loading) {
        console.error('[FeedManager] LoadMore timeout - forcing loading=false');
        this.state.loading = false;
        this.notifyListeners();
      }
    }, 15000); // Increased to 15 seconds

    try {
      this.state.loading = true;
      this.state.error = null;
      this.notifyListeners();

      const offset = this.state.videos.length;
      const videos = await this.loadPage(this.state.kind, offset, this.state.category);
      
      // Filter watched videos for personalized feed
      const filtered = await this.filterWatchedVideos(videos, this.state.kind);

      this.state.videos = [...this.state.videos, ...filtered];
      this.state.hasMore = videos.length >= this.config.pageSize;
      this.state.lastFetch = Date.now();
      this.state.loading = false; // Set loading to false before notifying
      this.notifyListeners();
    } catch (error) {
      console.error('[FeedManager] Load more failed:', error);
      this.state.error = error instanceof Error ? error.message : 'Failed to load more videos';
      this.state.loading = false; // Set loading to false before notifying
      this.notifyListeners();
    } finally {
      // CRITICAL: Ensure loading is ALWAYS set to false
      this.state.loading = false;
      clearTimeout(timeoutId);
      this.notifyListeners();
    }
  }

  /**
   * Refresh current feed
   */
  async refresh(): Promise<void> {
    // Clear cache to force fresh data
    this.cache.clear();
    this.watchedCache = null;
    
    await this.loadInitial(this.state.kind, this.state.category);
  }

  /**
   * Change feed kind or category
   */
  async changeFeed(kind: FeedKind, category: string): Promise<void> {
    if (this.state.kind === kind && this.state.category === category) {
      return;
    }

    this.state.videos = [];
    this.state.hasMore = true;
    this.state.kind = kind;
    this.state.category = category;
    this.state.loading = true; // Set loading to true when changing feed
    this.state.error = null;
    this.notifyListeners();
    
    await this.loadInitial(kind, category);
  }

  /**
   * Get current state
   */
  getState(): FeedState {
    return this.state;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.watchedCache = null;
  }
}

/**
 * React hook for using the feed manager
 */
export function useFeed(config?: Partial<FeedConfig>) {
  const feedManagerRef = useRef<FeedManager | null>(null);
  const [state, setState] = useState<FeedState>({
    videos: [],
    loading: true,
    error: null,
    hasMore: true,
    lastFetch: 0,
    category: 'All',
    kind: 'foryou',
  });

  useEffect(() => {
    console.log('[useFeed] Initializing feed manager');
    const manager = new FeedManager(config);
    feedManagerRef.current = manager;

    // Subscribe to state changes
    const unsubscribe = manager.subscribe((newState) => {
      console.log('[useFeed] State updated:', { 
        loading: newState.loading, 
        videosCount: newState.videos.length, 
        error: newState.error 
      });
      setState(newState);
    });

    // Load initial feed
    console.log('[useFeed] Triggering initial load');
    manager.loadInitial('foryou', 'All').catch(err => {
      console.error('[useFeed] Initial load error:', err);
      // Ensure loading is set to false even if load fails
      setState(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed to load feed' }));
    });

    return () => {
      console.log('[useFeed] Cleaning up feed manager');
      unsubscribe();
      manager.clearCache();
    };
    // Only recreate manager if config actually changes (using stable reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety effect to ensure loading is never stuck at true
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setState(prev => {
        if (prev.loading) {
          console.error('[useFeed] SAFETY TIMEOUT - forcing loading to false');
          return { ...prev, loading: false, error: 'Loading timeout' };
        }
        return prev;
      });
    }, 20000); // 20 second safety timeout

    return () => clearTimeout(safetyTimer);
  }, []);

  const loadMore = useCallback(async () => {
    if (feedManagerRef.current) {
      await feedManagerRef.current.loadMore();
    }
  }, []);

  const refresh = useCallback(async () => {
    if (feedManagerRef.current) {
      await feedManagerRef.current.refresh();
    }
  }, []);

  const changeFeed = useCallback(async (kind: FeedKind, category: string) => {
    if (feedManagerRef.current) {
      await feedManagerRef.current.changeFeed(kind, category);
    }
  }, []);

  return {
    ...state,
    loadMore,
    refresh,
    changeFeed,
  };
}