/**
 * Supervisor API Route
 * Server-side API endpoints for system supervisor
 * Provides HTTP access to supervisor functionality
 */

import {
  executeSupervisorAPI,
  triggerHealthCheck,
  triggerSystemLogs,
  triggerContentModeration,
  triggerUserManagement,
  getSupervisorStatus,
  triggerManualSupervisor,
  getSupervisorConfig,
  updateSupervisorConfig,
} from '../api/supervisor';
import { SystemEventType, AlertLevel } from '../agents/supervisorTypes';

/**
 * GET /api/supervisor - Get supervisor status and configuration
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'health':
        const healthResult = await triggerHealthCheck();
        return Response.json(healthResult);

      case 'logs':
        const timeRange = searchParams.get('timeRange') || '24h';
        const limit = parseInt(searchParams.get('limit') || '100');
        const logsResult = await triggerSystemLogs({ timeRange, limit });
        return Response.json(logsResult);

      case 'status':
        const statusResult = await getSupervisorStatus();
        return Response.json(statusResult);

      case 'config':
        const configResult = await getSupervisorConfig();
        return Response.json(configResult);

      default:
        // Default to status check
        const defaultStatus = await getSupervisorStatus();
        return Response.json(defaultStatus);
    }
  } catch (error) {
    console.error('[Supervisor Route] GET error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supervisor - Execute supervisor with event
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'execute':
        const executeResult = await executeSupervisorAPI(params.event || {});
        return Response.json(executeResult);

      case 'content-moderation':
        const moderationResult = await triggerContentModeration(params);
        return Response.json(moderationResult);

      case 'user-management':
        const userResult = await triggerUserManagement(params);
        return Response.json(userResult);

      case 'manual':
        const manualResult = await triggerManualSupervisor({
          eventType: params.eventType,
          severity: params.severity,
          data: params.data,
          source: params.source || 'api',
        });
        return Response.json(manualResult);

      default:
        // Default to execute with event
        const defaultResult = await executeSupervisorAPI(body);
        return Response.json(defaultResult);
    }
  } catch (error) {
    console.error('[Supervisor Route] POST error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/supervisor - Update supervisor configuration
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const configResult = await updateSupervisorConfig(body);
    return Response.json(configResult);
  } catch (error) {
    console.error('[Supervisor Route] PUT error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
