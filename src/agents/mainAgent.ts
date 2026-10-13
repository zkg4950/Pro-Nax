/**
 * Main AI Agent for ProNax
 * Powered by LangGraph with local LLM integration
 * Connects to local LangGraph server at http://localhost:8000
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import {
  AgentState,
  AgentStateType,
  AgentType,
  TaskType,
  AgentNodeFunction,
  WORKFLOW_CONFIGS,
} from '../lib/langgraph/types';
import dotenv from 'dotenv';

// Load environment variables for Node.js context
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Get environment variable safely
 */
function getEnvVar(key: string): string {
  // Try process.env first (Node.js context)
  if (typeof process !== 'undefined' && process.env[key]) {
    return process.env[key];
  }
  // Fall back to import.meta.env (Vite context)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || '';
  }
  return '';
}

/**
 * LLM Integration Helper
 * Calls local LLM (Ollama, OpenAI, or custom) for AI responses
 */
export async function callLocalLLM(prompt: string, context?: any): Promise<string> {
  console.log('[callLocalLLM] Prompt received:', prompt.substring(0, 100) + '...');
  console.log('[callLocalLLM] Context:', context);

  // Get LLM configuration from environment
  const llmProvider = getEnvVar('LLM_PROVIDER') || 'ollama';
  const ollamaBaseUrl = getEnvVar('OLLAMA_BASE_URL') || 'http://localhost:11434';
  const ollamaModel = getEnvVar('OLLAMA_MODEL') || 'llama3';
  const openaiApiKey = getEnvVar('OPENAI_API_KEY');
  const openaiModel = getEnvVar('OPENAI_MODEL') || 'gpt-4';
  const customEndpoint = getEnvVar('CUSTOM_LLM_ENDPOINT');
  const groqApiKey = getEnvVar('GROQ_API_KEY');
  const groqModel = getEnvVar('GROQ_MODEL') || 'groq/llama3-70b-8192';

  console.log(`[callLocalLLM] Using LLM provider: ${llmProvider}`);

  try {
    // OPTION 1: Ollama (Local LLM) - Default
    if (llmProvider === 'ollama') {
      console.log(`[callLocalLLM] Calling Ollama at ${ollamaBaseUrl} with model ${ollamaModel}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      try {
        const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.7,
              top_p: 0.9,
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const llmResponse = data.response;

        console.log('[callLocalLLM] Ollama response received:', llmResponse.substring(0, 200) + '...');

        // Try to parse as JSON, if it's already JSON
        try {
          const parsed = JSON.parse(llmResponse);
          return JSON.stringify(parsed);
        } catch {
          // If not JSON, wrap it in the expected format
          return JSON.stringify({
            advice: llmResponse,
            suggestions: [],
            actionItems: [],
            estimatedImpact: 'AI-generated response',
          });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Ollama request timed out after 2 minutes');
        }
        throw fetchError;
      }
    }

    // OPTION 2: OpenAI API
    if (llmProvider === 'openai') {
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY not set in environment variables');
      }

      console.log(`[callLocalLLM] Calling OpenAI with model ${openaiModel}`);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const llmResponse = data.choices[0].message.content;

      console.log('[callLocalLLM] OpenAI response received:', llmResponse.substring(0, 200) + '...');

      // Try to parse as JSON, if it's already JSON
      try {
        const parsed = JSON.parse(llmResponse);
        return JSON.stringify(parsed);
      } catch {
        // If not JSON, wrap it in the expected format
        return JSON.stringify({
          advice: llmResponse,
          suggestions: [],
          actionItems: [],
          estimatedImpact: 'AI-generated response',
        });
      }
    }

    // OPTION 2.5: Groq API (Fast LLM via Groq Cloud)
    if (llmProvider === 'groq') {
      if (!groqApiKey) {
        throw new Error('GROQ_API_KEY not set in environment variables');
      }

      console.log(`[callLocalLLM] Calling Groq with model ${groqModel}`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Groq returned ${response.status}: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const llmResponse = data.choices[0].message.content;

      console.log('[callLocalLLM] Groq response received:', llmResponse.substring(0, 200) + '...');

      // Try to parse as JSON, if it's already JSON
      try {
        const parsed = JSON.parse(llmResponse);
        return JSON.stringify(parsed);
      } catch {
        // If not JSON, wrap it in the expected format
        return JSON.stringify({
          advice: llmResponse,
          suggestions: [],
          actionItems: [],
          estimatedImpact: 'AI-generated response',
        });
      }
    }

    // OPTION 3: Custom LLM endpoint
    if (llmProvider === 'custom') {
      if (!customEndpoint) {
        throw new Error('CUSTOM_LLM_ENDPOINT not set in environment variables');
      }

      console.log(`[callLocalLLM] Calling custom LLM at ${customEndpoint}`);
      const response = await fetch(customEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...context }),
      });

      if (!response.ok) {
        throw new Error(`Custom LLM returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const llmResponse = data.response || data.text || data;

      console.log('[callLocalLLM] Custom LLM response received');

      // Try to parse as JSON, if it's already JSON
      try {
        const parsed = JSON.parse(llmResponse);
        return JSON.stringify(parsed);
      } catch {
        // If not JSON, wrap it in the expected format
        return JSON.stringify({
          advice: llmResponse,
          suggestions: [],
          actionItems: [],
          estimatedImpact: 'AI-generated response',
        });
      }
    }

    // Fallback if provider is not recognized
    throw new Error(`Unknown LLM provider: ${llmProvider}. Use 'ollama', 'openai', 'groq', or 'custom'`);
  } catch (error) {
    console.error('[callLocalLLM] LLM error:', error);

    // Return a helpful error response
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
    };

    return JSON.stringify(errorResponse);
  }
}

/**
 * Orchestrator Node
 * Routes tasks to appropriate specialized agents with LLM assistance
 */
const orchestratorNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Orchestrator] Processing task:', state.taskType);
  console.log('[Orchestrator] Task description:', state.taskDescription);

  let nextAgent = AgentType.ORCHESTRATOR;

  switch (state.taskType) {
    case TaskType.VIDEO_UPLOAD:
      nextAgent = AgentType.CONTENT_ANALYZER;
      break;
    case TaskType.CONTENT_MODERATION:
      nextAgent = AgentType.MODERATOR;
      break;
    case TaskType.COPYRIGHT_CHECK:
      nextAgent = AgentType.COPYRIGHT_DETECTOR;
      break;
    case TaskType.RECOMMENDATION:
      nextAgent = AgentType.RECOMMENDATION_ENGINE;
      break;
    case TaskType.REVENUE_ANALYSIS:
      nextAgent = AgentType.REVENUE_TRACKER;
      break;
    case TaskType.USER_SUPPORT:
      nextAgent = AgentType.SUPPORT_AGENT;
      break;
    case TaskType.CONTENT_DISCOVERY:
      nextAgent = AgentType.RECOMMENDATION_ENGINE;
      break;
    case TaskType.VIDEO_ASSISTANT:
      nextAgent = AgentType.VIDEO_ASSISTANT;
      break;
    default:
      nextAgent = AgentType.ORCHESTRATOR;
  }

  // Use local LLM to get routing reasoning
  const llmPrompt = `Task: ${state.taskType}
Description: ${state.taskDescription}
Current agent: orchestrator

Recommend next agent to handle this task and provide reasoning.`;

  const llmResponse = await callLocalLLM(llmPrompt, { taskType: state.taskType });
  console.log('[Orchestrator] LLM reasoning:', llmResponse);

  return {
    currentAgent: nextAgent,
    status: 'running',
    lastUpdated: new Date(),
    messages: [
      `Orchestrator routing task "${state.taskType}" to ${nextAgent}`,
      `LLM reasoning: ${llmResponse}`,
    ],
  };
};

/**
 * Content Analyzer Node with LLM
 * Analyzes video content using AI
 */
const contentAnalyzerNode: AgentNodeFunction = async (
  state: AgentStateType
) => {
  console.log('[Content Analyzer] Analyzing video:', state.videoId);

  const llmPrompt = `Analyze this video content:
Title: ${state.videoTitle}
Category: ${state.videoCategory}
Description: ${state.taskDescription}

Provide:
1. Suggested category
2. Tags for the video
3. Quality assessment
4. Engagement potential score (0-100)`;

  const llmResponse = await callLocalLLM(llmPrompt, {
    videoTitle: state.videoTitle,
    videoCategory: state.videoCategory,
    taskDescription: state.taskDescription,
  });
  const analysisResult = JSON.parse(llmResponse);

  return {
    contentAnalysis: analysisResult,
    currentAgent: AgentType.MODERATOR,
    status: 'running',
    lastUpdated: new Date(),
    messages: ['Content analysis completed with AI'],
    agentOutputs: {
      content_analyzer: analysisResult,
    },
  };
};

/**
 * Moderator Node with LLM
 * Reviews content using AI moderation
 */
const moderatorNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Moderator] Reviewing content:', state.videoId);

  const llmPrompt = `Moderate this content:
Title: ${state.videoTitle}
Category: ${state.videoCategory}
Description: ${state.taskDescription}

Check for:
- Policy violations
- Inappropriate content
- Community guideline violations

Provide moderation decision (approve/reject/flag) with reasoning.`;

  const llmResponse = await callLocalLLM(llmPrompt, {
    videoTitle: state.videoTitle,
    videoCategory: state.videoCategory,
    taskDescription: state.taskDescription,
  });
  const moderationResult = JSON.parse(llmResponse);

  return {
    moderationStatus: moderationResult.isApproved ? 'approved' : 'flagged',
    moderationRequired: !moderationResult.isApproved,
    moderationReason: moderationResult.reasoning || '',
    currentAgent: AgentType.COPYRIGHT_DETECTOR,
    status: 'running',
    lastUpdated: new Date(),
    messages: ['Moderation review completed with AI'],
    agentOutputs: {
      moderator: moderationResult,
    },
  };
};

/**
 * Copyright Detector Node
 * Detects copyright violations (placeholder for actual fingerprinting)
 */
const copyrightDetectorNode: AgentNodeFunction = async (
  state: AgentStateType
) => {
  console.log('[Copyright Detector] Checking for copyright:', state.videoId);

  // In production, this would call the actual copyright detection service
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
 * Recommendation Engine Node with LLM
 * Generates personalized recommendations using AI
 */
const recommendationEngineNode: AgentNodeFunction = async (
  state: AgentStateType
) => {
  console.log('[Recommendation Engine] Generating recommendations for user:', state.userId);

  const llmPrompt = `Generate content recommendations for user:
User ID: ${state.userId}
User role: ${state.userRole}
Task: ${state.taskDescription}

Provide 3-5 video recommendations with:
- Video ID (placeholder)
- Relevance score (0-100)
- Reason for recommendation`;

  const llmResponse = await callLocalLLM(llmPrompt, {
    userId: state.userId,
    userRole: state.userRole,
    taskDescription: state.taskDescription,
  });
  const recommendationsData = JSON.parse(llmResponse);

  const recommendations = Array.isArray(recommendationsData.suggestions)
    ? recommendationsData.suggestions.map((s: string, i: number) => ({
        videoId: `rec-${i + 1}`,
        score: 90 - i * 5,
        reason: s,
      }))
    : [
        { videoId: 'rec1', score: 95, reason: 'High relevance' },
        { videoId: 'rec2', score: 88, reason: 'Trending content' },
        { videoId: 'rec3', score: 82, reason: 'Similar interests' },
      ];

  return {
    recommendations,
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Recommendations generated with AI'],
    agentOutputs: {
      recommendation_engine: recommendations,
    },
  };
};

/**
 * Revenue Tracker Node with LLM
 * Analyzes revenue using AI insights
 */
const revenueTrackerNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Revenue Tracker] Analyzing revenue for video:', state.videoId);

  const llmPrompt = `Analyze revenue potential for video:
Video ID: ${state.videoId}
Category: ${state.videoCategory}
Task: ${state.taskDescription}

Provide revenue insights:
- Estimated CPM
- Expected performance
- Monetization tips`;

  const llmResponse = await callLocalLLM(llmPrompt, {
    userId: state.userId,
    userRole: state.userRole,
    taskDescription: state.taskDescription,
  });
  const revenueData = JSON.parse(llmResponse);

  return {
    revenueData: {
      totalViews: 1000,
      estimatedRevenue: 1.50,
      cpm: 1.50,
      ...revenueData,
    },
    currentAgent: AgentType.ANALYTICS_AGENT,
    status: 'running',
    lastUpdated: new Date(),
    messages: ['Revenue data analyzed with AI'],
    agentOutputs: {
      revenue_tracker: revenueData,
    },
  };
};

/**
 * Analytics Agent Node with LLM
 * Generates analytics insights using AI
 */
const analyticsAgentNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Analytics Agent] Generating analytics insights');

  const llmPrompt = `Generate analytics insights for:
Task: ${state.taskDescription}
Video ID: ${state.videoId}

Provide:
- Performance trends
- Growth opportunities
- Actionable recommendations`;

  const llmResponse = await callLocalLLM(llmPrompt, {
    userId: state.userId,
    userRole: state.userRole,
    taskDescription: state.taskDescription,
  });
  const insights = JSON.parse(llmResponse);

  return {
    contentAnalysis: insights,
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Analytics insights generated with AI'],
    agentOutputs: {
      analytics_agent: insights,
    },
  };
};

/**
 * Support Agent Node with LLM
 * Provides user support using AI
 */
const supportAgentNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Support Agent] Handling support request from user:', state.userId);

  const llmPrompt = `Provide support for user request:
User ID: ${state.userId}
Request: ${state.taskDescription}

Provide helpful response with:
- Answer or solution
- Suggested actions
- Resources or links`;

  const llmResponse = await callLocalLLM(llmPrompt, {
    userId: state.userId,
    userRole: state.userRole,
    taskDescription: state.taskDescription,
  });
  const response = JSON.parse(llmResponse);

  return {
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: ['Support response generated with AI'],
    agentOutputs: {
      support_agent: response,
    },
  };
};

/**
 * Creator Coach Node with LLM
 * Provides AI-powered coaching for content creators
 */
const creatorCoachNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Creator Coach] Processing creator request from user:', state.userId);
  
  const userRequest = state.taskDescription || state.messages?.[0] || '';
  const metrics = state.contentAnalysis || {};
  const recentVideos = state.recommendations || [];

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

  const llmResponse = await callLocalLLM(llmPrompt, {
    userId: state.userId,
    userRole: state.userRole,
    taskDescription: state.taskDescription,
  });
  const response = JSON.parse(llmResponse);

  return {
    currentAgent: AgentType.ORCHESTRATOR,
    status: 'completed',
    lastUpdated: new Date(),
    messages: [`Creator coach response generated for: ${userRequest}`],
    agentOutputs: {
      creator_coach: response,
    },
  };
};

/**
 * Video Assistant Node with LLM
 * Provides AI-powered video assistance for title, description, hashtags, and metadata
 */
const videoAssistantNode: AgentNodeFunction = async (state: AgentStateType) => {
  console.log('[Video Assistant] Processing video request for video:', state.videoId);
  
  const userRequest = state.taskDescription || state.messages?.[0] || '';
  const videoId = state.videoId || '';
  const videoTitle = state.videoTitle || '';
  const videoCategory = state.videoCategory || '';

  const llmPrompt = `Act as an expert video content optimizer. Help the user with their video.
User Request: ${userRequest}
Video ID: ${videoId}
Current Title: ${videoTitle}
Category: ${videoCategory}

Provide response in JSON format with suggestions, title optimizations, description, and hashtags as requested.`;

  try {
    const llmResponse = await callLocalLLM(llmPrompt, {
      userId: state.userId,
      userRole: state.userRole,
      taskDescription: state.taskDescription,
      videoId,
      videoTitle,
      videoCategory,
    });
    const response = JSON.parse(llmResponse);
    return {
      currentAgent: AgentType.ORCHESTRATOR,
      status: 'completed',
      lastUpdated: new Date(),
      messages: [`Video assistant response generated for video: ${videoId}`],
      agentOutputs: { video_assistant: response },
    };
  } catch (error: any) {
    return {
      currentAgent: AgentType.ORCHESTRATOR,
      status: 'failed',
      lastUpdated: new Date(),
      errors: [error.message],
      agentOutputs: { video_assistant: { error: error.message } },
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
      if (state.status === 'completed') {
        return END;
      }
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
      return state.taskType === TaskType.VIDEO_UPLOAD
        ? AgentType.MODERATOR
        : END;

    case AgentType.MODERATOR:
      return state.taskType === TaskType.VIDEO_UPLOAD
        ? AgentType.COPYRIGHT_DETECTOR
        : END;

    case AgentType.COPYRIGHT_DETECTOR:
      return END;

    case AgentType.RECOMMENDATION_ENGINE:
      return END;

    case AgentType.REVENUE_TRACKER:
      return AgentType.ANALYTICS_AGENT;

    case AgentType.ANALYTICS_AGENT:
      return END;

    case AgentType.SUPPORT_AGENT:
      return END;

    case AgentType.VIDEO_ASSISTANT:
      return END;

    default:
      return END;
  }
};

/**
 * Create the main agent graph with LLM integration
 */
export function createMainAgentGraph() {
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
export const mainAgentGraph = createMainAgentGraph();

/**
 * Execute a workflow with the main agent
 */
export async function executeMainAgent(
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

  console.log('[Main Agent] Starting workflow:', workflowConfig.name);
  console.log('[Main Agent] Initial state:', inputState);

  try {
    const result = await mainAgentGraph.invoke(inputState);
    console.log('[Main Agent] Workflow completed:', result);
    return result;
  } catch (error) {
    console.error('[Main Agent] Workflow failed:', error);
    throw error;
  }
}

/**
 * Stream workflow execution for real-time updates
 */
export async function* streamMainAgent(
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

  console.log('[Main Agent] Starting streaming workflow:', workflowConfig.name);

  try {
    // Use streamEvents instead of stream for better compatibility
    const eventStream = await mainAgentGraph.streamEvents(inputState, {
      version: '1',
    });

    for await (const event of eventStream) {
      console.log('[Main Agent] Stream event:', event);
      yield event;
    }
  } catch (error) {
    console.error('[Main Agent] Streaming workflow failed:', error);
    throw error;
  }
}
