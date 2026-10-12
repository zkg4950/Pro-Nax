/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
// Suppress browser extension warnings and console noise
(function() {
  if (typeof console === 'undefined') return;
  
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalLog = console.log;
  
  // Create a comprehensive filter function
  const shouldSuppress = (...args: any[]): boolean => {
    const fullMessage = args.map(arg => 
      typeof arg === 'string' ? arg : 
      typeof arg === 'object' ? JSON.stringify(arg) : 
      String(arg)
    ).join(' ');
    
    // Suppress browser extension warnings and noise
    const suppressPatterns = [
      'MaxListenersExceededWarning',
      'ObjectMultiplex',
      'orphaned data',
      'contentscript.js',
      'app-init-liveness',
      'background-liveness',
      'r2.example.com',
      'ERR_NAME_NOT_RESOLVED',
      'Video autoplay error',
      'NotAllowedError',
      'play() failed'
    ];
    
    return suppressPatterns.some(pattern => fullMessage.includes(pattern));
  };
  
  // Override console methods
  console.warn = function(...args: any[]) {
    if (!shouldSuppress(...args)) {
      originalWarn.apply(console, args);
    }
  };
  
  console.error = function(...args: any[]) {
    if (!shouldSuppress(...args)) {
      originalError.apply(console, args);
    }
  };
  
  console.log = function(...args: any[]) {
    if (!shouldSuppress(...args)) {
      originalLog.apply(console, args);
    }
  };
})();

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClientOnly,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
  Outlet,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";

import { useEffect } from "react";
import { enforceLicenseRuntime } from "@/lib/license-guard";

import { reportProNaxError } from "../lib/error-reporting";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppConfigProvider } from "@/hooks/useAppConfig";
import { WalletProvider } from "@/contexts/WalletContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/MainLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CookieConsent } from "@/components/security/CookieConsent";
import { errorMonitor } from "@/lib/errorMonitoring";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportProNaxError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ProNax — Video, Shorts & Live Streaming Platform" },
      {
        name: "description",
        content:
          "ProNax is a creator-first video platform for uploads, shorts, live streams, playlists and channel monetization.",
      },
      { property: "og:title", content: "ProNax — Video, Shorts & Live Streaming Platform" },
      {
        property: "og:description",
        content:
          "Watch, upload and monetize videos, shorts and live streams on ProNax.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/icon-192x192.svg" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { name: "theme-color", content: "#0f0f0f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ProNax" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <>
      <HeadContent />
      {children}
      <Scripts />
    </>
  );
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const isStudioRoute = location.pathname.startsWith('/studio');

  // Global error capture (uncaught errors, rejections, perf timings) and the
  // inactivity sign-out timer.
  // Anti-tamper / domain licence verification for production builds.
  useEffect(() => {
    try {
      enforceLicenseRuntime();
    } catch (e) {
      console.error('[Root] License guard failed:', e);
    }
  }, []);

  useEffect(() => {
    try {
      errorMonitor.install();
    } catch (e) {
      console.error('[Root] Failed to install error monitor:', e);
    }
  }, []);
  
  try {
    useSessionTimeout();
  } catch (e) {
    console.error('[Root] Failed to setup session timeout:', e);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <AppConfigProvider>
            <WalletProvider>
              <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
                <ErrorBoundary>
                  {isStudioRoute ? (
                    // Studio routes render directly without MainLayout
                    <Outlet />
                  ) : (
                    // Main app routes render with MainLayout
                    <MainLayout />
                  )}
                </ErrorBoundary>
                {!isStudioRoute && <CookieConsent />}
              </ClientOnly>
            </WalletProvider>
          </AppConfigProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
