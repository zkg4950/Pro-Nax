#!/usr/bin/env node

/**
 * Generate Encryption Key for ProNax Storage Configuration
 * 
 * This script generates a secure encryption key for the pgcrypto functions
 * that secure storage credentials in the database.
 * 
 * Usage: node scripts/generate-encryption-key.js
 */

const crypto = require('crypto');

function generateEncryptionKey() {
  // Generate 32 random bytes (256 bits) and encode as base64
  const key = crypto.randomBytes(32).toString('base64');
  
  console.log('========================================');
  console.log('🔐 ProNax Encryption Key Generator');
  console.log('========================================\n');
  console.log('Generated Encryption Key:');
  console.log(key);
  console.log('\n========================================');
  console.log('Setup Instructions:');
  console.log('========================================\n');
  console.log('1. Add this key to your .env file:');
  console.log('   APP_ENCRYPTION_KEY=' + key);
  console.log('\n2. Set it in Supabase database:');
  console.log('   ALTER DATABASE postgres SET app.encryption_key TO \'' + key + '\';');
  console.log('\n3. Run the migration:');
  console.log('   supabase db reset');
  console.log('\n⚠️  SECURITY WARNING:');
  console.log('   - Never commit this key to version control');
  console.log('   - Store it securely in your environment variables');
  console.log('   - Rotate keys periodically for best security');
  console.log('========================================\n');
}

try {
  generateEncryptionKey();
} catch (error) {
  console.error('Error generating encryption key:', error.message);
  process.exit(1);
}