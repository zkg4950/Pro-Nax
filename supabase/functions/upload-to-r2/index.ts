import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.450.0'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.450.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Get allowed origins from environment variable
function getAllowedOrigins(): string[] {
  const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS')
  return allowedOrigins ? allowedOrigins.split(',').map(o => o.trim()) : []
}

// Get CORS headers with origin check
function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins()
  const origin = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// Allowed file types
const ALLOWED_FILE_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
]

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

// Rate limit check using rate_limit_events table
async function checkRateLimit(userId: string): Promise<{ allowed: boolean }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()

    const { data: recentEvents } = await supabase
      .from('rate_limit_events')
      .select('id')
      .eq('user_id', userId)
      .eq('bucket', 'r2-presign')
      .gt('created_at', oneMinuteAgo)

    const count = recentEvents?.length || 0
    const limit = 20

    if (count >= limit) {
      return { allowed: false }
    }

    // Log this event
    await supabase.from('rate_limit_events').insert({
      user_id: userId,
      bucket: 'r2-presign',
      hits: 1,
      blocked: false,
    })

    return { allowed: true }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - allow request if rate limit check fails
    return { allowed: true }
  }
}

interface PresignedUrlRequest {
  fileName: string
  fileType: string
  fileSize: number
}

// Verify JWT token and return user ID
async function verifyAuth(req: Request): Promise<{ userId: string } | null> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return null
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return null
    }

    return { userId: data.user.id }
  } catch (error) {
    console.error('Auth verification failed:', error)
    return null
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const auth = await verifyAuth(req)
    if (!auth) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get R2 credentials from environment variables
    const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')
    const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')
    const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME')

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      console.error('[R2 Upload] Missing credentials:', {
        hasAccountId: !!R2_ACCOUNT_ID,
        hasAccessKeyId: !!R2_ACCESS_KEY_ID,
        hasSecretKey: !!R2_SECRET_ACCESS_KEY,
        hasBucketName: !!R2_BUCKET_NAME
      })
      
      return new Response(
        JSON.stringify({ 
          error: 'Cloudflare R2 storage not configured',
          code: 'R2_NOT_CONFIGURED',
          message: 'Video upload requires Cloudflare R2 credentials. Please configure the following environment variables in Supabase: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL',
          missingCredentials: {
            R2_ACCOUNT_ID: !!R2_ACCOUNT_ID,
            R2_ACCESS_KEY_ID: !!R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY: !!R2_SECRET_ACCESS_KEY,
            R2_BUCKET_NAME: !!R2_BUCKET_NAME
          }
        }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const { fileName, fileType, fileSize }: PresignedUrlRequest = await req.json()

    if (!fileName || !fileType) {
      return new Response(
        JSON.stringify({ error: 'fileName and fileType are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(fileType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid file type. Allowed types: ' + ALLOWED_FILE_TYPES.join(', ') }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate file size
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: 'File size exceeds maximum allowed size of 2GB' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(auth.userId)
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded: Maximum 20 presign requests per minute' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate unique file key with user-scoped prefix
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 15)
    // Strip characters that break plain URLs (#, ?, spaces, emoji, etc.)
    const safeName = String(fileName)
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(-120) || 'video.mp4'
    const fileKey = `${auth.userId}/${timestamp}-${randomString}-${safeName}`

    // Initialize S3 client for R2
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    // Create PutObject command
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
      ContentLength: fileSize,
    })

    // Generate pre-signed URL (valid for 1 hour)
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

    // Generate the public URL that will be accessible after upload
    // Using R2 public development URL
    const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') || `https://pub-${R2_ACCOUNT_ID}.r2.dev`
    const publicUrl = `${R2_PUBLIC_URL}/${fileKey}`

    return new Response(
      JSON.stringify({
        success: true,
        presignedUrl,
        fileKey,
        publicUrl
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error generating presigned URL:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate presigned URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
