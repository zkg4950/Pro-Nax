/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import React from 'react';

/**
 * Ad performance monitoring utility
 * Tracks ad rendering performance and metrics
 */

export interface AdPerformanceMetrics {
  placement: string;
  loadTime: number;
  renderTime: number;
  visibleTime: number;
  clickCount: number;
  impressionCount: number;
  errorCount: number;
  blocked: boolean;
}

export interface AdPerformanceEvent {
  type: 'load' | 'render' | 'visible' | 'click' | 'error' | 'blocked';
  placement: string;
  timestamp: number;
  data?: any;
}

class AdPerformanceMonitor {
  private metrics: Map<string, AdPerformanceMetrics> = new Map();
  private events: AdPerformanceEvent[] = [];
  private maxEvents = 1000;
  private startTime: number = Date.now();

  /**
   * Initialize metrics for a placement
   */
  initMetrics(placement: string): void {
    if (!this.metrics.has(placement)) {
      this.metrics.set(placement, {
        placement,
        loadTime: 0,
        renderTime: 0,
        visibleTime: 0,
        clickCount: 0,
        impressionCount: 0,
        errorCount: 0,
        blocked: false,
      });
    }
  }

  /**
   * Record a performance event
   */
  recordEvent(event: AdPerformanceEvent): void {
    this.events.push(event);
    
    // Keep events array bounded
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Update metrics
    const metrics = this.metrics.get(event.placement);
    if (metrics) {
      switch (event.type) {
        case 'load':
          metrics.loadTime = event.timestamp - this.startTime;
          break;
        case 'render':
          metrics.renderTime = event.timestamp - this.startTime;
          break;
        case 'visible':
          metrics.visibleTime = event.timestamp - this.startTime;
          metrics.impressionCount++;
          break;
        case 'click':
          metrics.clickCount++;
          break;
        case 'error':
          metrics.errorCount++;
          break;
        case 'blocked':
          metrics.blocked = true;
          break;
      }
    }

    console.log('[AdPerformanceMonitor]', event);
  }

  /**
   * Get metrics for a placement
   */
  getMetrics(placement: string): AdPerformanceMetrics | undefined {
    return this.metrics.get(placement);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): AdPerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get events for a placement
   */
  getEvents(placement: string): AdPerformanceEvent[] {
    return this.events.filter(e => e.placement === placement);
  }

  /**
   * Get all events
   */
  getAllEvents(): AdPerformanceEvent[] {
    return [...this.events];
  }

  /**
   * Clear metrics for a placement
   */
  clearMetrics(placement: string): void {
    this.metrics.delete(placement);
  }

  /**
   * Clear all metrics
   */
  clearAllMetrics(): void {
    this.metrics.clear();
    this.events = [];
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalPlacements: number;
    totalImpressions: number;
    totalClicks: number;
    totalErrors: number;
    totalBlocked: number;
    averageLoadTime: number;
    averageRenderTime: number;
  } {
    const allMetrics = this.getAllMetrics();
    const totalImpressions = allMetrics.reduce((sum, m) => sum + m.impressionCount, 0);
    const totalClicks = allMetrics.reduce((sum, m) => sum + m.clickCount, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errorCount, 0);
    const totalBlocked = allMetrics.filter(m => m.blocked).length;
    
    const averageLoadTime = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.loadTime, 0) / allMetrics.length
      : 0;
    
    const averageRenderTime = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.renderTime, 0) / allMetrics.length
      : 0;

    return {
      totalPlacements: allMetrics.length,
      totalImpressions,
      totalClicks,
      totalErrors,
      totalBlocked,
      averageLoadTime,
      averageRenderTime,
    };
  }
}

// Global instance
const adPerformanceMonitor = new AdPerformanceMonitor();

export function getAdPerformanceMonitor(): AdPerformanceMonitor {
  return adPerformanceMonitor;
}

/**
 * React hook for ad performance monitoring
 */
export function useAdPerformance(placement: string) {
  const monitor = getAdPerformanceMonitor();

  React.useEffect(() => {
    monitor.initMetrics(placement);
  }, [placement, monitor]);

  const recordLoad = React.useCallback(() => {
    monitor.recordEvent({
      type: 'load',
      placement,
      timestamp: Date.now(),
    });
  }, [placement, monitor]);

  const recordRender = React.useCallback(() => {
    monitor.recordEvent({
      type: 'render',
      placement,
      timestamp: Date.now(),
    });
  }, [placement, monitor]);

  const recordVisible = React.useCallback(() => {
    monitor.recordEvent({
      type: 'visible',
      placement,
      timestamp: Date.now(),
    });
  }, [placement, monitor]);

  const recordClick = React.useCallback(() => {
    monitor.recordEvent({
      type: 'click',
      placement,
      timestamp: Date.now(),
    });
  }, [placement, monitor]);

  const recordError = React.useCallback((error: any) => {
    monitor.recordEvent({
      type: 'error',
      placement,
      timestamp: Date.now(),
      data: { error: error.message || String(error) },
    });
  }, [placement, monitor]);

  const recordBlocked = React.useCallback(() => {
    monitor.recordEvent({
      type: 'blocked',
      placement,
      timestamp: Date.now(),
    });
  }, [placement, monitor]);

  const metrics = monitor.getMetrics(placement);

  return {
    metrics,
    recordLoad,
    recordRender,
    recordVisible,
    recordClick,
    recordError,
    recordBlocked,
  };
}