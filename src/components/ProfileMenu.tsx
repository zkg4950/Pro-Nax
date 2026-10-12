/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@/lib/router-compat';
import { User, LogOut, SlidersHorizontal, Settings as SettingsIcon, Sun, Moon, LogIn, Shield, Key, Sparkles, X, MessageCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/integrations/supabase/loose';
import { toast } from 'sonner';
import { generateUniqueUserId } from '@/lib/videoFingerprint';
import { UserProfileCard3D } from '@/components/UserProfileCard3D';

const THEME_KEY = 'pronax:theme';

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const s = window.localStorage.getItem(THEME_KEY);
  if (s === 'light' || s === 'dark') return s;
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function ProfileMenu() {
  const { user, signOut: authSignOut } = useAuthSession();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('User');
  const [showAdmin, setShowAdmin] = useState(false);
  const [show3DCard, setShow3DCard] = useState(false);

  useEffect(() => { setTheme(getInitialTheme()); }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') { root.classList.add('light'); root.classList.remove('dark'); }
    else { root.classList.add('dark'); root.classList.remove('light'); }
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ }
  }, [theme]);

  useEffect(() => {
    if (!user?.id) { setShowAdmin(false); return; }
    supabase.from('profiles').select('avatar_url, display_name').eq('id', user.id).maybeSingle().then(({ data, error }) => {
      if (!error && data) {
        setAvatarUrl(data.avatar_url ?? null);
        if (data.display_name) setDisplayName(data.display_name);
      }
      // If profile doesn't exist, we'll let the authGuards handle creation
    });
    // Try to check admin status, but don't fail if the RPC function doesn't exist
    supabase.rpc('admin_bootstrap_status').then(({ data }) => {
      const b = data as { is_admin?: boolean; can_claim_initial_admin?: boolean } | null;
      setShowAdmin(Boolean(b?.is_admin || b?.can_claim_initial_admin));
    }, () => {
      // RPC function doesn't exist or failed - just hide admin options
      setShowAdmin(false);
    });
  }, [user?.id]);


  const email = user?.email ?? '';
  const initials = (email.split('@')[0] || 'U').slice(0, 2).toUpperCase();
  const uniqueId = user ? generateUniqueUserId(email || user.id) : '';

  async function handleSignOut() {
    const result = await authSignOut();
    if (result.success) {
      toast.success('Signed out');
      navigate('/');
    } else {
      toast.error(result.error || 'Failed to sign out');
    }
  }

  if (!user) {
    return (
      <Link
        to="/auth"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
      >
        <LogIn className="w-4 h-4" /> Sign in
      </Link>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Account menu"
            className="h-8 w-8 rounded-full gradient-primary overflow-hidden hover:ring-2 hover:ring-primary/50 transition cursor-pointer"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] font-display font-bold text-primary-foreground">
                {initials}
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1">
            <div className="truncate font-bold text-sm text-foreground">{displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{email}</div>
            <div className="pt-1 flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] font-bold flex items-center gap-1">
                <Key className="w-3 h-3 text-cyan-400" /> {uniqueId}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setShow3DCard(true)} className="text-cyan-400 focus:text-cyan-300 font-bold">
            <Sparkles className="w-4 h-4 mr-2 text-cyan-400" /> View 3D Profile Card
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          <div className="flex items-center justify-between px-2 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              Appearance
            </span>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
              aria-label="Toggle dark mode"
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="w-4 h-4 mr-2" /> Channel Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/inbox')}>
            <MessageCircle className="w-4 h-4 mr-2" /> Inbox
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/studio')}>
            <SlidersHorizontal className="w-4 h-4 mr-2" /> Studio
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <SettingsIcon className="w-4 h-4 mr-2" /> Settings
          </DropdownMenuItem>
          {showAdmin && (
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Shield className="w-4 h-4 mr-2 text-purple-400" /> Admin Panel
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 3D Profile Modal */}
      {show3DCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative max-w-md w-full">
            <button
              onClick={() => setShow3DCard(false)}
              className="absolute -top-3 -right-3 z-30 p-1.5 rounded-full bg-slate-900 border border-white/20 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <UserProfileCard3D
              user={{
                id: user.id,
                email: email,
                display_name: displayName,
                handle: `@${displayName.toLowerCase().replace(/\s+/g, '')}`,
                avatar_url: avatarUrl || undefined,
                role: showAdmin ? 'admin' : 'creator',
                is_verified: true,
                subscribers_count: 14250,
                videos_count: 28,
                wallet_balance: 1450.00,
                unique_user_id: uniqueId,
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
