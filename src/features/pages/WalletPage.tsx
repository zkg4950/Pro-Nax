/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import {
  Wallet as WalletIcon, TrendingUp, DollarSign, LogIn, BarChart3, Activity, Clock, RefreshCw, LogOut, ShieldCheck, Banknote, Lock, History,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/loose';
import { useAuthSession } from '@/hooks/useAuthSession';
import { toast } from 'sonner';
import { fetchLiveRates } from '@/lib/adSdk';
import WithdrawalMethods, { WithdrawalMethodRow } from '@/components/WithdrawalMethods';
import { EarningsAnalytics } from '@/components/EarningsAnalytics';
import { useEarningsSeries } from '@/hooks/useEarningsSeries';
import { firstIssue, withdrawalSchema } from '@/lib/validation';
import { requireVerifiedUser } from '@/lib/authGuards';
import { recordAudit } from '@/lib/audit';

interface WalletRow { balance: number; total_earned: number; updated_at: string; }
interface WalletRowExt extends WalletRow { total_withdrawn?: number }
interface LogRow {
  id: string;
  video_id: string;
  views_count: number;
  amount_earned: number;
  created_at: string;
  ad_network?: string | null;
  cpm?: number | null;
  gross_revenue?: number | null;
}

interface WithdrawalRow {
  id: string;
  amount: number;
  status: string;
  method?: string | null;
  country?: string | null;
  destination?: string | null;
  created_at: string;
  processed_at?: string | null;
}

interface LedgerRow {
  id: string;
  delta: number;
  balance_after: number;
  kind: string;
  reason: string | null;
  reference_id: string | null;
  created_at: string;
}

export default function WalletPage() {
  const { session, user, loading: authLoading, signOut } = useAuthSession();
  const { logs: earningsSeries } = useEarningsSeries(user?.id);
  const [wallet, setWallet] = useState<WalletRowExt | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [liveRates, setLiveRates] = useState<Awaited<ReturnType<typeof fetchLiveRates>> | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [linkedMethods, setLinkedMethods] = useState<WithdrawalMethodRow[]>([]);

  // Instant cashout (demo) modal
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [cashoutAmt, setCashoutAmt] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [cashoutProcessing, setCashoutProcessing] = useState(false);

  const submitCashout = async () => {
    const amt = Number(cashoutAmt);
    if (!bankName.trim() || accountNumber.trim().length < 6 || !accountHolder.trim()) {
      toast.error('Please fill bank name, account holder, and a valid account number.');
      return;
    }
    const bal = Number(wallet?.balance ?? 0);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > bal) { toast.error('Amount exceeds available balance'); return; }
    setCashoutProcessing(true);
    await new Promise((r) => setTimeout(r, 900));
    setCashoutProcessing(false);
    toast.success(`Cashout of $${amt.toFixed(2)} sent to ${bankName} · ****${accountNumber.slice(-4)}`, {
      description: 'Demo mode — no real funds moved.',
    });

    setCashoutOpen(false);
    setCashoutAmt(''); setBankName(''); setAccountNumber(''); setAccountHolder('');
  };


  // Withdrawal form state
  const [method, setMethod] = useState<'easypaisa' | 'payoneer' | 'binance'>('easypaisa');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const MIN_PAYOUT = 10;

  // Keep selected method aligned with linked methods
  useEffect(() => {
    if (linkedMethods.length === 0) return;
    if (!linkedMethods.some((m) => m.method_type === method)) {
      setMethod(linkedMethods[0].method_type);
    }
  }, [linkedMethods, method]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [w, l, wr, tx] = await Promise.all([
        supabase.from('user_wallets').select('balance, total_earned, total_withdrawn, updated_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('revenue_logs')
          .select('id, video_id, views_count, amount_earned, created_at, ad_network, cpm, gross_revenue')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(200),
        supabase.from('withdrawal_requests')
          .select('id, amount, status, method, country, destination, created_at, processed_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('wallet_transactions' as any)
          .select('id, delta, balance_after, kind, reason, reference_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(100),
      ]);
      setWallet((w?.data as WalletRowExt | null) ?? null);
      setLogs(((l?.data as LogRow[]) ?? []));
      setWithdrawals(((wr?.data as WithdrawalRow[]) ?? []));
      setLedger(((tx?.data as unknown as LedgerRow[]) ?? []));
    } catch (e) {
      console.error('[wallet] fetch failed', e);
      setWallet(null);
      setLogs([]);
      setWithdrawals([]);
      setLedger([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [user?.id]);

  // Poll live CPM from ad network every 60s
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetchLiveRates();
      if (alive) setLiveRates(r);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Realtime: refresh on new revenue entries
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`revenue:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_logs', filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_wallets', filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id]);

  const perVideo = useMemo(() => {
    const map = new Map<string, { views: number; earned: number; gross: number; cpmSum: number; cpmCount: number; networks: Set<string> }>();
    logs.forEach((l) => {
      const cur = map.get(l.video_id) ?? { views: 0, earned: 0, gross: 0, cpmSum: 0, cpmCount: 0, networks: new Set<string>() };
      cur.views += Number(l.views_count);
      cur.earned += Number(l.amount_earned);
      cur.gross += Number(l.gross_revenue ?? (Number(l.amount_earned) / 0.6));
      if (l.cpm != null) { cur.cpmSum += Number(l.cpm); cur.cpmCount += 1; }
      if (l.ad_network) cur.networks.add(l.ad_network);
      map.set(l.video_id, cur);
    });
    return Array.from(map.entries())
      .map(([video_id, v]) => ({
        video_id,
        views: v.views,
        earned: v.earned,
        gross: v.gross,
        avgCpm: v.cpmCount ? v.cpmSum / v.cpmCount : 0,
        networks: Array.from(v.networks),
      }))
      .sort((a, b) => b.earned - a.earned);
  }, [logs]);

  const fillStats = useMemo(() => {
    const withCpm = logs.filter(l => l.cpm != null);
    const avgCpm = withCpm.length ? withCpm.reduce((s, l) => s + Number(l.cpm), 0) / withCpm.length : 0;
    const fillRate = logs.length ? (withCpm.length / logs.length) * 100 : 0;
    return { avgCpm, fillRate };
  }, [logs]);

  const handleSignOut = async () => {
    const result = await signOut();
    if (result.success) {
      toast.success('Signed out');
    } else {
      toast.error(result.error || 'Failed to sign out');
    }
  };

  if (authLoading) {
    return <div className="flex-1 min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center p-4 pb-24 lg:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-8 max-w-md w-full text-center border border-primary/30 glow-border-primary"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl gradient-primary glow-primary flex items-center justify-center mb-4">
            <WalletIcon className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-display font-bold text-glow mb-2">Sign in to view your wallet</h2>
          <p className="text-xs text-muted-foreground mb-5">Your balance, earnings, and revenue history are tied to your account.</p>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-primary-foreground gradient-primary glow-primary"
          >
            <LogIn className="w-4 h-4" /> Sign in / Sign up
          </Link>
        </motion.div>
      </div>
    );
  }

  const balance = Number(wallet?.balance ?? 0);
  const totalEarned = Number(wallet?.total_earned ?? 0);
  const totalWithdrawn = Number(wallet?.total_withdrawn ?? 0);
  const canWithdraw = balance >= MIN_PAYOUT;

  const submitWithdraw = async () => {
    if (!user) return;
    const parsed = withdrawalSchema.safeParse({
      amount: Number(withdrawAmount),
      method,
      payment_details: {},
    });
    if (!parsed.success) { toast.error(firstIssue(parsed.error)); return; }
    const amt = parsed.data.amount;
    if (amt < MIN_PAYOUT) { toast.error(`Minimum payout is $${MIN_PAYOUT}`); return; }
    if (amt > balance) { toast.error('Amount exceeds available balance'); return; }
    const linked = linkedMethods.find((m) => m.method_type === method);
    if (!linked) { toast.error(`Link a ${method} account first using the panel below.`); return; }
    const verified = await requireVerifiedUser('request a payout');
    if (!verified) return;
    setWithdrawing(true);
    const { error } = await supabase.rpc('request_withdrawal', {
      p_amount: amt,
      p_method: parsed.data.method,
      p_details: parsed.data.payment_details,
    });
    setWithdrawing(false);
    if (error) { toast.error(error.message); return; }
    void recordAudit({
      action: 'wallet.withdrawal_requested',
      entityType: 'withdrawal',
      severity: 'warning',
      metadata: { amount: amt, method: parsed.data.method },
    });
    toast.success(`Withdrawal request submitted via ${method.toUpperCase()}`);
    setWithdrawOpen(false);
    setWithdrawAmount('');
    fetchAll();
  };

  return (
    <div className="flex-1 min-h-screen p-4 lg:p-6 space-y-6 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <WalletIcon className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-display font-bold text-glow">Creator Wallet</h1>
            <p className="text-[11px] text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-border/50 text-xs text-foreground hover:border-primary/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-border/50 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      {/* Balance hero */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-6 lg:p-8 border border-primary/30 glass-strong glow-border-primary"
        style={{ background: 'linear-gradient(135deg, hsla(var(--primary)/0.18), hsla(var(--secondary)/0.12) 60%, transparent)' }}
      >
        <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-primary/30 blur-3xl pointer-events-none" />
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground relative">Available Balance</p>
        <p className="text-4xl lg:text-5xl font-display font-bold text-foreground text-glow mt-1 tabular-nums relative">
          ${balance.toFixed(4)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 relative">
          Total lifetime earnings: <span className="text-primary font-semibold">${totalEarned.toFixed(4)}</span>
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3 relative">
          <button
            onClick={() => canWithdraw ? setWithdrawOpen(v => !v) : null}
            disabled={!canWithdraw || withdrawing}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition ${
              canWithdraw
                ? 'gradient-primary text-primary-foreground glow-primary hover:scale-[1.02]'
                : 'bg-muted/30 text-muted-foreground border border-border/40 cursor-not-allowed'
            }`}
          >
            {canWithdraw ? <Banknote className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {canWithdraw ? `Request Withdrawal ($${balance.toFixed(2)} USD)` : 'Minimum payout is $10 USD'}
          </button>
          <button
            onClick={() => setCashoutOpen(true)}
            disabled={balance <= 0}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border transition ${
              balance > 0
                ? 'glass border-primary/50 text-primary hover:shadow-[0_0_25px_hsla(var(--primary)/0.5)] hover:scale-[1.02]'
                : 'bg-muted/30 text-muted-foreground border-border/40 cursor-not-allowed'
            }`}
          >
            <Banknote className="w-4 h-4" /> Withdraw Funds (Demo)
          </button>



          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg glass border border-emerald-500/30 text-[11px] text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            Platform Status: <span className="font-semibold">Healthy · 55/45 split active</span>
          </div>
          {liveRates && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg glass border border-primary/30 text-[11px] text-primary">
              <TrendingUp className="w-3.5 h-3.5" />
              Live Ad Network CPM: <span className="font-semibold tabular-nums">${liveRates.cpm.toFixed(2)}</span>
              <span className="text-muted-foreground">/ 1k views · {liveRates.network}</span>
            </div>
          )}
        </div>

        {/* Withdrawal Form */}
        {withdrawOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-5 relative glass rounded-xl border border-primary/30 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-semibold text-foreground">Request Withdrawal</h3>
              <span className="text-[10px] text-muted-foreground">All amounts in USD ($)</span>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Amount (USD)</label>
              <input
                type="number" min={MIN_PAYOUT} max={balance} step="0.01"
                value={withdrawAmount}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { setWithdrawAmount(''); return; }
                  const n = Number(raw);
                  if (isNaN(n)) return;
                  // Clamp: cannot exceed available balance (earnings)
                  const clamped = Math.min(n, balance);
                  setWithdrawAmount(clamped.toString());
                }}
                placeholder={`Max $${balance.toFixed(2)}`}
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-xs tabular-nums"
                aria-describedby="withdraw-max-hint"
              />
              <p id="withdraw-max-hint" className="mt-1 text-[10px] text-muted-foreground">
                {`Available: $${balance.toFixed(2)} · Min $${MIN_PAYOUT}`}
              </p>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Payout To (Linked Account)</label>
              {linkedMethods.length === 0 ? (
                <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  No payout accounts linked yet. Use the “Link Withdrawal Account” panel below to add one.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {linkedMethods.map((m) => (
                    <button
                      type="button" key={m.id}
                      onClick={() => setMethod(m.method_type)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition text-left ${
                        method === m.method_type
                          ? 'gradient-primary text-primary-foreground border-primary glow-primary'
                          : 'glass border-border/40 text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <div className="capitalize">{m.method_type}</div>
                      <div className="text-[9px] font-mono opacity-80 truncate">{m.account_identifier}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setWithdrawOpen(false)} className="px-4 py-2 rounded-lg glass border border-border/40 text-xs text-muted-foreground">Cancel</button>
              <button
                onClick={submitWithdraw}
                disabled={withdrawing}
                className="px-5 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold glow-primary disabled:opacity-60"
              >
                {withdrawing ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Wallet balance', value: `$${balance.toFixed(4)}`, icon: DollarSign },
          { label: 'Total earned', value: `$${totalEarned.toFixed(4)}`, icon: TrendingUp },
          { label: 'Total withdrawn', value: `$${totalWithdrawn.toFixed(2)}`, icon: Banknote },
          { label: 'Live CPM (network)', value: `$${(liveRates?.cpm ?? fillStats.avgCpm).toFixed(2)}`, icon: TrendingUp },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="glass-strong rounded-xl p-4 glow-border-primary"
          >
            <s.icon className="w-4 h-4 text-primary mb-2" />
            <p className="text-lg font-bold text-foreground tabular-nums">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Per-video analytics + transaction history */}
      {/* Earnings analytics — dual chart (real: revenue_logs + creator_earnings + analytics_events) */}
      <EarningsAnalytics logs={earningsSeries as any} />

      {/* Per-video analytics + transaction history */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Per-video earnings */}
        <div className="glass-strong rounded-xl p-4 glow-border-primary">
          <h3 className="text-sm font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Per-Video Earnings
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">
            Automatic 55% creator share on every completed ad view based on live network CPM. 45% retained by ProNax platform.
          </p>
          {perVideo.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No ad views logged yet. Watch a video and let the ad finish to earn $0.001 per view.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {perVideo.map((v) => (
                <Link
                  key={v.video_id}
                  to={`/watch/${v.video_id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-primary/10 border border-border/30 hover:border-primary/40 transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-foreground font-semibold truncate">Video #{v.video_id}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {v.views.toLocaleString()} impressions · CPM ${v.avgCpm.toFixed(2)}
                      {v.networks.length > 0 && <> · {v.networks.join(', ')}</>}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-bold text-primary tabular-nums">${v.earned.toFixed(4)}</span>
                    <span className="block text-[9px] text-muted-foreground tabular-nums">
                      gross ${v.gross.toFixed(4)} · 55% share
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Transaction history */}
        <div className="glass-strong rounded-xl p-4 glow-border-primary">
          <h3 className="text-sm font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Revenue History
          </h3>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No transactions yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {logs.slice(0, 50).map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground">Video #{l.video_id}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(l.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-green-400 tabular-nums">+${Number(l.amount_earned).toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Withdrawal Accounts Setup */}
      <WithdrawalMethods userId={user!.id} onChange={setLinkedMethods} />

      {/* Withdrawal History */}
      <div className="glass-strong rounded-xl p-4 glow-border-primary">
        <h3 className="text-sm font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <History className="w-4 h-4 text-primary" /> Withdrawal History
        </h3>
        {withdrawals.length === 0 ? (
          <div className="py-8 text-center">
            <Banknote className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No withdrawal requests yet.</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Reach $10 balance to request your first payout.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {withdrawals.map((w) => {
              const status = (w.status ?? 'pending').toLowerCase();
              const tone =
                status === 'processed' || status === 'approved' ? 'text-emerald-300 border-emerald-500/30'
                : status === 'rejected' ? 'text-destructive border-destructive/30'
                : 'text-amber-300 border-amber-500/30';
              return (
                <div key={w.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/20 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground font-semibold">
                      ${Number(w.amount ?? 0).toFixed(2)} <span className="text-muted-foreground font-normal">via {(w.method ?? '—').toUpperCase()}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(w.created_at).toLocaleString()}
                      {w.country ? <> · {w.country}</> : null}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide border ${tone}`}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Verified wallet ledger — every credit/debit is permanently recorded */}
      <div className="glass-strong rounded-xl p-4 glow-border-primary">
        <h3 className="text-sm font-display font-semibold text-foreground mb-1 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Verified Wallet Ledger
        </h3>
        <p className="text-[10px] text-muted-foreground mb-3">
          Tamper-evident transaction log — every balance change has a permanent entry with the running balance after the change.
        </p>
        {ledger.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No transactions on your ledger yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-auto">
            {ledger.map(t => {
              const delta = Number(t.delta);
              const pos = delta >= 0;
              const kindColor =
                t.kind === 'ad_revenue' ? 'text-emerald-300 border-emerald-500/30' :
                t.kind === 'admin_credit' ? 'text-primary border-primary/30' :
                t.kind === 'admin_debit' ? 'text-amber-300 border-amber-500/30' :
                t.kind === 'withdrawal' ? 'text-violet-300 border-violet-500/30' :
                'text-muted-foreground border-border/40';
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2 px-2 rounded-md hover:bg-muted/20 border-b border-border/10 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${kindColor}`}>
                      {t.kind.replace('_', ' ')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-foreground truncate">
                        {t.reason || (t.reference_id ? `ref: ${t.reference_id}` : '—')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-bold tabular-nums ${pos ? 'text-emerald-400' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {pos && delta !== 0 ? '+' : ''}{delta.toFixed(4)}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">bal ${Number(t.balance_after).toFixed(4)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cashout (Demo) Modal */}
      {cashoutOpen && (
        <div
          className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-end lg:items-center justify-center p-4"
          onClick={() => setCashoutOpen(false)}
        >
          <motion.div
            initial={{ y: 40, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass-strong rounded-2xl border border-primary/40 p-5 shadow-[0_20px_60px_hsla(var(--primary)/0.35)]"
            style={{ background: 'linear-gradient(135deg, hsla(var(--primary)/0.08), hsla(var(--secondary)/0.06))' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-lg gradient-primary glow-primary flex items-center justify-center">
                <Banknote className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-glow">Withdraw Funds</h3>
                <p className="text-[10px] text-muted-foreground">Demo cashout — instant simulated payout</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Amount (USD)</label>
                <input
                  type="number" min={1} step="0.01" max={Number(wallet?.balance ?? 0)}
                  value={cashoutAmt}
                  onChange={(e) => setCashoutAmt(e.target.value)}
                  placeholder={`Max $${Number(wallet?.balance ?? 0).toFixed(2)}`}
                  className="w-full bg-muted/30 border border-primary/30 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-primary shadow-[inset_0_0_10px_hsla(var(--primary)/0.15)]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Bank name</label>
                <input
                  type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. HBL, Meezan, Chase"
                  className="w-full bg-muted/30 border border-primary/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Account holder</label>
                <input
                  type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Full name on the account"
                  className="w-full bg-muted/30 border border-primary/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Account number</label>
                <input
                  type="text" inputMode="numeric" value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="XXXXXXXXXXXX"
                  className="w-full bg-muted/30 border border-primary/30 rounded-lg px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setCashoutOpen(false)}
                className="px-4 py-2 rounded-lg glass border border-border/40 text-xs text-muted-foreground hover:text-foreground"
              >Cancel</button>
              <button
                onClick={submitCashout}
                disabled={cashoutProcessing}
                className="px-5 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold glow-primary disabled:opacity-60 hover:scale-[1.02] transition"
              >
                {cashoutProcessing ? 'Processing…' : 'Cash Out Now'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
