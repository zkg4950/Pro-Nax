/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/loose';

type IpRule = {
  id: string;
  ip_address: string;
  mode: string;
  reason: string | null;
  expires_at: string | null;
};

const IP_CACHE_KEY = 'pronax:client-ip';

/** Resolve the visitor's public IP (cached per tab session). */
async function resolveIp(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(IP_CACHE_KEY);
    if (cached) return cached;
  } catch {
    /* storage unavailable */
  }
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: string };
    const ip = json.ip ?? null;
    if (ip) {
      try {
        sessionStorage.setItem(IP_CACHE_KEY, ip);
      } catch {
        /* ignore */
      }
    }
    return ip;
  } catch {
    return null;
  }
}

/** IPv4 CIDR match; exact match fallback covers IPv6 and single addresses. */
function matches(ip: string, pattern: string): boolean {
  if (ip === pattern) return true;
  if (!pattern.includes('/')) return false;
  const [base, bitsRaw] = pattern.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const toInt = (v: string) => {
    const parts = v.split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
      const x = Number(p);
      if (!Number.isInteger(x) || x < 0 || x > 255) return null;
      n = (n << 8) | x;
    }
    return n >>> 0;
  };
  const a = toInt(ip);
  const b = toInt(base);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

export type IpGuardState = {
  checked: boolean;
  blocked: boolean;
  ip: string | null;
  reason: string | null;
};

const RULES_CACHE_KEY = 'pronax:ip-rules';
const RULES_TTL_MS = 5 * 60_000;

/**
 * Rule list is cached per tab (5 min) and de-duplicated across concurrent
 * mounts, so a large audience costs at most one small read per session.
 */
let rulesPromise: Promise<IpRule[]> | null = null;
async function loadRules(): Promise<IpRule[]> {
  try {
    const raw = sessionStorage.getItem(RULES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; rules: IpRule[] };
      if (Date.now() - parsed.at < RULES_TTL_MS) return parsed.rules;
    }
  } catch {
    /* ignore */
  }
  if (rulesPromise) return rulesPromise;
  rulesPromise = (async () => {
    const { data, error } = await supabase
      .from('ip_rules')
      .select('id,ip_address,mode,reason,expires_at')
      .limit(500);
    const rules = error ? [] : ((data as IpRule[] | null) ?? []);
    try {
      sessionStorage.setItem(RULES_CACHE_KEY, JSON.stringify({ at: Date.now(), rules }));
    } catch {
      /* ignore */
    }
    return rules;
  })();
  try {
    return await rulesPromise;
  } finally {
    rulesPromise = null;
  }
}


/**
 * Enforces the admin-managed IP allow/deny list on the client and records
 * a rate_limit_events row so blocked attempts show up in the admin console.
 */
export function useIpGuard(): IpGuardState {
  const [state, setState] = useState<IpGuardState>({
    checked: false,
    blocked: false,
    ip: null,
    reason: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const ip = await resolveIp();
      if (!alive) return;
      if (!ip) {
        setState({ checked: true, blocked: false, ip: null, reason: null });
        return;
      }
      const all = await loadRules();
      if (!alive) return;
      const now = Date.now();
      const rules = all.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);

      const allowed = rules.some((r) => r.mode === 'allow' && matches(ip, r.ip_address));
      const hit = allowed
        ? undefined
        : rules.find((r) => r.mode === 'block' && matches(ip, r.ip_address));

      if (hit) {
        void supabase
          .from('rate_limit_events')
          .insert({ ip_address: ip, bucket: 'ip_block', hits: 1, blocked: true });
      }
      setState({
        checked: true,
        blocked: Boolean(hit),
        ip,
        reason: hit?.reason ?? null,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
