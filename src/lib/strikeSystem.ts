/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { supabase } from '@/integrations/supabase/loose';

export interface Strike {
  id: string;
  user_id: string;
  reason: string;
  severity: 'warning' | 'strike1' | 'strike2' | 'strike3';
  category: 'copyright' | 'community_guidelines' | 'spam' | 'harassment' | 'other';
  video_id?: string;
  created_at: string;
  expires_at?: string;
  acknowledged: boolean;
}

export interface UserStrikeStatus {
  active_strikes: number;
  total_strikes: number;
  strike_history: Strike[];
  status: 'clean' | 'warning' | 'suspended' | 'banned';
  suspension_until?: string;
}

/**
 * Get user's current strike status
 */
export async function getUserStrikeStatus(userId: string): Promise<UserStrikeStatus> {
  try {
    // Get active strikes (not expired and not acknowledged if within 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: strikes, error } = await supabase
      .from('user_strikes')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    const typedStrikes = (strikes || []) as unknown as Strike[];

    const activeStrikes = typedStrikes.filter(
      (strike) => !strike.expires_at || new Date(strike.expires_at) > new Date()
    );

    const totalStrikes = activeStrikes.length;
    let status: UserStrikeStatus['status'] = 'clean';

    if (totalStrikes >= 3) {
      status = 'banned';
    } else if (totalStrikes === 2) {
      status = 'suspended';
    } else if (totalStrikes === 1) {
      status = 'warning';
    }

    // Check for active suspension
    const activeSuspension = activeStrikes.find(
      (strike) => strike.severity === 'strike2' && strike.expires_at && new Date(strike.expires_at) > new Date()
    );

    return {
      active_strikes: totalStrikes,
      total_strikes: typedStrikes.length,
      strike_history: activeStrikes,
      status,
      suspension_until: activeSuspension?.expires_at ?? undefined,
    };
  } catch (error) {
    console.error('Error getting user strike status:', error);
    return {
      active_strikes: 0,
      total_strikes: 0,
      strike_history: [],
      status: 'clean',
    };
  }
}

/**
 * Add a strike to a user
 */
export async function addStrikeToUser(
  userId: string,
  reason: string,
  category: Strike['category'],
  videoId?: string,
  severity?: Strike['severity']
): Promise<{ success: boolean; message: string; userStatus?: UserStrikeStatus }> {
  try {
    // Get current strike status
    const currentStatus = await getUserStrikeStatus(userId);
    
    // Determine severity based on current strikes
    let newSeverity: Strike['severity'] = severity || 'warning';
    
    if (currentStatus.active_strikes === 0) {
      newSeverity = 'strike1';
    } else if (currentStatus.active_strikes === 1) {
      newSeverity = 'strike2';
    } else if (currentStatus.active_strikes >= 2) {
      newSeverity = 'strike3';
    }

    // Calculate expiration (strikes expire after 90 days for first strike, 180 for second, permanent for third)
    let expiresAt: string | undefined;
    if (newSeverity === 'strike1') {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 90);
      expiresAt = expiry.toISOString();
    } else if (newSeverity === 'strike2') {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 180);
      expiresAt = expiry.toISOString();
    }
    // strike3 (third strike) doesn't expire

    // Insert the strike
    const { data: strike, error: strikeError } = await supabase
      .from('user_strikes')
      .insert({
        user_id: userId,
        reason,
        severity: newSeverity,
        category,
        video_id: videoId,
        expires_at: expiresAt,
        acknowledged: false,
      } as never)
      .select()
      .maybeSingle();

    if (strikeError || !strike) {
      throw strikeError || new Error('Failed to create strike record');
    }

    // Apply consequences based on strike count
    const updatedStatus = await getUserStrikeStatus(userId);
    
    if (updatedStatus.status === 'suspended') {
      // Suspend user for 7 days
      const suspensionEnd = new Date();
      suspensionEnd.setDate(suspensionEnd.getDate() + 7);
      
      await supabase
        .from('profiles')
        .update({
          is_banned: true,
          ban_reason: `Account suspended due to multiple strikes: ${reason}`,
          banned_until: suspensionEnd.toISOString(),
        })
        .eq('id', userId);
    } else if (updatedStatus.status === 'banned') {
      // Permanent ban
      await supabase
        .from('profiles')
        .update({
          is_banned: true,
          ban_reason: `Account permanently banned due to 3 strikes: ${reason}`,
          banned_until: null,
        })
        .eq('id', userId);
    }

    // Create notification for user
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'strike',
      title: `Community Guidelines Strike - ${newSeverity.toUpperCase()}`,
      message: getStrikeMessage(newSeverity, reason),
      metadata: { strike_id: (strike as { id: string }).id, severity: newSeverity },
    } as never);

    return {
      success: true,
      message: `Strike added successfully. User now has ${updatedStatus.active_strikes} active strike(s).`,
      userStatus: updatedStatus,
    };
  } catch (error) {
    console.error('Error adding strike:', error);
    return {
      success: false,
      message: 'Failed to add strike. Please try again.',
    };
  }
}

/**
 * Acknowledge a strike
 */
export async function acknowledgeStrike(strikeId: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_strikes')
      .update({ acknowledged: true } as never)
      .eq('id', strikeId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error acknowledging strike:', error);
    return false;
  }
}

/**
 * Remove expired strikes
 */
export async function cleanupExpiredStrikes(): Promise<number> {
  try {
    const now = new Date().toISOString();
    
    const { error } = await supabase
      .from('user_strikes')
      .update({ acknowledged: true } as never) // Mark as acknowledged so they don't count
      .lt('expires_at', now)
      .eq('acknowledged' as never, false);

    if (error) throw error;
    
    // Also reinstate users who were suspended but suspension has ended
    const { data: suspendedUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_banned', true)
      .not('banned_until', 'is', null)
      .lt('banned_until', now);

    if (suspendedUsers && suspendedUsers.length > 0) {
      for (const user of suspendedUsers) {
        await supabase
          .from('profiles')
          .update({
            is_banned: false,
            ban_reason: null,
            banned_until: null,
          })
          .eq('id', user.id);
      }
    }

    return suspendedUsers?.length || 0;
  } catch (error) {
    console.error('Error cleaning up expired strikes:', error);
    return 0;
  }
}

function getStrikeMessage(severity: Strike['severity'], reason: string): string {
  switch (severity) {
    case 'strike1':
      return `You have received your first strike for: ${reason}. This strike will expire in 90 days. Please review our community guidelines to avoid further strikes.`;
    case 'strike2':
      return `You have received your second strike for: ${reason}. Your account has been suspended for 7 days. This strike will expire in 180 days. Further violations will result in a permanent ban.`;
    case 'strike3':
      return `You have received your third strike for: ${reason}. Your account has been permanently banned due to repeated violations of our community guidelines.`;
    default:
      return `Warning: ${reason}. Please review our community guidelines.`;
  }
}