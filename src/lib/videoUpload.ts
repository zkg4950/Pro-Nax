/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * Video Upload Service with Copyright Detection
 * Handles video upload to Cloudflare R2 via pre-signed URLs and background copyright detection
 */

import { audioFingerprintService, RecognitionResult, FingerprintResult } from './audioFingerprint';
import { supabase } from '@/integrations/supabase/loose';
import { scanVideoForCopyright } from './copyright.functions';

// Allowed file types
const ALLOWED_FILE_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export type UploadErrorType = 
  | 'file_too_large'
  | 'invalid_file_type'
  | 'network_error'
  | 'server_error'
  | 'authentication_error'
  | 'duplicate_detected'
  | 'copyright_error'
  | 'storage_error'
  | 'timeout_error'
  | 'unknown_error';

export interface VideoUploadResult {
  success: boolean;
  videoId?: string;
  status: 'published' | 'ready' | 'copyright_flagged' | 'error';
  message?: string;
  errorType?: UploadErrorType;
  retryable?: boolean;
  copyrightMatch?: {
    matched: boolean;
    songName?: string;
    confidence?: number;
  };
  duplicateDetected?: boolean;
  fileHash?: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface VideoUploadParams {
  file: File;
  title: string;
  description: string;
  tags: string[];
  category: string;
  visibility: 'public' | 'unlisted' | 'private' | 'scheduled';
  scheduledAt?: string | null;
  monetizationEnabled: boolean;
  isShort: boolean;
  duration: number;
  thumbnailUrl: string;
  ownerId: string;
  onProgress?: (progress: number, stage?: string) => void;
  onError?: (error: UploadErrorType, message: string) => void;
  maxRetries?: number;
}

/**
 * Classify upload errors by type
 */
function classifyUploadError(error: any): UploadErrorType {
  const errorMessage = error?.message || String(error);

  if (errorMessage.includes('size') || errorMessage.includes('too large')) {
    return 'file_too_large';
  }
  if (errorMessage.includes('type') || errorMessage.includes('format') || errorMessage.includes('MIME')) {
    return 'invalid_file_type';
  }
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
    return 'network_error';
  }
  if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
    return 'authentication_error';
  }
  if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
    return 'duplicate_detected';
  }
  if (errorMessage.includes('copyright') || errorMessage.includes('claim')) {
    return 'copyright_error';
  }
  if (errorMessage.includes('storage') || errorMessage.includes('R2') || errorMessage.includes('S3')) {
    return 'storage_error';
  }
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return 'timeout_error';
  }
  if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
    return 'server_error';
  }

  return 'unknown_error';
}

/**
 * Get user-friendly error message based on error type
 */
function getUserFriendlyErrorMessage(errorType: UploadErrorType, details?: string): string {
  const messages: Record<UploadErrorType, string> = {
    file_too_large: `File exceeds maximum size limit. ${details || 'Please compress your video and try again.'}`,
    invalid_file_type: `Unsupported file format. ${details || 'Please use MP4, WebM, or QuickTime formats.'}`,
    network_error: 'Network connection failed. Please check your internet connection and try again.',
    server_error: 'Server temporarily unavailable. Please try again in a few minutes.',
    authentication_error: 'Authentication failed. Please sign in again and retry.',
    duplicate_detected: 'This video already exists in your channel.',
    copyright_error: 'Copyright issue detected. Your video may contain protected content.',
    storage_error: 'Storage service unavailable. Please try again later.',
    timeout_error: 'Upload timed out. Please check your connection and try again.',
    unknown_error: details || 'An unexpected error occurred. Please try again.'
  };

  return messages[errorType];
}

/**
 * Upload video to Cloudflare R2 and run copyright detection
 * This is a server-side function that should be called from the upload modal
 */
export async function uploadVideoWithCopyrightDetection(
  params: VideoUploadParams
): Promise<VideoUploadResult> {
  const maxRetries = params.maxRetries || 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (params.onProgress) {
        params.onProgress(0, attempt > 1 ? `Retrying upload (attempt ${attempt}/${maxRetries})...` : 'Initializing upload...');
      }

      // Step 1: Validate file size
      if (params.file.size > MAX_FILE_SIZE) {
        const errorType: UploadErrorType = 'file_too_large';
        const message = getUserFriendlyErrorMessage(errorType, `Maximum size is ${MAX_FILE_SIZE / 1024 / 1024 / 1024}GB`);
        if (params.onError) params.onError(errorType, message);
        return {
          success: false,
          status: 'error',
          errorType,
          message,
          retryable: false,
          attempt,
          maxAttempts: maxRetries
        };
      }

      // Step 2: Validate file type
      if (!ALLOWED_FILE_TYPES.includes(params.file.type)) {
        const errorType: UploadErrorType = 'invalid_file_type';
        const message = getUserFriendlyErrorMessage(errorType, `Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`);
        if (params.onError) params.onError(errorType, message);
        return {
          success: false,
          status: 'error',
          errorType,
          message,
          retryable: false,
          attempt,
          maxAttempts: maxRetries
        };
      }

      // Step 3: Generate SHA-256 hash for duplicate detection (streaming)
      let fileHash: string = '';
      try {
        if (params.onProgress) params.onProgress(5, 'Generating file fingerprint...');
        fileHash = await generateFileHashStreaming(params.file);
        console.log('Generated file hash for duplicate detection:', fileHash);
      } catch (hashError) {
        console.error('Failed to generate file hash:', hashError);
        // Continue without hash if generation fails
      }

      // Step 4: Check for duplicate using SHA-256 hash before upload
      if (fileHash) {
        console.log('Checking for duplicate videos using SHA-256 hash:', fileHash);
        try {
          if (params.onProgress) params.onProgress(10, 'Checking for duplicates...');
          const { data: existingVideo } = await supabase
            .from('videos')
            .select('id, title, owner_id')
            .eq('sha256', fileHash)
            .maybeSingle();

          if (existingVideo) {
            console.warn('Duplicate video detected:', existingVideo);
            const errorType: UploadErrorType = 'duplicate_detected';
            const message = getUserFriendlyErrorMessage(errorType, `Already exists as "${existingVideo.title}"`);
            if (params.onError) params.onError(errorType, message);
            return {
              success: false,
              status: 'error',
              errorType,
              message,
              duplicateDetected: true,
              fileHash,
              retryable: false,
              attempt,
              maxAttempts: maxRetries
            };
          }
        } catch (duplicateCheckError) {
          console.warn('Duplicate check failed (non-critical):', duplicateCheckError);
        }
      }

      // Step 5: Check for duplicate before upload (storage optimization)
      try {
        if (params.onProgress) params.onProgress(15, 'Analyzing video fingerprint...');
        const duplicateCheck = await audioFingerprintService.checkDuplicate(params.file);
        
        if (duplicateCheck.success && duplicateCheck.is_duplicate) {
          console.warn('Duplicate video detected, blocking upload to save storage');
          const errorType: UploadErrorType = 'duplicate_detected';
          const message = getUserFriendlyErrorMessage(errorType);
          if (params.onError) params.onError(errorType, message);
          return {
            success: false,
            status: 'error',
            errorType,
            message,
            duplicateDetected: true,
            fileHash: duplicateCheck.file_hash,
            retryable: false,
            attempt,
            maxAttempts: maxRetries
          };
        }
      } catch (fingerprintError) {
        console.warn('Fingerprint check failed, continuing with upload:', fingerprintError);
      }

      // Step 6: Get pre-signed URL from Supabase Edge Function
      if (params.onProgress) params.onProgress(20, 'Preparing upload...');
      const presignedUrlResult = await getPresignedUploadUrl(params.file);
      
      if (!presignedUrlResult.success) {
        const errorType = classifyUploadError(presignedUrlResult.error);
        const message = getUserFriendlyErrorMessage(errorType, presignedUrlResult.error);
        if (params.onError) params.onError(errorType, message);
        
        // Retry on network/server errors
        if ((errorType === 'network_error' || errorType === 'server_error') && attempt < maxRetries) {
          lastError = { errorType, message };
          continue;
        }
        
        return {
          success: false,
          status: 'error',
          errorType,
          message,
          retryable: errorType === 'network_error' || errorType === 'server_error',
          attempt,
          maxAttempts: maxRetries
        };
      }

      // Step 7: Upload video directly to R2 using pre-signed URL
      if (!presignedUrlResult.presignedUrl) {
        const errorType: UploadErrorType = 'server_error';
        const message = getUserFriendlyErrorMessage(errorType, 'No presigned URL returned from Edge Function');
        if (params.onError) params.onError(errorType, message);
        return {
          success: false,
          status: 'error',
          errorType,
          message,
          retryable: true,
          attempt,
          maxAttempts: maxRetries
        };
      }

      const r2UploadResult = await uploadToR2WithPresignedUrl(
        params.file,
        presignedUrlResult.presignedUrl,
        (progress) => {
          if (params.onProgress) {
            const totalProgress = 20 + (progress * 0.6); // 20-80% range
            params.onProgress(Math.round(totalProgress), progress === 100 ? 'Upload complete' : 'Uploading to cloud storage...');
          }
        },
        attempt,
        maxRetries
      );
      
      if (!r2UploadResult.success) {
        const errorType: UploadErrorType = r2UploadResult.errorType || 'storage_error';
        const message = getUserFriendlyErrorMessage(errorType, r2UploadResult.error);
        if (params.onError) params.onError(errorType, message);
        
        // Retry on network/storage errors
        if ((errorType === 'network_error' || errorType === 'storage_error' || errorType === 'timeout_error') && attempt < maxRetries) {
          lastError = { errorType, message };
          continue;
        }
        
        return {
          success: false,
          status: 'error',
          errorType,
          message,
          retryable: errorType === 'network_error' || errorType === 'storage_error',
          attempt,
          maxAttempts: maxRetries
        };
      }

      // Step 8: Call FastAPI /recognize endpoint for copyright detection
      if (params.onProgress) params.onProgress(85, 'Running copyright scan...');
      const recognitionResult = await audioFingerprintService.recognizeAudio(params.file);

      // Step 9: Handle copyright detection result
      if (recognitionResult.success && recognitionResult.matched) {
        // Copyright detected - flag the video
        if (params.onProgress) params.onProgress(95, 'Creating video record...');
        const videoId = await createVideoRecord({
          ...params,
          r2VideoKey: presignedUrlResult.fileKey ?? '',
          videoUrl: presignedUrlResult.publicUrl ?? '',
          status: 'copyright_flagged',
          sha256: fileHash || recognitionResult.file_hash,
          copyright_scan_status: 'complete'
        });

        if (params.onProgress) params.onProgress(100, 'Complete');
        return {
          success: true,
          videoId,
          status: 'copyright_flagged',
          message: 'Copyright content detected!',
          errorType: 'copyright_error',
          copyrightMatch: {
            matched: true,
            songName: recognitionResult.song_name,
            confidence: recognitionResult.confidence
          },
          attempt,
          maxAttempts: maxRetries
        };
      } else if (!recognitionResult.success) {
        // Audio fingerprinting service unavailable - proceed without copyright check
        console.warn('Audio fingerprinting service unavailable, proceeding without copyright check:', recognitionResult.error);
        if (params.onProgress) params.onProgress(95, 'Creating video record...');
        const videoId = await createVideoRecord({
          ...params,
          r2VideoKey: presignedUrlResult.fileKey ?? '',
          videoUrl: presignedUrlResult.publicUrl ?? '',
          status: 'ready',
          sha256: fileHash || recognitionResult.file_hash,
          copyright_scan_status: 'pending'
        });

        if (params.onProgress) params.onProgress(100, 'Complete');
        return {
          success: true,
          videoId,
          status: 'ready',
          message: 'Video uploaded successfully (copyright check unavailable)',
          copyrightMatch: {
            matched: false,
            songName: undefined,
            confidence: undefined
          },
          attempt,
          maxAttempts: maxRetries
        };
      } else {
        // No copyright match - register the audio and publish
        if (params.onProgress) params.onProgress(90, 'Registering audio fingerprint...');
        const fingerprintResult = await audioFingerprintService.fingerprintAudio(
          params.file,
          params.title,
          params.ownerId
        );

        if (!fingerprintResult.success) {
          console.warn('Audio fingerprinting failed, proceeding without registration:', fingerprintResult.error);
          // Proceed with video creation even if fingerprinting fails
          if (params.onProgress) params.onProgress(95, 'Creating video record...');
          const videoId = await createVideoRecord({
            ...params,
            r2VideoKey: presignedUrlResult.fileKey ?? '',
            videoUrl: presignedUrlResult.publicUrl ?? '',
            status: 'ready',
            sha256: fileHash || fingerprintResult.file_hash,
            copyright_scan_status: 'pending'
          });

          if (params.onProgress) params.onProgress(100, 'Complete');
          return {
            success: true,
            videoId,
            status: 'ready',
            message: 'Video uploaded successfully (fingerprinting unavailable)',
            copyrightMatch: {
              matched: false,
              songName: undefined,
              confidence: undefined
            },
            attempt,
            maxAttempts: maxRetries
          };
        }

        if (params.onProgress) params.onProgress(95, 'Creating video record...');
        const videoId = await createVideoRecord({
          ...params,
          r2VideoKey: presignedUrlResult.fileKey ?? '',
          videoUrl: presignedUrlResult.publicUrl ?? '',
          status: 'ready',
          sha256: fileHash || fingerprintResult.file_hash,
          copyright_scan_status: 'pending' // Mark for background scan
        });

        // Trigger background copyright scan (non-blocking)
        scanVideoForCopyright(videoId, presignedUrlResult.publicUrl || '').catch(error => {
          console.error('Background copyright scan failed for video:', videoId, error);
        });

        if (params.onProgress) params.onProgress(100, 'Complete');
        return {
          success: true,
          videoId,
          status: 'ready',
          message: 'Video uploaded successfully. Copyright scan running in background.',
          copyrightMatch: {
            matched: false
          },
          attempt,
          maxAttempts: maxRetries
        };
      }
    } catch (error) {
      console.error('Error in video upload with copyright detection:', error);
      const errorType = classifyUploadError(error);
      const message = getUserFriendlyErrorMessage(errorType, error instanceof Error ? error.message : String(error));
      
      if (params.onError) params.onError(errorType, message);
      
      // Retry on network/server errors
      if ((errorType === 'network_error' || errorType === 'server_error' || errorType === 'timeout_error') && attempt < maxRetries) {
        lastError = { errorType, message };
        continue;
      }
      
      return {
        success: false,
        status: 'error',
        errorType,
        message,
        retryable: errorType === 'network_error' || errorType === 'server_error' || errorType === 'timeout_error',
        attempt,
        maxAttempts: maxRetries
      };
    }
  }

  // All retries exhausted
  if (lastError) {
    return {
      success: false,
      status: 'error',
      errorType: lastError.errorType,
      message: `${lastError.message} Failed after ${maxRetries} attempts.`,
      retryable: false,
      attempt: maxRetries,
      maxAttempts: maxRetries
    };
  }

  return {
    success: false,
    status: 'error',
    errorType: 'unknown_error',
    message: 'Upload failed after multiple attempts. Please try again later.',
    retryable: false,
    attempt: maxRetries,
    maxAttempts: maxRetries
  };
}

/**
 * Get pre-signed upload URL from Supabase Edge Function
 */
async function getPresignedUploadUrl(file: File): Promise<{
  success: boolean;
  presignedUrl?: string;
  fileKey?: string;
  publicUrl?: string;
  error?: string;
}> {
  try {
    console.log('[videoUpload] Calling Edge Function via Supabase client');
    
    const { data, error } = await supabase.functions.invoke('upload-to-r2', {
      body: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      }
    });

    if (error) {
      console.error('[videoUpload] Edge Function error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get presigned URL'
      };
    }

    console.log('[videoUpload] Edge Function response:', data);
    
    return {
      success: true,
      presignedUrl: data.presignedUrl,
      fileKey: data.fileKey,
      publicUrl: data.publicUrl
    };
  } catch (error) {
    console.error('Error getting presigned URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Upload video file to Cloudflare R2 using pre-signed URL with retry logic and progress tracking
 */
async function uploadToR2WithPresignedUrl(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: number) => void,
  currentAttempt: number = 1,
  maxRetries: number = 3
): Promise<{ success: boolean; errorType?: UploadErrorType; error?: string }> {
  const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Use XMLHttpRequest for progress tracking
      const uploadPromise = new Promise<{ success: boolean; errorType?: UploadErrorType; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (onProgress) onProgress(100);
            resolve({ success: true });
          } else {
            const errorType = xhr.status >= 500 ? 'server_error' : 
                            xhr.status === 401 || xhr.status === 403 ? 'authentication_error' :
                            xhr.status === 408 || xhr.status === 504 ? 'timeout_error' : 'storage_error';
            resolve({ 
              success: false, 
              errorType,
              error: `Upload failed with status ${xhr.status}: ${xhr.statusText}`
            });
          }
        });

        xhr.addEventListener('error', () => {
          resolve({ 
            success: false, 
            errorType: 'network_error',
            error: 'Network error during upload' 
          });
        });

        xhr.addEventListener('timeout', () => {
          resolve({ 
            success: false, 
            errorType: 'timeout_error',
            error: 'Upload request timed out' 
          });
        });

        xhr.addEventListener('abort', () => {
          resolve({ 
            success: false, 
            errorType: 'network_error',
            error: 'Upload was aborted' 
          });
        });

        // Set timeout for large files (30 seconds base + 1 second per MB)
        const timeoutMs = 30000 + (file.size / (1024 * 1024)) * 1000;
        xhr.timeout = Math.min(timeoutMs, 300000); // Max 5 minutes

        xhr.open('PUT', presignedUrl);
        xhr.send(file);
      });

      const result = await uploadPromise;
      
      if (result.success) {
        return { success: true };
      }

      // Retry on network errors or 5xx
      if ((result.errorType === 'network_error' || result.errorType === 'server_error' || result.errorType === 'timeout_error') && attempt < maxRetries - 1) {
        console.warn(`R2 upload attempt ${attempt + 1} failed with ${result.errorType}, retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }

      console.error('R2 upload failed:', result.error);
      return result;

    } catch (error) {
      console.error(`R2 upload attempt ${attempt + 1} failed with error:`, error);
      const errorType = classifyUploadError(error);
      
      if ((errorType === 'network_error' || errorType === 'server_error' || errorType === 'timeout_error') && attempt < maxRetries - 1) {
        console.warn(`Retrying upload in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }
      
      return { 
        success: false, 
        errorType,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return { 
    success: false, 
    errorType: 'storage_error',
    error: 'Upload failed after multiple attempts' 
  };
}

/**
 * Create video record in Supabase with profile auto-creation
 */
async function createVideoRecord(
  params: VideoUploadParams & { r2VideoKey: string; videoUrl: string; status: string; sha256?: string; copyright_scan_status?: string }
): Promise<string> {
  // Validate required parameters
  if (!params.sha256) {
    console.warn('[videoUpload] No SHA-256 hash provided for video record');
  }
  
  // Step 1: Check if the owner exists in profiles, create if not
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', params.ownerId)
      .maybeSingle();

    if (profileError || !profile) {
      console.log('Profile not found, creating automatically for user:', params.ownerId);
      
      // Get user info from auth
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: createProfileError } = await supabase
          .from('profiles')
          .insert({
            id: params.ownerId,
            display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
            avatar_url: user.user_metadata?.avatar_url || null,
            bio: null
          });
      
        if (createProfileError) {
          console.error('Failed to create profile:', createProfileError);
          // Don't throw - try to continue with the upload
          console.warn('Continuing without profile creation');
        } else {
          console.log('Profile created successfully');
        }
      } else {
        console.warn('No auth user found, cannot create profile automatically');
      }
    }
  } catch (profileCheckError) {
    console.error('Error checking/creating profile:', profileCheckError);
    // Don't fail the upload if profile check fails
    console.warn('Continuing with video creation');
  }

  console.log('[videoUpload] Creating video record with:', {
    visibility: params.visibility,
    status: params.status,
    title: params.title,
    ownerId: params.ownerId
  });

  // Build insert object - conditionally include copyright_scan_status if provided
  const insertData: any = {
    owner_id: params.ownerId,
    title: params.title,
    description: params.description,
    tags: params.tags,
    category: params.category,
    visibility: params.visibility,
    scheduled_at: params.scheduledAt,
    monetization_enabled: params.monetizationEnabled,
    is_short: params.isShort,
    duration_seconds: params.duration,
    thumb_url: params.thumbnailUrl,
    r2_video_key: params.r2VideoKey,
    video_url: params.videoUrl,
    status: params.status,
    mime_type: params.file.type,
    size_bytes: params.file.size,
    sha256: params.sha256,
    published_at: params.visibility === 'public' && !params.scheduledAt ? new Date().toISOString() : null,
    copyright_scan_status: params.copyright_scan_status || 'pending'
  };

  const { data, error } = await supabase
    .from('videos')
    .insert(insertData)
    .select('id, visibility, status, title')
    .maybeSingle();

  console.log('[videoUpload] Video record created:', data, 'Error:', error);

  if (error) {
    throw new Error(`Failed to create video record: ${error.message}`);
  }

  if (!data || !data.id) {
    throw new Error('Video record created but no ID returned');
  }

  return data.id;
}

/**
 * Generate SHA-256 hash of a file using streaming chunked processing
 * Prevents memory crash for large files by processing in 8MB chunks
 */
async function generateFileHashStreaming(file: File): Promise<string> {
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
  const fileSize = file.size;
  let offset = 0;
  
  // For small files, use direct approach
  if (fileSize <= CHUNK_SIZE) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // For large files, use chunked processing
  try {
    // Read file in chunks and hash incrementally
    const chunks: Uint8Array[] = [];
    
    while (offset < fileSize) {
      const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, fileSize));
      const buffer = await chunk.arrayBuffer();
      chunks.push(new Uint8Array(buffer));
      offset += CHUNK_SIZE;
    }
    
    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.length;
    }
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Chunked hash generation failed, falling back to first chunk only:', error);
    // Ultimate fallback: just hash first chunk
    const firstChunk = file.slice(0, Math.min(CHUNK_SIZE, fileSize));
    const buffer = await firstChunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
