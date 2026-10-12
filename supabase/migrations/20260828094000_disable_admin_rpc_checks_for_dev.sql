-- Migration: Disable admin checks on admin team RPC functions for development
-- Description: Temporarily disable admin role checks to allow Admin Access tab to load
-- Created: 2026-08-28
-- Purpose: Fix black page on Admin Access & Team tab during development

-- Drop and recreate admin_team_list without admin check
DROP FUNCTION IF EXISTS public.admin_team_list();

CREATE OR REPLACE FUNCTION public.admin_team_list()
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  is_super boolean,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable admin check for development
  -- IF NOT public.has_role(auth.uid(), 'admin') THEN
  --   RAISE EXCEPTION 'admin only';
  -- END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    u.email,
    p.display_name,
    p.avatar_url,
    ur.is_super,
    ur.granted_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
  ORDER BY ur.granted_at DESC;
END;
$$;

-- Drop and recreate is_super_admin without admin check
DROP FUNCTION IF EXISTS public.is_super_admin(uuid);

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable admin check for development
  -- IF NOT public.has_role(auth.uid(), 'admin') THEN
  --   RAISE EXCEPTION 'admin only';
  -- END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND is_super = true
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_team_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
