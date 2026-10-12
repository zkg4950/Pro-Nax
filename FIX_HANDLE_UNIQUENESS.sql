-- =====================================================================================
-- Fix Handle Uniqueness (Case-Insensitive like TikTok/YouTube)
-- =====================================================================================

-- Drop existing unique index (case-sensitive)
DROP INDEX IF EXISTS public.idx_profiles_handle_unique;

-- Create new case-insensitive unique index
CREATE UNIQUE INDEX idx_profiles_handle_unique ON public.profiles(lower(handle)) WHERE handle IS NOT NULL;

-- Add constraint to ensure handle is lowercase (optional, for data integrity)
-- This ensures all handles are stored in lowercase
ALTER TABLE public.profiles ADD CONSTRAINT handle_lowercase CHECK (handle IS NULL OR handle = lower(handle));

-- Update any existing handles to lowercase
UPDATE public.profiles SET handle = lower(handle) WHERE handle IS NOT NULL AND handle != lower(handle);

-- Also update handle_history and reserved_handles to lowercase
UPDATE public.handle_history SET old_handle = lower(old_handle) WHERE old_handle != lower(old_handle);
UPDATE public.reserved_handles SET handle = lower(handle) WHERE handle != lower(handle);

-- Now handles will be case-insensitive unique (like TikTok/YouTube)
-- Examples: "johndoe", "JohnDoe", "JOHNDOE" - sabse ek hi handle man jayega
