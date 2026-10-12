-- Creator RPC Functions for Studio Operations
-- These functions replace direct table operations with proper RPC calls for audit trail

-- creator_update_video: Update video metadata (title, description, tags, category, visibility, monetization, thumbnail)
CREATE OR REPLACE FUNCTION public.creator_update_video(
  p_video_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_visibility text DEFAULT NULL,
  p_monetization_enabled boolean DEFAULT NULL,
  p_thumb_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_updated_video videos;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  
  -- Verify ownership
  SELECT owner_id INTO v_owner_id FROM public.videos WHERE id = p_video_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'video not found';
  END IF;
  IF v_owner_id <> v_uid THEN
    RAISE EXCEPTION 'forbidden: not video owner';
  END IF;
  
  -- Update video with provided fields
  UPDATE public.videos
  SET 
    title = COALESCE(p_title, title),
    description = COALESCE(p_description, description),
    tags = COALESCE(p_tags, tags),
    category = COALESCE(p_category, category),
    visibility = COALESCE(p_visibility, visibility),
    monetization_enabled = COALESCE(p_monetization_enabled, monetization_enabled),
    thumb_url = COALESCE(p_thumb_url, thumb_url),
    updated_at = now()
  WHERE id = p_video_id
  RETURNING * INTO v_updated_video;
  
  RETURN jsonb_build_object(
    'success', true,
    'video_id', v_updated_video.id::text,
    'title', v_updated_video.title
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_update_video(uuid, text, text, text[], text, text, boolean, text) TO authenticated;

-- creator_add_comment_reply: Add a reply to a comment
CREATE OR REPLACE FUNCTION public.creator_add_comment_reply(
  p_parent_comment_id uuid,
  p_reply_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_parent_comment video_comments;
  v_video_id uuid;
  v_new_comment video_comments;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_reply_text IS NULL OR length(trim(p_reply_text)) = 0 THEN
    RAISE EXCEPTION 'reply text cannot be empty';
  END IF;
  
  -- Get parent comment and verify video ownership
  SELECT * INTO v_parent_comment FROM public.video_comments WHERE id = p_parent_comment_id;
  IF v_parent_comment IS NULL THEN
    RAISE EXCEPTION 'parent comment not found';
  END IF;
  
  -- Verify user owns the video being commented on
  SELECT owner_id INTO v_video_id FROM public.videos WHERE id = v_parent_comment.video_id;
  IF v_video_id IS NULL THEN
    RAISE EXCEPTION 'video not found';
  END IF;
  IF v_video_id <> v_uid THEN
    RAISE EXCEPTION 'forbidden: not video owner';
  END IF;
  
  -- Insert reply
  INSERT INTO public.video_comments (video_id, user_id, parent_id, text)
  VALUES (v_parent_comment.video_id, v_uid, p_parent_comment_id, p_reply_text)
  RETURNING * INTO v_new_comment;
  
  RETURN jsonb_build_object(
    'success', true,
    'comment_id', v_new_comment.id::text,
    'text', v_new_comment.text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_add_comment_reply(uuid, text) TO authenticated;

-- creator_delete_comment: Delete a comment (only by video owner)
CREATE OR REPLACE FUNCTION public.creator_delete_comment(
  p_comment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comment video_comments;
  v_video_owner_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  
  -- Get comment and verify video ownership
  SELECT * INTO v_comment FROM public.video_comments WHERE id = p_comment_id;
  IF v_comment IS NULL THEN
    RAISE EXCEPTION 'comment not found';
  END IF;
  
  -- Verify user owns the video
  SELECT owner_id INTO v_video_owner_id FROM public.videos WHERE id = v_comment.video_id;
  IF v_video_owner_id IS NULL THEN
    RAISE EXCEPTION 'video not found';
  END IF;
  IF v_video_owner_id <> v_uid THEN
    RAISE EXCEPTION 'forbidden: not video owner';
  END IF;
  
  -- Delete comment
  DELETE FROM public.video_comments WHERE id = p_comment_id;
  
  RETURN jsonb_build_object('success', true, 'comment_id', p_comment_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_delete_comment(uuid) TO authenticated;

-- creator_update_profile: Update creator profile (display_name, avatar_url)
CREATE OR REPLACE FUNCTION public.creator_update_profile(
  p_display_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated_profile profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  
  -- Update profile with provided fields
  UPDATE public.profiles
  SET 
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = v_uid
  RETURNING * INTO v_updated_profile;
  
  RETURN jsonb_build_object(
    'success', true,
    'display_name', v_updated_profile.display_name,
    'avatar_url', v_updated_profile.avatar_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_update_profile(text, text) TO authenticated;

-- creator_update_video_visibility: Update video visibility only
CREATE OR REPLACE FUNCTION public.creator_update_video_visibility(
  p_video_id uuid,
  p_visibility text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_updated_video videos;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  
  -- Verify ownership
  SELECT owner_id INTO v_owner_id FROM public.videos WHERE id = p_video_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'video not found';
  END IF;
  IF v_owner_id <> v_uid THEN
    RAISE EXCEPTION 'forbidden: not video owner';
  END IF;
  
  -- Validate visibility value
  IF p_visibility NOT IN ('public', 'unlisted', 'private', 'draft') THEN
    RAISE EXCEPTION 'invalid visibility value';
  END IF;
  
  -- Update visibility
  UPDATE public.videos
  SET visibility = p_visibility, updated_at = now()
  WHERE id = p_video_id
  RETURNING * INTO v_updated_video;
  
  RETURN jsonb_build_object(
    'success', true,
    'video_id', v_updated_video.id::text,
    'visibility', v_updated_video.visibility
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_update_video_visibility(uuid, text) TO authenticated;
