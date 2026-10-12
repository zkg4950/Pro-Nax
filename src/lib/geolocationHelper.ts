/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

/**
 * Geolocation helper utilities for ad revenue calculation
 * This module provides helper functions for integrating geolocation data
 * with the ad revenue system.
 */

import { getCountryFromIP } from '@/analyticsTracker';
import { 
  getCpmRateForCountry, 
  calculateEffectiveCpm, 
  getCountryTierInfo,
  calculateRevenueByCountry 
} from '@/lib/countryCpmRates';

/**
 * Get geolocation data with caching to avoid repeated API calls
 */
const geoCache = new Map<string, { data: any; expiresAt: number }>();
const GEO_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function getGeoDataWithCache(): Promise<{
  countryCode: string | null;
  countryName: string | null;
} | null> {
  const cacheKey = 'user_geo';
  const cached = geoCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  
  try {
    const geoData = await getCountryFromIP();
    if (geoData) {
      geoCache.set(cacheKey, {
        data: geoData,
        expiresAt: Date.now() + GEO_CACHE_TTL_MS
      });
      return geoData;
    }
  } catch (error) {
    console.warn('[geolocationHelper] Failed to get geo data:', error);
  }
  
  return null;
}

/**
 * Clear geolocation cache (useful for testing or when user location changes)
 */
export function clearGeoCache(): void {
  geoCache.clear();
}

/**
 * Get CPM rate for current user's location
 */
export async function getCurrentUserCpmRate(): Promise<{
  countryCode: string | null;
  countryName: string | null;
  countryTier: string | null;
  baseCpm: number;
  effectiveCpm: number;
  multiplier: number;
} | null> {
  const geoData = await getGeoDataWithCache();
  
  if (!geoData || !geoData.countryCode) {
    return null;
  }
  
  const rate = getCpmRateForCountry(geoData.countryCode);
  const tierInfo = getCountryTierInfo(geoData.countryCode);
  const effectiveCpm = calculateEffectiveCpm(geoData.countryCode);
  
  return {
    countryCode: geoData.countryCode,
    countryName: geoData.countryName,
    countryTier: tierInfo.tier,
    baseCpm: rate.baseCpm,
    effectiveCpm,
    multiplier: rate.multiplier,
  };
}

/**
 * Calculate expected revenue for current user's location
 */
export async function calculateExpectedRevenueForCurrentUser(
  viewsCount: number,
  placementMultiplier: number = 1.0
): Promise<{
  countryCode: string | null;
  countryName: string | null;
  viewsCount: number;
  effectiveCpm: number;
  grossRevenue: number;
  creatorShare: number;
  platformShare: number;
  tier: string | null;
} | null> {
  const geoData = await getGeoDataWithCache();
  
  if (!geoData || !geoData.countryCode) {
    return null;
  }
  
  return calculateRevenueByCountry(geoData.countryCode, viewsCount, placementMultiplier);
}

/**
 * Format currency amount with proper locale handling
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Validate country code format
 */
export function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code.toUpperCase());
}

/**
 * Normalize country code to uppercase 2-letter format
 */
export function normalizeCountryCode(code: string): string {
  return code.toUpperCase().trim().substring(0, 2);
}

/**
 * Get tier color for UI display
 */
export function getTierColor(tier: string): string {
  const colors: Record<string, string> = {
    tier1: 'bg-green-500',
    tier2: 'bg-blue-500',
    tier3: 'bg-yellow-500',
    default: 'bg-gray-500',
  };
  return colors[tier] || colors.default;
}

/**
 * Get tier label for display
 */
export function getTierLabel(tier: string): string {
  const labels: Record<string, string> = {
    tier1: 'Premium',
    tier2: 'Mid-Value',
    tier3: 'Emerging',
    default: 'Default',
  };
  return labels[tier] || 'Unknown';
}