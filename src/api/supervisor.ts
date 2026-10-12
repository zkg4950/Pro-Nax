/**
 * Supervisor API
 * Server-side API for system supervisor execution
 * Provides endpoints for triggering supervisor actions and monitoring
 */

import { executeSupervisor, streamSupervisor } from '../agents/supervisorGraph';
import { supervisorAPI } from '../agents/supervisorWorker';
import { SystemEventType, AlertLevel } from '../agents/supervisorTypes';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Get environment variable safely
 */
function getEnvVar(key: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  return '';
}

/**
 * Create Supabase client with service role for admin operations
 */
function getAdminClient() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !key) {
    console.error('[Supervisor API] Missing Supabase credentials');
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
 * Execute supervisor with custom event
 */
export async function executeSupervisorAPI(event: any) {
  try {
    const result = await executeSupervisor(event);
    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('[Supervisor API] Execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stream supervisor execution for real-time updates
 */
export async function* streamSupervisorAPI(event: any) {
  try {
    const eventStream = await streamSupervisor(event);
    for await (const event of eventStream) {
      yield event;
    }
  } catch (error) {
    console.error('[Supervisor API] Streaming error:', error);
    throw error;
  }
}

/**
 * Trigger system health check
 */
export async function triggerHealthCheck() {
  return await supervisorAPI.getSystemHealth();
}

/**
 * Trigger system logs fetch
 */
export async function triggerSystemLogs(params?: { timeRange?: string; limit?: number }) {
  return await supervisorAPI.getSystemLogs(params);
}

/**
 * Trigger content moderation via supervisor
 */
export async function triggerContentModeration(params: {
  action: 'flag' | 'approve' | 'remove' | 'shadow_ban';
  contentType: 'video' | 'comment';
  contentId: string;
  reason?: string;
  moderatorId?: string;
}) {
  return await supervisorAPI.triggerContentModeration(params);
}

/**
 * Trigger user management via supervisor
 */
export async function triggerUserManagement(params: {
  action: 'ban' | 'unban' | 'restrict' | 'unrestrict' | 'inspect';
  userId: string;
  reason?: string;
  duration?: string;
  adminId?: string;
}) {
  return await supervisorAPI.triggerUserManagement(params);
}

/**
 * Get supervisor status
 */
export async function getSupervisorStatus() {
  try {
    const supabase = getAdminClient();

    // Get recent supervisor actions from audit_logs
    const { data: recentActions, error } = await supabase
      .from('audit_logs')
      .select('*')
      .ilike('action', '%supervisor%')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return {
      success: true,
      status: 'active',
      recentActions: recentActions || [],
      lastCheck: recentActions?.[0]?.created_at || null,
    };
  } catch (error) {
    console.error('[Supervisor API] Status check error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'unknown',
    };
  }
}

/**
 * Manual supervisor trigger for system events
 */
export async function triggerManualSupervisor(params: {
  eventType: SystemEventType;
  severity?: AlertLevel;
  data: Record<string, any>;
  source?: string;
}) {
  const event = {
    type: params.eventType,
    severity: params.severity || AlertLevel.INFO,
    data: params.data,
    timestamp: new Date(),
    source: params.source || 'manual_api',
  };

  return await executeSupervisorAPI(event);
}

/**
 * Get supervisor configuration
 */
export async function getSupervisorConfig() {
  return {
    errorRateThreshold: 10, // errors per hour
    performanceThreshold: 80, // minimum performance score
    storageThreshold: 90, // maximum storage usage percentage
    autoMode: true,
    requireApproval: false,
    enabled: true,
  };
}

/**
 * Update supervisor configuration
 */
export async function updateSupervisorConfig(config: {
  errorRateThreshold?: number;
  performanceThreshold?: number;
  storageThreshold?: number;
  autoMode?: boolean;
  requireApproval?: boolean;
}) {
  // In production, this would store config in database
  // For now, return the updated config
  return {
    success: true,
    config: {
      errorRateThreshold: config.errorRateThreshold ?? 10,
      performanceThreshold: config.performanceThreshold ?? 80,
      storageThreshold: config.storageThreshold ?? 90,
      autoMode: config.autoMode ?? true,
      requireApproval: config.requireApproval ?? false,
    },
  };
}
