/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { Ban } from 'lucide-react';
import { useIpGuard } from '@/hooks/useIpGuard';

/**
 * Renders a full-screen block screen for IP addresses an admin has denied
 * in Admin → Rate Limits & IP Rules. Everything else passes straight through.
 */
export function IpBlockGate({ children }: { children: React.ReactNode }) {
  const { blocked, ip, reason } = useIpGuard();

  if (!blocked) return <>{children}</>;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md w-full rounded-2xl border border-destructive/40 bg-card p-8 text-center space-y-3">
        <Ban className="w-10 h-10 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">Access blocked</h1>
        <p className="text-sm text-muted-foreground">
          {reason
            ? `Your network has been blocked by an administrator: ${reason}`
            : 'Your network has been blocked by an administrator due to suspicious or abusive activity.'}
        </p>
        {ip && <p className="text-xs font-mono text-muted-foreground">IP: {ip}</p>}
        <p className="text-xs text-muted-foreground">
          If you believe this is a mistake, contact support with the IP shown above.
        </p>
      </div>
    </div>
  );
}
