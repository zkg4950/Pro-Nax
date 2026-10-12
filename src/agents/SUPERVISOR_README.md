# System Supervisor - AI-Powered System Monitoring

## Overview

The System Supervisor is an autonomous AI agent powered by LangGraph that provides full oversight over the ProNax application. It continuously monitors system health, executes administrative actions, and escalates critical issues when manual intervention is required.

## Architecture

### Components

1. **Admin Tools** (`src/agents/tools/adminTools.ts`)
   - `fetchSystemLogs`: Monitor background jobs, errors, and performance metrics
   - `manageContent`: Flag, moderate, or remove inappropriate uploads/posts/comments
   - `manageUsers`: Ban, restrict, or inspect user accounts
   - `getDatabaseHealth`: Check system status and Database/Storage operational state
   - `getPerformanceMetrics`: Monitor system performance metrics

2. **Supervisor Graph** (`src/agents/supervisorGraph.ts`)
   - **Decision Node**: Analyzes system metrics and log inputs to determine necessary actions
   - **Action Node**: Executes required administrative tools autonomously based on defined safety thresholds
   - **Alert Node**: Escalates critical issues if manual intervention is required
   - **Monitor Node**: Continuously evaluates system events, incoming logs, and administrative alerts

3. **Supervisor Worker** (`src/agents/supervisorWorker.ts`)
   - Background worker that runs supervisor checks at configurable intervals
   - Maintains event history and alert callbacks
   - Provides API for manual triggering

4. **Realtime Listener** (`src/agents/supervisorRealtime.ts`)
   - Listens to Supabase Realtime events from audit_logs, videos, and profiles tables
   - Triggers supervisor checks based on database changes
   - Event-driven architecture for real-time monitoring

5. **Privileged Database Functions** (`supervisor_privileged_functions.sql`)
   - `supervisor_get_system_health`: Comprehensive system health check with elevated access
   - `supervisor_log_action`: Log supervisor actions to audit trail
   - `supervisor_moderate_content`: Autonomous content moderation with elevated privileges
   - `supervisor_manage_user`: Autonomous user management with elevated privileges
   - `supervisor_get_error_logs`: Fetch error logs with elevated privileges
   - `supervisor_trigger_manual_check`: Trigger manual supervisor check via database

## Security Model

### Service Role Key Usage

The supervisor uses the `SUPABASE_SERVICE_ROLE_KEY` for all database operations. This provides:

- **Bypass RLS**: Row-Level Security policies are bypassed for system-level operations
- **Elevated Privileges**: Full access to all tables and functions
- **SECURITY DEFINER Functions**: Database functions run with elevated privileges

### SECURITY DEFINER Functions

All privileged operations use SECURITY DEFINER functions:

```sql
CREATE OR REPLACE FUNCTION public.supervisor_moderate_content(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ ... $$;
```

This ensures:
- Functions run with elevated privileges
- Search path is set to prevent schema-based privilege escalation
- All actions are logged to audit_logs for accountability

### Safety Thresholds

The supervisor operates with configurable safety thresholds:

- `errorRateThreshold`: 10 errors per hour (default)
- `performanceThreshold`: 80 minimum performance score (default)
- `storageThreshold`: 90% maximum storage usage (default)
- `autoMode`: Automatic execution enabled (default)
- `requireApproval`: Manual approval required for critical actions (default: false)

## Installation

### 0. Install Dependencies

The supervisor API requires Express server to handle API endpoints:

```bash
npm install
```

This will install:
- `express` - API server
- `cors` - CORS middleware
- `tsx` - TypeScript execution
- `concurrently` - Run multiple processes

### 1. Deploy Database Functions

Run the privileged functions SQL:

```bash
# Using Supabase CLI
supabase db push

# Or via SQL Editor in Supabase Dashboard
# Copy contents of supervisor_privileged_functions.sql
```

### 2. Configure Environment Variables

Ensure these are set in your `.env` file:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
VITE_SUPABASE_URL=your_supabase_project_url
```

### 3. Start the Application

The supervisor requires two processes running:

**Option 1: Run both servers together**
```bash
npm run dev:all
```

**Option 2: Run separately**
```bash
# Terminal 1: Start Vite dev server (frontend)
npm run dev

# Terminal 2: Start API server (supervisor)
npm run dev:api
```

The API server will run on port 3001, and Vite will proxy `/api` requests to it.

### 4. Start the Supervisor Worker (Optional)

Add to your application startup:

```typescript
import { startSupervisorWorker } from './agents/supervisorWorker';

// Start with default configuration (1-minute interval)
const worker = startSupervisorWorker({
  intervalMs: 60000, // 1 minute
  autoMode: true,
  enableAlerts: true,
  maxHistorySize: 1000,
});

// Or use custom configuration
const customWorker = startSupervisorWorker({
  intervalMs: 300000, // 5 minutes
  autoMode: true,
  enableAlerts: false,
});

// Stop the worker when needed
customWorker.stop();
```

### 5. Start Realtime Listener (Optional)

```typescript
import { startSupervisorRealtime } from './agents/supervisorRealtime';

// Start listening to database changes
const listener = startSupervisorRealtime();

// Stop the listener when needed
listener.stop();
```

## Usage

### API Endpoints

#### GET /api/supervisor

Get supervisor status and configuration:

```bash
# Get status (via Vite proxy on port 8080)
curl "http://localhost:8080/api/supervisor?action=status"

# Or directly to API server on port 3001
curl "http://localhost:3001/api/supervisor?action=status"

# Get health
curl "http://localhost:8080/api/supervisor?action=health"

# Get logs
curl "http://localhost:8080/api/supervisor?action=logs&timeRange=1h&limit=50"

# Get config
curl "http://localhost:8080/api/supervisor?action=config"
```

#### POST /api/supervisor

Execute supervisor with custom event:

```bash
# Manual trigger
curl -X POST "http://localhost:8080/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "manual",
    "eventType": "system_health_check",
    "severity": "info",
    "data": {},
    "source": "api"
  }'

# Content moderation
curl -X POST "http://localhost:8080/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "content-moderation",
    "actionType": "flag",
    "contentType": "video",
    "contentId": "uuid-here",
    "reason": "Violation detected"
  }'

# User management
curl -X POST "http://localhost:8080/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "user-management",
    "actionType": "ban",
    "userId": "uuid-here",
    "reason": "TOS violation",
    "duration": "7d"
  }'
```

#### PUT /api/supervisor

Update supervisor configuration:

```bash
curl -X PUT "http://localhost:8080/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{
    "errorRateThreshold": 20,
    "autoMode": true,
    "requireApproval": false
  }'
```

### Programmatic Usage

```typescript
import { executeSupervisor } from './agents/supervisorGraph';
import { SystemEventType, AlertLevel } from './agents/supervisorTypes';
import { adminTools } from './agents/tools/adminTools';

// Execute supervisor with custom event
const result = await executeSupervisor({
  type: SystemEventType.HIGH_ERROR_RATE,
  severity: AlertLevel.ERROR,
  data: {
    errorRate: 25,
    threshold: 10,
  },
  timestamp: new Date(),
  source: 'manual',
});

// Use admin tools directly
const health = await adminTools.getDatabaseHealth();
const logs = await adminTools.fetchSystemLogs({ timeRange: '1h' });
const moderation = await adminTools.manageContent({
  action: 'flag',
  contentType: 'video',
  contentId: 'uuid',
  reason: 'Policy violation',
});
```

### Queue Integration

The supervisor integrates with BullMQ for background processing:

```typescript
import { addJob } from './lib/queue/service';

// Add supervisor check to queue
await addJob('supervisor-check', {
  eventType: 'system_health_check',
  severity: 'info',
  data: {},
  source: 'manual',
});
```

## Testing

Run the live test suite:

```bash
node src/agents/test-supervisor-live.mjs
```

This will test:
1. System health check
2. Fetch system logs
3. Supervisor execution
4. Content moderation (dry run)
5. User management (dry run)
6. Performance metrics
7. Realtime listener startup

## Monitoring

### Supervisor Status

Check the supervisor status via API:

```bash
curl "http://localhost:5173/api/supervisor?action=status"
```

Response:

```json
{
  "success": true,
  "status": "active",
  "recentActions": [...],
  "lastCheck": "2026-10-05T12:00:00Z"
}
```

### Audit Logs

All supervisor actions are logged to the `audit_logs` table:

```sql
SELECT * FROM audit_logs
WHERE action LIKE '%supervisor%'
ORDER BY created_at DESC
LIMIT 20;
```

## Event Types

The supervisor responds to these system events:

- `SYSTEM_HEALTH_CHECK`: Routine health monitoring
- `LOG_ERROR`: Error detected in logs
- `HIGH_ERROR_RATE`: Error rate exceeds threshold
- `CONTENT_FLAGGED`: Content reported for moderation
- `USER_REPORTED`: User reported for review
- `PERFORMANCE_DEGRADATION`: Performance below threshold
- `STORAGE_ISSUE`: Storage usage above threshold
- `DATABASE_ISSUE`: Database connectivity issue
- `MANUAL_TRIGGER`: Manual supervisor trigger

## Alert Levels

- `INFO`: Informational events
- `WARNING`: Warnings that may need attention
- `ERROR`: Errors requiring investigation
- `CRITICAL`: Critical issues requiring immediate action

## Configuration

### Supervisor Configuration

```typescript
{
  errorRateThreshold: 10,      // errors per hour
  performanceThreshold: 80,    // minimum performance score
  storageThreshold: 90,       // maximum storage usage percentage
  autoMode: true,             // automatic execution enabled
  requireApproval: false,     // manual approval required
}
```

### Worker Configuration

```typescript
{
  intervalMs: 60000,           // check interval in milliseconds
  autoMode: true,             // whether to auto-execute actions
  enableAlerts: true,         // whether to send alerts
  maxHistorySize: 1000,       // maximum events in history
}
```

## Best Practices

1. **Always use service role key**: Never use anon key for supervisor operations
2. **Review audit logs regularly**: Monitor supervisor actions in audit_logs table
3. **Test in development**: Use dry-run operations before deploying to production
4. **Configure appropriate thresholds**: Adjust thresholds based on your system scale
5. **Enable alerts in production**: Ensure alerts are configured for critical issues
6. **Monitor queue performance**: Ensure BullMQ workers are running and healthy
7. **Regular security audits**: Review SECURITY DEFINER functions periodically

## Troubleshooting

### Supervisor not executing actions

- Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Verify SECURITY DEFINER functions are deployed
- Check audit_logs for error messages
- Ensure BullMQ worker is running

### Realtime listener not receiving events

- Verify Supabase Realtime is enabled for your project
- Check that tables have Realtime enabled
- Ensure service role key has Realtime permissions
- Check subscription status in logs

### High error rate but no alerts

- Check `errorRateThreshold` configuration
- Verify alerts are enabled in worker config
- Check alert callback is configured
- Review audit_logs for alert entries

## Security Considerations

1. **Service Role Key**: Never expose service role key to client-side code
2. **SECURITY DEFINER Functions**: Review function logic for security vulnerabilities
3. **Audit Logging**: All supervisor actions are logged for accountability
4. **Rate Limiting**: Consider rate limiting API endpoints
5. **Input Validation**: Validate all user inputs before processing
6. **Access Control**: Restrict API endpoints to authenticated admins only

## Future Enhancements

- [ ] Slack/Email/PagerDuty alert integration
- [ ] Webhook support for external alerting
- [ ] Machine learning for anomaly detection
- [ ] Predictive scaling recommendations
- [ ] Cost optimization suggestions
- [ ] Multi-region monitoring
- [ ] Custom alert rules engine
