/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { supabase } from '@/integrations/supabase/loose';

export interface StorageConfig {
  provider: string;
  account_id: string;
  bucket_name: string;
  access_key: string;
  secret_key: string;
  cdn_domain: string;
  chunked_uploads: boolean;
}

export interface StorageConfigValidation {
  success: boolean;
  configured: boolean;
  provider?: string;
  bucket?: string;
  cdn_domain?: string;
  chunked_uploads?: boolean;
  last_updated?: string;
  message?: string;
  error?: string;
}

export interface StorageConfigUpdateResult {
  success: boolean;
  message?: string;
  error?: string;
  provider?: string;
  bucket?: string;
}

/**
 * Securely update storage configuration via backend RPC
 * This ensures credentials are encrypted and stored securely
 */
export async function updateStorageConfig(config: {
  provider?: string;
  account_id: string;
  bucket_name: string;
  access_key: string;
  secret_key: string;
  cdn_domain: string;
  chunked_uploads?: boolean;
}): Promise<StorageConfigUpdateResult> {
  try {
    const { data, error } = await supabase.rpc('update_storage_config', {
      p_provider: config.provider || 'cloudflare_r2',
      p_account_id: config.account_id,
      p_bucket_name: config.bucket_name,
      p_access_key: config.access_key,
      p_secret_key: config.secret_key,
      p_cdn_domain: config.cdn_domain,
      p_chunked_uploads: config.chunked_uploads ?? true,
    });

    if (error) {
      console.error('[Storage Config] RPC error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return data as StorageConfigUpdateResult;
  } catch (err) {
    console.error('[Storage Config] Update failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

/**
 * Validate current storage configuration
 * Returns non-sensitive configuration status
 */
export async function validateStorageConfig(): Promise<StorageConfigValidation> {
  try {
    const { data, error } = await supabase.rpc('validate_storage_config');

    if (error) {
      console.error('[Storage Config] Validation error:', error);
      return {
        success: false,
        configured: false,
        error: error.message,
      };
    }

    return data as StorageConfigValidation;
  } catch (err) {
    console.error('[Storage Config] Validation failed:', err);
    return {
      success: false,
      configured: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get active storage configuration (service role only)
 * This should only be called from backend services
 */
export async function getActiveStorageConfig(): Promise<StorageConfig | null> {
  try {
    const { data, error } = await supabase.rpc('get_active_storage_config');

    if (error) {
      console.error('[Storage Config] Get config error:', error);
      return null;
    }

    if (Array.isArray(data) && data.length > 0) {
      return data[0] as StorageConfig;
    }

    return null;
  } catch (err) {
    console.error('[Storage Config] Get config failed:', err);
    return null;
  }
}