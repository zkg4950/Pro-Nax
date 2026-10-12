/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface InfiniteScrollOptions {
  /** Root margin for IntersectionObserver (default: '600px') */
  rootMargin?: string;
  /** Threshold for IntersectionObserver (default: 0.1) */
  threshold?: number;
  /** Debounce delay for scroll events in ms (default: 100) */
  scrollDebounceDelay?: number;
  /** Whether loading is in progress */
  isLoading?: boolean;
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Whether to disable the observer */
  disabled?: boolean;
}

interface InfiniteScrollResult {
  /** Sentinel element ref */
  sentinelRef: React.RefObject<HTMLDivElement>;
  /** Whether more items are being loaded by the hook */
  isLoading: boolean;
  /** Manually trigger load more */
  loadMore: () => Promise<void>;
  /** Reset the infinite scroll state */
  reset: () => void;
}

/**
 * Enhanced infinite scroll hook with proper cleanup, debouncing, and memory management
 * Designed to work with existing data management systems (like FeedManager)
 */
export function useInfiniteScroll(
  onLoadMore: () => Promise<void>,
  options: InfiniteScrollOptions = {}
): InfiniteScrollResult {
  const {
    rootMargin = '600px',
    threshold = 0.1,
    scrollDebounceDelay = 100,
    isLoading: externalIsLoading = false,
    hasMore: externalHasMore = true,
    disabled = false,
  } = options;

  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [internalIsLoading, setInternalIsLoading] = useState(false);

  // Combined loading state
  const isLoading = externalIsLoading || internalIsLoading;

  // Load more function with debouncing
  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !externalHasMore || disabled) return;

    // Debounce the load more call
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      isLoadingRef.current = true;
      setInternalIsLoading(true);

      try {
        await onLoadMore();
      } catch (error) {
        console.error('[useInfiniteScroll] Load more failed:', error);
      } finally {
        isLoadingRef.current = false;
        setInternalIsLoading(false);
        debounceTimerRef.current = null;
      }
    }, scrollDebounceDelay);
  }, [externalHasMore, disabled, onLoadMore, scrollDebounceDelay]);

  // Intersection Observer setup with proper cleanup
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || isLoading || !externalHasMore || disabled) return;

    // Clean up existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // Create new observer
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || isLoadingRef.current || disabled) return;
        await loadMore();
      },
      { rootMargin, threshold }
    );

    observerRef.current = observer;
    observer.observe(sentinel);

    // Cleanup function
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isLoading, externalHasMore, disabled, loadMore, rootMargin, threshold]);

  // Reset function
  const reset = useCallback(() => {
    isLoadingRef.current = false;
    setInternalIsLoading(false);
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  return {
    sentinelRef,
    isLoading,
    loadMore,
    reset,
  };
}