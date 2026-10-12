/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheck, Crown, Mail, Trash2, Loader2, UserPlus, RefreshCw, Clock, X, KeyRound,
} from 'lucide-react';
import { supabase as _supabase } from '@/integrations/supabase/loose';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

type AdminRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_super: boolean;
  granted_at: string;
};

type InviteRow = {
  id: string;
  email: string;
  status: string;
  created_at: string;
};

export function AdminAccessTab() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setMe(uid);

      const [teamRes, inviteRes, ownerRes] = await Promise.all([
        supabase.rpc('admin_team_list'),
        supabase
          .from('admin_invites')
          .select('id,email,status,created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        uid ? supabase.rpc('is_super_admin', { _user_id: uid }) : Promise.resolve({ data: false }),
      ]);

      if (teamRes.error) {
        // The RPC is missing or out of date on this database — fall back to a
        // direct read of user_roles so the team list still works.
        const fallback = await supabase
          .from('user_roles')
          .select('user_id, role, created_at')
          .in('role', ['admin', 'moderator', 'support']);

        if (fallback.error) {
          if (/does not exist/i.test(teamRes.error.message ?? '')) setNeedsSetup(true);
          throw teamRes.error;
        }

        const ids = [...new Set((fallback.data ?? []).map((r: { user_id: string }) => r.user_id))];
        const profs = ids.length
          ? await supabase.from('profiles').select('id, email, display_name, avatar_url').in('id', ids)
          : { data: [] as Array<Record<string, string | null>> };
        const byId = new Map(
          ((profs.data ?? []) as Array<{ id: string; email: string | null; display_name: string | null; avatar_url: string | null }>)
            .map((p) => [p.id, p]),
        );

        setNeedsSetup(false);
        setAdmins(
          (fallback.data ?? []).map((r: { user_id: string; role: string; created_at: string }) => ({
            user_id: r.user_id,
            email: byId.get(r.user_id)?.email ?? null,
            display_name: byId.get(r.user_id)?.display_name ?? r.role,
            avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
            is_super: false,
            granted_at: r.created_at,
          })) as AdminRow[],
        );
        setInvites((inviteRes?.data ?? []) as InviteRow[]);
        setIsOwner(Boolean(ownerRes?.data));
        return;
      }
      setNeedsSetup(false);
      setAdmins((teamRes.data ?? []) as AdminRow[]);
      setInvites((inviteRes?.data ?? []) as InviteRow[]);
      setIsOwner(Boolean(ownerRes?.data));
    } catch {
      setAdmins([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addAdmin = async () => {
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      toast.error('Enter a valid email address');
      return;
    }
    setBusy('add');
    const { data, error } = await supabase.rpc('admin_invite_by_email', { p_email: value });
    setBusy(null);
    if (error) {
      toast.error(error.message?.includes('owner only')
        ? 'Only the owner account can add admins'
        : `Could not add admin: ${error.message}`);
      return;
    }
    setEmail('');
    toast.success(data?.granted
      ? `Admin access granted to ${value}` 
      : `${value} invited — access activates the moment they sign up`);
    void load();
  };

  const revoke = async (row: AdminRow) => {
    setBusy(row.user_id);
    const { error } = await supabase.rpc('admin_revoke_admin', { p_user: row.user_id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Admin access removed from ${row.email ?? row.display_name}`);
    void load();
  };

  const setOwner = async (row: AdminRow, grant: boolean) => {
    setBusy(row.user_id);
    const { error } = await supabase.rpc('admin_set_owner', { p_user: row.user_id, p_grant: grant });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(grant ? 'Co-owner access granted' : 'Co-owner access removed');
    void load();
  };

  const cancelInvite = async (row: InviteRow) => {
    setBusy(row.id);
    const { error } = await supabase.rpc('admin_cancel_invite', { p_id: row.id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Invite cancelled');
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="glass-strong rounded-2xl border border-primary/30 p-4 sm:p-6 bg-gradient-to-r from-background via-primary/5 to-accent/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-display font-bold text-foreground flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary shrink-0" /> Admin Access & Team
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Add a trusted email as admin so they can help you manage users, videos and moderation.
              Only the owner account can add or remove admins.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="glass border border-border/40 hover:border-primary/50 text-foreground px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition self-start"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-border/30 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addAdmin(); }}
              disabled={!isOwner}
              placeholder="teammate@gmail.com"
              className="w-full h-11 bg-background/60 border border-border/40 rounded-xl pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 disabled:opacity-50"
            />
          </div>
          <button
            onClick={() => void addAdmin()}
            disabled={!isOwner || busy === 'add'}
            className="h-11 px-5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.01] transition"
          >
            {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Grant Admin Access
          </button>
        </div>

        {!isOwner && !loading && (
          <p className="text-[11px] text-yellow-400 mt-2">
            You have admin access but not owner rights, so you can view the team but not change it.
          </p>
        )}
        {needsSetup && (
          <p className="text-[11px] text-destructive mt-2">
            Database setup pending — run <code className="font-mono">db/admin_team_management.sql</code> in your Supabase SQL editor.
          </p>
        )}
      </div>

      {/* Admin list */}
      <div className="glass-strong rounded-2xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2 bg-muted/20">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Active Admins</h3>
          <span className="text-[11px] text-muted-foreground">({admins.length})</span>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No admins found.</div>
        ) : (
          <ul className="divide-y divide-border/20">
            {admins.map((a) => (
              <li key={a.user_id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0 overflow-hidden">
                    {a.avatar_url
                      ? <img src={a.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (a.display_name?.[0] ?? a.email?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 truncate">
                      <span className="truncate">{a.display_name || a.email || a.user_id}</span>
                      {a.is_super && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase shrink-0">
                          <Crown className="w-3 h-3" /> Owner
                        </span>
                      )}
                      {a.user_id === me && (
                        <span className="text-[10px] text-muted-foreground shrink-0">(you)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.email ?? '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end shrink-0">
                  {isOwner && a.user_id !== me && (
                    <>
                      <button
                        onClick={() => void setOwner(a, !a.is_super)}
                        disabled={busy === a.user_id}
                        className="px-3 h-9 rounded-xl glass border border-border/40 text-xs font-semibold text-foreground hover:border-yellow-500/50 transition inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        {a.is_super ? 'Remove owner' : 'Make co-owner'}
                      </button>
                      {!a.is_super && (
                        <button
                          onClick={() => void revoke(a)}
                          disabled={busy === a.user_id}
                          className="px-3 h-9 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/25 transition inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busy === a.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending invites */}
      <div className="glass-strong rounded-2xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2 bg-muted/20">
          <Clock className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">Pending Invites</h3>
          <span className="text-[11px] text-muted-foreground">({invites.length})</span>
        </div>
        {invites.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No pending invites. Invited emails get admin access automatically after they sign up.
          </div>
        ) : (
          <ul className="divide-y divide-border/20">
            {invites.map((i) => (
              <li key={i.id} className="p-3 sm:p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{i.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Invited {new Date(i.created_at).toLocaleDateString()}
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => void cancelInvite(i)}
                    disabled={busy === i.id}
                    className="px-3 h-9 rounded-xl glass border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
