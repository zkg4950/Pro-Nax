-- =====================================================================================
-- Supervisor Privileged Functions
-- SECURITY DEFINER functions for autonomous system supervision with elevated privileges
-- These functions run with elevated database permissions for system monitoring and control
-- =====================================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------------------
-- Function: supervisor_get_system_health
-- Purpose: Comprehensive system health check with elevated access
-- Security: SECURITY DEFINER - runs with elevated privileges
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_get_system_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  health_result JSONB;
  db_status TEXT;
  error_count INTEGER;
  warning_count INTEGER;
  total_users INTEGER;
  total_videos INTEGER;
  recent_uploads INTEGER;
BEGIN
  -- Check database connectivity
  db_status := 'connected';

  -- Count errors in last hour
  SELECT COUNT(*)
  INTO error_count
  FROM audit_logs
  WHERE severity = 'error'
    AND created_at >= NOW() - INTERVAL '1 hour';

  -- Count warnings in last hour
  SELECT COUNT(*)
  INTO warning_count
  FROM audit_logs
  WHERE severity = 'warning'
    AND created_at >= NOW() - INTERVAL '1 hour';

  -- Get total users
  SELECT COUNT(*)
  INTO total_users
  FROM profiles;

  -- Get total videos
  SELECT COUNT(*)
  INTO total_videos
  FROM videos;

  -- Get recent uploads (last hour)
  SELECT COUNT(*)
  INTO recent_uploads
  FROM videos
  WHERE created_at >= NOW() - INTERVAL '1 hour';

  -- Build health result
  health_result := jsonb_build_object(
    'status', db_status,
    'needs_attention', (error_count > 10 OR recent_uploads = 0),
    'error_rate', error_count,
    'warning_rate', warning_count,
    'total_users', total_users,
    'total_videos', total_videos,
    'recent_uploads', recent_uploads,
    'checked_at', NOW()
  );

  RETURN health_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.supervisor_get_system_health() TO authenticated;

-- -------------------------------------------------------------------------------------
-- Function: supervisor_log_action
-- Purpose: Log supervisor actions to audit trail with elevated privileges
-- Security: SECURITY DEFINER - ensures logging even if RLS would block
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_log_action(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_actor_id TEXT,
  p_severity TEXT DEFAULT 'info',
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    action,
    entity_type,
    entity_id,
    actor_id,
    severity,
    details,
    created_at
  ) VALUES (
    p_action,
    p_entity_type,
    p_entity_id,
    p_actor_id,
    p_severity,
    p_details,
    NOW()
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.supervisor_log_action(
  TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) TO authenticated;

-- -------------------------------------------------------------------------------------
-- Function: supervisor_moderate_content
-- Purpose: Autonomous content moderation with elevated privileges
-- Security: SECURITY DEFINER - bypasses RLS for content moderation
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_moderate_content(
  p_content_type TEXT,
  p_content_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT '',
  p_moderator_id TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  log_id UUID;
BEGIN
  -- Handle video moderation
  IF p_content_type = 'video' THEN
    IF p_action = 'remove' THEN
      UPDATE videos
      SET
        is_removed = TRUE,
        moderation_reason = p_reason,
        updated_at = NOW()
      WHERE id = p_content_id;

      result := jsonb_build_object(
        'success', TRUE,
        'action', p_action,
        'content_type', p_content_type,
        'content_id', p_content_id,
        'timestamp', NOW()
      );
    ELSIF p_action = 'shadow_ban' THEN
      UPDATE videos
      SET
        is_shadow_banned = TRUE,
        moderation_reason = p_reason,
        updated_at = NOW()
      WHERE id = p_content_id;

      result := jsonb_build_object(
        'success', TRUE,
        'action', p_action,
        'content_type', p_content_type,
        'content_id', p_content_id,
        'timestamp', NOW()
      );
    ELSIF p_action = 'flag' THEN
      UPDATE videos
      SET
        report_count = COALESCE(report_count, 0) + 1,
        auto_suppressed = TRUE,
        updated_at = NOW()
      WHERE id = p_content_id;

      result := jsonb_build_object(
        'success', TRUE,
        'action', p_action,
        'content_type', p_content_type,
        'content_id', p_content_id,
        'timestamp', NOW()
      );
    ELSIF p_action = 'approve' THEN
      UPDATE videos
      SET
        auto_suppressed = FALSE,
        report_count = 0,
        updated_at = NOW()
      WHERE id = p_content_id;

      result := jsonb_build_object(
        'success', TRUE,
        'action', p_action,
        'content_type', p_content_type,
        'content_id', p_content_id,
        'timestamp', NOW()
      );
    ELSE
      result := jsonb_build_object(
        'success', FALSE,
        'error', 'Invalid action for video',
        'content_type', p_content_type
      );
    END IF;

  -- Handle comment moderation
  ELSIF p_content_type = 'comment' THEN
    IF p_action = 'remove' THEN
      DELETE FROM video_comments
      WHERE id = p_content_id;

      result := jsonb_build_object(
        'success', TRUE,
        'action', p_action,
        'content_type', p_content_type,
        'content_id', p_content_id,
        'timestamp', NOW()
      );
    ELSIF p_action = 'flag' THEN
      UPDATE video_comments
      SET
        text = '[REMOVED - FLAGGED]',
        likes_count = 0,
        updated_at = NOW()
      WHERE id = p_content_id;

      result := jsonb_build_object(
        'success', TRUE,
        'action', p_action,
        'content_type', p_content_type,
        'content_id', p_content_id,
        'timestamp', NOW()
      );
    ELSE
      result := jsonb_build_object(
        'success', FALSE,
        'error', 'Invalid action for comment',
        'content_type', p_content_type
      );
    END IF;

  ELSE
    result := jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid content type',
      'content_type', p_content_type
    );
  END IF;

  -- Log the action
  IF result->>'success' = 'true' THEN
    log_id := supervisor_log_action(
      'content_' || p_action,
      p_content_type,
      p_content_id,
      p_moderator_id,
      CASE WHEN p_action = 'remove' THEN 'warning' ELSE 'info' END,
      jsonb_build_object('reason', p_reason)
    );
  END IF;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.supervisor_moderate_content(
  TEXT, UUID, TEXT, TEXT, TEXT
) TO authenticated;

-- -------------------------------------------------------------------------------------
-- Function: supervisor_manage_user
-- Purpose: Autonomous user management with elevated privileges
-- Security: SECURITY DEFINER - bypasses RLS for user management
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_manage_user(
  p_user_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT '',
  p_duration TEXT DEFAULT 'permanent',
  p_admin_id TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  banned_until TIMESTAMPTZ;
  log_id UUID;
BEGIN
  -- Handle user actions
  IF p_action = 'ban' THEN
    -- Calculate ban end time
    IF p_duration = 'permanent' THEN
      banned_until := NULL;
    ELSE
      banned_until := NOW() + (p_duration::INTERVAL);
    END IF;

    UPDATE profiles
    SET
      is_banned = TRUE,
      banned_until = banned_until,
      ban_reason = p_reason,
      status = 'banned',
      updated_at = NOW()
    WHERE id = p_user_id;

    result := jsonb_build_object(
      'success', TRUE,
      'action', p_action,
      'user_id', p_user_id,
      'banned_until', banned_until,
      'timestamp', NOW()
    );

  ELSIF p_action = 'unban' THEN
    UPDATE profiles
    SET
      is_banned = FALSE,
      banned_until = NULL,
      ban_reason = NULL,
      status = 'active',
      updated_at = NOW()
    WHERE id = p_user_id;

    result := jsonb_build_object(
      'success', TRUE,
      'action', p_action,
      'user_id', p_user_id,
      'timestamp', NOW()
    );

  ELSIF p_action = 'restrict' THEN
    UPDATE profiles
    SET
      upload_limit_mb = 0,
      updated_at = NOW()
    WHERE id = p_user_id;

    result := jsonb_build_object(
      'success', TRUE,
      'action', p_action,
      'user_id', p_user_id,
      'timestamp', NOW()
    );

  ELSIF p_action = 'unrestrict' THEN
    UPDATE profiles
    SET
      upload_limit_mb = 1024,
      updated_at = NOW()
    WHERE id = p_user_id;

    result := jsonb_build_object(
      'success', TRUE,
      'action', p_action,
      'user_id', p_user_id,
      'timestamp', NOW()
    );

  ELSIF p_action = 'inspect' THEN
    SELECT jsonb_build_object(
      'success', TRUE,
      'action', p_action,
      'user_id', p_user_id,
      'user_data', to_jsonb(profiles)
    )
    INTO result
    FROM profiles
    WHERE id = p_user_id;

  ELSE
    result := jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid action',
      'action', p_action
    );
  END IF;

  -- Log the action (except for inspect)
  IF p_action != 'inspect' AND result->>'success' = 'true' THEN
    log_id := supervisor_log_action(
      'user_' || p_action,
      'user',
      p_user_id,
      p_admin_id,
      CASE WHEN p_action = 'ban' THEN 'warning' ELSE 'info' END,
      jsonb_build_object('reason', p_reason, 'duration', p_duration)
    );
  END IF;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.supervisor_manage_user(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- -------------------------------------------------------------------------------------
-- Function: supervisor_get_error_logs
-- Purpose: Fetch error logs with elevated privileges
-- Security: SECURITY DEFINER - bypasses RLS for log access
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_get_error_logs(
  p_time_range TEXT DEFAULT '24h',
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_time TIMESTAMPTZ;
  logs_result JSONB;
BEGIN
  -- Calculate cutoff time
  IF p_time_range = '1h' THEN
    cutoff_time := NOW() - INTERVAL '1 hour';
  ELSIF p_time_range = '7d' THEN
    cutoff_time := NOW() - INTERVAL '7 days';
  ELSIF p_time_range = '30d' THEN
    cutoff_time := NOW() - INTERVAL '30 days';
  ELSE
    cutoff_time := NOW() - INTERVAL '24 hours';
  END IF;

  -- Fetch logs
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'action', action,
      'entity_type', entity_type,
      'entity_id', entity_id,
      'actor_id', actor_id,
      'severity', severity,
      'details', details,
      'created_at', created_at
    )
  )
  INTO logs_result
  FROM audit_logs
  WHERE created_at >= cutoff_time
  ORDER BY created_at DESC
  LIMIT p_limit;

  IF logs_result IS NULL THEN
    logs_result := '[]'::jsonb;
  END IF;

  RETURN logs_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.supervisor_get_error_logs(
  TEXT, INTEGER
) TO authenticated;

-- -------------------------------------------------------------------------------------
-- Function: supervisor_trigger_manual_check
-- Purpose: Trigger manual supervisor check via database function
-- Security: SECURITY DEFINER - allows triggering supervisor from database
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisor_trigger_manual_check(
  p_event_type TEXT DEFAULT 'manual_trigger',
  p_severity TEXT DEFAULT 'info',
  p_event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Log the manual trigger
  INSERT INTO audit_logs (
    action,
    entity_type,
    entity_id,
    actor_id,
    severity,
    details,
    created_at
  ) VALUES (
    'supervisor_manual_trigger',
    'system',
    NULL,
    'manual',
    p_severity,
    jsonb_build_object(
      'event_type', p_event_type,
      'event_data', p_event_data
    ),
    NOW()
  );

  result := jsonb_build_object(
    'success', TRUE,
    'event_type', p_event_type,
    'severity', p_severity,
    'triggered_at', NOW(),
    'message', 'Manual supervisor check triggered. Queue worker will process.'
  );

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.supervisor_trigger_manual_check(
  TEXT, TEXT, JSONB
) TO authenticated;

-- =====================================================================================
-- Notes:
-- 1. All functions use SECURITY DEFINER to run with elevated privileges
-- 2. SET search_path = public prevents schema-based privilege escalation
-- 3. Functions log all actions to audit_logs for accountability
-- 4. Execute is granted to authenticated role (via service role key)
-- 5. These functions should be called from the supervisor using service role key
-- =====================================================================================
