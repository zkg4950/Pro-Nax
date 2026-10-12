/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useEffect, useRef, type ReactNode, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/loose';
import { useAdminNotifications, type SystemNotification } from '@/lib/admin-notifications';
import { NotificationErrorBoundary } from '@/components/admin/NotificationErrorBoundary';
import {
  Search,
  Bell,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Command,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Sparkles,
  Zap,
  Activity,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sliders,
  Clock,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  type LucideIcon
} from 'lucide-react';

export type AdminNavItem = {
  id: string;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  group?: string;
  badge?: string | number;
};

export interface AdminShellProps {
  brand?: string;
  tagline?: string;
  items: AdminNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  rightSlot?: ReactNode;
  sessionTimeoutWarning?: boolean;
  onRefreshSession?: () => void;
}

export function AdminShell({
  brand = 'ProNax Studio',
  tagline = 'Enterprise Creator Console',
  items,
  activeId,
  onSelect,
  children,
  searchQuery = '',
  onSearchChange,
  rightSlot,
  sessionTimeoutWarning = false,
  onRefreshSession,
}: AdminShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Group items by category
  const groupedItems = items.reduce<Record<string, AdminNavItem[]>>((acc, item) => {
    const group = item.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  // Global hotkey trigger for Cmd+K / Ctrl+K search focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Optimized notification system with debouncing, pagination, and error handling
  const {
    notifications: systemNotifications,
    loading: notificationsLoading,
    error: notificationsError,
    connectionStatus,
    loadMore: loadMoreNotifications,
    clear: clearNotifications,
  } = useAdminNotifications({
    maxNotifications: 10,
    debounceMs: 500,
    enableRealtime: true,
    paginationSize: 6,
  });

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans flex flex-col selection:bg-cyan-500 selection:text-black relative overflow-x-hidden">
      {/* 3D Glowing Ambient Spheres */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed top-1/3 right-10 w-[450px] h-[450px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-10 left-1/3 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none z-0" />

      {/* Enterprise Pro Nax Command Header */}
      <header className={`sticky top-0 z-40 bg-[#0b0e14]/85 backdrop-blur-2xl border-b border-white/10 px-4 lg:px-6 flex items-center justify-between gap-4 shadow-2xl shadow-black/80 transition-all duration-300 ${sessionTimeoutWarning ? 'h-24 pt-8' : 'h-16'}`}>
        {/* Session Timeout Warning Banner */}
        {sessionTimeoutWarning && (
          <div className="absolute top-0 left-0 right-0 bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center justify-center gap-3 z-50">
            <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-xs text-amber-300 font-medium">
              Session expiring soon due to inactivity
            </span>
            <button
              onClick={onRefreshSession}
              className="text-xs px-3 py-1 rounded-lg bg-amber-500/30 text-amber-200 hover:bg-amber-500/40 transition font-medium"
            >
              Keep Session Active
            </button>
          </div>
        )}
        {/* Left Section: Branding & Sidebar Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
            aria-label="Toggle mobile menu"
          >
            {mobileOpen ? <X className="w-5 h-5 text-cyan-400" /> : <Menu className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition group cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            ) : (
              <PanelLeftClose className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
            )}
          </button>

          {/* Brand Logo & Studio Badge */}
          <div className="flex items-center gap-3 pl-1">
            <div className="relative group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1px] shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
                <div className="w-full h-full bg-[#0b0e14] rounded-[11px] flex items-center justify-center">
                  <Play className="w-4 h-4 text-cyan-400 fill-cyan-400 ml-0.5 group-hover:scale-110 transition-transform" />
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#0b0e14] rounded-full" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-tight text-white font-display">
                  {brand}
                </span>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.15)]">
                  STUDIO v3.8
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 truncate hidden sm:block">
                {tagline}
              </p>
            </div>
          </div>
        </div>

        {/* Global Search & Command Palette Input */}
        <div className="flex-1 max-w-lg mx-4 hidden md:block">
          <div className="relative flex items-center group">
            <Search className="w-4 h-4 text-zinc-400 group-focus-within:text-cyan-400 absolute left-3.5 pointer-events-none transition-colors" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search videos, users, claims, or commands..."
              className="w-full bg-[#121722]/80 border border-white/10 focus:border-cyan-500/60 focus:bg-[#161d2b] rounded-xl pl-10 pr-14 py-2 text-xs text-white placeholder:text-zinc-500 outline-none transition shadow-inner font-sans"
            />
            <div className="absolute right-3 flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 pointer-events-none">
              <Command className="w-2.5 h-2.5" /> K
            </div>
          </div>
        </div>

        {/* Right Header Controls & Profile Avatar Dropdown */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Live Cluster Pulse Badge */}
          <div className="hidden xl:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
              Cluster 99.9% Active
            </span>
          </div>

          {rightSlot}

          {/* Quick Create Action */}
          <button
            onClick={() => onSelect('videos')}
            className="h-8 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-extrabold inline-flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span className="hidden sm:inline">CREATE</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileOpen(false);
              }}
              className="relative p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {systemNotifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
              )}
              {notificationsLoading && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 animate-ping" />
              )}
            </button>

            <AnimatePresence>
              {notificationsOpen && (
                <NotificationErrorBoundary>
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-[#0e121b] border border-white/15 rounded-2xl shadow-2xl p-4 z-50 backdrop-blur-2xl space-y-3"
                  >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Studio Notifications
                    </h4>
                    <div className="flex items-center gap-2">
                      {/* Connection Status Indicator */}
                      <div className="flex items-center gap-1" title={`Real-time ${connectionStatus.connected ? 'connected' : 'disconnected'}`}>
                        {connectionStatus.connected ? (
                          <Wifi className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <WifiOff className="w-3 h-3 text-amber-400" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {systemNotifications.length} New
                      </span>
                    </div>
                  </div>

                  {/* Error Display */}
                  {notificationsError && (
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
                      <p className="text-[10px] text-red-400">Failed to load notifications</p>
                      <button
                        onClick={() => window.location.reload()}
                        className="text-[9px] text-red-300 underline mt-1"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Loading State */}
                  {notificationsLoading && systemNotifications.length === 0 && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      <span className="text-[10px] text-zinc-400 ml-2">Loading notifications...</span>
                    </div>
                  )}

                  {/* Notifications List */}
                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {!notificationsLoading && systemNotifications.length === 0 && (
                      <p className="text-[11px] text-zinc-500 text-center py-3">No system events yet.</p>
                    )}
                    {systemNotifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-cyan-500/30 transition space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-white">
                          <span className="flex items-center gap-1.5">
                            {n.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {n.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                            {n.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400" />}
                            {n.title}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">{n.time}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 pl-5">{n.desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  {systemNotifications.length > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <button
                        onClick={clearNotifications}
                        className="text-[10px] text-zinc-400 hover:text-white transition"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => loadMoreNotifications(2)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Load More
                      </button>
                    </div>
                  )}
                </motion.div>
                </NotificationErrorBoundary>
              )}
            </AnimatePresence>
          </div>

          {/* User Profile Avatar Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 pl-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-xs text-black font-mono">
                AD
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-60 bg-[#0e121b] border border-white/15 rounded-2xl shadow-2xl p-3 z-50 backdrop-blur-2xl space-y-2"
                >
                  <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>ProNax SuperAdmin</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                      admin@pronax.studio
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <button
                      onClick={() => {
                        onSelect('app');
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Studio Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        onSelect('algorithm');
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Algorithm Console</span>
                    </button>
                    <button
                      onClick={() => {
                        onSelect('settings');
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5 text-purple-400" />
                      <span>Moderation Rules</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar & Content Workspace */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Animated Collapsible Sidebar */}
        <motion.aside
          animate={{
            width: collapsed ? 80 : 260,
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 280 }}
          className={`fixed md:sticky top-[64px] z-30 h-[calc(100vh-64px)] bg-[#0b0e14]/90 backdrop-blur-2xl border-r border-white/10 flex flex-col shrink-0 transition-transform duration-300 md:translate-x-0 ${
            mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full'
          }`}
        >
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
            {Object.entries(groupedItems).map(([groupName, groupItems]) => (
              <div key={groupName} className="space-y-1">
                {!collapsed && (
                  <div className="px-3 text-[10px] font-mono uppercase tracking-widest text-cyan-400/80 font-bold mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                    <span>{groupName}</span>
                  </div>
                )}

                {collapsed && (
                  <div className="h-px bg-white/10 my-2 mx-2" />
                )}

                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeId === item.id;

                  return (
                    <div key={item.id} className="relative group/tooltip">
                      <button
                        onClick={() => {
                          onSelect(item.id);
                          setMobileOpen(false);
                        }}
                        onMouseEnter={() => setActiveTooltip(item.id)}
                        onMouseLeave={() => setActiveTooltip(null)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition relative group cursor-pointer ${
                          isActive
                            ? 'text-white bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-transparent border border-cyan-500/40 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {/* 3D Glowing Active Tab Indicator */}
                        {isActive && (
                          <motion.div
                            layoutId="activeTabIndicator"
                            className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]"
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}

                        <Icon
                          className={`w-4 h-4 shrink-0 transition-all duration-200 ${
                            isActive
                              ? 'text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                              : 'text-zinc-400 group-hover:text-zinc-100 group-hover:scale-105'
                          }`}
                        />

                        {!collapsed && <span className="truncate">{item.label}</span>}

                        {item.badge && !collapsed && (
                          <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {item.badge}
                          </span>
                        )}
                      </button>

                      {/* Tooltip on Collapsed Sidebar Hover */}
                      {collapsed && activeTooltip === item.id && (
                        <div className="fixed left-20 z-50 px-3 py-1.5 rounded-xl bg-[#101522] border border-cyan-500/40 text-white text-xs font-bold shadow-2xl pointer-events-none flex items-center gap-2 whitespace-nowrap backdrop-blur-xl">
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sidebar Footer Studio Info */}
          {!collapsed && (
            <div className="p-3 border-t border-white/10 bg-[#07090e]/60">
              <div className="flex items-center gap-2.5 p-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-xs text-black">
                  PRO
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">ProNax Engine</div>
                  <div className="text-[10px] text-cyan-400 font-mono truncate">v3.8 • Live</div>
                </div>
              </div>
            </div>
          )}
        </motion.aside>

        {/* Main Workspace Render View */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-[#07090e] custom-scrollbar">
          <motion.div
            key={activeId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-[1600px] mx-auto space-y-6"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
