/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { supabase } from '@/integrations/supabase/loose';
import { useUnifiedAuth } from '@/lib/unified-auth';

export interface AuthError {
  type: 'network' | 'auth' | 'permission' | 'session' | 'unknown';
  message: string;
  userFriendlyMessage: string;
  retryable: boolean;
}

export interface UserRoleCheck {
  isAdmin: boolean;
  isModerator: boolean;
  isSupport: boolean;
}

export interface AuthState {
  loading: boolean;
  error: AuthError | null;
  userRoles: UserRoleCheck;
  requiresRetry: boolean;
  retryCount: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Comprehensive error classification for authentication failures
 */
export function classifyAuthError(error: any): AuthError {
  if (!error) {
    return {
      type: 'unknown',
      message: 'Unknown authentication error',
      userFriendlyMessage: 'An unexpected error occurred during authentication',
      retryable: true,
    };
  }

  const errorMessage = error.message || String(error);
  const errorCode = error.code;

  // Network errors
  if (errorMessage.includes('Failed to fetch') || 
      errorMessage.includes('NetworkError') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorCode === 'NETWORK_ERROR') {
    return {
      type: 'network',
      message: errorMessage,
      userFriendlyMessage: 'Network connection failed. Please check your internet connection and try again.',
      retryable: true,
    };
  }

  // Session errors
  if (errorMessage.includes('session') ||
      errorMessage.includes('JWT') ||
      errorMessage.includes('token') ||
      errorCode === 'TOKEN_EXPIRED' ||
      errorCode === 'INVALID_JWT') {
    return {
      type: 'session',
      message: errorMessage,
      userFriendlyMessage: 'Your session has expired. Please sign in again.',
      retryable: false,
    };
  }

  // Permission errors
  if (errorMessage.includes('permission') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('access denied') ||
      errorCode === 'PERMISSION_DENIED') {
    return {
      type: 'permission',
      message: errorMessage,
      userFriendlyMessage: 'You do not have permission to access this resource.',
      retryable: false,
    };
  }

  // Authentication errors
  if (errorMessage.includes('auth') ||
      errorMessage.includes('credentials') ||
      errorCode === 'AUTH_ERROR') {
    return {
      type: 'auth',
      message: errorMessage,
      userFriendlyMessage: 'Authentication failed. Please check your credentials and try again.',
      retryable: true,
    };
  }

  // Default to unknown error
  return {
    type: 'unknown',
    message: errorMessage,
    userFriendlyMessage: 'An unexpected error occurred. Please try again.',
    retryable: true,
  };
}

/**
 * Retry logic wrapper for RPC calls with exponential backoff
 */
export async function retryRpcCall<T>(
  rpcName: string,
  params: Record<string, any>,
  retries = MAX_RETRIES
): Promise<{ data: T | null; error: any }> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await supabase.rpc(rpcName, params);
      if (result.error) {
        lastError = result.error;
        const errorClass = classifyAuthError(result.error);
        
        if (!errorClass.retryable || attempt === retries) {
          return { data: null, error: result.error };
        }
        
        // Exponential backoff
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return { data: result.data as T, error: null };
    } catch (error) {
      lastError = error;
      const errorClass = classifyAuthError(error);
      
      if (!errorClass.retryable || attempt === retries) {
        return { data: null, error };
      }
      
      // Exponential backoff
      const delay = RETRY_DELAY * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { data: null, error: lastError };
}

/**
 * Check user roles with retry logic and comprehensive error handling
 */
export async function checkUserRoles(userId: string): Promise<{
  roles: UserRoleCheck;
  error: AuthError | null;
}> {
  try {
    // Check all roles with retry logic
    const [adminResult, moderatorResult, supportResult] = await Promise.all([
      retryRpcCall('has_role', { _user_id: userId, _role: 'admin' }),
      retryRpcCall('has_role', { _user_id: userId, _role: 'moderator' }),
      retryRpcCall('has_role', { _user_id: userId, _role: 'support' }),
    ]);

    // Check for errors
    if (adminResult.error || moderatorResult.error || supportResult.error) {
      const firstError = adminResult.error || moderatorResult.error || supportResult.error;
      const classifiedError = classifyAuthError(firstError);
      
      return {
        roles: { isAdmin: false, isModerator: false, isSupport: false },
        error: classifiedError,
      };
    }

    const roles: UserRoleCheck = {
      isAdmin: adminResult.data === true,
      isModerator: moderatorResult.data === true,
      isSupport: supportResult.data === true,
    };

    return { roles, error: null };
  } catch (error) {
    const classifiedError = classifyAuthError(error);
    return {
      roles: { isAdmin: false, isModerator: false, isSupport: false },
      error: classifiedError,
    };
  }
}

/**
 * Check bootstrap status with retry logic
 */
export async function checkBootstrapStatus(): Promise<{
  canClaim: boolean;
  isAdmin: boolean;
  error: AuthError | null;
}> {
  try {
    const result = await retryRpcCall('admin_bootstrap_status', {});
    
    if (result.error) {
      const classifiedError = classifyAuthError(result.error);
      return { canClaim: false, isAdmin: false, error: classifiedError };
    }

    const data = result.data as any;
    return {
      canClaim: data?.can_claim_initial_admin || false,
      isAdmin: data?.is_admin || false,
      error: null,
    };
  } catch (error) {
    const classifiedError = classifyAuthError(error);
    return { canClaim: false, isAdmin: false, error: classifiedError };
  }
}

/**
 * Claim initial admin role with comprehensive error handling
 */
export async function claimInitialAdminRole(): Promise<{
  success: boolean;
  error: AuthError | null;
}> {
  try {
    const result = await retryRpcCall('claim_initial_admin', {});
    
    if (result.error) {
      const classifiedError = classifyAuthError(result.error);
      return { success: false, error: classifiedError };
    }

    const data = result.data as any;
    if (data?.ok === false) {
      return {
        success: false,
        error: {
          type: 'permission',
          message: data?.error || 'Cannot claim admin role',
          userFriendlyMessage: data?.error || 'An administrator already exists or you cannot claim this role.',
          retryable: false,
        },
      };
    }

    return { success: true, error: null };
  } catch (error) {
    const classifiedError = classifyAuthError(error);
    return { success: false, error: classifiedError };
  }
}

/**
 * Session validation and timeout handling
 */
export async function validateSession(): Promise<{
  valid: boolean;
  user: any;
  error: AuthError | null;
}> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      const classifiedError = classifyAuthError(error);
      return { valid: false, user: null, error: classifiedError };
    }

    if (!user) {
      return {
        valid: false,
        user: null,
        error: {
          type: 'session',
          message: 'No active session',
          userFriendlyMessage: 'Please sign in to access the admin console.',
          retryable: false,
        },
      };
    }

    // Check if session is expired
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      return {
        valid: false,
        user: null,
        error: {
          type: 'session',
          message: 'Session expired',
          userFriendlyMessage: 'Your session has expired. Please sign in again.',
          retryable: false,
        },
      };
    }

    return { valid: true, user, error: null };
  } catch (error) {
    const classifiedError = classifyAuthError(error);
    return { valid: false, user: null, error: classifiedError };
  }
}

/**
 * Setup session timeout monitoring
 */
export function setupSessionTimeout(
  onTimeout: () => void,
  timeoutMinutes = 30
): () => void {
  let timeoutId: NodeJS.Timeout;
  let activityTimeoutId: NodeJS.Timeout;
  const TIMEOUT_MS = timeoutMinutes * 60 * 1000;
  const ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity

  const resetTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(onTimeout, TIMEOUT_MS);
  };

  const handleActivity = () => {
    clearTimeout(activityTimeoutId);
    activityTimeoutId = setTimeout(resetTimeout, ACTIVITY_TIMEOUT_MS);
  };

  // Monitor user activity
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  events.forEach(event => {
    window.addEventListener(event, handleActivity);
  });

  // Initial timeout setup
  resetTimeout();

  // Cleanup function
  return () => {
    clearTimeout(timeoutId);
    clearTimeout(activityTimeoutId);
    events.forEach(event => {
      window.removeEventListener(event, handleActivity);
    });
  };
}

/**
 * React hook for using Admin authentication with unified auth system
 */
export function useAdminAuth() {
  const unifiedAuth = useUnifiedAuth();
  
  return {
    ...unifiedAuth,
    isAuthed: unifiedAuth.isAuthed,
    user: unifiedAuth.user,
    session: unifiedAuth.session,
    loading: unifiedAuth.loading,
    signOut: unifiedAuth.signOut,
  };
}