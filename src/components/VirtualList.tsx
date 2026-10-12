/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualScrollOptions {
  /** Approximate height of each item in pixels (default: 300) */
  itemHeight?: number;
  /** Number of items to render outside viewport (default: 5) */
  overscan?: number;
  /** Whether to enable virtual scrolling (default: true) */
  enabled?: boolean;
  /** Total number of items */
  totalCount: number;
}

interface VirtualScrollResult {
  /** Visible range of items */
  visibleRange: { start: number; end: number };
  /** Sentinel ref for the top of the list */
  topSentinelRef: React.RefObject<HTMLDivElement>;
  /** Sentinel ref for the bottom of the list */
  bottomSentinelRef: React.RefObject<HTMLDivElement>;
  /** Container ref for measurements */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Whether virtual scrolling is active */
  isActive: boolean;
}

/**
 * Virtual scrolling hook for large lists
 * Renders only visible items to improve performance
 */
export function useVirtualScroll(
  options: VirtualScrollOptions
): VirtualScrollResult {
  const {
    itemHeight = 300,
    overscan = 5,
    enabled = true,
    totalCount,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: Math.min(totalCount, overscan * 2) });
  const [isActive, setIsActive] = useState(false);

  // Calculate visible range based on scroll position
  const calculateVisibleRange = useCallback(() => {
    if (!containerRef.current || !enabled) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      totalCount,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
    );

    setVisibleRange({ start: startIndex, end: endIndex });
  }, [enabled, itemHeight, overscan, totalCount]);

  // Activate virtual scrolling when item count exceeds threshold
  useEffect(() => {
    const threshold = 50; // Activate virtual scrolling for 50+ items
    setIsActive(enabled && totalCount >= threshold);
  }, [enabled, totalCount]);

  // Set up scroll listener
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    let scrollTimer: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(calculateVisibleRange, 16); // ~60fps
    };

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });

    // Initial calculation
    calculateVisibleRange();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimer);
    };
  }, [isActive, calculateVisibleRange]);

  // Recalculate on window resize
  useEffect(() => {
    if (!isActive) return;

    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(calculateVisibleRange, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [isActive, calculateVisibleRange]);

  // Observe top sentinel for scroll-to-top functionality
  useEffect(() => {
    if (!isActive || !topSentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // User scrolled to top, reset visible range
            setVisibleRange({ start: 0, end: Math.min(totalCount, overscan * 2) });
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [isActive, overscan, totalCount]);

  return {
    visibleRange,
    topSentinelRef,
    bottomSentinelRef,
    containerRef,
    isActive,
  };
}

interface VirtualListProps<T> {
  /** Items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Approximate height of each item in pixels */
  itemHeight?: number;
  /** Number of items to render outside viewport */
  overscan?: number;
  /** Whether to enable virtual scrolling */
  enabled?: boolean;
  /** Container className */
  className?: string;
  /** Container style */
  style?: React.CSSProperties;
}

/**
 * Virtual list component for rendering large datasets efficiently
 */
export function VirtualList<T>({
  items,
  renderItem,
  itemHeight = 300,
  overscan = 5,
  enabled = true,
  className = '',
  style = {},
}: VirtualListProps<T>) {
  const {
    visibleRange,
    topSentinelRef,
    bottomSentinelRef,
    containerRef,
    isActive,
  } = useVirtualScroll({
    itemHeight,
    overscan,
    enabled,
    totalCount: items.length,
  });

  // If virtual scrolling is not active, render all items
  if (!isActive) {
    return (
      <div ref={containerRef} className={className} style={style}>
        {items.map((item, index) => renderItem(item, index))}
      </div>
    );
  }

  // Calculate total height for scroll container
  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  // Render only visible items
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);

  return (
    <div
      ref={containerRef}
      className={`virtual-scroll-container ${className}`}
      style={{
        ...style,
        height: style.height || '100%',
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      {/* Top sentinel */}
      <div ref={topSentinelRef} style={{ height: 1 }} />
      
      {/* Spacer to maintain scroll position */}
      <div style={{ height: offsetY }} />
      
      {/* Visible items */}
      <div>
        {visibleItems.map((item, index) => (
          <div
            key={visibleRange.start + index}
            style={{ height: itemHeight }}
          >
            {renderItem(item, visibleRange.start + index)}
          </div>
        ))}
      </div>
      
      {/* Spacer for remaining items */}
      <div style={{ height: (items.length - visibleRange.end) * itemHeight }} />
      
      {/* Bottom sentinel */}
      <div ref={bottomSentinelRef} style={{ height: 1 }} />
    </div>
  );
}