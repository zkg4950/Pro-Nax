# API Routing Fix - Supervisor Endpoints

## Problem

The supervisor API endpoints at `/api/supervisor` were returning the frontend `index.html` instead of JSON responses. This was because:

1. The project uses client-side routing only (SSR is disabled in `src/server.ts`)
2. TanStack Router routes are client-side components, not server-side API handlers
3. Vite dev server falls back to serving `index.html` for all unmatched routes

## Solution

Created a dedicated Express API server to handle supervisor endpoints separately from the Vite frontend.

### Changes Made

1. **Added Express API Server** (`api-server.ts`)
   - Dedicated server running on port 3001
   - Handles all `/api/supervisor` endpoints
   - Returns proper JSON responses
   - Uses the same supervisor API functions from `src/api/supervisor.ts`

2. **Updated Vite Config** (`vite.config.ts`)
   - Added proxy configuration to forward `/api` requests to the Express server
   - Frontend can now call `http://localhost:8080/api/supervisor` and it will be proxied to the API server

3. **Updated Package Dependencies**
   - Added `express` - HTTP server
   - Added `cors` - CORS middleware
   - Added `tsx` - TypeScript execution
   - Added `concurrently` - Run multiple processes together
   - Added type definitions for Express

4. **Updated NPM Scripts**
   - `npm run dev:api` - Start API server only
   - `npm run dev:all` - Start both Vite and API server together
   - `npm run dev` - Start Vite only (existing)

## Usage

### Start Both Servers (Recommended)

```bash
npm run dev:all
```

This will start:
- Vite dev server on port 8080 (frontend)
- Express API server on port 3001 (supervisor API)

### Start Separately

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: API Server
npm run dev:api
```

### Access API Endpoints

**Via Vite Proxy (Recommended for frontend calls):**
```bash
curl "http://localhost:8080/api/supervisor?action=health"
```

**Direct to API Server:**
```bash
curl "http://localhost:3001/api/supervisor?action=health"
```

Both will return the same JSON response.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser/Client                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ├─→ http://localhost:8080/* (Frontend)
                           │   ↓
                           │   Vite Dev Server (port 8080)
                           │   ↓
                           │   React App
                           │
                           └─→ http://localhost:8080/api/* (API)
                               ↓
                               Vite Proxy
                               ↓
┌─────────────────────────────────────────────────────────┐
│              Express API Server (port 3001)              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  GET /api/supervisor                             │  │
│  │  POST /api/supervisor                            │  │
│  │  PUT /api/supervisor                             │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  src/api/supervisor.ts (API Functions)            │  │
│  │  ├─ triggerHealthCheck()                          │  │
│  │  ├─ triggerSystemLogs()                           │  │
│  │  ├─ triggerContentModeration()                    │  │
│  │  ├─ triggerUserManagement()                       │  │
│  │  └─ executeSupervisorAPI()                       │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  src/agents/supervisorGraph.ts                    │  │
│  │  src/agents/tools/adminTools.ts                   │  │
│  │  src/agents/supervisorWorker.ts                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## API Endpoints

### GET /api/supervisor

Query parameters:
- `action=status` - Get supervisor status
- `action=health` - Get system health
- `action=logs` - Get system logs (with `timeRange` and `limit` params)
- `action=config` - Get supervisor configuration

### POST /api/supervisor

Body parameters:
- `action=execute` - Execute supervisor with event
- `action=content-moderation` - Moderate content
- `action=user-management` - Manage users
- `action=manual` - Manual trigger

### PUT /api/supervisor

Body parameters:
- Configuration updates (errorRateThreshold, autoMode, etc.)

## Testing

```bash
# Test health check
curl "http://localhost:8080/api/supervisor?action=health"

# Test status
curl "http://localhost:8080/api/supervisor?action=status"

# Test manual trigger
curl -X POST "http://localhost:8080/api/supervisor" \
  -H "Content-Type: application/json" \
  -d '{"action": "manual", "eventType": "system_health_check", "severity": "info", "data": {}, "source": "api"}'
```

## Notes

- The API server runs independently and can be deployed separately from the frontend
- CORS is enabled to allow cross-origin requests
- Environment variables are loaded from `.env` file automatically
- The supervisor functions use the Supabase service role key for privileged operations
- All supervisor actions are logged to the `audit_logs` table

## Troubleshooting

### API server not starting
- Check that port 3001 is not already in use
- Verify dependencies are installed: `npm install`
- Check that `.env` file exists with required variables

### Frontend can't reach API
- Ensure both servers are running (`npm run dev:all`)
- Check Vite proxy configuration in `vite.config.ts`
- Verify API server is running on port 3001

### Database connection errors
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`
- Verify Supabase project is accessible
- Check that SECURITY DEFINER functions are deployed to database
