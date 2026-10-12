/**
 * AI Agent API
 * Server-side API for agent execution
 */

import { executeMainAgent, streamMainAgent } from '../agents/mainAgent';
import { TaskType, AgentStateType } from '../lib/langgraph/types';

/**
 * Execute agent workflow
 */
export async function executeAgentRequest(
  taskType: TaskType,
  initialState: Partial<AgentStateType> = {},
  options: { stream?: boolean } = {}
) {
  try {
    if (options.stream) {
      // For streaming, return the generator
      const streamGenerator = streamMainAgent(taskType, initialState);
      return {
        success: true,
        streaming: true,
        taskId: initialState.taskId || crypto.randomUUID(),
        stream: streamGenerator,
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

/**
 * Video upload agent execution
 */
export async function executeVideoUploadAgent(params: {
  videoId: string;
  videoTitle: string;
  videoCategory: string;
  userId: string;
  userRole?: string;
}) {
  return executeAgentRequest(TaskType.VIDEO_UPLOAD, {
    videoId: params.videoId,
    videoTitle: params.videoTitle,
    videoCategory: params.videoCategory,
    userId: params.userId,
    userRole: params.userRole || 'creator',
  });
}

/**
 * Recommendation agent execution
 */
export async function executeRecommendationAgent(params: {
  userId: string;
  userRole?: string;
  preferences?: any;
}) {
  return executeAgentRequest(TaskType.RECOMMENDATION, {
    userId: params.userId,
    userRole: params.userRole || 'user',
    contentAnalysis: params.preferences || {},
  });
}

/**
 * Content moderation agent execution
 */
export async function executeModerationAgent(params: {
  videoId: string;
  videoTitle: string;
  userId: string;
}) {
  return executeAgentRequest(TaskType.CONTENT_MODERATION, {
    videoId: params.videoId,
    videoTitle: params.videoTitle,
    userId: params.userId,
    userRole: 'moderator',
  });
}

/**
 * Copyright check agent execution
 */
export async function executeCopyrightCheckAgent(params: {
  videoId: string;
  userId: string;
}) {
  return executeAgentRequest(TaskType.COPYRIGHT_CHECK, {
    videoId: params.videoId,
    userId: params.userId,
    userRole: 'creator',
  });
}

/**
 * Revenue analysis agent execution
 */
export async function executeRevenueAnalysisAgent(params: {
  videoId: string;
  userId: string;
  timeframe?: string;
}) {
  return executeAgentRequest(TaskType.REVENUE_ANALYSIS, {
    videoId: params.videoId,
    userId: params.userId,
    userRole: 'creator',
    taskDescription: `Revenue analysis for timeframe: ${params.timeframe || '30 days'}`,
  });
}

/**
 * User support agent execution
 */
export async function executeSupportAgent(params: {
  userId: string;
  userRole?: string;
  request: string;
}) {
  return executeAgentRequest(TaskType.USER_SUPPORT, {
    userId: params.userId,
    userRole: params.userRole || 'user',
    taskDescription: params.request,
  });
}

/**
 * Content discovery agent execution
 */
export async function executeContentDiscoveryAgent(params: {
  userId: string;
  userRole?: string;
  interests?: string[];
}) {
  return executeAgentRequest(TaskType.CONTENT_DISCOVERY, {
    userId: params.userId,
    userRole: params.userRole || 'user',
    contentAnalysis: { interests: params.interests || [] },
  });
}
