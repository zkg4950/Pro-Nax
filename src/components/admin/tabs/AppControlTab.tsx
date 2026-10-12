/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Loader2, Palette, Upload, Radio, Film, MessageCircle, Megaphone, Wallet, Download, GripVertical, Home, HardDrive, ShieldCheck, Check, Server, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/loose';
import { useAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '@/hooks/useAppSettings';
import { getItem, setItem, removeItem } from '@/lib/safeStorage';
import { updateStorageConfig, validateStorageConfig } from '@/lib/storage-config';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

const SECTION_LABELS: Record<string, string> = {
  trending: 'Trending',
  live: 'Live Now',
  shorts: 'Shorts rail',
  foryou: 'For You',
  new: 'New uploads',
  following: 'Following',
};

const FEATURE_ROWS: Array<{
  key: keyof Pick<
    AppSettings,
    | 'feature_uploads'
    | 'feature_live'
    | 'feature_shorts'
    | 'feature_comments'
    | 'feature_ads'
    | 'feature_wallet'
    | 'feature_downloads'
  >;
  label: string;
  hint: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
}> = [
  { key: 'feature_uploads', label: 'Video uploads', hint: 'Allow creators to upload new videos', icon: Upload },
  { key: 'feature_live', label: 'Live streaming', hint: 'Enable the /live page and Go-Live button', icon: Radio },
  { key: 'feature_shorts', label: 'Shorts feed', hint: 'Show the vertical shorts experience', icon: Film },
  { key: 'feature_comments', label: 'Comments', hint: 'Users can post comments on videos', icon: MessageCircle },
  { key: 'feature_ads', label: 'Advertisements', hint: 'Serve ads and count ad revenue', icon: Megaphone },
  { key: 'feature_wallet', label: 'Creator wallet', hint: 'Wallet, earnings and withdrawals', icon: Wallet },
  { key: 'feature_downloads', label: 'Video downloads', hint: 'Users can save videos offline', icon: Download },
];

export function AppControlTab() {
  const { settings: loaded } = useAppSettings();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemoteRef = useRef<string>('');

  // Cloudflare R2 Storage State - No hardcoded credentials
  const [r2AccountId, setR2AccountId] = useState('');
  const [r2BucketName, setR2BucketName] = useState('');
  const [r2AccessKey, setR2AccessKey] = useState('');
  const [r2SecretKey, setR2SecretKey] = useState('');
  const [r2CdnDomain, setR2CdnDomain] = useState('');
  const [r2Provider, setR2Provider] = useState('cloudflare_r2');
  const [r2ChunkedUploads, setR2ChunkedUploads] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    // Load from secure storage only - no hardcoded defaults
    setR2AccountId(getItem('pronax_r2_account_id', ''));
    setR2BucketName(getItem('pronax_r2_bucket', ''));
    setR2AccessKey(getItem('pronax_r2_access_key', ''));
    const raw = sessionStorage.getItem('pronax_r2_secret_session');
    if (raw) setR2SecretKey(raw);
    setR2CdnDomain(getItem('pronax_r2_cdn_domain', ''));
    setR2Provider(getItem('pronax_r2_provider', 'cloudflare_r2'));
    setR2ChunkedUploads(getItem('pronax_r2_chunked') !== 'false');
  }, []);

  const validateR2Credentials = (): boolean => {
    setValidationError(null);
    
    if (!r2AccountId.trim()) {
      setValidationError('R2 Account ID is required');
      return false;
    }
    if (!r2BucketName.trim()) {
      setValidationError('R2 Bucket Name is required');
      return false;
    }
    if (!r2AccessKey.trim()) {
      setValidationError('R2 Access Key is required');
      return false;
    }
    if (!r2SecretKey.trim() || r2SecretKey.includes('•')) {
      setValidationError('R2 Secret Key is required');
      return false;
    }
    if (!r2CdnDomain.trim()) {
      setValidationError('CDN Domain is required');
      return false;
    }
    
    // Validate URL format for CDN domain
    try {
      new URL(r2CdnDomain);
    } catch {
      setValidationError('CDN Domain must be a valid URL');
      return false;
    }
    
    return true;
  };

  const saveR2StorageSettings = async () => {
    if (!validateR2Credentials()) {
      toast.error('Invalid Credentials', {
        description: validationError || 'Please check all required fields',
      });
      return;
    }

    setLoading(true);
    try {
      // Call secure backend API using the new storage-config functions
      const result = await updateStorageConfig({
        provider: r2Provider,
        account_id: r2AccountId,
        bucket_name: r2BucketName,
        access_key: r2AccessKey,
        secret_key: r2SecretKey,
        cdn_domain: r2CdnDomain,
        chunked_uploads: r2ChunkedUploads
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update storage configuration');
      }

      // Only store non-sensitive configuration locally
      setItem('pronax_r2_account_id', r2AccountId);
      setItem('pronax_r2_bucket', r2BucketName);
      setItem('pronax_r2_cdn_domain', r2CdnDomain);
      setItem('pronax_r2_provider', r2Provider);
      setItem('pronax_r2_chunked', String(r2ChunkedUploads));
      
      // Clear sensitive data from memory and session storage
      setR2SecretKey('••••••••••••••••••••••••••••••••');
      sessionStorage.removeItem('pronax_r2_secret_session');
      removeItem('pronax_r2_secret_key');

      toast.success('Storage Configuration Updated', {
        description: result.message || `R2 settings saved securely for bucket "${r2BucketName}"`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save storage configuration';
      toast.error('Configuration Error', {
        description: message,
      });
      console.error('[Storage Config] Save failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Hydrate from remote; also accept remote updates as long as user hasn't touched local yet
  useEffect(() => {
    if (!loaded) return;
    const sig = JSON.stringify(loaded);
    if (sig === lastRemoteRef.current) return;
    lastRemoteRef.current = sig;
    if (!dirtyRef.current) setSettings(loaded);
  }, [loaded]);

  // Auto-save: debounce writes so every keystroke/toggle flushes ~500ms later
  useEffect(() => {
    if (!settings || !dirtyRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus('saving');
    debounceRef.current = setTimeout(async () => {
      const { error } = await supabase.from('app_settings').upsert({ ...settings, id: 1 });
      if (error) { setStatus('error'); toast.error(error.message); return; }
      dirtyRef.current = false;
      lastRemoteRef.current = JSON.stringify(settings);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1200);
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [settings]);

  const patch = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    dirtyRef.current = true;
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  };

  const move = (idx: number, dir: -1 | 1) => {
    if (!settings) return;
    const arr = [...settings.homepage_sections];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    patch('homepage_sections', arr);
  };

  const toggleSection = (key: string) => {
    if (!settings) return;
    const arr = settings.homepage_sections.includes(key)
      ? settings.homepage_sections.filter((k) => k !== key)
      : [...settings.homepage_sections, key];
    patch('homepage_sections', arr);
  };

  const reset = () => {
    dirtyRef.current = true;
    setSettings({ ...DEFAULT_APP_SETTINGS });
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  const allSections = Array.from(new Set([...settings.homepage_sections, ...Object.keys(SECTION_LABELS)]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">App Control Center</h2>
          <p className="text-xs text-slate-400">WordPress-style live editor — changes auto-save & flow into every device.</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="text-[10px] uppercase tracking-widest px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1.5"
            style={{
              borderColor: status === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.3)',
              background: status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
              color: status === 'error' ? '#f87171' : status === 'saved' ? '#34d399' : '#93c5fd',
            }}
          >
            {status === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === 'saved' && <Save className="w-3 h-3" />}
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Live · Saved' : status === 'error' ? 'Error' : 'Auto-save on'}
          </div>
          <button onClick={reset} className="text-[11px] px-3 py-2 rounded-lg border border-white/10 text-slate-400 hover:border-red-500/40">
            Reset defaults
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CLOUDFLARE R2 & S3 VIDEO STORAGE CONFIGURATION */}
        <Panel title="Cloudflare R2 Video Storage Vault & S3 CDN" icon={<HardDrive className="w-4 h-4 text-cyan-400" />} className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-2">
            <div>
              <p className="text-xs text-cyan-300 font-semibold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> High-Performance Zero-Egress Video Storage & Global Edge CDN
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All video uploads are automatically routed to Cloudflare R2 / S3 Object Storage with global edge caching.
              </p>
            </div>
            <button
              onClick={saveR2StorageSettings}
              disabled={loading}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {loading ? 'Saving...' : 'Save R2 Storage Config'}
            </button>
          </div>

          {validationError && (
            <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {validationError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Storage Provider">
              <select
                value={r2Provider}
                onChange={(e) => setR2Provider(e.target.value)}
                className={inputCls}
              >
                <option value="cloudflare_r2" className="bg-slate-900 text-white">Cloudflare R2 (Recommended - Zero Egress)</option>
                <option value="aws_s3" className="bg-slate-900 text-white">Amazon Web Services (AWS S3)</option>
                <option value="supabase_storage" className="bg-slate-900 text-white">Supabase Native S3 Storage</option>
                <option value="google_gcs" className="bg-slate-900 text-white">Google Cloud Storage (GCS)</option>
              </select>
            </Field>

            <Field label="Cloudflare R2 Account ID">
              <input
                value={r2AccountId}
                onChange={(e) => setR2AccountId(e.target.value)}
                placeholder="Enter your R2 Account ID"
                className={inputCls}
              />
            </Field>

            <Field label="Target R2 Bucket Name">
              <input
                value={r2BucketName}
                onChange={(e) => setR2BucketName(e.target.value)}
                placeholder="Enter bucket name"
                className={`${inputCls} font-mono text-cyan-300`}
              />
            </Field>

            <Field label="R2 Access Key ID">
              <input
                value={r2AccessKey}
                onChange={(e) => setR2AccessKey(e.target.value)}
                placeholder="Enter access key ID"
                className={inputCls}
              />
            </Field>

            <Field label="R2 Secret Access Key">
              <input
                type="password"
                value={r2SecretKey}
                onChange={(e) => setR2SecretKey(e.target.value)}
                placeholder="Enter secret access key"
                className={inputCls}
              />
            </Field>

            <Field label="Custom Public CDN Domain URL">
              <input
                value={r2CdnDomain}
                onChange={(e) => setR2CdnDomain(e.target.value)}
                placeholder="https://your-cdn-domain.com"
                className={`${inputCls} font-mono text-cyan-300`}
              />
            </Field>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-white/10 mt-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${r2AccountId && r2BucketName ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-xs text-slate-300 font-mono">
                Status: {r2AccountId && r2BucketName ? `Connected to Cloudflare R2 (${r2BucketName})` : 'Not configured'}
              </span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={r2ChunkedUploads}
                onChange={(e) => setR2ChunkedUploads(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500"
              />
              <span className="text-xs text-slate-300 font-medium">Enable Resumable Chunked Uploads (10MB Parts)</span>
            </label>
          </div>
        </Panel>

        {/* BRANDING */}
        <Panel title="Branding" icon={<Palette className="w-4 h-4" />}>
          <Field label="App name">
            <input value={settings.app_name} onChange={(e) => patch('app_name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tagline">
            <input value={settings.app_tagline ?? ''} onChange={(e) => patch('app_tagline', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Logo URL (optional)">
            <input value={settings.logo_url ?? ''} onChange={(e) => patch('logo_url', e.target.value)} className={inputCls} placeholder="https://…" />
          </Field>
          <Field label="Accent color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accent_hex}
                onChange={(e) => patch('accent_hex', e.target.value)}
                className="w-12 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
              />
              <input
                value={settings.accent_hex}
                onChange={(e) => patch('accent_hex', e.target.value)}
                className={inputCls}
              />
              <div
                className="w-12 h-10 rounded-lg shrink-0"
                style={{ background: settings.accent_hex, boxShadow: `0 0 18px ${settings.accent_hex}66` }}
              />
            </div>
          </Field>
        </Panel>

        {/* FEATURE TOGGLES */}
        <Panel title="Feature toggles" icon={<Radio className="w-4 h-4" />}>
          <div className="space-y-1">
            {FEATURE_ROWS.map((row) => (
              <ToggleRow
                key={row.key}
                icon={<row.icon className="w-3.5 h-3.5" />}
                label={row.label}
                hint={row.hint}
                value={settings[row.key] as boolean}
                onChange={(v) => patch(row.key, v)}
              />
            ))}
          </div>
        </Panel>

        {/* HOMEPAGE SECTIONS */}
        <Panel title="Homepage sections" icon={<Home className="w-4 h-4" />} className="lg:col-span-2">
          <p className="text-[11px] text-slate-500 mb-3">Drag/reorder or toggle sections shown on your app home. Order here = order on the site.</p>
          <div className="space-y-1">
            {allSections.map((key) => {
              const enabled = settings.homepage_sections.includes(key);
              const idx = settings.homepage_sections.indexOf(key);
              return (
                <motion.div
                  key={key}
                  layout
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border"
                  style={{
                    background: enabled ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)',
                    borderColor: enabled ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <GripVertical className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{SECTION_LABELS[key] ?? key}</div>
                    <div className="text-[10px] text-slate-500">{enabled ? `Position ${idx + 1}` : 'Hidden'}</div>
                  </div>
                  {enabled && (
                    <div className="flex gap-1">
                      <button onClick={() => move(idx, -1)} className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:border-blue-500/40" disabled={idx === 0}>↑</button>
                      <button onClick={() => move(idx, 1)} className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:border-blue-500/40" disabled={idx === settings.homepage_sections.length - 1}>↓</button>
                    </div>
                  )}
                  <button
                    onClick={() => toggleSection(key)}
                    className={`shrink-0 relative w-10 h-5 rounded-full transition ${enabled ? 'bg-blue-500' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const inputCls =
  'w-full h-10 px-3 rounded-lg text-xs outline-none border bg-slate-900/60 border-white/10 focus:border-blue-500/60 text-white';

function Panel({
  title, icon, className = '', children,
}: { title: string; icon: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl p-5 border backdrop-blur-xl ${className}`}
      style={{ background: 'rgba(10,15,28,0.7)', borderColor: 'rgba(59,130,246,0.18)' }}
    >
      <div className="flex items-center gap-2 mb-4 text-blue-400">
        {icon}
        <h3 className="text-xs uppercase tracking-widest font-bold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ToggleRow({
  icon, label, hint, value, onChange,
}: { icon: React.ReactNode; label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg grid place-items-center border border-white/10 bg-slate-900/60 text-blue-400">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`shrink-0 relative w-11 h-6 rounded-full transition ${value ? 'bg-blue-500 shadow-[0_0_12px_#3b82f6]' : 'bg-slate-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
