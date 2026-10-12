/**
 * Supervisor State Schema for System Monitoring
 * Defines the state for the AI system supervisor
 */

import { Annotation } from '@langchain/langgraph';

/**
 * Supervisor Alert Levels
 */
export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Supervisor Status
 */
export enum SupervisorStatus {
  IDLE = 'idle',
  MONITORING = 'monitoring',
  ANALYZING = 'analyzing',
  EXECUTING = 'executing',
  ALERTING = 'alerting',
  PAUSED = 'paused',
}

/**
 * System Event Types
 */
export enum SystemEventType {
  SYSTEM_HEALTH_CHECK = 'system_health_check',
  LOG_ERROR = 'log_error',
  HIGH_ERROR_RATE = 'high_error_rate',
  CONTENT_FLAGGED = 'content_flagged',
  USER_REPORTED = 'user_reported',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  STORAGE_ISSUE = 'storage_issue',
  DATABASE_ISSUE = 'database_issue',
  MANUAL_TRIGGER = 'manual_trigger',
}

/**
 * Supervisor State Schema
 */
export const SupervisorState = Annotation.Root({
  // Supervisor tracking
  status: Annotation<SupervisorStatus>({
    reducer: (prev, next) => next,
    default: () => SupervisorStatus.IDLE,
  }),

  currentAgent: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => 'supervisor',
  }),

  // System context
  systemHealth: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  performanceMetrics: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Event processing
  currentEvent: Annotation<Record<string, any>>({
    reducer: (prev, next) => next,
    default: () => ({}),
  }),

  eventHistory: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Decision making
  decision: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  decisionReasoning: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  confidence: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 0,
  }),

  // Action execution
  actionTaken: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  actionResult: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  actionHistory: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Alerting
  alertLevel: Annotation<AlertLevel>({
    reducer: (prev, next) => next,
    default: () => AlertLevel.INFO,
  }),

  alertMessage: Annotation<string>({
    reducer: (prev, next) => next,
    default: () => '',
  }),

  alertSent: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => false,
  }),

  alertHistory: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Safety thresholds
  errorRateThreshold: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 10, // errors per hour
  }),

  performanceThreshold: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 80, // minimum performance score
  }),

  storageThreshold: Annotation<number>({
    reducer: (prev, next) => next,
    default: () => 90, // maximum storage usage percentage
  }),

  // Configuration
  autoMode: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => true,
  }),

  requireApproval: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => false,
  }),

  // Logging
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // Timestamp
  lastUpdated: Annotation<Date>({
    reducer: (prev, next) => next,
    default: () => new Date(),
  }),

  lastHealthCheck: Annotation<Date>({
    reducer: (prev, next) => next,
    default: () => new Date(),
  }),
});

/**
 * Type exports
 */
export type SupervisorStateType = typeof SupervisorState.State;

/**
 * System Event Interface
 */
export interface SystemEvent {
  type: SystemEventType;
  severity: AlertLevel;
  data: Record<string, any>;
  timestamp: Date;
  source: string;
}

/**
 * Decision Interface
 */
export interface SupervisorDecision {
  action: string;
  tool: string;
  params: Record<string, any>;
  reasoning: string;
  confidence: number;
  requiresApproval: boolean;
}

/**
 * Alert Interface
 */
export interface SupervisorAlert {
  level: AlertLevel;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  sent: boolean;
  recipients: string[];
}
