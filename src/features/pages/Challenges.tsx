/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { Trophy, Users, Calendar, TrendingUp, Play, CheckCircle, Clock, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/loose';
import { toast } from 'sonner';

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  hashtag: string;
  banner_url: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  is_featured: boolean;
  participant_count: number;
  video_count: number;
  creator_id: string | null;
}

interface ChallengeParticipation {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: string;
  video_count: number;
  status: 'active' | 'completed' | 'disqualified';
  reward_earned: number | null;
}

export default function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [participations, setParticipations] = useState<Record<string, ChallengeParticipation>>({});
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    loadChallenges();
    loadUser();
  }, []);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const loadChallenges = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('participant_count', { ascending: false })
        .limit(50);

      setChallenges((data ?? []) as Challenge[]);

      // Load user participations
      if (currentUser) {
        const { data: userParts } = await (supabase as any)
          .from('challenge_participations')
          .select('*')
          .eq('user_id', currentUser.id);
        
        const partsMap = (userParts ?? []).reduce((acc: Record<string, ChallengeParticipation>, p: any) => {
          acc[p.challenge_id] = p;
          return acc;
        }, {});
        setParticipations(partsMap);
      }
    } catch (error) {
      console.error('Failed to load challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const joinChallenge = async (challengeId: string) => {
    if (!currentUser) {
      toast.error('Please login to join challenges');
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('challenge_participations')
        .insert({
          challenge_id: challengeId,
          user_id: currentUser.id,
          status: 'active',
        });

      if (error) throw error;

      toast.success('Successfully joined the challenge!');
      loadChallenges();
    } catch (error) {
      console.error('Failed to join challenge:', error);
      toast.error('Failed to join challenge');
    }
  };

  const daysRemaining = (endDate: string | null) => {
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const isExpired = (endDate: string | null) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <Trophy className="w-5 h-5 text-[#FE2C55]" />
        <h1 className="text-sm font-bold">Challenges</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-white/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        ) : challenges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/50">
            <Trophy className="w-12 h-12 mb-3" />
            <p>No active challenges right now</p>
            <p className="text-xs mt-1">Check back soon for new opportunities!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {challenges.map((challenge) => {
              const participation = participations[challenge.id];
              const daysLeft = daysRemaining(challenge.end_date);
              const expired = isExpired(challenge.end_date);

              return (
                <div
                  key={challenge.id}
                  className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10"
                >
                  {/* Banner */}
                  {challenge.banner_url ? (
                    <div className="h-32 relative">
                      <img
                        src={challenge.banner_url}
                        alt={challenge.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a2e] to-transparent" />
                      {challenge.is_featured && (
                        <div className="absolute top-2 right-2 bg-[#FE2C55] text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          Featured
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-32 bg-gradient-to-br from-[#FE2C55]/20 to-[#25F4EE]/20 flex items-center justify-center">
                      <Trophy className="w-12 h-12 text-white/50" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-4 -mt-8 relative">
                    <h3 className="text-lg font-bold text-white mb-1">{challenge.title}</h3>
                    <p className="text-xs text-white/70 mb-3 line-clamp-2">
                      {challenge.description || 'Join this challenge and showcase your creativity!'}
                    </p>

                    {/* Hashtag */}
                    <div className="inline-block bg-white/10 text-white/90 text-xs font-medium px-2 py-1 rounded-full mb-3">
                      {challenge.hashtag}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <Users className="w-4 h-4 mx-auto mb-1 text-[#25F4EE]" />
                        <p className="text-xs font-bold">{challenge.participant_count.toLocaleString()}</p>
                        <p className="text-[10px] text-white/50">Participants</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <Play className="w-4 h-4 mx-auto mb-1 text-[#FE2C55]" />
                        <p className="text-xs font-bold">{challenge.video_count.toLocaleString()}</p>
                        <p className="text-[10px] text-white/50">Videos</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <TrendingUp className="w-4 h-4 mx-auto mb-1 text-[#FFD700]" />
                        <p className="text-xs font-bold">Trending</p>
                        <p className="text-[10px] text-white/50">Challenge</p>
                      </div>
                    </div>

                    {/* Time remaining */}
                    {daysLeft !== null && (
                      <div className="flex items-center gap-1 text-xs text-white/60 mb-4">
                        <Clock className="w-3 h-3" />
                        {expired ? (
                          <span>Challenge ended</span>
                        ) : daysLeft === 0 ? (
                          <span>Ends today</span>
                        ) : daysLeft === 1 ? (
                          <span>1 day remaining</span>
                        ) : (
                          <span>{daysLeft} days remaining</span>
                        )}
                      </div>
                    )}

                    {/* Action Button */}
                    {participation ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-green-500/20 text-green-400 text-xs font-medium px-3 py-2 rounded-full flex items-center justify-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Joined
                        </div>
                        {participation.video_count > 0 && (
                          <span className="text-xs text-white/60">
                            {participation.video_count} video{participation.video_count > 1 ? 's' : ''} submitted
                          </span>
                        )}
                      </div>
                    ) : expired ? (
                      <Button
                        disabled
                        variant="outline"
                        className="w-full"
                      >
                        Challenge Ended
                      </Button>
                    ) : (
                      <Button
                        onClick={() => joinChallenge(challenge.id)}
                        className="w-full bg-gradient-to-r from-[#FE2C55] to-[#25F4EE] text-white font-semibold"
                      >
                        Join Challenge
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
