/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { ShieldAlert, Send, Loader2, CheckCircle2, LogOut, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/loose';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;
import { useAuthSession } from '@/hooks/useAuthSession';

export default function Appeal() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuthSession();
  const [profile, setProfile] = useState<any>(null);
  const [existing, setExisting] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [strikes, setStrikes] = useState<any[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/auth', { replace: true }); return; }
    (async () => {
      const [{ data: p }, { data: a }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('is_banned, ban_reason, banned_until, email').eq('id', user.id).maybeSingle(),
        supabase.from('appeals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('user_strikes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      setProfile(p);
      setExisting(a);
      setStrikes(s || []);
      if (p && !p.is_banned) navigate('/', { replace: true });
    })();
  }, [user, loading, navigate]);

  const submit = async () => {
    if (message.trim().length < 20) return toast.error('Please describe why the action should be reversed (at least 20 characters).');
    if (message.length > 2000) return toast.error('Message is too long (max 2000).');
    setSubmitting(true);
    const { error } = await supabase.from('appeals').insert({
      user_id: user!.id,
      email: profile?.email ?? user!.email ?? null,
      message: message.trim(),
      status: 'pending',
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success('Appeal submitted. An admin will review it.');
    setExisting({ status: 'pending', message: message.trim(), created_at: new Date().toISOString() });
    setMessage('');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  if (loading || !user || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center px-4 py-10 bg-aurora">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="glass-strong rounded-3xl border border-destructive/40 p-6 lg:p-8 max-w-lg w-full relative overflow-hidden"
        style={{ boxShadow: '0 0 60px -10px hsl(var(--destructive) / 0.35), inset 0 0 30px hsl(var(--destructive) / 0.05)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 via-transparent to-primary/10 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-destructive/15 border border-destructive/40">
              <ShieldAlert className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-glow">Account Suspended</h1>
              <p className="text-xs text-muted-foreground">You can appeal this decision below.</p>
            </div>
          </div>

          <div className="glass rounded-xl border border-border/40 p-3 text-xs space-y-1 mb-4">
            <div><span className="text-muted-foreground">Reason:</span> <span className="font-semibold">{profile.ban_reason || 'Policy violation'}</span></div>
            {profile.banned_until && <div><span className="text-muted-foreground">Until:</span> {new Date(profile.banned_until).toLocaleString()}</div>}
            <div className="text-muted-foreground text-[10px] pt-1">Ban enforced by content-safety triggers. Auto-actions can be overturned by admins.</div>
          </div>

          {/* Strike History */}
          {strikes.length > 0 && (
            <div className="glass rounded-xl border border-border/40 p-3 text-xs space-y-2 mb-4">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <span>Strike History ({strikes.filter(s => !s.revoked_at && (!s.expires_at || new Date(s.expires_at) > new Date())).length} active)</span>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {strikes.map((strike) => (
                  <div key={strike.id} className={`rounded-lg border p-2 ${strike.revoked_at ? 'opacity-60 bg-muted/30' : 'bg-muted/50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                        strike.severity === 3 ? 'bg-destructive/20 text-destructive' :
                        strike.severity === 2 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        L{strike.severity}
                      </span>
                      <span className="text-[9px] text-muted-foreground capitalize">{strike.category}</span>
                      {strike.revoked_at && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Revoked</span>
                      )}
                      {!strike.revoked_at && (!strike.expires_at || new Date(strike.expires_at) > new Date()) && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Active</span>
                      )}
                    </div>
                    <p className="text-[10px] text-foreground truncate">{strike.reason}</p>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {new Date(strike.created_at).toLocaleDateString()}
                      {strike.expires_at && !strike.revoked_at && (
                        <span> · Exp: {new Date(strike.expires_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {existing ? (
            <div className="glass rounded-xl border border-primary/40 p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Appeal on file</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{new Date(existing.created_at).toLocaleString()}</span>
              </div>
              <p className="text-xs whitespace-pre-wrap text-muted-foreground">{existing.message}</p>
              <div className="text-[10px] mt-2 uppercase tracking-wider">
                Status: <span className={
                  existing.status === 'approved' ? 'text-emerald-400' :
                  existing.status === 'rejected' ? 'text-destructive' : 'text-yellow-400'
                }>{existing.status}</span>
              </div>
              {existing.admin_note && <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/30 pt-2">Admin: {existing.admin_note}</p>}
            </div>
          ) : (
            <>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Your appeal</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Explain why this action should be reversed. Be specific — include context, references, and what you've changed."
                maxLength={2000}
                rows={6}
                className="w-full mt-1 rounded-xl glass border border-border/40 focus:border-primary/60 outline-none p-3 text-sm resize-none"
              />
              <div className="text-[10px] text-muted-foreground text-right">{message.length} / 2000</div>
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full mt-2 gradient-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 glow-primary hover:scale-[1.01] transition disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit appeal
              </button>
            </>
          )}

          <button onClick={handleSignOut} className="w-full mt-3 glass border border-border/40 px-4 py-2 rounded-xl text-xs text-muted-foreground hover:border-destructive/40 inline-flex items-center justify-center gap-2">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </motion.div>
    </div>
  );
}
