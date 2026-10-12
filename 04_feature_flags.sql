-- =====================================================================================
-- ProNax Feature Flags Table
-- Feature toggles for controlled rollouts
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
    rollout_percent = EXCLUDED.rollout_percent,
    updated_at = now();

-- Grant permissions
GRANT SELECT ON public.feature_flags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
