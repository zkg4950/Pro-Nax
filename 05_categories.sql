-- =====================================================================================
-- ProNax Categories Table
-- Video categories for classification
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
