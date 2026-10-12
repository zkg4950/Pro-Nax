# Supervisor Setup Verification Checklist

## Implementation Status

### ✅ Completed Components

1. **Admin Tools Module** (`src/agents/tools/adminTools.ts`)
   - ✅ `fetchSystemLogs`: Monitors background jobs, errors, and performance metrics
   - ✅ `manageContent`: Flags, moderates, or removes inappropriate content
   - ✅ `manageUsers`: Bans, restricts, or inspects user accounts
   - ✅ `getDatabaseHealth`: Checks system status and Database/Storage operational state
   - ✅ `getPerformanceMetrics`: Monitors system performance metrics
   - ✅ Uses SECURITY DEFINER functions for privileged operations
   - ✅ Uses service role key for elevated privileges
   - ✅ Safe fallback handling if RPC functions fail
   - ✅ Direct query fallback for database operations

2. **Supervisor Graph** (`src/agents/supervisorGraph.ts`)
   - ✅ Decision Node: Analyzes system metrics and log inputs
   - ✅ Action Node: Executes administrative tools autonomously
   - ✅ Alert Node: Escalates critical issues for manual intervention
   - ✅ Monitor Node: Continuously evaluates system events
   - ✅ Conditional routing based on system state
   - ✅ LLM-powered decision making with rule-based fallback

3. **Supervisor Worker** (`src/agents/supervisorWorker.ts`)
   - ✅ Background worker with configurable intervals
   - ✅ Event history tracking
   - ✅ Alert callback support
   - ✅ Manual trigger API
   - ✅ Status monitoring

4. **Realtime Listener** (`src/agents/supervisorRealtime.ts`)
   - ✅ Listens to audit_logs table for error events
   - ✅ Listens to videos table for content events
   - ✅ Listens to profiles table for user events
   - ✅ Listens to video_comments table for comment moderation
   - ✅ Listens to analytics_events table for system metrics
   - ✅ Queue integration for event processing
   - ✅ Subscription management

5. **Privileged Database Functions** (`supervisor_privileged_functions.sql`)
   - ✅ `supervisor_get_system_health`: Comprehensive health check
   - ✅ `supervisor_log_action`: Audit trail logging
   - ✅ `supervisor_moderate_content`: Content moderation
   - ✅ `supervisor_manage_user`: User management
   - ✅ `supervisor_get_error_logs`: Error log fetching
   - ✅ `supervisor_trigger_manual_check`: Manual trigger
   - ✅ All functions use SECURITY DEFINER
   - ✅ All functions use SET search_path = public
   - ✅ Execute granted to authenticated role

6. **Queue Integration** (`src/lib/queue/`)
   - ✅ Added 'supervisor-check' job type
   - ✅ Added SupervisorCheckJobData interface
   - ✅ Implemented handleSupervisorCheck handler
   - ✅ Registered handler in jobHandlers registry
   - ✅ SupervisorCheckJobData added to JobDataUnion

7. **API Endpoints** (`src/api/supervisor.ts` & `src/routes/-api.supervisor.tsx`)
   - ✅ GET /api/supervisor - Status, health, logs, config
   - ✅ POST /api/supervisor - Execute, moderate, manage users
   - ✅ PUT /api/supervisor - Update configuration
   - ✅ Comprehensive API for external access

8. **Global Startup Integration** (`api-server.ts`)
   - ✅ Supervisor worker starts automatically on API server startup
   - ✅ Realtime listener starts automatically on API server startup
   - ✅ Queue worker for supervisor-check jobs starts automatically
   - ✅ Graceful shutdown handling for all supervisor systems
   - ✅ Auto-mode enabled with alerts enabled
   - ✅ 1-minute interval for health checks

9. **Alert Notification System** (`src/agents/supervisorGraph.ts`)
   - ✅ Critical alerts saved to audit_logs
   - ✅ Info-level checks logged to audit_logs
   - ✅ Alert severity mapping (CRITICAL→error, WARNING→warning)
   - ✅ Admin notification channel dispatch
   - ✅ Safe fallback if database write fails

10. **Database Migrations**
    - ✅ Migration to enable realtime for supervisor tables
    - ✅ Migration for supervisor privileged functions
    - ✅ Realtime enabled for: audit_logs, videos, profiles, video_comments, analytics_events

## Recently Completed Updates (October 6, 2026)

### ✅ Global Realtime Monitoring Enhancement

1. **Extended Realtime Subscriptions**
   - Added `subscribeToComments()` for video_comments table moderation
   - Added `subscribeToAnalyticsEvents()` for analytics_events system metrics
   - Critical events (error, critical) trigger supervisor health checks
   - High report counts trigger content review events

2. **Application Startup Integration**
   - Supervisor worker auto-starts in `api-server.ts` with 1-minute interval
   - Realtime listener auto-starts on API server startup
   - Queue worker for supervisor-check jobs auto-starts with concurrency 3
   - Graceful shutdown handling for all supervisor systems
   - Auto-mode enabled with alerts enabled globally

3. **Enhanced Error Handling**
   - All admin tools have safe fallback if RPC functions fail
   - Direct query fallback for database operations
   - Alert logging has safe fallback if database write fails
   - Supervisor continues operating even with partial database failures

4. **Alert Notification System**
   - All critical alerts saved to audit_logs automatically
   - Info-level checks logged for monitoring history
   - Alert severity properly mapped (CRITICAL→error, WARNING→warning)
   - Admin notification channel dispatch ready for integration
   - Safe fallback ensures alerts aren't lost on database errors

5. **Database Migrations**
   - Created migration to enable realtime for all supervisor tables
   - Copied supervisor privileged functions to migrations folder
   - Realtime enabled for: audit_logs, videos, profiles, video_comments, analytics_events
   - Supabase config updated to enable realtime

### Verification Checklist

- [x] Realtime subscriptions for all key tables (audit_logs, videos, profiles, comments, analytics_events)
- [x] Supervisor health check triggers on critical system events
- [x] Supervisor worker and realtime listener wired into API server startup
- [x] Safe fallback handling for database query failures
- [x] Alert notification system saves to audit_logs
- [x] Queue handler for supervisor-check jobs from realtime events
- [x] Database migrations created for realtime and privileged functions
- [ ] Apply migrations to Supabase database
- [ ] Test supervisor API endpoints
- [ ] Verify realtime subscriptions are active
- [ ] Test alert notification dispatch

## Deployment Steps

### Step 0: Install Dependencies

The supervisor API requires Express server to handle API endpoints:

```bash
npm install
```

This will install:
- `express` - API server
- `cors` - CORS middleware
- `tsx` - TypeScript execution
- `concurrently` - Run multiple processes

### Step 1: Deploy Database Functions

Run the SQL script in Supabase SQL Editor:

```sql
-- Copy contents of supervisor_privileged_functions.sql
-- Execute in Supabase Dashboard > SQL Editor
```

Or using Supabase CLI:

```bash
supabase db push
```

### Step 2: Verify Environment Variables

Ensure these are set in `.env`:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
VITE_SUPABASE_URL=your_supabase_project_url
```

### Step 3: Build the Application

```bash
npm run build
```

### Step 4: Start the Application

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

### Step 5: Verify API Endpoints

Test the supervisor API (use port 8080 for Vite or 3001 for direct API access):

```bash
# Test health check (via Vite proxy)
curl "http://localhost:8080/api/supervisor?action=health"

# Or directly to API server
curl "http://localhost:3001/api/supervisor?action=health"

# Test status
curl "http://localhost:8080/api/supervisor?action=status"

# Test config
curl "http://localhost:8080/api/supervisor?action=config"
```

### Step 6: Start Supervisor Worker (Optional)

Add to your application startup:

```typescript
import { startSupervisorWorker } from './agents/supervisorWorker';

// Start with default configuration
const worker = startSupervisorWorker({
  intervalMs: 60000, // 1 minute
  autoMode: true,
  enableAlerts: true,
});
```

### Step 7: Start Realtime Listener (Optional)

Add to your application startup:

```typescript
import { startSupervisorRealtime } from './agents/supervisorRealtime';

// Start listening to database changes
const listener = startSupervisorRealtime();
```

## Testing Manual Trigger

Test the supervisor with a manual trigger:

```bash
curl -X POST "http://localhost:8080/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "manual",
    "eventType": "system_health_check",
    "severity": "info",
    "data": {},
    "source": "api"
  }'
```

## Verification Checklist

- [ ] Database functions deployed successfully
- [ ] Environment variables configured
- [ ] Application builds without errors
- [ ] API endpoints accessible
- [ ] Health check returns system status
- [ ] Service role key has necessary permissions
- [ ] Audit logs table exists and is accessible
- [ ] BullMQ worker can process supervisor-check jobs
- [ ] Realtime subscriptions can be established
- [ ] Supervisor graph compiles without errors

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     System Supervisor                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Monitor    │───→│  Decision    │───→│   Action     │  │
│  │    Node      │    │    Node      │    │    Node      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │          │
│         ↓                   ↓                   ↓          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ System Logs  │    │   LLM /      │    │ Admin Tools  │  │
│  │ & Health     │    │   Rules      │    │ (Privileged) │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                     │          │
│                                                     ↓          │
│                                            ┌──────────────┐  │
│                                            │ SECURITY     │  │
│                                            │ DEFINER      │  │
│                                            │ Functions    │  │
│                                            └──────────────┘  │
│                                                     │          │
│                                                     ↓          │
│                                            ┌──────────────┐  │
│                                            │   Supabase   │  │
│                                            │   Database   │  │
│                                            │ (Service     │  │
│                                            │  Role Key)   │  │
│                                            └──────────────┘  │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Integration Points                                          │
├─────────────────────────────────────────────────────────────┤
│  • API Endpoints (/api/supervisor)                           │
│  • BullMQ Queue (supervisor-check jobs)                      │
│  • Supabase Realtime (audit_logs, videos, profiles)          │
│  • Background Worker (periodic checks)                       │
└─────────────────────────────────────────────────────────────┘
```

## Next Steps

1. **Deploy database functions** to your Supabase project
2. **Configure environment variables** with service role key
3. **Build and test** the application locally
4. **Integrate supervisor worker** into your application startup
5. **Configure alert notifications** (Slack, Email, PagerDuty)
6. **Monitor audit logs** for supervisor actions
7. **Adjust thresholds** based on your system scale
8. **Enable in production** after thorough testing

## Documentation

Full documentation available in:
- `src/agents/SUPERVISOR_README.md` - Complete supervisor guide
- `supervisor_privileged_functions.sql` - Database functions with comments
- `src/agents/supervisorGraph.ts` - Graph implementation with comments
- `src/agents/tools/adminTools.ts` - Admin tools with usage examples
