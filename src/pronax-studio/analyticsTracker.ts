/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React from "react";
import { supabase } from "@/integrations/supabase/loose";
import { useAuthSession } from "@/hooks/useAuthSession";

/**
 * Analytics event types
 */
export type AnalyticsEventType = 
  | 'view' 
  | 'impression' 
  | 'click' 
  | 'traffic_source' 
  | 'geography';

/**
 * Interface for analytics event data
 */
export interface AnalyticsEventData {
  videoId?: string;
  eventType: AnalyticsEventType;
  sessionId?: string;
  eventData?: Record<string, any>;
  countryCode?: string;
  countryName?: string;
  trafficSource?: string;
  referrerUrl?: string;
  userAgent?: string;
}

/**
 * Get or create a session ID for tracking user sessions
 */
export function getSessionId(): string {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

/**
 * Get country code from IP geolocation (mock implementation)
 * In production, this would use a real geolocation service
 */
export async function getCountryFromIP(): Promise<{ code: string; name: string } | null> {
  try {
    // Mock implementation - in production, use a real geolocation API
    // const response = await fetch('https://ipapi.co/json/');
    // const data = await response.json();
    // return { code: data.country_code, name: data.country_name };
    
    return null; // Return null for now, will be set to "Unknown" in the tracker
  } catch (error) {
    console.error('[analyticsTracker] Failed to get country:', error);
    return null;
  }
}

/**
 * Get traffic source from referrer
 */
export function getTrafficSource(): string {
  if (typeof window === 'undefined') return 'Unknown';
  
  const referrer = document.referrer;
  
  if (!referrer) return 'Direct';
  
  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();
    
    if (hostname.includes('google')) return 'Google Search';
    if (hostname.includes('facebook') || hostname.includes('fb.')) return 'Facebook';
    if (hostname.includes('twitter') || hostname.includes('x.com')) return 'Twitter/X';
    if (hostname.includes('linkedin')) return 'LinkedIn';
    
    if (hostname.includes('reddit')) return 'Reddit';
    if (hostname.includes('pinterest')) return 'Pinterest';
    
    return 'External';
  } catch {
    return 'External';
  }
}

/**
 * Track an analytics event
 */
export async function trackAnalyticsEvent(data: AnalyticsEventData): Promise<void> {
  const { user } = useAuthSession();
  const userId = user?.id;
  
  if (!userId) {
    console.warn('[analyticsTracker] Cannot track event: No user logged in');
    return;
  }
  
  try {
    const countryData = await getCountryFromIP();
    const trafficSource = data.trafficSource || getTrafficSource();
    
    const eventData = {
      user_id: userId,
      video_id: data.videoId || null,
      event_type: data.eventType,
      session_id: data.sessionId || getSessionId(),
      event_data: data.eventData || {},
      country_code: data.countryCode || countryData?.code || null,
      country_name: data.countryName || countryData?.name || null,
      traffic_source: trafficSource,
      referrer_url: data.referrerUrl || (typeof window !== 'undefined' ? document.referrer : null),
      user_agent: data.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    };
    
    await (supabase as any).from('analytics_events').insert(eventData);
  } catch (error) {
    console.error('[analyticsTracker] Failed to track event:', error);
    // Don't throw - we don't want analytics errors to break the app
  }
}

/**
 * Track a video view
 */
export async function trackVideoView(videoId: string, watchTimeSeconds?: number): Promise<void> {
  await trackAnalyticsEvent({
    videoId,
    eventType: 'view',
    eventData: { watch_time_seconds: watchTimeSeconds || 0 },
  });
}

/**
 * Track a video impression (thumbnail shown)
 */
export async function trackVideoImpression(videoId: string): Promise<void> {
  await trackAnalyticsEvent({
    videoId,
    eventType: 'impression',
  });
}

/**
 * Track a click event
 */
export async function trackClick(target: string, context?: Record<string, any>): Promise<void> {
  await trackAnalyticsEvent({
    eventType: 'click',
    eventData: { target, ...context },
  });
}

/**
 * Hook for automatic analytics tracking
 */
export function useAnalyticsTracker() {
  const { user } = useAuthSession();
  
  const trackView = React.useCallback(async (videoId: string, watchTimeSeconds?: number) => {
    if (!user?.id) return;
    await trackVideoView(videoId, watchTimeSeconds);
  }, [user?.id]);
  
  const trackImpression = React.useCallback(async (videoId: string) => {
    if (!user?.id) return;
    await trackVideoImpression(videoId);
  }, [user?.id]);
  
  const trackClickEvent = React.useCallback(async (target: string, context?: Record<string, any>) => {
    if (!user?.id) return;
    await trackClick(target, context);
  }, [user?.id]);
  
  return {
    trackView,
    trackImpression,
    trackClick: trackClickEvent,
  };
}