/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@/lib/router-compat';
import { Bell, Check, EyeOff, History, LifeBuoy, Loader2, Lock, LogOut, MessageCircle, Palette, PlayCircle, Shield, Smartphone, Trash2, Upload, User, UserX, Video, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { supabase, supabaseAny } from '@/integrations/supabase/loose';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuthSession } from '@/hooks/useAuthSession';
import { getItem, setItem } from '@/lib/safeStorage';

const THEMES = [
  { id: 'deep-dark', label: 'Deep Dark', bg: '220 20% 4%', card: '220 20% 8%', primary: '190 100% 50%' },
  { id: 'midnight-blue', label: 'Midnight Blue', bg: '230 50% 6%', card: '230 45% 10%', primary: '210 100% 60%' },
  { id: 'amoled-black', label: 'AMOLED Black', bg: '0 0% 0%', card: '0 0% 4%', primary: '160 100% 50%' },
];

const DM_OPTIONS: Array<{ id: 'everyone' | 'mutuals' | 'none'; label: string }> = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'mutuals', label: 'Mutuals only' },
  { id: 'none', label: 'Block all' },
];

async function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--background', t.bg);
  root.style.setProperty('--card', t.card);
  root.style.setProperty('--popover', t.card);
  root.style.setProperty('--primary', t.primary);
  root.style.setProperty('--ring', t.primary);
  setItem('pronax_theme', id);
}

interface PrivacyState {
  dm_permission: 'everyone' | 'mutuals' | 'none';
  is_private: boolean;
  hide_liked_videos: boolean;
  hide_watch_history: boolean;
  two_factor_enabled: boolean;
}

const DEFAULT_PRIVACY: PrivacyState = {
  dm_permission: 'everyone',
  is_private: false,
  hide_liked_videos: false,
  hide_watch_history: false,
  two_factor_enabled: false,
};

interface NotificationPrefs {
  new_video: boolean;
  comment_reply: boolean;
  mention: boolean;
  live_start: boolean;
  payout: boolean;
  copyright: boolean;
  marketing: boolean;
}

const DEFAULT_NOTIFS: NotificationPrefs = {
  new_video: true,
  comment_reply: true,
  mention: true,
  live_start: true,
  payout: true,
  copyright: true,
  marketing: false,
};

export default function Settings() {
  const navigate = useNavigate();
  const { signOut } = useAuthSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [videoCount, setVideoCount] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [appealMessage, setAppealMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState('deep-dark');
  const [strikes, setStrikes] = useState<any[]>([]);

  const [privacy, setPrivacy] = useState<PrivacyState>(DEFAULT_PRIVACY);
  const [blocked, setBlocked] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [ipStatus, setIpStatus] = useState<any>(null);
  const [notifs, setNotifs] = useState<NotificationPrefs>(DEFAULT_NOTIFS);
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [adRevenue, setAdRevenue] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const { settings, updateSettings, setCustomSetting, getCustomSetting } = useUserSettings();

  useEffect(() => {
    setTheme(getItem('pronax_theme', 'deep-dark'));
  }, []);

  useEffect(() => {
    setPayoutMethod(String(settings.custom_settings?.payout_method ?? ''));
    setPayoutDetails(String(settings.custom_settings?.payout_details ?? ''));
  }, [settings.custom_settings]);

  const loadSecurityData = useCallback(async (uid: string) => {
    const [priv, blocks, sess, ip, np, revenue] = await Promise.all([
      supabaseAny.rpc('get_my_privacy'),
      supabaseAny.rpc('list_blocked_users'),
      supabaseAny.rpc('list_my_sessions'),
      supabaseAny.rpc('my_ip_protection_status'),
      supabase.rpc('get_notification_preferences', { p_user_id: uid }),
      supabase.from('creator_earnings').select('total_earned').eq('user_id', uid).limit(1000),
    ]);
    if (priv.data) setPrivacy({ ...DEFAULT_PRIVACY, ...(priv.data as any) });
    if (Array.isArray(blocks.data)) setBlocked(blocks.data as any[]);
    if (Array.isArray(sess.data)) setSessions(sess.data as any[]);
    if (ip.data) setIpStatus(ip.data);
    const npRow = Array.isArray(np.data) ? (np.data as any[])[0] : np.data;
    if (npRow) setNotifs({ ...DEFAULT_NOTIFS, ...npRow });
    if (Array.isArray(revenue.data)) {
      setAdRevenue((revenue.data as any[]).reduce((sum, r) => sum + Number(r.total_earned ?? 0), 0));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(data.user);
      setEmail(data.user?.email || '');
      if (data.user) {
        const [p, w, v, st] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle(),
          supabase.from('user_wallets').select('*').eq('user_id', data.user.id).maybeSingle(),
          supabase.from('videos').select('id', { count: 'exact', head: true }).eq('owner_id', data.user.id),
          supabase.from('user_strikes').select('*').eq('user_id', data.user.id).order('created_at', { ascending: false }),
        ]);
        const prof = p.data as any;
        setProfile(prof);
        setWallet(w.data);
        setVideoCount(v.count ?? 0);
        setDisplayName(prof?.display_name ?? '');
        setBio(prof?.bio ?? '');
        setAvatarUrl(prof?.avatar_url ?? '');
        setStrikes(st.data || []);
        await loadSecurityData(data.user.id);
      }
      applyTheme(theme);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadSecurityData]);

  const savePrivacy = async (patch: Partial<PrivacyState>) => {
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    const { error } = await supabaseAny.rpc('update_my_privacy', {
      p_dm_permission: patch.dm_permission ?? null,
      p_is_private: patch.is_private ?? null,
      p_hide_liked_videos: patch.hide_liked_videos ?? null,
      p_hide_watch_history: patch.hide_watch_history ?? null,
      p_two_factor_enabled: patch.two_factor_enabled ?? null,
    });
    if (error) {
      setPrivacy(privacy);
      return toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    }
    toast({ title: 'Privacy updated' });
  };

  const saveNotifs = async (patch: Partial<NotificationPrefs>) => {
    const next = { ...notifs, ...patch };
    setNotifs(next);
    const { error } = await supabase.rpc('update_notification_preferences', {
      p_user_id: user.id,
      p_new_video: next.new_video,
      p_comment_reply: next.comment_reply,
      p_mention: next.mention,
      p_live_start: next.live_start,
      p_payout: next.payout,
      p_copyright: next.copyright,
      p_marketing: next.marketing,
    });
    if (error) {
      setNotifs(notifs);
      return toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    }
    toast({ title: 'Notification preferences updated' });
  };

  const unblock = async (id: string) => {
    const { error } = await supabaseAny.rpc('unblock_user', { p_user: id });
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    setBlocked((b) => b.filter((x) => x.id !== id));
    toast({ title: 'User unblocked' });
  };

  const revokeSession = async (id: string) => {
    const { error } = await supabaseAny.rpc('revoke_session', { p_id: id });
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    setSessions((s) => s.filter((x) => x.id !== id));
    toast({ title: 'Session revoked' });
  };

  const savePayout = async () => {
    if (!user) return;
    setBusy(true);
    await updateSettings({
      custom_settings: { ...settings.custom_settings, payout_method: payoutMethod, payout_details: payoutDetails },
    });
    setBusy(false);
    toast({ title: 'Payout preferences saved' });
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return toast({ title: 'Type DELETE to confirm', variant: 'destructive' });
    const { error } = await supabase.rpc('request_account_deletion');
    if (error) return toast({ title: 'Request failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Account deletion requested', description: 'Your account is scheduled for permanent removal.' });
    setDeleteConfirm('');
  };

  const saveProfile = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim(), bio: bio.trim() } as any).eq('id', user.id);
    setBusy(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Channel settings saved' });
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) return toast({ title: 'Image too large', description: 'Max 2 MB.', variant: 'destructive' });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const { error } = await supabase.from('profiles').update({ avatar_url: dataUrl } as any).eq('id', user.id);
    if (error) return toast({ title: 'Avatar failed', description: error.message, variant: 'destructive' });
    setAvatarUrl(dataUrl);
    toast({ title: 'Avatar updated' });
  };

  const updatePassword = async () => {
    if (password.length < 8) return toast({ title: 'Use at least 8 characters', variant: 'destructive' });
    const payload: any = { password };
    if (currentPassword) payload.current_password = currentPassword;
    const { error } = await supabase.auth.updateUser(payload);
    setPassword('');
    setCurrentPassword('');
    toast({ title: error ? 'Password failed' : 'Password updated', description: error?.message, variant: error ? 'destructive' : undefined });
  };

  const submitSupport = async () => {
    if (!user || appealMessage.trim().length < 10) return toast({ title: 'Write a longer message', variant: 'destructive' });
    setBusy(true);
    const { error } = await supabase.from('appeals').insert({ user_id: user.id, email: user.email, message: appealMessage.trim() });
    setBusy(false);
    if (error) return toast({ title: 'Request failed', description: error.message, variant: 'destructive' });
    setAppealMessage('');
    toast({ title: 'Support request sent' });
  };

  if (loading) return <main className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>;
  if (!user) return <main className="container max-w-xl py-16"><Panel title="Sign in required" desc="Manage channel, privacy, wallet, and security settings after login."><Button asChild><Link to="/auth">Sign in</Link></Button></Panel></main>;

  const balance = Number(wallet?.balance ?? 0);
  const payoutProgress = Math.min(100, (balance / 10) * 100);

  return (
    <main className="container max-w-6xl px-4 py-8 pb-24 lg:pb-10">
      <h1 className="text-2xl lg:text-4xl font-display font-bold text-glow">Settings</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">ProNax account, channel, playback, privacy, monetization, and support controls.</p>

      <Tabs defaultValue="channel" className="space-y-6">
        <TabsList className="glass-strong p-1 h-auto flex-wrap">
          <TabsTrigger value="channel"><User className="w-4 h-4 mr-2" />Channel</TabsTrigger>
          <TabsTrigger value="privacy"><Lock className="w-4 h-4 mr-2" />Privacy</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" />Notifications</TabsTrigger>
          <TabsTrigger value="playback"><PlayCircle className="w-4 h-4 mr-2" />Playback</TabsTrigger>
          <TabsTrigger value="monetization"><Wallet className="w-4 h-4 mr-2" />Monetization</TabsTrigger>
          <TabsTrigger value="security"><Shield className="w-4 h-4 mr-2" />Security</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="w-4 h-4 mr-2" />Appearance</TabsTrigger>
          <TabsTrigger value="support"><LifeBuoy className="w-4 h-4 mr-2" />Support</TabsTrigger>
        </TabsList>

        <TabsContent value="channel" className="space-y-4">
          <Panel title="Channel customization" desc="Public profile shown on videos, comments, and search." full>
            <div className="grid lg:grid-cols-[auto_1fr] gap-5 w-full">
              <div className="flex lg:flex-col items-center gap-3">
                {avatarUrl ? <img src={avatarUrl} alt="Channel avatar" className="w-24 h-24 rounded-full object-cover ring-2 ring-primary/60" /> : <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-primary-foreground">{(displayName || email || 'U')[0].toUpperCase()}</div>}
                <input ref={fileRef} type="file" hidden accept="image/*" onChange={uploadAvatar} />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" /> Avatar</Button>
              </div>
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3"><div><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div><div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
                <div><Label>About</Label><Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
                <Button onClick={saveProfile} disabled={busy}>Save channel</Button>
              </div>
            </div>
          </Panel>
          <div className="grid md:grid-cols-3 gap-3"><Stat icon={Video} label="Videos" value={String(videoCount)} /><Stat icon={Upload} label="Upload limit" value={`${profile?.upload_limit_mb ?? 1024} MB`} /><Stat icon={Bell} label="Followers" value={String(profile?.follower_count ?? 0)} /></div>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-3">
          <Panel title="Direct message permissions" desc="Choose who is allowed to start a conversation with you." full>
            <div className="flex flex-wrap gap-2 w-full">
              {DM_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => savePrivacy({ dm_permission: o.id })}
                  className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${privacy.dm_permission === o.id ? 'border-primary bg-primary/15 text-primary' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}
                >
                  <MessageCircle className="w-3.5 h-3.5 inline mr-1.5" />{o.label}
                </button>
              ))}
            </div>
          </Panel>
          <Toggle icon={Lock} label="Private account" desc="Limit visible activity to approved followers." checked={privacy.is_private} onChange={(v) => savePrivacy({ is_private: v })} />
          <Toggle icon={EyeOff} label="Hide liked videos" desc="Keep liked videos off your public profile." checked={privacy.hide_liked_videos} onChange={(v) => savePrivacy({ hide_liked_videos: v })} />
          <Toggle icon={History} label="Hide watch history" desc="Do not expose recent viewing activity." checked={privacy.hide_watch_history} onChange={(v) => savePrivacy({ hide_watch_history: v })} />

          <Panel title="Blocked users" desc="Blocked accounts cannot message, follow, or interact with you." full>
            <div className="w-full space-y-2">
              {blocked.length === 0 && <p className="text-xs text-muted-foreground">You have not blocked anyone.</p>}
              {blocked.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 glass rounded-lg border border-border/30 p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {b.avatar_url ? <img src={b.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-white/10 grid place-items-center"><UserX className="w-4 h-4" /></div>}
                    <div className="min-w-0"><p className="text-xs font-semibold truncate">{b.display_name ?? 'User'}</p><p className="text-[10px] text-muted-foreground truncate">@{b.handle ?? b.id.slice(0, 8)}</p></div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => unblock(b.id)}>Unblock</Button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="IP protection status" desc="Platform-level abuse and fraud protection applied to your account." full>
            <div className="grid md:grid-cols-4 gap-3 w-full">
              <Stat icon={Shield} label="Active IP rules" value={String(ipStatus?.active_rules ?? 0)} />
              <Stat icon={AlertTriangle} label="Events (24h)" value={String(ipStatus?.recent_events ?? 0)} />
              <Stat icon={Check} label="Account flagged" value={ipStatus?.account_flagged ? 'Yes' : 'No'} />
              <Stat icon={Lock} label="Account banned" value={ipStatus?.account_banned ? 'Yes' : 'No'} />
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-3">
          <Toggle icon={Bell} label="In-app notifications" desc="Show activity alerts inside ProNax." checked={settings.notifications_enabled} onChange={(v) => updateSettings({ notifications_enabled: v })} />
          <Toggle icon={Video} label="New videos from channels you follow" desc="Alert me when creators I follow publish." checked={notifs.new_video} onChange={(v) => saveNotifs({ new_video: v })} />
          <Toggle icon={MessageCircle} label="Comments and replies" desc="Alert me about replies to my comments and videos." checked={notifs.comment_reply} onChange={(v) => saveNotifs({ comment_reply: v })} />
          <Toggle icon={User} label="Mentions and new followers" desc="Alert me when someone mentions or follows me." checked={notifs.mention} onChange={(v) => saveNotifs({ mention: v })} />
          <Toggle icon={PlayCircle} label="Live streams" desc="Alert me when a followed creator goes live." checked={notifs.live_start} onChange={(v) => saveNotifs({ live_start: v })} />
          <Toggle icon={Wallet} label="Payout and earnings" desc="Alert me about wallet, revenue and payout events." checked={notifs.payout} onChange={(v) => saveNotifs({ payout: v })} />
          <Toggle icon={Shield} label="Copyright and moderation" desc="Alert me about claims, strikes and enforcement." checked={notifs.copyright} onChange={(v) => saveNotifs({ copyright: v })} />
          <Toggle icon={LifeBuoy} label="System announcements" desc="Product updates and platform announcements." checked={notifs.marketing} onChange={(v) => saveNotifs({ marketing: v })} />
        </TabsContent>

        <TabsContent value="playback" className="space-y-3">
          <Toggle icon={PlayCircle} label="Autoplay next video" desc="Continue recommended playback automatically." checked={settings.autoplay_videos} onChange={(v) => updateSettings({ autoplay_videos: v })} />
          <Toggle icon={PlayCircle} label="Autoplay shorts" desc="Play the next short automatically." checked={settings.autoplay_shorts} onChange={(v) => updateSettings({ autoplay_shorts: v })} />
          <Toggle icon={Smartphone} label="Data saver" desc="Prefer smoother low-bandwidth playback when networks are slow." checked={!!getCustomSetting('dataSaver')} onChange={(v) => { setCustomSetting('dataSaver', v); toast({ title: 'Saved' }); }} />
          <Toggle icon={Palette} label="Ambient neon player" desc="Keep polished lighting around the watch player." checked={!!getCustomSetting('ambient', true)} onChange={(v) => { setCustomSetting('ambient', v); toast({ title: 'Saved' }); }} />
        </TabsContent>

        <TabsContent value="monetization" className="space-y-4">
          <Panel title="Wallet threshold" desc="Creator revenue and payout readiness." full>
            <div className="w-full space-y-3">
              <div className="grid md:grid-cols-4 gap-3">
                <Stat icon={Wallet} label="Available" value={`$${balance.toFixed(4)}`} />
                <Stat icon={Check} label="Total earned" value={`$${Number(wallet?.total_earned ?? 0).toFixed(4)}`} />
                <Stat icon={Video} label="Ad revenue" value={`$${adRevenue.toFixed(4)}`} />
                <Stat icon={Wallet} label="Minimum payout" value="$10.00" />
              </div>
              <Progress value={payoutProgress} />
              <Button asChild><Link to="/wallet">Open wallet</Link></Button>
            </div>
          </Panel>
          <Panel title="Payout preferences" desc="Where approved earnings are sent." full>
            <div className="w-full grid md:grid-cols-2 gap-3">
              <div><Label>Payout method</Label><Input value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} placeholder="Bank transfer, wallet provider…" /></div>
              <div><Label>Payout details</Label><Input value={payoutDetails} onChange={(e) => setPayoutDetails(e.target.value)} placeholder="Account or wallet address" /></div>
              <div><Button onClick={savePayout} disabled={busy}>Save payout preferences</Button></div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Panel title="Password" desc="Change your account password." full>
            <div className="w-full grid md:grid-cols-3 gap-2">
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
              <Button onClick={updatePassword}>Change password</Button>
            </div>
          </Panel>

          <Toggle icon={Shield} label="Two-factor authentication" desc="Require extra verification for sensitive actions." checked={privacy.two_factor_enabled} onChange={(v) => savePrivacy({ two_factor_enabled: v })} />

          <Panel title="Active sessions" desc="Devices currently signed in to your account." full>
            <div className="w-full space-y-2">
              {sessions.length === 0 && <p className="text-xs text-muted-foreground">No other active sessions found.</p>}
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 glass rounded-lg border border-border/30 p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{s.user_agent ?? 'Unknown device'}</p>
                    <p className="text-[10px] text-muted-foreground">{s.ip ?? 'unknown IP'} · last active {s.updated_at ? new Date(s.updated_at).toLocaleString() : '—'}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => revokeSession(s.id)}>Revoke</Button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Account strikes" desc="View your violation history and active strikes." full>
            <div className="space-y-3 w-full">
              {strikes.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <AlertTriangle className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  No strikes on record
                </div>
              ) : (
                <div className="space-y-2">
                  {strikes.map((strike) => (
                    <div key={strike.id} className={`glass rounded-lg border p-3 ${strike.revoked_at ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                          strike.severity === 3 ? 'bg-destructive/20 text-destructive' :
                          strike.severity === 2 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          Level {strike.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">{strike.category}</span>
                        {strike.revoked_at && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Revoked</span>}
                      </div>
                      <p className="text-xs text-foreground">{strike.reason}</p>
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(strike.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Delete account" desc="Permanently remove your account, channel, videos and wallet history." full>
            <div className="w-full flex flex-col sm:flex-row gap-2">
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder='Type DELETE to confirm' />
              <Button variant="destructive" onClick={deleteAccount}><Trash2 className="w-4 h-4" /> Delete account</Button>
            </div>
          </Panel>

          <Button variant="destructive" onClick={async () => { await signOut(); navigate('/auth', { replace: true }); }}><LogOut className="w-4 h-4" /> Sign out securely</Button>
        </TabsContent>

        <TabsContent value="appearance"><Panel title="Theme" desc="Pick a neon viewing style." full><div className="grid sm:grid-cols-3 gap-3 w-full">{THEMES.map((t) => <button key={t.id} onClick={() => { setTheme(t.id); applyTheme(t.id); }} className={`glass p-4 rounded-xl border-2 text-left ${theme === t.id ? 'border-primary' : 'border-transparent'}`}><div className="h-16 rounded-md mb-2" style={{ background: `linear-gradient(135deg, hsl(${t.bg}), hsl(${t.primary}))` }} /><p className="text-sm font-semibold">{t.label}</p></button>)}</div></Panel></TabsContent>

        <TabsContent value="support" className="space-y-4"><Panel title="Support / appeal desk" desc="Send account, payout, moderation, or appeal requests to admins." full><div className="w-full space-y-3"><Textarea rows={5} value={appealMessage} onChange={(e) => setAppealMessage(e.target.value.slice(0, 1000))} placeholder="Describe the issue clearly…" /><Button onClick={submitSupport} disabled={busy}>Send request</Button></div></Panel></TabsContent>
      </Tabs>
    </main>
  );
}

function Panel({ title, desc, children, full }: { title: string; desc?: string; children: ReactNode; full?: boolean }) {
  return <div className="glass-strong rounded-xl border border-border/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h3 className="text-sm font-semibold">{title}</h3>{desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}</div><div className={full ? 'w-full' : 'shrink-0'}>{children}</div></div>;
}

function Toggle({ icon: Icon, label, desc, checked, onChange }: { icon: any; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Panel title={label} desc={desc}><div className="flex items-center gap-3"><Icon className="w-4 h-4 text-primary" /><Switch checked={checked} onCheckedChange={onChange} /></div></Panel>;
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-xl glass border border-border/40 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="w-3.5 h-3.5 text-primary" />{label}</div><p className="text-lg font-display font-bold mt-1">{value}</p></div>;
}
