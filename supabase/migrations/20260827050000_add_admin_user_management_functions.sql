-- Migration: Add Admin User Management RPC Functions
-- Description: Add RPC functions for admin user management operations
-- Created: 2026-08-27
-- Purpose: Support admin panel user management features

-- Function to delete a video as admin
CREATE OR REPLACE FUNCTION public.admin_delete_video(p_video_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_thumbnail_url text;
  v_video_url text;
BEGIN
  -- Only admins can delete videos
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Get video details before deletion
  SELECT owner_id, thumbnail_url, video_url INTO v_owner_id, v_thumbnail_url, v_video_url
  FROM public.videos
  WHERE id::text = p_video_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'video not found';
  END IF;

  -- Delete the video
  DELETE FROM public.videos WHERE id::text = p_video_id;

  -- Log the action
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
    VALUES (auth.uid(), 'delete_video', 'video', p_video_id, jsonb_build_object('owner_id', v_owner_id));

  -- Note: Actual file deletion from storage should be handled by a separate process
  -- or edge function to avoid timeouts in the database function

  RETURN jsonb_build_object('ok', true, 'deleted', true);
END;
$$;

-- Function to update user profile as admin
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id uuid,
  p_display_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_is_banned boolean DEFAULT NULL,
  p_ban_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can update user profiles
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Build update dynamically
  UPDATE public.profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    status = COALESCE(p_status, status),
    is_banned = COALESCE(p_is_banned, is_banned),
    ban_reason = COALESCE(p_ban_reason, ban_reason)
  WHERE id = p_user_id;

  -- Update email in auth.users if provided (requires service role)
  IF p_email IS NOT NULL THEN
    -- This would need to be done via auth admin API, not in this function
    NULL;
  END IF;

  -- Log the action
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
    VALUES (auth.uid(), 'update_user_profile', 'user', p_user_id::text,
            jsonb_build_object('display_name', p_display_name, 'status', p_status, 'is_banned', p_is_banned));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Function to get user details for admin view
CREATE OR REPLACE FUNCTION public.admin_get_user_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_roles jsonb;
  v_videos_count bigint;
  v_wallet_balance numeric;
BEGIN
  -- Only admins can view user details
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Get profile
  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Get roles
  SELECT jsonb_agg(role) INTO v_roles
  FROM public.user_roles
  WHERE user_id = p_user_id;

  -- Get video count
  SELECT COUNT(*) INTO v_videos_count
  FROM public.videos
  WHERE owner_id = p_user_id;

  -- Get wallet balance
  SELECT COALESCE(balance, 0) INTO v_wallet_balance
  FROM public.user_wallets
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'roles', v_roles,
    'videos_count', v_videos_count,
    'wallet_balance', v_wallet_balance
  );
END;
$$;

-- Function to get user videos for admin view
CREATE OR REPLACE FUNCTION public.admin_get_user_videos(p_user_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS SETOF public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can view user videos
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT v.*
  FROM public.videos v
  WHERE v.owner_id = p_user_id
  ORDER BY v.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_delete_video(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_videos(uuid, integer, integer) TO authenticated;
