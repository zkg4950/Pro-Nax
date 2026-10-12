/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
// Ad SDK adapter — real revenue accounting layer.
// All CPM / fill-rate figures are derived from actual recorded impressions in
// `revenue_logs` and the ad networks configured in `ad_settings`.
// No simulated, random or demo rates are produced anywhere in this module.
// Now enhanced with geolocation-based dynamic CPM rates.

import { supabase } from '@/integrations/supabase/loose';
import { getCountryFromIP } from '@/analyticsTracker';
import { 
  calculateEffectiveCpm, 
  getCpmRateForCountry, 
  calculateRevenueByCountry,
  getCategoryMultiplier,
  type CountryCpmRate,
  type CategoryCpmMultiplier
} from '@/lib/countryCpmRates';

export type AdNetwork = string;

export interface NetworkRateReview {
  network: AdNetwork;
  networkName: string;
  /** Measured eCPM (USD per 1,000 views) from recorded impressions. */
  cpmPer1kViews: number;
  creatorEarningsPer1k: number;
  platformRevenuePer1k: number;
  /** Share of recorded impressions for this network that produced revenue. */
  fillRate: number;
  /** Total views attributed to this network in the measured window. */
  views: number;
  /** Number of recorded impression rows in the measured window. */
  impressions: number;
  status: 'winning_optimal' | 'active_bid' | 'no_data';
}

export interface AdImpressionResult {
  revenue: number;
  creatorShare: number;
  platformShare: number;
  cpm: number;
  network: AdNetwork;
  filled: boolean;
  fillRate: number;
  creativeId?: string;
  fetchedAt: string;
  networkBreakdown?: NetworkRateReview[];
  // Geolocation-based fields (informational only)
  countryCode?: string;
  countryName?: string;
  countryTier?: string;
  baseCpm?: number;
  countryMultiplier?: number;
  // Placement type fields (informational only)
  placementType?: 'long_form' | 'shorts';
  isShort?: boolean;
  originalCpm?: number;
  adjustedCpm?: number;
  // Category-based fields (informational only - NOT used for payout)
  category?: string;
  categoryMultiplier?: number;
  categoryTier?: string;
  // Advertiser-driven revenue fields
  actualRevenue?: number; // Actual gross revenue from ad network
  revenueSource?: 'network' | 'calculated'; // Source of revenue data
}

export interface LiveRates {
  cpm: number;
  network: AdNetwork;
  fillRate: number;
  fetchedAt: string;
  creatorSharePct: number;
  platformSharePct: number;
  networkBreakdown: NetworkRateReview[];
}

const RATE_TTL_MS = 60_000;
let cachedRates: { value: LiveRates; expiresAt: number } | null = null;

export const CREATOR_SHARE_PCT = 55;
export const PLATFORM_SHARE_PCT = 45;

/** Measurement window for network performance. */
const WINDOW_DAYS = 30;

const NETWORK_LABELS: Record<string, string> = {
  google_ima: 'Google IMA / AdSense for Video',
  google_adsense: 'Google AdSense',
  adsense: 'Google AdSense',
  adsterra: 'Adsterra',
  propellerads: 'PropellerAds',
  ezoic: 'Ezoic',
  unity: 'Unity Ads',
  applovin: 'AppLovin MAX',
  direct: 'Direct Sponsors',
  custom: 'Custom Ad Tag',
};

export function networkLabel(id: string) {
  return NETWORK_LABELS[id] ?? id.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Aggregate real eCPM / fill-rate per ad network from recorded impressions.
 * Returns an empty array when the platform has not served any paid impression yet.
 */
export async function fetchMultiNetworkLiveRates(): Promise<NetworkRateReview[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [{ data: logs }, { data: slots }] = await Promise.all([
    supabase
      .from('revenue_logs')
      .select('ad_network, gross_revenue, amount_earned, views_count, cpm')
      .gte('created_at', since)
      .limit(10_000),
    supabase.from('ad_settings').select('network, enabled'),
  ]);

  type Agg = { gross: number; views: number; rows: number; filledRows: number };
  const byNetwork = new Map<string, Agg>();

  for (const row of logs ?? []) {
    const id = (row.ad_network || 'direct').toString();
    const agg = byNetwork.get(id) ?? { gross: 0, views: 0, rows: 0, filledRows: 0 };
    const gross = Number(row.gross_revenue ?? row.amount_earned ?? 0);
    agg.gross += gross;
    agg.views += Number(row.views_count ?? 0);
    agg.rows += 1;
    if (gross > 0) agg.filledRows += 1;
    byNetwork.set(id, agg);
  }

  // Configured-but-not-yet-earning networks are listed with zeroed metrics
  // so the admin can see they are connected, without inventing numbers.
  for (const s of slots ?? []) {
    const id = (s.network || '').toString();
    if (!id || byNetwork.has(id) || !s.enabled) continue;
    byNetwork.set(id, { gross: 0, views: 0, rows: 0, filledRows: 0 });
  }

  const reviews: NetworkRateReview[] = [...byNetwork.entries()].map(([id, a]) => {
    const cpm = a.views > 0 ? +((a.gross / a.views) * 1000).toFixed(4) : 0;
    return {
      network: id,
      networkName: networkLabel(id),
      cpmPer1kViews: cpm,
      creatorEarningsPer1k: +(cpm * (CREATOR_SHARE_PCT / 100)).toFixed(4),
      platformRevenuePer1k: +(cpm * (PLATFORM_SHARE_PCT / 100)).toFixed(4),
      fillRate: a.rows > 0 ? a.filledRows / a.rows : 0,
      views: a.views,
      impressions: a.rows,
      status: a.rows > 0 ? 'active_bid' : 'no_data',
    };
  });

  reviews.sort((x, y) => y.cpmPer1kViews - x.cpmPer1kViews);
  if (reviews.length > 0 && reviews[0].cpmPer1kViews > 0) {
    reviews[0].status = 'winning_optimal';
  }
  return reviews;
}

/**
 * Current best-performing network, based on measured eCPM.
 * Returns cpm = 0 when there is no measured revenue yet.
 */
export async function fetchLiveRates(): Promise<LiveRates> {
  if (cachedRates && cachedRates.expiresAt > Date.now()) return cachedRates.value;

  const breakdown = await fetchMultiNetworkLiveRates();
  const winner = breakdown.find((n) => n.cpmPer1kViews > 0);

  const value: LiveRates = {
    cpm: winner?.cpmPer1kViews ?? 0,
    network: winner?.network ?? 'direct',
    fillRate: winner?.fillRate ?? 0,
    fetchedAt: new Date().toISOString(),
    creatorSharePct: CREATOR_SHARE_PCT,
    platformSharePct: PLATFORM_SHARE_PCT,
    networkBreakdown: breakdown,
  };

  cachedRates = { value, expiresAt: Date.now() + RATE_TTL_MS };
  return value;
}

export function invalidateLiveRates() {
  cachedRates = null;
}

/**
 * Account for a single served ad impression using advertiser-driven revenue.
 *
 * PRIORITY ORDER (Fraud-Proof):
 * 1. actualRevenue - ACTUAL gross revenue from ad network (IMA/VAST/Adsterra) - ALWAYS USED IF PROVIDED
 * 2. cpm - Override CPM from ad network response
 * 3. Calculated CPM from country/category - FALLBACK ONLY (not used for final payout when actual revenue is available)
 *
 * CRITICAL: Category and country multipliers are INFORMATIONAL ONLY and do NOT affect final payout
 * when actualRevenue is provided by the ad network. This prevents keyword spam manipulation.
 *
 * The database function enforces the 55/45 split internally, so we pass the full gross revenue.
 *
 * @param opts - Impression options
 * @param opts.videoId - Video ID for tracking
 * @param opts.actualRevenue - ACTUAL gross revenue from ad network (USD) - takes highest priority
 * @param opts.adTagUrl - Optional VAST tag URL
 * @param opts.network - Optional specific ad network
 * @param opts.cpm - Optional override CPM from ad network (second priority)
 * @param opts.countryCode - Optional country code (informational only)
 * @param opts.placementMultiplier - Optional placement multiplier (informational only)
 * @param opts.placementType - 'long_form' or 'shorts' (informational only)
 * @param opts.isShort - Boolean flag if the video is a Short (informational only)
 * @param opts.category - Optional video category (informational only - NOT used for payout)
 */
export async function requestAdImpression(opts: {
  videoId: string;
  actualRevenue?: number; // ACTUAL gross revenue from ad network - HIGHEST PRIORITY
  adTagUrl?: string;
  network?: AdNetwork;
  cpm?: number;
  countryCode?: string;
  placementMultiplier?: number;
  placementType?: 'long_form' | 'shorts';
  isShort?: boolean;
  category?: string;
}): Promise<AdImpressionResult> {
  const rates = await fetchLiveRates();

  // Determine placement type if not provided
  const placementType = opts.placementType || (opts.isShort ? 'shorts' : 'long_form');

  // Get category multiplier if category is provided (INFORMATIONAL ONLY)
  let categoryMultiplier: number | undefined;
  let categoryTier: string | undefined;
  if (opts.category) {
    const catMult = getCategoryMultiplier(opts.category);
    categoryMultiplier = catMult.multiplier;
    categoryTier = catMult.tier;
  }

  // Geolocation-based CPM calculation (INFORMATIONAL ONLY - not used for payout when actualRevenue is provided)
  let countryCode = opts.countryCode;
  let countryName: string | undefined;
  let countryTier: string | undefined;
  let baseCpm: number | undefined;
  let countryMultiplier: number | undefined;

  // If no country code provided, try to get it from IP
  if (!countryCode) {
    try {
      const geoData = await getCountryFromIP();
      if (geoData) {
        countryCode = geoData.code;
        countryName = geoData.name;
      }
    } catch (error) {
      console.warn('[adSdk] Failed to get country from IP:', error);
    }
  }

  // Calculate informational CPM (used for analytics only, not final payout)
  let calculatedCpm: number;
  let originalCpm: number;
  if (countryCode && !opts.cpm) {
    const countryRate = getCpmRateForCountry(countryCode);
    baseCpm = countryRate.baseCpm;
    countryMultiplier = countryRate.multiplier;
    countryTier = countryRate.tier;

    // Calculate effective CPM using country-specific rate, placement multiplier, and category multiplier
    const placementMultiplier = opts.placementMultiplier || 1.0;
    calculatedCpm = calculateEffectiveCpm(countryCode, placementMultiplier, opts.category);
    originalCpm = calculatedCpm;

    // Apply Shorts CPM reduction (60% of long-form CPM) - INFORMATIONAL ONLY
    if (placementType === 'shorts') {
      originalCpm = calculatedCpm;
      calculatedCpm = calculatedCpm * 0.6; // 60% for Shorts
    }

    // If we don't have country name yet, get it from the rate lookup
    if (!countryName) {
      countryName = countryRate.countryName;
    }
  } else {
    // Fall back to provided CPM or global rate
    originalCpm = opts.cpm ?? rates.cpm;
    calculatedCpm = originalCpm;

    // Apply category multiplier if no country-specific rate - INFORMATIONAL ONLY
    if (opts.category && categoryMultiplier) {
      calculatedCpm = calculatedCpm * categoryMultiplier;
    }

    // Apply Shorts CPM reduction if no country-specific rate - INFORMATIONAL ONLY
    if (placementType === 'shorts' && !opts.cpm) {
      calculatedCpm = calculatedCpm * 0.6; // 60% for Shorts
    }
  }

  const network = opts.network ?? rates.network;

  // FRAUD-PROOF: Use actual revenue from ad network if provided
  // This prevents keyword spam and ensures payouts match actual advertiser spend
  let grossRevenue: number;
  let revenueSource: 'network' | 'calculated';
  let finalCpm: number;

  if (opts.actualRevenue !== undefined && opts.actualRevenue > 0) {
    // ACTUAL REVENUE FROM AD NETWORK - ALWAYS USE THIS
    grossRevenue = +opts.actualRevenue.toFixed(6);
    revenueSource = 'network';
    // Derive CPM from actual revenue for consistency
    finalCpm = +(grossRevenue * 1000).toFixed(4);
    console.log('[adSdk] Using ACTUAL revenue from ad network:', {
      actualRevenue: grossRevenue,
      network,
      videoId: opts.videoId,
    });
  } else if (opts.cpm) {
    // Override CPM from ad network response
    grossRevenue = +(opts.cpm / 1000).toFixed(6);
    revenueSource = 'network';
    finalCpm = opts.cpm;
    console.log('[adSdk] Using CPM from ad network:', {
      cpm: finalCpm,
      revenue: grossRevenue,
      network,
      videoId: opts.videoId,
    });
  } else {
    // FALLBACK: Use calculated CPM (only when no actual revenue from network)
    grossRevenue = +(calculatedCpm / 1000).toFixed(6);
    revenueSource = 'calculated';
    finalCpm = calculatedCpm;
    console.warn('[adSdk] Using FALLBACK calculated CPM (no actual revenue from network):', {
      calculatedCpm: finalCpm,
      revenue: grossRevenue,
      network,
      videoId: opts.videoId,
      countryCode,
      category: opts.category,
    });
  }

  const filled = grossRevenue > 0;

  // Calculate shares for informational purposes (database will enforce actual split)
  const creatorShare = +(grossRevenue * (CREATOR_SHARE_PCT / 100)).toFixed(6);
  const platformShare = +(grossRevenue * (PLATFORM_SHARE_PCT / 100)).toFixed(6);

  return {
    revenue: grossRevenue,
    creatorShare,
    platformShare,
    cpm: finalCpm,
    network,
    fillRate: rates.fillRate,
    filled,
    creativeId: filled ? `pronax-ad-${opts.videoId}-${Date.now()}` : undefined,
    fetchedAt: rates.fetchedAt,
    networkBreakdown: rates.networkBreakdown,
    // Geolocation information (informational only)
    countryCode,
    countryName,
    countryTier,
    baseCpm,
    countryMultiplier,
    // Placement type information (informational only)
    placementType,
    isShort: placementType === 'shorts',
    originalCpm,
    adjustedCpm: calculatedCpm,
    // Category information (informational only - NOT used for payout)
    category: opts.category,
    categoryMultiplier,
    categoryTier,
    // Advertiser-driven revenue fields
    actualRevenue: opts.actualRevenue,
    revenueSource,
  };
}

/** Expected creator & platform split for a given view count at a given eCPM. */
export function calculatePayoutForViews(viewsCount: number, cpmPer1k: number) {
  const gross = (viewsCount / 1000) * cpmPer1k;
  return {
    viewsCount,
    cpmPer1k,
    grossPayout: +gross.toFixed(4),
    creatorPayout: +(gross * (CREATOR_SHARE_PCT / 100)).toFixed(4),
    platformPayout: +(gross * (PLATFORM_SHARE_PCT / 100)).toFixed(4),
    creatorPercent: CREATOR_SHARE_PCT,
    platformPercent: PLATFORM_SHARE_PCT,
  };
}

/** Expected creator & platform split for a given view count with country-specific CPM. */
export function calculatePayoutForViewsByCountry(
  viewsCount: number, 
  countryCode: string,
  placementMultiplier: number = 1.0
) {
  const revenueByCountry = calculateRevenueByCountry(countryCode, viewsCount, placementMultiplier);
  return {
    viewsCount,
    countryCode: revenueByCountry.countryCode,
    countryName: revenueByCountry.countryName,
    countryTier: revenueByCountry.tier,
    effectiveCpm: revenueByCountry.effectiveCpm,
    grossPayout: revenueByCountry.grossRevenue,
    creatorPayout: revenueByCountry.creatorShare,
    platformPayout: revenueByCountry.platformShare,
    creatorPercent: CREATOR_SHARE_PCT,
    platformPercent: PLATFORM_SHARE_PCT,
  };
}

/** Comparative report across all networks with recorded performance. */
export async function getNetworkCpmComparisonReport() {
  const breakdown = await fetchMultiNetworkLiveRates();
  const winner = breakdown.find((n) => n.cpmPer1kViews > 0) ?? null;

  return {
    timestamp: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    winningNetwork: winner?.networkName ?? null,
    topCpmPer1kViews: winner?.cpmPer1kViews ?? 0,
    creator1kEarnings: winner?.creatorEarningsPer1k ?? 0,
    platform1kRevenue: winner?.platformRevenuePer1k ?? 0,
    splitRatio: `${CREATOR_SHARE_PCT}% Creator / ${PLATFORM_SHARE_PCT}% Platform`,
    networks: breakdown,
  };
}
