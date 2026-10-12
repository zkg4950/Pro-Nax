/**
 * Runtime guard for ProNax application.
 *
 * This is a simplified version that allows the app to run on any domain.
 * License restrictions have been removed for open-source deployment.
 */

export type LicenseGuardResult =
  | { ok: true }
  | { ok: false; reason: string; host: string };

const ALWAYS_ALLOWED = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
];

function configuredDomains(): string[] {
  const raw = (import.meta.env['VITE_LICENSE_DOMAINS'] as string | undefined) ?? '';
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(host: string, allowed: string[]): boolean {
  if (ALWAYS_ALLOWED.includes(host)) return true;
  if (!allowed.length) return true; // no allow-list configured → unrestricted
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

export function verifyLicenseRuntime(): LicenseGuardResult {
  if (typeof window === 'undefined') return { ok: true };
  if (import.meta.env.DEV) return { ok: true };

  const host = window.location.hostname.toLowerCase();
  if (!hostAllowed(host, configuredDomains())) return { ok: false, reason: 'domain', host };

  return { ok: true };
}

/**
 * Renders a hard block screen when the runtime check fails.
 * Call once on client boot.
 */
export function enforceLicenseRuntime(): boolean {
  const result = verifyLicenseRuntime();
  if (result.ok) return true;

  const message = `This ProNax build is not configured for "${result.host}".`;

  document.documentElement.innerHTML = `
    <body style="margin:0;background:#07080c;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
      <div style="max-width:460px">
        <h1 style="font-size:20px;margin:0 0 12px">Domain configuration required</h1>
        <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 16px">${message}</p>
        <p style="font-size:12px;color:#64748b;margin:0">ProNax © 2026. Open Source Project.</p>
      </div>
    </body>`;
  return false;
}
