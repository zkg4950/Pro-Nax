-- =====================================================================================
-- ProNax Sidebar Menu Table
-- Navigation menu items
-- =====================================================================================

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
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT SELECT ON public.sidebar_menu TO anon, authenticated;
GRANT ALL ON public.sidebar_menu TO service_role;
