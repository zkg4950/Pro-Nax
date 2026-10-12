/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, Ban, User, Clock, Calendar, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/loose';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface Strike {
  id: string;
  user_id: string;
  reason: string;
  severity: 'warning' | 'strike1' | 'strike2' | 'strike3';
  category: string;
  video_id?: string;
  created_at: string;
  expires_at?: string;
  acknowledged: boolean;
  user?: {
    display_name: string;
    email: string;
    avatar_url?: string;
  };
}

export function StrikesTab() {
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showAddStrike, setShowAddStrike] = useState(false);
  const [newStrike, setNewStrike] = useState({
    userId: '',
    reason: '',
    category: 'community_guidelines',
    videoId: '',
  });

  const loadStrikes = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_strikes')
        .select(`
          *,
          profiles!user_id (
            display_name,
            email,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (filterSeverity !== 'all') {
        query = query.eq('severity', filterSeverity as never);
      }

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      setStrikes((data || []) as unknown as Strike[]);
    } catch (error) {
      console.error('Error loading strikes:', error);
      toast.error('Failed to load strikes');
    } finally {
      setLoading(false);
    }
  }, [filterSeverity, filterCategory]);

  useEffect(() => {
    loadStrikes();
  }, [loadStrikes]);

  const handleAddStrike = async () => {
    if (!newStrike.userId || !newStrike.reason) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      // Get current strike count to determine severity
      const { data: existingStrikes } = await supabase
        .from('user_strikes')
        .select('id')
        .eq('user_id', newStrike.userId)
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      const strikeCount = existingStrikes?.length || 0;
      let severity: 1 | 2 | 3 = 1;
      
      if (strikeCount === 0) severity = 1;
      else if (strikeCount === 1) severity = 2;
      else severity = 3;

      // Issue strike using admin RPC
      const { error } = await supabase.rpc('admin_issue_strike', {
        p_user: newStrike.userId,
        p_reason: newStrike.reason,
        p_category: newStrike.category,
        p_severity: severity,
        p_source: 'manual',
        p_video_id: newStrike.videoId || null
      });

      if (error) throw error;

      // Apply consequences using admin RPC
      if (severity === 2) {
        const suspensionEnd = new Date();
        suspensionEnd.setDate(suspensionEnd.getDate() + 7);
        await supabase.rpc('admin_ban_user', {
          p_user: newStrike.userId,
          p_reason: `Account suspended: ${newStrike.reason}`,
          p_until: suspensionEnd.toISOString()
        });
      } else if (severity === 3) {
        await supabase.rpc('admin_ban_user', {
          p_user: newStrike.userId,
          p_reason: `Account permanently banned: ${newStrike.reason}`,
          p_until: null
        });
      }

      toast.success(`Strike added successfully (Severity: ${severity})`);
      setShowAddStrike(false);
      setNewStrike({ userId: '', reason: '', category: 'community_guidelines', videoId: '' });
      loadStrikes();
    } catch (error) {
      console.error('Error adding strike:', error);
      toast.error('Failed to add strike');
    }
  };

  const filteredStrikes = strikes.filter(strike => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        strike.user?.display_name?.toLowerCase().includes(query) ||
        strike.user?.email?.toLowerCase().includes(query) ||
        strike.reason.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'strike1': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'strike2': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'strike3': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const handleRevokeStrike = async (strikeId: string) => {
    const reason = prompt('Reason for revoking this strike:');
    if (!reason) return;

    try {
      const { error } = await supabase.rpc('admin_revoke_strike', {
        p_strike_id: strikeId,
        p_reason: reason
      });

      if (error) throw error;

      toast.success('Strike revoked successfully');
      loadStrikes();
    } catch (error) {
      console.error('Error revoking strike:', error);
      toast.error('Failed to revoke strike');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Strike Management
          </h2>
          <p className="text-muted-foreground">Manage community guideline strikes and user penalties</p>
        </div>
        <Dialog open={showAddStrike} onOpenChange={setShowAddStrike}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Add Strike
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Strike</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>User ID</Label>
                <Input
                  value={newStrike.userId}
                  onChange={(e) => setNewStrike({ ...newStrike, userId: e.target.value })}
                  placeholder="Enter user UUID"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={newStrike.category} onValueChange={(value) => setNewStrike({ ...newStrike, category: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copyright">Copyright</SelectItem>
                    <SelectItem value="community_guidelines">Community Guidelines</SelectItem>
                    <SelectItem value="spam">Spam</SelectItem>
                    <SelectItem value="harassment">Harassment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={newStrike.reason}
                  onChange={(e) => setNewStrike({ ...newStrike, reason: e.target.value })}
                  placeholder="Describe the violation..."
                  rows={3}
                />
              </div>
              <div>
                <Label>Video ID (Optional)</Label>
                <Input
                  value={newStrike.videoId}
                  onChange={(e) => setNewStrike({ ...newStrike, videoId: e.target.value })}
                  placeholder="Related video UUID"
                />
              </div>
              <Button onClick={handleAddStrike} className="w-full">
                Add Strike
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by user, email, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="strike1">Strike 1</SelectItem>
            <SelectItem value="strike2">Strike 2</SelectItem>
            <SelectItem value="strike3">Strike 3</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="copyright">Copyright</SelectItem>
            <SelectItem value="community_guidelines">Community Guidelines</SelectItem>
            <SelectItem value="spam">Spam</SelectItem>
            <SelectItem value="harassment">Harassment</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Strikes List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading strikes...</div>
      ) : filteredStrikes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No strikes found</div>
      ) : (
        <div className="space-y-4">
          {filteredStrikes.map((strike) => (
            <div key={strike.id} className="glass-strong rounded-xl border border-border/40 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(strike.severity)}`}>
                    {strike.severity.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold">{strike.user?.display_name || 'Unknown User'}</span>
                      <span className="text-sm text-muted-foreground">{strike.user?.email}</span>
                    </div>
                    <p className="text-sm">{strike.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(strike.created_at).toLocaleDateString()}</span>
                      </div>
                      {strike.expires_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Expires: {new Date(strike.expires_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Filter className="w-3 h-3" />
                        <span className="capitalize">{strike.category.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {strike.acknowledged ? (
                    <span className="text-xs text-green-400">Acknowledged</span>
                  ) : (
                    <span className="text-xs text-yellow-400">Pending</span>
                  )}
                  <button
                    onClick={() => handleRevokeStrike(strike.id)}
                    className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}