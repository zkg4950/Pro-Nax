# Creator Studio Strict Audit Report

**Audit Date:** 2026-01-24  
**Scope:** All Creator Studio files, routes, hooks, and related components  
**Instruction:** No code changes applied during this audit.

---

## Executive Summary

The Creator Studio implementation has **critical structural defects** and **multiple medium-severity issues**:

- **CRITICAL FAIL:** Missing `StudioLayout.tsx` - 6 root-level Studio files import from a non-existent file, causing runtime errors.
- **MEDIUM WARN:** Direct table operations in `useLiveStudio.ts` bypass intended RPC audit trail for video metadata updates.
- **MEDIUM WARN:** Shared `UploadModal` uses Edge Function for deletion but direct table operations for updates.
- **MULTIPLE WARN:** Several Studio views are UI-only with no actual backend persistence (Settings, Subtitles, Audio Library, Copyright Claim resolution, Live Control Room).
- **PASS:** Analytics RPCs exist and match signatures; auth gating is implemented in the newer `pronax-studio` app.

---

## Detailed File-by-File Audit

### 1. Root-Level Studio Files (CRITICAL - Missing Dependency)

#### `src/StudioDashboard.tsx` - **FAIL**
- **Line 8:** `import { useStudio } from './StudioLayout';`
- **Issue:** Imports from non-existent `StudioLayout.tsx`
- **Impact:** Runtime import error, component cannot load
- **Status:** CRITICAL - File cannot function without dependency

#### `src/StudioContent.tsx` - **FAIL**
- **Line 5:** `import { useStudio } from './StudioLayout';`
- **Issue:** Imports from non-existent `StudioLayout.tsx`
- **Line 32-43:** Direct table update for visibility change
  ```ts
  const { error } = await supabase.from('videos').update({ visibility }).eq('id', videoId);
  ```
- **Issue:** Bypasses any intended RPC for video metadata updates
- **Status:** CRITICAL (import) + WARN (direct update)

#### `src/StudioAnalytics.tsx` - **FAIL**
- **Line 4:** `import { useStudio } from './StudioLayout';`
- **Issue:** Imports from non-existent `StudioLayout.tsx`
- **Line 56:** Calls `get_channel_analytics` RPC
  ```ts
  const { data, error } = await (supabase.rpc as any)('get_channel_analytics', { p_user_id: user.id });
  ```
- **Verification:** RPC exists in `master_schema_and_functions.sql` line 2655-2687
- **Status:** CRITICAL (import) + PASS (RPC signature matches)

#### `src/StudioMonetization.tsx` - **FAIL**
- **Line 4:** `import { useStudio } from './StudioLayout';`
- **Issue:** Imports from non-existent `StudioLayout.tsx`
- **Status:** CRITICAL - File cannot function without dependency

#### `src/StudioCustomization.tsx` - **FAIL**
- **Line 5:** `import { useStudio } from './StudioLayout';`
- **Issue:** Imports from non-existent `StudioLayout.tsx`
- **Status:** CRITICAL - File cannot function without dependency

#### `src/StudioComments.tsx` - **FAIL**
- **Line 7:** `import { useStudio } from './StudioLayout';`
- **Issue:** Imports from non-existent `StudioLayout.tsx`
- **Line 34-39:** Direct table query for comments
  ```ts
  const { data } = await supabase.from('video_comments').select('id, body:text, created_at, video_id, user_id').in('video_id', ids)
  ```
- **Issue:** Direct table query (no RPC), but not necessarily a violation if RLS protects it
- **Status:** CRITICAL (import) + PASS (reasonable direct query with RLS)

---

### 2. Newer Studio Application (`src/pronax-studio/`)

#### `src/pronax-studio/PronaxStudioApp.tsx` - **PASS**
- **Lines 37-57:** Uses `useLiveStudio()` for auth and data
- **Lines 59-75:** Safe authenticated data fallbacks
  ```ts
  const safeVideos = isAuthed ? videos : [];
  const safeComments = isAuthed ? comments : [];
  ```
- **Line 454:** `as any` cast in editor video conversion
  ```ts
  setEditorVideo(editorFormatVideo as any);
  ```
- **Issue:** Type safety bypass for editor state
- **Status:** PASS (auth/ownership) + WARN (any cast)

#### `src/pronax-studio/useLiveStudio.ts` - **WARN**
- **Lines 259-274:** `saveVideo` uses direct table update
  ```ts
  const { error } = await supabase.from("videos").update({
    title: updated.title,
    description: updated.description,
    tags: updated.tags,
    category: updated.category,
    visibility: updated.visibility.toLowerCase(),
    monetization_enabled: updated.monetization,
    thumb_url: updated.thumbnail || null,
  }).eq("id", updated.id);
  ```
- **Issue:** Direct table update bypasses RPC audit trail for video metadata changes
- **Lines 276-296:** `deleteVideo` calls Edge Function `delete-video`
  ```ts
  const { error } = await supabase.functions.invoke('delete-video', { body: { videoId } });
  ```
- **Verification:** Edge Function approach is correct for secure deletion
- **Lines 298-312:** `addCommentReply` uses direct table insert
  ```ts
  const { error } = await supabase.from("video_comments").insert({
    video_id: parent.videoId,
    user_id: userId,
    parent_id: commentId,
    text: replyText,
  });
  ```
- **Issue:** Direct insert bypasses any intended RPC for comment replies
- **Lines 314-318:** `deleteComment` uses direct table delete
  ```ts
  const { error } = await supabase.from("video_comments").delete().eq("id", commentId);
  ```
- **Issue:** Direct delete bypasses RPC
- **Lines 324-336:** `updateChannel` uses direct table update
  ```ts
  const { error } = await supabase.from("profiles").update(upd).eq("id", userId);
  ```
- **Issue:** Direct profile update bypasses RPC
- **Lines 118:** Video query uses `.eq("owner_id", userId)` - correct ownership filter
- **Status:** WARN (multiple direct operations bypass RPC audit trail)

#### `src/pronax-studio/components/DashboardView.tsx` - **PASS**
- **Lines 29-50:** Null-safe channel stats defaults
- **Line 51:** Video sorting from `allVideos` (client-side)
- **Status:** PASS (UI only, no data mutations)

#### `src/pronax-studio/components/ContentView.tsx` - **PASS**
- **Lines 48-66:** Client-side filtering only
- **Lines 68-81:** Selection state management only
- **Status:** PASS (UI only, no direct mutations - mutations use callbacks)

#### `src/pronax-studio/components/UploadModal.tsx` - **WARN**
- **Lines 32-55:** Synthetic local video object creation after upload
  ```ts
  const newVid: Video = {
    id: "v" + Date.now(),
    title: payload.title || "Untitled",
    // ... placeholder values
  };
  ```
- **Issue:** Creates local video with timestamp ID and placeholder metrics, not actual database record
- **Verification:** Actual upload handled by shared `@/components/UploadModal`
- **Status:** WARN (stale local state after upload)

#### `src/pronax-studio/components/VideoEditModal.tsx` - **PASS**
- **Lines 124-141:** `handleSave` calls `onSaveVideo` callback
- **Status:** PASS (UI only, mutations via callback)

#### `src/pronax-studio/components/AnalyticsView.tsx` - **PASS**
- **Lines 75-80:** Uses analytics hooks that call RPCs
- **Lines 149-178:** Realtime subscription to `analytics_events` table
  ```ts
  const channel = supabase.channel(`analytics:${user.id}`).on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'analytics_events',
    filter: `user_id=eq.${user.id}`,
  }, ...)
  ```
- **Verification:** Filtered by `user_id` - correct ownership scoping
- **Status:** PASS (RPC usage, ownership filters)

#### `src/pronax-studio/components/CommentsView.tsx` - **PASS**
- **Lines 74-80:** `handleSendReply` calls `onAddReply` callback
- **Lines 321:** `toggleHeartComment` updates local state only
- **Status:** PASS (UI only, mutations via callbacks)

#### `src/pronax-studio/components/EarnView.tsx` - **PASS**
- **Lines 46-50:** Direct wallet query
  ```ts
  const { data, error } = await supabase.from('user_wallets').select('balance, total_earned, total_withdrawn').eq('user_id', user.id).maybeSingle();
  ```
- **Verification:** Filtered by `user_id` - correct ownership
- **Lines 80-93:** Client-side revenue calculations from `earningsSeries`
- **Status:** PASS (ownership filter, read-only operations)

#### `src/pronax-studio/components/CustomizationView.tsx` - **PASS**
- **Lines 29-38:** `handlePublish` calls `onUpdateChannelStats` callback
- **Lines 128-138:** Avatar/banner upload uses `URL.createObjectURL` - local preview only
- **Issue:** No actual storage upload or persistence
- **Status:** PASS (UI only) + WARN (no actual upload persistence)

#### `src/pronax-studio/components/SettingsModal.tsx` - **WARN**
- **Lines 31-37:** `handleSave` only sets local state and closes modal
  ```ts
  const handleSave = () => {
    setSavedMessage(true);
    setTimeout(() => { setSavedMessage(false); onClose(); }, 1000);
  };
  ```
- **Issue:** No actual persistence of settings to database
- **Status:** WARN (UI only, no backend persistence)

#### `src/pronax-studio/components/SubtitlesView.tsx` - **WARN**
- **Lines 148-157:** `handlePublishTrack` calls `onSaveTrack` callback
- **Lines 138-146:** `handleExportSRT` copies to clipboard only
- **Issue:** No actual subtitle file storage or video association
- **Status:** WARN (UI only, no actual persistence)

#### `src/pronax-studio/components/AudioLibraryView.tsx` - **WARN**
- **Lines 48-65:** `handlePlayTrack` uses HTML5 audio element with direct URL
- **Line 188:** `onToggleStarTrack` callback not implemented in parent
- **Issue:** No actual persistence of starred tracks
- **Status:** WARN (UI only, no persistence)

#### `src/pronax-studio/components/CopyrightClaimModal.tsx` - **WARN**
- **Lines 55-62:** `handleAction` uses `setTimeout` and calls `onResolveClaim` callback
  ```ts
  setTimeout(() => {
    onResolveClaim(video?.id ?? '', "None");
    setResolvingAction(null);
    onClose();
  }, 1200);
  ```
- **Issue:** Simulated resolution with no actual backend processing
- **Status:** WARN (UI only, no actual copyright resolution)

#### `src/pronax-studio/components/LiveControlRoomModal.tsx` - **WARN**
- **Lines 96-142:** Simulated chat message generation
- **Lines 57:** Hardcoded stream key
  ```ts
  const [streamKey, setStreamKey] = useState("live_8402910492_x82910a9201");
  ```
- **Issue:** No actual OBS/WebRTC integration, no real stream key generation
- **Status:** WARN (simulated only, no actual live streaming)

---

### 3. Analytics and Hooks

#### `src/pronax-studio/analyticsApi.ts` - **PASS**
- **Line 157:** Calls `get_traffic_sources_analytics(p_user_id)`
  - **Verification:** RPC exists in `20260811120000_analytics_events.sql` lines 101-132
  - **Signature:** `RETURNS TABLE (source text, percentage numeric, views bigint)` - matches
- **Line 183:** Calls `get_geography_analytics(p_user_id)`
  - **Verification:** RPC exists in `20260811120000_analytics_events.sql` lines 135-167
  - **Signature:** `RETURNS TABLE (country_code text, country_name text, percentage numeric)` - matches
- **Line 209:** Calls `get_realtime_views(p_user_id)`
  - **Verification:** RPC exists in `20260811120000_analytics_events.sql` lines 170-189
  - **Signature:** `RETURNS TABLE (last_48_hours bigint, last_60_minutes bigint)` - matches
- **Line 236:** Calls `get_minute_views(p_user_id, p_minutes)`
  - **Verification:** RPC exists in `20260811120000_analytics_events.sql` lines 192-215
  - **Signature:** `RETURNS TABLE (minute_label text, views bigint)` - matches
- **Lines 47-78:** `fetchAnalyticsChartData` uses direct `videos` table query
  ```ts
  const { data: videos, error } = await supabase.from("videos").select("created_at, views_count").eq("owner_id", userId)
  ```
- **Verification:** Filtered by `owner_id` - correct ownership
- **Status:** PASS (all RPCs verified, ownership filters present)

#### `src/pronax-studio/useAnalyticsData.ts` - **PASS**
- **Lines 71-73:** Dynamic import of analyticsApi functions
- **Status:** PASS (wrapper hooks, no direct queries)

#### `src/useStudioData.ts` - **PASS**
- **Line 67:** Videos query filtered by `owner_id`
  ```ts
  supabase.from('videos').select('*').eq('owner_id', userId)
  ```
- **Line 70:** Notices via RPC `get_channel_notices`
  - **Verification:** RPC exists in `20260801093952_e67f5779-8f56-4fc8-8e37-c6186dbfc0d5.sql` lines 24-48
  - **Signature:** `RETURNS TABLE(id uuid, notice_type text, ...)` - matches
- **Line 105:** Copyright claims via RPC `get_video_copyright_claims`
  - **Verification:** RPC exists in `20260801093952_e67f5779-8f56-4fc8-8e37-c6186dbfc0d5.sql` lines 141-160
  - **Signature:** `RETURNS TABLE(id uuid, claim_type text, ...)` - matches
- **Line 117:** Analytics via RPC `get_creator_analytics`
  - **Verification:** RPC exists in `20260801093952_e67f5779-8f56-4fc8-8e37-c6186dbfc0d5.sql` lines 51-73
  - **Signature:** `RETURNS jsonb` - matches
- **Lines 136-147:** Realtime subscription filtered by `owner_id`
  ```ts
  supabase.channel(`studio:${userId}`).on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'videos',
    filter: `owner_id=eq.${userId}`
  }, fetchAll)
  ```
- **Status:** PASS (all RPCs verified, ownership filters present)

---

### 4. Shared Components

#### `src/components/UploadModal.tsx` - **WARN**
- **Lines 166-305:** `generateFramePreviews` - complex thumbnail generation with cleanup
- **Lines 307-377:** `handleSelectVideoFile` - validation and copyright pre-check
- **Lines 464-500:** Step 2 processing simulation with fingerprint generation
- **Issue:** Very large file (500+ lines), complex state management, needs dedicated security audit
- **Status:** WARN (complex, requires separate security audit)

#### `src/lib/studio-auth.ts` - **PASS**
- **Lines 451-481:** `useStudioAuth` uses `useUnifiedAuth`
- **Lines 456-459:** Session timeout management
- **Status:** PASS (auth wrapper, no direct data operations)

---

### 5. Routes

#### `src/routes/studio.$.tsx` - **PASS**
- **Lines 4-8:** Redirects to `/studio/dashboard`
- **Status:** PASS (route redirect only)

#### `src/routes/studio.index.tsx` - **PASS**
- **Lines 4-8:** Redirects to `/studio/dashboard`
- **Status:** PASS (route redirect only)

#### `src/routes/studio.dashboard.tsx` - **PASS**
- **Lines 15-19:** Renders `PronaxStudio` from `@/features/pages/PronaxStudio`
- **Verification:** `@/features/pages/PronaxStudio` imports from `@/pronax-studio/PronaxStudioApp`
- **Status:** PASS (route wiring correct)

---

### 6. Type Definitions

#### `src/pronax-studio/types.ts` - **PASS**
- **Lines 74-101:** `Video` interface with all expected fields
- **Lines 103-116:** `Comment` interface
- **Lines 130-142:** `ChannelStats` interface
- **Status:** PASS (type definitions only)

---

## Summary of Issues by Severity

### CRITICAL (Must Fix Immediately)

1. **Missing `StudioLayout.tsx`** - 6 files import from non-existent file:
   - `src/StudioDashboard.tsx` line 8
   - `src/StudioContent.tsx` line 5
   - `src/StudioAnalytics.tsx` line 4
   - `src/StudioMonetization.tsx` line 4
   - `src/StudioCustomization.tsx` line 5
   - `src/StudioComments.tsx` line 7

### MEDIUM (Should Fix for Audit Trail/Security)

1. **Direct table operations in `useLiveStudio.ts`:**
   - Lines 259-274: `saveVideo` - direct `videos` table update
   - Lines 298-312: `addCommentReply` - direct `video_comments` insert
   - Lines 314-318: `deleteComment` - direct `video_comments` delete
   - Lines 324-336: `updateChannel` - direct `profiles` update

2. **Direct visibility update in `StudioContent.tsx`:**
   - Lines 32-43: Direct `videos` table update for visibility

### WARN (Functional Limitations)

1. **UI-only components with no persistence:**
   - `SettingsModal.tsx` - No actual settings persistence
   - `SubtitlesView.tsx` - No actual subtitle storage
   - `AudioLibraryView.tsx` - No starred track persistence
   - `CopyrightClaimModal.tsx` - Simulated resolution only
   - `LiveControlRoomModal.tsx` - Simulated streaming only
   - `CustomizationView.tsx` - No actual avatar/banner upload persistence

2. **Type safety issues:**
   - `PronaxStudioApp.tsx` line 454: `as any` cast for editor video

3. **Stale local state:**
   - `UploadModal.tsx` (pronax-studio wrapper) - Synthetic video object after upload

4. **Complex component requiring separate audit:**
   - `src/components/UploadModal.tsx` - 500+ lines, complex upload/copyright logic

---

## Auth and Ownership Verification

### PASS - Ownership Enforcement

All data queries in the newer `pronax-studio` implementation correctly filter by authenticated user ID:
- `useLiveStudio.ts` line 118: `.eq("owner_id", userId)`
- `useStudioData.ts` line 67: `.eq('owner_id', userId)`
- `analyticsApi.ts` line 50: `.eq("owner_id", userId)`
- Realtime subscriptions include `owner_id=eq.${userId}` filters

### PASS - Auth Gating

- `PronaxStudioApp.tsx` lines 60-75: Main content gated on `isAuthed && !live.loading`
- Safe arrays for unauthenticated state prevent data leakage

### UNKNOWN - RLS Verification

- RLS policies were not inspected in this audit
- Client-side ownership filters must be backed by server-side RLS for true security

---

## RPC Signature Verification

### PASS - All Called RPCs Exist

| RPC Name | Frontend Location | SQL Location | Status |
|----------|-------------------|--------------|--------|
| `get_traffic_sources_analytics` | `analyticsApi.ts:157` | `20260811120000_analytics_events.sql:101` | PASS |
| `get_geography_analytics` | `analyticsApi.ts:183` | `20260811120000_analytics_events.sql:135` | PASS |
| `get_realtime_views` | `analyticsApi.ts:209` | `20260811120000_analytics_events.sql:170` | PASS |
| `get_minute_views` | `analyticsApi.ts:236` | `20260811120000_analytics_events.sql:192` | PASS |
| `get_channel_notices` | `useStudioData.ts:70` | `20260801093952_e67f5779-8f56-4fc8-8e37-c6186dbfc0d5.sql:24` | PASS |
| `get_video_copyright_claims` | `useStudioData.ts:105` | `20260801093952_e67f5779-8f56-4fc8-8e37-c6186dbfc0d5.sql:141` | PASS |
| `get_creator_analytics` | `useStudioData.ts:117` | `20260801093952_e67f5779-8f56-4fc8-8e37-c6186dbfc0d5.sql:51` | PASS |
| `get_channel_analytics` | `StudioAnalytics.tsx:56` | `master_schema_and_functions.sql:2655` | PASS |

---

## Recommendations

### Immediate (Critical)

1. **Create or fix `StudioLayout.tsx`** - Either:
   - Create the missing file with `useStudio` hook
   - Update all 6 imports to use the correct path (likely `useStudioData`)

### High Priority (Medium)

1. **Replace direct table operations with RPCs in `useLiveStudio.ts`:**
   - Create `creator_update_video` RPC for video metadata changes
   - Create `creator_add_comment_reply` RPC for comment replies
   - Create `creator_delete_comment` RPC for comment deletion
   - Create `creator_update_profile` RPC for profile updates

2. **Replace direct visibility update in `StudioContent.tsx`** with RPC

### Medium Priority (WARN)

1. **Implement actual persistence for UI-only components:**
   - Settings storage in database
   - Subtitle file storage and video association
   - Audio library starred tracks
   - Copyright claim resolution workflow
   - Live streaming integration (or remove if not planned)

2. **Fix type safety:**
   - Remove `as any` cast in `PronaxStudioApp.tsx`
   - Implement proper editor video type conversion

3. **Fix UploadModal wrapper:**
   - Refresh video list after upload instead of creating synthetic local object

### Low Priority

1. **Audit `src/components/UploadModal.tsx`** separately for security (copyright detection, fingerprinting, storage)

2. **Verify RLS policies** for all Studio-related tables

---

## Conclusion

The Creator Studio has a **critical structural dependency issue** preventing 6 root-level files from loading. The newer `pronax-studio` implementation has better auth gating and ownership filtering, but uses **direct table operations** that bypass RPC audit trails for important mutations (video updates, comments, profile changes). Several features are **UI-only simulations** without actual backend persistence.

**Overall Assessment:** 6 CRITICAL, 4 MEDIUM, 9 WARN, rest PASS

**Recommended Action Priority:**
1. Fix StudioLayout import issue (CRITICAL)
2. Replace direct operations with RPCs (MEDIUM)
3. Implement backend persistence for UI-only features (WARN)
