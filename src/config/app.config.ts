/*
 * ProNax - Application Configuration
 * Copyright (c) 2026. All rights reserved.
 * 
 * Commercial Single-End Product License.
 * Reselling, distributing, sublicensing, or sharing this codebase 
 * or any portion thereof without explicit written permission is strictly prohibited.
 */

/**
 * Centralized Application Configuration
 * All environment variables and configuration settings are managed here
 * Copy .env.example to .env and fill in your credentials
 */

export interface AppConfig {
  app: {
    name: string;
    url: string;
    supportEmail: string;
    environment: 'development' | 'staging' | 'production';
  };
  supabase: {
    url: string;
    anonKey: string;
    publishableKey: string;
    serviceRoleKey?: string;
  };
  storage: {
    provider: 'r2' | 's3' | 'local';
    r2?: R2Config;
    s3?: S3Config;
    local?: LocalConfig;
  };
  streaming: {
    enabled: boolean;
    provider: 'mux' | 'custom';
    rtmpUrl?: string;
    muxPlaybackId?: string;
  };
  copyright: {
    enabled: boolean;
    audioFingerprintUrl?: string;
    detectionThreshold?: number;
    pythonServices?: PythonServicesConfig;
  };
  payments: {
    enabled: boolean;
    stripePublicKey?: string;
    stripeSecretKey?: string;
  };
  features: {
    maxVideoSizeMB: number;
    maxVideoDurationSeconds: number;
    allowedVideoFormats: string[];
    maxImageSizeMB: number;
    copyrightCheckSizeLimitMB: number;
  };
  security: {
    rateLimitEnabled: boolean;
    rateLimitRequestsPerMinute: number;
    corsEnabled: boolean;
  };
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export interface S3Config {
  region: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}

export interface LocalConfig {
  uploadPath: string;
  publicUrl: string;
}

export interface PythonServicesConfig {
  dbHost: string;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  dbPort: number;
  fingerprintLimit: number;
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue?: string): string {
  // Check client-side env variables (VITE_*)
  const clientKey = `VITE_${key}`;
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[clientKey]) {
    return import.meta.env[clientKey];
  }
  
  // Check server-side env variables
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || process.env[clientKey] || defaultValue || '';
  }
  
  return defaultValue || '';
}

/**
 * Get boolean environment variable
 */
function getBoolEnv(key: string, defaultValue: boolean = false): boolean {
  const value = getEnv(key);
  return value === 'true' || value === '1' || defaultValue;
}

/**
 * Get number environment variable
 */
function getNumberEnv(key: string, defaultValue: number = 0): number {
  const value = getEnv(key);
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Main configuration object
 */
export const config: AppConfig = {
  app: {
    name: getEnv('APP_NAME', 'ProNax'),
    url: getEnv('APP_URL', 'http://localhost:5173'),
    supportEmail: getEnv('SUPPORT_EMAIL', 'support@pronax.com'),
    environment: (getEnv('APP_ENVIRONMENT', 'development') as 'development' | 'staging' | 'production'),
  },
  
  supabase: {
    url: getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL'),
    anonKey: getEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || getEnv('SUPABASE_PUBLISHABLE_KEY'),
    publishableKey: getEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || getEnv('SUPABASE_PUBLISHABLE_KEY'),
    serviceRoleKey: getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  
  storage: {
    provider: (getEnv('STORAGE_PROVIDER', 'local') as 'r2' | 's3' | 'local'),
    r2: getEnv('STORAGE_PROVIDER') === 'r2' ? {
      accountId: getEnv('R2_ACCOUNT_ID'),
      accessKeyId: getEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getEnv('R2_SECRET_ACCESS_KEY'),
      bucketName: getEnv('R2_BUCKET_NAME', 'pronax-videos'),
      publicUrl: getEnv('R2_PUBLIC_URL'),
    } : undefined,
    s3: getEnv('STORAGE_PROVIDER') === 's3' ? {
      region: getEnv('S3_REGION', 'us-east-1'),
      bucketName: getEnv('S3_BUCKET_NAME'),
      accessKeyId: getEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: getEnv('S3_SECRET_ACCESS_KEY'),
      publicUrl: getEnv('S3_PUBLIC_URL'),
    } : undefined,
    local: getEnv('STORAGE_PROVIDER') === 'local' ? {
      uploadPath: getEnv('LOCAL_UPLOAD_PATH', './uploads'),
      publicUrl: getEnv('LOCAL_PUBLIC_URL', '/uploads'),
    } : undefined,
  },
  
  streaming: {
    enabled: getBoolEnv('STREAMING_ENABLED', false),
    provider: (getEnv('STREAMING_PROVIDER', 'mux') as 'mux' | 'custom'),
    rtmpUrl: getEnv('RTMP_URL'),
    muxPlaybackId: getEnv('MUX_PLAYBACK_ID'),
  },
  
  copyright: {
    enabled: getBoolEnv('COPYRIGHT_DETECTION_ENABLED', true),
    audioFingerprintUrl: getEnv('AUDIO_FINGERPRINT_URL', 'http://localhost:8000'),
    detectionThreshold: getNumberEnv('COPYRIGHT_DETECTION_THRESHOLD', 75),
    pythonServices: getBoolEnv('COPYRIGHT_DETECTION_ENABLED', true) ? {
      dbHost: getEnv('PYTHON_DB_HOST'),
      dbUser: getEnv('PYTHON_DB_USER'),
      dbPassword: getEnv('PYTHON_DB_PASSWORD'),
      dbName: getEnv('PYTHON_DB_NAME'),
      dbPort: getNumberEnv('PYTHON_DB_PORT', 5432),
      fingerprintLimit: getNumberEnv('PYTHON_FINGERPRINT_LIMIT', -1),
    } : undefined,
  },
  
  payments: {
    enabled: getBoolEnv('PAYMENTS_ENABLED', false),
    stripePublicKey: getEnv('STRIPE_PUBLIC_KEY'),
    stripeSecretKey: getEnv('STRIPE_SECRET_KEY'),
  },
  
  features: {
    maxVideoSizeMB: getNumberEnv('MAX_VIDEO_SIZE_MB', 2048),
    maxVideoDurationSeconds: getNumberEnv('MAX_VIDEO_DURATION_SECONDS', 3600),
    allowedVideoFormats: getEnv('ALLOWED_VIDEO_FORMATS', 'mp4,webm,mov,mkv').split(','),
    maxImageSizeMB: getNumberEnv('MAX_IMAGE_SIZE_MB', 8),
    copyrightCheckSizeLimitMB: getNumberEnv('COPYRIGHT_CHECK_SIZE_LIMIT_MB', 25),
  },
  
  security: {
    rateLimitEnabled: getBoolEnv('RATE_LIMIT_ENABLED', false),
    rateLimitRequestsPerMinute: getNumberEnv('RATE_LIMIT_REQUESTS_PER_MINUTE', 60),
    corsEnabled: getBoolEnv('CORS_ENABLED', true),
  },
};

/**
 * Validate required configuration
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.supabase.url) {
    errors.push('VITE_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!config.supabase.anonKey) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY is required');
  }
  if (!config.supabase.publishableKey) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY is required');
  }
  
  if (config.storage.provider === 'r2') {
    if (!config.storage.r2?.accountId) errors.push('R2_ACCOUNT_ID is required for R2 storage');
    if (!config.storage.r2?.accessKeyId) errors.push('R2_ACCESS_KEY_ID is required for R2 storage');
    if (!config.storage.r2?.secretAccessKey) errors.push('R2_SECRET_ACCESS_KEY is required for R2 storage');
  }
  
  if (config.streaming.enabled && !config.streaming.rtmpUrl) {
    errors.push('RTMP_URL is required when streaming is enabled');
  }
  
  if (config.copyright.enabled && !config.copyright.audioFingerprintUrl) {
    errors.push('AUDIO_FINGERPRINT_URL is required when copyright detection is enabled');
  }

  if (config.copyright.enabled && config.copyright.pythonServices) {
    if (!config.copyright.pythonServices.dbHost) {
      errors.push('PYTHON_DB_HOST is required when copyright detection is enabled');
    }
    if (!config.copyright.pythonServices.dbUser) {
      errors.push('PYTHON_DB_USER is required when copyright detection is enabled');
    }
    if (!config.copyright.pythonServices.dbPassword) {
      errors.push('PYTHON_DB_PASSWORD is required when copyright detection is enabled');
    }
    if (!config.copyright.pythonServices.dbName) {
      errors.push('PYTHON_DB_NAME is required when copyright detection is enabled');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration for display (hides sensitive data)
 */
export function getSafeConfig(): Partial<AppConfig> {
  return {
    ...config,
    supabase: {
      ...config.supabase,
      serviceRoleKey: config.supabase.serviceRoleKey ? '***HIDDEN***' : undefined,
    },
    storage: {
      ...config.storage,
      r2: config.storage.r2 ? {
        ...config.storage.r2,
        secretAccessKey: '***HIDDEN***',
      } : undefined,
      s3: config.storage.s3 ? {
        ...config.storage.s3,
        secretAccessKey: '***HIDDEN***',
      } : undefined,
    },
    payments: {
      ...config.payments,
      stripeSecretKey: config.payments.stripeSecretKey ? '***HIDDEN***' : undefined,
    },
    copyright: {
      ...config.copyright,
      pythonServices: config.copyright.pythonServices ? {
        ...config.copyright.pythonServices,
        dbPassword: '***HIDDEN***',
      } : undefined,
    },
  };
}

export default config;