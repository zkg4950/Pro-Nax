-- Fix log_audit_event function overload ambiguity
-- Drop the old json-based overload to avoid conflicts with jsonb version

DROP FUNCTION IF EXISTS public.log_audit_event(text, text, text, text, json, text, text);
