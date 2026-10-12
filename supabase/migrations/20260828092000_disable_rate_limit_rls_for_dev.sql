-- Migration: Disable RLS on rate limit tables for development
-- Description: Temporarily disable RLS to allow rate limit tab to load
-- Created: 2026-08-28
-- Purpose: Fix rate limit tab loading issues during development

-- Disable RLS on rate_limit_events table
ALTER TABLE public.rate_limit_events DISABLE ROW LEVEL SECURITY;

-- Disable RLS on ip_rules table
ALTER TABLE public.ip_rules DISABLE ROW LEVEL SECURITY;
