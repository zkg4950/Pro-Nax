/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Calendar, Wallet, Video, ShieldCheck, Ban, CheckCircle2,
  X, Edit, Upload, Trash2, Eye, Settings, AlertTriangle, Loader2,
  Image as ImageIcon, XCircle, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/loose';
import type { UserItem } from './tabs/UserManagementTab';

interface UserProfileViewProps {
  userId: string;
  onClose: () => void;
}

interface UserVideo {
  id: string;
  title: string;
  thumb_url?: string | null;
  status: string;
  views_count: number;
  created_at: string;
  duration_seconds?: number | null;
}

export function UserProfileView({ userId, onClose }: UserProfileViewProps) {
  const [user, setUser] = useState<UserItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: '',
    email: '',
    role: 'user' as 'admin' | 'creator' | 'user',
    status: 'active' as 'active' | 'suspended' | 'flagged',
  });
  const [videos, setVideos] = useState<UserVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'videos' | 'settings'>('overview');

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id,email,display_name,handle,upload_limit_mb,status,is_banned,is_verified,ban_reason,subscribers_count,created_at,is_creator,avatar_url')
        .eq('id', userId)
        .single();

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const isAdmin = roles?.some((r: any) => r.role === 'admin') || false;

      // Get video count separately
      const { count: videoCount } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', userId);

      // Get wallet balance from user_wallets table
      const { data: wallet } = await supabase
        .from('user_wallets')
        .select('balance')
        .eq('user_id', userId)
        .single();

      if (profile) {
        setUser({
          id: profile.id,
          email: profile.email || '',
          display_name: profile.display_name || '',
          handle: profile.handle || '',
          role: isAdmin ? 'admin' : (profile.is_creator ? 'creator' : 'user'),
          upload_limit_mb: profile.upload_limit_mb || 2048,
          status: profile.is_banned ? 'suspended' : (profile.status || 'active'),
          is_banned: Boolean(profile.is_banned),
          is_verified: Boolean(profile.is_verified),
          ban_reason: profile.ban_reason,
          subscribers_count: profile.subscribers_count || 0,
          videos_count: videoCount || 0,
          created_at: profile.created_at || new Date().toISOString(),
          wallet_balance: wallet?.balance || 0,
          avatar_url: profile.avatar_url,
          banner_url: null,
        } as any);

        setEditForm({
          display_name: profile.display_name || '',
          email: profile.email || '',
          role: isAdmin ? 'admin' : (profile.is_creator ? 'creator' : 'user'),
          status: (profile.is_banned ? 'suspended' : (profile.status || 'active')) as 'active' | 'suspended' | 'flagged',
        });
      }
    } catch (error) {
      console.error('Error loading user:', error);
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      console.log('Loading videos for userId:', userId);

      const { data, error } = await supabase
        .from('videos')
        .select('id,title,thumb_url,status,views_count,created_at,duration_seconds')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      console.log('Videos query result:', { data, error });

      if (error) {
        console.error('Error loading videos:', error);
        toast.error(`Failed to load videos: ${error.message}`);
        setVideos([]);
      } else {
        console.log('Videos loaded:', data?.length || 0);
        setVideos(data || []);
      }
    } catch (error: any) {
      console.error('Error loading videos:', error);
      toast.error(error.message || 'Failed to load user videos');
      setVideos([]);
    } finally {
      setLoadingVideos(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (activeTab === 'videos') {
      loadVideos();
    }
  }, [activeTab, loadVideos]);

  const handleSaveEdit = async () => {
    if (!user) return;

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: editForm.display_name,
          status: editForm.status,
          is_banned: editForm.status === 'suspended',
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Update role if changed
      if (editForm.role !== user.role) {
        const { error: roleError } = await supabase.rpc('admin_set_role', {
          p_user: userId,
          p_role: editForm.role === 'admin' ? 'admin' : 'user',
          p_grant: editForm.role === 'admin',
        });

        if (roleError) throw roleError;
      }

      toast.success('User profile updated successfully');
      setEditing(false);
      loadUser();
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast.error(error.message || 'Failed to update user profile');
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) return;

    try {
      // Delete video directly from videos table
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) throw error;

      toast.success('Video deleted successfully');
      loadVideos();
      loadUser(); // Update video count
    } catch (error: any) {
      console.error('Error deleting video:', error);
      toast.error(error.message || 'Failed to delete video');
    }
  };

  const handleUploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-avatar-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      toast.success('Profile picture updated successfully');
      loadUser();
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || 'Failed to upload profile picture');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Profile picture removed successfully');
      loadUser();
    } catch (error: any) {
      console.error('Error removing avatar:', error);
      toast.error(error.message || 'Failed to remove profile picture');
    }
  };

  const handleUploadBanner = async (file: File) => {
    setUploadingBanner(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-banner-${Date.now()}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ banner_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      toast.success('Banner image updated successfully');
      loadUser();
    } catch (error: any) {
      console.error('Error uploading banner:', error);
      toast.error(error.message || 'Failed to upload banner image');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveBanner = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ banner_url: null })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Banner image removed successfully');
      loadUser();
    } catch (error: any) {
      console.error('Error removing banner:', error);
      toast.error(error.message || 'Failed to remove banner image');
    }
  };

  const handleDeleteUser = async () => {
    if (!confirm('Are you sure you want to permanently delete this user account? This action cannot be undone.')) return;

    try {
      // Soft delete by setting status to deleted
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'deleted', is_banned: true })
        .eq('id', userId);

      if (error) throw error;

      toast.success('User account deleted successfully');
      onClose();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user account');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        User not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">User Profile</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-muted/50 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Profile Banner & Avatar */}
      <div className="glass-strong rounded-2xl border border-border/40 overflow-hidden">
        {/* Banner */}
        <div className="h-48 bg-gradient-to-r from-primary/20 to-accent/20 relative">
          {user.banner_url ? (
            <img
              src={user.banner_url}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
              <ImageIcon className="w-12 h-12" />
            </div>
          )}
          <div className="absolute top-4 right-4 flex gap-2">
            <label className="cursor-pointer px-3 py-1.5 bg-background/80 backdrop-blur rounded-lg text-xs font-medium hover:bg-background transition flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              {uploadingBanner ? 'Uploading...' : 'Change Banner'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadBanner(file);
                }}
                disabled={uploadingBanner}
              />
            </label>
            {user.banner_url && (
              <button
                onClick={handleRemoveBanner}
                className="px-3 py-1.5 bg-destructive/80 backdrop-blur rounded-lg text-xs font-medium hover:bg-destructive transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Avatar & Basic Info */}
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12 mb-4">
            <div className="relative">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="Avatar"
                  className="w-24 h-24 rounded-full border-4 border-background object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-background gradient-primary flex items-center justify-center font-bold text-2xl text-primary-foreground">
                  {user.display_name[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-2 -right-2 flex gap-1">
                <label className="cursor-pointer p-1.5 bg-background rounded-lg border border-border/40 hover:border-primary/50 transition">
                  <Upload className="w-3 h-3" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadAvatar(file);
                    }}
                    disabled={uploadingAvatar}
                  />
                </label>
                {user.avatar_url && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="p-1.5 bg-background rounded-lg border border-border/40 hover:border-destructive/50 transition"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold">{user.display_name}</h3>
                {user.is_verified && (
                  <CheckCircle2 className="w-5 h-5 text-sky-400" />
                )}
              </div>
              <p className="text-muted-foreground text-sm">{user.handle}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border/30">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'overview'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'videos'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Videos ({user.videos_count})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'settings'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Personal Info */}
            <div className="glass-strong rounded-xl border border-border/40 p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                Personal Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
                  <p className="font-medium">{user.display_name}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Email Address</label>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">User ID</label>
                  <p className="font-mono text-xs text-muted-foreground">{user.id}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Joined Date</label>
                  <p className="font-medium">
                    {new Date(user.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Wallet & Activity */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-strong rounded-xl border border-border/40 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-muted-foreground">Wallet Balance</span>
                </div>
                <p className="text-2xl font-bold text-emerald-400">${(user.wallet_balance || 0).toFixed(2)}</p>
              </div>
              <div className="glass-strong rounded-xl border border-border/40 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Videos Uploaded</span>
                </div>
                <p className="text-2xl font-bold">{user.videos_count}</p>
              </div>
              <div className="glass-strong rounded-xl border border-border/40 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-accent" />
                  <span className="text-xs text-muted-foreground">Subscribers</span>
                </div>
                <p className="text-2xl font-bold">{user.subscribers_count.toLocaleString()}</p>
              </div>
            </div>

            {/* Account Status */}
            <div className="glass-strong rounded-xl border border-border/40 p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Account Status
              </h4>
              <div className="flex items-center gap-4">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                    user.is_banned
                      ? 'bg-destructive/20 text-destructive border border-destructive/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {user.is_banned ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                  {user.is_banned ? 'Suspended' : 'Active'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                    user.role === 'admin'
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : user.role === 'creator'
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {user.role}
                </span>
                {user.is_verified && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold uppercase bg-sky-500/20 text-sky-400 border border-sky-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </div>
              {user.ban_reason && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-xs text-destructive font-medium mb-1">Ban Reason</p>
                  <p className="text-sm text-muted-foreground">{user.ban_reason}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'videos' && (
          <motion.div
            key="videos"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="glass-strong rounded-xl border border-border/40 p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Video className="w-4 h-4" />
                User Videos ({videos.length})
              </h4>
              {loadingVideos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : videos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No videos uploaded by this user
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map((video) => (
                    <div key={video.id} className="glass rounded-lg border border-border/30 overflow-hidden">
                      <div className="aspect-video bg-muted/20 relative">
                        {video.thumb_url ? (
                          <img
                            src={video.thumb_url}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
                            <Video className="w-8 h-8" />
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 rounded text-xs">
                          {video.duration_seconds ? `${Math.floor(video.duration_seconds / 60)}:${(video.duration_seconds % 60).toString().padStart(2, '0')}` : '0:00'}
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-sm truncate mb-2">{video.title}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{video.views_count.toLocaleString()} views</span>
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              video.status === 'ready'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                          >
                            {video.status}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteVideo(video.id)}
                          className="mt-2 w-full px-2 py-1 bg-destructive/20 border border-destructive/40 text-destructive hover:bg-destructive/30 rounded text-xs font-medium transition flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete Video
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="glass-strong rounded-xl border border-border/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Account Settings
                </h4>
                <button
                  onClick={() => setEditing(!editing)}
                  className="px-3 py-1.5 text-xs font-medium border border-border/40 rounded-lg hover:border-primary/50 transition flex items-center gap-1.5"
                >
                  {editing ? <X className="w-3 h-3" /> : <Edit className="w-3 h-3" />}
                  {editing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
                    <input
                      type="text"
                      value={editForm.display_name}
                      onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                      className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Email Address</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Role</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value as any })}
                      className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                    >
                      <option value="user">User</option>
                      <option value="creator">Creator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                      className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="flagged">Flagged</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 border border-border/40 rounded-lg text-sm font-medium hover:bg-muted/50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
                    <p className="font-medium">{user.display_name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Email Address</label>
                    <p className="font-medium">{user.email}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Role</label>
                    <p className="font-medium capitalize">{user.role}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Status</label>
                    <p className="font-medium capitalize">{user.status}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-strong rounded-xl border border-destructive/40 p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                Danger Zone
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete this user account. This action cannot be undone.
              </p>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete User Account
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
