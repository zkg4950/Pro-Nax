# LangGraph AI Supervisor - Global Wiring Summary

## Overview

The LangGraph AI Supervisor has been fully wired up to actively monitor and alert across ALL key areas of the application. The supervisor now runs globally in the background, listening to realtime database events and performing autonomous health checks.

## Completed Tasks

### 1. ✅ Global Realtime Listening & Triggers

**File**: `src/agents/supervisorRealtime.ts`

- Added subscription to `video_comments` table for comment moderation
  - Triggers on INSERT for new comments
  - Triggers on UPDATE when report_count > 3
- Added subscription to `analytics_events` table for system metrics
  - Triggers on INSERT when event_type = 'error'
  - Triggers on INSERT when event_type = 'critical'
- Existing subscriptions maintained:
  - `audit_logs` table for error severity events
  - `videos` table for content events and high report counts
  - `profiles` table for user ban events
- All realtime events trigger supervisor health/check evaluation via queue

### 2. ✅ Application Startup & Global Background Worker

**File**: `api-server.ts`

- Supervisor worker auto-starts on API server startup
  - Interval: 60 seconds (1 minute)
  - Auto-mode: enabled
  - Alerts: enabled
  - Max history: 1000 events
- Realtime listener auto-starts on API server startup
  - Subscribes to all 5 key tables
  - Queues supervisor-check jobs on events
- Queue worker auto-starts for supervisor-check jobs
  - Concurrency: 3
  - Processes realtime-triggered supervisor checks
- Graceful shutdown handling for all supervisor systems
  - SIGINT and SIGTERM handlers
  - Proper cleanup of workers and subscriptions

### 3. ✅ Complete Database Privilege Functions Setup

**File**: `supervisor_privileged_functions.sql` → `supabase/migrations/20261006010000_supervisor_privileged_functions.sql`

- All SQL RPC functions implemented:
  - `supervisor_get_system_health()` - Comprehensive health check
  - `supervisor_log_action()` - Audit trail logging
  - `supervisor_moderate_content()` - Content moderation
  - `supervisor_manage_user()` - User management
  - `supervisor_get_error_logs()` - Error log fetching
  - `supervisor_trigger_manual_check()` - Manual trigger
- Safe fallback handling in admin tools:
  - Tries RPC function first
  - Falls back to direct queries if RPC fails
  - Handles all database errors gracefully
  - Supervisor continues operating even with partial failures

### 4. ✅ Alert Notifications System

**File**: `src/agents/supervisorGraph.ts`

- Critical alerts automatically saved to `audit_logs` table
  - Alert level: CRITICAL → severity: 'error'
  - Alert level: WARNING → severity: 'warning'
  - Includes full alert context (decision, reasoning, action, system health)
- Info-level checks logged to `audit_logs` for monitoring history
  - Severity: 'info'
  - Includes decision, reasoning, and system health
- Safe fallback for database write failures
  - Logs error to console if audit_logs write fails
  - Does not crash supervisor on database errors
- Admin notification channel dispatch ready
  - Alert message formatted for Slack, Email, PagerDuty
  - Currently logs to console
  - Ready for webhook integration

### 5. ✅ Queue Handler for Realtime Events

**Files**: `src/lib/queue/handlers.ts`, `src/lib/queue/types.ts`

- `handleSupervisorCheck` handler implemented
  - Executes supervisor with event data from queue
  - Returns result with timestamp
  - Handles errors with retry
- `SupervisorCheckJobData` added to `JobDataUnion`
- Handler registered in `jobHandlers` registry
- Realtime events queue supervisor-check jobs automatically

### 6. ✅ Database Migrations

**Files**: 
- `supabase/migrations/20261006000000_enable_supervisor_realtime.sql`
- `supabase/migrations/20261006010000_supervisor_privileged_functions.sql`

- Realtime enabled for all supervisor tables:
  - `audit_logs`
  - `videos`
  - `profiles`
  - `video_comments`
  - `analytics_events`
- Supervisor privileged functions added to migrations
- Supabase config updated to enable realtime

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Server (api-server.ts)                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Supervisor Systems (Auto-start on server boot)      │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  • Supervisor Worker (60s interval)                  │   │
│  │  • Realtime Listener (5 table subscriptions)         │   │
│  │  • Queue Worker (supervisor-check jobs)              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Supabase Realtime (5 tables)                 │
├─────────────────────────────────────────────────────────────┤
│  • audit_logs (severity=error)                              │
│  • videos (INSERT, report_count>5)                         │
│  • profiles (is_banned=true)                                │
│  • video_comments (INSERT, report_count>3)                 │
│  • analytics_events (event_type=error/critical)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  BullMQ Queue (supervisor-check)             │
├─────────────────────────────────────────────────────────────┤
│  Queue jobs → Queue Worker → Supervisor Graph → Actions     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Supervisor Graph (LangGraph)                     │
├─────────────────────────────────────────────────────────────┤
│  Monitor → Decision → Action → Alert → Audit Logs            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│           SECURITY DEFINER Functions (adminTools)            │
├─────────────────────────────────────────────────────────────┤
│  • supervisor_get_system_health                              │
│  • supervisor_moderate_content                               │
│  • supervisor_manage_user                                    │
│  • supervisor_get_error_logs                                 │
│  • supervisor_log_action                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Supabase Database (Service Role)              │
├─────────────────────────────────────────────────────────────┤
│  • audit_logs (alert logging)                                │
│  • videos (content moderation)                               │
│  • profiles (user management)                                │
│  • video_comments (comment moderation)                       │
│  • analytics_events (system metrics)                         │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps for User

### 1. Apply Database Migrations

Run the migrations to enable realtime and deploy privileged functions:

```bash
# If using Supabase CLI
supabase db push

# Or manually run in Supabase Dashboard > SQL Editor:
# 1. Run supabase/migrations/20261006000000_enable_supervisor_realtime.sql
# 2. Run supabase/migrations/20261006010000_supervisor_privileged_functions.sql
```

### 2. Verify Environment Variables

Ensure `.env` has the required credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3. Start the Application

The supervisor systems will auto-start with the API server:

```bash
# Start API server (includes supervisor systems)
npm run dev:api

# Or start both frontend and API
npm run dev:all
```

### 4. Verify Supervisor is Active

Check the console logs for:

```
[API Server] Starting supervisor systems...
[API Server] Supervisor worker started
[API Server] Supervisor realtime listener started
[API Server] Queue worker for supervisor-check started
[Supervisor Realtime] Starting event listener...
[Supervisor Realtime] Audit logs subscription status: SUBSCRIBED
[Supervisor Realtime] Videos subscription status: SUBSCRIBED
[Supervisor Realtime] Profiles subscription status: SUBSCRIBED
[Supervisor Realtime] Comments subscription status: SUBSCRIBED
[Supervisor Realtime] Analytics subscription status: SUBSCRIBED
[Supervisor Realtime] Event listener started
```

### 5. Test API Endpoints

```bash
# Health check
curl "http://localhost:3001/api/supervisor?action=health"

# Status check
curl "http://localhost:3001/api/supervisor?action=status"

# Manual trigger
curl -X POST "http://localhost:3001/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{"action": "manual", "eventType": "system_health_check", "severity": "info"}'
```

### 6. Monitor Audit Logs

Check the `audit_logs` table in Supabase to verify:

- Supervisor alerts are being logged
- Supervisor checks are being recorded
- Severity levels are correct (error, warning, info)

### 7. Optional: Configure External Alert Channels

Add webhook integration for Slack, Email, or PagerDuty in the alert node:

**File**: `src/agents/supervisorGraph.ts` (alertNode function)

```typescript
// Add after alert is triggered
if (shouldAlert) {
  // Send to Slack
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({ text: alertMessage }),
  });

  // Send to Email
  // Integrate with SendGrid or similar

  // Send to PagerDuty
  // Integrate with PagerDuty API
}
```

## Monitoring Dashboard

The supervisor is now globally active and monitoring:

- **Realtime Events**: 5 database tables monitored
- **Periodic Checks**: Every 60 seconds
- **Queue Processing**: 3 concurrent workers
- **Alert Logging**: All alerts saved to audit_logs
- **Auto-Mode**: Enabled (autonomous actions)
- **Alert Dispatch**: Ready for external integration

## Summary

✅ **All tasks completed**:
1. Global realtime listening with 5 table subscriptions
2. Supervisor health checks triggered on critical events
3. Application startup integration with auto-start
4. Safe fallback handling for database failures
5. Alert notification system with audit logging
6. Queue handler for realtime events
7. Database migrations created

The AI Supervisor is now **globally active and monitoring the entire app in real time**!
