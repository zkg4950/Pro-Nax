/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { MobileNav } from './MobileNav';
import { IpBlockGate } from './IpBlockGate';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
// scroll restoration disabled for now

const SIDEBAR_KEY = 'pronax:sidebar:open';

export function MainLayout() {
  const location = useLocation();
  const isShortsPage = location.pathname.includes('/shorts');
  const isWatchPage = location.pathname.startsWith('/watch/');
  // Admin console renders its own full-screen shell — no user app header/sidebar/bottom nav.
  const isStandalonePage = /^\/admin(\/|$)/.test(location.pathname);

  // Collapse state persists across sessions (read after mount to avoid SSR mismatch).
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored !== null) setSidebarOpen(stored === 'true');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const handleSidebarChange = (open: boolean) => {
    setSidebarOpen(open);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(open));
    } catch {
      /* storage unavailable */
    }
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);


  if (isStandalonePage) {
    return (
      <IpBlockGate>
        <div className="min-h-screen w-full bg-background text-foreground">
          <Outlet />
        </div>
      </IpBlockGate>
    );
  }

  return (
    <IpBlockGate>
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarChange}>
      <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">

        {/* Top Header */}
        {!isShortsPage && (
          <div className="w-full flex-shrink-0 z-30">
            <AppHeader onSidebarToggle={() => handleSidebarChange(!sidebarOpen)} />
          </div>
        )}

        {/* Desktop Header Only for Shorts Page */}
        {isShortsPage && (
          <div className="hidden md:block w-full flex-shrink-0 z-30">
            <AppHeader onSidebarToggle={() => handleSidebarChange(!sidebarOpen)} />
          </div>
        )}

        {/* Flex Wrapper for Sidebar & Content */}
        <div className={`flex flex-1 w-full overflow-hidden relative ${isShortsPage ? 'h-[100dvh] md:h-[calc(100vh-64px)]' : 'h-[calc(100vh-104px)] md:h-[calc(100vh-64px)]'}`}>

          {/* App Sidebar Container (Desktop) */}
          <div className="flex-shrink-0 relative z-20">
            <AppSidebar />
          </div>

          {/* Main Content Area */}
          <SidebarInset
            ref={scrollRef}
            className={`flex-1 min-w-0 h-full overflow-y-auto bg-background !m-0 !rounded-none ${
              isShortsPage ? '!p-0' : isWatchPage ? 'px-0 pt-0 pb-20 md:p-6 md:pb-6' : 'px-0 py-2 pb-20 md:p-6 md:pb-6'
            }`}
          >
            <div className={`w-full h-full ${isShortsPage ? 'max-w-none' : 'max-w-[1600px] mx-auto'}`}>
              <Outlet />
            </div>
          </SidebarInset>

        </div>

        {/* Mobile Bottom Navigation Bar */}
        <MobileNav />
      </div>
    </SidebarProvider>
    </IpBlockGate>
  );
}
