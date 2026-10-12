-- =====================================================================================
-- ProNax App Settings Table
-- App features, algorithm weights, and homepage configuration
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
