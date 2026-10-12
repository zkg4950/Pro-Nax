/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/loose';

export type SharePlatform = 'clipboard' | 'twitter' | 'facebook' | 'whatsapp' | 'telegram' | 'native' | 'other';

export function useVideoShare() {
  const recordShare = useCallback(
    async (
      videoId: string,
      platform: SharePlatform = 'clipboard',
      userId?: string
    ) => {
      try {
        // Get user ID if not provided
        let finalUserId = userId;
        if (!finalUserId) {
          const { data: { user } } = await supabase.auth.getUser();
          finalUserId = user?.id;
        }

        // Record the share
        await supabase.rpc('record_video_share', {
          p_video_id: videoId,
          p_user_id: finalUserId,
          p_platform: platform,
          p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        });
      } catch (error) {
        console.error('Failed to record video share:', error);
        // Don't throw - this is a non-critical analytics operation
      }
    },
    []
  );

  const getShareCount = useCallback(async (videoId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_video_share_count', {
        p_video_id: videoId,
      });
      if (error) throw error;
      return data as number;
    } catch (error) {
      console.error('Failed to get share count:', error);
      return 0;
    }
  }, []);

  const getShareBreakdown = useCallback(async (videoId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_video_share_breakdown', {
        p_video_id: videoId,
      });
      if (error) throw error;
      return data as Array<{ platform: string; count: number }>;
    } catch (error) {
      console.error('Failed to get share breakdown:', error);
      return [];
    }
  }, []);

  return {
    recordShare,
    getShareCount,
    getShareBreakdown,
  };
}