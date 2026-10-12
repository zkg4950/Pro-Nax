/**
 * Supervisor Realtime Event Listener
 * Listens to Supabase Realtime events and triggers supervisor actions
 * Integrates with audit_logs, videos, and profiles tables for event-driven supervision
 */

import { createClient } from '@supabase/supabase-js';
import { executeSupervisor } from './supervisorGraph';
import { SystemEventType, AlertLevel } from './supervisorTypes';
import { addJob } from '../lib/queue/service';
import dotenv from 'dotenv';

// Load environment variables
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Get environment variable safely
 */
function getEnvVar(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || '';
  }
  return process.env[key] || '';
}

/**
 * Create Supabase client with service role for realtime subscriptions
 */
function getRealtimeClient() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !key) {
    console.error('[Supervisor Realtime] Missing Supabase credentials');
    throw new Error('Supabase credentials not available');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Supervisor Realtime Listener Class
 */
export class SupervisorRealtimeListener {
  private supabase: any;
  private subscriptions: Map<string, any> = new Map();
  private isEnabled: boolean = true;

  constructor() {
    this.supabase = getRealtimeClient();
  }

  /**
   * Start listening to realtime events
   */
  start() {
    if (!this.isEnabled) {
      console.log('[Supervisor Realtime] Listener is disabled');
      return;
    }

    console.log('[Supervisor Realtime] Starting event listener...');

    // Listen to audit_logs for system events
    this.subscribeToAuditLogs();

    // Listen to videos for content events
    this.subscribeToVideos();

    // Listen to profiles for user events
    this.subscribeToProfiles();

    // Listen to comments for moderation events
    this.subscribeToComments();

    // Listen to analytics_events for system metrics
    this.subscribeToAnalyticsEvents();

    console.log('[Supervisor Realtime] Event listener started');
  }

  /**
   * Stop listening to realtime events
   */
  stop() {
    console.log('[Supervisor Realtime] Stopping event listener...');

    // Unsubscribe from all channels
    for (const [name, subscription] of this.subscriptions) {
      subscription.unsubscribe();
      console.log(`[Supervisor Realtime] Unsubscribed from ${name}`);
    }

    this.subscriptions.clear();
    this.isEnabled = false;

    console.log('[Supervisor Realtime] Event listener stopped');
  }

  /**
   * Subscribe to audit_logs table
   */
  private subscribeToAuditLogs() {
    const subscription = this.supabase
      .channel('supervisor-audit-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: `severity=eq.error`,
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] Error log detected:', payload);

          // Trigger supervisor check for high error rate
          await this.triggerSupervisorEvent({
            type: SystemEventType.LOG_ERROR,
            severity: AlertLevel.ERROR,
            data: {
              logId: payload.new.id,
              action: payload.new.action,
              details: payload.new.details,
            },
            source: 'realtime_audit_logs',
          });
        }
      )
      .subscribe((status: string) => {
        console.log(`[Supervisor Realtime] Audit logs subscription status: ${status}`);
      });

    this.subscriptions.set('audit_logs', subscription);
  }

  /**
   * Subscribe to videos table
   */
  private subscribeToVideos() {
    const subscription = this.supabase
      .channel('supervisor-videos')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'videos',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] New video detected:', payload);

          // Trigger supervisor for content moderation
          await this.triggerSupervisorEvent({
            type: SystemEventType.CONTENT_FLAGGED,
            severity: AlertLevel.INFO,
            data: {
              videoId: payload.new.id,
              title: payload.new.title,
              ownerId: payload.new.owner_id,
              action: 'flag',
            },
            source: 'realtime_videos',
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: 'report_count=gt.5',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] High report count detected:', payload);

          // Trigger supervisor for content review
          await this.triggerSupervisorEvent({
            type: SystemEventType.CONTENT_FLAGGED,
            severity: AlertLevel.WARNING,
            data: {
              videoId: payload.new.id,
              reportCount: payload.new.report_count,
              action: 'flag',
            },
            source: 'realtime_videos',
          });
        }
      )
      .subscribe((status: string) => {
        console.log(`[Supervisor Realtime] Videos subscription status: ${status}`);
      });

    this.subscriptions.set('videos', subscription);
  }

  /**
   * Subscribe to profiles table
   */
  private subscribeToProfiles() {
    const subscription = this.supabase
      .channel('supervisor-profiles')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: 'is_banned=eq.true',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] User banned detected:', payload);

          // Log the ban event
          await this.triggerSupervisorEvent({
            type: SystemEventType.USER_REPORTED,
            severity: AlertLevel.WARNING,
            data: {
              userId: payload.new.id,
              isBanned: payload.new.is_banned,
              banReason: payload.new.ban_reason,
              action: 'inspect',
            },
            source: 'realtime_profiles',
          });
        }
      )
      .subscribe((status: string) => {
        console.log(`[Supervisor Realtime] Profiles subscription status: ${status}`);
      });

    this.subscriptions.set('profiles', subscription);
  }

  /**
   * Subscribe to comments table
   */
  private subscribeToComments() {
    const subscription = this.supabase
      .channel('supervisor-comments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_comments',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] New comment detected:', payload);

          // Trigger supervisor for comment moderation
          await this.triggerSupervisorEvent({
            type: SystemEventType.CONTENT_FLAGGED,
            severity: AlertLevel.INFO,
            data: {
              commentId: payload.new.id,
              videoId: payload.new.video_id,
              userId: payload.new.user_id,
              action: 'flag',
            },
            source: 'realtime_comments',
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_comments',
          filter: 'report_count=gt.3',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] High comment report count detected:', payload);

          // Trigger supervisor for comment review
          await this.triggerSupervisorEvent({
            type: SystemEventType.CONTENT_FLAGGED,
            severity: AlertLevel.WARNING,
            data: {
              commentId: payload.new.id,
              reportCount: payload.new.report_count,
              action: 'flag',
            },
            source: 'realtime_comments',
          });
        }
      )
      .subscribe((status: string) => {
        console.log(`[Supervisor Realtime] Comments subscription status: ${status}`);
      });

    this.subscriptions.set('comments', subscription);
  }

  /**
   * Subscribe to analytics_events table
   */
  private subscribeToAnalyticsEvents() {
    const subscription = this.supabase
      .channel('supervisor-analytics')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analytics_events',
          filter: 'event_type=eq.error',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] Analytics error detected:', payload);

          // Trigger supervisor for system health check
          await this.triggerSupervisorEvent({
            type: SystemEventType.PERFORMANCE_DEGRADATION,
            severity: AlertLevel.WARNING,
            data: {
              eventId: payload.new.id,
              eventType: payload.new.event_type,
              metadata: payload.new.metadata,
            },
            source: 'realtime_analytics',
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analytics_events',
          filter: 'event_type=eq.critical',
        },
        async (payload: any) => {
          console.log('[Supervisor Realtime] Critical analytics event detected:', payload);

          // Trigger supervisor for immediate attention
          await this.triggerSupervisorEvent({
            type: SystemEventType.DATABASE_ISSUE,
            severity: AlertLevel.CRITICAL,
            data: {
              eventId: payload.new.id,
              eventType: payload.new.event_type,
              metadata: payload.new.metadata,
            },
            source: 'realtime_analytics',
          });
        }
      )
      .subscribe((status: string) => {
        console.log(`[Supervisor Realtime] Analytics subscription status: ${status}`);
      });

    this.subscriptions.set('analytics_events', subscription);
  }

  /**
   * Trigger supervisor event via queue (or direct execution if queue unavailable)
   */
  private async triggerSupervisorEvent(event: any) {
    try {
      // Try to add to queue for processing
      await addJob('supervisor-check', {
        eventType: event.type,
        severity: event.severity,
        data: event.data,
        source: event.source,
      });

      console.log('[Supervisor Realtime] Supervisor check queued:', event.type);
    } catch (error) {
      console.error('[Supervisor Realtime] Failed to queue supervisor check, executing directly:', error);

      // Fallback: execute supervisor directly if queue is unavailable
      try {
        const { executeSupervisor } = await import('./supervisorGraph');
        await executeSupervisor(event);
        console.log('[Supervisor Realtime] Supervisor executed directly:', event.type);
      } catch (execError) {
        console.error('[Supervisor Realtime] Failed to execute supervisor directly:', execError);
      }
    }
  }

  /**
   * Get subscription status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      subscriptions: Array.from(this.subscriptions.keys()),
      count: this.subscriptions.size,
    };
  }
}

/**
 * Global realtime listener instance
 */
let realtimeListener: SupervisorRealtimeListener | null = null;

/**
 * Start realtime listener
 */
export function startSupervisorRealtime() {
  if (!realtimeListener) {
    realtimeListener = new SupervisorRealtimeListener();
  }
  realtimeListener.start();
  return realtimeListener;
}

/**
 * Stop realtime listener
 */
export function stopSupervisorRealtime() {
  if (realtimeListener) {
    realtimeListener.stop();
    realtimeListener = null;
  }
}

/**
 * Get realtime listener status
 */
export function getRealtimeStatus() {
  return realtimeListener?.getStatus() || {
    isEnabled: false,
    subscriptions: [],
    count: 0,
  };
}
