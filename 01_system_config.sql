-- =====================================================================================
-- ProNax System Config Table
-- System-wide configuration and maintenance mode
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
