/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import * as Icons from 'lucide-react';
import {
  Home, Compass, PlaySquare, Wallet, Upload, TrendingUp,
  Settings, User, Shield, Radio, SlidersHorizontal,
  Users, History as HistoryIcon, Bookmark, Heart, ListVideo, MessageCircle,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSidebarMenu } from '@/hooks/useSidebarMenu';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useAdminRole } from '@/hooks/useAdminRole';

type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const mainItems: NavItem[] = [
  { title: 'Home', url: '/', icon: Home },
  { title: 'Explore', url: '/explore', icon: Compass },
  { title: 'Shorts', url: '/shorts', icon: PlaySquare },
  { title: 'Trending', url: '/trending', icon: TrendingUp },
  { title: 'Subscriptions', url: '/subscriptions', icon: Users },
  { title: 'Inbox', url: '/inbox', icon: MessageCircle },
];

const libraryItems: NavItem[] = [
  { title: 'History', url: '/history', icon: HistoryIcon },
  { title: 'Playlists', url: '/playlists', icon: ListVideo },
  { title: 'Liked', url: '/likes', icon: Heart },
  { title: 'Watch Later', url: '/saved', icon: Bookmark },
];

const creatorItems: NavItem[] = [
  { title: 'Upload', url: '/upload', icon: Upload },
  { title: 'Go Live', url: '/live', icon: Radio },
  { title: 'Wallet', url: '/wallet', icon: Wallet },
  { title: 'Studio', url: '/studio', icon: SlidersHorizontal },
];

const accountItems: NavItem[] = [
  { title: 'Profile', url: '/profile', icon: User },
  { title: 'Settings', url: '/settings', icon: Settings },
  { title: 'Security', url: '/security', icon: Shield },
];

function resolveIcon(name: string | null | undefined): React.ComponentType<{ className?: string }> {
  if (!name) return Compass;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return (found ?? Compass) as React.ComponentType<{ className?: string }>;
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  if (!items.length) return null;

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] font-display tracking-widest uppercase text-muted-foreground/60 px-3 mb-1">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={`${label}-${item.url}-${item.title}`}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  end={item.url === '/'}
                  className="group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-sidebar-foreground/75 hover:text-white transition-all duration-300 hover:translate-x-1 hover:bg-gradient-to-r hover:from-primary/15 hover:via-secondary/10 hover:to-transparent hover:shadow-[0_0_20px_-4px_hsl(var(--glow-primary)/0.5)]"
                  activeClassName="text-primary bg-gradient-to-r from-primary/20 via-secondary/10 to-transparent border border-primary/30 shadow-[inset_0_1px_0_hsla(190,100%,90%,0.15),0_0_24px_-6px_hsl(var(--glow-primary)/0.6)]"
                >
                  <item.icon className="w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_6px_hsl(var(--glow-primary))]" />
                  {!collapsed && <span className="tracking-wide">{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

const adminItems: NavItem[] = [
  { title: 'Admin Console', url: '/admin', icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { isEnabled, system } = useAppConfig();
  const { items: dbItems } = useSidebarMenu('sidebar');
  const { isStaff } = useAdminRole();


  // Feature-flag filter
  const filtered = (items: NavItem[], flagMap: Record<string, string>) =>
    items.filter((i) => (flagMap[i.url] ? isEnabled(flagMap[i.url]) : true));

  const main = filtered(mainItems, { '/shorts': 'shorts' });
  const creator = filtered(creatorItems, { '/upload': 'uploads', '/live': 'live', '/wallet': 'wallet' });

  const dbMapped: NavItem[] = dbItems.map((i) => ({
    title: i.label,
    url: i.path,
    icon: resolveIcon(i.icon),
  }));

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20 backdrop-blur-2xl bg-gradient-to-b from-[hsl(210_50%_6%/0.85)] via-[hsl(200_55%_8%/0.75)] to-[hsl(158_40%_6%/0.8)]">
      <SidebarContent className="pt-4">
        <div className="px-4 mb-6">
          {collapsed ? (
            <span className="text-lg font-display font-bold text-primary text-glow">P</span>
          ) : (
            <span className="text-lg font-display font-bold text-primary text-glow tracking-wider">
              PRO NAX
            </span>
          )}
        </div>

        {system.maintenance_mode && !collapsed && (
          <div className="mx-3 mb-3 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
            {system.maintenance_message || 'Maintenance mode active.'}
          </div>
        )}

        <NavGroup label="Browse" items={main} />
        <NavGroup label="Library" items={libraryItems} />
        <NavGroup label="Creator" items={creator} />
        <NavGroup label="Account" items={accountItems} />
        {isStaff && <NavGroup label="Admin" items={adminItems} />}
        {dbMapped.length > 0 && <NavGroup label="More" items={dbMapped} />}

      </SidebarContent>
    </Sidebar>
  );
}
