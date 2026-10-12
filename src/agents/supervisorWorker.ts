/**
 * Supervisor Background Worker
 * Runs the system supervisor in the background with configurable intervals
 */

import { executeSupervisor, streamSupervisor } from './supervisorGraph';
import { SystemEventType, AlertLevel } from './supervisorTypes';
import { adminTools } from './tools/adminTools';

/**
 * Supervisor Worker Configuration
 */
interface SupervisorWorkerConfig {
  intervalMs: number; // Check interval in milliseconds
  autoMode: boolean; // Whether to auto-execute actions
  enableAlerts: boolean; // Whether to send alerts
  maxHistorySize: number; // Maximum number of events to keep in history
}

/**
 * Default configuration
 */
const defaultConfig: SupervisorWorkerConfig = {
  intervalMs: 60000, // 1 minute
  autoMode: true,
  enableAlerts: true,
  maxHistorySize: 1000,
};

/**
 * Supervisor Worker Class
 */
export class SupervisorWorker {
  private config: SupervisorWorkerConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private eventHistory: any[] = [];
  private alertCallback?: (alert: any) => void;

  constructor(config: Partial<SupervisorWorkerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Start the supervisor worker
   */
  start() {
    if (this.isRunning) {
      console.log('[Supervisor Worker] Already running');
      return;
    }

    console.log('[Supervisor Worker] Starting with interval:', this.config.intervalMs, 'ms');
    this.isRunning = true;

    // Run immediately
    this.runSupervision();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.runSupervision();
    }, this.config.intervalMs);
  }

  /**
   * Stop the supervisor worker
   */
  stop() {
    if (!this.isRunning) {
      console.log('[Supervisor Worker] Not running');
      return;
    }

    console.log('[Supervisor Worker] Stopping');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Run a single supervision cycle
   */
  private async runSupervision() {
    console.log('[Supervisor Worker] Running supervision cycle...');

    try {
      // Get current system state
      const healthResult = await adminTools.getDatabaseHealth();
      const logsResult = await adminTools.fetchSystemLogs({
        timeRange: '1h',
        limit: 50,
      });

      // Create event based on system state
      const event = this.createEventFromSystemState(healthResult, logsResult);

      // Execute supervisor
      const result = await executeSupervisor(event);

      // Add to history
      this.addToHistory({
        event,
        result,
        timestamp: new Date(),
      });

      // Handle alerts
      if (this.config.enableAlerts && result.alertSent && this.alertCallback) {
        this.alertCallback({
          level: result.alertLevel,
          message: result.alertMessage,
          data: result,
        });
      }

      console.log('[Supervisor Worker] Cycle completed:', result.status);
    } catch (error) {
      console.error('[Supervisor Worker] Cycle failed:', error);
    }
  }

  /**
   * Create event from system state
   */
  private createEventFromSystemState(healthResult: any, logsResult: any): any {
    const errorRate = healthResult.health?.errorRate || 0;
    const needsAttention = healthResult.health?.needsAttention || false;

    if (errorRate > 20) {
      return {
        type: SystemEventType.HIGH_ERROR_RATE,
        severity: AlertLevel.ERROR,
        data: {
          errorRate,
          threshold: 20,
          logs: logsResult.logs?.slice(0, 10),
        },
        timestamp: new Date(),
        source: 'supervisor_worker',
      };
    }

    if (needsAttention) {
      return {
        type: SystemEventType.SYSTEM_HEALTH_CHECK,
        severity: AlertLevel.WARNING,
        data: {
          health: healthResult.health,
          logs: logsResult.logs?.slice(0, 10),
        },
        timestamp: new Date(),
        source: 'supervisor_worker',
      };
    }

    return {
      type: SystemEventType.SYSTEM_HEALTH_CHECK,
      severity: AlertLevel.INFO,
      data: {
        health: healthResult.health,
      },
      timestamp: new Date(),
      source: 'supervisor_worker',
    };
  }

  /**
   * Add event to history
   */
  private addToHistory(entry: any) {
    this.eventHistory.push(entry);

    // Trim history if exceeds max size
    if (this.eventHistory.length > this.config.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Get event history
   */
  getHistory(limit?: number) {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return this.eventHistory;
  }

  /**
   * Set alert callback
   */
  onAlert(callback: (alert: any) => void) {
    this.alertCallback = callback;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      historySize: this.eventHistory.length,
      lastRun: this.eventHistory[this.eventHistory.length - 1]?.timestamp || null,
    };
  }

  /**
   * Trigger manual supervision
   */
  async triggerManual(event: any) {
    console.log('[Supervisor Worker] Manual trigger with event:', event);
    return await executeSupervisor(event);
  }
}

/**
 * Create and start a supervisor worker with default config
 */
export function startSupervisorWorker(config?: Partial<SupervisorWorkerConfig>) {
  const worker = new SupervisorWorker(config);
  worker.start();
  return worker;
}

/**
 * Supervisor API for external triggering
 */
export const supervisorAPI = {
  /**
   * Trigger supervisor with custom event
   */
  async trigger(event: any) {
    return await executeSupervisor(event);
  },

  /**
   * Trigger content moderation
   */
  async triggerContentModeration(params: {
    action: 'flag' | 'approve' | 'remove';
    contentType: 'video' | 'comment';
    contentId: string;
    reason?: string;
  }) {
    const event = {
      type: SystemEventType.CONTENT_FLAGGED,
      severity: AlertLevel.WARNING,
      data: params,
      timestamp: new Date(),
      source: 'api',
    };
    return await executeSupervisor(event);
  },

  /**
   * Trigger user management
   */
  async triggerUserManagement(params: {
    action: 'ban' | 'unban' | 'inspect';
    userId: string;
    reason?: string;
  }) {
    const event = {
      type: SystemEventType.USER_REPORTED,
      severity: AlertLevel.WARNING,
      data: params,
      timestamp: new Date(),
      source: 'api',
    };
    return await executeSupervisor(event);
  },

  /**
   * Get system health (direct tool call)
   */
  async getSystemHealth() {
    return await adminTools.getDatabaseHealth();
  },

  /**
   * Get system logs (direct tool call)
   */
  async getSystemLogs(params?: { timeRange?: string; limit?: number }) {
    return await adminTools.fetchSystemLogs(params);
  },
};
