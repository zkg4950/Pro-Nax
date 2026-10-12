/**
 * AI Agent API Route
 * Handles agent execution requests
 */

import { createRoute } from '@tanstack/react-router';
import { executeMainAgent, streamMainAgent } from '../agents/mainAgent';
import { TaskType } from '../lib/langgraph/types';

export const Route = createRoute({
  path: '/api/agent',
  component: AgentAPI,
});

function AgentAPI() {
  return null; // This is a server-side route
}

// Server-side action to execute agent
export async function agentAction({
  taskType,
  initialState,
  stream = false,
}: {
  taskType: TaskType;
  initialState?: any;
  stream?: boolean;
}) {
  try {
    if (stream) {
      // Return async generator for streaming
      const streamGenerator = streamMainAgent(taskType, initialState);
      return {
        success: true,
        streaming: true,
        taskId: initialState?.taskId || crypto.randomUUID(),
      };
    } else {
      // Execute synchronously
      const result = await executeMainAgent(taskType, initialState);
      return {
        success: true,
        result,
      };
    }
  } catch (error) {
    console.error('Agent execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
