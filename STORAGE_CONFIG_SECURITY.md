# Secure Storage Configuration Setup Guide

## Overview
This document describes the secure storage configuration system implemented to eliminate hardcoded credentials and protect sensitive Cloudflare R2/S3 storage credentials.

## Security Improvements

### Before (Insecure)
- Hardcoded credentials in `AppControlTab.tsx`
- Plaintext storage in localStorage/sessionStorage
- No encryption for sensitive data
- Direct client-side credential handling

### After (Secure)
- No hardcoded credentials in code
- Server-side encryption using pgcrypto
- Secure RPC functions with admin-only access
- Proper validation and error handling
- Audit logging for configuration changes

## Setup Instructions

### 1. Generate Encryption Key
Generate a strong encryption key using OpenSSL:

```bash
openssl rand -base64 32
```

### 2. Configure Environment Variables
Add the encryption key to your `.env` file:

```env
APP_ENCRYPTION_KEY=your_generated_encryption_key_here
```

### 3. Set Encryption Key in Supabase
There are two ways to set the encryption key in Supabase:

#### Option A: Via Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run: `ALTER DATABASE postgres SET app.encryption_key TO 'your_encryption_key';`

#### Option B: Via Supabase CLI
```bash
supabase db execute --file=supabase/migrations/20260830100001_setup_encryption_key.sql
```

Then update the key in the database:
```sql
ALTER DATABASE postgres SET app.encryption_key TO 'your_encryption_key';
```

### 4. Run Migrations
Apply the new migrations to your database:

```bash
supabase db reset
# Or run individual migrations:
supabase db execute --file=supabase/migrations/20260830100000_secure_storage_config.sql
supabase db execute --file=supabase/migrations/20260830100001_setup_encryption_key.sql
```

### 5. Verify Installation
Test the setup by checking the functions are available:

```sql
-- Check if functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('update_storage_config', 'validate_storage_config', 'get_active_storage_config');
```

## Usage

### For Admin Users
1. Navigate to Admin Console → App Control Center
2. Fill in the R2/S3 storage configuration fields
3. Click "Save R2 Storage Config"
4. Credentials are encrypted and stored securely in the database

### For Developers
Use the provided utility functions in `src/lib/storage-config.ts`:

```typescript
import { updateStorageConfig, validateStorageConfig } from '@/lib/storage-config';

// Update configuration
const result = await updateStorageConfig({
  provider: 'cloudflare_r2',
  account_id: 'your_account_id',
  bucket_name: 'your_bucket',
  access_key: 'your_access_key',
  secret_key: 'your_secret_key',
  cdn_domain: 'https://cdn.example.com',
  chunked_uploads: true
});

// Validate configuration
const validation = await validateStorageConfig();
console.log('Storage configured:', validation.configured);
```

## Security Features

### 1. Server-Side Encryption
- Credentials are encrypted using PostgreSQL's pgcrypto
- Encryption key is stored in database configuration
- Decryption only happens server-side via secure functions

### 2. Access Control
- Only admin users can modify storage configuration
- Row Level Security (RLS) policies enforce access
- Service role bypass for backend operations

### 3. Audit Logging
- All configuration changes are logged to `audit_logs`
- Includes timestamp, user, and change details
- Non-sensitive data only in logs

### 4. Input Validation
- Client-side validation for immediate feedback
- Server-side validation for security
- URL format validation for CDN domains

### 5. Secure Storage
- No sensitive data in localStorage
- Encrypted storage in database
- Memory cleanup after operations

## Database Schema

### storage_config Table
```sql
CREATE TABLE storage_config (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  access_key TEXT NOT NULL,
  secret_key TEXT NOT NULL, -- Encrypted
  cdn_domain TEXT NOT NULL,
  chunked_uploads BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);
```

## API Functions

### update_storage_config()
Updates storage configuration with encryption.
- **Access:** Admin only
- **Security:** Encrypts secret key before storage
- **Logging:** Creates audit log entry

### validate_storage_config()
Validates current configuration without exposing secrets.
- **Access:** Admin only
- **Returns:** Non-sensitive configuration status

### get_active_storage_config()
Retrieves active configuration with decrypted credentials.
- **Access:** Service role only
- **Security:** Decrypts secret key server-side

## Troubleshooting

### Issue: "Encryption key not set"
**Solution:** Set the encryption key in Supabase database configuration.

### Issue: "Unauthorized: Admin access required"
**Solution:** Ensure the user has admin role in `admin_users` table.

### Issue: "Function does not exist"
**Solution:** Run the migration files to create the required functions.

### Issue: Credentials not saving
**Solution:** Check the Supabase logs for detailed error messages.

## Migration from Old System

If you were using the old localStorage-based system:

1. Export existing configuration from localStorage
2. Use the new admin interface to re-enter credentials
3. Clear old localStorage entries:
   ```javascript
   localStorage.removeItem('pronax_r2_account_id');
   localStorage.removeItem('pronax_r2_bucket');
   localStorage.removeItem('pronax_r2_access_key');
   localStorage.removeItem('pronax_r2_secret_key');
   sessionStorage.removeItem('pronax_r2_secret_session');
   ```

## Security Best Practices

1. **Never commit encryption keys** to version control
2. **Rotate encryption keys** periodically
3. **Use strong, random keys** (32+ characters)
4. **Monitor audit logs** for unauthorized changes
5. **Limit admin access** to trusted personnel only
6. **Use environment variables** for sensitive configuration
7. **Enable Supabase RLS** on all tables
8. **Regular security audits** of access permissions

## Compliance

This implementation follows security best practices:
- ✅ No hardcoded credentials
- ✅ Server-side encryption
- ✅ Role-based access control
- ✅ Audit logging
- ✅ Input validation
- ✅ Secure error handling
- ✅ Data encryption at rest

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Supabase logs for detailed errors
3. Verify admin permissions in the database
4. Ensure encryption key is properly configured

---

**Generated:** 2026-08-30  
**Version:** 1.0.0  
**Security Level:** High