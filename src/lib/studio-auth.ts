/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/loose';
import type { Session, User } from '@supabase/supabase-js';
import { useUnifiedAuth } from '@/lib/unified-auth';

export interface StudioAuthError {
  type: 'network' | 'session' | 'auth' | 'unknown';
  message: string;
  userFriendlyMessage: string;
  retryable: boolean;
}

export interface StudioAuthState {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
  session: Session | null;
  error: StudioAuthError | null;
  sessionTimeoutWarning: boolean;
  lastActivity: number;
}

const SESSION_TIMEOUT_MINUTES = 30;
const ACTIVITY_TIMEOUT_MINUTES = 5;
const WARNING_BEFORE_TIMEOUT_MINUTES = 5;

/**
 * Enhanced authentication system for ProNax Studio
 * with session management, error handling, and timeout handling
 */
export class StudioAuthManager {
  private state: StudioAuthState;
  private listeners: Set<(state: StudioAuthState) => void> = new Set();
  private sessionTimeoutTimer: NodeJS.Timeout | null = null;
  private activityTimeoutTimer: NodeJS.Timeout | null = null;
  private warningTimeoutTimer: NodeJS.Timeout | null = null;
  private cleanupSessionTimeoutRef: (() => void) | null = null;

  constructor() {
    this.state = {
      loading: true,
      authenticated: false,
      user: null,
      session: null,
      error: null,
      sessionTimeoutWarning: false,
      lastActivity: Date.now(),
    };
  }

  /**
   * Classify authentication errors
   */
  private classifyError(error: any): StudioAuthError {
    if (!error) {
      return {
        type: 'unknown',
        message: 'Unknown authentication error',
        userFriendlyMessage: 'An unexpected error occurred during authentication',
        retryable: true,
      };
    }

    const errorMessage = error.message || String(error);

    // Network errors
    if (errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('ECONNREFUSED')) {
      return {
        type: 'network',
        message: errorMessage,
        userFriendlyMessage: 'Network connection failed. Please check your internet connection.',
        retryable: true,
      };
    }

    // Session errors
    if (errorMessage.includes('session') ||
        errorMessage.includes('JWT') ||
        errorMessage.includes('token') ||
        errorMessage.includes('expired')) {
      return {
        type: 'session',
        message: errorMessage,
        userFriendlyMessage: 'Your session has expired. Please sign in again.',
        retryable: false,
      };
    }

    // Authentication errors
    if (errorMessage.includes('auth') ||
        errorMessage.includes('credentials') ||
        errorMessage.includes('unauthorized')) {
      return {
        type: 'auth',
        message: errorMessage,
        userFriendlyMessage: 'Authentication failed. Please check your credentials.',
        retryable: true,
      };
    }

    // Default
    return {
      type: 'unknown',
      message: errorMessage,
      userFriendlyMessage: 'An unexpected error occurred. Please try again.',
      retryable: true,
    };
  }

  /**
   * Update state and notify listeners
   */
  private setState(update: Partial<StudioAuthState>): void {
    this.state = { ...this.state, ...update };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Setup session timeout monitoring
   */
  private setupSessionTimeout(): void {
    this.cleanupSessionTimeout();

    const handleActivity = () => {
      this.setState({ lastActivity: Date.now() });
      this.resetActivityTimeout();
    };

    // Monitor user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Setup session timeout
    const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;
    const ACTIVITY_TIMEOUT_MS = ACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
    const WARNING_TIMEOUT_MS = (SESSION_TIMEOUT_MINUTES - WARNING_BEFORE_TIMEOUT_MINUTES) * 60 * 1000;

    // Warning timer
    this.warningTimeoutTimer = setTimeout(() => {
      this.setState({ sessionTimeoutWarning: true });
    }, WARNING_TIMEOUT_MS);

    // Activity timeout (inactivity check)
    this.activityTimeoutTimer = setInterval(() => {
      const timeSinceActivity = Date.now() - this.state.lastActivity;
      if (timeSinceActivity > ACTIVITY_TIMEOUT_MS) {
        this.handleSessionTimeout();
      }
    }, 60000); // Check every minute

    // Session timeout
    this.sessionTimeoutTimer = setTimeout(() => {
      this.handleSessionTimeout();
    }, SESSION_TIMEOUT_MS);

    // Cleanup function
    this.cleanupSessionTimeoutRef = () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }

  /**
   * Reset activity timeout
   */
  private resetActivityTimeout(): void {
    // Reset session timeout when user is active
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
      const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;
      this.sessionTimeoutTimer = setTimeout(() => {
        this.handleSessionTimeout();
      }, SESSION_TIMEOUT_MS);
    }
  }

  /**
   * Handle session timeout
   */
  private async handleSessionTimeout(): Promise<void> {
    try {
      this.setState({ sessionTimeoutWarning: false });
      
      // Attempt to refresh session first
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        // Session refresh failed, force logout
        await this.signOut();
      } else {
        // Session refreshed successfully
        this.setState({
          session: data.session,
          user: data.session.user,
          authenticated: true,
          lastActivity: Date.now(),
        });
        this.setupSessionTimeout(); // Reset timers
      }
    } catch (error) {
      console.error('[StudioAuth] Session timeout handling failed:', error);
      await this.signOut();
    }
  }

  /**
   * Reset session timeout (user activity)
   */
  public resetSessionTimeout(): void {
    this.setState({ 
      sessionTimeoutWarning: false,
      lastActivity: Date.now() 
    });
    this.setupSessionTimeout();
  }

  /**
   * Initialize authentication
   */
  async initialize(): Promise<void> {
    try {
      this.setState({ loading: true, error: null });

      // Get current session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        const classifiedError = this.classifyError(error);
        this.setState({ 
          loading: false, 
          error: classifiedError,
          authenticated: false,
          user: null,
          session: null,
        });
        return;
      }

      if (session) {
        this.setState({
          session,
          user: session.user,
          authenticated: true,
          loading: false,
          error: null,
        });
        this.setupSessionTimeout();
      } else {
        this.setState({
          session: null,
          user: null,
          authenticated: false,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      const classifiedError = this.classifyError(error);
      this.setState({
        loading: false,
        error: classifiedError,
        authenticated: false,
        user: null,
        session: null,
      });
    }
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback: (state: StudioAuthState) => void): () => void {
    this.listeners.add(callback);
    callback(this.state); // Send current state immediately

    // Setup Supabase auth state listener
    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[StudioAuth] Auth state changed:', event);

      if (event === 'SIGNED_IN' && session) {
        this.setState({
          session,
          user: session.user,
          authenticated: true,
          loading: false,
          error: null,
        });
        this.setupSessionTimeout();
      } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          this.setState({
            session: null,
            user: null,
            authenticated: false,
            loading: false,
            error: null,
          });
          this.cleanupSessionTimeout();
        } else if (event === 'TOKEN_REFRESHED' && session) {
          this.setState({
            session,
            user: session.user,
            authenticated: true,
          });
          this.setupSessionTimeout();
        }
      }
    });

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
      subscription.subscription.unsubscribe();
    };
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<void> {
    try {
      this.setState({ loading: true });
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        const classifiedError = this.classifyError(error);
        this.setState({ 
          loading: false, 
          error: classifiedError 
        });
        return;
      }

      this.setState({
        session: null,
        user: null,
        authenticated: false,
        loading: false,
        error: null,
        sessionTimeoutWarning: false,
      });

      this.cleanupSessionTimeout();
    } catch (error) {
      const classifiedError = this.classifyError(error);
      this.setState({
        loading: false,
        error: classifiedError,
      });
    }
  }

  /**
   * Refresh session manually
   */
  async refreshSession(): Promise<{ success: boolean; error: StudioAuthError | null }> {
    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        const classifiedError = this.classifyError(error);
        this.setState({ error: classifiedError });
        return { success: false, error: classifiedError };
      }

      if (data.session) {
        this.setState({
          session: data.session,
          user: data.session.user,
          authenticated: true,
          error: null,
          lastActivity: Date.now(),
        });
        this.setupSessionTimeout();
        return { success: true, error: null };
      }

      return { 
        success: false, 
        error: {
          type: 'session',
          message: 'No session returned from refresh',
          userFriendlyMessage: 'Failed to refresh session. Please sign in again.',
          retryable: false,
        }
      };
    } catch (error) {
      const classifiedError = this.classifyError(error);
      this.setState({ error: classifiedError });
      return { success: false, error: classifiedError };
    }
  }

  /**
   * Cleanup resources
   */
  private cleanupSessionTimeout(): void {
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
      this.sessionTimeoutTimer = null;
    }
    if (this.activityTimeoutTimer) {
      clearInterval(this.activityTimeoutTimer);
      this.activityTimeoutTimer = null;
    }
    if (this.warningTimeoutTimer) {
      clearTimeout(this.warningTimeoutTimer);
      this.warningTimeoutTimer = null;
    }
    if (this.cleanupSessionTimeoutRef) {
      this.cleanupSessionTimeoutRef();
      this.cleanupSessionTimeoutRef = null;
    }
  }

  /**
   * Get current state
   */
  getState(): StudioAuthState {
    return this.state;
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    this.cleanupSessionTimeout();
    this.listeners.clear();
  }
}

/**
 * React hook for using Studio authentication
 * Now uses the unified auth system to share session across the app
 */
export function useStudioAuth() {
  const unifiedAuth = useUnifiedAuth();
  const [sessionTimeoutWarning, setSessionTimeoutWarning] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const resetSessionTimeout = useCallback(() => {
    setSessionTimeoutWarning(false);
    setLastActivity(Date.now());
  }, []);

  const signOut = useCallback(async () => {
    return await unifiedAuth.signOut();
  }, [unifiedAuth]);

  const refreshSession = useCallback(async () => {
    // Unified auth handles session refresh automatically via Supabase
    return { success: true, error: null };
  }, []);

  return {
    ...unifiedAuth,
    user: unifiedAuth.user,
    loading: unifiedAuth.loading,
    isAuthed: unifiedAuth.isAuthed,
    sessionTimeoutWarning,
    lastActivity,
    signOut,
    refreshSession,
    resetSessionTimeout,
  };
}