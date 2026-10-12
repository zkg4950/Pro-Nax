/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { Mail, Lock, LogIn, UserPlus, Loader2, ShieldAlert, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/loose';
import { useUnifiedAuth } from '@/lib/unified-auth';
import { PasswordStrengthMeter } from '@/components/security/PasswordStrengthMeter';
import { appealSchema, checkPasswordStrength, emailSchema, firstIssue } from '@/lib/validation';
import { recordAudit, AuditActions } from '@/lib/audit';
import { formatMoney, DEFAULT_CURRENCY } from '@/lib/money';

export default function Auth() {
  const navigate = useNavigate();
  const { isAuthed, signInWithEmail, signUpWithEmail, signInWithGoogle, resendVerificationEmail } = useUnifiedAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealEmail, setAppealEmail] = useState('');
  const [appealMessage, setAppealMessage] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  useEffect(() => {
    // If already signed in, redirect to home page
    if (isAuthed) {
      navigate('/', { replace: true });
    }
  }, [isAuthed, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      toast.error(firstIssue(parsedEmail.error));
      return;
    }
    if (mode === 'signup') {
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        toast.error(strength.failures[0] ?? 'Please choose a stronger password');
        return;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    } else if (!password) {
      toast.error('Enter your password');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const result = await signUpWithEmail(parsedEmail.data, password);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        await recordAudit({ action: AuditActions.signUp, entityType: 'user', metadata: { method: 'password' } });
        if (result.needsVerification) {
          setAwaitingVerification(true);
          toast.success('Account created — check your email to confirm before signing in.');
        }
      } else {
        const result = await signInWithEmail(parsedEmail.data, password);
        if (!result.success) {
          await recordAudit({
            action: AuditActions.signInFailed,
            severity: 'warning',
            entityType: 'user',
            metadata: { email: parsedEmail.data, reason: result.error },
          });
          toast.error(result.error);
          return;
        }
        await recordAudit({ action: AuditActions.signIn, entityType: 'user', metadata: { method: 'password' } });
        toast.success('Signed in');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      toast.error(firstIssue(parsedEmail.error));
      return;
    }
    setLoading(true);
    const result = await resendVerificationEmail(parsedEmail.data);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    await recordAudit({ action: AuditActions.verificationResent, entityType: 'user' });
    toast.success('Verification email resent');
  };

  const signInGoogle = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      toast.error(result.error || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAppeal = appealSchema.safeParse({ email: appealEmail, message: appealMessage });
    if (!parsedAppeal.success) {
      toast.error(firstIssue(parsedAppeal.error));
      return;
    }
    setAppealSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in with your account first, then submit appeal');
      const { error } = await supabase.from('appeals').insert({
        user_id: user.id,
        email: parsedAppeal.data.email,
        message: parsedAppeal.data.message,
      });
      if (error) throw error;
      toast.success('Appeal submitted. Admin will review shortly.');
      setShowAppeal(false);
      setAppealMessage('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit appeal');
    } finally {
      setAppealSubmitting(false);
    }
  };

  return (
    <div className="perspective-container flex-1 min-h-screen flex items-center justify-center p-4 pb-24 lg:pb-4">
      <motion.div
        initial={{ opacity: 0, y: 24, rotateX: 10 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="tilt-3d w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 border border-primary/30 glow-border-primary"
      >
        <h1 className="text-2xl font-display font-bold text-glow text-center mb-1">
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="text-xs text-muted-foreground text-center mb-6">
          {mode === 'signin' ? 'Sign in to earn from views' : `Start earning ${formatMoney(0.001, { currency: DEFAULT_CURRENCY, precise: true })} per ad view`}
        </p>

        {awaitingVerification && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-300 flex items-start gap-2">
              <MailCheck className="w-4 h-4 mt-0.5 shrink-0" />
              Confirm your email address to activate the account. Uploads, comments and payouts stay locked
              until it's verified.
            </p>
            <button
              type="button"
              onClick={resendVerification}
              disabled={loading}
              className="mt-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              Resend verification email
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-2 bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-primary/60">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-primary/60">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <input
              type="password"
              required
              minLength={mode === 'signup' ? 12 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Password (min 12 chars)' : 'Password'}
              className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
            />
          </div>
          {mode === 'signup' && (
            <>
              <PasswordStrengthMeter password={password} />
              <div className="flex items-center gap-2 bg-muted/30 border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-primary/60">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                />
              </div>
            </>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-primary-foreground gradient-primary glow-primary disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </motion.button>
        </form>

        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        <button
          onClick={signInGoogle}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-foreground glass border border-border/60 hover:border-primary/40 transition disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Continue with Google
        </button>

        <p className="text-center text-xs text-muted-foreground mt-5">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-primary hover:underline font-semibold"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        <div className="mt-4 pt-4 border-t border-border/30">
          {!showAppeal ? (
            <button
              onClick={() => setShowAppeal(true)}
              className="w-full text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Account blocked? Submit an appeal
            </button>
          ) : (
            <form onSubmit={submitAppeal} className="space-y-2">
              <p className="text-xs text-muted-foreground">Sign in above first, then describe your appeal:</p>
              <input
                type="email"
                required
                value={appealEmail}
                onChange={(e) => setAppealEmail(e.target.value)}
                placeholder="your account email"
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/60"
              />
              <textarea
                required
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value.slice(0, 1000))}
                placeholder="Why should we reinstate your account?"
                rows={3}
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/60 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAppeal(false)}
                  className="flex-1 text-xs px-3 py-2 rounded-lg glass border border-border/40"
                >
                  Cancel
                </button>
                <button
                  disabled={appealSubmitting}
                  className="flex-1 text-xs px-3 py-2 rounded-lg gradient-primary text-primary-foreground font-semibold disabled:opacity-50"
                >
                  {appealSubmitting ? 'Submitting…' : 'Submit appeal'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}