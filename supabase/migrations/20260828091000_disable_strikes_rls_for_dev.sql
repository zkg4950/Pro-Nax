-- Migration: Disable RLS on user_strikes for development
-- Description: Temporarily disable RLS to allow strikes tab to load
-- Created: 2026-08-28
-- Purpose: Fix "Failed to load strikes" error during development

-- Drop existing RLS policies
DROP POLICY IF EXISTS "users_view_own_strikes" ON public.user_strikes;
DROP POLICY IF EXISTS "admins_full_access_strikes" ON public.user_strikes;
DROP POLICY IF EXISTS "dev_all_authenticated_access" ON public.user_strikes;

-- Create temporary policy allowing all authenticated users (for development)
CREATE POLICY "dev_all_authenticated_access" ON public.user_strikes
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
