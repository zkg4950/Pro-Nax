/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState } from 'react';
import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LayoutDashboard, Video, Activity, Eye, ShieldAlert, Flag, Gavel, ShieldCheck, Wallet, Megaphone, Cpu, Users, Tag as TagIcon, Settings as SettingsIcon, Sliders, KeyRound, ScrollText, Gauge, AlertTriangle, Database, Bot } from 'lucide-react';
import { AdminShell, type AdminNavItem } from '@/components/admin/AdminShell';
import { EngineBoundary } from '@/components/EngineBoundary';
import { moderationQueue } from '@/lib/moderationQueue';
import { useAdminRole } from '@/hooks/useAdminRole';

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
const DatabaseTablesTab = lazy(() => import('@/components/admin/tabs/DatabaseTablesTab').then(m => ({ default: m.DatabaseTablesTab })));
const AdminChatTab = lazy(() => import('@/components/admin/AdminChat').then(m => ({ default: m.AdminChat })));

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

type Tab = 'preview' | 'command' | 'app' | 'categories' | 'algorithm' | 'realtime' | 'users' | 'videos' | 'copyright' | 'reports' | 'moderation' | 'appeals' | 'settings' | 'wallets' | 'withdrawals' | 'audit' | 'auditlogs' | 'ratelimits' | 'monitor' | 'ads' | 'admanager' | 'access' | 'strikes' | 'database' | 'ai-chat';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('command');
  // Real role state from the authenticated session (server-validated via RPC).
  const { isAdmin, isModerator, loading: rolesLoading } = useAdminRole();

  // Boot the moderation worker as soon as admin lands, so any queue persisted
  // from a previous session drains in the background.
  moderationQueue.init();

  // Define all possible nav items
  const allNavItems: AdminNavItem[] = [
    { id: 'command', label: 'Studio Dashboard', icon: LayoutDashboard, group: 'Studio Content & Analytics' },
    { id: 'videos', label: 'Content (Videos & Shorts)', icon: Video, group: 'Studio Content & Analytics' },
    { id: 'realtime', label: 'Realtime Traffic & Analytics', icon: Activity, group: 'Studio Content & Analytics' },
    { id: 'preview', label: 'Live App Preview', icon: Eye, group: 'Studio Content & Analytics' },

    { id: 'copyright', label: 'Copyright & Content ID', icon: ShieldAlert, group: 'Rights & Moderation' },
    { id: 'reports', label: 'Community Reports', icon: Flag, group: 'Rights & Moderation' },
    { id: 'moderation', label: 'Moderation Queue', icon: Gavel, group: 'Rights & Moderation' },
    { id: 'appeals', label: 'Appeals Center', icon: ShieldCheck, group: 'Rights & Moderation' },

    { id: 'wallets', label: 'Earn & Creator Wallets', icon: Wallet, group: 'Monetization & AdSense' },
    { id: 'withdrawals', label: 'Payout Requests', icon: Wallet, group: 'Monetization & AdSense' },
    { id: 'ads', label: 'Ad Network & RPM/CPM', icon: Megaphone, group: 'Monetization & AdSense' },
    { id: 'admanager', label: 'Ad Management (16:9)', icon: Megaphone, group: 'Monetization & AdSense' },

    { id: 'algorithm', label: 'Algorithm Tuning Engine', icon: Cpu, group: 'Studio Settings & Control' },
    { id: 'users', label: 'User Directory & Verification', icon: Users, group: 'Studio Settings & Control' },
    { id: 'categories', label: 'Categories & Tags', icon: TagIcon, group: 'Studio Settings & Control' },
    { id: 'app', label: 'App Controls', icon: SettingsIcon, group: 'Studio Settings & Control' },
    { id: 'settings', label: 'Automated Moderation Rules', icon: Sliders, group: 'Studio Settings & Control' },
    { id: 'ai-chat', label: 'AI Admin Brain', icon: Bot, group: 'AI & Automation' },
    { id: 'access', label: 'Admin Access & Team', icon: KeyRound, group: 'System & Security' },
    { id: 'monitor', label: 'System Health Monitor', icon: Activity, group: 'System & Security' },
    { id: 'audit', label: 'Admin Action Log', icon: ScrollText, group: 'System & Security' },
    { id: 'auditlogs', label: 'Application Audit Trail', icon: ScrollText, group: 'System & Security' },
    { id: 'ratelimits', label: 'Rate Limits & IP Rules', icon: Gauge, group: 'System & Security' },
    { id: 'database', label: 'Database Tables', icon: Database, group: 'System & Security' },
    { id: 'strikes', label: 'Strike Management', icon: AlertTriangle, group: 'Rights & Moderation' },
  ];

  // Filter nav items based on role
  // Moderators can action reports/claims/bans but NOT wallets, payouts, roles or app settings
  const moderatorAllowed = ['reports', 'moderation', 'appeals', 'strikes', 'users', 'videos', 'copyright', 'realtime', 'preview', 'command'];
  const navItems = allNavItems.filter(item => {
    if (isAdmin) return true; // Admins see everything
    if (isModerator) return moderatorAllowed.includes(item.id);
    return ['command', 'preview'].includes(item.id); // support / fallback
  });

  if (rolesLoading) return <TabLoader />;



  return (
    <AdminShell
      brand="Pro Nax Enterprise"
      tagline="Command Center"
      items={navItems}
      activeId={tab}
      onSelect={(id) => setTab(id as Tab)}
    >
      <Suspense fallback={<TabLoader />}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {tab === 'command' && <CommandCenterTab />}
          {tab === 'preview' && <LivePreviewTab />}
          {tab === 'app' && isAdmin && <AppControlTab />}
          {tab === 'categories' && isAdmin && <CategoriesTab />}
          {tab === 'algorithm' && isAdmin && <AlgorithmTab />}
          {tab === 'realtime' && <RealtimeTab />}
          {tab === 'users' && <EngineBoundary name="user-management"><UserManagementTab /></EngineBoundary>}
          {tab === 'videos' && <VideosTab />}
          {tab === 'copyright' && <EngineBoundary name="copyright-hub"><CopyrightCenterTab /></EngineBoundary>}
          {tab === 'reports' && <EngineBoundary name="reports"><ReportsTab /></EngineBoundary>}
          {tab === 'moderation' && <EngineBoundary name="moderation-queue"><ModerationQueueTab /></EngineBoundary>}
          {tab === 'appeals' && <EngineBoundary name="appeals"><AppealsTab /></EngineBoundary>}
          {tab === 'strikes' && <EngineBoundary name="strike-management"><StrikesTab /></EngineBoundary>}
          {tab === 'settings' && isAdmin && <EngineBoundary name="moderation-rules"><ModerationSettingsTab /></EngineBoundary>}
          {tab === 'wallets' && isAdmin && <WalletsTab />}
          {tab === 'withdrawals' && isAdmin && <WithdrawalsTab />}
          {tab === 'ads' && isAdmin && <AdSettingsTab />}
          {tab === 'admanager' && isAdmin && <EngineBoundary name="ad-management"><AdManagementTab /></EngineBoundary>}
          {tab === 'audit' && isAdmin && <AuditTab />}
          {tab === 'auditlogs' && isAdmin && <EngineBoundary name="audit-logs"><AuditLogsTab /></EngineBoundary>}
          {tab === 'ratelimits' && isAdmin && <EngineBoundary name="rate-limits"><RateLimitTab /></EngineBoundary>}
          {tab === 'access' && isAdmin && <EngineBoundary name="admin-access"><AdminAccessTab /></EngineBoundary>}
          {tab === 'database' && isAdmin && <EngineBoundary name="database-tables"><DatabaseTablesTab /></EngineBoundary>}
          {tab === 'monitor' && isAdmin && <MonitorTab />}
          {tab === 'ai-chat' && isAdmin && <AdminChatTab />}
        </motion.div>
      </Suspense>
    </AdminShell>
  );
}
