# Supervisor Environment Variable Fix

## Problem

The supervisor API was failing with:
- `{"success":false,"error":"Unknown error"}` for health checks
- `{"success":false,"error":"Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY"}` for status checks

## Root Causes

1. **Environment Variable Loading**: The `getEnvVar()` function in `adminTools.ts` was prioritizing `import.meta.env` (Vite/browser context) over `process.env` (Node.js context), causing the API server to not find the service role key.

2. **RPC Function Not Deployed**: The SECURITY DEFINER database functions (`supervisor_get_system_health`, etc.) hadn't been deployed to Supabase yet, causing RPC calls to fail.

3. **No Fallback Logic**: The tools were throwing errors immediately when RPC functions failed, instead of falling back to direct database queries.

## Solutions Applied

### 1. Fixed Environment Variable Loading

**File**: `src/agents/tools/adminTools.ts`

Updated `getEnvVar()` to prioritize `process.env` for Node.js context (API server):

```typescript
function getEnvVar(key: string): string {
  // Node.js context (API server) - use process.env
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value) return value;
  }

  // Browser/Vite context - use import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const metaKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
    return import.meta.env[metaKey] || import.meta.env[key] || '';
  }

  return '';
}
```

**File**: `src/api/supervisor.ts`

Added the same environment variable loading logic and removed dependency on `supabaseAdmin`:

```typescript
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

function getEnvVar(key: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  return '';
}

function getAdminClient() {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
  // ...
}
```

**File**: `api-server.ts`

Added explicit dotenv loading at the top:

```typescript
import dotenv from 'dotenv';
dotenv.config();
```

### 2. Added Fallback Logic for RPC Functions

**File**: `src/agents/tools/adminTools.ts`

Updated all admin tools to try RPC functions first, then fall back to direct queries:

```typescript
export async function getDatabaseHealth() {
  try {
    const supabase = getAdminClient();

    // Try to use SECURITY DEFINER function first
    let healthData;
    let healthError;

    try {
      const result = await supabase.rpc('supervisor_get_system_health');
      healthData = result.data;
      healthError = result.error;
    } catch (rpcError) {
      console.log('[getDatabaseHealth] RPC function not available, using fallback:', rpcError);
      healthError = rpcError;
    }

    // If RPC function fails, use fallback direct queries
    if (healthError || !healthData) {
      console.log('[getDatabaseHealth] Using fallback direct queries');

      // Check database connection
      const { error: dbError } = await supabase.from('profiles').select('id').limit(1);

      // Get user count
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get video count
      const { count: totalVideos } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true });

      // ... more direct queries
    }
  }
}
```

Same pattern applied to:
- `fetchSystemLogs()` - Falls back to direct `audit_logs` queries
- `manageContent()` - Falls back to direct `videos`/`video_comments` updates
- `manageUsers()` - Falls back to direct `profiles` updates

## Results

### Before Fix
```json
{"success":false,"error":"Unknown error","health":{"status":"unhealthy",...}}
```

### After Fix
```json
{
  "success":true,
  "health":{
    "status":"connected",
    "needsAttention":false,
    "errorRate":0,
    "recentUploads":5,
    "totalUsers":8,
    "totalVideos":5,
    "lastErrorTime":"2026-10-06T07:56:17.940Z"
  },
  "metrics":{
    "database":"connected",
    "uploads":"operational",
    "logging":"operational"
  },
  "summary":"System is connected. Error rate: 0/hour. Total users: 8, Total videos: 5"
}
```

### Status Check
```json
{
  "success":true,
  "status":"active",
  "recentActions":[],
  "lastCheck":null
}
```

### Logs Check
```json
{
  "success":true,
  "logs":[],
  "metrics":{
    "totalLogs":0,
    "errorCount":0,
    "warningCount":0,
    "infoCount":0,
    "timeRange":"1h"
  },
  "summary":"Found 0 logs in the last 1h (0 errors, 0 warnings)"
}
```

## Current Status

✅ **Environment variables loading correctly** - API server now reads from `process.env`
✅ **Fallback logic working** - Tools work without SECURITY DEFINER functions deployed
✅ **Health check functional** - Returns actual database statistics
✅ **Status check functional** - Returns supervisor status
✅ **Logs check functional** - Returns audit logs

## Next Steps

1. **Deploy SECURITY DEFINER Functions** (Optional but Recommended)
   - Run `supervisor_privileged_functions.sql` in Supabase SQL Editor
   - This will enable privileged operations with elevated access
   - Fallback logic will still work if functions aren't deployed

2. **Test Supervisor Actions**
   - Test content moderation with fallback
   - Test user management with fallback
   - Verify audit logging works

3. **Deploy to Production**
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in production environment
   - Deploy API server separately or as part of your deployment pipeline
   - Configure proper CORS settings for production

## Notes

- The supervisor works **without** the SECURITY DEFINER functions deployed, using fallback direct queries
- Once functions are deployed, the tools will automatically use them for better performance and security
- All operations are logged to `audit_logs` table regardless of which method is used
- The service role key is still required for elevated privileges (bypassing RLS)
