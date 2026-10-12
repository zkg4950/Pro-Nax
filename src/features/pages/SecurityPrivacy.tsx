/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Download,
  Loader2,
  LogOut,
  Mail,
  MailCheck,
  Monitor,
  ShieldCheck,
  Trash2,
  Undo2,
  Cookie,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/loose";
import { useAuthSession } from "@/hooks/useAuthSession";
import { recordAudit, AuditActions } from "@/lib/audit";
import { checkPasswordStrength, emailSchema, firstIssue } from "@/lib/validation";
import { PasswordStrengthMeter } from "@/components/security/PasswordStrengthMeter";
import { clearConsent, getConsent } from "@/lib/consent";
import { IDLE_LIMIT_MS } from "@/hooks/useSessionTimeout";
import { createLogger } from "@/lib/logger";

const log = createLogger("security-page");

type DeletionRequest = {
  id: string;
  status: string;
  reason: string | null;
  scheduled_purge_at: string | null;
  created_at: string;
};

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ShieldCheck;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-strong rounded-2xl border border-border/40 p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

export default function SecurityPrivacy() {
  const { signOut } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("email");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<DeletionRequest | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const consent = getConsent();

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      setLoading(false);
      return;
    }
    setEmail(user.email ?? "");
    setEmailVerified(Boolean(user.email_confirmed_at));
    setLastSignIn(user.last_sign_in_at ?? null);
    setProvider((user.app_metadata?.provider as string) ?? "email");
    const { data: reqs, error } = await supabase
      .from("account_deletion_requests")
      .select("id,status,reason,scheduled_purge_at,created_at")
      .eq("user_id", user.id)
      .in("status", ["pending", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) log.warn("deletion request load failed", error.message);
    setDeletion((reqs?.[0] as DeletionRequest | undefined) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resendVerification = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return toast.error(firstIssue(parsed.error));
    setBusy("verify");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    await recordAudit({ action: AuditActions.verificationResent, entityType: "user" });
    toast.success("Verification email sent");
  };

  const changePassword = async () => {
    const strength = checkPasswordStrength(password);
    if (!strength.ok) return toast.error(strength.failures[0] ?? "Password too weak");
    if (password !== confirmPassword) return toast.error("Passwords do not match");
    setBusy("password");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (error) return toast.error(error.message);
    setPassword("");
    setConfirmPassword("");
    await recordAudit({
      action: AuditActions.passwordChanged,
      severity: "warning",
      entityType: "user",
    });
    toast.success("Password updated");
  };

  const signOutEverywhere = async () => {
    setBusy("global");
    await recordAudit({
      action: AuditActions.sessionsRevokedAll,
      severity: "warning",
      entityType: "user",
    });
    const result = await signOut();
    setBusy(null);
    if (!result.success) {
      return toast.error(result.error || "Failed to sign out");
    }
    toast.success("Signed out of all devices");
  };

  const exportData = async () => {
    setBusy("export");
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pronax-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await recordAudit({ action: AuditActions.dataExported, entityType: "user" });
      toast.success("Your data export has been downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const requestDeletion = async () => {
    if (
      !window.confirm(
        "Request account deletion? Your account is scheduled for permanent deletion after a 30-day grace period.",
      )
    )
      return;
    setBusy("delete");
    try {
      const { error } = await supabase.rpc("request_account_deletion", {
        p_reason: deleteReason.trim().slice(0, 500) || undefined,
      });
      if (error) throw error;
      await recordAudit({
        action: AuditActions.deletionRequested,
        severity: "critical",
        entityType: "user",
      });
      toast.success("Deletion requested. You have 30 days to change your mind.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setBusy(null);
    }
  };

  const cancelDeletion = async () => {
    setBusy("cancel");
    try {
      const { error } = await supabase.rpc("cancel_account_deletion");
      if (error) throw error;
      await recordAudit({ action: AuditActions.deletionCancelled, entityType: "user" });
      toast.success("Deletion request cancelled");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to manage your security and privacy settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen px-4 py-6 pb-28 lg:pb-8 max-w-3xl mx-auto w-full">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-display font-bold text-glow mb-1"
      >
        Security &amp; privacy
      </motion.h1>
      <p className="text-xs text-muted-foreground mb-6">
        Account protection, sessions and your GDPR data rights.
      </p>

      <div className="space-y-4">
        <Card title="Email verification" icon={emailVerified ? MailCheck : Mail}>
          <p className="text-xs text-muted-foreground">
            {email} —{" "}
            {emailVerified ? (
              <span className="text-emerald-400 font-medium">verified</span>
            ) : (
              <span className="text-amber-400 font-medium">not verified</span>
            )}
          </p>
          {!emailVerified && (
            <>
              <p className="text-xs text-muted-foreground mt-2">
                Uploading, withdrawals and commenting stay locked until your email is verified.
              </p>
              <button
                onClick={resendVerification}
                disabled={busy === "verify"}
                className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold gradient-primary text-primary-foreground disabled:opacity-50"
              >
                {busy === "verify" ? "Sending…" : "Resend verification email"}
              </button>
            </>
          )}
        </Card>

        <Card title="Sessions" icon={Monitor}>
          <dl className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between gap-3">
              <dt>Sign-in method</dt>
              <dd className="text-foreground capitalize">{provider}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Last sign-in</dt>
              <dd className="text-foreground">
                {lastSignIn ? new Date(lastSignIn).toLocaleString() : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Automatic sign-out</dt>
              <dd className="text-foreground">
                after {Math.round(IDLE_LIMIT_MS / 60000)} min idle
              </dd>
            </div>
          </dl>
          <button
            onClick={signOutEverywhere}
            disabled={busy === "global"}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold glass border border-border/50 disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />{" "}
            {busy === "global" ? "Revoking…" : "Sign out of all devices"}
          </button>
        </Card>

        {provider === "email" && (
          <Card title="Password" icon={ShieldCheck}>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/60"
              />
              <PasswordStrengthMeter password={password} />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/60"
              />
              <button
                onClick={changePassword}
                disabled={busy === "password"}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold gradient-primary text-primary-foreground disabled:opacity-50"
              >
                {busy === "password" ? "Updating…" : "Update password"}
              </button>
            </div>
          </Card>
        )}

        <Card title="Cookie preferences" icon={Cookie}>
          <p className="text-xs text-muted-foreground">
            Analytics:{" "}
            <span className="text-foreground">{consent?.analytics ? "allowed" : "declined"}</span> ·
            Advertising:{" "}
            <span className="text-foreground">{consent?.advertising ? "allowed" : "declined"}</span>
          </p>
          <button
            onClick={() => {
              clearConsent();
              toast.info("Choose your cookie preferences again below");
            }}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold glass border border-border/50"
          >
            Change cookie choices
          </button>
        </Card>

        <Card title="Export your data" icon={Download}>
          <p className="text-xs text-muted-foreground">
            Download a machine-readable copy of your profile, videos, comments, wallet history and
            consent records.
          </p>
          <button
            onClick={exportData}
            disabled={busy === "export"}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold gradient-primary text-primary-foreground disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />{" "}
            {busy === "export" ? "Preparing…" : "Download my data (JSON)"}
          </button>
        </Card>

        <Card title="Delete your account" icon={AlertTriangle}>
          {deletion ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-400">
                Deletion requested on {new Date(deletion.created_at).toLocaleDateString()}.
                Scheduled purge:{" "}
                {deletion.scheduled_purge_at
                  ? new Date(deletion.scheduled_purge_at).toLocaleDateString()
                  : "pending review"}
                .
              </p>
              <button
                onClick={cancelDeletion}
                disabled={busy === "cancel"}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold glass border border-border/50 disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" />{" "}
                {busy === "cancel" ? "Cancelling…" : "Cancel deletion request"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Your account and content are permanently removed after a 30-day grace period.
                Earnings already withdrawn are not reversible.
              </p>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Optional: tell us why you're leaving"
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary/60"
              />
              <button
                onClick={requestDeletion}
                disabled={busy === "delete"}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />{" "}
                {busy === "delete" ? "Submitting…" : "Request account deletion"}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
