/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/loose';

export interface SystemNotification {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'success' | 'warning' | 'info';
  createdAt: string;
}

export interface NotificationConfig {
  maxNotifications?: number;
  debounceMs?: number;
  enableRealtime?: boolean;
  paginationSize?: number;
}

const DEFAULT_CONFIG: NotificationConfig = {
  maxNotifications: 10,
  debounceMs: 500,
  enableRealtime: true,
  paginationSize: 6,
};

/**
 * Optimized notification system with debouncing, pagination, and error handling
 */
export class AdminNotificationManager {
  private notifications: SystemNotification[] = [];
  private subscribers: Set<(notifications: SystemNotification[]) => void> = new Set();
  private config: NotificationConfig;
  private debounceTimer: NodeJS.Timeout | null = null;
  private channel: any = null;
  private isConnected: boolean = false;
  private connectionRetryCount: number = 0;
  private maxRetries: number = 3;

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Format relative time from ISO string
   */
  private formatRelativeTime(iso: string): string {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  /**
   * Map database row to notification format
   */
  private mapRowToNotification(row: any): SystemNotification {
    return {
      id: String(row.id),
      title: String(row.action || 'System event').replace(/_/g, ' '),
      desc: [row.entity_type, row.entity_id ? `#${String(row.entity_id).slice(0, 8)}` : null, row.actor_email]
        .filter(Boolean)
        .join(' · ') || 'Platform activity recorded',
      time: this.formatRelativeTime(row.created_at),
      type: (row.severity === 'critical' || row.severity === 'error'
        ? 'warning'
        : row.severity === 'warning'
          ? 'warning'
          : 'info') as 'success' | 'warning' | 'info',
      createdAt: row.created_at,
    };
  }

  /**
   * Update relative times for existing notifications
   */
  private updateRelativeTimes(): void {
    this.notifications = this.notifications.map(notification => ({
      ...notification,
      time: this.formatRelativeTime(notification.createdAt),
    }));
    this.notifySubscribers();
  }

  /**
   * Notify all subscribers with current notifications
   */
  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.notifications));
  }

  /**
   * Add new notification with debouncing
   */
  private addNotification(row: any): void {
    const notification = this.mapRowToNotification(row);
    
    // Remove debounced updates
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce the update
    this.debounceTimer = setTimeout(() => {
      // Check if notification already exists (deduplication)
      const exists = this.notifications.some(n => n.id === notification.id);
      if (!exists) {
        // Prepend new notification
        this.notifications = [notification, ...this.notifications];
        
        // Limit to max notifications
        if (this.notifications.length > this.config.maxNotifications!) {
          this.notifications = this.notifications.slice(0, this.config.maxNotifications);
        }
        
        this.notifySubscribers();
      }
      this.debounceTimer = null;
    }, this.config.debounceMs);
  }

  /**
   * Load initial notifications with pagination
   */
  async loadInitialNotifications(page: number = 1): Promise<SystemNotification[]> {
    try {
      const offset = (page - 1) * this.config.paginationSize!;
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id,action,entity_type,entity_id,actor_email,severity,created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + this.config.paginationSize! - 1);

      if (error) throw error;

      this.notifications = (data || []).map(row => this.mapRowToNotification(row));
      this.notifySubscribers();
      
      return this.notifications;
    } catch (error) {
      console.error('[NotificationManager] Failed to load notifications:', error);
      throw error;
    }
  }

  /**
   * Load more notifications (pagination)
   */
  async loadMoreNotifications(page: number = 2): Promise<SystemNotification[]> {
    try {
      const offset = (page - 1) * this.config.paginationSize!;
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id,action,entity_type,entity_id,actor_email,severity,created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + this.config.paginationSize! - 1);

      if (error) throw error;

      const newNotifications = (data || []).map(row => this.mapRowToNotification(row));
      
      // Append new notifications (avoiding duplicates)
      const existingIds = new Set(this.notifications.map(n => n.id));
      const uniqueNewNotifications = newNotifications.filter(n => !existingIds.has(n.id));
      
      this.notifications = [...this.notifications, ...uniqueNewNotifications];
      this.notifySubscribers();
      
      return uniqueNewNotifications;
    } catch (error) {
      console.error('[NotificationManager] Failed to load more notifications:', error);
      throw error;
    }
  }

  /**
   * Setup real-time subscription for new notifications
   */
  async setupRealtimeSubscription(): Promise<void> {
    if (!this.config.enableRealtime || this.isConnected) {
      return;
    }

    try {
      this.channel = supabase
        .channel('admin:shell-notifications-optimized')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'audit_logs',
          },
          (payload) => {
            this.addNotification(payload.new);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.isConnected = true;
            this.connectionRetryCount = 0;
            console.log('[NotificationManager] Real-time subscription established');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            this.isConnected = false;
            this.handleConnectionError();
          }
        });
    } catch (error) {
      console.error('[NotificationManager] Failed to setup real-time subscription:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Handle connection errors with retry logic
   */
  private handleConnectionError(): void {
    if (this.connectionRetryCount < this.maxRetries) {
      this.connectionRetryCount++;
      const delay = Math.pow(2, this.connectionRetryCount) * 1000; // Exponential backoff
      
      console.log(`[NotificationManager] Retrying connection in ${delay}ms (attempt ${this.connectionRetryCount}/${this.maxRetries})`);
      
      setTimeout(() => {
        this.setupRealtimeSubscription();
      }, delay);
    } else {
      console.error('[NotificationManager] Max retry attempts reached, giving up on real-time updates');
    }
  }

  /**
   * Subscribe to notification updates
   */
  subscribe(callback: (notifications: SystemNotification[]) => void): () => void {
    this.subscribers.add(callback);
    
    // Immediately send current notifications
    callback(this.notifications);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get current notifications
   */
  getNotifications(): SystemNotification[] {
    return this.notifications;
  }

  /**
   * Clear all notifications
   */
  clearNotifications(): void {
    this.notifications = [];
    this.notifySubscribers();
  }

  /**
   * Start periodic time updates (for relative time display)
   */
  startTimeUpdates(intervalMs: number = 60000): () => void {
    const intervalId = setInterval(() => {
      this.updateRelativeTimes();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Remove real-time subscription
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Clear subscribers
    this.subscribers.clear();
    this.isConnected = false;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): { connected: boolean; retryCount: number } {
    return {
      connected: this.isConnected,
      retryCount: this.connectionRetryCount,
    };
  }
}

/**
 * Hook for using the notification manager in React components
 */
export function useAdminNotifications(config?: Partial<NotificationConfig>) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [connectionStatus, setConnectionStatus] = useState({ connected: false, retryCount: 0 });
  
  const managerRef = useRef<AdminNotificationManager | null>(null);
  const cleanupTimeUpdatesRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    let statusInterval: NodeJS.Timeout | null = null;
    
    const initNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Create manager instance
        const manager = new AdminNotificationManager(config);
        managerRef.current = manager;
        
        // Load initial notifications
        await manager.loadInitialNotifications();
        
        // Setup real-time subscription
        await manager.setupRealtimeSubscription();
        
        // Subscribe to updates
        unsubscribe = manager.subscribe((updatedNotifications) => {
          if (mounted) {
            setNotifications(updatedNotifications);
          }
        });
        
        // Start periodic time updates
        cleanupTimeUpdatesRef.current = manager.startTimeUpdates();
        
        // Update connection status periodically
        statusInterval = setInterval(() => {
          if (mounted && managerRef.current) {
            setConnectionStatus(managerRef.current.getConnectionStatus());
          }
        }, 5000);
        
        setLoading(false);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load notifications'));
          setLoading(false);
        }
      }
    };

    initNotifications();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
      if (statusInterval) clearInterval(statusInterval);
      if (cleanupTimeUpdatesRef.current) {
        cleanupTimeUpdatesRef.current();
      }
      if (managerRef.current) {
        managerRef.current.cleanup();
      }
    };
  }, [JSON.stringify(config)]);

  const loadMore = async (page: number) => {
    if (!managerRef.current) return [];
    
    try {
      const newNotifications = await managerRef.current.loadMoreNotifications(page);
      return newNotifications;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load more notifications'));
      return [];
    }
  };

  const clear = () => {
    if (managerRef.current) {
      managerRef.current.clearNotifications();
    }
  };

  return {
    notifications,
    loading,
    error,
    connectionStatus,
    loadMore,
    clear,
  };
}