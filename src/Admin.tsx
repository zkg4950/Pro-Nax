/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { motion } from 'framer-motion';
import { Shield, ShieldCheck, Loader2, Home, ShieldAlert, LayoutDashboard, Activity, Eye, Video, ShieldAlert as ShieldAlertIcon, Flag, Gavel, ShieldCheck as ShieldCheckIcon, Wallet, Megaphone, Cpu, Users, Tag as TagIcon, Settings as SettingsIcon, Sliders, KeyRound, ScrollText, Gauge, AlertTriangle, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { EngineBoundary } from '@/components/EngineBoundary';
import { AdminShell, type AdminNavItem } from '@/components/admin/AdminShell';
import { moderationQueue } from '@/lib/moderationQueue';
import { toast } from 'sonner';
import { useUnifiedAuth } from '@/lib/unified-auth';
import { 
  validateSession, 
  checkUserRoles, 
  checkBootstrapStatus, 
  claimInitialAdminRole,
  setupSessionTimeout,
  type AuthError 
} from '@/lib/admin-auth';

// Lazy load tab components
const CommandCenterTab = lazy(() => import('@/components/admin/CommandCenter').then(m => ({ default: m.CommandCenterTab })));
const ModerationSettingsTab = lazy(() => import('@/components/admin/ModerationSettingsTab').then(m => ({ default: m.ModerationSettingsTab })));
const AppControlTab = lazy(() => import('@/components/admin/tabs/AppControlTab').then(m => ({ default: m.AppControlTab })));
const CategoriesTab = lazy(() => import('@/components/admin/tabs/CategoriesTab').then(m => ({ default: m.CategoriesTab })));
const AlgorithmTab = lazy(() => import('@/components/admin/tabs/AlgorithmTab').then(m => ({ default: m.AlgorithmTab })));
const RealtimeTab = lazy(() => import('@/components/admin/tabs/RealtimeTab').then(m => ({ default: m.RealtimeTab })));
const LivePreviewTab = lazy(() => import('@/components/admin/tabs/LivePreviewTab').then(m => ({ default: m.LivePreviewTab })));
const AdSettingsTab = lazy(() => import('@/components/admin/tabs/AdSettingsTab').then(m => ({ default: m.AdSettingsTab })));
const AdManagementTab = lazy(() => import('@/components/admin/tabs/AdManagementTab').then(m => ({ default: m.AdManagementTab })));
const CopyrightCenterTab = lazy(() => import('@/components/admin/tabs/CopyrightCenterTab').then(m => ({ default: m.CopyrightCenterTab })));
const UserManagementTab = lazy(() => import('@/components/admin/tabs/UserManagementTab').then(m => ({ default: m.UserManagementTab })));
const AuditLogsTab = lazy(() => import('@/components/admin/tabs/AuditLogsTab').then(m => ({ default: m.AuditLogsTab })));
const RateLimitTab = lazy(() => import('@/components/admin/tabs/RateLimitTab').then(m => ({ default: m.RateLimitTab })));
const AdminAccessTab = lazy(() => import('@/components/admin/tabs/AdminAccessTab').then(m => ({ default: m.AdminAccessTab })));
const StrikesTab = lazy(() => import('@/components/admin/tabs/StrikesTab').then(m => ({ default: m.StrikesTab })));
const ReportsTab = lazy(() => import('@/components/admin/tabs/ReportsTab').then(m => ({ default: m.ReportsTab })));
const AppealsTab = lazy(() => import('@/components/admin/tabs/AppealsTab').then(m => ({ default: m.AppealsTab })));
const WalletsTab = lazy(() => import('@/components/admin/tabs/WalletsTab').then(m => ({ default: m.WalletsTab })));
const WithdrawalsTab = lazy(() => import('@/components/admin/tabs/WithdrawalsTab').then(m => ({ default: m.WithdrawalsTab })));
const ModerationQueueTab = lazy(() => import('@/components/admin/tabs/ModerationQueueTab').then(m => ({ default: m.ModerationQueueTab })));
const AuditTab = lazy(() => import('@/components/admin/tabs/AuditTab').then(m => ({ default: m.AuditTab })));
const MonitorTab = lazy(() => import('@/components/admin/tabs/MonitorTab').then(m => ({ default: m.MonitorTab })));
const VideosTab = lazy(() => import('@/components/admin/tabs/VideosTab').then(m => ({ default: m.VideosTab })));

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

type Tab = 'preview' | 'command' | 'app' | 'categories' | 'algorithm' | 'realtime' | 'users' | 'videos' | 'copyright' | 'reports' | 'moderation' | 'appeals' | 'settings' | 'wallets' | 'withdrawals' | 'audit' | 'auditlogs' | 'ratelimits' | 'monitor' | 'ads' | 'admanager' | 'access' | 'strikes';
type AdminState = 'checking' | 'bootstrap' | 'denied' | 'authed' | 'error';


export default function Admin() {
  const navigate = useNavigate();
  const { signOut: unifiedSignOut } = useUnifiedAuth();
  const [state, setState] = useState<AdminState>('checking');
  const [tab, setTab] = useState<Tab>('command');
  const [claimingAdmin, setClaimingAdmin] = useState(false);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [sessionTimeoutWarning, setSessionTimeoutWarning] = useState(false);
  const cleanupSessionTimeoutRef = useRef<(() => void) | null>(null);
  
  const [userRoles, setUserRoles] = useState<{ isAdmin: boolean; isModerator: boolean; isSupport: boolean }>({
    isAdmin: false,
    isModerator: false,
    isSupport: false,
  });

  // Authorization is decided by the database only. There is deliberately no
  // client-side escape hatch (localStorage flag, env override, dev bypass):
  // any such flag would be a full privilege escalation for every visitor.
  const checkAdmin = useCallback(async (isRetry = false) => {
    let cancelled = false;
    
    try {
      // Reset error state on new check
      if (!isRetry) {
        setAuthError(null);
        setRetryCount(0);
      }

      // Validate session first
      const sessionResult = await validateSession();
      if (!sessionResult.valid || cancelled) {
        if (!cancelled) {
          setAuthError(sessionResult.error);
          setState('denied');
        }
        return;
      }

      const user = sessionResult.user;
      
      // Check all roles via authoritative server-side RPCs with retry logic
      const rolesResult = await checkUserRoles(user.id);
      
      if (cancelled) return;

      if (rolesResult.error) {
        setAuthError(rolesResult.error);
        
        // Auto-retry for retryable errors
        if (rolesResult.error.retryable && retryCount < 3) {
          setRetryCount(prev => prev + 1);
          toast.info(`Connection issue. Retrying... (${retryCount + 1}/3)`);
          setTimeout(() => checkAdmin(true), 1000 * Math.pow(2, retryCount));
          return;
        }
        
        setState('error');
        return;
      }

      setUserRoles(rolesResult.roles);

      // Grant access if user has admin or moderator role
      if (rolesResult.roles.isAdmin || rolesResult.roles.isModerator) {
        setState('authed');
        return;
      }

      // Bootstrap: only offered when the platform genuinely has no admin yet.
      const bootstrapResult = await checkBootstrapStatus();
      
      if (cancelled) return;

      if (bootstrapResult.error) {
        // Bootstrap check failed, but this is non-critical
        console.warn('[Admin] Bootstrap check failed:', bootstrapResult.error);
      }

      if (bootstrapResult.isAdmin) {
        setState('authed');
        return;
      }

      if (bootstrapResult.canClaim) {
        setState('bootstrap');
        return;
      }

      setState('denied');
    } catch (error) {
      if (!cancelled) {
        const classifiedError = authError || classifyAuthError(error);
        setAuthError(classifiedError);
        
        // Auto-retry for retryable errors
        if (classifiedError.retryable && retryCount < 3) {
          setRetryCount(prev => prev + 1);
          toast.info(`Connection issue. Retrying... (${retryCount + 1}/3)`);
          setTimeout(() => checkAdmin(true), 1000 * Math.pow(2, retryCount));
          return;
        }
        
        setState('error');
      }
    }
    
    return () => { cancelled = true; };
  }, [retryCount, authError]);

  // Function to classify errors when needed
  const classifyAuthError = (error: any): AuthError => {
    if (!error) {
      return {
        type: 'unknown',
        message: 'Unknown authentication error',
        userFriendlyMessage: 'An unexpected error occurred during authentication',
        retryable: true,
      };
    }

    const errorMessage = error.message || String(error);
    
    // Network errors
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return {
        type: 'network',
        message: errorMessage,
        userFriendlyMessage: 'Network connection failed. Please check your internet connection.',
        retryable: true,
      };
    }

    // Session errors
    if (errorMessage.includes('session') || errorMessage.includes('JWT')) {
      return {
        type: 'session',
        message: errorMessage,
        userFriendlyMessage: 'Your session has expired. Please sign in again.',
        retryable: false,
      };
    }

    // Default
    return {
      type: 'unknown',
      message: errorMessage,
      userFriendlyMessage: 'An unexpected error occurred. Please try again.',
      retryable: true,
    };
  };

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  // Setup session timeout monitoring
  useEffect(() => {
    if (state !== 'authed') return;

    const handleSessionTimeout = () => {
      setSessionTimeoutWarning(true);
      toast.warning('Session expiring soon due to inactivity', {
        description: 'Please interact with the page to keep your session active.',
        duration: 10000,
      });
      
      // Force logout after extended inactivity
      setTimeout(() => {
        toast.error('Session expired due to inactivity', {
          description: 'Please sign in again to continue.',
        });
        setState('denied');
      }, 5 * 60 * 1000); // 5 more minutes after warning
    };

    cleanupSessionTimeoutRef.current = setupSessionTimeout(handleSessionTimeout, 30); // 30 minutes

    return () => {
      if (cleanupSessionTimeoutRef.current) {
        cleanupSessionTimeoutRef.current();
      }
    };
  }, [state]);

  // Boot the moderation worker as soon as admin lands, so any queue persisted
  // from a previous session drains in the background.
  useEffect(() => { moderationQueue.init(); }, []);

  const claimInitialAdmin = async () => {
    setClaimingAdmin(true);
    try {
      const result = await claimInitialAdminRole();
      
      if (!result.success) {
        toast.error(result.error?.userFriendlyMessage || 'Could not claim admin role', {
          description: result.error?.message,
        });
        return;
      }
      
      toast.success('Admin role granted successfully', {
        description: 'You now have full access to the admin console.',
      });
      setState('authed');
    } catch (err) {
      const error = classifyAuthError(err);
      toast.error(error.userFriendlyMessage, {
        description: error.message,
      });
    } finally {
      setClaimingAdmin(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    setAuthError(null);
    setState('checking');
    checkAdmin();
  };

  const handleSignOut = async () => {
    try {
      const result = await unifiedSignOut();
      if (result.success) {
        navigate('/auth', { replace: true });
      } else {
        toast.error('Failed to sign out', {
          description: result.error || 'Please try again or clear your browser cookies.',
        });
      }
    } catch (error) {
      toast.error('Failed to sign out', {
        description: 'Please try again or clear your browser cookies.',
      });
    }
  };


  if (state === 'checking') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="glass-strong rounded-2xl px-8 py-6 flex items-center gap-3 border border-primary/30 glow-primary">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm font-medium">
            {retryCount > 0 ? `Retrying authentication... (${retryCount}/3)` : 'Verifying admin credentials…'}
          </span>
        </motion.div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen px-4">
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          className="glass-strong rounded-3xl border border-amber-500/40 p-8 max-w-lg w-full text-center relative overflow-hidden shadow-2xl"
          style={{ boxShadow: '0 0 60px -10px hsl(45, 100%, 50% / 0.4), inset 0 0 30px hsl(45, 100%, 50% / 0.05)' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-primary/10 pointer-events-none" />
          <motion.div animate={{ rotate: [0, -8, 8, -4, 4, 0] }} transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 mb-4 relative">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </motion.div>
          <h1 className="text-4xl font-display font-bold text-glow mb-1 tracking-tight">Authentication Error</h1>
          <h2 className="text-lg font-semibold mb-2 text-foreground">PRO NAX Enterprise Console</h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-sm mx-auto">
            {authError?.userFriendlyMessage || 'An error occurred during authentication. Please try again.'}
          </p>

          {authError && (
            <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-mono text-amber-400 uppercase">Error Details</span>
              </div>
              <p className="text-[11px] text-amber-300 font-mono break-all">{authError.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded font-mono ${
                  authError.type === 'network' ? 'bg-blue-500/20 text-blue-300' :
                  authError.type === 'session' ? 'bg-purple-500/20 text-purple-300' :
                  authError.type === 'permission' ? 'bg-red-500/20 text-red-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {authError.type.toUpperCase()}
                </span>
                {authError.retryable && (
                  <span className="text-[9px] px-2 py-0.5 rounded font-mono bg-green-500/20 text-green-300">
                    RETRYABLE
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5 relative max-w-xs mx-auto">
            {authError?.retryable && (
              <button
                onClick={handleRetry}
                className="glass border border-primary/40 py-2 rounded-xl text-xs font-semibold hover:border-primary/60 transition text-primary flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Authentication
              </button>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => navigate('/', { replace: true })}
                className="flex-1 glass border border-border/40 py-2 rounded-xl text-xs font-semibold hover:border-primary/40 transition text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" /> Back Home
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 glass border border-border/40 py-2 rounded-xl text-xs font-semibold hover:border-destructive/40 transition text-muted-foreground hover:text-destructive flex items-center justify-center gap-1.5"
              >
                Sign Out
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (state === 'denied') {
    const isSessionError = authError?.type === 'session';
    const isPermissionError = authError?.type === 'permission';
    
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen px-4">
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          className="glass-strong rounded-3xl border border-destructive/40 p-8 max-w-lg w-full text-center relative overflow-hidden shadow-2xl"
          style={{ boxShadow: '0 0 60px -10px hsl(var(--destructive) / 0.4), inset 0 0 30px hsl(var(--destructive) / 0.05)' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 via-transparent to-primary/10 pointer-events-none" />
          <motion.div animate={{ rotate: [0, -8, 8, -4, 4, 0] }} transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/15 border border-destructive/40 mb-4 relative">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </motion.div>
          <h1 className="text-4xl font-display font-bold text-glow mb-1 tracking-tight">
            {isSessionError ? 'Session Expired' : 'Access Restricted'}
          </h1>
          <h2 className="text-lg font-semibold mb-2 text-foreground">PRO NAX Enterprise Console</h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-sm mx-auto">
            {isSessionError 
              ? authError?.userFriendlyMessage || 'Your session has expired. Please sign in again to access the admin console.'
              : isPermissionError
              ? authError?.userFriendlyMessage || 'This account does not hold the required role. Access to the enterprise console is granted by an existing administrator only.'
              : authError?.userFriendlyMessage || 'This account does not hold the administrator role. Access to the enterprise console is granted by an existing administrator only.'
            }
          </p>

          {authError && (
            <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-left">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3 h-3 text-destructive" />
                <span className="text-[10px] font-mono text-destructive uppercase">Access Details</span>
              </div>
              <p className="text-[11px] text-destructive-foreground break-all">{authError.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded font-mono ${
                  authError.type === 'session' ? 'bg-purple-500/20 text-purple-300' :
                  authError.type === 'permission' ? 'bg-red-500/20 text-red-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {authError.type.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5 relative max-w-xs mx-auto">
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => navigate('/', { replace: true })}
                className="flex-1 glass border border-border/40 py-2 rounded-xl text-xs font-semibold hover:border-primary/40 transition text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" /> Back Home
              </button>
              <button
                onClick={isSessionError ? handleSignOut : () => navigate('/auth')}
                className="flex-1 glass border border-border/40 py-2 rounded-xl text-xs font-semibold hover:border-primary/40 transition text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
              >
                {isSessionError ? 'Sign Out' : 'Sign In'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (state === 'bootstrap') {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen px-4">
        <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          className="glass-strong rounded-3xl border border-primary/40 p-8 max-w-lg w-full text-center relative overflow-hidden glow-primary">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-primary text-primary-foreground mb-5 shadow-2xl">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h1 className="relative text-2xl font-display font-bold text-glow mb-2">Connect Admin Command Center</h1>
          <p className="relative text-sm text-muted-foreground mb-6">
            No administrator is configured yet. Claim the first admin role with your signed-in account to unlock the real dashboard.
          </p>
          <button
            onClick={claimInitialAdmin}
            disabled={claimingAdmin}
            className="relative gradient-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 glow-primary hover:scale-[1.02] transition disabled:opacity-60"
          >
            {claimingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Activate Admin Access
          </button>
        </motion.div>
      </div>
    );
  }

  const allNavItems: AdminNavItem[] = [
    { id: 'command', label: 'Studio Dashboard', icon: LayoutDashboard, group: 'Studio Content & Analytics' },
    { id: 'videos', label: 'Content (Videos & Shorts)', icon: Video, group: 'Studio Content & Analytics' },
    { id: 'realtime', label: 'Realtime Traffic & Analytics', icon: Activity, group: 'Studio Content & Analytics' },
    { id: 'preview', label: 'Live App Preview', icon: Eye, group: 'Studio Content & Analytics' },

    { id: 'copyright', label: 'Copyright & Content ID', icon: ShieldAlertIcon, group: 'Rights & Moderation' },
    { id: 'reports', label: 'Community Reports', icon: Flag, group: 'Rights & Moderation' },
    { id: 'moderation', label: 'Moderation Queue', icon: Gavel, group: 'Rights & Moderation' },
    { id: 'appeals', label: 'Appeals Center', icon: ShieldCheckIcon, group: 'Rights & Moderation' },
    { id: 'strikes', label: 'Strike Management', icon: AlertTriangle, group: 'Rights & Moderation' },

    { id: 'wallets', label: 'Earn & Creator Wallets', icon: Wallet, group: 'Monetization & AdSense' },
    { id: 'withdrawals', label: 'Payout Requests', icon: Wallet, group: 'Monetization & AdSense' },
    { id: 'ads', label: 'Ad Network & RPM/CPM', icon: Megaphone, group: 'Monetization & AdSense' },
    { id: 'admanager', label: 'Ad Management (16:9)', icon: Megaphone, group: 'Monetization & AdSense' },

    { id: 'algorithm', label: 'Algorithm Tuning Engine', icon: Cpu, group: 'Studio Settings & Control' },
    { id: 'users', label: 'User Directory & Verification', icon: Users, group: 'Studio Settings & Control' },
    { id: 'categories', label: 'Categories & Tags', icon: TagIcon, group: 'Studio Settings & Control' },
    { id: 'app', label: 'App Controls', icon: SettingsIcon, group: 'Studio Settings & Control' },
    { id: 'settings', label: 'Automated Moderation Rules', icon: Sliders, group: 'Studio Settings & Control' },
    { id: 'access', label: 'Admin Access & Team', icon: KeyRound, group: 'System & Security' },
    { id: 'monitor', label: 'System Health Monitor', icon: Activity, group: 'System & Security' },
    { id: 'audit', label: 'Admin Action Log', icon: ScrollText, group: 'System & Security' },
    { id: 'auditlogs', label: 'Application Audit Trail', icon: ScrollText, group: 'System & Security' },
    { id: 'ratelimits', label: 'Rate Limits & IP Rules', icon: Gauge, group: 'System & Security' },
  ];

  // Filter nav items based on role
  // Moderators can action reports/claims/bans but NOT wallets, payouts, roles or app settings
  const navItems = allNavItems.filter(item => {
    if (userRoles.isAdmin) return true; // Admins see everything
    if (userRoles.isModerator) {
      // Moderators can see: reports, moderation, appeals, strikes, users (for banning), videos, copyright, realtime, preview, command
      const moderatorAllowed = ['reports', 'moderation', 'appeals', 'strikes', 'users', 'videos', 'copyright', 'realtime', 'preview', 'command'];
      return moderatorAllowed.includes(item.id);
    }
    if (userRoles.isSupport) {
      // Support role has limited access
      const supportAllowed = ['reports', 'moderation', 'appeals', 'videos', 'copyright', 'realtime', 'preview', 'command'];
      return supportAllowed.includes(item.id);
    }
    return false; // Default deny
  });

  return (
    <AdminShell
      brand="Pro Nax Enterprise"
      tagline="Command Center"
      items={navItems}
      activeId={tab}
      onSelect={(id) => setTab(id as Tab)}
      sessionTimeoutWarning={sessionTimeoutWarning}
      onRefreshSession={() => {
        setSessionTimeoutWarning(false);
        // Reset session timeout by re-triggering activity
        if (cleanupSessionTimeoutRef.current) {
          cleanupSessionTimeoutRef.current();
        }
        const handleSessionTimeout = () => {
          setSessionTimeoutWarning(true);
          toast.warning('Session expiring soon due to inactivity', {
            description: 'Please interact with the page to keep your session active.',
            duration: 10000,
          });
          
          setTimeout(() => {
            toast.error('Session expired due to inactivity', {
              description: 'Please sign in again to continue.',
            });
            setState('denied');
          }, 5 * 60 * 1000);
        };
        cleanupSessionTimeoutRef.current = setupSessionTimeout(handleSessionTimeout, 30);
      }}
    >
      <Suspense fallback={<TabLoader />}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {tab === 'command' && <CommandCenterTab />}
          {tab === 'preview' && <LivePreviewTab />}
          {tab === 'app' && <AppControlTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'algorithm' && <AlgorithmTab />}
          {tab === 'realtime' && <RealtimeTab />}
          {tab === 'users' && <EngineBoundary name="user-management"><UserManagementTab /></EngineBoundary>}
          {tab === 'videos' && <VideosTab />}
          {tab === 'copyright' && <EngineBoundary name="copyright-hub"><CopyrightCenterTab /></EngineBoundary>}
          {tab === 'reports' && <EngineBoundary name="reports"><ReportsTab /></EngineBoundary>}
          {tab === 'moderation' && <EngineBoundary name="moderation-queue"><ModerationQueueTab /></EngineBoundary>}
          {tab === 'appeals' && <EngineBoundary name="appeals"><AppealsTab /></EngineBoundary>}
          {tab === 'strikes' && <StrikesTab />}
          {tab === 'settings' && <EngineBoundary name="moderation-rules"><ModerationSettingsTab /></EngineBoundary>}
          {tab === 'wallets' && <WalletsTab />}
          {tab === 'withdrawals' && <WithdrawalsTab />}
          {tab === 'ads' && <AdSettingsTab />}
          {tab === 'admanager' && <EngineBoundary name="ad-management"><AdManagementTab /></EngineBoundary>}
          {tab === 'audit' && <AuditTab />}
          {tab === 'auditlogs' && <EngineBoundary name="audit-logs"><AuditLogsTab /></EngineBoundary>}
          {tab === 'ratelimits' && <EngineBoundary name="rate-limits"><RateLimitTab /></EngineBoundary>}
          {tab === 'access' && <EngineBoundary name="admin-access"><AdminAccessTab /></EngineBoundary>}
          {tab === 'monitor' && <MonitorTab />}
        </motion.div>
      </Suspense>
    </AdminShell>
  );
}