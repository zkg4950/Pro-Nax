/**
 * LangGraph Agent Graph for ProNax
 * Multi-agent workflow orchestration with state management
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import {
  AgentState,
  AgentStateType,
  AgentType,
  TaskType,
  AgentNodeFunction,
  WORKFLOW_CONFIGS,
} from './types';
import { callLocalLLM } from '../../agents/mainAgent';

/**
 * Orchestrator Node
 * Routes tasks to appropriate specialized agents
 */
const orchestratorNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Orchestrator] Processing task:', state.taskType);
  console.log('[Orchestrator] Current agent:', state.currentAgent);

  // Keep currentAgent as orchestrator - let the routing function decide where to go
  return {
    status: 'running',
    lastUpdated: new Date(),
    messages: [
      `Orchestrator processing task "${state.taskType}"`,
    ],
  };
};

/**
 * Content Analyzer Node
 * Analyzes video content for metadata, tags, and categorization
 */
const contentAnalyzerNode: AgentNodeFunction = async (
  state: AgentStateType
) => {
  console.log('[Content Analyzer] Analyzing video:', state.videoId);

  // Placeholder: Implement actual content analysis logic
  const analysisResult = {
    detectedCategory: state.videoCategory || 'general',
    suggestedTags: ['video', 'content'],
    qualityScore: 0.85,
    duration: 120,
  };

  return {
    contentAnalysis: analysisResult,
    currentAgent: AgentType.MODERATOR,
    status: 'running',
    lastUpdated: new Date(),
    messages: ['Content analysis completed'],
    agentOutputs: {
      content_analyzer: analysisResult,
    },
  };
};

/**
 * Moderator Node
 * Reviews content for policy violations and community guidelines
 */
const moderatorNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Moderator] Reviewing content:', state.videoId);

  // Placeholder: Implement actual moderation logic
  const moderationResult = {
    status: 'approved',
    flaggedContent: [],
    confidence: 0.95,
  };

  return {
    moderationStatus: moderationResult.status,
    moderationRequired: false,
    currentAgent: AgentType.COPYRIGHT_DETECTOR,
    status: 'running',
    lastUpdated: new Date(),
    messages: ['Moderation review completed'],
    agentOutputs: {
      moderator: moderationResult,
    },
  };
};

/**
 * Copyright Detector Node
 * Detects potential copyright violations using fingerprinting
 */
const copyrightDetectorNode: AgentNodeFunction = async (
  state: AgentStateType
) => {
  console.log('[Copyright Detector] Checking for copyright:', state.videoId);

  // Placeholder: Implement actual copyright detection logic
  const copyrightResult = {
    status: 'clear',
    matches: [],
    confidence: 0.98,
  };

  return {
    copyrightStatus: copyrightResult.status,
    copyrightCheckRequired: false,
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Copyright check completed'],
    agentOutputs: {
      copyright_detector: copyrightResult,
    },
  };
};

/**
 * Recommendation Engine Node
 * Generates personalized content recommendations
 */
const recommendationEngineNode: AgentNodeFunction = async (
  state: AgentStateType
) => {
  console.log('[Recommendation Engine] Generating recommendations for user:', state.userId);

  // Placeholder: Implement actual recommendation logic
  const recommendations = [
    { videoId: 'rec1', score: 0.95, reason: 'similar category' },
    { videoId: 'rec2', score: 0.88, reason: 'trending' },
    { videoId: 'rec3', score: 0.82, reason: 'high engagement' },
  ];

  return {
    recommendations,
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Recommendations generated'],
    agentOutputs: {
      recommendation_engine: recommendations,
    },
  };
};

/**
 * Revenue Tracker Node
 * Tracks and analyzes creator revenue and monetization
 */
const revenueTrackerNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Revenue Tracker] Analyzing revenue for video:', state.videoId);

  // Placeholder: Implement actual revenue tracking logic
  const revenueData = {
    totalViews: 1000,
    estimatedRevenue: 1.50,
    cpm: 1.50,
    countryBreakdown: { US: 0.80, UK: 0.40, CA: 0.30 },
  };

  return {
    revenueData,
    currentAgent: AgentType.ANALYTICS_AGENT,
    status: 'running',
    lastUpdated: new Date(),
    messages: ['Revenue data analyzed'],
    agentOutputs: {
      revenue_tracker: revenueData,
    },
  };
};

/**
 * Analytics Agent Node
 * Analyzes platform metrics and generates insights
 */
const analyticsAgentNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Analytics Agent] Generating analytics insights');

  // Placeholder: Implement actual analytics logic
  const insights = {
    trend: 'upward',
    growthRate: 0.15,
    recommendations: ['increase upload frequency', 'focus on trending topics'],
  };

  return {
    contentAnalysis: insights,
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Analytics insights generated'],
    agentOutputs: {
      analytics_agent: insights,
    },
  };
};

/**
 * Support Agent Node
 * Provides user support and answers common questions
 */
const supportAgentNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Support Agent] Handling support request from user:', state.userId);

  // Placeholder: Implement actual support logic
  const response = {
    answer: 'I can help you with that. Please provide more details.',
    suggestedActions: ['check help center', 'contact support'],
    resolved: false,
  };

  return {
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Support response generated'],
    agentOutputs: {
      support_agent: response,
    },
  };
};

/**
 * Creator Coach Node
 * Provides AI-powered coaching for content creators
 * Handles requests for viral ideas, title optimization, script writing, and growth strategies
 */
const creatorCoachNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Creator Coach] START - Processing creator request from user:', state.userId);

  // Extract the user's request from taskDescription or messages
  const userRequest = state.taskDescription || state.messages?.[0] || '';
  const metrics = state.contentAnalysis || {};
  const recentVideos = state.recommendations || [];

  console.log('[Creator Coach] User request:', userRequest);
  console.log('[Creator Coach] Context metrics:', metrics);
  console.log('[Creator Coach] Recent videos:', recentVideos);

  // Construct the LLM prompt
  const llmPrompt = `Act as a professional content creator coach. Provide coaching for the following request:

User Request: ${userRequest}
Channel Metrics: ${JSON.stringify(metrics)}
Recent Videos: ${JSON.stringify(recentVideos)}

Provide response in JSON format with:
- advice: Main coaching advice
- suggestions: Array of specific suggestions (3-5 items)
- actionItems: Array of actionable steps (3-5 items)
- estimatedImpact: Expected impact (e.g., "25-40% increase in views")
- Optional fields based on request: viralIdeas, titleExamples, scriptTemplate, thumbnailTips, growthStrategies

Language: Respond in the same language as the user's request (English, Urdu, or Roman Urdu).`;

  try {
    console.log('[Creator Coach] Calling local LLM...');
    const llmResponse = await callLocalLLM(llmPrompt, {
      userId: state.userId,
      userRole: state.userRole,
      taskDescription: state.taskDescription,
      metrics,
      recentVideos,
    });

    console.log('[Creator Coach] LLM response received, parsing...');
    const response = JSON.parse(llmResponse);

    console.log('[Creator Coach] Parsed response:', response);
    console.log('[Creator Coach] END - Returning completed state');

    return {
      currentAgent: AgentType.ORCHESTRATOR,
      status: 'completed',
      lastUpdated: new Date(),
      messages: [`Creator coach response generated for: ${userRequest}`],
      agentOutputs: {
        creator_coach: response,
      },
    };
  } catch (error) {
    console.error('[Creator Coach] LLM error:', error);

    // Return error response
    const errorResponse = {
      advice: `LLM connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Ensure Ollama is running: ollama serve',
        'Install Ollama from https://ollama.ai if not installed',
        'Pull a model: ollama pull llama3',
        'Or configure OPENAI_API_KEY in .env for cloud LLM',
      ],
      actionItems: [
        'Check LLM server status',
        'Verify LLM configuration in .env',
        'Check network connectivity',
      ],
      estimatedImpact: 'LLM connection required for AI responses',
      error: error instanceof Error ? error.message : 'Unknown error',
      request: userRequest,
    };

    return {
      currentAgent: AgentType.ORCHESTRATOR,
      status: 'completed',
      lastUpdated: new Date(),
      messages: [`Creator coach error for: ${userRequest}`],
      agentOutputs: {
        creator_coach: errorResponse,
      },
    };
  }
};

/**
 * Video Assistant Node
 * AI-powered video assistant for title, description, hashtags, and metadata editing
 * Can access video details and edit them based on user's request
 */
const videoAssistantNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Video Assistant] START - Processing video assistant request from user:', state.userId);

  const userRequest = state.taskDescription || state.messages?.[0] || '';
  const videoId = state.videoId || '';
  const videoTitle = state.videoTitle || '';
  const videoCategory = state.videoCategory || '';
  const userId = state.userId || '';

  console.log('[Video Assistant] User request:', userRequest);
  console.log('[Video Assistant] Video ID:', videoId);
  console.log('[Video Assistant] Current title:', videoTitle);
  console.log('[Video Assistant] Category:', videoCategory);

  // Construct the LLM prompt for video assistance
  const llmPrompt = `Act as an expert video content optimizer. Help the user with their video.

User Request: ${userRequest}
Video ID: ${videoId}
Current Title: ${videoTitle}
Category: ${videoCategory}
User ID: ${userId}

Based on the user's request, provide response in JSON format with:

If user wants title changes:
- newTitle: Optimized title (engaging, SEO-friendly)
- titleReason: Why this title is better

If user wants description changes:
- newDescription: Optimized description
- descriptionReason: Why this description is better

If user wants hashtags:
- hashtags: Array of relevant hashtags (10-15)
- hashtagReason: Why these hashtags

If user wants general help:
- suggestions: Array of suggestions for improvement
- actionItems: Array of actionable steps

Language: Respond in the same language as the user's request (English, Urdu, or Roman Urdu).`;

  try {
    console.log('[Video Assistant] Calling local LLM...');
    const llmResponse = await callLocalLLM(llmPrompt, {
      userId: state.userId,
      userRole: state.userRole,
      taskDescription: state.taskDescription,
      videoId,
      videoTitle,
      videoCategory,
    });

    console.log('[Video Assistant] LLM response received, parsing...');
    const response = JSON.parse(llmResponse);

    console.log('[Video Assistant] Parsed response:', response);
    console.log('[Video Assistant] END - Returning completed state');

    return {
      currentAgent: AgentType.ORCHESTRATOR,
      status: 'completed',
      lastUpdated: new Date(),
      messages: [`Video assistant response generated for video: ${videoId}`],
      agentOutputs: {
        video_assistant: response,
      },
    };
  } catch (error) {
    console.error('[Video Assistant] LLM error:', error);

    const errorResponse = {
      advice: `LLM connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Ensure Ollama is running: ollama serve',
        'Check video ID and details',
        'Verify LLM configuration',
      ],
      actionItems: [
        'Check LLM server status',
        'Verify video metadata',
      ],
      error: error instanceof Error ? error.message : 'Unknown error',
      request: userRequest,
    };

    return {
      currentAgent: AgentType.ORCHESTRATOR,
      status: 'completed',
      lastUpdated: new Date(),
      messages: [`Video assistant error for video: ${videoId}`],
      agentOutputs: {
        video_assistant: errorResponse,
      },
    };
  }
};

/**
 * Routing function to determine next node based on current agent
 */
const routeToNextAgent = (state: AgentStateType): string => {
  const currentAgent = state.currentAgent;

  switch (currentAgent) {
    case AgentType.ORCHESTRATOR:
      // If orchestrator is active and task is complete, end
      if (state.status === 'completed') {
        return END;
      }
      // Otherwise, route based on task type
      return state.taskType === TaskType.VIDEO_UPLOAD
        ? AgentType.CONTENT_ANALYZER
        : state.taskType === TaskType.CONTENT_MODERATION
          ? AgentType.MODERATOR
          : state.taskType === TaskType.COPYRIGHT_CHECK
            ? AgentType.COPYRIGHT_DETECTOR
            : state.taskType === TaskType.RECOMMENDATION
              ? AgentType.RECOMMENDATION_ENGINE
              : state.taskType === TaskType.REVENUE_ANALYSIS
                ? AgentType.REVENUE_TRACKER
                : state.taskType === TaskType.USER_SUPPORT
                  ? AgentType.SUPPORT_AGENT
                  : state.taskType === TaskType.CONTENT_DISCOVERY
                    ? AgentType.RECOMMENDATION_ENGINE
                    : state.taskType === TaskType.CREATOR_COACH
                      ? AgentType.CREATOR_COACH
                      : state.taskType === TaskType.VIDEO_ASSISTANT
                        ? AgentType.VIDEO_ASSISTANT
                        : END;

    case AgentType.CONTENT_ANALYZER:
      // After content analysis, go to moderator for video upload workflow
      return state.taskType === TaskType.VIDEO_UPLOAD
        ? AgentType.MODERATOR
        : END;

    case AgentType.MODERATOR:
      // After moderation, go to copyright detector for video upload workflow
      return state.taskType === TaskType.VIDEO_UPLOAD
        ? AgentType.COPYRIGHT_DETECTOR
        : END;

    case AgentType.COPYRIGHT_DETECTOR:
      // After copyright check, end the workflow
      return END;

    case AgentType.RECOMMENDATION_ENGINE:
      // After recommendations, end the workflow
      return END;

    case AgentType.REVENUE_TRACKER:
      // After revenue tracking, go to analytics agent
      return AgentType.ANALYTICS_AGENT;

    case AgentType.ANALYTICS_AGENT:
      // After analytics, end the workflow
      return END;

    case AgentType.SUPPORT_AGENT:
      // After support, end the workflow
      return END;

    case AgentType.CREATOR_COACH:
      // After creator coach, end the workflow
      return END;

    case AgentType.VIDEO_ASSISTANT:
      // After video assistant, end the workflow
      return END;

    default:
      return END;
  }
};

/**
 * Create the main agent graph
 */
export function createAgentGraph() {
  const graph = new StateGraph({
    state: AgentState,
  });

  // Add nodes
  graph.addNode(AgentType.ORCHESTRATOR, orchestratorNode);
  graph.addNode(AgentType.CONTENT_ANALYZER, contentAnalyzerNode);
  graph.addNode(AgentType.MODERATOR, moderatorNode);
  graph.addNode(AgentType.COPYRIGHT_DETECTOR, copyrightDetectorNode);
  graph.addNode(AgentType.RECOMMENDATION_ENGINE, recommendationEngineNode);
  graph.addNode(AgentType.REVENUE_TRACKER, revenueTrackerNode);
  graph.addNode(AgentType.ANALYTICS_AGENT, analyticsAgentNode);
  graph.addNode(AgentType.SUPPORT_AGENT, supportAgentNode);
  graph.addNode(AgentType.CREATOR_COACH, creatorCoachNode);
  graph.addNode(AgentType.VIDEO_ASSISTANT, videoAssistantNode);

  // Add edges
  graph.addEdge(START, AgentType.ORCHESTRATOR);

  // Add conditional edges for routing
  graph.addConditionalEdges(
    AgentType.ORCHESTRATOR,
    routeToNextAgent,
    Object.values(AgentType).concat([END])
  );

  graph.addConditionalEdges(
    AgentType.CONTENT_ANALYZER,
    routeToNextAgent,
    [AgentType.MODERATOR, END]
  );

  graph.addConditionalEdges(
    AgentType.MODERATOR,
    routeToNextAgent,
    [AgentType.COPYRIGHT_DETECTOR, END]
  );

  graph.addConditionalEdges(
    AgentType.COPYRIGHT_DETECTOR,
    routeToNextAgent,
    [END]
  );

  graph.addConditionalEdges(
    AgentType.RECOMMENDATION_ENGINE,
    routeToNextAgent,
    [END]
  );

  graph.addConditionalEdges(
    AgentType.REVENUE_TRACKER,
    routeToNextAgent,
    [AgentType.ANALYTICS_AGENT]
  );

  graph.addConditionalEdges(
    AgentType.ANALYTICS_AGENT,
    routeToNextAgent,
    [END]
  );

  graph.addConditionalEdges(
    AgentType.SUPPORT_AGENT,
    routeToNextAgent,
    [END]
  );

  graph.addConditionalEdges(
    AgentType.CREATOR_COACH,
    routeToNextAgent,
    [END]
  );

  graph.addConditionalEdges(
    AgentType.VIDEO_ASSISTANT,
    routeToNextAgent,
    [END]
  );

  return graph.compile();
}

/**
 * Get a compiled graph instance
 */
export const agentGraph = createAgentGraph();

/**
 * Execute a workflow with the agent graph
 */
export async function executeWorkflow(
  taskType: TaskType,
  initialState: Partial<AgentStateType> = {}
) {
  const workflowConfig = WORKFLOW_CONFIGS[taskType];

  const inputState: AgentStateType = {
    ...AgentState.State,
    taskType,
    taskId: crypto.randomUUID(),
    status: 'idle',
    lastUpdated: new Date(),
    ...initialState,
  };

  console.log('[Workflow] Starting workflow:', workflowConfig.name);
  console.log('[Workflow] Initial state:', inputState);

  try {
    const result = await agentGraph.invoke(inputState);
    console.log('[Workflow] Workflow completed:', result);
    return result;
  } catch (error) {
    console.error('[Workflow] Workflow failed:', error);
    throw error;
  }
}

/**
 * Example usage:
 *
 * // Execute video upload workflow
 * const result = await executeWorkflow(TaskType.VIDEO_UPLOAD, {
 *   videoId: 'video-123',
 *   videoTitle: 'My Video',
 *   videoCategory: 'gaming',
 *   userId: 'user-123',
 * });
 *
 * // Execute recommendation workflow
 * const recommendations = await executeWorkflow(TaskType.RECOMMENDATION, {
 *   userId: 'user-123',
 * });
 */
