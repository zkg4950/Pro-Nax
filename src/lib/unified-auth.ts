/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export interface UnifiedAuthState {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
}

/**
 * Unified Authentication System for ProNax
 * Provides a single source of truth for authentication across all pages
 * Uses Supabase native auth with session persistence
 */
export class UnifiedAuthManager {
  private state: UnifiedAuthState;
  private listeners: Set<(state: UnifiedAuthState) => void> = new Set();
  private authSubscription: any = null;
  private lastTokenRefresh: number = 0;
  private refreshCooldown: number = 30000; // 30 seconds cooldown between token refreshes

  constructor() {
    this.state = {
      loading: true,
      authenticated: false,
      user: null,
      session: null,
      error: null,
    };
  }

  /**
   * Update state and notify listeners
   */
  private setState(update: Partial<UnifiedAuthState>): void {
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
   * Initialize authentication
   */
  async initialize(): Promise<void> {
    try {
      this.setState({ loading: true, error: null });

      // Get current session from Supabase
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        this.setState({ 
          loading: false, 
          error: error.message,
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
      } else {
        this.setState({
          session: null,
          user: null,
          authenticated: false,
          loading: false,
          error: null,
        });
      }

      // Setup auth state listener
      this.setupAuthListener();
    } catch (error) {
      this.setState({
        loading: false,
        error: error instanceof Error ? error.message : 'Authentication initialization failed',
        authenticated: false,
        user: null,
        session: null,
      });
    }
  }

  /**
   * Setup Supabase auth state listener
   */
  private setupAuthListener(): void {
    this.authSubscription = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[UnifiedAuth] Auth state changed:', event);

      if (event === 'SIGNED_IN' && session) {
        this.setState({
          session,
          user: session.user,
          authenticated: true,
          loading: false,
          error: null,
        });
      } else if (event === 'SIGNED_OUT') {
        this.setState({
          session: null,
          user: null,
          authenticated: false,
          loading: false,
          error: null,
        });
        this.lastTokenRefresh = 0; // Reset cooldown on sign out
      } else if (event === 'TOKEN_REFRESHED' && session) {
        const now = Date.now();
        if (now - this.lastTokenRefresh < this.refreshCooldown) {
          console.log('[UnifiedAuth] Token refresh ignored due to cooldown');
          return;
        }
        this.lastTokenRefresh = now;
        this.setState({
          session,
          user: session.user,
          authenticated: true,
        });
      }
    });
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(email: string, password: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        return { success: false, error: 'Please verify your email address before signing in.' };
      }

      return { success: true, error: null };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      };
    }
  }

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(email: string, password: string): Promise<{ success: boolean; error: string | null; needsVerification: boolean }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        return { success: false, error: error.message, needsVerification: false };
      }

      // With email confirmation on, signUp returns no session
      const needsVerification = !data.session;
      return { success: true, error: null, needsVerification };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sign up failed',
        needsVerification: false
      };
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle(): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Google sign-in failed' 
      };
    }
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        return { success: false, error: error.message };
      }

      this.setState({
        session: null,
        user: null,
        authenticated: false,
        loading: false,
        error: null,
      });

      return { success: true, error: null };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sign out failed' 
      };
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to resend verification email' 
      };
    }
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback: (state: UnifiedAuthState) => void): () => void {
    this.listeners.add(callback);
    callback(this.state); // Send current state immediately

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get current state
   */
  getState(): UnifiedAuthState {
    return this.state;
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    if (this.authSubscription) {
      try {
        if (this.authSubscription.subscription) {
          this.authSubscription.subscription.unsubscribe();
        } else if (this.authSubscription.data?.subscription) {
          this.authSubscription.data.subscription.unsubscribe();
        } else if (typeof this.authSubscription === 'function') {
          this.authSubscription();
        }
      } catch (error) {
        console.error('[UnifiedAuth] Error during cleanup:', error);
      }
      this.authSubscription = null;
    }
    this.listeners.clear();
  }
}

/**
 * React hook for using unified authentication
 */
export function useUnifiedAuth() {
  const authManagerRef = useRef<UnifiedAuthManager | null>(null);
  const [state, setState] = useState<UnifiedAuthState>({
    loading: true,
    authenticated: false,
    user: null,
    session: null,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const initAuth = async () => {
      try {
        // Create auth manager instance
        const manager = new UnifiedAuthManager();
        authManagerRef.current = manager;

        // Initialize authentication
        await manager.initialize();

        // Subscribe to state changes
        unsubscribe = manager.subscribe((newState) => {
          if (mounted) {
            setState(newState);
          }
        });
      } catch (error) {
        console.error('[UnifiedAuth] Initialization failed:', error);
        if (mounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Initialization failed',
          }));
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
      if (authManagerRef.current) {
        authManagerRef.current.cleanup();
      }
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (authManagerRef.current) {
      return await authManagerRef.current.signInWithEmail(email, password);
    }
    return { success: false, error: 'Auth manager not initialized' };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (authManagerRef.current) {
      return await authManagerRef.current.signUpWithEmail(email, password);
    }
    return { success: false, error: 'Auth manager not initialized', needsVerification: false };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (authManagerRef.current) {
      return await authManagerRef.current.signInWithGoogle();
    }
    return { success: false, error: 'Auth manager not initialized' };
  }, []);

  const signOut = useCallback(async () => {
    if (authManagerRef.current) {
      return await authManagerRef.current.signOut();
    }
    return { success: false, error: 'Auth manager not initialized' };
  }, []);

  const resendVerificationEmail = useCallback(async (email: string) => {
    if (authManagerRef.current) {
      return await authManagerRef.current.resendVerificationEmail(email);
    }
    return { success: false, error: 'Auth manager not initialized' };
  }, []);

  return {
    ...state,
    isAuthed: state.authenticated,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    resendVerificationEmail,
  };
}
