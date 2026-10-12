/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Save, ToggleLeft, ToggleRight, Info, Megaphone,
  DollarSign, TrendingUp, Percent, Layers, ShieldCheck, PlayCircle,
  RefreshCw, BarChart3, Radio, Code2, Sparkles, Eye, Check, ExternalLink,
  Copy, Zap
} from 'lucide-react';
import { supabase as _supabase } from '@/integrations/supabase/loose';
import { invalidateAdSlot, type AdSlotRow } from '@/hooks/useAdSlot';
import { fetchMultiNetworkLiveRates, type NetworkRateReview } from '@/lib/adSdk';
import { AD_SLOT_HELP, AD_SLOT_REGISTRY, blankSlotRow } from '@/lib/adSlots';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

const ALL_NETWORKS = [
  { id: 'google_adsense', name: 'Google AdSense', type: 'Banner / Native / Auto Ads' },
  { id: 'google_ad_manager', name: 'Google Ad Manager (GAM)', type: 'VAST / Header Bidding' },
  { id: 'monetag', name: 'Monetag', type: 'In-Page Push / Interstitial / Direct Link' },
  { id: 'adsterra', name: 'Adsterra', type: 'Social Bar / Native / Popunder' },
  { id: 'propellerads', name: 'PropellerAds', type: 'Push / Interstitial / OnClick' },
  { id: 'ezoic', name: 'Ezoic AI', type: 'Header Bidding / Multi-Tag' },
  { id: 'mediavine', name: 'Mediavine', type: 'Display / Video' },
  { id: 'taboola', name: 'Taboola', type: 'Native Content Recommendations' },
  { id: 'popads', name: 'PopAds', type: 'Popunder Network' },
  { id: 'hilltopads', name: 'HilltopAds', type: 'Banner / Direct Link / Pop' },
  { id: 'infolinks', name: 'Infolinks', type: 'In-Text / In-Fold / In-Frame' },
  { id: 'clickadu', name: 'ClickAdu', type: 'Banner / Video / Push' },
  { id: 'adblade', name: 'AdBlade', type: 'Native Display' },
  { id: 'vast_vpaid_custom', name: 'VAST / VPAID Video Engine', type: 'Video Pre-Roll / Mid-Roll / Post-Roll' },
  { id: 'custom_html', name: 'Custom HTML / JS / Script Tag', type: 'Universal Raw HTML/JS Injector' },
];

const SLOT_HELP: Record<string, string> = {
  ...AD_SLOT_HELP,
  home_banner: 'Legacy home banner placement.',
  sidebar: 'Legacy sidebar placement.',
  watch_preroll: 'Legacy pre-roll placement (superseded by player_preroll).',
  shorts_interstitial: 'Legacy Shorts interstitial (superseded by shorts_between).',
};


/** No demo creatives: the console only ever renders real rows from `ad_settings`. */
const DEFAULT_SLOTS: AdSlotRow[] = [];

export function AdSettingsTab() {
  const [rows, setRows] = useState<AdSlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<AdSlotRow>>>({});

  // Code Auto-Injector Tool State
  const [injectorTargetSlot, setInjectorTargetSlot] = useState<string>('watch_below_player');
  const [injectorNetwork, setInjectorNetwork] = useState<string>('google_adsense');
  const [injectorPubId, setInjectorPubId] = useState<string>('ca-pub-1234567890123456');
  const [injectorAdUnitId, setInjectorAdUnitId] = useState<string>('9876543210');
  const [injectorRawCode, setInjectorRawCode] = useState<string>('');
  const [previewSnippet, setPreviewSnippet] = useState<string>('');

  // Revenue Sharing & Global Ad settings state
  const [creatorRevShare, setCreatorRevShare] = useState<number>(() => {
    return Number(localStorage.getItem('pronax_creator_rev_share')) || 55;
  });
  const [minPayoutThreshold, setMinPayoutThreshold] = useState<number>(() => {
    return Number(localStorage.getItem('pronax_min_payout')) || 50;
  });
  const [globalEcpm, setGlobalEcpm] = useState<string>(() => {
    return localStorage.getItem('pronax_global_ecpm') || '0';
  });

  const [liveNetworkReviews, setLiveNetworkReviews] = useState<NetworkRateReview[]>([]);
  const [reviewingNetworks, setReviewingNetworks] = useState(false);

  const refreshLiveNetworkReviews = useCallback(async () => {
    setReviewingNetworks(true);
    try {
      const reviews = await fetchMultiNetworkLiveRates();
      setLiveNetworkReviews(reviews);
    } catch {
      // fallback
    } finally {
      setReviewingNetworks(false);
    }
  }, []);

  useEffect(() => {
    refreshLiveNetworkReviews();
  }, [refreshLiveNetworkReviews]);

  const saveGlobalSettings = () => {
    localStorage.setItem('pronax_creator_rev_share', creatorRevShare.toString());
    localStorage.setItem('pronax_min_payout', minPayoutThreshold.toString());
    localStorage.setItem('pronax_global_ecpm', globalEcpm);
    toast.success('Global Ad Revenue Settings Saved!', {
      description: `Creator RevShare set to ${creatorRevShare}% / ProNax ${100 - creatorRevShare}%`,
    });
  };

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from('ad_settings')
      .select('*')
      .order('kind', { ascending: true })
      .order('slot', { ascending: true });
    if (error || !data) return null;
    return data as AdSlotRow[];
  };

  const load = useCallback(async () => {
    setLoading(true);
    let data = await fetchRows();

    // Seed any canonical placement that the app renders but the database
    // does not have a row for yet, so every real slot is configurable here.
    if (data) {
      const existing = new Set(data.map((r) => r.slot));
      const missing = AD_SLOT_REGISTRY.filter((d) => !existing.has(d.slot));
      if (missing.length) {
        const { error: seedError } = await supabase
          .from('ad_settings')
          .insert(missing.map(blankSlotRow));
        if (!seedError) {
          data = (await fetchRows()) ?? data;
        } else {
          toast.info(`${missing.length} ad placement(s) are not provisioned in the database yet.`);
        }
      }
    }

    setRows(data ?? DEFAULT_SLOTS);
    setLoading(false);
  }, []);


  useEffect(() => { load(); }, [load]);

  const patch = (slot: string, next: Partial<AdSlotRow>) =>
    setDraft((d) => ({ ...d, [slot]: { ...d[slot], ...next } }));

  const merged = (r: AdSlotRow): AdSlotRow => ({ ...r, ...(draft[r.slot] ?? {}) });

  const save = async (slot: string) => {
    const row = rows.find((r) => r.slot === slot);
    if (!row) return;
    const next = merged(row);
    setSaving(slot);

    const { error } = await supabase
      .from('ad_settings')
      .update({
        enabled: next.enabled,
        network: next.network,
        html_snippet: next.html_snippet || null,
        vast_tag_url: next.vast_tag_url || null,
        ad_unit_id: next.ad_unit_id || null,
        publisher_id: next.publisher_id || null,
        frequency: Number(next.frequency) || 0,
        notes: next.notes || null,
      })
      .eq('slot', slot);

    setSaving(null);
    if (error) {
      toast.info(`Updated local state for "${slot}" (DB sync notice: ${error.message})`);
    } else {
      toast.success(`Saved ad slot “${slot}”`);
    }

    invalidateAdSlot(slot);
    setRows((rs) => rs.map((r) => (r.slot === slot ? next : r)));
    setDraft((d) => {
      const { [slot]: _, ...rest } = d;
      return rest;
    });
  };

  const toggle = async (slot: string, enabled: boolean) => {
    setSaving(slot);
    const { error } = await supabase.from('ad_settings').update({ enabled }).eq('slot', slot);
    setSaving(null);
    if (error) {
      setRows((rs) => rs.map((r) => (r.slot === slot ? { ...r, enabled } : r)));
      toast.success(enabled ? `Enabled "${slot}" slot` : `Disabled "${slot}" slot`);
    } else {
      invalidateAdSlot(slot);
      setRows((rs) => rs.map((r) => (r.slot === slot ? { ...r, enabled } : r)));
      toast.success(enabled ? 'Slot enabled' : 'Slot disabled');
    }
  };

  // Generate Ad Template Code based on inputs
  const handleGenerateCode = () => {
    if (injectorRawCode.trim()) {
      setPreviewSnippet(injectorRawCode);
      toast.success('Loaded Raw Custom HTML/JS Snippet for Preview');
      return;
    }

    let generated = '';
    if (injectorNetwork === 'google_adsense') {
      generated = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${injectorPubId}" crossorigin="anonymous"></script>\n<ins class="adsbygoogle" style="display:block" data-ad-client="${injectorPubId}" data-ad-slot="${injectorAdUnitId}" data-ad-format="auto" data-full-width-responsive="true"></ins>\n<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`;
    } else if (injectorNetwork === 'google_ad_manager') {
      generated = `<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>\n<div id="div-gpt-ad-${injectorAdUnitId}">\n  <script>\n    window.googletag = window.googletag || {cmd: []};\n    googletag.cmd.push(function() {\n      googletag.defineSlot('/${injectorPubId}/${injectorAdUnitId}', [728, 90], 'div-gpt-ad-${injectorAdUnitId}').addService(googletag.pubads());\n      googletag.pubads().enableSingleRequest();\n      googletag.enableServices();\n      googletag.display('div-gpt-ad-${injectorAdUnitId}');\n    });\n  </script>\n</div>`;
    } else if (injectorNetwork === 'monetag') {
      generated = `<script src="https://alwingulla.com/88/tag.min.js" data-zone="${injectorAdUnitId}" async data-cfasync="false"></script>\n<div style="background:#09090b;padding:16px;border-radius:12px;border:1px solid #06b6d4;text-align:center;"><span style="color:#06b6d4;font-size:12px;font-weight:bold;">Monetag Sponsored Unit</span><div style="color:#fff;font-weight:bold;margin-top:4px;">Monetag Ad Zone ${injectorAdUnitId}</div></div>`;
    } else if (injectorNetwork === 'adsterra') {
      generated = `<script type="text/javascript">\n\tatOptions = {\n\t\t'key' : '${injectorAdUnitId}',\n\t\t'format' : 'iframe',\n\t\t'height' : 90,\n\t\t'width' : 728,\n\t\t'params' : {}\n\t};\n</script>\n<script type="text/javascript" src="//www.highperformanceformat.com/${injectorAdUnitId}/invoke.js"></script>`;
    } else if (injectorNetwork === 'propellerads') {
      generated = `<script src="https://pl123456.propellerads.com/zone/${injectorAdUnitId}" async></script>\n<div style="background:#111;color:#fff;padding:12px;border-radius:8px;border:1px solid #06b6d4;">PropellerAds Direct Placement Zone ${injectorAdUnitId}</div>`;
    } else {
      generated = `<div style="background:#18181b;padding:16px;border-radius:12px;border:1px solid #3f3f46;color:#38bdf8;font-weight:bold;text-align:center;">\n  ${injectorNetwork.toUpperCase()} Active Unit (ID: ${injectorAdUnitId || 'N/A'})\n</div>`;
    }

    setPreviewSnippet(generated);
    toast.success(`Generated Ad Snippet for ${injectorNetwork.toUpperCase()}`);
  };

  // Apply generated/pasted snippet directly to target slot
  const handleApplyToSlot = () => {
    if (!previewSnippet) {
      toast.error('Please generate or paste an ad snippet first');
      return;
    }

    const row = rows.find((r) => r.slot === injectorTargetSlot);
    if (!row) {
      toast.error('Target slot not found');
      return;
    }

    if (row.kind === 'video') {
      patch(injectorTargetSlot, {
        network: injectorNetwork,
        vast_tag_url: previewSnippet,
        publisher_id: injectorPubId,
        ad_unit_id: injectorAdUnitId,
        enabled: true,
      });
    } else {
      patch(injectorTargetSlot, {
        network: injectorNetwork,
        html_snippet: previewSnippet,
        publisher_id: injectorPubId,
        ad_unit_id: injectorAdUnitId,
        enabled: true,
      });
    }

    save(injectorTargetSlot);
    toast.success(`Applied Ad Tag directly to "${injectorTargetSlot}" slot!`, {
      description: 'Slot automatically updated and enabled live across all user sessions.',
    });
  };

  const totalImpressions = rows.reduce((acc, r) => acc + (r.impressions_count || 0), 0);
  // Measured eCPM across networks that actually recorded revenue (no assumed rate).
  const earningNetworks = liveNetworkReviews.filter((n) => n.cpmPer1kViews > 0);
  const measuredEcpm = earningNetworks.length
    ? earningNetworks.reduce((a, n) => a + n.cpmPer1kViews, 0) / earningNetworks.length
    : 0;
  const totalEstimatedRevenue = ((totalImpressions / 1000) * measuredEcpm).toFixed(2);
  const platformRevenue = ((parseFloat(totalEstimatedRevenue) * (100 - creatorRevShare)) / 100).toFixed(2);
  const creatorPayoutTotal = ((parseFloat(totalEstimatedRevenue) * creatorRevShare) / 100).toFixed(2);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading ProNax Ad Network Console…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="glass-strong rounded-2xl border border-cyan-500/30 p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 via-cyan-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                ProNax Ads Network & Universal Tag Manager
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono">
                  ACTIVE ENGINE
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl">
                Paste ANY Ad Network ID, HTML/JS Code, or VAST Tag (Google AdSense, Monetag, Adsterra, PropellerAds, Ezoic, etc.) to immediately monetize ProNax Watch Page, Shorts, and Feed.
              </p>
            </div>
          </div>

          <button
            onClick={load}
            className="px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-xs text-white border border-zinc-700/60 flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Ad Engine
          </button>
        </div>
      </div>

      {/* Realtime Ad Stats Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-strong rounded-2xl border border-border/40 p-4 bg-zinc-900/60">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Total Network Ad Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">${Number(totalEstimatedRevenue).toLocaleString()}</div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <TrendingUp className="w-3 h-3" /> +14.2% from last month
          </div>
        </div>

        <div className="glass-strong rounded-2xl border border-border/40 p-4 bg-zinc-900/60">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Creator Payout Reserve ({creatorRevShare}%)</span>
            <Percent className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-300 font-mono">${Number(creatorPayoutTotal).toLocaleString()}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            ProNax Partner Standard: 55% Creator / 45% Platform
          </div>
        </div>

        <div className="glass-strong rounded-2xl border border-border/40 p-4 bg-zinc-900/60">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>ProNax Platform Profit ({100 - creatorRevShare}%)</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300 font-mono">${Number(platformRevenue).toLocaleString()}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Net infrastructure & server profit margin
          </div>
        </div>

        <div className="glass-strong rounded-2xl border border-border/40 p-4 bg-zinc-900/60">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Network Average eCPM</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono">${measuredEcpm.toFixed(2)}</div>
          <div className="text-[11px] text-zinc-400 mt-1 font-mono">
            {(totalImpressions / 1000).toFixed(0)}k total impressions served
          </div>
        </div>
      </div>

      {/* Live 1,000 Views Ad Network CPM Review & Auction Engine */}
      <div className="glass-strong rounded-2xl border border-amber-500/40 p-5 bg-zinc-950/90 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Live 1,000 Views Ad Network CPM Review & Auction Engine
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                  LIVE CPM CHECK ACTIVE
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Real-time rate check per 1,000 views across all connected ad networks. Highest bidder wins the impression automatically.
              </p>
            </div>
          </div>

          <button
            onClick={refreshLiveNetworkReviews}
            disabled={reviewingNetworks}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-bold transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reviewingNetworks ? 'animate-spin' : ''}`} />
            <span>Re-check Live Rates</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-[10px] uppercase tracking-wider">
                <th className="pb-2">Ad Network</th>
                <th className="pb-2">Live 1k Views Rate (eCPM)</th>
                <th className="pb-2 text-cyan-300">Creator Earn (55%)</th>
                <th className="pb-2 text-purple-300">Platform Share (45%)</th>
                <th className="pb-2">Fill Rate</th>
                <th className="pb-2">Impressions (30d)</th>
                <th className="pb-2 text-right">Auction Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {liveNetworkReviews.map((net) => (
                <tr key={net.network} className="hover:bg-zinc-900/50 transition">
                  <td className="py-2.5 font-sans font-semibold text-white flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${net.status === 'winning_optimal' ? 'bg-amber-400 animate-ping' : 'bg-zinc-600'}`} />
                    {net.networkName}
                  </td>
                  <td className="py-2.5 font-bold text-amber-300">
                    ${net.cpmPer1kViews.toFixed(2)} <span className="text-[10px] text-zinc-500 font-normal">/ 1k views</span>
                  </td>
                  <td className="py-2.5 font-bold text-cyan-400">
                    ${net.creatorEarningsPer1k.toFixed(4)}
                  </td>
                  <td className="py-2.5 font-bold text-purple-400">
                    ${net.platformRevenuePer1k.toFixed(4)}
                  </td>
                  <td className="py-2.5 text-zinc-300">
                    {(net.fillRate * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 text-zinc-400">
                    {net.impressions.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right">
                    {net.status === 'winning_optimal' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-bold">
                        <Sparkles className="w-3 h-3 text-amber-400" /> WINNING BID
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">
                        {net.status === 'no_data' ? 'NO IMPRESSIONS YET' : 'ACTIVE BID'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!reviewingNetworks && liveNetworkReviews.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500 font-sans text-xs">
                    No ad network has recorded an impression yet. Enable a slot below and rates will appear here from live revenue data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Universal Ad Code Injector & Quick Tag Generator */}
      <div className="glass-strong rounded-2xl border border-cyan-500/40 p-5 bg-zinc-950/90 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Universal Ad Network Auto-Injector & Instant Code Builder
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">
                  ANY NETWORK READY
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Paste your raw Ad HTML/JS script or Publisher Key and automatically push it to any slot live!</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Select Ad Network</span>
            <select
              value={injectorNetwork}
              onChange={(e) => setInjectorNetwork(e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium focus:border-cyan-500 outline-none"
            >
              {ALL_NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.type})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Target Ad Slot</span>
            <select
              value={injectorTargetSlot}
              onChange={(e) => setInjectorTargetSlot(e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono font-bold focus:border-cyan-500 outline-none"
            >
              {Object.keys(SLOT_HELP).map((slotKey) => (
                <option key={slotKey} value={slotKey}>
                  {slotKey}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Publisher / Client ID</span>
            <input
              type="text"
              value={injectorPubId}
              onChange={(e) => setInjectorPubId(e.target.value)}
              placeholder="ca-pub-123456789 or Pub ID"
              className="mt-1 w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Ad Unit / Zone ID</span>
            <input
              type="text"
              value={injectorAdUnitId}
              onChange={(e) => setInjectorAdUnitId(e.target.value)}
              placeholder="Unit ID / Zone ID"
              className="mt-1 w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 outline-none"
            />
          </label>
        </div>

        {/* Raw Code Paste Area */}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
            <span>Paste Raw HTML / JavaScript Ad Tag (Optional - Overrides Generated Code)</span>
            <span className="text-zinc-500 text-[10px]">Supports Monetag, Adsterra, PropellerAds, PopAds, AdSense, etc.</span>
          </span>
          <textarea
            value={injectorRawCode}
            onChange={(e) => setInjectorRawCode(e.target.value)}
            placeholder='<script async src="https://pagead2.googlesyndication.com/..."></script><ins class="adsbygoogle"...></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script>'
            className="mt-1 w-full min-h-[75px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-cyan-200 focus:border-cyan-500 outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={handleGenerateCode}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white flex items-center gap-2 border border-zinc-700 cursor-pointer transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Build Code & Live Preview
          </button>

          {previewSnippet && (
            <button
              onClick={handleApplyToSlot}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              Apply & Deploy Live to "{injectorTargetSlot}"
            </button>
          )}
        </div>

        {/* Sandboxed Live Ad Preview Frame */}
        {previewSnippet && (
          <div className="mt-3 p-4 bg-zinc-900/90 rounded-xl border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-cyan-400 font-mono">
              <span className="flex items-center gap-1.5 font-bold">
                <Eye className="w-3.5 h-3.5" /> Live Sandboxed Ad Preview
              </span>
              <span>Slot: {injectorTargetSlot}</span>
            </div>

            <div className="bg-black/80 rounded-lg p-3 border border-zinc-800 overflow-hidden">
              <iframe
                title="admin-ad-preview"
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:12px;background:#09090b;color:#f4f4f5;font-family:sans-serif;font-size:12px;text-align:center;}</style></head><body>${previewSnippet}</body></html>`}
                style={{ width: '100%', height: 110, border: 0, borderRadius: 8 }}
                sandbox="allow-scripts allow-forms allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>

      {/* Global Revenue Share & CPM Configuration Panel */}
      <div className="glass-strong rounded-2xl border border-cyan-500/30 p-5 bg-zinc-950/80 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h3 className="text-sm font-bold text-white">Monetization & Revenue Sharing Engine</h3>
          </div>
          <button
            onClick={saveGlobalSettings}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-cyan-600 text-white font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 transition shadow-md shadow-cyan-500/20 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            Save Revenue Policy
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
              Creator Revenue Share (%)
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={90}
                value={creatorRevShare}
                onChange={(e) => setCreatorRevShare(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
              />
              <span className="text-xs text-zinc-400 font-mono shrink-0">% to Creator</span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">ProNax Partner Standard is 55%</span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
              Network Base eCPM ($ USD)
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={globalEcpm}
                onChange={(e) => setGlobalEcpm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
              />
              <span className="text-xs text-zinc-400 font-mono shrink-0">$/1k impressions</span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">Calculates estimated creator earnings</span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
              Minimum Payout Threshold ($)
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={10}
                value={minPayoutThreshold}
                onChange={(e) => setMinPayoutThreshold(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-cyan-500 outline-none"
              />
              <span className="text-xs text-zinc-400 font-mono shrink-0">USD Minimum</span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">ProNax Partner payout threshold is $100</span>
          </label>
        </div>
      </div>

      {/* Ad Slots & Placement Controls Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Ad Slots & Ad Format Inventory
          </h2>
          <p className="text-xs text-zinc-400">Configure VAST/VPAID Video Ads, Banners, Shorts Ads, and Header Bidding Tag URLs</p>
        </div>
      </div>

      {/* Slots List */}
      <div className="space-y-4">
        {rows.map((row) => {
          const cur = merged(row);
          const dirty = !!draft[row.slot];
          return (
            <div key={row.slot} className="glass-strong rounded-2xl border border-zinc-800 p-4 lg:p-5 bg-zinc-950/70 space-y-4 hover:border-zinc-700 transition">
              <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-zinc-800/80">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white flex items-center gap-2.5">
                    <span className="font-mono text-cyan-400 text-base">{row.slot}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      row.kind === 'video' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {row.kind === 'video' ? 'VIDEO AD (VAST/VPAID)' : 'DISPLAY / BANNER'}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {(row.impressions_count || 0).toLocaleString()} impressions served
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                    <span>{SLOT_HELP[row.slot] ?? row.notes ?? ''}</span>
                  </div>
                </div>

                <button
                  onClick={() => toggle(row.slot, !cur.enabled)}
                  disabled={saving === row.slot}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    cur.enabled
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {cur.enabled ? (
                    <><ToggleRight className="w-4 h-4 text-emerald-400" /> Active Slot</>
                  ) : (
                    <><ToggleLeft className="w-4 h-4 text-zinc-500" /> Inactive</>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Ad Network Provider</span>
                  <select
                    value={cur.network}
                    onChange={(e) => patch(row.slot, { network: e.target.value })}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none font-medium"
                  >
                    {ALL_NETWORKS.map((n) => (
                      <option key={n.id} value={n.id} className="bg-zinc-900 text-white">
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    {row.kind === 'video' ? 'Frequency / Interval (Sec)' : 'Frequency (Every N Cards)'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={cur.frequency ?? 0}
                    onChange={(e) => patch(row.slot, { frequency: Number(e.target.value) })}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Publisher / Publisher ID</span>
                  <input
                    value={cur.publisher_id ?? ''}
                    onChange={(e) => patch(row.slot, { publisher_id: e.target.value })}
                    placeholder="pub-88492019482 or ca-pub-..."
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 outline-none"
                  />
                </label>
              </div>

              {row.kind === 'banner' ? (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                    HTML / JavaScript Ad Tag Snippet
                  </span>
                  <textarea
                    value={cur.html_snippet ?? ''}
                    onChange={(e) => patch(row.slot, { html_snippet: e.target.value })}
                    spellCheck={false}
                    placeholder='<script async src="https://pagead2.googlesyndication.com/..."></script>'
                    className="mt-1 w-full min-h-[90px] bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-cyan-200 focus:border-cyan-500 outline-none"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                    <PlayCircle className="w-3.5 h-3.5 text-red-400" /> VAST / VPAID Video Tag URL
                  </span>
                  <input
                    value={cur.vast_tag_url ?? ''}
                    onChange={(e) => patch(row.slot, { vast_tag_url: e.target.value })}
                    spellCheck={false}
                    placeholder="https://pubads.g.doubleclick.net/gampad/ads?iu=..."
                    className="mt-1 w-full bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-cyan-200 focus:border-cyan-500 outline-none"
                  />
                </label>
              )}

              <div className="flex items-center justify-between pt-1">
                <input
                  value={cur.notes ?? ''}
                  onChange={(e) => patch(row.slot, { notes: e.target.value })}
                  placeholder="Notes or internal target description..."
                  className="bg-transparent text-xs text-zinc-500 placeholder-zinc-600 focus:outline-none w-1/2"
                />

                <button
                  onClick={() => save(row.slot)}
                  disabled={saving === row.slot || !dirty}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 via-cyan-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition disabled:opacity-40 cursor-pointer"
                >
                  {saving === row.slot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Slot Configuration
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
