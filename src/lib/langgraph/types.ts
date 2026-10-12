/**
 * LangGraph Integration for ProNax
 * State Schema and Agent Types for Multi-Agent Workflows
 */

import { Annotation } from '@langchain/langgraph';

/**
 * Core Agent State Schema
 * Defines the shared state that flows between agents in the graph
 */
export const AgentState = Annotation.Root({
  // Agent tracking
  currentAgent: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'orchestrator',
  }),

  // Conversation context
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Task information
  taskId: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  taskType: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'general',
  }),

  taskDescription: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  // Video/Content specific fields
  videoId: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  videoTitle: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  videoCategory: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  // User context
  userId: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  userRole: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'user',
  }),

  // Moderation flags
  moderationRequired: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => false,
  }),

  moderationStatus: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'pending',
  }),

  moderationReason: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  // Content analysis results
  contentAnalysis: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Copyright detection
  copyrightCheckRequired: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => false,
  }),

  copyrightStatus: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'not_checked',
  }),

  copyrightMatches: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Revenue/Monetization
  monetizationEnabled: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => true,
  }),

  revenueData: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Recommendations
  recommendations: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Agent-specific outputs
  agentOutputs: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Error handling
  errors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Workflow status
  status: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'idle',
  }),

  // Timestamp
  lastUpdated: Annotation<Date>({
    reducer: (prev, next) => next,
    default: () => new Date(),
  }),
});

/**
 * Agent Types
 */
export type AgentStateType = typeof AgentState.State;

export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  CONTENT_ANALYZER = 'content_analyzer',
  MODERATOR = 'moderator',
  COPYRIGHT_DETECTOR = 'copyright_detector',
  RECOMMENDATION_ENGINE = 'recommendation_engine',
  REVENUE_TRACKER = 'revenue_tracker',
  SUPPORT_AGENT = 'support_agent',
  ANALYTICS_AGENT = 'analytics_agent',
  CREATOR_COACH = 'creator_coach',
  VIDEO_ASSISTANT = 'video_assistant',
}

export enum TaskType {
  VIDEO_UPLOAD = 'video_upload',
  CONTENT_MODERATION = 'content_moderation',
  COPYRIGHT_CHECK = 'copyright_check',
  RECOMMENDATION = 'recommendation',
  REVENUE_ANALYSIS = 'revenue_analysis',
  USER_SUPPORT = 'user_support',
  CONTENT_DISCOVERY = 'content_discovery',
  CREATOR_COACH = 'creator_coach',
  VIDEO_ASSISTANT = 'video_assistant',
  GENERAL = 'general',
}

export enum WorkflowStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

/**
 * Agent Node Function Signature
 */
export type AgentNodeFunction = (
  state: AgentStateType
) => Promise<Partial<AgentStateType>>;

/**
 * Edge Condition Function Signature
 */
export type EdgeConditionFunction = (
  state: AgentStateType
) => string | Promise<string>;

/**
 * Agent Configuration
 */
export interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  timeout?: number;
}

/**
 * Workflow Configuration
 */
export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  taskType: TaskType;
  agents: AgentType[];
  defaultAgent: AgentType;
  checkpointEnabled: boolean;
}

/**
 * Predefined Agent Configurations
 */
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  [AgentType.ORCHESTRATOR]: {
    id: AgentType.ORCHESTRATOR,
    name: 'Orchestrator',
    description: 'Coordinates and routes tasks between specialized agents',
    enabled: true,
    priority: 1,
  },
  [AgentType.CONTENT_ANALYZER]: {
    id: AgentType.CONTENT_ANALYZER,
    name: 'Content Analyzer',
    description: 'Analyzes video content for metadata, tags, and categorization',
    enabled: true,
    priority: 2,
  },
  [AgentType.MODERATOR]: {
    id: AgentType.MODERATOR,
    name: 'Moderator',
    description: 'Reviews content for policy violations and community guidelines',
    enabled: true,
    priority: 3,
  },
  [AgentType.COPYRIGHT_DETECTOR]: {
    id: AgentType.COPYRIGHT_DETECTOR,
    name: 'Copyright Detector',
    description: 'Detects potential copyright violations using fingerprinting',
    enabled: true,
    priority: 4,
  },
  [AgentType.RECOMMENDATION_ENGINE]: {
    id: AgentType.RECOMMENDATION_ENGINE,
    name: 'Recommendation Engine',
    description: 'Generates personalized content recommendations',
    enabled: true,
    priority: 5,
  },
  [AgentType.REVENUE_TRACKER]: {
    id: AgentType.REVENUE_TRACKER,
    name: 'Revenue Tracker',
    description: 'Tracks and analyzes creator revenue and monetization',
    enabled: true,
    priority: 6,
  },
  [AgentType.SUPPORT_AGENT]: {
    id: AgentType.SUPPORT_AGENT,
    name: 'Support Agent',
    description: 'Provides user support and answers common questions',
    enabled: true,
    priority: 7,
  },
  [AgentType.ANALYTICS_AGENT]: {
    id: AgentType.ANALYTICS_AGENT,
    name: 'Analytics Agent',
    description: 'Analyzes platform metrics and generates insights',
    enabled: true,
    priority: 8,
  },
  [AgentType.CREATOR_COACH]: {
    id: AgentType.CREATOR_COACH,
    name: 'Creator Coach',
    description: 'Provides AI-powered coaching for content creators including viral ideas, title optimization, script writing, and growth strategies',
    enabled: true,
    priority: 9,
  },
  [AgentType.VIDEO_ASSISTANT]: {
    id: AgentType.VIDEO_ASSISTANT,
    name: 'Video Assistant',
    description: 'AI-powered video assistant for title, description, hashtags, and metadata editing',
    enabled: true,
    priority: 10,
  },
};

/**
 * Predefined Workflow Configurations
 */
export const WORKFLOW_CONFIGS: Record<TaskType, WorkflowConfig> = {
  [TaskType.VIDEO_UPLOAD]: {
    id: 'video_upload_workflow',
    name: 'Video Upload Workflow',
    description: 'Processes uploaded videos through analysis, moderation, and copyright checks',
    taskType: TaskType.VIDEO_UPLOAD,
    agents: [
      AgentType.CONTENT_ANALYZER,
      AgentType.MODERATOR,
      AgentType.COPYRIGHT_DETECTOR,
    ],
    defaultAgent: AgentType.ORCHESTRATOR,
    checkpointEnabled: true,
  },
  [TaskType.CONTENT_MODERATION]: {
    id: 'content_moderation_workflow',
    name: 'Content Moderation Workflow',
    description: 'Reviews content for policy violations',
    taskType: TaskType.CONTENT_MODERATION,
    agents: [AgentType.MODERATOR],
    defaultAgent: AgentType.MODERATOR,
    checkpointEnabled: true,
  },
  [TaskType.COPYRIGHT_CHECK]: {
    id: 'copyright_check_workflow',
    name: 'Copyright Check Workflow',
    description: 'Detects potential copyright violations',
    taskType: TaskType.COPYRIGHT_CHECK,
    agents: [AgentType.COPYRIGHT_DETECTOR],
    defaultAgent: AgentType.COPYRIGHT_DETECTOR,
    checkpointEnabled: true,
  },
  [TaskType.RECOMMENDATION]: {
    id: 'recommendation_workflow',
    name: 'Recommendation Workflow',
    description: 'Generates personalized content recommendations',
    taskType: TaskType.RECOMMENDATION,
    agents: [AgentType.RECOMMENDATION_ENGINE],
    defaultAgent: AgentType.RECOMMENDATION_ENGINE,
    checkpointEnabled: false,
  },
  [TaskType.REVENUE_ANALYSIS]: {
    id: 'revenue_analysis_workflow',
    name: 'Revenue Analysis Workflow',
    description: 'Analyzes creator revenue and monetization data',
    taskType: TaskType.REVENUE_ANALYSIS,
    agents: [AgentType.REVENUE_TRACKER, AgentType.ANALYTICS_AGENT],
    defaultAgent: AgentType.REVENUE_TRACKER,
    checkpointEnabled: true,
  },
  [TaskType.USER_SUPPORT]: {
    id: 'user_support_workflow',
    name: 'User Support Workflow',
    description: 'Provides user support and assistance',
    taskType: TaskType.USER_SUPPORT,
    agents: [AgentType.SUPPORT_AGENT],
    defaultAgent: AgentType.SUPPORT_AGENT,
    checkpointEnabled: false,
  },
  [TaskType.CONTENT_DISCOVERY]: {
    id: 'content_discovery_workflow',
    name: 'Content Discovery Workflow',
    description: 'Helps users discover relevant content',
    taskType: TaskType.CONTENT_DISCOVERY,
    agents: [AgentType.RECOMMENDATION_ENGINE, AgentType.CONTENT_ANALYZER],
    defaultAgent: AgentType.RECOMMENDATION_ENGINE,
    checkpointEnabled: false,
  },
  [TaskType.GENERAL]: {
    id: 'general_workflow',
    name: 'General Workflow',
    description: 'General purpose task handling',
    taskType: TaskType.GENERAL,
    agents: [AgentType.ORCHESTRATOR],
    defaultAgent: AgentType.ORCHESTRATOR,
    checkpointEnabled: false,
  },
  [TaskType.CREATOR_COACH]: {
    id: 'creator_coach_workflow',
    name: 'Creator Coach Workflow',
    description: 'Provides AI-powered coaching for content creators',
    taskType: TaskType.CREATOR_COACH,
    agents: [AgentType.CREATOR_COACH],
    defaultAgent: AgentType.CREATOR_COACH,
    checkpointEnabled: false,
  },
  [TaskType.VIDEO_ASSISTANT]: {
    id: 'video_assistant_workflow',
    name: 'Video Assistant Workflow',
    description: 'AI-powered video assistant for title, description, hashtags, and metadata editing',
    taskType: TaskType.VIDEO_ASSISTANT,
    agents: [AgentType.CREATOR_COACH],
    defaultAgent: AgentType.CREATOR_COACH,
    checkpointEnabled: false,
  },
};
