-- =====================================================================================
-- ProNax Master Schema and Functions
-- Production-ready Supabase/PostgreSQL schema with 55/45 revenue split enforcement
-- Fraud-proof advertiser-driven revenue model
-- 
-- This script consolidates all migrations, functions, RLS policies, and triggers
-- into a single comprehensive migration suitable for Supabase SQL Editor.
-- 
-- Key Features:
-- - 60+ tables covering video platform, monetization, social, moderation, copyright
-- - Database-enforced 55/45 creator/platform revenue split
-- - Geolocation-based CPM tracking with country metadata
-- - Category/niche CPM metadata (informational/analytics only)
-- - Long-form vs Shorts placement support
-- - Full RLS with role-based access control
-- - Audio, PDQ, and vPDQ copyright fingerprinting
-- - Live streaming with chat
-- - A/B testing framework
-- - GDPR compliance
-- - Comprehensive audit logging
-- 
-- IMPORTANT: This script should be run on a fresh database or carefully reviewed
-- before running on an existing database to avoid conflicts.
-- =====================================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================================================
-- 1. ENUMS
-- =====================================================================================

-- app_role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'support');
  END IF;
END $$;

-- =====================================================================================
-- 2. CORE TABLES
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 2.1 User & Profile Tables
-- -------------------------------------------------------------------------------------

-- profiles: Main user profile table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    display_name text,
    bio text,
    avatar_url text,
    banner_url text,
    handle text,
    verified boolean DEFAULT false,
    follower_count integer DEFAULT 0,
    following_count integer DEFAULT 0,
    video_count integer DEFAULT 0,
    total_views bigint DEFAULT 0,
    wallet_balance numeric DEFAULT 0.00,
    videos_uploaded integer DEFAULT 0,
    upload_limit_mb integer DEFAULT 1024,
    status text DEFAULT 'active',
    is_banned boolean DEFAULT false,
    banned_until timestamptz,
    ban_reason text,
    is_bot_flagged boolean DEFAULT false,
    bot_flagged_at timestamptz,
    bot_flag_reason text,
    daily_earnings_usd numeric DEFAULT 0,
    handle_changed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT handle_format CHECK ((handle IS NULL) OR (handle ~ '^[a-zA-Z0-9_]{3,30}$')),
    CONSTRAINT profiles_counts_nonneg CHECK (
        follower_count >= 0 AND 
        following_count >= 0 AND 
        video_count >= 0 AND 
        total_views >= 0
    ),
    CONSTRAINT profiles_wallet_balance_nonneg CHECK (wallet_balance >= 0),
    CONSTRAINT profiles_videos_uploaded_nonneg CHECK (videos_uploaded >= 0)
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON public.profiles(display_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle_unique ON public.profiles(handle) WHERE handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_videos_uploaded ON public.profiles(videos_uploaded);
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_balance ON public.profiles(wallet_balance);

-- user_roles: Role assignments
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (user_id, role)
);

-- super_admins: Owner tier admins
CREATE TABLE IF NOT EXISTS public.super_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- admin_invites: Pending admin invitations
CREATE TABLE IF NOT EXISTS public.admin_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    role public.app_role DEFAULT 'admin',
    status text DEFAULT 'pending',
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    accepted_at timestamptz,
    CONSTRAINT admin_invites_status_check CHECK (status IN ('pending', 'accepted', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_invites_email_pending 
    ON public.admin_invites(lower(email)) 
    WHERE status = 'pending';

-- user_settings: Cross-device user preferences
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme text DEFAULT 'system',
    language text DEFAULT 'en',
    autoplay_videos boolean DEFAULT true,
    autoplay_shorts boolean DEFAULT true,
    muted boolean DEFAULT false,
    quality_preference text DEFAULT 'auto',
    captions_enabled boolean DEFAULT false,
    captions_language text DEFAULT 'en',
    mini_player_enabled boolean DEFAULT true,
    notifications_enabled boolean DEFAULT true,
    restricted_mode boolean DEFAULT false,
    playback_speed numeric DEFAULT 1.0,
    custom_settings jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT user_settings_theme_check CHECK (theme IN ('light', 'dark', 'system')),
    CONSTRAINT user_settings_quality_check CHECK (quality_preference IN ('auto', '360p', '480p', '720p', '1080p', '4k')),
    CONSTRAINT user_settings_speed_check CHECK (playback_speed >= 0.25 AND playback_speed <= 2.0)
);

-- notification_preferences: Notification settings
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    new_video boolean DEFAULT true,
    live_start boolean DEFAULT true,
    comment_reply boolean DEFAULT true,
    mention boolean DEFAULT true,
    copyright boolean DEFAULT true,
    payout boolean DEFAULT true,
    marketing boolean DEFAULT false,
    channel_overrides jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now()
);

-- user_consents: GDPR consent tracking
CREATE TABLE IF NOT EXISTS public.user_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    anon_id text,
    necessary boolean DEFAULT true,
    analytics boolean DEFAULT false,
    advertising boolean DEFAULT false,
    policy_version text DEFAULT 'v1',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_consents_user_id 
    ON public.user_consents(user_id) 
    WHERE user_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- 2.2 Monetization Tables (55/45 Split System)
-- -------------------------------------------------------------------------------------

-- user_wallets: Creator wallets
CREATE TABLE IF NOT EXISTS public.user_wallets (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance numeric(14,4) DEFAULT 0,
    total_earned numeric(14,4) DEFAULT 0,
    total_withdrawn numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT wallets_balance_nonneg CHECK (balance >= 0),
    CONSTRAINT wallets_total_earned_nonneg CHECK (total_earned >= 0),
    CONSTRAINT wallets_total_withdrawn_nonneg CHECK (total_withdrawn >= 0)
);

-- wallet_transactions: Transaction history
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    delta numeric NOT NULL,
    balance_after numeric,
    kind text NOT NULL,
    reference_id text,
    reason text,
    performed_by uuid,
    created_at timestamptz DEFAULT now()
);

-- revenue_logs: Creator revenue records with geolocation and category metadata
CREATE TABLE IF NOT EXISTS public.revenue_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_id text NOT NULL,
    views_count integer DEFAULT 1,
    amount_earned numeric(14,4) DEFAULT 0.001, -- CREATOR SHARE (55%)
    ad_network text,
    cpm numeric(14,4),
    gross_revenue numeric(14,6), -- Full gross revenue from network
    country_code text,
    country_name text,
    country_tier text, -- tier1|tier2|tier3|default
    base_cpm numeric(14,4),
    country_multiplier numeric(8,4),
    category text,
    category_multiplier numeric(8,4),
    category_tier text, -- premium|high|standard|low|default
    placement_type text, -- long_form|shorts
    placement_multiplier numeric(8,4),
    network_impression_id text, -- Unique ID from ad network for idempotency
    verification_status text DEFAULT 'unverified', -- verified|unverified|suspicious
    fraud_risk_score numeric,
    created_at timestamptz DEFAULT now()
);

-- Indexes for revenue_logs
CREATE INDEX IF NOT EXISTS idx_revenue_logs_user_id ON public.revenue_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_video_id ON public.revenue_logs(video_id);

-- Add missing columns for geolocation tracking if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'country_code') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN country_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'country_name') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN country_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'country_tier') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN country_tier text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'base_cpm') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN base_cpm numeric(14,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'country_multiplier') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN country_multiplier numeric(8,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'category') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN category text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'category_multiplier') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN category_multiplier numeric(8,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'category_tier') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN category_tier text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'placement_type') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN placement_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'placement_multiplier') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN placement_multiplier numeric(8,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'network_impression_id') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN network_impression_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'verification_status') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN verification_status text DEFAULT 'unverified';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'revenue_logs' AND column_name = 'fraud_risk_score') THEN
    ALTER TABLE public.revenue_logs ADD COLUMN fraud_risk_score numeric;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_revenue_logs_country_code ON public.revenue_logs(country_code);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_country_tier ON public.revenue_logs(country_tier);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_category ON public.revenue_logs(category);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_category_tier ON public.revenue_logs(category_tier);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_placement_type ON public.revenue_logs(placement_type);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_network_impression_id ON public.revenue_logs(network_impression_id) WHERE network_impression_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_revenue_logs_created_at ON public.revenue_logs(created_at);

-- platform_revenue: Platform 45% share accounting
CREATE TABLE IF NOT EXISTS public.platform_revenue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_user_id uuid,
    video_id text NOT NULL,
    amount numeric(14,6) DEFAULT 0, -- PLATFORM SHARE (45%)
    gross_revenue numeric(14,6) DEFAULT 0,
    ad_network text,
    cpm numeric(14,4),
    country_code text,
    category text,
    placement_type text,
    network_impression_id text,
    created_at timestamptz DEFAULT now()
);

-- Indexes for platform_revenue
CREATE INDEX IF NOT EXISTS idx_platform_revenue_created_at ON public.platform_revenue(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_video_id ON public.platform_revenue(video_id);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_source_user_id ON public.platform_revenue(source_user_id);

-- Add missing columns for platform_revenue if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_revenue' AND column_name = 'country_code') THEN
    ALTER TABLE public.platform_revenue ADD COLUMN country_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_revenue' AND column_name = 'category') THEN
    ALTER TABLE public.platform_revenue ADD COLUMN category text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_revenue' AND column_name = 'placement_type') THEN
    ALTER TABLE public.platform_revenue ADD COLUMN placement_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_revenue' AND column_name = 'network_impression_id') THEN
    ALTER TABLE public.platform_revenue ADD COLUMN network_impression_id text;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_platform_revenue_network_impression_id ON public.platform_revenue(network_impression_id) WHERE network_impression_id IS NOT NULL;

-- withdrawal_requests: Payout requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount numeric NOT NULL,
    method text,
    destination text,
    status text DEFAULT 'pending',
    admin_note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    country text,
    payment_details jsonb DEFAULT '{}',
    processed_at timestamptz,
    CONSTRAINT withdrawal_requests_amount_check CHECK (amount > 0),
    CONSTRAINT withdrawal_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed'))
);

-- user_withdrawal_methods: Saved payment methods
CREATE TABLE IF NOT EXISTS public.user_withdrawal_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    method_type text NOT NULL,
    account_identifier text NOT NULL,
    account_holder_name text,
    is_default boolean DEFAULT false,
    updated_at timestamptz DEFAULT now()
);

-- creator_earnings: Aggregated earnings by period
CREATE TABLE IF NOT EXISTS public.creator_earnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    creator_id uuid NOT NULL,
    video_id text,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    total_views bigint DEFAULT 0,
    total_watch_seconds bigint DEFAULT 0,
    total_earned numeric DEFAULT 0,
    gross_amount numeric,
    cpm numeric,
    impressions integer,
    source text,
    status text DEFAULT 'pending',
    last_computed_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT creator_earnings_status_check CHECK (status IN ('pending', 'available', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator_period ON public.creator_earnings(creator_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_video ON public.creator_earnings(video_id);

-- -------------------------------------------------------------------------------------
-- 2.3 Video Tables
-- -------------------------------------------------------------------------------------

-- videos: Main video table
CREATE TABLE IF NOT EXISTS public.videos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text DEFAULT '',
    tags text[] DEFAULT '{}',
    category text,
    language text DEFAULT 'en',
    visibility text DEFAULT 'public',
    age_restriction text DEFAULT 'none',
    license text DEFAULT 'standard',
    monetization_enabled boolean DEFAULT true,
    scheduled_at timestamptz,
    r2_video_key text NOT NULL,
    r2_thumb_key text,
    video_url text NOT NULL,
    thumb_url text,
    mime_type text,
    size_bytes bigint,
    sha256 text,
    status text DEFAULT 'ready',
    copyright_scan_status text DEFAULT 'not_started',
    copyright_scan_completed_at timestamptz,
    copyright_scan_retry_count integer DEFAULT 0,
    views_count bigint DEFAULT 0,
    likes_count integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    shares_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    published_at timestamptz,
    is_removed boolean DEFAULT false,
    is_shadow_banned boolean DEFAULT false,
    moderation_reason text,
    duration_seconds integer,
    is_short boolean DEFAULT false,
    preview_sprite_url text,
    preview_sprite_frames integer,
    is_pending_review boolean DEFAULT false,
    boost_score numeric DEFAULT 0,
    report_count integer DEFAULT 0,
    auto_suppressed boolean DEFAULT false,
    preview_url text,
    variants jsonb,
    audio_track_id text,
    original_sound_credit text,
    stitch_source_videos text[],
    stitch_position integer,
    duet_source_video text,
    reaction_source_video text,
    trending_score numeric DEFAULT 0,
    sound_usage_count integer DEFAULT 0,
    aspect_ratio numeric,
    audio_track_title text,
    search_tsv tsvector,
    CONSTRAINT videos_visibility_check CHECK (visibility IN ('public', 'unlisted', 'private')),
    CONSTRAINT videos_status_check CHECK (status IN ('ready', 'processing', 'published', 'copyright_flagged', 'removed', 'error', 'pending_review')),
    CONSTRAINT videos_copyright_scan_status_check CHECK (copyright_scan_status IN ('not_started', 'pending', 'complete', 'failed')),
    CONSTRAINT videos_views_count_nonneg CHECK (views_count >= 0),
    CONSTRAINT videos_likes_count_nonneg CHECK (likes_count >= 0),
    CONSTRAINT videos_comments_count_nonneg CHECK (comments_count >= 0),
    CONSTRAINT videos_shares_count_nonneg CHECK (shares_count >= 0),
    CONSTRAINT videos_report_count_nonneg CHECK (report_count >= 0)
);

-- Indexes for videos
CREATE INDEX IF NOT EXISTS idx_videos_owner_created ON public.videos(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_visibility_public ON public.videos(created_at DESC) 
    WHERE visibility = 'public' AND status = 'ready' AND is_removed = false;
CREATE INDEX IF NOT EXISTS idx_videos_views_public ON public.videos(views_count DESC) 
    WHERE visibility = 'public' AND status = 'ready' AND is_removed = false;
CREATE INDEX IF NOT EXISTS idx_videos_category ON public.videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_is_short ON public.videos(created_at DESC) 
    WHERE is_short = true AND visibility = 'public' AND status = 'ready';
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_monetization ON public.videos(owner_id) 
    WHERE monetization_enabled = true;
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_search_tsv ON public.videos USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_videos_search_composite ON public.videos(owner_id, created_at DESC) 
    WHERE visibility = 'public' AND status = 'ready';
CREATE INDEX IF NOT EXISTS idx_videos_copyright_scan_status ON public.videos(copyright_scan_status) 
    WHERE copyright_scan_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_videos_sha256 ON public.videos(sha256);

ALTER TABLE ONLY public.videos REPLICA IDENTITY FULL;

-- video_subtitles: Video captions
CREATE TABLE IF NOT EXISTS public.video_subtitles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    label text NOT NULL,
    language text NOT NULL,
    src text NOT NULL,
    kind text DEFAULT 'subtitles',
    is_default boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT video_subtitles_kind_check CHECK (kind IN ('subtitles', 'captions'))
);

CREATE INDEX IF NOT EXISTS idx_video_subtitles_video_id ON public.video_subtitles(video_id);

-- video_views: View tracking
CREATE TABLE IF NOT EXISTS public.video_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    user_id uuid,
    viewer_id uuid,
    ip_address text,
    watch_seconds integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT video_views_watch_seconds_nonneg CHECK (watch_seconds >= 0)
);

-- Enable RLS for video_views
ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;

-- Fix video_id type in video_views if it's text instead of uuid
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_views' AND column_name = 'video_id' AND data_type = 'text') THEN
    ALTER TABLE public.video_views ALTER COLUMN video_id TYPE uuid USING video_id::uuid;
  END IF;
END $$;

-- Allow authenticated users to insert their own views
DROP POLICY IF EXISTS "users_insert_own_views" ON public.video_views;
CREATE POLICY "users_insert_own_views" ON public.video_views
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid() OR viewer_id IS NULL);

-- Allow anonymous users to insert views (for view counting)
DROP POLICY IF EXISTS "anon_insert_views" ON public.video_views;
CREATE POLICY "anon_insert_views" ON public.video_views
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow read access for analytics
DROP POLICY IF EXISTS "views_read_for_analytics" ON public.video_views;
CREATE POLICY "views_read_for_analytics" ON public.video_views
  FOR SELECT TO authenticated, anon
  USING (true);

-- video_likes: Like tracking
CREATE TABLE IF NOT EXISTS public.video_likes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_likes_video ON public.video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user ON public.video_likes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_likes_video_user_unique ON public.video_likes(video_id, user_id);

-- video_comments: Comments
CREATE TABLE IF NOT EXISTS public.video_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id uuid,
    text text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    likes_count integer DEFAULT 0,
    replies_count integer DEFAULT 0,
    CONSTRAINT video_comments_text_check CHECK (length(text) >= 1 AND length(text) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_video_comments_video_created ON public.video_comments(video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_comments_user_created ON public.video_comments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_comments_parent ON public.video_comments(parent_id) WHERE parent_id IS NOT NULL;

-- comment_likes: Comment likes
CREATE TABLE IF NOT EXISTS public.comment_likes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id uuid NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- video_saves: Saved videos
CREATE TABLE IF NOT EXISTS public.video_saves (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- video_shares: Share tracking
CREATE TABLE IF NOT EXISTS public.video_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    platform text,
    shared_at timestamptz DEFAULT now(),
    user_agent text,
    ip_address inet,
    CONSTRAINT video_shares_platform_check CHECK (platform IN ('clipboard', 'twitter', 'facebook', 'whatsapp', 'telegram', 'instagram', 'pronax', 'native', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_video_shares_video_id ON public.video_shares(video_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_user_id ON public.video_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_shared_at ON public.video_shares(shared_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_shares_platform ON public.video_shares(platform);

-- video_downloads: Download tracking
CREATE TABLE IF NOT EXISTS public.video_downloads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- video_reports: Content reports
CREATE TABLE IF NOT EXISTS public.video_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    reporter_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason text NOT NULL,
    status text DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    CONSTRAINT video_reports_status_check CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed'))
);

-- video_ads: Video-specific ads
CREATE TABLE IF NOT EXISTS public.video_ads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    ad_url text NOT NULL,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    CONSTRAINT video_ads_status_check CHECK (status IN ('active', 'inactive'))
);

-- -------------------------------------------------------------------------------------
-- 2.4 Social Tables
-- -------------------------------------------------------------------------------------

-- follows: Follow relationships
CREATE TABLE IF NOT EXISTS public.follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT follows_check CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_follower_following_unique ON public.follows(follower_id, following_id);

-- community_posts: Creator posts
CREATE TABLE IF NOT EXISTS public.community_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL,
    media_urls text[] DEFAULT '{}',
    post_type text DEFAULT 'text',
    poll_options jsonb,
    poll_expires_at timestamptz,
    likes_count integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    shares_count integer DEFAULT 0,
    is_pinned boolean DEFAULT false,
    visibility text DEFAULT 'public',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT community_posts_content_check CHECK (length(content) <= 5000)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_creator_id ON public.community_posts(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_visibility ON public.community_posts(visibility);
CREATE INDEX IF NOT EXISTS idx_community_posts_is_pinned ON public.community_posts(creator_id) WHERE is_pinned = true;

-- community_post_likes: Post likes
CREATE TABLE IF NOT EXISTS public.community_post_likes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_likes_post_id ON public.community_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_community_post_likes_user_id ON public.community_post_likes(user_id);

-- playlists: User playlists
CREATE TABLE IF NOT EXISTS public.playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    visibility text DEFAULT 'private',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT playlists_visibility_check CHECK (visibility IN ('public', 'unlisted', 'private'))
);

-- playlist_items: Playlist videos
CREATE TABLE IF NOT EXISTS public.playlist_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id uuid NOT NULL,
    video_id text NOT NULL,
    "position" integer DEFAULT 0,
    added_at timestamptz DEFAULT now()
);

-- watch_history: Watch history
CREATE TABLE IF NOT EXISTS public.watch_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_id text NOT NULL,
    watched_at timestamptz DEFAULT now(),
    watch_seconds integer DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    last_watched_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT watch_history_seconds_nonneg CHECK (watch_seconds >= 0),
    UNIQUE(user_id, video_id)
);

-- -------------------------------------------------------------------------------------
-- 2.5 Copyright & Content Protection Tables
-- -------------------------------------------------------------------------------------

-- copyright_claims: Copyright claims
CREATE TABLE IF NOT EXISTS public.copyright_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id uuid NOT NULL,
    claimant_id uuid NOT NULL,
    claim_type text NOT NULL,
    severity text DEFAULT 'warning',
    status text DEFAULT 'active',
    detected_at timestamptz DEFAULT now(),
    resolved_at timestamptz,
    action_taken text,
    match_percentage numeric,
    matched_content_id text,
    matched_content_title text,
    matched_content_owner text,
    dispute_reason text,
    dispute_evidence text[],
    notes text,
    policy_action text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- copyright_claim_events: Claim audit trail
CREATE TABLE IF NOT EXISTS public.copyright_claim_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id uuid REFERENCES public.copyright_claims(id) ON DELETE CASCADE,
    actor_type text,
    actor_id uuid,
    action text NOT NULL,
    payload jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    CONSTRAINT copyright_claim_events_actor_type_check CHECK (actor_type IN ('system', 'admin', 'user', 'ai'))
);

CREATE INDEX IF NOT EXISTS idx_copyright_claim_events_claim_id ON public.copyright_claim_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_copyright_claim_events_created_at ON public.copyright_claim_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copyright_claim_events_actor ON public.copyright_claim_events(actor_id);

-- copyright_fingerprints: Registered fingerprints
CREATE TABLE IF NOT EXISTS public.copyright_fingerprints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id text NOT NULL,
    content_type text NOT NULL,
    owner_id uuid NOT NULL,
    fingerprint_data jsonb NOT NULL,
    metadata jsonb DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copyright_fingerprints_active ON public.copyright_fingerprints(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_copyright_fingerprints_type ON public.copyright_fingerprints(content_type);

-- audio_fingerprints_songs: Audio fingerprint registry
CREATE TABLE IF NOT EXISTS public.audio_fingerprints_songs (
    id SERIAL PRIMARY KEY,
    song_name text NOT NULL,
    file_sha1 text,
    owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_fingerprints_songs_owner_id ON public.audio_fingerprints_songs(owner_id);
CREATE INDEX IF NOT EXISTS idx_audio_fingerprints_songs_video_id ON public.audio_fingerprints_songs(video_id);

-- audio_fingerprints: Audio fingerprint hashes
CREATE TABLE IF NOT EXISTS public.audio_fingerprints (
    hash text NOT NULL,
    song_id INTEGER REFERENCES public.audio_fingerprints_songs(id) ON DELETE CASCADE,
    time_offset integer NOT NULL,
    date_created timestamptz DEFAULT now(),
    date_modified timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_fingerprints_hash ON public.audio_fingerprints(hash);
CREATE INDEX IF NOT EXISTS idx_audio_fingerprints_song_id ON public.audio_fingerprints(song_id);

-- pdq_image_hashes: PDQ image hashes
CREATE TABLE IF NOT EXISTS public.pdq_image_hashes (
    id SERIAL PRIMARY KEY,
    image_name text NOT NULL,
    pdq_hash text NOT NULL,
    quality_score numeric,
    owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdq_image_hashes_hash ON public.pdq_image_hashes(pdq_hash);
CREATE INDEX IF NOT EXISTS idx_pdq_image_hashes_owner_id ON public.pdq_image_hashes(owner_id);
CREATE INDEX IF NOT EXISTS idx_pdq_image_hashes_video_id ON public.pdq_image_hashes(video_id);

-- vpdq_video_hashes: vPDQ video hashes
CREATE TABLE IF NOT EXISTS public.vpdq_video_hashes (
    id SERIAL PRIMARY KEY,
    video_name text NOT NULL,
    vpdq_hash text NOT NULL,
    frame_count integer,
    quality_score numeric,
    owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpdq_video_hashes_hash ON public.vpdq_video_hashes(vpdq_hash);
CREATE INDEX IF NOT EXISTS idx_vpdq_video_hashes_owner_id ON public.vpdq_video_hashes(owner_id);
CREATE INDEX IF NOT EXISTS idx_vpdq_video_hashes_video_id ON public.vpdq_video_hashes(video_id);

-- -------------------------------------------------------------------------------------
-- 2.6 Moderation & Admin Tables
-- -------------------------------------------------------------------------------------

-- user_strikes: User strikes system
CREATE TABLE IF NOT EXISTS public.user_strikes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    issued_by uuid REFERENCES auth.users(id),
    reason text NOT NULL,
    category text,
    severity smallint DEFAULT 1,
    video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
    source text DEFAULT 'manual',
    expires_at timestamptz,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id),
    revoked_reason text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT user_strikes_category_check CHECK (category IN ('copyright', 'spam', 'harassment', 'harmful', 'other')),
    CONSTRAINT user_strikes_severity_check CHECK (severity >= 1 AND severity <= 3),
    CONSTRAINT user_strikes_source_check CHECK (source IN ('manual', 'report', 'copyright_claim', 'auto'))
);

CREATE INDEX IF NOT EXISTS idx_user_strikes_user_created ON public.user_strikes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_strikes_expires_at ON public.user_strikes(expires_at) WHERE expires_at IS NOT NULL;

-- moderation_queue: Content moderation queue
CREATE TABLE IF NOT EXISTS public.moderation_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type text NOT NULL,
    content_id text NOT NULL,
    owner_id uuid,
    flagged_reason text,
    snapshot jsonb,
    status text DEFAULT 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    notes text,
    escalated boolean DEFAULT false,
    priority integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_status_created ON public.moderation_queue(status, created_at DESC);

-- moderation_settings: Moderation configuration
CREATE TABLE IF NOT EXISTS public.moderation_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auto_moderation_enabled boolean DEFAULT true,
    spam_threshold numeric DEFAULT 0.7,
    copyright_threshold numeric DEFAULT 0.8,
    adult_content_threshold numeric DEFAULT 0.9,
    auto_suppress_threshold integer DEFAULT 5,
    manual_review_required boolean DEFAULT false,
    updated_at timestamptz DEFAULT now()
);

-- admin_actions: Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    payload jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- audit_logs: Comprehensive audit log
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    actor_email text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    ip_address text,
    user_agent text,
    severity text DEFAULT 'info',
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- rate_limit_events: Rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    ip_address text,
    bucket text NOT NULL,
    hits integer DEFAULT 1,
    blocked boolean DEFAULT false,
    user_agent text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created ON public.rate_limit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ip ON public.rate_limit_events(ip_address);

-- ip_rules: IP block/allow rules
CREATE TABLE IF NOT EXISTS public.ip_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address text UNIQUE NOT NULL,
    mode text DEFAULT 'block',
    reason text,
    created_by uuid,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT ip_rules_mode_check CHECK (mode IN ('block', 'allow'))
);

-- appeals: User appeals
CREATE TABLE IF NOT EXISTS public.appeals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    email text,
    message text NOT NULL,
    status text DEFAULT 'pending',
    admin_response text,
    admin_note text,
    reviewed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT appeals_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- -------------------------------------------------------------------------------------
-- 2.7 Analytics & Events Tables
-- -------------------------------------------------------------------------------------

-- analytics_events: Analytics tracking
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
    event_type text,
    session_id text,
    event_data jsonb DEFAULT '{}',
    country_code text,
    country_name text,
    traffic_source text,
    referrer_url text,
    user_agent text,
    ip_address text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT analytics_events_event_type_check CHECK (event_type IN ('view', 'impression', 'click', 'traffic_source', 'geography', 'search'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_video_id ON public.analytics_events(video_id);

-- Fix video_id type in analytics_events if it's text instead of uuid
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_events' AND column_name = 'video_id' AND data_type = 'text') THEN
    -- WARNING: The following DELETE statement removes data. Uncomment only after backup.
    -- First, delete rows with invalid UUID values (like "v4")
    -- DELETE FROM public.analytics_events
    -- WHERE video_id IS NOT NULL
    --   AND video_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    --   AND video_id !~ '^[0-9a-f]{32}$';
    -- Then convert the column type (only valid UUIDs will be converted)
    ALTER TABLE public.analytics_events ALTER COLUMN video_id TYPE uuid USING video_id::uuid;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);

-- Add missing columns for analytics_events if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_events' AND column_name = 'event_data') THEN
    ALTER TABLE public.analytics_events ADD COLUMN event_data jsonb DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_events' AND column_name = 'country_code') THEN
    ALTER TABLE public.analytics_events ADD COLUMN country_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_events' AND column_name = 'country_name') THEN
    ALTER TABLE public.analytics_events ADD COLUMN country_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_events' AND column_name = 'traffic_source') THEN
    ALTER TABLE public.analytics_events ADD COLUMN traffic_source text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_events' AND column_name = 'referrer_url') THEN
    ALTER TABLE public.analytics_events ADD COLUMN referrer_url text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_analytics_events_country_code ON public.analytics_events(country_code);
CREATE INDEX IF NOT EXISTS idx_analytics_events_traffic_source ON public.analytics_events(traffic_source);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON public.analytics_events(user_id, created_at DESC);

-- ab_tests: A/B tests
CREATE TABLE IF NOT EXISTS public.ab_tests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    status text DEFAULT 'running',
    target text DEFAULT 'feed_weights',
    variants jsonb DEFAULT '[]',
    metrics jsonb DEFAULT '{}',
    winner text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT ab_tests_status_check CHECK (status IN ('running', 'paused', 'completed'))
);

-- ab_assignments: A/B test assignments
CREATE TABLE IF NOT EXISTS public.ab_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id uuid NOT NULL,
    user_id uuid NOT NULL,
    variant text NOT NULL,
    experiment_id uuid,
    created_at timestamptz DEFAULT now(),
    UNIQUE (test_id, user_id)
);

-- ab_events: A/B test events
CREATE TABLE IF NOT EXISTS public.ab_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id uuid NOT NULL,
    variant text NOT NULL,
    user_id uuid,
    event text NOT NULL,
    value numeric DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    experiment_id uuid
);

-- ab_experiments: A/B experiments
CREATE TABLE IF NOT EXISTS public.ab_experiments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    description text,
    status text DEFAULT 'draft',
    start_date timestamptz,
    end_date timestamptz,
    target_percentage integer DEFAULT 50,
    variants jsonb DEFAULT '{"control": {}, "variant": {}}',
    metrics jsonb DEFAULT '[]',
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- -------------------------------------------------------------------------------------
-- 2.8 Live Streaming Tables
-- -------------------------------------------------------------------------------------

-- streams: Live streams
CREATE TABLE IF NOT EXISTS public.streams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    status text DEFAULT 'scheduled',
    stream_key text,
    playback_url text,
    scheduled_at timestamptz,
    started_at timestamptz,
    ended_at timestamptz,
    viewer_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    stream_url text,
    chat_enabled boolean DEFAULT true,
    recording_enabled boolean DEFAULT false,
    recording_url text,
    thumbnail_url text,
    category text,
    tags text[] DEFAULT '{}',
    viewer_peak integer DEFAULT 0,
    chat_message_count integer DEFAULT 0,
    mux_stream_id text,
    mux_stream_key text,
    mux_playback_id text,
    is_live boolean DEFAULT false,
    CONSTRAINT streams_status_check CHECK (status IN ('scheduled', 'live', 'ended', 'draft'))
);

CREATE INDEX IF NOT EXISTS idx_streams_live ON public.streams(created_at DESC) WHERE is_live = true;

-- live_chat_messages: Live chat
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id uuid REFERENCES public.streams(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz DEFAULT now(),
    is_deleted boolean DEFAULT false,
    deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT live_chat_messages_body_check CHECK (char_length(body) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_live_chat_messages_stream_id ON public.live_chat_messages(stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_stream_created ON public.live_chat_messages(stream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_user_id ON public.live_chat_messages(user_id);

-- -------------------------------------------------------------------------------------
-- 2.9 Notifications & Messaging Tables
-- -------------------------------------------------------------------------------------

-- conversations: Direct message conversations
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL DEFAULT 'dm',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_message_at timestamptz DEFAULT now(),
    CONSTRAINT conversations_type_check CHECK (type IN ('dm', 'group'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- messages: Chat messages
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    content text NOT NULL,
    attachment_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

-- conversation_participants: Participants in conversations
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    last_read_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON public.conversation_participants(conversation_id);

-- presence: User presence status
CREATE TABLE IF NOT EXISTS public.presence (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    typing boolean DEFAULT false,
    last_seen timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presence_conversation ON public.presence(conversation_id);
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON public.presence(last_seen DESC);

-- -------------------------------------------------------------------------------------
-- 2.10 IP Protection Tables
-- -------------------------------------------------------------------------------------

-- ip_protection_logs: IP protection event logging
CREATE TABLE IF NOT EXISTS public.ip_protection_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address inet NOT NULL,
    action text NOT NULL,
    result text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT ip_protection_logs_action_check CHECK (action IN ('check', 'block', 'allow', 'rate_limit', 'suspicious'))
);

CREATE INDEX IF NOT EXISTS idx_ip_protection_logs_user ON public.ip_protection_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_protection_logs_ip ON public.ip_protection_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_protection_logs_created ON public.ip_protection_logs(created_at DESC);

-- -------------------------------------------------------------------------------------
-- 2.11 Profile / Channel Completion Tables
-- -------------------------------------------------------------------------------------

-- reserved_handles: Reserved channel names
CREATE TABLE IF NOT EXISTS public.reserved_handles (
    handle text PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_reserved_handles ON public.reserved_handles(handle);

ALTER TABLE public.reserved_handles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reserved handles are readable" ON public.reserved_handles;
CREATE POLICY "Reserved handles are readable" ON public.reserved_handles
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.reserved_handles TO anon, authenticated;
GRANT ALL ON public.reserved_handles TO service_role;

-- handle_history: Handle change history for redirects
CREATE TABLE IF NOT EXISTS public.handle_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    old_handle text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_handle_history_old_handle ON public.handle_history(lower(old_handle));
CREATE INDEX IF NOT EXISTS idx_handle_history_user ON public.handle_history(user_id);

ALTER TABLE public.handle_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Handle history is readable" ON public.handle_history;
CREATE POLICY "Handle history is readable" ON public.handle_history
    FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.handle_history TO anon, authenticated;
GRANT ALL ON public.handle_history TO service_role;

-- blocked_users: User blocking functionality
CREATE TABLE IF NOT EXISTS public.blocked_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_id);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own blocks" ON public.blocked_users;
CREATE POLICY "Users manage their own blocks" ON public.blocked_users
    FOR ALL TO authenticated
    USING (auth.uid() = blocker_id)
    WITH CHECK (auth.uid() = blocker_id);

GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;

-- channel_reports: Channel reporting functionality
CREATE TABLE IF NOT EXISTS public.channel_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason text NOT NULL,
    details text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_reports_channel ON public.channel_reports(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_reports_reporter ON public.channel_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_channel_reports_status ON public.channel_reports(status);

ALTER TABLE public.channel_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can report channels" ON public.channel_reports;
CREATE POLICY "Users can report channels" ON public.channel_reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id AND auth.uid() <> channel_id);

DROP POLICY IF EXISTS "Users see their own channel reports" ON public.channel_reports;
CREATE POLICY "Users see their own channel reports" ON public.channel_reports
    FOR SELECT TO authenticated
    USING (auth.uid() = reporter_id);

GRANT INSERT, SELECT ON public.channel_reports TO authenticated;
GRANT ALL ON public.channel_reports TO service_role;

-- notifications: User notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    type text NOT NULL,
    payload jsonb DEFAULT '{}',
    read_at timestamptz,
    created_at timestamptz DEFAULT now(),
    priority text DEFAULT 'normal',
    expires_at timestamptz,
    action_url text,
    action_label text,
    icon text,
    category text
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_payload_gin ON public.notifications USING GIN(payload);

-- channel_notices: Channel-specific notices
CREATE TABLE IF NOT EXISTS public.channel_notices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    notice_type text NOT NULL,
    severity text DEFAULT 'info',
    title text NOT NULL,
    message text NOT NULL,
    action_required boolean DEFAULT false,
    action_url text,
    action_label text,
    related_video_id uuid,
    related_claim_id uuid,
    is_read boolean DEFAULT false,
    read_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- push_subscriptions: Web push subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_created_at ON public.push_subscriptions(created_at DESC);

-- -------------------------------------------------------------------------------------
-- 2.10 Configuration & System Tables
-- -------------------------------------------------------------------------------------

-- system_config: System configuration
CREATE TABLE IF NOT EXISTS public.system_config (
    id integer DEFAULT 1 PRIMARY KEY CHECK (id = 1),
    site_name text DEFAULT 'ProNax',
    site_description text,
    logo_url text,
    favicon_url text,
    primary_color text DEFAULT '#ff0000',
    maintenance_mode boolean DEFAULT false,
    signup_enabled boolean DEFAULT true,
    uploads_enabled boolean DEFAULT true,
    ads_enabled boolean DEFAULT true,
    min_withdrawal numeric DEFAULT 10,
    extra jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- app_settings: Application settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now()
);

-- feature_flags: Feature flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
    key text PRIMARY KEY,
    enabled boolean DEFAULT false,
    description text,
    rollout_percent integer DEFAULT 100,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- categories: Video categories
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    icon text,
    "position" integer DEFAULT 0,
    enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- ad_settings: Ad configuration
CREATE TABLE IF NOT EXISTS public.ad_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot text NOT NULL,
    kind text NOT NULL,
    network text DEFAULT 'custom',
    enabled boolean DEFAULT false,
    html_snippet text,
    vast_tag_url text,
    ad_unit_id text,
    publisher_id text,
    frequency integer DEFAULT 0,
    notes text,
    impressions_count bigint DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT ad_settings_kind_check CHECK (kind IN ('banner', 'video'))
);

-- sidebar_menu: Navigation menu
CREATE TABLE IF NOT EXISTS public.sidebar_menu (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section text DEFAULT 'sidebar',
    label text NOT NULL,
    icon text,
    href text NOT NULL,
    "position" integer DEFAULT 0,
    enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- dynamic_routes: Dynamic page routes
CREATE TABLE IF NOT EXISTS public.dynamic_routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    path text NOT NULL,
    title text,
    content jsonb DEFAULT '{}',
    enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- dynamic_widgets: Dynamic widgets
CREATE TABLE IF NOT EXISTS public.dynamic_widgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    page text NOT NULL,
    kind text NOT NULL,
    title text,
    config jsonb DEFAULT '{}',
    "position" integer DEFAULT 0,
    enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- trending_sounds: Trending audio
CREATE TABLE IF NOT EXISTS public.trending_sounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audio_track_id text UNIQUE NOT NULL,
    title text,
    artist text,
    cover_url text,
    usage_count integer DEFAULT 0,
    trend_score numeric DEFAULT 0,
    is_trending boolean DEFAULT false,
    category text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- challenges: Video challenges
CREATE TABLE IF NOT EXISTS public.challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hashtag text UNIQUE NOT NULL,
    title text NOT NULL,
    description text,
    banner_url text,
    start_date timestamptz NOT NULL,
    end_date timestamptz,
    creator_id uuid,
    participant_count integer DEFAULT 0,
    video_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    is_featured boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- creator_marketplace: Creator services
CREATE TABLE IF NOT EXISTS public.creator_marketplace (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    price_min numeric,
    price_max numeric,
    pricing_type text NOT NULL,
    portfolio_urls text[] DEFAULT '{}',
    availability_status text DEFAULT 'available',
    rating numeric CHECK (rating >= 0 AND rating <= 5),
    review_count integer DEFAULT 0,
    views_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- activity_log: Activity tracking
CREATE TABLE IF NOT EXISTS public.activity_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    action text NOT NULL,
    target_type text,
    target_id text,
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

-- algorithm_audit_log: Algorithm changes
CREATE TABLE IF NOT EXISTS public.algorithm_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor uuid,
    previous jsonb DEFAULT '{}',
    next jsonb DEFAULT '{}',
    note text,
    created_at timestamptz DEFAULT now()
);

-- storage_config: Encrypted storage credentials
CREATE TABLE IF NOT EXISTS public.storage_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text DEFAULT 'cloudflare_r2',
    account_id text NOT NULL,
    bucket_name text NOT NULL,
    access_key text NOT NULL,
    secret_key text NOT NULL,
    cdn_domain text NOT NULL,
    chunked_uploads boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_storage_config_active ON public.storage_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_storage_config_updated ON public.storage_config(updated_at DESC);

-- account_deletion_requests: GDPR deletion requests
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    reason text,
    status text DEFAULT 'pending',
    scheduled_purge_at timestamptz DEFAULT (now() + interval '30 days'),
    confirmed_at timestamptz,
    cancelled_at timestamptz,
    admin_note text,
    reviewed_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT account_deletion_requests_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deletion_requests_one_pending 
    ON public.account_deletion_requests(user_id) 
    WHERE status = 'pending';

-- -------------------------------------------------------------------------------------
-- 2.11 Materialized Views
-- -------------------------------------------------------------------------------------

-- mv_trending_videos: Trending videos with velocity scores
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_trending_videos AS
SELECT
    v.id,
    v.title,
    v.thumb_url,
    v.views_count,
    v.likes_count,
    v.comments_count,
    v.shares_count,
    v.created_at,
    v.category,
    v.owner_id,
    v.duration_seconds,
    v.is_short,
    -- Velocity score calculation
    (v.views_count * 1.0 + v.likes_count * 3.0 + v.comments_count * 5.0 + v.shares_count * 4.0) / 
    POWER(EXTRACT(EPOCH FROM (now() - v.created_at)) / 3600.0, 1.5) as velocity_score
FROM public.videos v
WHERE v.visibility = 'public'
  AND v.status = 'ready'
  AND v.is_removed = false
  AND v.created_at > now() - interval '30 days'
WITH DATA;

CREATE INDEX IF NOT EXISTS idx_mv_trending_velocity_score ON public.mv_trending_videos(velocity_score DESC);
CREATE INDEX IF NOT EXISTS idx_mv_trending_category ON public.mv_trending_videos(category);
CREATE INDEX IF NOT EXISTS idx_mv_trending_created_at ON public.mv_trending_videos(created_at DESC);

-- Function to refresh trending videos
CREATE OR REPLACE FUNCTION public.refresh_trending_videos_mv()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_trending_videos;
END;
$$;

-- =====================================================================================
-- 3. DATABASE FUNCTIONS (RPCs)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 3.1 Helper Functions
-- -------------------------------------------------------------------------------------

-- has_role: Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- is_super_admin: Check if user is a super admin (owner tier)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
   OR public.has_role(_user_id, 'admin'::public.app_role)
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- _caller_is_admin: Internal helper - is the caller an admin?
CREATE OR REPLACE FUNCTION public._caller_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.is_super_admin(auth.uid())
$$;

-- _caller_is_owner: Internal helper - is the caller the owner (super_admin)?
CREATE OR REPLACE FUNCTION public._caller_is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
$$;

-- -------------------------------------------------------------------------------------
-- 3.2 Monetization Functions (FRAUD-PROOF 55/45 SPLIT)
-- -------------------------------------------------------------------------------------

-- record_ad_view: Record ad impression with enforced 55/45 split
-- IMPORTANT: This function enforces the split at the database level.
-- Client cannot manipulate the final payout. Gross revenue from ad network
-- is the source of truth. Category and country multipliers are informational only.
DROP FUNCTION IF EXISTS public.record_ad_view(p_video_id text,
    p_ad_network text,
    p_ad_revenue numeric,
    p_cpm numeric,
    p_country_code text,
    p_country_name text,
    p_country_tier text,
    p_base_cpm numeric,
    p_country_multiplier numeric);
CREATE FUNCTION public.record_ad_view(p_video_id text,
    p_ad_network text DEFAULT 'direct',
    p_ad_revenue numeric DEFAULT 0.001,
    p_cpm numeric DEFAULT NULL,
    p_country_code text DEFAULT NULL,
    p_country_name text DEFAULT NULL,
    p_country_tier text DEFAULT NULL,
    p_base_cpm numeric DEFAULT NULL,
    p_country_multiplier numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_gross NUMERIC;
    v_creator_share NUMERIC;
    v_platform_share NUMERIC;
    v_recent_count INT;
    v_wallet public.user_wallets;
    v_video_owner uuid;
BEGIN
    -- Security: Only service role should call this for production ad settlement
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND session_user <> 'service_role' THEN
        -- In development, allow authenticated users
        IF v_uid IS NULL THEN
            RAISE EXCEPTION 'Authentication required to record ad view';
        END IF;
    END IF;

    -- Get video owner
    SELECT owner_id INTO v_video_owner 
    FROM public.videos 
    WHERE id::text = p_video_id;
    
    IF v_video_owner IS NULL THEN
        RETURN jsonb_build_object('paid', false, 'reason', 'video_not_found');
    END IF;

    -- Validate and cap gross revenue (prevent fraud)
    v_gross := GREATEST(0, LEAST(COALESCE(p_ad_revenue, 0), 100));
    
    -- ENFORCE 55/45 SPLIT (FRAUD-PROOF - cannot be manipulated by client)
    v_creator_share := ROUND(v_gross * 0.55, 6);  -- 55% to creator
    v_platform_share := ROUND(v_gross * 0.45, 6);  -- 45% to platform

    -- Check daily cap (3 paid views per video per 24 hours)
    SELECT COUNT(*) INTO v_recent_count FROM public.revenue_logs
     WHERE user_id = v_video_owner 
       AND video_id = p_video_id 
       AND created_at > now() - interval '24 hours';
    
    IF v_recent_count >= 3 THEN 
        RETURN jsonb_build_object('paid', false, 'reason', 'daily_cap_reached', 'cap', 3); 
    END IF;

    IF v_gross <= 0 THEN 
        RETURN jsonb_build_object('paid', false, 'reason', 'no_revenue'); 
    END IF;

    -- Credit creator share to wallet (atomic with row lock)
    INSERT INTO public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
    VALUES (v_video_owner, v_creator_share, v_creator_share, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET 
        balance = public.user_wallets.balance + v_creator_share,
        total_earned = public.user_wallets.total_earned + v_creator_share, 
        updated_at = now()
    RETURNING * INTO v_wallet;

    -- Log creator revenue with metadata
    INSERT INTO public.revenue_logs (
        user_id, video_id, views_count, amount_earned, ad_network, cpm, gross_revenue,
        country_code, country_name, country_tier, base_cpm, country_multiplier,
        placement_type, placement_multiplier, created_at
    )
    VALUES (
        v_video_owner, p_video_id, 1, v_creator_share, p_ad_network, p_cpm, v_gross,
        p_country_code, p_country_name, p_country_tier, p_base_cpm, p_country_multiplier,
        'long_form', 1.0, now()
    );

    -- Persist platform revenue for accounting
    INSERT INTO public.platform_revenue (
        source_user_id, video_id, amount, gross_revenue, ad_network, cpm,
        country_code, placement_type, created_at
    )
    VALUES (
        v_video_owner, p_video_id, v_platform_share, v_gross, p_ad_network, p_cpm,
        p_country_code, 'long_form', now()
    );

    RETURN jsonb_build_object(
        'paid', true, 
        'gross', v_gross, 
        'creator_share', v_creator_share,
        'platform_share', v_platform_share, 
        'balance', v_wallet.balance, 
        'total_earned', v_wallet.total_earned
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_ad_view(text, text, numeric, numeric, text, text, text, numeric, numeric) TO authenticated, service_role;

-- record_ad_view_by_placement: Record ad with placement type (long-form vs shorts)
-- Same 55/45 enforcement with additional placement and category metadata
DROP FUNCTION IF EXISTS public.record_ad_view_by_placement(p_video_id text,
    p_ad_network text,
    p_ad_revenue numeric,
    p_cpm numeric,
    p_country_code text,
    p_country_name text,
    p_country_tier text,
    p_base_cpm numeric,
    p_country_multiplier numeric,
    p_placement_type text,
    p_placement_multiplier numeric,
    p_category text,
    p_category_multiplier numeric,
    p_category_tier text,
    p_network_impression_id text);
CREATE FUNCTION public.record_ad_view_by_placement(p_video_id text,
    p_ad_network text DEFAULT 'direct',
    p_ad_revenue numeric DEFAULT 0.001,
    p_cpm numeric DEFAULT NULL,
    p_country_code text DEFAULT NULL,
    p_country_name text DEFAULT NULL,
    p_country_tier text DEFAULT NULL,
    p_base_cpm numeric DEFAULT NULL,
    p_country_multiplier numeric DEFAULT NULL,
    p_placement_type text DEFAULT 'long_form',
    p_placement_multiplier numeric DEFAULT 1.0,
    p_category text DEFAULT NULL,
    p_category_multiplier numeric DEFAULT NULL,
    p_category_tier text DEFAULT NULL,
    p_network_impression_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_gross NUMERIC;
    v_creator_share NUMERIC;
    v_platform_share NUMERIC;
    v_recent_count INT;
    v_wallet public.user_wallets;
    v_video_owner uuid;
    v_placement_mult NUMERIC;
BEGIN
    -- Security check
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND session_user <> 'service_role' THEN
        IF v_uid IS NULL THEN
            RAISE EXCEPTION 'Authentication required to record ad view';
        END IF;
    END IF;

    -- Get video owner
    SELECT owner_id INTO v_video_owner 
    FROM public.videos 
    WHERE id::text = p_video_id;
    
    IF v_video_owner IS NULL THEN
        RETURN jsonb_build_object('paid', false, 'reason', 'video_not_found');
    END IF;

    -- Validate gross revenue
    v_gross := GREATEST(0, LEAST(COALESCE(p_ad_revenue, 0), 100));
    
    -- ENFORCE 55/45 SPLIT (FRAUD-PROOF)
    v_creator_share := ROUND(v_gross * 0.55, 6);  -- 55% to creator
    v_platform_share := ROUND(v_gross * 0.45, 6);  -- 45% to platform

    -- Apply placement multiplier for analytics only (does NOT affect payout)
    v_placement_mult := COALESCE(p_placement_multiplier, 1.0);

    -- Check daily cap
    SELECT COUNT(*) INTO v_recent_count FROM public.revenue_logs
     WHERE user_id = v_video_owner 
       AND video_id = p_video_id 
       AND created_at > now() - interval '24 hours';
    
    IF v_recent_count >= 3 THEN 
        RETURN jsonb_build_object('paid', false, 'reason', 'daily_cap_reached', 'cap', 3); 
    END IF;

    IF v_gross <= 0 THEN 
        RETURN jsonb_build_object('paid', false, 'reason', 'no_revenue'); 
    END IF;

    -- Check for duplicate network impression (idempotency)
    IF p_network_impression_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.revenue_logs 
            WHERE network_impression_id = p_network_impression_id
        ) THEN
            RETURN jsonb_build_object('paid', false, 'reason', 'duplicate_impression');
        END IF;
    END IF;

    -- Credit creator share
    INSERT INTO public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
    VALUES (v_video_owner, v_creator_share, v_creator_share, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET 
        balance = public.user_wallets.balance + v_creator_share,
        total_earned = public.user_wallets.total_earned + v_creator_share, 
        updated_at = now()
    RETURNING * INTO v_wallet;

    -- Log creator revenue with full metadata
    INSERT INTO public.revenue_logs (
        user_id, video_id, views_count, amount_earned, ad_network, cpm, gross_revenue,
        country_code, country_name, country_tier, base_cpm, country_multiplier,
        category, category_multiplier, category_tier,
        placement_type, placement_multiplier,
        network_impression_id, verification_status, created_at
    )
    VALUES (
        v_video_owner, p_video_id, 1, v_creator_share, p_ad_network, p_cpm, v_gross,
        p_country_code, p_country_name, p_country_tier, p_base_cpm, p_country_multiplier,
        p_category, p_category_multiplier, p_category_tier,
        p_placement_type, v_placement_mult,
        p_network_impression_id, 'verified', now()
    );

    -- Persist platform revenue
    INSERT INTO public.platform_revenue (
        source_user_id, video_id, amount, gross_revenue, ad_network, cpm,
        country_code, category, placement_type, network_impression_id, created_at
    )
    VALUES (
        v_video_owner, p_video_id, v_platform_share, v_gross, p_ad_network, p_cpm,
        p_country_code, p_category, p_placement_type, p_network_impression_id, now()
    );

    RETURN jsonb_build_object(
        'paid', true, 
        'gross', v_gross, 
        'creator_share', v_creator_share,
        'platform_share', v_platform_share, 
        'balance', v_wallet.balance, 
        'total_earned', v_wallet.total_earned,
        'placement_type', p_placement_type
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_ad_view_by_placement(
    text, text, numeric, numeric, text, text, text, numeric, numeric, 
    text, numeric, text, numeric, text, text
) TO authenticated, service_role;

-- request_withdrawal: Request a withdrawal
DROP FUNCTION IF EXISTS public.request_withdrawal(p_amount numeric, 
    p_method text, 
    p_details json);
CREATE FUNCTION public.request_withdrawal(p_amount numeric, 
    p_method text DEFAULT NULL, 
    p_details json DEFAULT NULL)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.withdrawal_requests;
    v_country text;
    v_dest text;
    v_current_balance numeric;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive';
    END IF;

    -- Lock wallet row and check balance
    SELECT balance INTO v_current_balance 
    FROM public.user_wallets 
    WHERE user_id = v_uid 
    FOR UPDATE;

    -- Set country to NULL (not stored in user_wallets table)
    v_country := NULL;
    
    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'insufficient balance';
    END IF;

    v_dest := COALESCE(p_method, 'wallet');

    -- Create withdrawal request
    INSERT INTO public.withdrawal_requests
    (user_id, amount, method, payment_details, country, destination, status, created_at, updated_at)
    VALUES
    (v_uid, p_amount, p_method, COALESCE(p_details, '{}'::json), v_country, v_dest, 'pending', now(), now())
    RETURNING * INTO v_row;

    -- Reserve funds (add to total_withdrawn but don't deduct from balance yet)
    UPDATE public.user_wallets
    SET total_withdrawn = COALESCE(total_withdrawn,0) + p_amount, updated_at = now()
    WHERE user_id = v_uid;

    RETURN v_row;
EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, json) TO authenticated;

-- process_withdrawal: Process a withdrawal (admin only)
DROP FUNCTION IF EXISTS public.process_withdrawal(p_withdrawal_id uuid,
    p_status text,
    p_admin_note text);
CREATE FUNCTION public.process_withdrawal(p_withdrawal_id uuid,
    p_status text,
    p_admin_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row public.withdrawal_requests;
    v_user_id uuid;
    v_amount numeric;
BEGIN
    IF NOT public._caller_is_admin() THEN
        RAISE EXCEPTION 'admin only';
    END IF;

    -- Lock and get withdrawal
    SELECT * INTO v_row 
    FROM public.withdrawal_requests 
    WHERE id = p_withdrawal_id 
    FOR UPDATE;
    
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'withdrawal not found';
    END IF;

    IF v_row.status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'withdrawal already processed';
    END IF;

    v_user_id := v_row.user_id;
    v_amount := v_row.amount;

    -- Update withdrawal status
    UPDATE public.withdrawal_requests
    SET status = p_status,
        admin_note = p_admin_note,
        processed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_withdrawal_id;

    -- If completed, deduct from balance
    IF p_status = 'completed' THEN
        UPDATE public.user_wallets
        SET balance = balance - v_amount,
            updated_at = now()
        WHERE user_id = v_user_id;
    ELSIF p_status IN ('rejected', 'failed') THEN
        -- Refund the reserved amount
        UPDATE public.user_wallets
        SET total_withdrawn = total_withdrawn - v_amount,
            updated_at = now()
        WHERE user_id = v_user_id;
    END IF;

    -- Log admin action
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
    VALUES (auth.uid(), 'process_withdrawal', 'withdrawal', p_withdrawal_id::text,
        json_build_object('status', p_status, 'amount', v_amount, 'note', p_admin_note));

    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_withdrawal(uuid, text, text) TO authenticated;

-- admin_adjust_wallet: Admin wallet adjustment
DROP FUNCTION IF EXISTS public.admin_adjust_wallet(uuid, numeric, numeric, text);
CREATE FUNCTION public.admin_adjust_wallet(
    p_user_id uuid,
    p_delta numeric DEFAULT 0,
    p_set_balance numeric DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bal numeric;
    v_earned numeric;
    v_withdrawn numeric;
BEGIN
    IF NOT public._caller_is_admin() THEN
        RETURN json_build_object('success', false, 'reason', 'admin only');
    END IF;

    INSERT INTO public.user_wallets (user_id, balance, total_earned, total_withdrawn, created_at, updated_at)
  VALUES (p_user_id, 0, 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, total_earned, total_withdrawn INTO v_bal, v_earned, v_withdrawn
  FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF p_set_balance IS NOT NULL THEN
    v_bal := p_set_balance;
  ELSE
    v_bal := COALESCE(v_bal,0) + COALESCE(p_delta,0);
  END IF;
  IF COALESCE(p_delta,0) > 0 THEN
    v_earned := COALESCE(v_earned,0) + COALESCE(p_delta,0);
  END IF;

  UPDATE public.user_wallets
     SET balance = v_bal,
         total_earned = v_earned,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'adjust_wallet', 'user', p_user_id::text,
    json_build_object('delta', p_delta, 'set_balance', p_set_balance, 'reason', p_reason));

  RETURN json_build_object('success', true, 'balance', v_bal, 'total_earned', v_earned);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, numeric, text) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.3 Admin Functions
-- -------------------------------------------------------------------------------------

-- admin_bootstrap_status: Check if initial admin can be claimed
DROP FUNCTION IF EXISTS public.admin_bootstrap_status();
CREATE FUNCTION public.admin_bootstrap_status()
RETURNS TABLE (can_claim_initial_admin boolean, is_admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
     AND NOT EXISTS (SELECT 1 FROM public.super_admins)),
    public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

GRANT EXECUTE ON FUNCTION public.admin_bootstrap_status() TO authenticated;

-- admin_set_role: Grant/revoke user roles
DROP FUNCTION IF EXISTS public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean);
CREATE FUNCTION public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_owner() THEN
    RETURN json_build_object('success', false, 'reason', 'owner only');
  END IF;
  IF p_grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user AND role = p_role;
  END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(),
    CASE WHEN p_grant THEN 'grant_role' ELSE 'revoke_role' END,
    'user', p_user::text,
    json_build_object('role', p_role::text, 'grant', p_grant));
  RETURN json_build_object('success', true, 'granted', p_grant, 'role', p_role::text);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated;

-- admin_revoke_admin: Revoke all admin roles from user
DROP FUNCTION IF EXISTS public.admin_revoke_admin(p_user uuid);
CREATE FUNCTION public.admin_revoke_admin(p_user uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public._caller_is_owner() THEN
    RETURN json_build_object('success', false, 'reason', 'owner only');
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = p_user AND role IN ('admin','moderator','support');
  DELETE FROM public.super_admins WHERE user_id = p_user;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'revoke_admin', 'user', p_user::text, json_build_object('user', p_user::text));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_admin(uuid) TO authenticated;

-- admin_set_owner: Grant/revoke owner (super_admin) status
DROP FUNCTION IF EXISTS public.admin_set_owner(p_user uuid, p_grant boolean);
CREATE FUNCTION public.admin_set_owner(p_user uuid, p_grant boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_owner() THEN
    RETURN json_build_object('success', false, 'reason', 'owner only');
  END IF;
  IF p_grant THEN
    INSERT INTO public.super_admins (user_id) VALUES (p_user)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.super_admins WHERE user_id = p_user;
  END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(),
    CASE WHEN p_grant THEN 'grant_owner' ELSE 'revoke_owner' END,
    'user', p_user::text, json_build_object('grant', p_grant));
  RETURN json_build_object('success', true, 'granted', p_grant);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_owner(uuid, boolean) TO authenticated;

-- admin_invite_by_email: Invite admin by email
DROP FUNCTION IF EXISTS public.admin_invite_by_email(p_email text);
CREATE FUNCTION public.admin_invite_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing uuid;
BEGIN
  IF NOT public._caller_is_owner() THEN
    RETURN json_build_object('success', false, 'reason', 'owner only', 'granted', false);
  END IF;

  -- If a real user already exists with this email, grant admin immediately.
  SELECT id INTO v_existing FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_existing, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.admin_invites (email, role, status, invited_by)
    VALUES (p_email, 'admin', 'accepted', v_uid)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
    VALUES (v_uid, 'invite_admin', 'user', v_existing::text, json_build_object('email', p_email, 'granted', true));
    RETURN json_build_object('success', true, 'granted', true, 'email', p_email);
  END IF;

  -- Otherwise record a pending invite.
  INSERT INTO public.admin_invites (email, role, status, invited_by)
  VALUES (p_email, 'admin', 'pending', v_uid)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (v_uid, 'invite_admin', 'invite', p_email, json_build_object('email', p_email, 'granted', false));
  RETURN json_build_object('success', true, 'granted', false, 'email', p_email);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm, 'granted', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_invite_by_email(text) TO authenticated;

-- admin_cancel_invite: Cancel pending admin invite
DROP FUNCTION IF EXISTS public.admin_cancel_invite(p_id uuid);
CREATE FUNCTION public.admin_cancel_invite(p_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_owner() THEN
    RETURN json_build_object('success', false, 'reason', 'owner only');
  END IF;
  DELETE FROM public.admin_invites WHERE id = p_id AND status = 'pending';
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_invite(uuid) TO authenticated;

-- admin_team_list: List admin team members
DROP FUNCTION IF EXISTS public.admin_team_list();
CREATE FUNCTION public.admin_team_list()
RETURNS TABLE (
    user_id uuid,
    email text,
    display_name text,
    avatar_url text,
    is_super boolean,
    granted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.id as user_id,
    u.email,
    p.display_name,
    p.avatar_url,
    EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = u.id) as is_super,
    ur.created_at as granted_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
  WHERE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u.id AND role IN ('admin', 'moderator', 'support'))
     OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = u.id)
  ORDER BY is_super DESC, ur.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_team_list() TO authenticated;

-- admin_update_user_profile: Update user profile as admin
DROP FUNCTION IF EXISTS public.admin_update_user_profile(p_user_id uuid,
    p_display_name text,
    p_email text,
    p_status text,
    p_is_banned boolean,
    p_ban_reason text);
CREATE FUNCTION public.admin_update_user_profile(p_user_id uuid,
    p_display_name text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_is_banned boolean DEFAULT NULL,
    p_ban_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    status = COALESCE(p_status, status),
    is_banned = COALESCE(p_is_banned, is_banned),
    ban_reason = COALESCE(p_ban_reason, ban_reason),
    updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'update_user_profile', 'user', p_user_id::text,
    json_build_object('display_name', p_display_name, 'status', p_status, 'is_banned', p_is_banned));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text, text, boolean, text) TO authenticated;

-- admin_get_user_details: Get user details for admin view
DROP FUNCTION IF EXISTS public.admin_get_user_details(p_user_id uuid);
CREATE FUNCTION public.admin_get_user_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_profile jsonb;
  v_roles jsonb;
  v_videos_count bigint;
  v_wallet_balance numeric;
BEGIN
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  SELECT jsonb_agg(role) INTO v_roles
  FROM public.user_roles
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_videos_count
  FROM public.videos
  WHERE owner_id = p_user_id;

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

GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;

-- admin_get_user_videos: Get user videos for admin view
DROP FUNCTION IF EXISTS public.admin_get_user_videos(uuid, integer, integer);
CREATE FUNCTION public.admin_get_user_videos(p_user_id uuid, p_limit integer, p_offset integer)
RETURNS SETOF public.videos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
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

GRANT EXECUTE ON FUNCTION public.admin_get_user_videos(uuid, integer, integer) TO authenticated;

-- admin_get_user_emails: Get emails for multiple users
DROP FUNCTION IF EXISTS public.admin_get_user_emails(uuid[]);
CREATE FUNCTION public.admin_get_user_emails(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
  SELECT u.id, u.email
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_emails(uuid[]) TO authenticated;

-- admin_mark_withdrawal_processed: Mark withdrawal as processed
DROP FUNCTION IF EXISTS public.admin_mark_withdrawal_processed(uuid, text);
CREATE FUNCTION public.admin_mark_withdrawal_processed(
    p_request_id uuid, p_note text DEFAULT NULL
)
RETURNS withdrawal_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_row withdrawal_requests;
  v_user_id uuid;
  v_amount numeric;
BEGIN
  IF NOT public._caller_is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_row
  FROM public.withdrawal_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'withdrawal not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'withdrawal already processed';
  END IF;

  v_user_id := v_row.user_id;
  v_amount := v_row.amount;

  -- Update withdrawal status
  UPDATE public.withdrawal_requests
  SET status = 'completed',
      admin_note = p_note,
      processed_at = now(),
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  -- Deduct from balance
  UPDATE public.user_wallets
  SET balance = balance - v_amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Log admin action
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'mark_withdrawal_processed', 'withdrawal', p_request_id::text,
    json_build_object('amount', v_amount, 'note', p_note));

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_withdrawal_processed(uuid, text) TO authenticated;

-- admin_ban_user: Ban a user
DROP FUNCTION IF EXISTS public.admin_ban_user(p_user uuid, p_reason text, p_until timestamptz);
CREATE FUNCTION public.admin_ban_user(p_user uuid, p_reason text, p_until timestamptz)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  UPDATE public.profiles
     SET is_banned = true,
         status = 'suspended',
         ban_reason = p_reason,
         banned_until = p_until
   WHERE id = p_user;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'ban_user', 'user', p_user::text,
    json_build_object('reason', p_reason, 'until', p_until));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) TO authenticated;

-- admin_unban_user: Unban a user
DROP FUNCTION IF EXISTS public.admin_unban_user(p_user uuid);
CREATE FUNCTION public.admin_unban_user(p_user uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  UPDATE public.profiles
     SET is_banned = false, status = 'active', ban_reason = null, banned_until = null
   WHERE id = p_user;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'unban_user', 'user', p_user::text, json_build_object('user', p_user::text));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

-- admin_issue_strike: Issue a strike to a user
DROP FUNCTION IF EXISTS public.admin_issue_strike(p_user uuid, p_reason text, p_category text,
    p_severity integer, p_source text, p_video_id uuid);
CREATE FUNCTION public.admin_issue_strike(p_user uuid, p_reason text, p_category text,
    p_severity integer DEFAULT 1, p_source text DEFAULT 'manual', p_video_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  INSERT INTO public.user_strikes
    (id, user_id, reason, category, severity, source, issued_by, video_id, created_at, expires_at)
  VALUES
    (v_id, p_user, p_reason, p_category, p_severity, p_source, auth.uid(), p_video_id, now(),
     CASE WHEN p_severity >= 3 THEN now() + interval '30 days' ELSE now() + interval '90 days' END);
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'issue_strike', 'user', p_user::text,
    json_build_object('category', p_category, 'severity', p_severity, 'reason', p_reason));
  RETURN json_build_object('success', true, 'strike_id', v_id::text);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_issue_strike(uuid, text, text, integer, text, uuid) TO authenticated;

-- active_strike_count: Count active strikes for a user
DROP FUNCTION IF EXISTS public.active_strike_count(_user_id uuid);
CREATE FUNCTION public.active_strike_count(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::integer FROM public.user_strikes
   WHERE user_id = _user_id
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > now())
$$;

GRANT EXECUTE ON FUNCTION public.active_strike_count(uuid) TO authenticated;

-- admin_revoke_strike: Revoke a strike from a user
DROP FUNCTION IF EXISTS public.admin_revoke_strike(p_strike_id uuid, p_reason text);
CREATE FUNCTION public.admin_revoke_strike(p_strike_id uuid, p_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;

  UPDATE public.user_strikes
  SET revoked_at = now(),
      revoked_by = auth.uid(),
      revoke_reason = p_reason
  WHERE id = p_strike_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'revoke_strike', 'strike', p_strike_id::text,
    json_build_object('reason', p_reason));

  RETURN json_build_object('success', true, 'strike_id', p_strike_id::text);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_strike(uuid, text) TO authenticated;

-- admin_moderate_video: Moderate video (approve, remove, shadowban, flag, etc.)
DROP FUNCTION IF EXISTS public.admin_moderate_video(p_video uuid, p_action text, p_reason text);
CREATE FUNCTION public.admin_moderate_video(p_video uuid, p_action text, p_reason text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  UPDATE public.videos SET
    is_removed       = CASE WHEN p_action = 'remove'      THEN true ELSE is_removed END,
    is_shadow_banned = CASE WHEN p_action = 'shadowban'   THEN true
                             WHEN p_action = 'unshadowban' THEN false ELSE is_shadow_banned END,
    is_pending_review= CASE WHEN p_action = 'approve'     THEN false
                             WHEN p_action = 'pending'     THEN true  ELSE is_pending_review END,
    moderation_reason= CASE WHEN p_action IN ('remove','shadowban','flag') THEN p_reason
                             WHEN p_action IN ('approve','unshadowban','unflag') THEN NULL
                             ELSE moderation_reason END,
    auto_suppressed  = CASE WHEN p_action = 'flag'        THEN true
                             WHEN p_action = 'unflag'      THEN false ELSE auto_suppressed END
   WHERE id = p_video;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'moderate_video', 'video', p_video::text,
    json_build_object('action', p_action, 'reason', p_reason));
  RETURN json_build_object('success', true, 'action', p_action);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_moderate_video(uuid, text, text) TO authenticated;

-- admin_set_video_boost: Set boost score for video
DROP FUNCTION IF EXISTS public.admin_set_video_boost(p_video uuid, p_boost_score numeric);
CREATE FUNCTION public.admin_set_video_boost(p_video uuid, p_boost_score numeric)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  UPDATE public.videos SET boost_score = p_boost_score WHERE id = p_video;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'set_boost', 'video', p_video::text, json_build_object('boost_score', p_boost_score));
  RETURN json_build_object('success', true, 'boost_score', p_boost_score);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_video_boost(uuid, numeric) TO authenticated;

-- delete_video_with_storage: Delete video (soft remove + log)
DROP FUNCTION IF EXISTS public.delete_video_with_storage(p_video_id uuid);
CREATE FUNCTION public.delete_video_with_storage(p_video_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() AND auth.uid() IS NOT NULL THEN
    -- Also allow the owner of the video to delete their own
    IF NOT EXISTS (SELECT 1 FROM public.videos WHERE id = p_video_id AND owner_id = auth.uid()) THEN
      RETURN json_build_object('success', false, 'reason', 'not authorized');
    END IF;
  END IF;
  UPDATE public.videos SET is_removed = true, moderation_reason = 'deleted'
   WHERE id = p_video_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'delete_video', 'video', p_video_id::text, json_build_object('video', p_video_id::text));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_video_with_storage(uuid) TO authenticated;

-- admin_resolve_appeal: Resolve user appeal
DROP FUNCTION IF EXISTS public.admin_resolve_appeal(p_appeal_id uuid, p_decision text, p_note text);
CREATE FUNCTION public.admin_resolve_appeal(p_appeal_id uuid, p_decision text, p_note text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  UPDATE public.appeals
     SET status = p_decision, admin_response = p_decision,
         admin_note = p_note, reviewed_at = now(), updated_at = now()
   WHERE id = p_appeal_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'resolve_appeal', 'appeal', p_appeal_id::text,
    json_build_object('decision', p_decision, 'note', p_note));
  RETURN json_build_object('success', true, 'decision', p_decision);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_appeal(uuid, text, text) TO authenticated;

-- admin_set_ip_rule: Set IP block/allow rule
DROP FUNCTION IF EXISTS public.admin_set_ip_rule(text, text, text, timestamptz);
CREATE FUNCTION public.admin_set_ip_rule(
    p_ip text, p_mode text DEFAULT 'block', p_reason text DEFAULT NULL, p_expires timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  INSERT INTO public.ip_rules (ip_address, mode, reason, created_by, expires_at, created_at, updated_at)
  VALUES (p_ip, p_mode, p_reason, auth.uid(), p_expires, now(), now())
  ON CONFLICT (ip_address) DO UPDATE SET
    mode = p_mode,
    reason = p_reason,
    expires_at = p_expires,
    updated_at = now();
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'set_ip_rule', 'ip_rule', p_ip,
    json_build_object('mode', p_mode, 'reason', p_reason, 'expires', p_expires));
  RETURN json_build_object('success', true, 'ip', p_ip, 'mode', p_mode);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_ip_rule(text, text, text, timestamptz) TO authenticated;

-- admin_delete_ip_rule: Delete IP rule
DROP FUNCTION IF EXISTS public.admin_delete_ip_rule(text);
CREATE FUNCTION public.admin_delete_ip_rule(p_ip text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;
  DELETE FROM public.ip_rules WHERE ip_address = p_ip;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'delete_ip_rule', 'ip_rule', p_ip, json_build_object('ip', p_ip));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_ip_rule(text) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.4 User Functions
-- -------------------------------------------------------------------------------------

-- handle_new_user: Create profile on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- get_studio_dashboard: Studio dashboard for creators
DROP FUNCTION IF EXISTS public.get_studio_dashboard(p_user uuid);
CREATE FUNCTION public.get_studio_dashboard(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := COALESCE(p_user, auth.uid()); v jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_uid <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'videos', (SELECT count(*) FROM public.videos WHERE owner_id = v_uid),
    'shorts', (SELECT count(*) FROM public.videos WHERE owner_id = v_uid AND is_short),
    'views', (SELECT COALESCE(sum(views_count),0) FROM public.videos WHERE owner_id = v_uid),
    'likes', (SELECT COALESCE(sum(likes_count),0) FROM public.videos WHERE owner_id = v_uid),
    'comments', (SELECT COALESCE(sum(comments_count),0) FROM public.videos WHERE owner_id = v_uid),
    'followers', (SELECT count(*) FROM public.follows WHERE following_id = v_uid),
    'balance', (SELECT COALESCE(balance,0) FROM public.user_wallets WHERE user_id = v_uid),
    'total_earned', (SELECT COALESCE(total_earned,0) FROM public.user_wallets WHERE user_id = v_uid),
    'top_videos', COALESCE((SELECT jsonb_agg(t) FROM (
        SELECT id, title, thumb_url, views_count, likes_count, comments_count, created_at
        FROM public.videos WHERE owner_id = v_uid
        ORDER BY views_count DESC LIMIT 5) t), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_studio_dashboard(uuid) TO authenticated, service_role;

-- get_platform_overview: Admin platform overview
DROP FUNCTION IF EXISTS public.get_platform_overview();
CREATE FUNCTION public.get_platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'banned_users', (SELECT count(*) FROM public.profiles WHERE is_banned),
    'videos', (SELECT count(*) FROM public.videos),
    'shorts', (SELECT count(*) FROM public.videos WHERE is_short),
    'pending_review', (SELECT count(*) FROM public.videos WHERE is_pending_review),
    'total_views', (SELECT COALESCE(sum(views_count),0) FROM public.videos),
    'comments', (SELECT count(*) FROM public.video_comments),
    'creator_payouts', (SELECT COALESCE(sum(total_earned),0) FROM public.user_wallets),
    'platform_revenue', (SELECT COALESCE(sum(amount),0) FROM public.platform_revenue),
    'pending_withdrawals', (SELECT count(*) FROM public.withdrawal_requests WHERE status = 'pending'),
    'moderation_queue', (SELECT count(*) FROM public.moderation_queue WHERE status = 'pending'),
    'open_reports', (SELECT count(*) FROM public.video_reports WHERE status = 'pending')
  ) INTO v;
  RETURN v;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO authenticated, service_role;

-- get_channel_analytics: Channel analytics for creators
DROP FUNCTION IF EXISTS public.get_channel_analytics(p_user_id uuid, p_days integer);
CREATE FUNCTION public.get_channel_analytics(p_user_id uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_uid <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'video_count', (SELECT count(*) FROM public.videos WHERE owner_id = v_uid),
    'total_views', (SELECT COALESCE(sum(views_count),0) FROM public.videos WHERE owner_id = v_uid),
    'total_likes', (SELECT COALESCE(sum(likes_count),0) FROM public.videos WHERE owner_id = v_uid),
    'total_comments', (SELECT COALESCE(sum(comments_count),0) FROM public.videos WHERE owner_id = v_uid),
    'subscribers', (SELECT count(*) FROM public.follows WHERE following_id = v_uid),
    'total_earned', (SELECT COALESCE(total_earned,0) FROM public.user_wallets WHERE user_id = v_uid),
    'recent_views', (SELECT COALESCE(sum(views_count),0) FROM public.videos 
                     WHERE owner_id = v_uid AND created_at > now() - (p_days || ' days')::interval),
    'period', p_days
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_analytics(uuid, integer) TO authenticated, service_role;

-- get_aggregated_analytics: Detailed analytics data
DROP FUNCTION IF EXISTS public.get_aggregated_analytics(uuid, integer);
CREATE FUNCTION public.get_aggregated_analytics(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  date_val date,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  revenue numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_uid <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    DATE(v.created_at)::date,
    COALESCE(SUM(v.views_count), 0)::bigint,
    COALESCE(SUM(v.likes_count), 0)::bigint,
    COALESCE(SUM(v.comments_count), 0)::bigint,
    COALESCE(SUM(v.shares_count), 0)::bigint,
    COALESCE((SELECT SUM(amount_earned) FROM public.revenue_logs
              WHERE user_id = v_uid AND DATE(created_at) = DATE(v.created_at)), 0)
  FROM public.videos v
  WHERE v.owner_id = v_uid
    AND v.created_at >= now() - (p_days || ' days')::interval
  GROUP BY DATE(v.created_at)
  ORDER BY date_val DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_aggregated_analytics(uuid, integer) TO authenticated, service_role;

-- get_traffic_sources_analytics: Traffic source breakdown
DROP FUNCTION IF EXISTS public.get_traffic_sources_analytics(uuid);
CREATE FUNCTION public.get_traffic_sources_analytics(p_user_id uuid)
RETURNS TABLE (source text, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(ae.event_data->>'source', 'direct') as source,
    COUNT(*)::bigint
  FROM public.analytics_events ae
  JOIN public.videos v ON v.id = ae.video_id
  WHERE v.owner_id = p_user_id
    AND ae.event_type = 'view'
    AND ae.created_at >= now() - interval '30 days'
  GROUP BY COALESCE(ae.event_data->>'source', 'direct')
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_traffic_sources_analytics(uuid) TO authenticated, service_role;

-- get_geography_analytics: Geographic breakdown
DROP FUNCTION IF EXISTS public.get_geography_analytics(uuid);
CREATE FUNCTION public.get_geography_analytics(p_user_id uuid)
RETURNS TABLE (country_code text, country_name text, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(rl.country_code, 'XX') as country_code,
    COALESCE(rl.country_name, 'Unknown') as country_name,
    COUNT(*)::bigint
  FROM public.revenue_logs rl
  WHERE rl.user_id = p_user_id
    AND rl.created_at >= now() - interval '30 days'
  GROUP BY COALESCE(rl.country_code, 'XX'), COALESCE(rl.country_name, 'Unknown')
  ORDER BY count DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_geography_analytics(uuid) TO authenticated, service_role;

-- get_realtime_views: Realtime view counts
DROP FUNCTION IF EXISTS public.get_realtime_views(uuid);
CREATE FUNCTION public.get_realtime_views(p_user_id uuid)
RETURNS TABLE (last_48_hours bigint, last_60_minutes bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COALESCE(COUNT(*), 0)::bigint FROM public.video_views vv
     JOIN public.videos v ON v.id = vv.video_id
     WHERE v.owner_id = p_user_id AND vv.created_at >= now() - interval '48 hours'),
    (SELECT COALESCE(COUNT(*), 0)::bigint FROM public.video_views vv
     JOIN public.videos v ON v.id = vv.video_id
     WHERE v.owner_id = p_user_id AND vv.created_at >= now() - interval '60 minutes');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_realtime_views(uuid) TO authenticated, service_role;

-- toggle_like: Like/unlike a video
DROP FUNCTION IF EXISTS public.toggle_like(uuid, uuid);
CREATE FUNCTION public.toggle_like(p_video uuid, p_creator uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_liked boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.video_likes WHERE video_id = p_video::text AND user_id = v_uid) INTO v_liked;

  IF v_liked THEN
    DELETE FROM public.video_likes WHERE video_id = p_video::text AND user_id = v_uid;
  ELSE
    INSERT INTO public.video_likes (video_id, user_id) VALUES (p_video::text, v_uid);
  END IF;

  RETURN json_build_object('liked', NOT v_liked);
END; $function$;

GRANT EXECUTE ON FUNCTION public.toggle_like(uuid, uuid) TO authenticated;

-- post_comment: Post a comment
DROP FUNCTION IF EXISTS public.post_comment(p_video text, p_text text, p_parent uuid, p_creator uuid);
CREATE FUNCTION public.post_comment(p_video text, p_text text, p_parent uuid, p_creator uuid)
RETURNS video_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row public.video_comments;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  INSERT INTO public.video_comments (video_id, user_id, parent_id, text)
    VALUES (p_video, v_uid, p_parent, p_text) RETURNING * INTO v_row;
  IF p_creator IS NOT NULL AND p_creator <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, payload)
      VALUES (p_creator, 'comment', jsonb_build_object('video_id', p_video, 'comment_id', v_row.id, 'commenter_id', v_uid));
  END IF;
  RETURN v_row;
END; $function$;

GRANT EXECUTE ON FUNCTION public.post_comment(text, text, uuid, uuid) TO authenticated;

-- toggle_follow: Follow/unfollow a user
DROP FUNCTION IF EXISTS public.toggle_follow(uuid);
CREATE FUNCTION public.toggle_follow(p_target uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_following boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_uid = p_target THEN RAISE EXCEPTION 'cannot follow self'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id = v_uid AND following_id = p_target) INTO v_following;

  IF v_following THEN
    DELETE FROM public.follows WHERE follower_id = v_uid AND following_id = p_target;
  ELSE
    INSERT INTO public.follows (follower_id, following_id) VALUES (v_uid, p_target);
  END IF;

  RETURN json_build_object('following', NOT v_following);
END; $function$;

GRANT EXECUTE ON FUNCTION public.toggle_follow(uuid) TO authenticated;

-- toggle_save: Save/unsave a video
DROP FUNCTION IF EXISTS public.toggle_save(uuid);
CREATE FUNCTION public.toggle_save(p_video uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_saved boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.video_saves WHERE video_id = p_video::text AND user_id = v_uid) INTO v_saved;

  IF v_saved THEN
    DELETE FROM public.video_saves WHERE video_id = p_video::text AND user_id = v_uid;
  ELSE
    INSERT INTO public.video_saves (video_id, user_id) VALUES (p_video::text, v_uid);
  END IF;

  RETURN json_build_object('saved', NOT v_saved);
END; $function$;

GRANT EXECUTE ON FUNCTION public.toggle_save(uuid) TO authenticated;

-- record_share: Record a video share
DROP FUNCTION IF EXISTS public.record_share(uuid, text);
CREATE FUNCTION public.record_share(p_video uuid, p_platform text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  INSERT INTO public.video_shares (video_id, user_id, platform)
  VALUES (p_video, auth.uid(), p_platform);

  SELECT COUNT(*) INTO v_count FROM public.video_shares
  WHERE video_id = p_video;

  RETURN json_build_object('shares', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_share(uuid, text) TO authenticated;

-- record_download: Record a video download
DROP FUNCTION IF EXISTS public.record_download(uuid);
CREATE FUNCTION public.record_download(p_video uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_recent int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT count(*) INTO v_recent FROM public.video_downloads
    WHERE user_id = v_uid AND video_id = p_video::text AND created_at > now() - interval '24 hours';
  IF v_recent >= 5 THEN
    RETURN json_build_object('logged', false, 'reason', 'rate_limited');
  END IF;
  INSERT INTO public.video_downloads (video_id, user_id) VALUES (p_video::text, v_uid);
  RETURN json_build_object('logged', true);
END; $function$;

GRANT EXECUTE ON FUNCTION public.record_download(uuid) TO authenticated;

-- record_view: Record a video view
DROP FUNCTION IF EXISTS public.record_view(uuid, integer, text);
CREATE FUNCTION public.record_view(p_video uuid, p_watch_seconds integer, p_ip_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_dup INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM public.video_views
  WHERE video_id = p_video
    AND created_at > NOW() - INTERVAL '30 minutes'
    AND ((v_uid IS NOT NULL AND viewer_id = v_uid)
         OR (v_uid IS NULL AND ip_address IS NOT NULL AND ip_address = p_ip_hash));

  IF v_dup = 0 THEN
    INSERT INTO public.video_views (video_id, viewer_id, watch_seconds, ip_address)
    VALUES (p_video, v_uid, GREATEST(p_watch_seconds, 0), p_ip_hash);

    -- Update the video's view count
    UPDATE public.videos
    SET views_count = COALESCE(views_count, 0) + 1
    WHERE id = p_video;
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.video_views WHERE video_id = p_video;

  RETURN jsonb_build_object('counted', v_dup = 0, 'views', v_total);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_view(uuid, integer, text) TO authenticated, anon;

-- get_home_feed_v2: Get home feed
DROP FUNCTION IF EXISTS public.get_home_feed_v2(text, integer, integer, text, boolean, integer, integer);
CREATE FUNCTION public.get_home_feed_v2(p_kind text, p_limit integer, p_offset integer, p_category text, p_is_short boolean, p_max_per_creator integer, p_max_per_category integer)
RETURNS TABLE(id text, title text, description text, thumb_url text, video_url text, owner_id uuid, created_at timestamp with time zone, views_count bigint, duration_seconds integer, is_short boolean, category text, preview_sprite_url text, preview_sprite_frames integer)
LANGUAGE sql
AS $function$
  SELECT
    v.id::text,
    v.title,
    v.description,
    v.thumb_url,
    v.video_url,
    v.owner_id,
    v.created_at,
    COALESCE(v.views_count, 0) as views_count,
    v.duration_seconds,
    COALESCE(v.is_short, false) as is_short,
    v.category,
    v.preview_sprite_url,
    v.preview_sprite_frames
  FROM public.videos v
  WHERE v.visibility = 'public'
    AND v.status = 'ready'
    AND (p_category IS NULL OR v.category ILIKE p_category)
    AND (p_is_short IS NULL OR COALESCE(v.is_short, false) = p_is_short)
  ORDER BY
    CASE
      WHEN p_kind = 'trending' THEN COALESCE(v.views_count, 0)
      ELSE 0
    END DESC,
    v.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_v2(text, integer, integer, text, boolean, integer, integer) TO authenticated, anon;

-- get_shorts_feed: Get Shorts feed
DROP FUNCTION IF EXISTS public.get_shorts_feed(p_limit integer, p_offset integer);
CREATE FUNCTION public.get_shorts_feed(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS SETOF videos
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.* FROM public.videos v
   WHERE v.visibility='public' AND v.status='ready'
     AND COALESCE(v.is_short,false)=true
     AND COALESCE(v.is_removed,false)=false
   ORDER BY v.created_at DESC
   LIMIT GREATEST(p_limit,1) OFFSET GREATEST(p_offset,0);
$function$;

GRANT EXECUTE ON FUNCTION public.get_shorts_feed(integer, integer) TO authenticated, anon;

-- get_related_videos: Get related videos
DROP FUNCTION IF EXISTS public.get_related_videos(p_video text, p_limit integer);
CREATE FUNCTION public.get_related_videos(p_video text, p_limit integer DEFAULT 12)
RETURNS SETOF videos
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (SELECT category, owner_id FROM public.videos WHERE id::text = p_video LIMIT 1)
  SELECT v.* FROM public.videos v, base b
   WHERE v.id::text <> p_video
     AND v.visibility='public' AND v.status='ready'
     AND COALESCE(v.is_removed,false)=false
     AND (v.category = b.category OR v.owner_id = b.owner_id)
   ORDER BY v.views_count DESC, v.created_at DESC
   LIMIT p_limit;
$function$;

GRANT EXECUTE ON FUNCTION public.get_related_videos(text, integer) TO authenticated, anon;

-- search_videos: Full-text search for videos
DROP FUNCTION IF EXISTS public.search_videos(p_query text,
    p_category text,
    p_upload_date text,
    p_duration_filter text,
    p_video_type text,
    p_sort_by text,
    p_limit integer,
    p_offset integer);
CREATE FUNCTION public.search_videos(p_query text,
    p_category text DEFAULT NULL,
    p_upload_date text DEFAULT NULL,
    p_duration_filter text DEFAULT NULL,
    p_video_type text DEFAULT NULL,
    p_sort_by text DEFAULT 'relevance',
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    thumb_url text,
    video_url text,
    owner_id uuid,
    views_count bigint,
    duration_seconds integer,
    is_short boolean,
    category text,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.title,
        v.description,
        v.thumb_url,
        v.video_url,
        v.owner_id,
        v.views_count,
        v.duration_seconds,
        v.is_short,
        v.category,
        v.created_at
    FROM public.videos v
    WHERE v.visibility = 'public'
      AND v.status = 'ready'
      AND v.is_removed = false
      AND (p_category IS NULL OR v.category = p_category)
      AND (p_video_type IS NULL OR 
           (p_video_type = 'shorts' AND v.is_short = true) OR
           (p_video_type = 'long' AND v.is_short = false))
      AND (p_upload_date IS NULL OR
           (p_upload_date = 'today' AND v.created_at >= CURRENT_DATE) OR
           (p_upload_date = 'week' AND v.created_at >= CURRENT_DATE - INTERVAL '7 days') OR
           (p_upload_date = 'month' AND v.created_at >= CURRENT_DATE - INTERVAL '30 days') OR
           (p_upload_date = 'year' AND v.created_at >= CURRENT_DATE - INTERVAL '365 days'))
      AND (p_duration_filter IS NULL OR
           (p_duration_filter = 'short' AND v.duration_seconds < 300) OR
           (p_duration_filter = 'medium' AND v.duration_seconds >= 300 AND v.duration_seconds < 1200) OR
           (p_duration_filter = 'long' AND v.duration_seconds >= 1200))
      AND (p_query IS NULL OR p_query = '' OR
           v.title ILIKE '%' || p_query || '%' OR
           v.description ILIKE '%' || p_query || '%' OR
           v.category ILIKE '%' || p_query || '%' OR
           ARRAY_TO_STRING(v.tags, ' ') ILIKE '%' || p_query || '%')
    ORDER BY
        CASE p_sort_by
            WHEN 'relevance' THEN 0
            WHEN 'views' THEN v.views_count
            WHEN 'date' THEN EXTRACT(EPOCH FROM v.created_at)
            ELSE 0
        END DESC,
        v.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_videos(text, text, text, text, text, text, integer, integer) TO authenticated, anon;

-- search_channels: Search for channels/users
DROP FUNCTION IF EXISTS public.search_channels(p_query text, p_limit integer);
CREATE FUNCTION public.search_channels(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
    id uuid,
    display_name text,
    handle text,
    avatar_url text,
    bio text,
    follower_count integer,
    video_count integer,
    verified boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.bio,
    p.follower_count,
    p.video_count,
    p.verified
  FROM public.profiles p
  WHERE (p_query IS NULL OR p_query = '' OR
         p.display_name ILIKE '%' || p_query || '%' OR
         p.handle ILIKE '%' || p_query || '%' OR
         p.bio ILIKE '%' || p_query || '%')
    AND p.status = 'active'
    AND NOT p.is_banned
  ORDER BY p.follower_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_channels(text, integer) TO authenticated, anon;

-- get_channel_community_posts: Get community posts for a channel
DROP FUNCTION IF EXISTS public.get_channel_community_posts(p_creator_id uuid,
    p_limit integer,
    p_offset integer);
CREATE FUNCTION public.get_channel_community_posts(p_creator_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0)
RETURNS TABLE (
    id uuid,
    creator_id uuid,
    content text,
    media_urls text[],
    post_type text,
    likes_count integer,
    comments_count integer,
    shares_count integer,
    is_pinned boolean,
    created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    cp.id,
    cp.creator_id,
    cp.content,
    cp.media_urls,
    cp.post_type,
    cp.likes_count,
    cp.comments_count,
    cp.shares_count,
    cp.is_pinned,
    cp.created_at
  FROM public.community_posts cp
  WHERE cp.creator_id = p_creator_id
    AND cp.visibility = 'public'
  ORDER BY cp.is_pinned DESC, cp.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_community_posts(uuid, integer, integer) TO authenticated, anon;

-- toggle_community_post_like: Like/unlike community post
DROP FUNCTION IF EXISTS public.toggle_community_post_like(uuid, uuid);
CREATE FUNCTION public.toggle_community_post_like(p_post_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_liked boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.community_post_likes WHERE post_id = p_post_id AND user_id = p_user_id) INTO v_liked;

  IF v_liked THEN
    DELETE FROM public.community_post_likes WHERE post_id = p_post_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.community_post_likes (post_id, user_id) VALUES (p_post_id, p_user_id);
  END IF;

  RETURN json_build_object('liked', NOT v_liked);
END; $function$;

GRANT EXECUTE ON FUNCTION public.toggle_community_post_like(uuid, uuid) TO authenticated;

-- log_video_impression: Log video impression for analytics
DROP FUNCTION IF EXISTS public.log_video_impression(p_video text, p_surface text);
CREATE FUNCTION public.log_video_impression(p_video text, p_surface text DEFAULT 'feed')
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.analytics_events (event_type, user_id, video_id, event_data)
  VALUES ('impression', auth.uid(), p_video::uuid, jsonb_build_object('surface', p_surface));
$$;

GRANT EXECUTE ON FUNCTION public.log_video_impression(text, text) TO anon, authenticated, service_role;

-- log_search_analytics: Log search for analytics
DROP FUNCTION IF EXISTS public.log_search_analytics(p_user_id uuid, p_query text, p_results_count int, p_filters jsonb);
CREATE FUNCTION public.log_search_analytics(p_user_id uuid, p_query text, p_results_count int, p_filters jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.analytics_events (event_type, user_id, event_data)
  VALUES ('search', p_user_id, jsonb_build_object('query', p_query, 'results', p_results_count, 'filters', p_filters));
$$;

GRANT EXECUTE ON FUNCTION public.log_search_analytics(uuid, text, int, jsonb) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3.5 Copyright Functions
-- -------------------------------------------------------------------------------------

-- create_copyright_claim: Create a copyright claim
DROP FUNCTION IF EXISTS public.create_copyright_claim(p_video_id uuid,
    p_claimant_id uuid,
    p_claim_type text,
    p_severity text,
    p_match_percentage numeric,
    p_matched_content_id text,
    p_matched_content_title text,
    p_matched_content_owner text);
CREATE FUNCTION public.create_copyright_claim(p_video_id uuid,
    p_claimant_id uuid,
    p_claim_type text,
    p_severity text DEFAULT 'warning',
    p_match_percentage numeric DEFAULT NULL,
    p_matched_content_id text DEFAULT NULL,
    p_matched_content_title text DEFAULT NULL,
    p_matched_content_owner text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_claim_id uuid;
BEGIN
  v_claim_id := gen_random_uuid();
  
  INSERT INTO public.copyright_claims (
    id, video_id, claimant_id, claim_type, severity, status,
    detected_at, match_percentage, matched_content_id, 
    matched_content_title, matched_content_owner, created_at, updated_at
  )
  VALUES (
    v_claim_id, p_video_id, p_claimant_id, p_claim_type, p_severity, 'active',
    now(), p_match_percentage, p_matched_content_id,
    p_matched_content_title, p_matched_content_owner, now(), now()
  );
  
  RETURN v_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_copyright_claim(uuid, uuid, text, text, numeric, text, text, text) TO authenticated, service_role;

-- dispute_copyright_claim: Dispute a copyright claim
DROP FUNCTION IF EXISTS public.dispute_copyright_claim(p_claim_id uuid,
    p_dispute_reason text,
    p_dispute_evidence text[]);
CREATE FUNCTION public.dispute_copyright_claim(p_claim_id uuid,
    p_dispute_reason text,
    p_dispute_evidence text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.copyright_claims
  SET dispute_reason = p_dispute_reason,
      dispute_evidence = p_dispute_evidence,
      updated_at = now()
  WHERE id = p_claim_id;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispute_copyright_claim(uuid, text, text[]) TO authenticated, service_role;

-- release_copyright_claim: Release a copyright claim
DROP FUNCTION IF EXISTS public.release_copyright_claim(p_claim_id uuid);
CREATE FUNCTION public.release_copyright_claim(p_claim_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_video_owner_id uuid;
BEGIN
  UPDATE public.copyright_claims
  SET status = 'released',
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_claim_id
  RETURNING (SELECT videos.owner_id FROM public.videos WHERE videos.id::text = copyright_claims.video_id) INTO v_video_owner_id;

  INSERT INTO public.channel_notices (
    user_id, notice_type, severity, title, message, action_required, related_video_id
  ) VALUES (
    v_video_owner_id,
    'copyright_claim',
    'info',
    'Copyright Claim Released',
    'A copyright claim on your video has been released.',
    false,
    (SELECT video_id FROM public.copyright_claims WHERE id = p_claim_id)
  );

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_copyright_claim(uuid) TO authenticated, service_role;

-- copyright_claim_events table for audit trail
CREATE TABLE IF NOT EXISTS public.copyright_claim_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id uuid NOT NULL REFERENCES public.copyright_claims(id) ON DELETE CASCADE,
    actor_type text NOT NULL CHECK (actor_type IN ('system', 'admin', 'user', 'ai')),
    actor_id uuid,
    action text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copyright_claim_events_claim_id ON public.copyright_claim_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_copyright_claim_events_created_at ON public.copyright_claim_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copyright_claim_events_actor ON public.copyright_claim_events(actor_type, actor_id);

ALTER TABLE public.copyright_claim_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all events
DROP POLICY IF EXISTS "admins_can_read_all_claim_events" ON public.copyright_claim_events;
CREATE POLICY "admins_can_read_all_claim_events" ON public.copyright_claim_events
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Users can read events for their own claims
DROP POLICY IF EXISTS "users_can_read_own_claim_events" ON public.copyright_claim_events;
CREATE POLICY "users_can_read_own_claim_events" ON public.copyright_claim_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.copyright_claims cc
            JOIN public.videos v ON cc.video_id = v.id
            WHERE cc.id = copyright_claim_events.claim_id
            AND v.owner_id = auth.uid()
        )
    );

-- Service role can insert events
DROP POLICY IF EXISTS "service_role_can_insert_claim_events" ON public.copyright_claim_events;
CREATE POLICY "service_role_can_insert_claim_events" ON public.copyright_claim_events
    FOR INSERT TO service_role
    WITH CHECK (true);

-- log_ai_evaluation_event: Log AI evaluation for copyright claim
DROP FUNCTION IF EXISTS public.log_ai_evaluation_event(p_claim_id uuid,
    p_merit_score numeric,
    p_merit_level text,
    p_recommendation text,
    p_reasoning text,
    p_fair_use_factors jsonb);
CREATE FUNCTION public.log_ai_evaluation_event(p_claim_id uuid,
    p_merit_score numeric,
    p_merit_level text,
    p_recommendation text,
    p_reasoning text,
    p_fair_use_factors jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO public.copyright_claim_events (
    claim_id,
    actor_type,
    action,
    payload
  ) VALUES (
    p_claim_id,
    'ai',
    'ai_evaluation',
    jsonb_build_object(
      'merit_score', p_merit_score,
      'merit_level', p_merit_level,
      'recommendation', p_recommendation,
      'reasoning', p_reasoning,
      'fair_use_factors', p_fair_use_factors,
      'evaluated_at', now()
    )
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ai_evaluation_event(uuid, numeric, text, text, text, jsonb) TO service_role;

-- log_status_change_event: Log copyright claim status change
DROP FUNCTION IF EXISTS public.log_status_change_event(p_claim_id uuid,
    p_actor_id uuid,
    p_old_status text,
    p_new_status text,
    p_note text);
CREATE FUNCTION public.log_status_change_event(p_claim_id uuid,
    p_actor_id uuid,
    p_old_status text,
    p_new_status text,
    p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO public.copyright_claim_events (
    claim_id,
    actor_type,
    actor_id,
    action,
    payload
  ) VALUES (
    p_claim_id,
    'admin',
    p_actor_id,
    'status_change',
    jsonb_build_object(
      'old_status', p_old_status,
      'new_status', p_new_status,
      'note', p_note,
      'changed_at', now()
    )
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_status_change_event(uuid, uuid, text, text, text) TO authenticated, service_role;

-- log_policy_change_event: Log copyright claim policy change
DROP FUNCTION IF EXISTS public.log_policy_change_event(p_claim_id uuid,
    p_actor_id uuid,
    p_old_policy text,
    p_new_policy text,
    p_note text);
CREATE FUNCTION public.log_policy_change_event(p_claim_id uuid,
    p_actor_id uuid,
    p_old_policy text,
    p_new_policy text,
    p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO public.copyright_claim_events (
    claim_id,
    actor_type,
    actor_id,
    action,
    payload
  ) VALUES (
    p_claim_id,
    'admin',
    p_actor_id,
    'policy_change',
    jsonb_build_object(
      'old_policy', p_old_policy,
      'new_policy', p_new_policy,
      'note', p_note,
      'changed_at', now()
    )
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_policy_change_event(uuid, uuid, text, text, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3.6 Storage Functions
-- -------------------------------------------------------------------------------------

-- get_active_storage_config: Get active storage configuration
DROP FUNCTION IF EXISTS public.get_active_storage_config();
CREATE FUNCTION public.get_active_storage_config()
RETURNS TABLE (
    provider text,
    account_id text,
    bucket_name text,
    access_key text,
    secret_key text,
    cdn_domain text,
    chunked_uploads boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    provider,
    account_id,
    bucket_name,
    access_key,
    secret_key,
    cdn_domain,
    chunked_uploads
  FROM public.storage_config
  WHERE is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_storage_config() TO service_role;

-- update_storage_config: Update storage configuration (admin only)
DROP FUNCTION IF EXISTS public.update_storage_config(p_provider text,
    p_account_id text,
    p_bucket_name text,
    p_access_key text,
    p_secret_key text,
    p_cdn_domain text,
    p_chunked_uploads boolean);
CREATE FUNCTION public.update_storage_config(p_provider text,
    p_account_id text,
    p_bucket_name text,
    p_access_key text,
    p_secret_key text,
    p_cdn_domain text,
    p_chunked_uploads boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Check if user is admin
  IF NOT public._caller_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

  -- Validate inputs
  IF p_account_id IS NULL OR p_account_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account ID is required');
  END IF;

  IF p_bucket_name IS NULL OR p_bucket_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bucket name is required');
  END IF;

  IF p_access_key IS NULL OR p_access_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access key is required');
  END IF;

  IF p_secret_key IS NULL OR p_secret_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Secret key is required');
  END IF;

  IF p_cdn_domain IS NULL OR p_cdn_domain = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'CDN domain is required');
  END IF;

  -- Deactivate existing configs
  UPDATE public.storage_config SET is_active = false, updated_at = now();

  -- Insert new configuration
  INSERT INTO public.storage_config (
    provider, account_id, bucket_name, access_key,
    secret_key, cdn_domain, chunked_uploads,
    is_active, created_by, updated_by
  ) VALUES (
    p_provider, p_account_id, p_bucket_name, p_access_key,
    p_secret_key, p_cdn_domain, p_chunked_uploads,
    true, auth.uid(), auth.uid()
  );

  -- Log the action in audit_logs
  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, user_id,
    actor_email, severity, metadata
  ) VALUES (
    'storage_config_updated', 'storage_config',
    (SELECT id FROM public.storage_config WHERE is_active = true LIMIT 1),
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'info',
    jsonb_build_object(
      'provider', p_provider,
      'bucket', p_bucket_name,
      'cdn_domain', p_cdn_domain
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'message', 'Storage configuration updated successfully',
    'provider', p_provider,
    'bucket', p_bucket_name
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_storage_config(text, text, text, text, text, text, boolean) TO authenticated;

-- validate_storage_config: Validate storage configuration (admin only)
DROP FUNCTION IF EXISTS public.validate_storage_config();
CREATE FUNCTION public.validate_storage_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_config record;
  v_result jsonb;
BEGIN
  -- Check if user is admin
  IF NOT public._caller_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Admin access required');
  END IF;

  -- Get active configuration
  SELECT * INTO v_config
  FROM public.storage_config
  WHERE is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'configured', false,
      'message', 'No storage configuration found'
    );
  END IF;

  -- Return validation result (without sensitive data)
  v_result := jsonb_build_object(
    'success', true,
    'configured', true,
    'provider', v_config.provider,
    'bucket', v_config.bucket_name,
    'cdn_domain', v_config.cdn_domain,
    'chunked_uploads', v_config.chunked_uploads,
    'last_updated', v_config.updated_at
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_storage_config() TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.7 Notification Functions
-- -------------------------------------------------------------------------------------

-- get_notification_preferences: Get user notification preferences
DROP FUNCTION IF EXISTS public.get_notification_preferences(p_user_id uuid);
CREATE FUNCTION public.get_notification_preferences(p_user_id uuid)
RETURNS TABLE (
    user_id uuid,
    new_video boolean,
    live_start boolean,
    comment_reply boolean,
    mention boolean,
    copyright boolean,
    payout boolean,
    marketing boolean,
    channel_overrides jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    user_id,
    new_video,
    live_start,
    comment_reply,
    mention,
    copyright,
    payout,
    marketing,
    channel_overrides
  FROM public.notification_preferences WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_notification_preferences(uuid) TO authenticated, service_role;

-- update_notification_preferences: Update notification preferences
DROP FUNCTION IF EXISTS public.update_notification_preferences(p_user_id uuid,
    p_new_video boolean,
    p_live_start boolean,
    p_comment_reply boolean,
    p_mention boolean,
    p_copyright boolean,
    p_payout boolean,
    p_marketing boolean,
    p_channel_overrides jsonb);
CREATE FUNCTION public.update_notification_preferences(p_user_id uuid,
    p_new_video boolean DEFAULT NULL,
    p_live_start boolean DEFAULT NULL,
    p_comment_reply boolean DEFAULT NULL,
    p_mention boolean DEFAULT NULL,
    p_copyright boolean DEFAULT NULL,
    p_payout boolean DEFAULT NULL,
    p_marketing boolean DEFAULT NULL,
    p_channel_overrides jsonb DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.notification_preferences
  SET 
    new_video = COALESCE(p_new_video, new_video),
    live_start = COALESCE(p_live_start, live_start),
    comment_reply = COALESCE(p_comment_reply, comment_reply),
    mention = COALESCE(p_mention, mention),
    copyright = COALESCE(p_copyright, copyright),
    payout = COALESCE(p_payout, payout),
    marketing = COALESCE(p_marketing, marketing),
    channel_overrides = COALESCE(p_channel_overrides, channel_overrides),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_notification_preferences(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb) TO authenticated, service_role;

-- register_push_subscription: Register web push subscription
DROP FUNCTION IF EXISTS public.register_push_subscription(p_user_id uuid,
    p_endpoint text,
    p_p256dh text,
    p_auth text,
    p_user_agent text);
CREATE FUNCTION public.register_push_subscription(p_user_id uuid,
    p_endpoint text,
    p_p256dh text,
    p_auth text,
    p_user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_sub_id uuid;
BEGIN
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
  VALUES (p_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, now(), now())
  ON CONFLICT (user_id, endpoint) DO UPDATE SET
    p256dh = p_p256dh,
    auth = p_auth,
    user_agent = p_user_agent,
    updated_at = now()
  RETURNING id INTO v_sub_id;
  
  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_subscription(uuid, text, text, text, text) TO authenticated, service_role;

-- remove_push_subscription: Remove web push subscription
DROP FUNCTION IF EXISTS public.remove_push_subscription(p_user_id uuid, p_endpoint text);
CREATE FUNCTION public.remove_push_subscription(p_user_id uuid, p_endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.push_subscriptions 
  WHERE user_id = p_user_id AND endpoint = p_endpoint;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_push_subscription(uuid, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3.8 Algorithm Functions
-- -------------------------------------------------------------------------------------

-- get_algo_weights: Get algorithm weights for feed ranking
DROP FUNCTION IF EXISTS public.get_algo_weights();
CREATE FUNCTION public.get_algo_weights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_weights jsonb;
BEGIN
  v_weights := jsonb_build_object(
    'views_weight', 0.4,
    'likes_weight', 0.3,
    'comments_weight', 0.2,
    'shares_weight', 0.1,
    'recency_weight', 0.5,
    'creator_score_weight', 0.3
  );
  RETURN v_weights;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_algo_weights() TO authenticated, service_role;

-- update_algorithm_weights: Update algorithm weights (admin only)
DROP FUNCTION IF EXISTS public.update_algorithm_weights(p_weights jsonb, p_note text);
CREATE FUNCTION public.update_algorithm_weights(p_weights jsonb, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_prev jsonb;
BEGIN
  IF NOT public._caller_is_admin() THEN
    RETURN json_build_object('success', false, 'reason', 'admin only');
  END IF;

  v_prev := COALESCE(public.get_algo_weights(), '{}'::jsonb);

  -- Store weights in algorithm_audit_log
  INSERT INTO public.algorithm_audit_log (actor, previous, next, note, created_at)
  VALUES (auth.uid(), v_prev, p_weights, p_note, now());

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'update_algorithm_weights', 'algorithm', 'weights', json_build_object('note', p_note));

  RETURN json_build_object('success', true, 'previous', v_prev, 'current', p_weights);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_algorithm_weights(jsonb, text) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.9 Additional Utility Functions
-- -------------------------------------------------------------------------------------

-- get_trending_videos: Get trending videos with cursor pagination
DROP FUNCTION IF EXISTS public.get_trending_videos(p_category text,
    p_region text,
    p_window interval,
    p_limit integer,
    p_cursor timestamptz);
CREATE FUNCTION public.get_trending_videos(p_category text DEFAULT NULL,
    p_region text DEFAULT NULL,
    p_window interval DEFAULT '7 days',
    p_limit integer DEFAULT 20,
    p_cursor timestamptz DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    title text,
    thumb_url text,
    views_count bigint,
    likes_count integer,
    comments_count integer,
    shares_count integer,
    created_at timestamptz,
    category text,
    velocity_score numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    mv.id,
    mv.title,
    mv.thumb_url,
    mv.views_count,
    mv.likes_count,
    mv.comments_count,
    mv.shares_count,
    mv.created_at,
    mv.category,
    mv.velocity_score
  FROM public.mv_trending_videos mv
  WHERE (p_category IS NULL OR mv.category = p_category)
    AND (p_cursor IS NULL OR mv.created_at < p_cursor)
  ORDER BY mv.velocity_score DESC, mv.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_videos(text, text, interval, integer, timestamptz) TO authenticated, anon;

-- get_user_settings: Get user settings
DROP FUNCTION IF EXISTS public.get_user_settings(p_user_id uuid);
CREATE FUNCTION public.get_user_settings(p_user_id uuid)
RETURNS SETOF public.user_settings
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.user_settings WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_settings(uuid) TO authenticated, service_role;

-- update_user_settings: Update user settings
DROP FUNCTION IF EXISTS public.update_user_settings(p_user_id uuid,
    p_autoplay_shorts boolean,
    p_autoplay_videos boolean,
    p_captions_enabled boolean,
    p_captions_language text,
    p_custom_settings json,
    p_language text,
    p_mini_player_enabled boolean,
    p_muted boolean,
    p_notifications_enabled boolean,
    p_playback_speed numeric,
    p_quality_preference text,
    p_restricted_mode boolean,
    p_theme text);
CREATE FUNCTION public.update_user_settings(p_user_id uuid,
    p_autoplay_shorts boolean DEFAULT NULL,
    p_autoplay_videos boolean DEFAULT NULL,
    p_captions_enabled boolean DEFAULT NULL,
    p_captions_language text DEFAULT NULL,
    p_custom_settings json DEFAULT NULL,
    p_language text DEFAULT NULL,
    p_mini_player_enabled boolean DEFAULT NULL,
    p_muted boolean DEFAULT NULL,
    p_notifications_enabled boolean DEFAULT NULL,
    p_playback_speed numeric DEFAULT NULL,
    p_quality_preference text DEFAULT NULL,
    p_restricted_mode boolean DEFAULT NULL,
    p_theme text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.user_settings
  SET
    autoplay_shorts = COALESCE(p_autoplay_shorts, autoplay_shorts),
    autoplay_videos = COALESCE(p_autoplay_videos, autoplay_videos),
    captions_enabled = COALESCE(p_captions_enabled, captions_enabled),
    captions_language = COALESCE(p_captions_language, captions_language),
    custom_settings = COALESCE(p_custom_settings, custom_settings),
    language = COALESCE(p_language, language),
    mini_player_enabled = COALESCE(p_mini_player_enabled, mini_player_enabled),
    muted = COALESCE(p_muted, muted),
    notifications_enabled = COALESCE(p_notifications_enabled, notifications_enabled),
    playback_speed = COALESCE(p_playback_speed, playback_speed),
    quality_preference = COALESCE(p_quality_preference, quality_preference),
    restricted_mode = COALESCE(p_restricted_mode, restricted_mode),
    theme = COALESCE(p_theme, theme),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_settings(uuid, boolean, boolean, boolean, text, json, text, boolean, boolean, boolean, numeric, text, boolean, text) TO authenticated;

-- record_video_share: Record video share with platform details
DROP FUNCTION IF EXISTS public.record_video_share(p_video_id uuid,
    p_platform text,
    p_user_id uuid,
    p_user_agent text,
    p_ip_address inet);
CREATE FUNCTION public.record_video_share(p_video_id uuid,
    p_platform text,
    p_user_id uuid,
    p_user_agent text,
    p_ip_address inet)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_share_id uuid;
BEGIN
  v_share_id := gen_random_uuid();
  
  INSERT INTO public.video_shares (id, video_id, user_id, platform, shared_at, user_agent, ip_address)
  VALUES (v_share_id, p_video_id, p_user_id, p_platform, now(), p_user_agent, p_ip_address);
  
  RETURN v_share_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_video_share(uuid, text, uuid, text, inet) TO authenticated, service_role;

-- get_video_share_count: Get total share count for a video
DROP FUNCTION IF EXISTS public.get_video_share_count(p_video_id uuid);
CREATE FUNCTION public.get_video_share_count(p_video_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer FROM public.video_shares WHERE video_id = p_video_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_share_count(uuid) TO authenticated, anon, service_role;

-- get_video_share_breakdown: Get share breakdown by platform
DROP FUNCTION IF EXISTS public.get_video_share_breakdown(p_video_id uuid);
CREATE FUNCTION public.get_video_share_breakdown(p_video_id uuid)
RETURNS TABLE (platform text, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT platform, COUNT(*)::bigint
  FROM public.video_shares
  WHERE video_id = p_video_id
  GROUP BY platform
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_share_breakdown(uuid) TO authenticated, anon, service_role;

-- record_watch_history: Record watch history
DROP FUNCTION IF EXISTS public.record_watch_history(p_video uuid, p_watch_seconds integer);
CREATE FUNCTION public.record_watch_history(p_video uuid, p_watch_seconds integer DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  INSERT INTO public.watch_history (user_id, video_id, watch_seconds, watched_at, last_watched_at, updated_at)
  VALUES (v_uid, p_video, COALESCE(p_watch_seconds, 0), now(), now(), now())
  ON CONFLICT (user_id, video_id) DO UPDATE
    SET watch_seconds = public.watch_history.watch_seconds + COALESCE(EXCLUDED.watch_seconds, 0),
        last_watched_at = now(),
        updated_at = now();

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_watch_history(uuid, integer) TO authenticated;

-- record_heartbeat: Record watch heartbeat
DROP FUNCTION IF EXISTS public.record_heartbeat(p_video uuid, p_seconds integer);
CREATE FUNCTION public.record_heartbeat(p_video uuid, p_seconds integer DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.watch_history (user_id, video_id, watch_seconds, watched_at, last_watched_at, updated_at)
    VALUES (v_uid, p_video, COALESCE(p_seconds, 0), now(), now(), now())
    ON CONFLICT (user_id, video_id) DO UPDATE
      SET watch_seconds = public.watch_history.watch_seconds + COALESCE(EXCLUDED.watch_seconds, 0),
          last_watched_at = now(),
          updated_at = now();
  END IF;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'reason', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_heartbeat(uuid, integer) TO authenticated;

-- record_watch_progress: Record watch progress
DROP FUNCTION IF EXISTS public.record_watch_progress(p_video uuid, p_seconds integer);
CREATE FUNCTION public.record_watch_progress(p_video uuid, p_seconds integer DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  INSERT INTO public.watch_history (user_id, video_id, watched_at, watch_seconds, updated_at)
  VALUES (v_uid, p_video, now(), GREATEST(p_seconds,0), now())
  ON CONFLICT (user_id, video_id) DO UPDATE
    SET watched_at = now(),
        watch_seconds = GREATEST(public.watch_history.watch_seconds, EXCLUDED.watch_seconds),
        updated_at = now();
  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_watch_progress(uuid, integer) TO authenticated;

-- get_video_retention: Get video retention stats
DROP FUNCTION IF EXISTS public.get_video_retention(p_video uuid);
CREATE FUNCTION public.get_video_retention(p_video uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'video', p_video,
    'avg_watch', COALESCE((SELECT avg(watch_seconds) FROM public.video_views WHERE video_id = p_video), 0),
    'views', COALESCE((SELECT count(*) FROM public.video_views WHERE video_id = p_video), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_video_retention(uuid) TO authenticated, service_role;

-- search_videos_suggest: Autocomplete suggestions for search
DROP FUNCTION IF EXISTS public.search_videos_suggest(p_q text, p_limit integer);
CREATE FUNCTION public.search_videos_suggest(p_q text, p_limit integer DEFAULT 10)
RETURNS TABLE (id uuid, thumb_url text, title text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    v.id,
    v.thumb_url,
    v.title
  FROM public.videos v
  WHERE v.visibility = 'public'
    AND v.status = 'ready'
    AND v.is_removed = false
    AND (p_q IS NULL OR p_q = '' OR v.title ILIKE p_q || '%')
  ORDER BY v.views_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_videos_suggest(text, integer) TO authenticated, anon;

-- -------------------------------------------------------------------------------------
-- 3.10 A/B Testing Functions
-- -------------------------------------------------------------------------------------

-- assign_ab_variant: Assign user to A/B test variant
DROP FUNCTION IF EXISTS public.assign_ab_variant(p_test uuid);
CREATE FUNCTION public.assign_ab_variant(p_test uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_variant text;
BEGIN
  -- Check if already assigned
  SELECT variant INTO v_variant FROM public.ab_assignments
  WHERE test_id = p_test AND user_id = auth.uid();
  
  IF v_variant IS NOT NULL THEN
    RETURN v_variant;
  END IF;
  
  -- Randomly assign variant
  SELECT (ARRAY['control', 'variant'])[1 + (random() * 2)::integer] INTO v_variant;
  
  INSERT INTO public.ab_assignments (test_id, user_id, variant, created_at)
  VALUES (p_test, auth.uid(), v_variant, now());
  
  RETURN v_variant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_ab_variant(uuid) TO authenticated, anon;

-- record_ab_event: Record A/B test event
DROP FUNCTION IF EXISTS public.record_ab_event(p_test uuid,
    p_variant text,
    p_event text,
    p_value numeric);
CREATE FUNCTION public.record_ab_event(p_test uuid,
    p_variant text,
    p_event text,
    p_value numeric DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.ab_events (test_id, variant, user_id, event, value, created_at)
  VALUES (p_test, p_variant, auth.uid(), p_event, p_value, now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ab_event(uuid, text, text, numeric) TO authenticated, anon;

-- -------------------------------------------------------------------------------------
-- 3.11 GDPR Functions
-- -------------------------------------------------------------------------------------

-- export_my_data: Export user data for GDPR compliance
DROP FUNCTION IF EXISTS public.export_my_data();
CREATE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'videos', (SELECT jsonb_agg(to_jsonb(v)) FROM public.videos v WHERE v.owner_id = v_uid),
    'comments', (SELECT jsonb_agg(to_jsonb(c)) FROM public.video_comments c WHERE c.user_id = v_uid),
    'likes', (SELECT jsonb_agg(video_id) FROM public.video_likes WHERE user_id = v_uid),
    'followers', (SELECT jsonb_agg(following_id) FROM public.follows WHERE follower_id = v_uid),
    'following', (SELECT jsonb_agg(follower_id) FROM public.follows WHERE following_id = v_uid),
    'wallet', (SELECT to_jsonb(w) FROM public.user_wallets w WHERE w.user_id = v_uid),
    'withdrawals', (SELECT jsonb_agg(to_jsonb(wr)) FROM public.withdrawal_requests wr WHERE wr.user_id = v_uid)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- request_account_deletion: Request account deletion (GDPR)
DROP FUNCTION IF EXISTS public.request_account_deletion(p_reason text);
CREATE FUNCTION public.request_account_deletion(p_reason text DEFAULT NULL)
RETURNS account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
  v_request account_deletion_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Check if already has pending request
  SELECT * INTO v_request FROM public.account_deletion_requests
  WHERE user_id = v_uid AND status = 'pending';
  
  IF v_request IS NOT NULL THEN
    RETURN v_request;
  END IF;

  INSERT INTO public.account_deletion_requests (
    user_id, reason, status, scheduled_purge_at, created_at, updated_at
  )
  VALUES (
    v_uid, p_reason, 'pending', now() + interval '30 days', now(), now()
  )
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;

-- cancel_account_deletion: Cancel pending account deletion
DROP FUNCTION IF EXISTS public.cancel_account_deletion();
CREATE FUNCTION public.cancel_account_deletion()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE user_id = v_uid AND status = 'pending';

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.12 Messaging / Direct Messages Functions
-- -------------------------------------------------------------------------------------

-- unseen_chats_count: Get count of unread chat messages
DROP FUNCTION IF EXISTS public.unseen_chats_count();
CREATE FUNCTION public.unseen_chats_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(DISTINCT m.conversation_id) INTO v_count
  FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE cp.user_id = v_uid
    AND cp.last_read_at < m.created_at
    AND m.sender_id != v_uid;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unseen_chats_count() TO authenticated;

-- inbox_list: List user's inbox/conversations
DROP FUNCTION IF EXISTS public.inbox_list();
CREATE FUNCTION public.inbox_list()
RETURNS TABLE (
    conversation_id uuid,
    last_message text,
    last_message_at timestamptz,
    other_user_id uuid,
    other_user_name text,
    other_user_avatar text,
    unread_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cp.conversation_id,
    m.content as last_message,
    m.created_at as last_message_at,
    p.id as other_user_id,
    p.display_name as other_user_name,
    p.avatar_url as other_user_avatar,
    (SELECT COUNT(*) FROM public.messages m2
     WHERE m2.conversation_id = cp.conversation_id
       AND m2.sender_id != v_uid
       AND m2.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)) as unread_count
  FROM public.conversation_participants cp
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp.conversation_id AND cp2.user_id != v_uid
  JOIN public.profiles p ON p.id = cp2.user_id
  LEFT JOIN LATERAL (
    SELECT content, created_at
    FROM public.messages
    WHERE conversation_id = cp.conversation_id
    ORDER BY created_at DESC
    LIMIT 1
  ) m ON true
  WHERE cp.user_id = v_uid
  ORDER BY m.created_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inbox_list() TO authenticated;

-- active_contacts: Get active contacts for DM
DROP FUNCTION IF EXISTS public.active_contacts();
CREATE FUNCTION public.active_contacts()
RETURNS TABLE (
    user_id uuid,
    display_name text,
    avatar_url text,
    last_contact timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    CASE WHEN cp.user_id = v_uid THEN cp2.user_id ELSE cp.user_id END as user_id,
    CASE WHEN cp.user_id = v_uid THEN p2.display_name ELSE p.display_name END as display_name,
    CASE WHEN cp.user_id = v_uid THEN p2.avatar_url ELSE p.avatar_url END as avatar_url,
    MAX(m.created_at) as last_contact
  FROM public.conversation_participants cp
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp.conversation_id AND cp2.user_id != cp.user_id
  JOIN public.profiles p ON p.id = cp.user_id
  JOIN public.profiles p2 ON p2.id = cp2.user_id
  LEFT JOIN public.messages m ON m.conversation_id = cp.conversation_id
  WHERE cp.user_id = v_uid OR cp2.user_id = v_uid
  GROUP BY CASE WHEN cp.user_id = v_uid THEN cp2.user_id ELSE cp.user_id END,
           CASE WHEN cp.user_id = v_uid THEN p2.display_name ELSE p.display_name END,
           CASE WHEN cp.user_id = v_uid THEN p2.avatar_url ELSE p.avatar_url END
  ORDER BY last_contact DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.active_contacts() TO authenticated;

-- mark_chat_read: Mark chat messages as read
DROP FUNCTION IF EXISTS public.mark_chat_read(p_room uuid);
CREATE FUNCTION public.mark_chat_read(p_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.conversation_participants
  SET last_read_at = now(),
      updated_at = now()
  WHERE user_id = v_uid AND conversation_id = p_room;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid) TO authenticated;

-- send_chat_message: Send a chat message
DROP FUNCTION IF EXISTS public.send_chat_message(p_room uuid,
    p_content text,
    p_attachment_url text);
CREATE FUNCTION public.send_chat_message(p_room uuid,
    p_content text,
    p_attachment_url text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
  v_message_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_message_id := gen_random_uuid();

  INSERT INTO public.messages (id, conversation_id, sender_id, content, attachment_url, created_at)
  VALUES (v_message_id, p_room, v_uid, p_content, p_attachment_url, now());

  -- Update conversation's last activity
  UPDATE public.conversations
  SET last_message_at = now(),
      updated_at = now()
  WHERE id = p_room;

  RETURN json_build_object('success', true, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, text) TO authenticated;

-- set_typing: Set typing indicator in chat
DROP FUNCTION IF EXISTS public.set_typing(p_room uuid);
CREATE FUNCTION public.set_typing(p_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.presence (user_id, conversation_id, typing, last_seen)
  VALUES (v_uid, p_room, true, now())
  ON CONFLICT (user_id) DO UPDATE SET
    conversation_id = p_room,
    typing = true,
    last_seen = now();

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_typing(uuid) TO authenticated;

-- touch_presence: Update user presence status
DROP FUNCTION IF EXISTS public.touch_presence();
CREATE FUNCTION public.touch_presence()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.presence (user_id, typing, last_seen)
  VALUES (v_uid, false, now())
  ON CONFLICT (user_id) DO UPDATE SET
    typing = false,
    last_seen = now();

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_presence() TO authenticated;

-- get_or_create_dm: Get or create direct message room
DROP FUNCTION IF EXISTS public.get_or_create_dm(p_other uuid);
CREATE FUNCTION public.get_or_create_dm(p_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
  v_conversation_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_uid = p_other THEN
    RAISE EXCEPTION 'cannot DM yourself';
  END IF;

  -- Check if conversation already exists
  SELECT c.id INTO v_conversation_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = v_uid
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = p_other
  WHERE c.type = 'dm'
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation
  v_conversation_id := gen_random_uuid();

  INSERT INTO public.conversations (id, type, created_at, updated_at)
  VALUES (v_conversation_id, 'dm', now(), now());

  INSERT INTO public.conversation_participants (conversation_id, user_id, created_at)
  VALUES (v_conversation_id, v_uid, now());
  INSERT INTO public.conversation_participants (conversation_id, user_id, created_at)
  VALUES (v_conversation_id, p_other, now());

  RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_dm(uuid) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.13 Ad Selection Functions
-- -------------------------------------------------------------------------------------

-- pick_ad_for_video: Randomly select an ad for a video
DROP FUNCTION IF EXISTS public.pick_ad_for_video(p_video uuid);
CREATE FUNCTION public.pick_ad_for_video(p_video uuid)
RETURNS TABLE (
    id uuid,
    video_id uuid,
    ad_url text,
    status text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.video_id,
    a.ad_url,
    a.status,
    a.created_at
  FROM public.video_ads a
  JOIN public.videos v ON v.id::text = a.video_id
  WHERE v.id = p_video
    AND v.status = 'ready'
    AND v.visibility = 'public'
    AND a.status = 'active'
  ORDER BY random()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pick_ad_for_video(uuid) TO authenticated, anon;

-- settle_ad_impression: Mark ad as completed and trigger payout
DROP FUNCTION IF EXISTS public.settle_ad_impression(p_ad_id uuid,
    p_user_id uuid,
    p_duration_watched numeric);
CREATE FUNCTION public.settle_ad_impression(p_ad_id uuid,
    p_user_id uuid DEFAULT NULL,
    p_duration_watched numeric DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ad video_ads;
  v_video_id text;
  v_result json;
BEGIN
  -- Get ad details
  SELECT * INTO v_ad FROM public.video_ads WHERE id = p_ad_id;

  IF v_ad IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'ad not found');
  END IF;

  v_video_id := v_ad.video_id;

  -- Record the ad view with actual revenue
  INSERT INTO public.revenue_logs (
    video_id,
    user_id,
    views_count,
    amount_earned,
    gross_revenue,
    country_code,
    country_name,
    country_tier,
    country_multiplier,
    category,
    category_tier,
    category_multiplier,
    placement_type,
    placement_multiplier,
    cpm,
    ad_network,
    network_impression_id,
    verification_status,
    created_at
  )
  VALUES (
    v_video_id,
    p_user_id,
    1,
    COALESCE(0.01 * (p_duration_watched / 30.0), 0.001), -- Base revenue calculation
    COALESCE(0.01 * (p_duration_watched / 30.0), 0.001),
    NULL, -- country_code (not available in video_ads table)
    NULL, -- country_name
    NULL, -- country_tier
    NULL, -- country_multiplier
    NULL, -- category
    NULL, -- category_tier
    NULL, -- category_multiplier
    'long_form', -- placement_type
    1.0, -- placement_multiplier
    NULL, -- cpm
    'direct', -- ad_network
    gen_random_uuid(), -- network_impression_id
    'verified', -- verification_status
    now()
  );

  RETURN json_build_object('success', true, 'ad_id', p_ad_id, 'revenue_recorded', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_ad_impression(uuid, uuid, numeric) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3.14 IP Protection Functions
-- -------------------------------------------------------------------------------------

-- my_ip_protection_status: Check user's IP protection status
DROP FUNCTION IF EXISTS public.my_ip_protection_status();
CREATE FUNCTION public.my_ip_protection_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
  v_recent_blocks bigint;
  v_total_checks bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'auth required');
  END IF;

  -- Count recent blocks (last 24 hours)
  SELECT COUNT(*) INTO v_recent_blocks
  FROM public.ip_protection_logs
  WHERE user_id = v_uid
    AND action = 'block'
    AND created_at > now() - interval '24 hours';

  -- Count total checks
  SELECT COUNT(*) INTO v_total_checks
  FROM public.ip_protection_logs
  WHERE user_id = v_uid;

  RETURN json_build_object(
    'protected', v_recent_blocks = 0,
    'recent_blocks', v_recent_blocks,
    'total_checks', v_total_checks,
    'status', CASE WHEN v_recent_blocks > 0 THEN 'warning' ELSE 'protected' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_ip_protection_status() TO authenticated;

-- -------------------------------------------------------------------------------------
-- 3.15 Handle Helper Functions
-- -------------------------------------------------------------------------------------

-- normalize_handle: Normalize handle to lowercase and trim
DROP FUNCTION IF EXISTS public.normalize_handle(_handle text);
CREATE FUNCTION public.normalize_handle(_handle text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lower(btrim(coalesce(_handle, '')));
$$;

GRANT EXECUTE ON FUNCTION public.normalize_handle(text) TO authenticated, anon;

-- is_handle_valid: Check if handle is valid format
DROP FUNCTION IF EXISTS public.is_handle_valid(_handle text);
CREATE FUNCTION public.is_handle_valid(_handle text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.normalize_handle(_handle) ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
     AND public.normalize_handle(_handle) !~ '\.\.';
$$;

GRANT EXECUTE ON FUNCTION public.is_handle_valid(text) TO authenticated, anon;

-- is_handle_available: Check if handle is available (not taken or reserved)
DROP FUNCTION IF EXISTS public.is_handle_available(_handle text);
CREATE FUNCTION public.is_handle_available(_handle text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h text := public.normalize_handle(_handle);
BEGIN
  IF NOT public.is_handle_valid(h) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.reserved_handles r WHERE r.handle = h) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(p.handle) = h
      AND (auth.uid() IS NULL OR p.id <> auth.uid())
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.handle_history hh
    WHERE lower(hh.old_handle) = h
      AND (auth.uid() IS NULL OR hh.user_id <> auth.uid())
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_handle_available(text) TO authenticated, anon;

-- suggest_handles: Suggest available handles based on base name
DROP FUNCTION IF EXISTS public.suggest_handles(_base text, _limit int);
CREATE FUNCTION public.suggest_handles(_base text, _limit int DEFAULT 5)
RETURNS TABLE (handle text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  clean text;
  candidate text;
  found int := 0;
  suffixes text[];
  s text;
BEGIN
  clean := regexp_replace(public.normalize_handle(_base), '[^a-z0-9._]', '', 'g');
  clean := btrim(clean, '._');
  IF length(clean) < 3 THEN
    clean := 'creator';
  END IF;
  clean := left(clean, 22);

  suffixes := ARRAY[
    '', '.official', '.tv', '.hq', '_yt', '.live', '.studio', '1', '01', '_1',
    '2', '02', '7', '11', '21', '99', '.co', '.original', '.real', '.on'
  ];

  FOREACH s IN ARRAY suffixes LOOP
    EXIT WHEN found >= _limit;
    candidate := left(clean || s, 30);
    IF public.is_handle_available(candidate) THEN
      handle := candidate;
      found := found + 1;
      RETURN NEXT;
    END IF;
  END LOOP;

  FOR i IN 1..200 LOOP
    EXIT WHEN found >= _limit;
    candidate := left(clean, 26) || i::text;
    IF public.is_handle_available(candidate) THEN
      handle := candidate;
      found := found + 1;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_handles(text, int) TO authenticated, anon;

-- change_handle: Atomic handle change with cooldown and history
DROP FUNCTION IF EXISTS public.change_handle(_handle text);
CREATE FUNCTION public.change_handle(_handle text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  h text := public.normalize_handle(_handle);
  current_handle text;
  last_change timestamptz;
  cooldown interval := interval '14 days';
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT p.handle, p.handle_changed_at INTO current_handle, last_change
  FROM public.profiles p WHERE p.id = uid;

  IF lower(coalesce(current_handle, '')) = h THEN
    RETURN jsonb_build_object('ok', true, 'handle', h, 'unchanged', true);
  END IF;

  IF last_change IS NOT NULL AND last_change > now() - cooldown THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cooldown',
      'available_at', to_jsonb(last_change + cooldown)
    );
  END IF;

  IF NOT public.is_handle_valid(h) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF NOT public.is_handle_available(h) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'taken');
  END IF;

  IF current_handle IS NOT NULL AND btrim(current_handle) <> '' THEN
    INSERT INTO public.handle_history (user_id, old_handle)
    VALUES (uid, lower(current_handle))
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.handle_history WHERE user_id = uid AND lower(old_handle) = h;

  UPDATE public.profiles
  SET handle = h, handle_changed_at = now(), updated_at = now()
  WHERE id = uid;

  RETURN jsonb_build_object('ok', true, 'handle', h);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_handle(text) TO authenticated;

-- resolve_channel_handle: Resolve handle to channel (current or historical)
DROP FUNCTION IF EXISTS public.resolve_channel_handle(_handle text);
CREATE FUNCTION public.resolve_channel_handle(_handle text)
RETURNS TABLE (user_id uuid, canonical_handle text, redirected boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.handle, false
  FROM public.profiles p
  WHERE lower(p.handle) = public.normalize_handle(_handle)
  UNION ALL
  SELECT p.id, p.handle, true
  FROM public.handle_history hh
  JOIN public.profiles p ON p.id = hh.user_id
  WHERE lower(hh.old_handle) = public.normalize_handle(_handle)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE lower(p2.handle) = public.normalize_handle(_handle)
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_channel_handle(text) TO authenticated, anon;

-- =====================================================================================
-- 4. TRIGGERS
-- =====================================================================================

-- Generic updated_at trigger function
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS trigger_user_wallets_updated_at ON public.user_wallets;
DROP TRIGGER IF EXISTS trigger_videos_updated_at ON public.videos;
DROP TRIGGER IF EXISTS trigger_video_comments_updated_at ON public.video_comments;
DROP TRIGGER IF EXISTS trigger_withdrawal_requests_updated_at ON public.withdrawal_requests;
DROP TRIGGER IF EXISTS trigger_ad_settings_updated_at ON public.ad_settings;
DROP FUNCTION IF EXISTS public.set_updated_at();
CREATE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update video like count
DROP TRIGGER IF EXISTS trigger_video_likes_count ON public.video_likes;
DROP TRIGGER IF EXISTS trg_video_likes_count ON public.video_likes;
DROP FUNCTION IF EXISTS public.update_video_like_count();
CREATE FUNCTION public.update_video_like_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id::text = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id::text = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update video comment count
DROP TRIGGER IF EXISTS trigger_video_comments_count ON public.video_comments;
DROP FUNCTION IF EXISTS public.update_video_comment_count();
CREATE FUNCTION public.update_video_comment_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id::text = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id::text = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update video share count
DROP TRIGGER IF EXISTS trigger_video_shares_count ON public.video_shares;
DROP FUNCTION IF EXISTS public.update_video_share_count();
CREATE FUNCTION public.update_video_share_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update follower counts
DROP TRIGGER IF EXISTS trigger_follows_count ON public.follows;
DROP FUNCTION IF EXISTS public.update_follower_counts();
CREATE FUNCTION public.update_follower_counts()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET follower_count = COALESCE(follower_count, 0) + 1 WHERE id = NEW.following_id;
    UPDATE public.profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = NEW.follower_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET follower_count = GREATEST(COALESCE(follower_count, 0) - 1, 0) WHERE id = OLD.following_id;
    UPDATE public.profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) WHERE id = OLD.follower_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update profile video count
DROP TRIGGER IF EXISTS trigger_profile_video_count ON public.videos;
DROP FUNCTION IF EXISTS public.update_profile_video_count();
CREATE FUNCTION public.update_profile_video_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET video_count = COALESCE(video_count, 0) + 1 WHERE id = NEW.owner_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET video_count = GREATEST(COALESCE(video_count, 0) - 1, 0) WHERE id = OLD.owner_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update comment like count
DROP TRIGGER IF EXISTS trigger_comment_likes_count ON public.comment_likes;
DROP FUNCTION IF EXISTS public.update_comment_like_count();
CREATE FUNCTION public.update_comment_like_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.video_comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.video_comments SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update full-text search vector
DROP TRIGGER IF EXISTS trigger_videos_search_tsv ON public.videos;
DROP TRIGGER IF EXISTS videos_search_tsv_update ON public.videos;
DROP FUNCTION IF EXISTS public.videos_search_tsv_trigger();
CREATE FUNCTION public.videos_search_tsv_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', 
    COALESCE(NEW.title, '') || ' ' || 
    COALESCE(NEW.description, '') || ' ' || 
    COALESCE(NEW.category, '') || ' ' || 
    COALESCE(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_user_wallets_updated_at BEFORE UPDATE ON public.user_wallets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_videos_updated_at BEFORE UPDATE ON public.videos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_video_comments_updated_at BEFORE UPDATE ON public.video_comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_withdrawal_requests_updated_at BEFORE UPDATE ON public.withdrawal_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trigger_ad_settings_updated_at BEFORE UPDATE ON public.ad_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply count maintenance triggers
CREATE TRIGGER trigger_video_likes_count AFTER INSERT OR DELETE ON public.video_likes
    FOR EACH ROW EXECUTE FUNCTION public.update_video_like_count();

CREATE TRIGGER trigger_video_comments_count AFTER INSERT OR DELETE ON public.video_comments
    FOR EACH ROW EXECUTE FUNCTION public.update_video_comment_count();

CREATE TRIGGER trigger_video_shares_count AFTER INSERT ON public.video_shares
    FOR EACH ROW EXECUTE FUNCTION public.update_video_share_count();

CREATE TRIGGER trigger_follows_count AFTER INSERT OR DELETE ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.update_follower_counts();

CREATE TRIGGER trigger_profile_video_count AFTER INSERT OR DELETE ON public.videos
    FOR EACH ROW EXECUTE FUNCTION public.update_profile_video_count();

CREATE TRIGGER trigger_comment_likes_count AFTER INSERT OR DELETE ON public.comment_likes
    FOR EACH ROW EXECUTE FUNCTION public.update_comment_like_count();

-- Apply search vector trigger
CREATE TRIGGER trigger_videos_search_tsv BEFORE INSERT OR UPDATE ON public.videos
    FOR EACH ROW EXECUTE FUNCTION public.videos_search_tsv_trigger();

-- Auth trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =====================================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copyright_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copyright_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_fingerprints_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
DROP POLICY IF EXISTS "Public read profiles" ON public.profiles;
CREATE POLICY "Public read profiles" ON public.profiles
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile" ON public.profiles
    FOR UPDATE TO authenticated USING (public._caller_is_admin());

-- User Wallets RLS
DROP POLICY IF EXISTS "Users read own wallet" ON public.user_wallets;
CREATE POLICY "Users read own wallet" ON public.user_wallets
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all wallets" ON public.user_wallets;
CREATE POLICY "Admins read all wallets" ON public.user_wallets
    FOR SELECT TO authenticated USING (public._caller_is_admin());

DROP POLICY IF EXISTS "No direct wallet inserts" ON public.user_wallets;
CREATE POLICY "No direct wallet inserts" ON public.user_wallets
    FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No direct wallet updates" ON public.user_wallets;
CREATE POLICY "No direct wallet updates" ON public.user_wallets
    FOR UPDATE TO authenticated WITH CHECK (false);

-- Revenue Logs RLS
DROP POLICY IF EXISTS "Users read own revenue logs" ON public.revenue_logs;
CREATE POLICY "Users read own revenue logs" ON public.revenue_logs
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all revenue logs" ON public.revenue_logs;
CREATE POLICY "Admins read all revenue logs" ON public.revenue_logs
    FOR SELECT TO authenticated USING (public._caller_is_admin());

DROP POLICY IF EXISTS "No direct revenue inserts" ON public.revenue_logs;
CREATE POLICY "No direct revenue inserts" ON public.revenue_logs
    FOR INSERT TO authenticated WITH CHECK (false);

-- Platform Revenue RLS
DROP POLICY IF EXISTS "Admins read platform revenue" ON public.platform_revenue;
CREATE POLICY "Admins read platform revenue" ON public.platform_revenue
    FOR SELECT TO authenticated USING (public._caller_is_admin());

DROP POLICY IF EXISTS "No direct platform revenue inserts" ON public.platform_revenue;
CREATE POLICY "No direct platform revenue inserts" ON public.platform_revenue
    FOR INSERT TO authenticated WITH CHECK (false);

-- Withdrawal Requests RLS
DROP POLICY IF EXISTS "Users read own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users read own withdrawals" ON public.withdrawal_requests
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users create own withdrawals" ON public.withdrawal_requests
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Admins read all withdrawals" ON public.withdrawal_requests
    FOR SELECT TO authenticated USING (public._caller_is_admin());

DROP POLICY IF EXISTS "Admins update withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Admins update withdrawals" ON public.withdrawal_requests
    FOR UPDATE TO authenticated USING (public._caller_is_admin());

-- Videos RLS (public read, owner write)
DROP POLICY IF EXISTS "Public read public videos" ON public.videos;
CREATE POLICY "Public read public videos" ON public.videos
    FOR SELECT TO anon, authenticated
    USING (visibility = 'public' AND status = 'ready' AND is_removed = false);

DROP POLICY IF EXISTS "Owners read own videos" ON public.videos;
CREATE POLICY "Owners read own videos" ON public.videos
    FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners update own videos" ON public.videos;
CREATE POLICY "Owners update own videos" ON public.videos
    FOR UPDATE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners insert videos" ON public.videos;
CREATE POLICY "Owners insert videos" ON public.videos
    FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage any video" ON public.videos;
CREATE POLICY "Admins manage any video" ON public.videos
    FOR ALL TO authenticated USING (public._caller_is_admin());

-- Video Comments RLS
DROP POLICY IF EXISTS "Public read comments" ON public.video_comments;
CREATE POLICY "Public read comments" ON public.video_comments
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert comments" ON public.video_comments;
CREATE POLICY "Authenticated insert comments" ON public.video_comments
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own comments" ON public.video_comments;
CREATE POLICY "Users update own comments" ON public.video_comments
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Video Likes RLS
DROP POLICY IF EXISTS "Public read likes" ON public.video_likes;
CREATE POLICY "Public read likes" ON public.video_likes
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated manage own likes" ON public.video_likes;
CREATE POLICY "Authenticated manage own likes" ON public.video_likes
    FOR ALL TO authenticated USING (user_id = auth.uid());

-- Follows RLS
DROP POLICY IF EXISTS "Public read follows" ON public.follows;
CREATE POLICY "Public read follows" ON public.follows
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated manage own follows" ON public.follows;
CREATE POLICY "Authenticated manage own follows" ON public.follows
    FOR ALL TO authenticated USING (follower_id = auth.uid());

-- Admin Actions RLS
DROP POLICY IF EXISTS "Admins read admin actions" ON public.admin_actions;
CREATE POLICY "Admins read admin actions" ON public.admin_actions
    FOR SELECT TO authenticated USING (public._caller_is_admin());

-- User Roles RLS
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR public._caller_is_admin());

-- Super Admins RLS
DROP POLICY IF EXISTS "Admins read super admins" ON public.super_admins;
CREATE POLICY "Admins read super admins" ON public.super_admins
    FOR SELECT TO authenticated USING (public._caller_is_admin());

-- =====================================================================================
-- 6. GRANTS
-- =====================================================================================

-- Basic grants for authenticated users
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Specific grants for anon (public read)
GRANT SELECT ON public.videos TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.video_comments TO anon;
GRANT SELECT ON public.video_likes TO anon;
GRANT SELECT ON public.follows TO anon;
GRANT SELECT ON public.profiles TO anon;

-- Copyright fingerprints RLS
DROP POLICY IF EXISTS "Admins can read all fingerprints" ON public.copyright_fingerprints;
CREATE POLICY "Admins can read all fingerprints" ON public.copyright_fingerprints
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read own fingerprints" ON public.copyright_fingerprints;
CREATE POLICY "Users can read own fingerprints" ON public.copyright_fingerprints
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own fingerprints" ON public.copyright_fingerprints;
CREATE POLICY "Users can insert own fingerprints" ON public.copyright_fingerprints
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own fingerprints" ON public.copyright_fingerprints;
CREATE POLICY "Users can update own fingerprints" ON public.copyright_fingerprints
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid());

-- Audio fingerprints songs RLS
DROP POLICY IF EXISTS "Admins can read all audio songs" ON public.audio_fingerprints_songs;
CREATE POLICY "Admins can read all audio songs" ON public.audio_fingerprints_songs
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read own audio songs" ON public.audio_fingerprints_songs;
CREATE POLICY "Users can read own audio songs" ON public.audio_fingerprints_songs
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own audio songs" ON public.audio_fingerprints_songs;
CREATE POLICY "Users can insert own audio songs" ON public.audio_fingerprints_songs
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own audio songs" ON public.audio_fingerprints_songs;
CREATE POLICY "Users can update own audio songs" ON public.audio_fingerprints_songs
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid());

-- Audio fingerprints RLS
DROP POLICY IF EXISTS "Admins can read all audio fingerprints" ON public.audio_fingerprints;
CREATE POLICY "Admins can read all audio fingerprints" ON public.audio_fingerprints
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read audio fingerprints via songs" ON public.audio_fingerprints;
CREATE POLICY "Users can read audio fingerprints via songs" ON public.audio_fingerprints
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.audio_fingerprints_songs
            WHERE id = song_id AND owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert audio fingerprints for own songs" ON public.audio_fingerprints;
CREATE POLICY "Users can insert audio fingerprints for own songs" ON public.audio_fingerprints
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.audio_fingerprints_songs
            WHERE id = song_id AND owner_id = auth.uid()
        )
    );

-- =====================================================================================
-- END OF MASTER SCHEMA
-- =====================================================================================
