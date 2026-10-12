/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

/**
 * Country-based CPM rate matrix for dynamic ad revenue calculation
 * Organized by economic tiers and geographic regions
 * Now includes category-based multipliers for niche-specific CPM adjustments
 */

export type CountryTier = 'tier1' | 'tier2' | 'tier3' | 'default';
export type CategoryTier = 'premium' | 'high' | 'standard' | 'low' | 'default';

export interface CountryCpmRate {
  countryCode: string;
  countryName: string;
  tier: CountryTier;
  baseCpm: number; // Base CPM in USD per 1000 impressions
  multiplier: number; // Multiplier for premium placements
}

/**
 * Country tier definitions:
 * - Tier 1: High-value markets (US, UK, CA, AU, etc.) - $4.00+ CPM
 * - Tier 2: Mid-value markets (EU, JP, KR, etc.) - $1.50+ CPM  
 * - Tier 3: Emerging markets (IN, PK, PH, etc.) - $0.80+ CPM
 * - Default: Fallback for unlisted countries - $0.50 CPM
 */

export const COUNTRY_CPM_RATES: CountryCpmRate[] = [
  // Tier 1 - Premium markets (North America, Western Europe, Oceania)
  { countryCode: 'US', countryName: 'United States', tier: 'tier1', baseCpm: 4.50, multiplier: 1.2 },
  { countryCode: 'UK', countryName: 'United Kingdom', tier: 'tier1', baseCpm: 4.20, multiplier: 1.15 },
  { countryCode: 'CA', countryName: 'Canada', tier: 'tier1', baseCpm: 4.00, multiplier: 1.1 },
  { countryCode: 'AU', countryName: 'Australia', tier: 'tier1', baseCpm: 3.80, multiplier: 1.1 },
  { countryCode: 'DE', countryName: 'Germany', tier: 'tier1', baseCpm: 3.50, multiplier: 1.05 },
  { countryCode: 'FR', countryName: 'France', tier: 'tier1', baseCpm: 3.40, multiplier: 1.05 },
  { countryCode: 'NL', countryName: 'Netherlands', tier: 'tier1', baseCpm: 3.30, multiplier: 1.05 },
  { countryCode: 'SE', countryName: 'Sweden', tier: 'tier1', baseCpm: 3.20, multiplier: 1.05 },
  { countryCode: 'NO', countryName: 'Norway', tier: 'tier1', baseCpm: 3.20, multiplier: 1.05 },
  { countryCode: 'DK', countryName: 'Denmark', tier: 'tier1', baseCpm: 3.10, multiplier: 1.05 },
  { countryCode: 'CH', countryName: 'Switzerland', tier: 'tier1', baseCpm: 3.50, multiplier: 1.1 },
  { countryCode: 'AT', countryName: 'Austria', tier: 'tier1', baseCpm: 3.00, multiplier: 1.05 },
  { countryCode: 'IE', countryName: 'Ireland', tier: 'tier1', baseCpm: 3.00, multiplier: 1.05 },
  { countryCode: 'NZ', countryName: 'New Zealand', tier: 'tier1', baseCpm: 3.50, multiplier: 1.1 },
  { countryCode: 'SG', countryName: 'Singapore', tier: 'tier1', baseCpm: 3.80, multiplier: 1.1 },
  { countryCode: 'HK', countryName: 'Hong Kong', tier: 'tier1', baseCpm: 3.60, multiplier: 1.1 },

  // Tier 2 - Mid-value markets (Eastern Europe, Asia, Middle East)
  { countryCode: 'JP', countryName: 'Japan', tier: 'tier2', baseCpm: 2.80, multiplier: 1.0 },
  { countryCode: 'KR', countryName: 'South Korea', tier: 'tier2', baseCpm: 2.50, multiplier: 1.0 },
  { countryCode: 'TW', countryName: 'Taiwan', tier: 'tier2', baseCpm: 2.20, multiplier: 1.0 },
  { countryCode: 'IT', countryName: 'Italy', tier: 'tier2', baseCpm: 2.40, multiplier: 1.0 },
  { countryCode: 'ES', countryName: 'Spain', tier: 'tier2', baseCpm: 2.30, multiplier: 1.0 },
  { countryCode: 'BE', countryName: 'Belgium', tier: 'tier2', baseCpm: 2.20, multiplier: 1.0 },
  { countryCode: 'FI', countryName: 'Finland', tier: 'tier2', baseCpm: 2.10, multiplier: 1.0 },
  { countryCode: 'GR', countryName: 'Greece', tier: 'tier2', baseCpm: 1.80, multiplier: 1.0 },
  { countryCode: 'PT', countryName: 'Portugal', tier: 'tier2', baseCpm: 1.70, multiplier: 1.0 },
  { countryCode: 'CZ', countryName: 'Czech Republic', tier: 'tier2', baseCpm: 1.60, multiplier: 1.0 },
  { countryCode: 'PL', countryName: 'Poland', tier: 'tier2', baseCpm: 1.50, multiplier: 1.0 },
  { countryCode: 'HU', countryName: 'Hungary', tier: 'tier2', baseCpm: 1.40, multiplier: 1.0 },
  { countryCode: 'RO', countryName: 'Romania', tier: 'tier2', baseCpm: 1.30, multiplier: 1.0 },
  { countryCode: 'IL', countryName: 'Israel', tier: 'tier2', baseCpm: 2.60, multiplier: 1.0 },
  { countryCode: 'AE', countryName: 'United Arab Emirates', tier: 'tier2', baseCpm: 2.40, multiplier: 1.0 },
  { countryCode: 'SA', countryName: 'Saudi Arabia', tier: 'tier2', baseCpm: 2.20, multiplier: 1.0 },
  { countryCode: 'QA', countryName: 'Qatar', tier: 'tier2', baseCpm: 2.10, multiplier: 1.0 },
  { countryCode: 'KW', countryName: 'Kuwait', tier: 'tier2', baseCpm: 2.00, multiplier: 1.0 },
  { countryCode: 'RU', countryName: 'Russia', tier: 'tier2', baseCpm: 1.40, multiplier: 1.0 },
  { countryCode: 'UA', countryName: 'Ukraine', tier: 'tier2', baseCpm: 1.20, multiplier: 1.0 },
  { countryCode: 'MY', countryName: 'Malaysia', tier: 'tier2', baseCpm: 1.80, multiplier: 1.0 },
  { countryCode: 'TH', countryName: 'Thailand', tier: 'tier2', baseCpm: 1.60, multiplier: 1.0 },
  { countryCode: 'VN', countryName: 'Vietnam', tier: 'tier2', baseCpm: 1.40, multiplier: 1.0 },
  { countryCode: 'ID', countryName: 'Indonesia', tier: 'tier2', baseCpm: 1.30, multiplier: 1.0 },
  { countryCode: 'PH', countryName: 'Philippines', tier: 'tier2', baseCpm: 1.20, multiplier: 1.0 },
  { countryCode: 'ZA', countryName: 'South Africa', tier: 'tier2', baseCpm: 1.80, multiplier: 1.0 },
  { countryCode: 'BR', countryName: 'Brazil', tier: 'tier2', baseCpm: 1.90, multiplier: 1.0 },
  { countryCode: 'MX', countryName: 'Mexico', tier: 'tier2', baseCpm: 1.70, multiplier: 1.0 },
  { countryCode: 'AR', countryName: 'Argentina', tier: 'tier2', baseCpm: 1.50, multiplier: 1.0 },
  { countryCode: 'CL', countryName: 'Chile', tier: 'tier2', baseCpm: 1.40, multiplier: 1.0 },
  { countryCode: 'CO', countryName: 'Colombia', tier: 'tier2', baseCpm: 1.30, multiplier: 1.0 },

  // Tier 3 - Emerging markets (South Asia, Africa, Latin America)
  { countryCode: 'IN', countryName: 'India', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'PK', countryName: 'Pakistan', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'BD', countryName: 'Bangladesh', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'LK', countryName: 'Sri Lanka', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'NP', countryName: 'Nepal', tier: 'tier3', baseCpm: 0.55, multiplier: 0.9 },
  { countryCode: 'NG', countryName: 'Nigeria', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'KE', countryName: 'Kenya', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'EG', countryName: 'Egypt', tier: 'tier3', baseCpm: 0.95, multiplier: 0.9 },
  { countryCode: 'NG', countryName: 'Nigeria', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'ZA', countryName: 'South Africa', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'PE', countryName: 'Peru', tier: 'tier3', baseCpm: 1.20, multiplier: 0.9 },
  { countryCode: 'VE', countryName: 'Venezuela', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'EC', countryName: 'Ecuador', tier: 'tier3', baseCpm: 1.00, multiplier: 0.9 },
  { countryCode: 'BO', countryName: 'Bolivia', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'PY', countryName: 'Paraguay', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'UY', countryName: 'Uruguay', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'CU', countryName: 'Cuba', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'DO', countryName: 'Dominican Republic', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'GT', countryName: 'Guatemala', tier: 'tier3', baseCpm: 0.95, multiplier: 0.9 },
  { countryCode: 'HN', countryName: 'Honduras', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'SV', countryName: 'El Salvador', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'NI', countryName: 'Nicaragua', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'CR', countryName: 'Costa Rica', tier: 'tier3', baseCpm: 1.00, multiplier: 0.9 },
  { countryCode: 'PA', countryName: 'Panama', tier: 'tier3', baseCpm: 1.05, multiplier: 0.9 },
  { countryCode: 'JM', countryName: 'Jamaica', tier: 'tier3', baseCpm: 1.15, multiplier: 0.9 },
  { countryCode: 'TT', countryName: 'Trinidad and Tobago', tier: 'tier3', baseCpm: 1.20, multiplier: 0.9 },
  { countryCode: 'BB', countryName: 'Barbados', tier: 'tier3', baseCpm: 1.25, multiplier: 0.9 },
  { countryCode: 'BA', countryName: 'Bosnia and Herzegovina', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'RS', countryName: 'Serbia', tier: 'tier3', baseCpm: 1.05, multiplier: 0.9 },
  { countryCode: 'HR', countryName: 'Croatia', tier: 'tier3', baseCpm: 1.20, multiplier: 0.9 },
  { countryCode: 'SI', countryName: 'Slovenia', tier: 'tier3', baseCpm: 1.30, multiplier: 0.9 },
  { countryCode: 'SK', countryName: 'Slovakia', tier: 'tier3', baseCpm: 1.25, multiplier: 0.9 },
  { countryCode: 'BG', countryName: 'Bulgaria', tier: 'tier3', baseCpm: 1.15, multiplier: 0.9 },
  { countryCode: 'AL', countryName: 'Albania', tier: 'tier3', baseCpm: 0.95, multiplier: 0.9 },
  { countryCode: 'MK', countryName: 'North Macedonia', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'ME', countryName: 'Montenegro', tier: 'tier3', baseCpm: 0.95, multiplier: 0.9 },
  { countryCode: 'XK', countryName: 'Kosovo', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'BY', countryName: 'Belarus', tier: 'tier3', baseCpm: 1.00, multiplier: 0.9 },
  { countryCode: 'KZ', countryName: 'Kazakhstan', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'UZ', countryName: 'Uzbekistan', tier: 'tier3', baseCpm: 0.95, multiplier: 0.9 },
  { countryCode: 'KG', countryName: 'Kyrgyzstan', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'TJ', countryName: 'Tajikistan', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'TM', countryName: 'Turkmenistan', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'AZ', countryName: 'Azerbaijan', tier: 'tier3', baseCpm: 1.05, multiplier: 0.9 },
  { countryCode: 'GE', countryName: 'Georgia', tier: 'tier3', baseCpm: 1.00, multiplier: 0.9 },
  { countryCode: 'AM', countryName: 'Armenia', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'MN', countryName: 'Mongolia', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'MM', countryName: 'Myanmar', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'KH', countryName: 'Cambodia', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'LA', countryName: 'Laos', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'BT', countryName: 'Bhutan', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'MV', countryName: 'Maldives', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'FJ', countryName: 'Fiji', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'PG', countryName: 'Papua New Guinea', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'GH', countryName: 'Ghana', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'ET', countryName: 'Ethiopia', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'TZ', countryName: 'Tanzania', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'UG', countryName: 'Uganda', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'ZW', countryName: 'Zimbabwe', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'ZM', countryName: 'Zambia', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'MW', countryName: 'Malawi', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'MO', countryName: 'Mozambique', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'AO', countryName: 'Angola', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'CD', countryName: 'Democratic Republic of Congo', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'CI', countryName: 'Ivory Coast', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'SN', countryName: 'Senegal', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'ML', countryName: 'Mali', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'BF', countryName: 'Burkina Faso', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'NE', countryName: 'Niger', tier: 'tier3', baseCpm: 0.55, multiplier: 0.9 },
  { countryCode: 'TD', countryName: 'Chad', tier: 'tier3', baseCpm: 0.55, multiplier: 0.9 },
  { countryCode: 'CM', countryName: 'Cameroon', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'GA', countryName: 'Gabon', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'CG', countryName: 'Republic of Congo', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'CF', countryName: 'Central African Republic', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'LR', countryName: 'Liberia', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'SL', countryName: 'Sierra Leone', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'GN', countryName: 'Guinea', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'GW', countryName: 'Guinea-Bissau', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'ST', countryName: 'São Tomé and Príncipe', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'CV', countryName: 'Cape Verde', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'GM', countryName: 'Gambia', tier: 'tier3', baseCpm: 0.65, multiplier: 0.9 },
  { countryCode: 'MR', countryName: 'Mauritania', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'DZ', countryName: 'Algeria', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'TN', countryName: 'Tunisia', tier: 'tier3', baseCpm: 1.00, multiplier: 0.9 },
  { countryCode: 'LY', countryName: 'Libya', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'MA', countryName: 'Morocco', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'SD', countryName: 'Sudan', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'SS', countryName: 'South Sudan', tier: 'tier3', baseCpm: 0.60, multiplier: 0.9 },
  { countryCode: 'ER', countryName: 'Eritrea', tier: 'tier3', baseCpm: 0.55, multiplier: 0.9 },
  { countryCode: 'DJ', countryName: 'Djibouti', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
  { countryCode: 'SO', countryName: 'Somalia', tier: 'tier3', baseCpm: 0.55, multiplier: 0.9 },
  { countryCode: 'YE', countryName: 'Yemen', tier: 'tier3', baseCpm: 0.75, multiplier: 0.9 },
  { countryCode: 'OM', countryName: 'Oman', tier: 'tier3', baseCpm: 1.10, multiplier: 0.9 },
  { countryCode: 'BH', countryName: 'Bahrain', tier: 'tier3', baseCpm: 1.15, multiplier: 0.9 },
  { countryCode: 'LB', countryName: 'Lebanon', tier: 'tier3', baseCpm: 1.00, multiplier: 0.9 },
  { countryCode: 'JO', countryName: 'Jordan', tier: 'tier3', baseCpm: 1.05, multiplier: 0.9 },
  { countryCode: 'SY', countryName: 'Syria', tier: 'tier3', baseCpm: 0.80, multiplier: 0.9 },
  { countryCode: 'IQ', countryName: 'Iraq', tier: 'tier3', baseCpm: 0.90, multiplier: 0.9 },
  { countryCode: 'IR', countryName: 'Iran', tier: 'tier3', baseCpm: 0.85, multiplier: 0.9 },
  { countryCode: 'AF', countryName: 'Afghanistan', tier: 'tier3', baseCpm: 0.55, multiplier: 0.9 },
  { countryCode: 'PK', countryName: 'Pakistan', tier: 'tier3', baseCpm: 0.70, multiplier: 0.9 },
];

// Default CPM for unknown countries
export const DEFAULT_CPM_RATE: CountryCpmRate = {
  countryCode: 'XX',
  countryName: 'Unknown',
  tier: 'default',
  baseCpm: 0.50,
  multiplier: 1.0,
};

/**
 * Category-based CPM multiplier matrix
 * Higher-value niches (Tech, Business, Finance) receive higher multipliers
 * Entertainment categories receive lower multipliers due to higher supply
 * 
 * Category tiers:
 * - Premium: 1.5x - High commercial intent, B2B, finance, tech
 * - High: 1.3x - Education, professional content
 * - Standard: 1.0x - General content, baseline
 * - Low: 0.8x - Entertainment, gaming, casual content
 * - Default: 1.0x - Uncategorized or unknown
 */

export interface CategoryCpmMultiplier {
  category: string;
  multiplier: number;
  tier: CategoryTier;
  description: string;
}

export const CATEGORY_CPM_MULTIPLIERS: CategoryCpmMultiplier[] = [
  // Premium tier (1.5x) - High commercial intent, B2B, finance, tech
  { category: 'Science & Technology', multiplier: 1.5, tier: 'premium', description: 'Tech tutorials, software reviews, programming' },
  { category: 'Tech', multiplier: 1.5, tier: 'premium', description: 'Technology content, coding, hardware' },
  { category: 'Business', multiplier: 1.5, tier: 'premium', description: 'Business advice, entrepreneurship, finance' },
  { category: 'Finance', multiplier: 1.5, tier: 'premium', description: 'Financial education, investing, crypto' },
  { category: 'Marketing', multiplier: 1.5, tier: 'premium', description: 'Digital marketing, SEO, advertising' },
  { category: 'Howto & Style', multiplier: 1.4, tier: 'premium', description: 'DIY, tutorials, professional guides' },

  // High tier (1.3x) - Education, professional content
  { category: 'Education', multiplier: 1.3, tier: 'high', description: 'Educational content, courses, learning' },
  { category: 'News & Politics', multiplier: 1.3, tier: 'high', description: 'News, current events, political commentary' },
  { category: 'Health & Fitness', multiplier: 1.3, tier: 'high', description: 'Health tips, fitness, wellness' },
  { category: 'Sports', multiplier: 1.2, tier: 'high', description: 'Sports content, athletics, training' },

  // Standard tier (1.0x) - General content, baseline
  { category: 'Vlogs', multiplier: 1.0, tier: 'standard', description: 'Personal vlogs, lifestyle content' },
  { category: 'Travel', multiplier: 1.0, tier: 'standard', description: 'Travel vlogs, tourism content' },
  { category: 'Food', multiplier: 1.0, tier: 'standard', description: 'Cooking, food reviews, recipes' },
  { category: 'Cooking', multiplier: 1.0, tier: 'standard', description: 'Cooking tutorials, recipes' },
  { category: 'Autos & Vehicles', multiplier: 1.0, tier: 'standard', description: 'Car reviews, automotive content' },
  { category: 'Pets & Animals', multiplier: 1.0, tier: 'standard', description: 'Pet content, animal videos' },

  // Low tier (0.8x) - Entertainment, gaming, casual content
  { category: 'Entertainment', multiplier: 0.8, tier: 'low', description: 'Entertainment, variety content' },
  { category: 'Gaming', multiplier: 0.8, tier: 'low', description: 'Gaming content, gameplay, streams' },
  { category: 'Comedy', multiplier: 0.8, tier: 'low', description: 'Comedy sketches, funny videos' },
  { category: 'Music', multiplier: 0.8, tier: 'low', description: 'Music videos, covers, performances' },
  { category: 'Film & Animation', multiplier: 0.8, tier: 'low', description: 'Animation, short films, cinema' },
  { category: 'People & Blogs', multiplier: 0.9, tier: 'low', description: 'Personal blogs, casual content' },

  // Default tier (1.0x) - Uncategorized
  { category: 'default', multiplier: 1.0, tier: 'default', description: 'Default for uncategorized content' },
  { category: 'other', multiplier: 1.0, tier: 'default', description: 'Other categories not listed' },
];

/**
 * Get CPM multiplier for a specific video category
 * @param category - Video category string
 * @returns CategoryCpmMultiplier object or default if not found
 */
export function getCategoryMultiplier(category: string): CategoryCpmMultiplier {
  const normalizedCategory = category?.toLowerCase().trim() || 'default';
  
  // Try exact match first
  const exactMatch = CATEGORY_CPM_MULTIPLIERS.find(
    (cm) => cm.category.toLowerCase() === normalizedCategory
  );
  
  if (exactMatch) return exactMatch;
  
  // Try partial match for subcategories
  const partialMatch = CATEGORY_CPM_MULTIPLIERS.find(
    (cm) => normalizedCategory.includes(cm.category.toLowerCase()) || 
            cm.category.toLowerCase().includes(normalizedCategory)
  );
  
  return partialMatch || CATEGORY_CPM_MULTIPLIERS.find(cm => cm.category === 'default')!;
}

/**
 * Get CPM rate for a specific country code
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns CountryCpmRate object or default if not found
 */
export function getCpmRateForCountry(countryCode: string): CountryCpmRate {
  const normalizedCode = countryCode.toUpperCase().trim();
  const countryRate = COUNTRY_CPM_RATES.find(
    (rate) => rate.countryCode === normalizedCode
  );
  return countryRate || DEFAULT_CPM_RATE;
}

/**
 * Calculate effective CPM for a country considering placement and category multipliers
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param placementMultiplier - Optional custom multiplier (e.g., for premium placements)
 * @param category - Optional video category for category-based CPM adjustment
 * @returns Effective CPM in USD per 1000 impressions
 */
export function calculateEffectiveCpm(
  countryCode: string,
  placementMultiplier: number = 1.0,
  category?: string
): number {
  const rate = getCpmRateForCountry(countryCode);
  const categoryMultiplier = category ? getCategoryMultiplier(category).multiplier : 1.0;
  const effectiveMultiplier = rate.multiplier * placementMultiplier * categoryMultiplier;
  return +(rate.baseCpm * effectiveMultiplier).toFixed(4);
}

/**
 * Get tier information for a country
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Tier name and description
 */
export function getCountryTierInfo(countryCode: string): {
  tier: CountryTier;
  description: string;
} {
  const rate = getCpmRateForCountry(countryCode);
  
  const tierDescriptions: Record<CountryTier, string> = {
    tier1: 'Premium Market - High CPM',
    tier2: 'Mid-Value Market - Medium CPM',
    tier3: 'Emerging Market - Low CPM',
    default: 'Unknown - Default CPM',
  };
  
  return {
    tier: rate.tier,
    description: tierDescriptions[rate.tier],
  };
}

/**
 * Get all countries in a specific tier
 * @param tier - Country tier to filter by
 * @returns Array of country codes and names in the tier
 */
export function getCountriesByTier(tier: CountryTier): Array<{
  countryCode: string;
  countryName: string;
}> {
  return COUNTRY_CPM_RATES
    .filter((rate) => rate.tier === tier)
    .map((rate) => ({
      countryCode: rate.countryCode,
      countryName: rate.countryName,
    }));
}

/**
 * Calculate expected revenue for a given number of views from a specific country
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param viewsCount - Number of views/impressions
 * @param placementMultiplier - Optional custom multiplier
 * @param category - Optional video category for category-based CPM adjustment
 * @returns Revenue breakdown object
 */
export function calculateRevenueByCountry(
  countryCode: string,
  viewsCount: number,
  placementMultiplier: number = 1.0,
  category?: string
): {
  countryCode: string;
  countryName: string;
  viewsCount: number;
  effectiveCpm: number;
  grossRevenue: number;
  creatorShare: number;
  platformShare: number;
  tier: CountryTier;
  category?: string;
  categoryMultiplier?: number;
} {
  const rate = getCpmRateForCountry(countryCode);
  const categoryMultiplier = category ? getCategoryMultiplier(category) : null;
  const effectiveCpm = calculateEffectiveCpm(countryCode, placementMultiplier, category);
  const grossRevenue = (viewsCount / 1000) * effectiveCpm;
  
  // Using the existing 55/45 split from adSdk.ts
  const CREATOR_SHARE_PCT = 55;
  const PLATFORM_SHARE_PCT = 45;
  
  return {
    countryCode: rate.countryCode,
    countryName: rate.countryName,
    viewsCount,
    effectiveCpm,
    grossRevenue: +grossRevenue.toFixed(6),
    creatorShare: +(grossRevenue * (CREATOR_SHARE_PCT / 100)).toFixed(6),
    platformShare: +(grossRevenue * (PLATFORM_SHARE_PCT / 100)).toFixed(6),
    tier: rate.tier,
    category,
    categoryMultiplier: categoryMultiplier?.multiplier,
  };
}