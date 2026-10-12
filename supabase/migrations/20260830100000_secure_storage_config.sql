-- Secure Storage Configuration Management
-- This migration creates a secure system for managing storage credentials
-- without exposing sensitive data to the client

-- Create storage_config table to store encrypted storage configuration
CREATE TABLE IF NOT EXISTS public.storage_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'cloudflare_r2',
  account_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  access_key TEXT NOT NULL,
  secret_key TEXT NOT NULL, -- This will be encrypted using pgcrypto
  cdn_domain TEXT NOT NULL,
  chunked_uploads BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.storage_config ENABLE ROW LEVEL SECURITY;

-- Create policy: Only admins can manage storage configuration
CREATE POLICY "Admins can manage storage config"
  ON public.storage_config
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Create policy: Service role can bypass RLS for backend operations
CREATE POLICY "Service role full access"
  ON public.storage_config
  FOR ALL
  USING (auth.role() = 'service_role');

-- Create function to get active storage configuration (public for backend use)
CREATE OR REPLACE FUNCTION public.get_active_storage_config()
RETURNS TABLE (
  provider TEXT,
  account_id TEXT,
  bucket_name TEXT,
  access_key TEXT,
  secret_key TEXT,
  cdn_domain TEXT,
  chunked_uploads BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.provider,
    sc.account_id,
    sc.bucket_name,
    sc.access_key,
    -- Decrypt secret key using pgcrypto
    pgp_sym_decrypt(sc.secret_key::bytea, current_setting('app.encryption_key')) as secret_key,
    sc.cdn_domain,
    sc.chunked_uploads
  FROM public.storage_config sc
  WHERE sc.is_active = true
  LIMIT 1;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.get_active_storage_config TO service_role;

-- Drop function if exists to avoid parameter order conflicts
DROP FUNCTION IF EXISTS public.update_storage_config(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
);

-- Create function to update storage configuration (admin only)
CREATE OR REPLACE FUNCTION public.update_storage_config(
  p_account_id TEXT,
  p_bucket_name TEXT,
  p_access_key TEXT,
  p_secret_key TEXT,
  p_cdn_domain TEXT,
  p_provider TEXT DEFAULT 'cloudflare_r2',
  p_chunked_uploads BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_encrypted_secret TEXT;
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

  -- Encrypt the secret key using pgcrypto
  v_encrypted_secret := pgp_sym_encrypt(p_secret_key, current_setting('app.encryption_key'));

  -- Deactivate existing configs
  UPDATE public.storage_config SET is_active = false, updated_at = NOW();

  -- Insert new configuration
  INSERT INTO public.storage_config (
    provider, account_id, bucket_name, access_key,
    secret_key, cdn_domain, chunked_uploads,
    is_active, created_by, updated_by
  ) VALUES (
    p_provider, p_account_id, p_bucket_name, p_access_key,
    v_encrypted_secret, p_cdn_domain, p_chunked_uploads,
    true, auth.uid(), auth.uid()
  );

  -- Log the action in audit_logs
  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, actor_id,
    actor_email, severity, details
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_storage_config TO authenticated;

-- Create function to validate storage configuration (admin only)
CREATE OR REPLACE FUNCTION public.validate_storage_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config RECORD;
  v_result JSONB;
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.validate_storage_config TO authenticated;

-- Add comment to table
COMMENT ON TABLE public.storage_config IS 'Secure storage configuration with encrypted credentials';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_storage_config_active ON public.storage_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_storage_config_updated ON public.storage_config(updated_at DESC);
