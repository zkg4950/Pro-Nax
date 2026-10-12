-- Migration: Disable RLS on audit_logs table for development
-- Description: Temporarily disable RLS to allow audit log tabs to load
-- Created: 2026-08-28
-- Purpose: Fix black pages on Admin Action Log and Audit Trail tabs

-- Disable RLS on audit_logs table
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
