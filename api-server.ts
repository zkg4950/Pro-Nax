/**
 * API Server for Supervisor Endpoints
 * Simple Express server to handle API routes while Vite handles the frontend
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
import {
  triggerHealthCheck,
  triggerSystemLogs,
  triggerContentModeration,
  triggerUserManagement,
  getSupervisorStatus,
  triggerManualSupervisor,
  getSupervisorConfig,
  updateSupervisorConfig,
  executeSupervisorAPI,
} from './src/api/supervisor';
import { SystemEventType, AlertLevel } from './src/agents/supervisorTypes';
import { startSupervisorWorker } from './src/agents/supervisorWorker';
import { startSupervisorRealtime, stopSupervisorRealtime } from './src/agents/supervisorRealtime';
import { createWorker } from './src/lib/queue/service';
import { jobHandlers } from './src/lib/queue/handlers';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/supervisor', async (req, res) => {
  try {
    const action = req.query.action as string;

    switch (action) {
      case 'health':
        const healthResult = await triggerHealthCheck();
        return res.json(healthResult);

      case 'logs':
        const timeRange = (req.query.timeRange as string) || '24h';
        const limit = parseInt((req.query.limit as string) || '100');
        const logsResult = await triggerSystemLogs({ timeRange, limit });
        return res.json(logsResult);

      case 'status':
        const statusResult = await getSupervisorStatus();
        return res.json(statusResult);

      case 'config':
        const configResult = await getSupervisorConfig();
        return res.json(configResult);

      default:
        // Default to status check
        const defaultStatus = await getSupervisorStatus();
        return res.json(defaultStatus);
    }
  } catch (error) {
    console.error('[API Server] GET error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST endpoint for supervisor actions
app.post('/api/supervisor', async (req, res) => {
  try {
    const { action, ...params } = req.body;

    switch (action) {
      case 'execute':
        const executeResult = await executeSupervisorAPI(params.event || {});
        return res.json(executeResult);

      case 'content-moderation':
        const moderationResult = await triggerContentModeration(params);
        return res.json(moderationResult);

      case 'user-management':
        const userResult = await triggerUserManagement(params);
        return res.json(userResult);

      case 'manual':
        const manualResult = await triggerManualSupervisor({
          eventType: params.eventType,
          severity: params.severity,
          data: params.data,
          source: params.source || 'api',
        });
        return res.json(manualResult);

      default:
        // Default to execute with event
        const defaultResult = await triggerManualSupervisor(req.body);
        return res.json(defaultResult);
    }
  } catch (error) {
    console.error('[API Server] POST error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PUT endpoint for configuration
app.put('/api/supervisor', async (req, res) => {
  try {
    const configResult = await updateSupervisorConfig(req.body);
    return res.json(configResult);
  } catch (error) {
    console.error('[API Server] PUT error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ProNax Supervisor API Server',
    endpoints: {
      'GET /api/supervisor': 'Get supervisor status, health, logs, or config',
      'POST /api/supervisor': 'Execute supervisor actions',
      'PUT /api/supervisor': 'Update supervisor configuration',
      'POST /api/creator-coach': 'AI Creator Coach - powered by local LangGraph server at http://localhost:8000',
    },
    note: 'The Creator Coach endpoint now routes directly to your local LangGraph server for dynamic AI responses',
  });
});

// Creator Coach endpoint - powered by local LangGraph server
app.post('/api/creator-coach', async (req, res) => {
  try {
    const { request, metrics, recentVideos, userId } = req.body;

    console.log('[API Server] Creator Coach request:', request);
    console.log('[API Server] Context metrics:', metrics);
    console.log('[API Server] Recent videos:', recentVideos);

    // Call local LangGraph server directly
    const response = await fetch('http://localhost:8000/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request: request,
        metrics: metrics,
        recentVideos: recentVideos,
        taskType: 'creator_coach',
        userId: userId || 'anonymous',
      }),
    });

    if (!response.ok) {
      throw new Error(`Local LangGraph server error: ${response.status} ${response.statusText}`);
    }

    const apiData = await response.json();
    console.log('[API Server] Local LangGraph response:', apiData);

    // Return the dynamic response from LangGraph directly
    return res.json({
      success: true,
      data: apiData.data || apiData,
    });
  } catch (error) {
    console.error('[API Server] Creator Coach error:', error);
    res.status(503).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Ensure your local LangGraph server is running at http://localhost:8000',
    });
  }
});

// Start supervisor systems
async function startSupervisorSystems() {
  console.log('[API Server] Supervisor disabled temporarily - focusing on Creator Coach integration');

  // TODO: Re-enable once LLM is configured
  /*
  console.log('[API Server] Starting supervisor systems...');

  // Start supervisor background worker
  const worker = startSupervisorWorker({
    intervalMs: 60000, // 1 minute
    autoMode: true,
    enableAlerts: true,
    maxHistorySize: 1000,
  });
  console.log('[API Server] Supervisor worker started');

  // Start realtime listener
  const realtimeListener = startSupervisorRealtime();
  console.log('[API Server] Supervisor realtime listener started');

  // Start queue worker for supervisor-check jobs (optional - requires Redis)
  // Skip queue worker for now - requires Redis and ioredis installation
  console.log('[API Server] Queue worker skipped (requires Redis configuration and ioredis package)');
  console.log('[API Server] Supervisor will process realtime events directly');

  // Setup graceful shutdown
  setupGracefulShutdown(worker);
  */
}

// Setup graceful shutdown without queue worker
function setupGracefulShutdown(worker: any) {
  process.on('SIGINT', async () => {
    console.log('[API Server] Shutting down...');
    // worker.stop(); // Disabled for now
    stopSupervisorRealtime();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[API Server] Shutting down...');
    // worker.stop(); // Disabled for now
    stopSupervisorRealtime();
    process.exit(0);
  });
}

// Start server
app.listen(PORT, async () => {
  console.log(`[API Server] Running on http://localhost:${PORT}`);
  console.log(`[API Server] API endpoints available at http://localhost:${PORT}/api/supervisor`);

  // Start supervisor systems after server is ready
  await startSupervisorSystems();
});

export default app;
