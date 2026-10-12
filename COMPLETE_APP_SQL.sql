-- =====================================================================================
-- ProNax Complete App SQL
-- All tables and data needed for app to work properly
-- Run this AFTER master_schema_and_functions.sql
-- =====================================================================================

-- =====================================================================================
-- 1. Fix app_settings table structure
-- =====================================================================================

-- Drop and recreate app_settings with proper structure
DROP TABLE IF EXISTS public.app_settings CASCADE;

CREATE TABLE public.app_settings (
    id integer PRIMARY KEY CHECK (id = 1),
    app_name text DEFAULT 'Pro Nax',
    app_tagline text DEFAULT 'Watch, create, earn',
    logo_url text,
    accent_hex text DEFAULT '#3b82f6',
    feature_uploads boolean DEFAULT true,
    feature_live boolean DEFAULT true,
    feature_shorts boolean DEFAULT true,
    feature_comments boolean DEFAULT true,
    feature_ads boolean DEFAULT true,
    feature_wallet boolean DEFAULT true,
    feature_downloads boolean DEFAULT true,
    homepage_sections text[] DEFAULT ARRAY['trending', 'live', 'shorts', 'foryou', 'new'],
    algo_category_affinity numeric DEFAULT 8,
    algo_freshness_boost numeric DEFAULT 25,
    algo_ctr_weight numeric DEFAULT 50,
    algo_retention_weight numeric DEFAULT 140,
    algo_watched_penalty numeric DEFAULT 60,
    updated_at timestamptz DEFAULT now()
);

-- Insert default settings
INSERT INTO public.app_settings (
    id, app_name, app_tagline, accent_hex,
    feature_uploads, feature_live, feature_shorts, feature_comments,
    feature_ads, feature_wallet, feature_downloads,
    homepage_sections,
    algo_category_affinity, algo_freshness_boost, algo_ctr_weight,
    algo_retention_weight, algo_watched_penalty
) VALUES (
    1, 'Pro Nax', 'Watch, create, earn', '#3b82f6',
    true, true, true, true,
    true, true, true,
    ARRAY['trending', 'live', 'shorts', 'foryou', 'new'],
    8, 25, 50, 140, 60
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Public read app settings" ON public.app_settings;
CREATE POLICY "Public read app settings" ON public.app_settings
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins update app settings" ON public.app_settings;
CREATE POLICY "Admins update app settings" ON public.app_settings
    FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Grant permissions
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- =====================================================================================
-- 2. system_config - Default data
-- =====================================================================================

-- Insert default system config
INSERT INTO public.system_config (id, site_name, site_description, logo_url, favicon_url, primary_color, maintenance_mode, signup_enabled, uploads_enabled, ads_enabled, min_withdrawal, extra, created_at, updated_at)
VALUES (
    1,
    'ProNax',
    'Watch, create, earn',
    NULL,
    NULL,
    '#ff0000',
    false,
    true,
    true,
    true,
    10,
    '{}'::jsonb,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    site_name = EXCLUDED.site_name,
    site_description = EXCLUDED.site_description,
    primary_color = EXCLUDED.primary_color,
    maintenance_mode = EXCLUDED.maintenance_mode,
    signup_enabled = EXCLUDED.signup_enabled,
    uploads_enabled = EXCLUDED.uploads_enabled,
    ads_enabled = EXCLUDED.ads_enabled,
    min_withdrawal = EXCLUDED.min_withdrawal,
    updated_at = now();

-- Grant permissions
GRANT SELECT, UPDATE ON public.system_config TO authenticated;
GRANT SELECT ON public.system_config TO anon;
GRANT ALL ON public.system_config TO service_role;

-- =====================================================================================
-- 3. feature_flags - Default data
-- =====================================================================================

-- Insert default feature flags
INSERT INTO public.feature_flags (key, enabled, description, rollout_percent, created_at, updated_at)
VALUES
    ('homepage_v2', true, 'New homepage design', 100, now(), now()),
    ('shorts_feed', true, 'Vertical shorts experience', 100, now(), now()),
    ('live_streaming', true, 'Live streaming feature', 100, now(), now()),
    ('creator_wallet', true, 'Creator wallet and earnings', 100, now(), now()),
    ('video_upload', true, 'Video upload functionality', 100, now(), now()),
    ('comments', true, 'Comments system', 100, now(), now()),
    ('ads', true, 'Advertisement system', 100, now(), now()),
    ('downloads', true, 'Video downloads', 100, now(), now()),
    ('playlists', true, 'Playlist feature', 100, now(), now()),
    ('community_posts', true, 'Creator community posts', 100, now(), now())
ON CONFLICT (key) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    description = EXCLUDED.description,
    rollout_percent = EXCLUDED.rollout_percent;

-- Grant permissions
GRANT SELECT ON public.feature_flags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

-- =====================================================================================
-- 4. categories - Default data
-- =====================================================================================

-- Insert default categories
INSERT INTO public.categories (slug, name, icon, "position", enabled, created_at)
VALUES
    ('music', 'Music', '🎵', 1, true, now()),
    ('gaming', 'Gaming', '🎮', 2, true, now()),
    ('education', 'Education', '📚', 3, true, now()),
    ('entertainment', 'Entertainment', '🎬', 4, true, now()),
    ('sports', 'Sports', '⚽', 5, true, now()),
    ('technology', 'Technology', '💻', 6, true, now()),
    ('comedy', 'Comedy', '😂', 7, true, now()),
    ('news', 'News', '📰', 8, true, now()),
    ('lifestyle', 'Lifestyle', '🌟', 9, true, now()),
    ('science', 'Science', '🔬', 10, true, now())
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    "position" = EXCLUDED."position",
    enabled = EXCLUDED.enabled;

-- Grant permissions
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;

-- =====================================================================================
-- 5. sidebar_menu - Default data
-- =====================================================================================

-- Add unique constraint on (section, label) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.sidebar_menu'::regclass 
    AND conname = 'sidebar_menu_section_label_unique'
  ) THEN
    ALTER TABLE public.sidebar_menu ADD CONSTRAINT sidebar_menu_section_label_unique UNIQUE (section, label);
  END IF;
END $$;

-- Insert default sidebar menu items
INSERT INTO public.sidebar_menu (section, label, icon, href, "position", enabled, created_at)
VALUES
    ('sidebar', 'Home', 'Home', '/', 1, true, now()),
    ('sidebar', 'Shorts', 'Film', '/shorts', 2, true, now()),
    ('sidebar', 'Explore', 'Compass', '/explore', 3, true, now()),
    ('sidebar', 'Live', 'Radio', '/live', 4, true, now()),
    ('sidebar', 'Library', 'BookOpen', '/library', 5, true, now()),
    ('sidebar', 'History', 'History', '/history', 6, true, now()),
    ('sidebar', 'Saved', 'Bookmark', '/saved', 7, true, now())
ON CONFLICT (section, label) DO NOTHING;

-- Grant permissions
GRANT SELECT ON public.sidebar_menu TO anon, authenticated;
GRANT ALL ON public.sidebar_menu TO service_role;

-- =====================================================================================
-- 6. ad_settings - Default data
-- =====================================================================================

-- Add unique constraint on slot if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.ad_settings'::regclass 
    AND conname = 'ad_settings_slot_unique'
  ) THEN
    ALTER TABLE public.ad_settings ADD CONSTRAINT ad_settings_slot_unique UNIQUE (slot);
  END IF;
END $$;

-- Insert default ad settings
INSERT INTO public.ad_settings (slot, kind, network, enabled, frequency, created_at, updated_at)
VALUES
    ('pre_roll', 'video', 'custom', false, 0, now(), now()),
    ('mid_roll', 'video', 'custom', false, 0, now(), now()),
    ('post_roll', 'video', 'custom', false, 0, now(), now()),
    ('banner_top', 'banner', 'custom', false, 0, now(), now()),
    ('banner_bottom', 'banner', 'custom', false, 0, now(), now())
ON CONFLICT (slot) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    frequency = EXCLUDED.frequency,
    updated_at = now();

-- Grant permissions
GRANT SELECT ON public.ad_settings TO anon, authenticated;
GRANT ALL ON public.ad_settings TO service_role;

-- =====================================================================================
-- 7. trending_sounds - Default data (empty, for reference)
-- =====================================================================================

-- No default data needed, table is for dynamic data

-- Grant permissions
GRANT SELECT ON public.trending_sounds TO anon, authenticated;
GRANT ALL ON public.trending_sounds TO service_role;

-- =====================================================================================
-- 8. challenges - Default data (empty, for reference)
-- =====================================================================================

-- No default data needed, table is for dynamic data

-- Grant permissions
GRANT SELECT ON public.challenges TO anon, authenticated;
GRANT ALL ON public.challenges TO service_role;

-- =====================================================================================
-- END OF COMPLETE APP SQL
-- =====================================================================================
