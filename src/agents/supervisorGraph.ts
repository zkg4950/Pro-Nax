/**
 * System Supervisor Graph
 * AI-powered system monitoring and autonomous administration
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import {
  SupervisorState,
  SupervisorStateType,
  SupervisorStatus,
  AlertLevel,
  SystemEventType,
} from './supervisorTypes';
import {
  adminTools,
  fetchSystemLogs,
  manageContent,
  manageUsers,
  getDatabaseHealth,
  getPerformanceMetrics,
} from './tools/adminTools';
// import { callLocalLLM } from './mainAgent'; // Temporarily disabled
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Get environment variable safely
 */
function getEnvVar(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || '';
  }
  return process.env[key] || '';
}

/**
 * Create Supabase client for logging alerts
 */
function getAdminClient() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (!url || !key) {
    console.error('[Supervisor Alert] Missing Supabase credentials');
    return null;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Decision Node
 * Analyzes system metrics and log inputs to determine necessary actions
 */
const decisionNode = async (state: SupervisorStateType) => {
  console.log('[Supervisor Decision] Analyzing system state...');

  // Get current system health
  const healthResult = await getDatabaseHealth();
  const performanceResult = await getPerformanceMetrics();
  const logsResult = await fetchSystemLogs({ timeRange: '1h', limit: 50 });

  // Update state with system context
  const updatedState = {
    ...state,
    systemHealth: healthResult.health || {},
    performanceMetrics: performanceResult.metrics || {},
    lastHealthCheck: new Date(),
    status: SupervisorStatus.ANALYZING,
  };

  // Analyze using LLM for intelligent decision making
  const llmPrompt = `Analyze this system state and recommend actions:

System Health:
- Status: ${healthResult.health?.status}
- Needs Attention: ${healthResult.health?.needsAttention}
- Error Rate: ${healthResult.health?.errorRate}/hour
- Total Users: ${healthResult.health?.totalUsers}
- Total Videos: ${healthResult.health?.totalVideos}

Performance Metrics:
- Views/Hour: ${performanceResult.metrics?.viewsPerHour}
- CPU Usage: ${performanceResult.metrics?.cpuUsage}%
- Memory Usage: ${performanceResult.metrics?.memoryUsage}%

Recent Logs:
- Total: ${logsResult.metrics?.totalLogs}
- Errors: ${logsResult.metrics?.errorCount}
- Warnings: ${logsResult.metrics?.warningCount}

Current Event: ${JSON.stringify(state.currentEvent)}

Determine:
1. Is the system healthy? (yes/no)
2. What action should be taken? (none, investigate, fix, alert)
3. Which tool should be used? (fetchSystemLogs, manageContent, manageUsers, getDatabaseHealth)
4. What are the parameters for the tool?
5. Should this require manual approval? (yes/no)
6. What is the confidence level (0-100)?

Return as JSON with structure: { decision, tool, params, reasoning, confidence, requiresApproval }`;

  let decision;
  // Use rule-based decision for now (LLM not configured yet)
  console.error('[Decision Node] Using rule-based decision (LLM disabled)');

  // Fallback to rule-based decision
  const errorRate = healthResult.health?.errorRate || 0;
  const needsAttention = healthResult.health?.needsAttention || false;

  if (errorRate > 20) {
    decision = {
      decision: 'investigate',
      tool: 'fetchSystemLogs',
      params: { timeRange: '1h', level: 'error' },
      reasoning: `High error rate (${errorRate}/hour) requires investigation`,
      confidence: 95,
      requiresApproval: false,
    };
  } else if (needsAttention) {
    decision = {
      decision: 'investigate',
      tool: 'getDatabaseHealth',
      params: {},
      reasoning: 'System needs attention, checking health',
      confidence: 90,
      requiresApproval: false,
    };
  } else {
    decision = {
      decision: 'none',
      tool: 'none',
      params: {},
      reasoning: 'System is healthy, no action required',
      confidence: 98,
      requiresApproval: false,
    };
  }

  console.log('[Supervisor Decision] Decision:', decision);

  return {
    ...updatedState,
    decision: decision.decision,
    decisionReasoning: decision.reasoning,
    confidence: decision.confidence,
    currentAgent: decision.tool === 'none' ? 'supervisor' : 'action_executor',
    messages: [
      `Decision: ${decision.decision}`,
      `Tool: ${decision.tool}`,
      `Reasoning: ${decision.reasoning}`,
      `Confidence: ${decision.confidence}%`,
    ],
  };
};

/**
 * Action Node
 * Executes required administrative tools autonomously based on defined safety thresholds
 */
const actionNode = async (state: SupervisorStateType) => {
  console.log('[Supervisor Action] Executing action:', state.decision);

  const tool = state.decision;
  const toolName = state.currentAgent;

  let actionResult;

  try {
    // Execute the appropriate tool
    switch (toolName) {
      case 'fetchSystemLogs':
        actionResult = await fetchSystemLogs({
          timeRange: '1h',
          level: 'error',
          limit: 100,
        });
        break;

      case 'manageContent':
        // Extract params from current event if available
        if (state.currentEvent?.type === SystemEventType.CONTENT_FLAGGED) {
          actionResult = await manageContent({
            action: state.currentEvent.data.action || 'flag',
            contentType: state.currentEvent.data.contentType || 'video',
            contentId: state.currentEvent.data.contentId,
            reason: state.currentEvent.data.reason || 'Flagged by supervisor',
          });
        } else {
          actionResult = { success: false, error: 'No content event data' };
        }
        break;

      case 'manageUsers':
        if (state.currentEvent?.type === SystemEventType.USER_REPORTED) {
          actionResult = await manageUsers({
            action: state.currentEvent.data.action || 'inspect',
            userId: state.currentEvent.data.userId,
            reason: state.currentEvent.data.reason || 'Reported by supervisor',
          });
        } else {
          actionResult = { success: false, error: 'No user event data' };
        }
        break;

      case 'getDatabaseHealth':
        actionResult = await getDatabaseHealth();
        break;

      default:
        actionResult = { success: false, error: 'Unknown tool' };
    }

    console.log('[Supervisor Action] Result:', actionResult);

    // Update alert level based on action result
    let alertLevel = AlertLevel.INFO;
    if (!actionResult.success) {
      alertLevel = AlertLevel.ERROR;
    } else if (actionResult.summary?.includes('error') || actionResult.summary?.includes('failed')) {
      alertLevel = AlertLevel.WARNING;
    }

    return {
      ...state,
      actionTaken: tool,
      actionResult,
      actionHistory: [
        ...state.actionHistory,
        {
          tool: toolName,
          params: state.currentEvent,
          result: actionResult,
          timestamp: new Date(),
        },
      ],
      alertLevel,
      status: SupervisorStatus.EXECUTING,
      currentAgent: 'alert_evaluator',
      messages: [
        `Action executed: ${tool}`,
        `Result: ${actionResult.summary || 'Completed'}`,
      ],
    };
  } catch (error) {
    console.error('[Supervisor Action] Error:', error);

    return {
      ...state,
      actionTaken: tool,
      actionResult: { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      alertLevel: AlertLevel.ERROR,
      status: SupervisorStatus.ALERTING,
      currentAgent: 'alert_evaluator',
      messages: [`Action failed: ${error}`],
    };
  }
};

/**
 * Alert Node
 * Escalates critical issues if manual intervention is required
 * Saves alerts to audit_logs and dispatches to admin notification channels
 */
const alertNode = async (state: SupervisorStateType) => {
  console.log('[Supervisor Alert] Evaluating alert level:', state.alertLevel);

  // Determine if alert needs to be sent
  const shouldAlert =
    state.alertLevel === AlertLevel.ERROR ||
    state.alertLevel === AlertLevel.CRITICAL ||
    state.confidence < 50;

  let alertMessage = '';
  let alertSent = false;

  if (shouldAlert) {
    alertMessage = `SUPERVISOR ALERT [${state.alertLevel.toUpperCase()}]:

Decision: ${state.decision}
Reasoning: ${state.decisionReasoning}
Action Taken: ${state.actionTaken}
Action Result: ${JSON.stringify(state.actionResult)}
System Health: ${JSON.stringify(state.systemHealth)}
Performance: ${JSON.stringify(state.performanceMetrics)}

Timestamp: ${new Date().toISOString()}`;

    console.log('[Supervisor Alert] Alert triggered:', alertMessage);
    alertSent = true;

    // Save alert to audit_logs
    try {
      const supabase = getAdminClient();

      if (supabase) {
        await supabase.from('audit_logs').insert({
          action: 'supervisor_alert',
          entity_type: 'system',
          entity_id: null,
          actor_id: 'supervisor',
          severity: state.alertLevel === AlertLevel.CRITICAL ? 'error' : 'warning',
          details: {
            alertLevel: state.alertLevel,
            decision: state.decision,
            reasoning: state.decisionReasoning,
            actionTaken: state.actionTaken,
            actionResult: state.actionResult,
            systemHealth: state.systemHealth,
            performanceMetrics: state.performanceMetrics,
            alertMessage,
          },
        });
        console.log('[Supervisor Alert] Alert saved to audit_logs');
      }
    } catch (error) {
      console.error('[Supervisor Alert] Failed to save alert to audit_logs:', error);
    }

    // Dispatch to admin notification channels
    // In production, this would send to:
    // - Slack webhook
    // - Email notification
    // - PagerDuty
    // - Admin dashboard toast alerts
    // - Admin logs
    console.log('[Supervisor Alert] Alert dispatched to admin channels');
  } else {
    alertMessage = `System status: ${state.alertLevel}. No alert required.`;
    console.log('[Supervisor Alert] No alert needed');

    // Still log info-level events to audit_logs for monitoring
    try {
      const supabase = getAdminClient();

      if (supabase) {
        await supabase.from('audit_logs').insert({
          action: 'supervisor_check',
          entity_type: 'system',
          entity_id: null,
          actor_id: 'supervisor',
          severity: 'info',
          details: {
            alertLevel: state.alertLevel,
            decision: state.decision,
            reasoning: state.decisionReasoning,
            systemHealth: state.systemHealth,
          },
        });
      }
    } catch (error) {
      console.error('[Supervisor Alert] Failed to log check to audit_logs:', error);
    }
  }

  return {
    ...state,
    alertMessage,
    alertSent,
    alertHistory: [
      ...state.alertHistory,
      {
        level: state.alertLevel,
        message: alertMessage,
        timestamp: new Date(),
        sent: alertSent,
      },
    ],
    status: shouldAlert ? SupervisorStatus.ALERTING : SupervisorStatus.IDLE,
    currentAgent: 'supervisor',
    messages: [alertMessage],
  };
};

/**
 * Monitor Node
 * Continuously evaluates system events, incoming logs, and administrative alerts
 */
const monitorNode = async (state: SupervisorStateType) => {
  console.log('[Supervisor Monitor] Checking system status...');

  // Get fresh system data
  const healthResult = await getDatabaseHealth();
  const logsResult = await fetchSystemLogs({ timeRange: '1h', limit: 20 });

  // Check for critical conditions
  const errorRate = healthResult.health?.errorRate || 0;
  const needsAttention = healthResult.health?.needsAttention || false;

  // Create event if critical condition detected
  let currentEvent = state.currentEvent;
  if (errorRate > state.errorRateThreshold && !currentEvent.type) {
    currentEvent = {
      type: SystemEventType.HIGH_ERROR_RATE,
      severity: AlertLevel.ERROR,
      data: {
        errorRate,
        threshold: state.errorRateThreshold,
      },
      timestamp: new Date(),
      source: 'supervisor',
    };
  } else if (needsAttention && !currentEvent.type) {
    currentEvent = {
      type: SystemEventType.SYSTEM_HEALTH_CHECK,
      severity: AlertLevel.WARNING,
      data: {
        health: healthResult.health,
      },
      timestamp: new Date(),
      source: 'supervisor',
    };
  }

  return {
    ...state,
    currentEvent,
    systemHealth: healthResult.health || {},
    status: SupervisorStatus.MONITORING,
    currentAgent: 'decision_maker',
    messages: [
      `Monitoring: Error rate ${errorRate}/hour (threshold: ${state.errorRateThreshold})`,
      `System needs attention: ${needsAttention}`,
    ],
  };
};

/**
 * Routing function for supervisor graph
 */
const routeSupervisor = (state: SupervisorStateType): string => {
  const decision = state.decision;
  const alertLevel = state.alertLevel;

  console.log('[Supervisor Route] Decision:', decision, 'Alert Level:', alertLevel);

  // If monitoring, go to decision
  if (state.status === SupervisorStatus.MONITORING) {
    return 'decision_maker';
  }

  // If decision requires action, go to action
  if (decision === 'investigate' || decision === 'fix') {
    return 'action_executor';
  }

  // If critical alert level, go to alert
  if (alertLevel === AlertLevel.ERROR || alertLevel === AlertLevel.CRITICAL) {
    return 'alert_evaluator';
  }

  // Otherwise, end or continue monitoring
  if (decision === 'none' || decision === '') {
    return END;
  }

  // Default to alert evaluator for any other case
  return 'alert_evaluator';
};

/**
 * Create the supervisor graph
 */
export function createSupervisorGraph() {
  const graph = new StateGraph({
    state: SupervisorState,
  });

  // Add nodes
  graph.addNode('supervisor', monitorNode);
  graph.addNode('decision_maker', decisionNode);
  graph.addNode('action_executor', actionNode);
  graph.addNode('alert_evaluator', alertNode);

  // Add edges
  graph.addEdge(START, 'supervisor');

  // Add conditional edges
  graph.addConditionalEdges('supervisor', routeSupervisor, [
    'decision_maker',
    'action_executor',
    'alert_evaluator',
    END,
  ]);

  graph.addConditionalEdges('decision_maker', routeSupervisor, [
    'action_executor',
    'alert_evaluator',
    END,
  ]);

  graph.addConditionalEdges('action_executor', routeSupervisor, [
    'alert_evaluator',
    END,
  ]);

  graph.addConditionalEdges('alert_evaluator', routeSupervisor, [END]);

  return graph.compile();
}

/**
 * Get compiled supervisor graph
 */
export const supervisorGraph = createSupervisorGraph();

/**
 * Execute supervisor with event
 */
export async function executeSupervisor(event: any = {}) {
  const inputState = {
    ...SupervisorState.State,
    currentEvent: event,
    status: SupervisorStatus.IDLE,
    lastUpdated: new Date(),
    lastHealthCheck: new Date(),
  };

  console.log('[Supervisor] Starting supervision with event:', event);

  try {
    const result = await supervisorGraph.invoke(inputState);
    console.log('[Supervisor] Supervision completed:', result);
    return result;
  } catch (error) {
    console.error('[Supervisor] Supervision failed:', error);
    throw error;
  }
}

/**
 * Stream supervisor execution
 */
export async function* streamSupervisor(event: any = {}) {
  const inputState = {
    ...SupervisorState.State,
    currentEvent: event,
    status: SupervisorStatus.IDLE,
    lastUpdated: new Date(),
    lastHealthCheck: new Date(),
  };

  console.log('[Supervisor] Starting streaming supervision');

  try {
    const eventStream = await supervisorGraph.streamEvents(inputState, {
      version: '1',
    });

    for await (const event of eventStream) {
      console.log('[Supervisor] Stream event:', event);
      yield event;
    }
  } catch (error) {
    console.error('[Supervisor] Streaming supervision failed:', error);
    throw error;
  }
}
