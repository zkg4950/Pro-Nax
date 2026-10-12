# Geolocation-Based CPM Rate Implementation

## Overview
This implementation adds dynamic CPM rate calculation based on viewer geolocation to the ProNax ad revenue system. The system now calculates ad revenue using country-specific CPM rates organized by economic tiers, replacing the previous global CPM approach.

## Changes Made

### 1. IP Geolocation Integration
**File:** `src/analyticsTracker.ts`
- Replaced mocked `getCountryFromIP()` function with real IP geolocation using free APIs
- Implemented fallback chain: ipapi.co → ip-api.com → ipify.org
- Added 5-second timeout for API calls
- Returns country code and name for revenue calculation

### 2. Country CPM Rate Matrix
**File:** `src/lib/countryCpmRates.ts` (NEW)
- Created comprehensive country-based CPM rate matrix with 100+ countries
- Organized countries into economic tiers:
  - **Tier 1 (Premium):** US, UK, CA, AU, DE, FR, etc. - $4.00+ CPM
  - **Tier 2 (Mid-Value):** JP, KR, IT, ES, BR, MX, etc. - $1.50+ CPM
  - **Tier 3 (Emerging):** IN, PK, PH, NG, etc. - $0.80+ CPM
  - **Default:** Unknown countries - $0.50 CPM
- Implemented country-specific multipliers for premium placements
- Added utility functions for CPM calculation and revenue estimation

### 3. Enhanced Ad SDK
**File:** `src/lib/adSdk.ts`
- Updated `requestAdImpression()` to accept geolocation parameters
- Added automatic IP lookup when country code not provided
- Integrated country-specific CPM calculation
- Enhanced `AdImpressionResult` interface with geolocation fields:
  - `countryCode`, `countryName`, `countryTier`
  - `baseCpm`, `countryMultiplier`
- Added `calculatePayoutForViewsByCountry()` function for country-specific revenue calculation

### 4. Database Schema Updates
**File:** `db/functions_admin.sql`
- Updated `record_ad_view()` function to accept geolocation parameters:
  - `p_country_code`, `p_country_name`, `p_country_tier`
- Enhanced revenue logging to include country information
- Updated admin actions logging with geolocation data

**File:** `supabase/migrations/20260909000000_add_geolocation_to_revenue_logs.sql` (NEW)
- Added geolocation fields to `revenue_logs` table:
  - `country_code`, `country_name`, `country_tier`
  - `base_cpm`, `country_multiplier`
- Created indexes on country fields for analytics queries
- Added comments documenting new fields
- Backfilled existing records with default values

**File:** `src/integrations/supabase/types.ts`
- Updated TypeScript types for `revenue_logs` to include new geolocation fields

### 5. Frontend Integration
**File:** `src/hooks/useImaAds.ts`
- Updated `creditAdView()` to pass geolocation data to backend
- Enhanced ad impression tracking with country information

**File:** `src/features/pages/Watch.tsx`
- Updated ad view recording to include geolocation parameters
- Enhanced toast notifications to show country information

**File:** `src/Watch.tsx`
- Mirrored changes from Watch.tsx for consistency

### 6. Admin Interface
**File:** `src/components/admin/tabs/CountryCpmTab.tsx` (NEW)
- Created comprehensive admin interface for managing country CPM rates
- Features:
  - Country CPM rate table with search and tier filtering
  - Revenue calculator with country selection
  - Analytics dashboard showing tier statistics
  - Real-time revenue estimation

### 7. Helper Utilities
**File:** `src/lib/geolocationHelper.ts` (NEW)
- Geolocation data caching to reduce API calls
- Helper functions for CPM rate calculation
- Currency formatting utilities
- Country flag emoji generation
- Country code validation and normalization
- UI helper functions for tier colors and labels

## How It Works

### Revenue Calculation Flow

1. **Ad Impression Triggered**
   - User watches video with ad
   - Ad event fires (`onAdStarted`)

2. **Geolocation Lookup**
   - System calls `getCountryFromIP()` 
   - Attempts IP geolocation via API chain
   - Returns country code (e.g., "US") and name

3. **CPM Rate Selection**
   - System looks up country in CPM rate matrix
   - Retrieves base CPM (e.g., $4.50 for US)
   - Applies country multiplier (e.g., 1.2x for premium placement)
   - Calculates effective CPM: $4.50 × 1.2 = $5.40

4. **Revenue Calculation**
   - Single impression revenue: $5.40 / 1000 = $0.0054
   - Apply 55/45 split:
     - Creator: $0.0054 × 0.55 = $0.00297
     - Platform: $0.0054 × 0.45 = $0.00243

5. **Database Recording**
   - Calls `record_ad_view()` with all parameters
   - Credits creator wallet
   - Logs to `revenue_logs` with geolocation data
   - Records admin action for audit trail

### Example Scenarios

**US Viewer (Tier 1):**
- Country: US
- Base CPM: $4.50
- Multiplier: 1.2x
- Effective CPM: $5.40
- Per impression: $0.0054
- Creator earns: $0.00297 per view

**India Viewer (Tier 3):**
- Country: IN
- Base CPM: $0.80
- Multiplier: 0.9x
- Effective CPM: $0.72
- Per impression: $0.00072
- Creator earns: $0.00040 per view

**Unknown Location:**
- Country: Unknown
- Base CPM: $0.50
- Multiplier: 1.0x
- Effective CPM: $0.50
- Per impression: $0.0005
- Creator earns: $0.00028 per view

## Database Migration

To apply the database changes:

```bash
# Apply the migration to add geolocation fields
supabase migration up

# Or manually run the SQL
psql -U postgres -d pronax -f supabase/migrations/20260909000000_add_geolocation_to_revenue_logs.sql
```

## API Changes

### Updated Function Signature
```sql
-- Old signature
record_ad_view(p_video_id uuid, p_ad_network text, p_ad_revenue numeric, p_cpm numeric)

-- New signature  
record_ad_view(
  p_video_id uuid, 
  p_ad_network text, 
  p_ad_revenue numeric, 
  p_cpm numeric,
  p_country_code text,
  p_country_name text, 
  p_country_tier text
)
```

### TypeScript Interface Changes
```typescript
// Enhanced AdImpressionResult
interface AdImpressionResult {
  // ... existing fields
  countryCode?: string;
  countryName?: string;
  countryTier?: string;
  baseCpm?: number;
  countryMultiplier?: number;
}
```

## Testing

### Manual Testing Steps

1. **Test Geolocation Lookup**
```typescript
import { getCountryFromIP } from '@/analyticsTracker';

const geoData = await getCountryFromIP();
console.log('Country:', geoData); // Should return actual country data
```

2. **Test CPM Calculation**
```typescript
import { getCpmRateForCountry, calculateEffectiveCpm } from '@/lib/countryCpmRates';

const usRate = getCpmRateForCountry('US');
console.log('US Base CPM:', usRate.baseCpm); // Should be 4.50

const effectiveCpm = calculateEffectiveCpm('US');
console.log('US Effective CPM:', effectiveCpm); // Should be 5.40 (with 1.2x multiplier)
```

3. **Test Revenue Calculation**
```typescript
import { calculateRevenueByCountry } from '@/lib/countryCpmRates';

const revenue = calculateRevenueByCountry('US', 1000);
console.log('Revenue for 1000 US views:', revenue);
// Should show creator share of ~$2.97
```

4. **Test Database Recording**
```typescript
const result = await supabase.rpc('record_ad_view', {
  p_video_id: videoId,
  p_ad_revenue: 0.0054,
  p_ad_network: 'google_ima',
  p_cpm: 5.40,
  p_country_code: 'US',
  p_country_name: 'United States',
  p_country_tier: 'tier1'
});
```

## Performance Considerations

### API Rate Limits
- Free geolocation APIs have rate limits (typically 1,000-10,000 requests/month)
- Implemented 30-minute caching to reduce API calls
- Consider upgrading to paid plans for high-traffic sites

### Database Performance
- Added indexes on `country_code` and `country_tier` for fast analytics queries
- Geolocation fields are nullable to maintain backward compatibility
- Minimal performance impact on existing queries

### Caching Strategy
- Geolocation data cached for 30 minutes per user session
- Reduces API calls and improves response times
- Cache can be cleared manually if needed

## Future Enhancements

### Potential Improvements
1. **Real-time CPM Bidding:** Integrate with real-time ad networks for dynamic CPM
2. **Advanced Analytics:** Geographic heatmaps and revenue distribution charts
3. **A/B Testing:** Test different CPM rates by region
4. **Premium Tiers:** Add ultra-premium tier for specific high-value demographics
5. **Time-based Rates:** Adjust CPM based on time of day in viewer's timezone

### Monitoring
- Track API success/failure rates for geolocation
- Monitor revenue distribution by country tier
- Alert on unusual geographic patterns (potential fraud)

## Rollback Plan

If issues arise, the system can be rolled back:

1. **Database:** Revert migration to remove geolocation fields
2. **Code:** Revert to previous `adSdk.ts` without geolocation logic
3. **API:** Use old `record_ad_view()` function signature
4. **Fallback:** System gracefully handles missing geolocation data

## Configuration

### Environment Variables (Optional)
```env
# Custom geolocation API endpoint (optional)
GEOLOCATION_API_URL=https://your-custom-api.com/geo

# API timeout in milliseconds (default: 5000)
GEOLOCATION_TIMEOUT=5000

# Cache duration in milliseconds (default: 1800000)
GEOLOCATION_CACHE_TTL=1800000
```

## Support

For issues or questions:
1. Check admin logs for geolocation API failures
2. Review `revenue_logs` for country data accuracy
3. Test geolocation lookup directly in browser console
4. Verify database migration was applied successfully

## Summary

This implementation successfully adds geolocation-based dynamic CPM rates to the ProNax platform, enabling more accurate and profitable ad revenue calculation based on viewer location. The system maintains backward compatibility while providing significant enhancements for revenue optimization and geographic analytics.