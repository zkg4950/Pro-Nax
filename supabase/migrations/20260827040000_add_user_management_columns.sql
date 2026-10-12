-- Migration: Add User Management Columns for Admin Panel
-- Description: Add wallet_balance and videos_uploaded columns to profiles table
-- Created: 2026-08-27
-- Purpose: Support enhanced user management in admin panel

-- Add wallet_balance column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0.00;

-- Add videos_uploaded column to profiles table  
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS videos_uploaded integer DEFAULT 0;

-- Add constraints to ensure non-negative values (only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_wallet_balance_nonneg'
    AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_wallet_balance_nonneg CHECK (wallet_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_videos_uploaded_nonneg'
    AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_videos_uploaded_nonneg CHECK (videos_uploaded >= 0);
  END IF;
END $$;

-- Create index on videos_uploaded for sorting
CREATE INDEX IF NOT EXISTS idx_profiles_videos_uploaded 
ON public.profiles (videos_uploaded DESC);

-- Create index on wallet_balance for sorting
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_balance 
ON public.profiles (wallet_balance DESC);

-- Create function to update videos_uploaded count
CREATE OR REPLACE FUNCTION public.update_user_video_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles 
    SET videos_uploaded = videos_uploaded + 1
    WHERE id = NEW.owner_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles 
    SET videos_uploaded = GREATEST(videos_uploaded - 1, 0)
    WHERE id = OLD.owner_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle owner changes if needed
    IF OLD.owner_id != NEW.owner_id THEN
      UPDATE public.profiles 
      SET videos_uploaded = GREATEST(videos_uploaded - 1, 0)
      WHERE id = OLD.owner_id;
      UPDATE public.profiles 
      SET videos_uploaded = videos_uploaded + 1
      WHERE id = NEW.owner_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger to automatically update video count
DROP TRIGGER IF EXISTS trigger_update_user_video_count ON public.videos;
CREATE TRIGGER trigger_update_user_video_count
AFTER INSERT OR DELETE OR UPDATE ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.update_user_video_count();

-- Sync existing video counts
UPDATE public.profiles p
SET videos_uploaded = (
  SELECT COUNT(*) 
  FROM public.videos v 
  WHERE v.owner_id = p.id
)
WHERE videos_uploaded = 0 OR videos_uploaded IS NULL;
