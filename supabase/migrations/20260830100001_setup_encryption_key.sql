-- Setup Encryption Key for Secure Credential Storage
-- This migration sets up the encryption key required for pgcrypto functions

-- Note: The actual encryption key should be set via Supabase dashboard or CLI
-- This is a placeholder that will be replaced with the actual key

-- Set the encryption key as a PostgreSQL setting (using set_config which doesn't require superuser)
DO $$
BEGIN
  -- Set a placeholder key (this should be replaced in production)
  PERFORM set_config('app.encryption_key', 'CHANGE_THIS_TO_YOUR_ENCRYPTION_KEY', false);
  RAISE NOTICE 'Encryption key placeholder set. Please replace with actual key in production.';
END $$;

-- Note: ALTER DATABASE SET requires superuser permissions not available in Supabase
-- Use set_config() in DO block instead, or set the key via environment variables
