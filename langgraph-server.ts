/**
 * Local LangGraph Server
 * FastAPI-like Node.js server for LangGraph execution
 * Exposes /api/generate endpoint for AI-powered responses
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { executeWorkflow } from './src/lib/langgraph/graph';
import { TaskType } from './src/lib/langgraph/types';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.LANGGRAPH_PORT || '8000');

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Local LangGraph Server',
    version: '1.0.0',
    endpoints: {
      'POST /api/generate': 'Execute LangGraph workflow for AI responses',
      'GET /health': 'Health check',
    },
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Direct LLM call helper (bypasses circular dependency)
async function callLocalLLMDirect(prompt: string, context?: any): Promise<string> {
  // This calls your actual local AI engine
  // For now, we'll use the LangGraph workflow which internally uses the LLM
  // In production, you can replace this with a direct call to your AI engine

  const result = await executeWorkflow(TaskType.CREATOR_COACH, {
    taskDescription: prompt,
    contentAnalysis: context?.metrics || {},
    recommendations: context?.recentVideos || [],
    userId: context?.userId || 'anonymous',
    userRole: 'creator',
  });

  const responseData = result.agentOutputs?.creator_coach || result.agentOutputs || result;
  return JSON.stringify(responseData);
}

// Main generate endpoint - executes LangGraph workflow
app.post('/api/generate', async (req, res) => {
  try {
    const { request, metrics, recentVideos, taskType, userId } = req.body;

    console.log('[LangGraph Server] Received request:', {
      taskType: taskType || 'creator_coach',
      request: request?.substring(0, 100) + '...',
      userId: userId || 'anonymous',
    });

    // Default to creator_coach if not specified
    const effectiveTaskType = (taskType || 'creator_coach') as TaskType;

    // Execute LangGraph workflow
    const result = await executeWorkflow(effectiveTaskType, {
      taskDescription: request,
      contentAnalysis: metrics || {},
      recommendations: recentVideos || [],
      userId: userId || 'anonymous',
      userRole: 'creator',
    });

    console.log('[LangGraph Server] Workflow completed:', {
      status: result.status,
      currentAgent: result.currentAgent,
    });

    // Extract the response from agent outputs
    const responseData = result.agentOutputs?.creator_coach || result.agentOutputs || result;

    return res.json({
      success: true,
      data: responseData,
      fullState: result, // Include full state for debugging
    });
  } catch (error) {
    console.error('[LangGraph Server] Error:', error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[LangGraph Server] Running on http://localhost:${PORT}`);
  console.log(`[LangGraph Server] Main endpoint: http://localhost:${PORT}/api/generate`);
  console.log(`[LangGraph Server] Health check: http://localhost:${PORT}/health`);
});

export default app;
