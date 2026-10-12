/**
 * Admin Tools for System Supervisor
 * Tools for system monitoring, content management, user management, and database health
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Get environment variable safely
 * Prioritizes process.env for Node.js context (API server)
 * Falls back to import.meta.env for browser/Vite context
 */
function getEnvVar(key: string): string {
  // Node.js context (API server) - use process.env
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value) return value;
  }

  // Browser/Vite context - use import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const metaKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
    return import.meta.env[metaKey] || import.meta.env[key] || '';
  }

  return '';
}

/**
 * Create Supabase client with service role for admin operations
 * SECURITY: Uses service role key for elevated privileges (bypasses RLS)
 */
function getAdminClient() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !key) {
    console.error('[Admin Tools] Missing Supabase credentials');
    throw new Error('Supabase credentials not available');
  }

  // Create client with service role key for elevated privileges
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

/**
 * Tool: Fetch System Logs
 * Monitors background jobs, errors, and performance metrics
 * Uses SECURITY DEFINER function for privileged log access
 * Falls back to direct queries if RPC function not available
 */
export async function fetchSystemLogs(params: {
  timeRange?: string; // '1h', '24h', '7d', '30d'
  level?: 'info' | 'warn' | 'error' | 'all';
  limit?: number;
} = {}) {
  const { timeRange = '24h', level = 'all', limit = 100 } = params;

  try {
    const supabase = getAdminClient();

    // Try to use SECURITY DEFINER function first
    let logsData;
    let logsError;

    try {
      const result = await supabase.rpc('supervisor_get_error_logs', {
        p_time_range: timeRange,
        p_limit: limit,
      });
      logsData = result.data;
      logsError = result.error;
    } catch (rpcError) {
      console.log('[fetchSystemLogs] RPC function not available, using fallback:', rpcError);
      logsError = rpcError;
    }

    // If RPC function fails, use fallback direct queries
    if (logsError || !logsData) {
      console.log('[fetchSystemLogs] Using fallback direct queries');

      // Calculate time range
      const timeMap: Record<string, number> = {
        '1h': 1,
        '24h': 24,
        '7d': 24 * 7,
        '30d': 24 * 30,
      };
      const hoursAgo = timeMap[timeRange] || 24;
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      // Fetch from audit_logs table
      let query = supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (level !== 'all') {
        // Map level to severity
        const severityMap: Record<string, string> = {
          'info': 'info',
          'warn': 'warning',
          'error': 'error',
        };
        query = query.eq('severity', severityMap[level]);
      }

      const { data, error } = await query;

      if (error) throw error;

      logsData = data;
    }

    const logs = logsData || [];

    // Filter by level if specified (for fallback case)
    const filteredLogs = level === 'all'
      ? logs
      : logs.filter((log: any) => {
          const severityMap: Record<string, string> = {
            'info': 'info',
            'warn': 'warning',
            'error': 'error',
          };
          return log.severity === severityMap[level];
        });

    // Calculate metrics
    const metrics = {
      totalLogs: filteredLogs.length,
      errorCount: filteredLogs.filter((log: any) => log.severity === 'error').length,
      warningCount: filteredLogs.filter((log: any) => log.severity === 'warning').length,
      infoCount: filteredLogs.filter((log: any) => log.severity === 'info').length,
      timeRange,
    };

    return {
      success: true,
      logs: filteredLogs,
      metrics,
      summary: `Found ${metrics.totalLogs} logs in the last ${timeRange} (${metrics.errorCount} errors, ${metrics.warningCount} warnings)`,
    };
  } catch (error) {
    console.error('[fetchSystemLogs] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      logs: [],
      metrics: { totalLogs: 0, errorCount: 0, warningCount: 0, infoCount: 0 },
    };
  }
}

/**
 * Tool: Manage Content
 * Flag, moderate, or remove inappropriate uploads/posts/comments
 * Uses SECURITY DEFINER function for privileged content moderation
 * Falls back to direct queries if RPC function not available
 */
export async function manageContent(params: {
  action: 'flag' | 'approve' | 'remove' | 'shadow_ban';
  contentType: 'video' | 'comment' | 'post';
  contentId: string;
  reason?: string;
  moderatorId?: string;
}) {
  const { action, contentType, contentId, reason = '', moderatorId } = params;

  try {
    const supabase = getAdminClient();

    // Try to use SECURITY DEFINER function first
    let data;
    let error;

    try {
      const result = await supabase.rpc('supervisor_moderate_content', {
        p_content_type: contentType,
        p_content_id: contentId,
        p_action: action,
        p_reason: reason,
        p_moderator_id: moderatorId || 'system',
      });
      data = result.data;
      error = result.error;
    } catch (rpcError) {
      console.log('[manageContent] RPC function not available, using fallback:', rpcError);
      error = rpcError;
    }

    // If RPC function fails, use fallback direct queries
    if (error || !data) {
      console.log('[manageContent] Using fallback direct queries');

      let result;

      if (contentType === 'video') {
        // Handle video moderation
        if (action === 'remove') {
          result = await supabase
            .from('videos')
            .update({ is_removed: true, moderation_reason: reason })
            .eq('id', contentId);
        } else if (action === 'shadow_ban') {
          result = await supabase
            .from('videos')
            .update({ is_shadow_banned: true, moderation_reason: reason })
            .eq('id', contentId);
        } else if (action === 'flag') {
          result = await supabase
            .from('videos')
            .update({ report_count: 1, auto_suppressed: true })
            .eq('id', contentId);
        } else if (action === 'approve') {
          result = await supabase
            .from('videos')
            .update({ auto_suppressed: false, report_count: 0 })
            .eq('id', contentId);
        }
      } else if (contentType === 'comment') {
        // Handle comment moderation
        if (action === 'remove') {
          result = await supabase
            .from('video_comments')
            .delete()
            .eq('id', contentId);
        } else if (action === 'flag') {
          result = await supabase
            .from('video_comments')
            .update({ text: '[REMOVED - FLAGGED]', likes_count: 0 })
            .eq('id', contentId);
        }
      }

      if (result?.error) throw result.error;

      // Log the action
      await supabase.from('audit_logs').insert({
        action: `content_${action}`,
        entity_type: contentType,
        entity_id: contentId,
        actor_id: moderatorId || 'system',
        severity: action === 'remove' ? 'warning' : 'info',
        details: { reason, contentType },
      });

      data = { success: true };
    }

    return {
      success: data?.success || false,
      action,
      contentType,
      contentId,
      reason,
      summary: data?.success
        ? `Successfully ${action}ed ${contentType} ${contentId}`
        : `Failed to ${action} ${contentType} ${contentId}`,
    };
  } catch (error) {
    console.error('[manageContent] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      summary: `Failed to ${action} ${contentType} ${contentId}`,
    };
  }
}

/**
 * Tool: Manage Users
 * Ban, restrict, or inspect user accounts
 * Uses SECURITY DEFINER function for privileged user management
 * Falls back to direct queries if RPC function not available
 */
export async function manageUsers(params: {
  action: 'ban' | 'unban' | 'restrict' | 'unrestrict' | 'inspect';
  userId: string;
  reason?: string;
  duration?: string; // e.g., '7d', '30d', 'permanent'
  adminId?: string;
}) {
  const { action, userId, reason = '', duration = 'permanent', adminId } = params;

  try {
    const supabase = getAdminClient();

    // Try to use SECURITY DEFINER function first
    let data;
    let error;

    try {
      const result = await supabase.rpc('supervisor_manage_user', {
        p_user_id: userId,
        p_action: action,
        p_reason: reason,
        p_duration: duration,
        p_admin_id: adminId || 'system',
      });
      data = result.data;
      error = result.error;
    } catch (rpcError) {
      console.log('[manageUsers] RPC function not available, using fallback:', rpcError);
      error = rpcError;
    }

    // If RPC function fails, use fallback direct queries
    if (error || !data) {
      console.log('[manageUsers] Using fallback direct queries');

      let result;

      if (action === 'ban') {
        const bannedUntil = duration === 'permanent'
          ? null
          : new Date(Date.now() + parseInt(duration) * 24 * 60 * 60 * 1000).toISOString();

        result = await supabase
          .from('profiles')
          .update({
            is_banned: true,
            banned_until: bannedUntil,
            ban_reason: reason,
            status: 'banned',
          })
          .eq('id', userId);
      } else if (action === 'unban') {
        result = await supabase
          .from('profiles')
          .update({
            is_banned: false,
            banned_until: null,
            ban_reason: null,
            status: 'active',
          })
          .eq('id', userId);
      } else if (action === 'restrict') {
        result = await supabase
          .from('profiles')
          .update({
            upload_limit_mb: 0,
          })
          .eq('id', userId);
      } else if (action === 'unrestrict') {
        result = await supabase
          .from('profiles')
          .update({
            upload_limit_mb: 1024,
          })
          .eq('id', userId);
      } else if (action === 'inspect') {
        result = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
      }

      if (result?.error) throw result.error;

      // Log the action
      if (action !== 'inspect') {
        await supabase.from('audit_logs').insert({
          action: `user_${action}`,
          entity_type: 'user',
          entity_id: userId,
          actor_id: adminId || 'system',
          severity: action === 'ban' ? 'warning' : 'info',
          details: { reason, duration },
        });
      }

      data = {
        success: true,
        user_data: action === 'inspect' ? result.data : null,
      };
    }

    const summary = action === 'inspect'
      ? `User inspection for ${userId}`
      : data?.success
        ? `Successfully ${action}ed user ${userId}`
        : `Failed to ${action} user ${userId}`;

    return {
      success: data?.success || false,
      action,
      userId,
      reason,
      duration,
      userData: action === 'inspect' ? data?.user_data : null,
      summary,
    };
  } catch (error) {
    console.error('[manageUsers] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      summary: `Failed to ${action} user ${userId}`,
    };
  }
}

/**
 * Tool: Get Database Health
 * Check system status and Database/Storage operational state
 * Uses SECURITY DEFINER function for privileged health checks
 * Falls back to direct queries if RPC function not available
 */
export async function getDatabaseHealth() {
  try {
    const supabase = getAdminClient();

    // Try to use SECURITY DEFINER function first
    let healthData;
    let healthError;

    try {
      const result = await supabase.rpc('supervisor_get_system_health');
      healthData = result.data;
      healthError = result.error;
    } catch (rpcError) {
      console.log('[getDatabaseHealth] RPC function not available, using fallback:', rpcError);
      healthError = rpcError;
    }

    // If RPC function fails, use fallback direct queries
    if (healthError || !healthData) {
      console.log('[getDatabaseHealth] Using fallback direct queries');

      // Check database connection
      const { error: dbError } = await supabase.from('profiles').select('id').limit(1);

      // Get user count
      const { count: totalUsers, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get video count
      const { count: totalVideos, error: videoCountError } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true });

      // Get recent uploads
      const { data: recentUploads, error: uploadError } = await supabase
        .from('videos')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      // Get error logs
      const { data: errorLogs, error: logsError } = await supabase
        .from('audit_logs')
        .select('id, severity, created_at')
        .eq('severity', 'error')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(10);

      const healthStatus = dbError ? 'unhealthy' : 'connected';
      const errorRate = errorLogs ? errorLogs.length : 0;

      healthData = {
        status: healthStatus,
        needs_attention: healthStatus === 'unhealthy' || errorRate > 10,
        error_rate: errorRate,
        recent_uploads: recentUploads?.length || 0,
        total_users: totalUsers || 0,
        total_videos: totalVideos || 0,
        checked_at: new Date().toISOString(),
      };
    }

    const health = healthData || {};

    return {
      success: true,
      health: {
        status: health.status || 'unknown',
        needsAttention: health.needs_attention || false,
        errorRate: health.error_rate || 0,
        recentUploads: health.recent_uploads || 0,
        totalUsers: health.total_users || 0,
        totalVideos: health.total_videos || 0,
        lastErrorTime: health.checked_at || null,
      },
      metrics: {
        database: health.status === 'connected' ? 'connected' : 'disconnected',
        uploads: 'operational',
        logging: 'operational',
      },
      summary: `System is ${health.status}. Error rate: ${health.error_rate}/hour. Total users: ${health.total_users}, Total videos: ${health.total_videos}`,
    };
  } catch (error) {
    console.error('[getDatabaseHealth] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      health: {
        status: 'unhealthy',
        needsAttention: true,
        errorRate: 0,
        recentUploads: 0,
        totalUsers: 0,
        totalVideos: 0,
        lastErrorTime: null,
      },
      summary: 'Failed to check database health',
    };
  }
}

/**
 * Tool: Get Active Sessions
 * Monitor currently active user sessions
 */
export async function getActiveSessions() {
  try {
    const supabase = getAdminClient();

    // This would typically query a sessions table
    // For now, we'll return placeholder data
    return {
      success: true,
      activeSessions: [],
      totalActive: 0,
      summary: 'Session monitoring requires dedicated sessions table',
    };
  } catch (error) {
    console.error('[getActiveSessions] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      activeSessions: [],
      totalActive: 0,
    };
  }
}

/**
 * Tool: Get Performance Metrics
 * Monitor system performance metrics
 */
export async function getPerformanceMetrics() {
  try {
    const supabase = getAdminClient();

    // Get recent video views for performance tracking
    const { data: recentViews, error } = await supabase
      .from('video_views')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (error) throw error;

    const viewsPerHour = recentViews?.length || 0;

    return {
      success: true,
      metrics: {
        viewsPerHour,
        avgResponseTime: 150, // Placeholder - would need actual monitoring
        cpuUsage: 45, // Placeholder
        memoryUsage: 60, // Placeholder
      },
      summary: `Performance: ${viewsPerHour} views/hour`,
    };
  } catch (error) {
    console.error('[getPerformanceMetrics] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        viewsPerHour: 0,
        avgResponseTime: 0,
        cpuUsage: 0,
        memoryUsage: 0,
      },
      summary: 'Failed to get performance metrics',
    };
  }
}

/**
 * Export all tools as a collection
 */
export const adminTools = {
  fetchSystemLogs,
  manageContent,
  manageUsers,
  getDatabaseHealth,
  getActiveSessions,
  getPerformanceMetrics,
};
