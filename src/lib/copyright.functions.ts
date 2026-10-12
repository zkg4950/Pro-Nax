/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { supabase } from '@/integrations/supabase/loose';

/**
 * Scan a video for copyright violations using the FastAPI audio fingerprint service
 * This is called after video upload completes as a background job
 */
export async function scanVideoForCopyright(videoId: string, videoUrl: string): Promise<{
  success: boolean;
  claimsCreated: number;
  error?: string;
  scanPending?: boolean;
}> {
  const audioFingerprintUrl = import.meta.env.VITE_AUDIO_FINGERPRINT_URL || process.env.AUDIO_FINGERPRINT_URL;

  if (!audioFingerprintUrl) {
    console.warn('AUDIO_FINGERPRINT_URL not configured, marking video as scan_pending');
    // Mark video as scan_pending for retry
    await markVideoScanPending(videoId);
    return {
      success: false,
      claimsCreated: 0,
      scanPending: true,
      error: 'Audio fingerprint service not configured'
    };
  }

  let claimsCreated = 0;
  try {
    // Call the FastAPI service to scan the video
    const formData = new FormData();
    formData.append('video_url', videoUrl);
    formData.append('video_id', videoId);

    const response = await fetch(`${audioFingerprintUrl}/scan-video`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Audio fingerprint service returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.matched) {
      // Create copyright claim for the match
      try {
        const { error: claimError } = await supabase
          .from('copyright_claims')
          .insert({
            video_id: videoId,
            claimant_id: null, // Will be determined from match
            claim_type: 'audio',
            severity: 'warning',
            status: 'pending_review',
            match_percentage: Math.round((result.confidence || 0) * 100) || 75,
            matched_content_id: result.song_id?.toString() || result.content_id,
            matched_content_title: result.song_name || 'Unknown Reference',
            matched_content_owner: null,
            action_taken: 'none',
            detected_at: new Date().toISOString(),
            source: 'auto',
            metadata: {
              match_type: 'audio_fingerprint',
              offset_seconds: result.offset_seconds,
              confidence: result.confidence,
              raw_match: result
            }
          } as never);

        if (!claimError) {
          claimsCreated = 1;
        }
      } catch (claimError) {
        console.error('Failed to create copyright claim for match:', result, claimError);
      }

      // Update video status if claims were created
      if (claimsCreated > 0) {
        await supabase
          .from('videos')
          .update({ 
            status: 'copyright_flagged',
            copyright_scan_status: 'complete',
            copyright_scan_completed_at: new Date().toISOString()
          })
          .eq('id', videoId);
      } else {
        await supabase
          .from('videos')
          .update({ 
            copyright_scan_status: 'complete',
            copyright_scan_completed_at: new Date().toISOString()
          })
          .eq('id', videoId);
      }

      return {
        success: true,
        claimsCreated
      };
    } else {
      // No matches found, mark scan as complete
      await supabase
        .from('videos')
        .update({ 
          copyright_scan_status: 'complete',
          copyright_scan_completed_at: new Date().toISOString()
        })
        .eq('id', videoId);

      return {
        success: true,
        claimsCreated: 0
      };
    }
  } catch (error) {
    console.error('Copyright scan failed for video:', videoId, error);
    
    // Mark video as scan_pending for retry
    await markVideoScanPending(videoId);
    
    return {
      success: false,
      claimsCreated: 0,
      scanPending: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Mark a video as pending copyright scan for retry
 */
async function markVideoScanPending(videoId: string): Promise<void> {
  try {
    await supabase
      .from('videos')
      .update({ 
        copyright_scan_status: 'pending',
        copyright_scan_retry_count: (await getRetryCount(videoId)) + 1
      })
      .eq('id', videoId);
  } catch (error) {
    console.error('Failed to mark video as scan_pending:', videoId, error);
  }
}

/**
 * Get current retry count for a video
 */
async function getRetryCount(videoId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('videos')
      .select('copyright_scan_retry_count')
      .eq('id', videoId)
      .single();
    
    return (data?.copyright_scan_retry_count as number) || 0;
  } catch {
    return 0;
  }
}

/**
 * Retry copyright scan for videos marked as pending
 * This can be called periodically or via admin action
 */
export async function retryPendingCopyrightScans(limit: number = 10): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  try {
    // Get videos pending scan with retry count under threshold
    const { data: pendingVideos, error } = await supabase
      .from('videos')
      .select('id, video_url, copyright_scan_retry_count')
      .eq('copyright_scan_status', 'pending')
      .lt('copyright_scan_retry_count', 3) // Max 3 retries
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !pendingVideos || pendingVideos.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const video of pendingVideos) {
      try {
        const result = await scanVideoForCopyright(video.id, video.video_url || '');
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Failed to retry scan for video:', video.id, error);
        failed++;
      }
    }

    return {
      processed: pendingVideos.length,
      succeeded,
      failed
    };
  } catch (error) {
    console.error('Failed to retry pending copyright scans:', error);
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}

/**
 * Get copyright scan status for a video
 */
export async function getCopyrightScanStatus(videoId: string): Promise<{
  status: string;
  completedAt?: string;
  retryCount?: number;
}> {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('copyright_scan_status, copyright_scan_completed_at, copyright_scan_retry_count')
      .eq('id', videoId)
      .single();

    if (error || !data) {
      return { status: 'unknown' };
    }

    return {
      status: data.copyright_scan_status || 'unknown',
      completedAt: data.copyright_scan_completed_at || undefined,
      retryCount: data.copyright_scan_retry_count || undefined
    };
  } catch {
    return { status: 'unknown' };
  }
}
