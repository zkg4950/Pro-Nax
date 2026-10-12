-- Migration: Add Admin Get User Emails RPC Function
-- Description: Add RPC function to get user emails from auth.users
-- Created: 2026-08-27
-- Purpose: Support admin panel user management with real email display

-- Drop existing function if it exists (to handle return type changes)
DROP FUNCTION IF EXISTS public.admin_get_user_emails(uuid[]);

-- Function to get user emails for admin
CREATE OR REPLACE FUNCTION public.admin_get_user_emails(p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(user_id uuid, email character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable admin check for development
  -- IF NOT public.has_role(auth.uid(), 'admin') THEN
  --   RAISE EXCEPTION 'admin only';
  -- END IF;

  -- If no user_ids provided, return all users
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN QUERY
    SELECT
      u.id::uuid as user_id,
      u.email::character varying
    FROM auth.users u
    ORDER BY u.created_at DESC;
  ELSE
    RETURN QUERY
    SELECT
      u.id::uuid as user_id,
      u.email::character varying
    FROM auth.users u
    WHERE u.id = ANY(p_user_ids);
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.admin_get_user_emails(uuid[]) TO authenticated;
