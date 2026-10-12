# Category-Based CPM Multiplier Implementation

## Overview

This document describes the implementation of category-based CPM (Cost Per Mille) multipliers for the ProNax video monetization system. This feature allows different video categories to generate different ad revenue rates based on their commercial value and market demand.

**IMPORTANT UPDATE (2026-09-10):** Category multipliers are now **INFORMATIONAL ONLY** and do NOT affect final payout when actual revenue is provided by the ad network. This prevents keyword spam manipulation. See [FRAUD_PROOF_ADVERTISER_DRIVEN_REVENUE.md](./FRAUD_PROOF_ADVERTISER_DRIVEN_REVENUE.md) for details on the fraud-proof advertiser-driven revenue model.

### Current Behavior (Fraud-Proof Model)

**When actual revenue is provided by ad network:**
- Category multipliers are **IGNORED** for payout calculation
- Actual revenue from ad network is the single source of truth
- Category metadata is stored in `revenue_logs` for analytics only
- This prevents creators from manipulating revenue by changing categories

**When no actual revenue is available (fallback):**
- Category multipliers are used in calculated CPM
- This is a fallback scenario only
- Logged as a warning in console
- Used only when ad network does not provide revenue data

**Purpose of Category Multipliers:**
- Analytics and reporting
- Understanding category performance trends
- Future optimization (if safe to re-enable)
- Admin dashboard insights

### Legacy Behavior (Before 2026-09-10)

The original implementation applied category multipliers to final payouts. This was changed to prevent fraud through keyword spam.

## Implementation Date

2026-09-09

## Motivation

Different video categories have different commercial value to advertisers:
- **High-value niches** (Tech, Business, Finance) command higher CPMs due to high commercial intent and B2B advertising demand
- **Entertainment categories** (Gaming, Music, Comedy) have lower CPMs due to higher content supply and lower commercial intent

By implementing category-based multipliers, ProNax can:
1. Better align revenue with actual market rates
2. Incentivize creators to produce high-value content
3. Provide fair compensation based on content category
4. Match industry standards for video monetization

## Category Tiers and Multipliers

### Premium Tier (1.5x Multiplier)
High commercial intent, B2B, finance, technology content
- **Science & Technology** - Tech tutorials, software reviews, programming
- **Tech** - Technology content, coding, hardware
- **Business** - Business advice, entrepreneurship, finance
- **Finance** - Financial education, investing, crypto
- **Marketing** - Digital marketing, SEO, advertising
- **Howto & Style** - DIY, tutorials, professional guides (1.4x)

### High Tier (1.3x Multiplier)
Educational and professional content
- **Education** - Educational content, courses, learning
- **News & Politics** - News, current events, political commentary
- **Health & Fitness** - Health tips, fitness, wellness
- **Sports** - Sports content, athletics, training (1.2x)

### Standard Tier (1.0x Multiplier)
General content, baseline CPM
- **Vlogs** - Personal vlogs, lifestyle content
- **Travel** - Travel vlogs, tourism content
- **Food/Cooking** - Cooking, food reviews, recipes
- **Autos & Vehicles** - Car reviews, automotive content
- **Pets & Animals** - Pet content, animal videos

### Low Tier (0.8x Multiplier)
Entertainment, gaming, casual content
- **Entertainment** - Entertainment, variety content
- **Gaming** - Gaming content, gameplay, streams
- **Comedy** - Comedy sketches, funny videos
- **Music** - Music videos, covers, performances
- **Film & Animation** - Animation, short films, cinema
- **People & Blogs** - Personal blogs, casual content (0.9x)

### Default Tier (1.0x Multiplier)
Uncategorized or unknown content
- **default** - Default for uncategorized content
- **other** - Other categories not listed

## Code Changes

### 1. Category CPM Matrix (`src/lib/countryCpmRates.ts`)

Added new types and data structures:

```typescript
export type CategoryTier = 'premium' | 'high' | 'standard' | 'low' | 'default';

export interface CategoryCpmMultiplier {
  category: string;
  multiplier: number;
  tier: CategoryTier;
  description: string;
}

export const CATEGORY_CPM_MULTIPLIERS: CategoryCpmMultiplier[] = [
  // Premium tier (1.5x)
  { category: 'Science & Technology', multiplier: 1.5, tier: 'premium', description: 'Tech tutorials, software reviews, programming' },
  // ... more categories
];
```

Added helper function:

```typescript
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
```

### 2. Updated CPM Calculation (`src/lib/countryCpmRates.ts`)

Modified `calculateEffectiveCpm` to accept category parameter:

```typescript
export function calculateEffectiveCpm(
  countryCode: string,
  placementMultiplier: number = 1.0,
  category?: string  // NEW: Optional category parameter
): number {
  const rate = getCpmRateForCountry(countryCode);
  const categoryMultiplier = category ? getCategoryMultiplier(category).multiplier : 1.0;
  const effectiveMultiplier = rate.multiplier * placementMultiplier * categoryMultiplier;
  return +(rate.baseCpm * effectiveMultiplier).toFixed(4);
}
```

### 3. Ad SDK Integration (`src/lib/adSdk.ts`)

Updated `AdImpressionResult` interface to include category fields:

```typescript
export interface AdImpressionResult {
  // ... existing fields
  category?: string;
  categoryMultiplier?: number;
  categoryTier?: string;
}
```

Updated `requestAdImpression` to accept and process category:

```typescript
export async function requestAdImpression(opts: {
  // ... existing params
  category?: string;  // NEW: Optional video category
}): Promise<AdImpressionResult> {
  // ... existing code
  
  // Get category multiplier if category is provided
  let categoryMultiplier: number | undefined;
  let categoryTier: string | undefined;
  if (opts.category) {
    const catMult = getCategoryMultiplier(opts.category);
    categoryMultiplier = catMult.multiplier;
    categoryTier = catMult.tier;
  }
  
  // ... CPM calculation now includes category multiplier
  
  return {
    // ... existing fields
    category: opts.category,
    categoryMultiplier,
    categoryTier,
  };
}
```

### 4. Database Migration (`supabase/migrations/20260909000000_add_geolocation_to_revenue_logs.sql`)

Added category columns to `revenue_logs` table:

```sql
ALTER TABLE public.revenue_logs
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS category_multiplier numeric(8,4),
ADD COLUMN IF NOT EXISTS category_tier text;
```

Added indexes for category-based analytics:

```sql
CREATE INDEX IF NOT EXISTS idx_revenue_logs_category ON public.revenue_logs(category);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_category_tier ON public.revenue_logs(category_tier);
```

Updated `record_ad_view_by_placement` function to accept and store category data:

```sql
CREATE OR REPLACE FUNCTION public.record_ad_view_by_placement(
  -- ... existing params
  p_category text default null,
  p_category_multiplier numeric default null,
  p_category_tier text default null
)
```

The function now:
1. Accepts category parameters
2. Falls back to video's category if not provided
3. Stores category metadata in `revenue_logs`
4. Includes category data in admin actions for audit trail

### 5. Type Definitions (`src/integrations/supabase/types.ts`)

Updated `revenue_logs` type to include category fields:

```typescript
revenue_logs: {
  Row: {
    // ... existing fields
    category: string | null
    category_multiplier: number | null
    category_tier: string | null
  }
  // ... Insert and Update types also updated
}
```

### 6. Watch Page Integration

Updated both `src/features/pages/Watch.tsx` and `src/Watch.tsx` to:
1. Fetch video category from database
2. Pass category to `requestAdImpression()`
3. Pass category metadata to `record_ad_view_by_placement()`

```typescript
// Fetch category
const { data: vrow } = await supabase
  .from('videos')
  .select('id,title,description,video_url,thumb_url,owner_id,created_at,views_count,duration_seconds,is_short,category')
  .eq('id', videoId as any)
  .maybeSingle();

// Pass to ad impression
const impression = await requestAdImpression({
  videoId,
  placementType: 'long_form',
  isShort: false,
  category: dbVideo?.category || undefined,
});

// Pass to database function
await supabase.rpc('record_ad_view_by_placement', {
  // ... existing params
  p_category: impression.category || null,
  p_category_multiplier: impression.categoryMultiplier || null,
  p_category_tier: impression.categoryTier || null,
});
```

## CPM Calculation Flow

### Fallback Flow (When No Actual Revenue from Ad Network)

The complete CPM calculation follows this sequence when no actual revenue is provided:

```
Base CPM (from country tier)
  × Country Multiplier (geo-based)
  × Placement Multiplier (1.0 for long-form, 0.6 for Shorts)
  × Category Multiplier (1.5x for Tech, 0.8x for Gaming, etc.)
  = Effective CPM (for fallback only)
```

### Actual Revenue Flow (Fraud-Proof - Primary)

When actual revenue is provided by the ad network:

```
Actual Revenue from Ad Network (IMA/VAST/Adsterra)
  → Used directly for payout
  → Category multipliers IGNORED
  → Country multipliers IGNORED
  → Database enforces 55/45 split internally
```

**This is the primary and recommended flow.**

### Example Calculations

**Example 1: Tech Tutorial in US (Long-form)**
- Base CPM: $4.50 (US tier1)
- Country Multiplier: 1.2
- Placement Multiplier: 1.0 (long-form)
- Category Multiplier: 1.5 (Science & Technology - premium)
- **Effective CPM: $4.50 × 1.2 × 1.0 × 1.5 = $8.10**

**Example 2: Gaming Video in India (Shorts)**
- Base CPM: $0.80 (IN tier3)
- Country Multiplier: 0.9
- Placement Multiplier: 0.6 (Shorts)
- Category Multiplier: 0.8 (Gaming - low)
- **Effective CPM: $0.80 × 0.9 × 0.6 × 0.8 = $0.35**

**Example 3: Business Video in UK (Long-form)**
- Base CPM: $4.20 (UK tier1)
- Country Multiplier: 1.15
- Placement Multiplier: 1.0 (long-form)
- Category Multiplier: 1.5 (Business - premium)
- **Effective CPM: $4.20 × 1.15 × 1.0 × 1.5 = $7.25**

## Revenue Split

The 55/45 creator/platform split is applied AFTER all multipliers:

```
Gross Revenue = (Effective CPM / 1000) per impression
Creator Share = Gross Revenue × 55%
Platform Share = Gross Revenue × 45%
```

**Example: Tech Tutorial in US**
- Effective CPM: $8.10
- Gross Revenue per 1,000 views: $8.10
- Creator Share: $8.10 × 0.55 = $4.46
- Platform Share: $8.10 × 0.45 = $3.64

## Database Storage

All category metadata is stored in `revenue_logs` for analytics and reporting:

- `category` - Video category name
- `category_multiplier` - Multiplier applied
- `category_tier` - Tier classification (premium/high/standard/low/default)

This enables:
- Category-based revenue analytics
- Performance comparison across categories
- Audit trail for CPM calculations
- Future optimization of category multipliers

## Admin Analytics

The admin dashboard can now show:
- Revenue breakdown by category
- CPM comparison across categories
- Top-performing categories by revenue
- Category-tier distribution

## Notes and Considerations

1. **Category Matching**: The system uses both exact and partial matching to handle subcategories and variations (e.g., "Tech & Web Development" matches "Tech")

2. **Fallback Behavior**: If a category is not recognized, it defaults to 1.0x multiplier (standard tier)

3. **Client-Side Calculation**: Category multipliers are applied client-side in the ad SDK. For production, consider server-side validation to prevent manipulation.

4. **Dynamic Updates**: Category multipliers can be updated by modifying `CATEGORY_CPM_MULTIPLIERS` in `countryCpmRates.ts` without database changes.

5. **Future Enhancements**:
   - Admin UI to adjust category multipliers dynamically
   - Historical CPM trends by category
   - Automatic multiplier optimization based on market data
   - Creator-level category specialization bonuses

## Migration Status

The database migration `20260909000000_add_geolocation_to_revenue_logs.sql` includes both geolocation and category fields. This migration must be applied to the live Supabase project for category-based CPM to function correctly.

## Testing Checklist

- [ ] Verify category lookup returns correct multiplier
- [ ] Test category fallback for unknown categories
- [ ] Verify CPM calculation includes category multiplier
- [ ] Test database function stores category metadata
- [ ] Verify admin analytics show category breakdown
- [ ] Test category integration in Watch page
- [ ] Verify Shorts still apply 0.6x multiplier after category
- [ ] Test combined country + category multipliers

## Related Documentation

- [Geolocation CPM Implementation](./GEOLOCATION_CPM_IMPLEMENTATION.md)
- [Ad SDK Documentation](./src/lib/adSdk.ts)
- [Country CPM Rates](./src/lib/countryCpmRates.ts)
