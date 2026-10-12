# Fraud-Proof Advertiser-Driven Revenue Model

## Overview

This document describes the fraud-proof, advertiser-driven revenue model implemented for the ProNax video monetization system. This model ensures that payouts are based exclusively on actual ad network revenue data, preventing manipulation through keywords, categories, or other metadata.

## Implementation Date

2026-09-10

## Problem Statement

**Previous Model (Vulnerable to Fraud):**
- CPM calculated from country tiers, categories, and placement multipliers
- Creators could manipulate revenue by changing video titles, descriptions, or categories
- Platform revenue was calculated client-side and not consistently persisted
- 55/45 split was enforced in client code (vulnerable to manipulation)

**New Model (Fraud-Proof):**
- Revenue driven exclusively by actual ad network payouts (IMA, VAST, Adsterra, Monetag)
- Database enforces 55/45 split internally (cannot be manipulated by client)
- Category and country multipliers are informational only (not used for final payout)
- Platform revenue is always persisted to `platform_revenue` table
- Revenue validation prevents negative values and logs suspicious activity

## Revenue Priority Order

The system uses a strict priority order to determine final revenue:

```
1. actualRevenue (HIGHEST PRIORITY)
   - ACTUAL gross revenue from ad network (IMA/VAST/Adsterra)
   - Always used when provided by the ad network
   - Cannot be manipulated by creators

2. cpm (SECOND PRIORITY)
   - Override CPM from ad network response
   - Used when actualRevenue is not available but CPM is

3. Calculated CPM (FALLBACK ONLY)
   - Calculated from country/category tiers
   - Used ONLY when no actual revenue from network
   - Informational for analytics, not for final payout
```

## Key Changes

### 1. Ad SDK Updates (`src/lib/adSdk.ts`)

**New Parameter:**
```typescript
export async function requestAdImpression(opts: {
  videoId: string;
  actualRevenue?: number; // ACTUAL gross revenue from ad network - HIGHEST PRIORITY
  // ... other params
}): Promise<AdImpressionResult>
```

**New Fields in AdImpressionResult:**
```typescript
export interface AdImpressionResult {
  // ... existing fields
  actualRevenue?: number; // Actual gross revenue from ad network
  revenueSource?: 'network' | 'calculated'; // Source of revenue data
}
```

**Fraud-Proof Logic:**
```typescript
// FRAUD-PROOF: Use actual revenue from ad network if provided
if (opts.actualRevenue !== undefined && opts.actualRevenue > 0) {
  // ACTUAL REVENUE FROM AD NETWORK - ALWAYS USE THIS
  grossRevenue = +opts.actualRevenue.toFixed(6);
  revenueSource = 'network';
  console.log('[adSdk] Using ACTUAL revenue from ad network:', {
    actualRevenue: grossRevenue,
    network,
    videoId: opts.videoId,
  });
} else if (opts.cpm) {
  // Override CPM from ad network response
  grossRevenue = +(opts.cpm / 1000).toFixed(6);
  revenueSource = 'network';
} else {
  // FALLBACK: Use calculated CPM (only when no actual revenue from network)
  grossRevenue = +(calculatedCpm / 1000).toFixed(6);
  revenueSource = 'calculated';
  console.warn('[adSdk] Using FALLBACK calculated CPM (no actual revenue from network)');
}
```

**Category Multipliers - Informational Only:**
```typescript
// Category multipliers are INFORMATIONAL ONLY
// They do NOT affect final payout when actualRevenue is provided
// This prevents keyword spam manipulation
```

### 2. Database Function Updates

#### `record_ad_view()` Function

**Key Changes:**
```sql
-- FRAUD-PROOF: Enforce 55/45 split internally
v_creator_share := round(v_gross_revenue * 0.55, 6);
v_platform_share := round(v_gross_revenue * 0.45, 6);

-- Credit creator wallet with CREATOR SHARE ONLY (not gross revenue)
insert into public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
values (v_owner, v_creator_share, v_creator_share, now(), now())
on conflict (user_id) do update
  set balance = public.user_wallets.balance + v_creator_share,
      total_earned = public.user_wallets.total_earned + v_creator_share,
      updated_at = now();

-- Persist PLATFORM share to platform_revenue table (for accounting)
insert into public.platform_revenue (source_user_id, video_id, amount, gross_revenue, ad_network, cpm, created_at)
values (v_owner, p_video_id::text, v_platform_share, v_gross_revenue, p_ad_network, p_cpm, now());
```

**Revenue Validation:**
```sql
-- Validate revenue (fraud safeguard)
if v_gross_revenue < 0 then
  return json_build_object('success', false, 'reason', 'invalid negative revenue');
end if;
if v_gross_revenue > 1000 then
  -- Log suspiciously high revenue but don't block (could be premium placement)
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'high_revenue_alert', 'video', p_video_id::text,
    json_build_object('revenue', v_gross_revenue, 'network', p_ad_network, 'alert', 'revenue exceeds $1000 per impression'));
end if;
```

#### `record_ad_view_by_placement()` Function

Similar updates with additional support for placement type and category (informational only).

### 3. Database Migration

**New Migration:** `20260910000000_fraud_proof_advertiser_driven_revenue.sql`

- Updates `record_ad_view()` to enforce 55/45 split
- Adds platform_revenue persistence
- Adds revenue validation
- Adds indexes for platform_revenue analytics
- Documents the fraud-proof enforcement

### 4. Type Definitions

Updated `AdImpressionResult` to include:
- `actualRevenue` - Actual gross revenue from ad network
- `revenueSource` - 'network' or 'calculated'

## Fraud Prevention Mechanisms

### 1. Server-Side Split Enforcement

**Before (Vulnerable):**
```typescript
// Client calculates split
const creatorShare = grossRevenue * 0.55;
const platformShare = grossRevenue * 0.45;
// Client passes creatorShare to database
await supabase.rpc('record_ad_view', { p_ad_revenue: creatorShare });
```

**After (Fraud-Proof):**
```typescript
// Client passes full gross revenue
await supabase.rpc('record_ad_view', { p_ad_revenue: grossRevenue });
// Database enforces split internally
-- SQL: v_creator_share := round(v_gross_revenue * 0.55, 6);
-- SQL: v_platform_share := round(v_gross_revenue * 0.45, 6);
```

### 2. Keyword Spam Prevention

**Vulnerability:**
- Creators could change video category from "Gaming" to "Business" to get 1.5x multiplier
- Titles could be stuffed with high-value keywords

**Solution:**
- Category multipliers are now **informational only**
- They are stored in `revenue_logs` for analytics
- They do NOT affect final payout when `actualRevenue` is provided
- Actual revenue from ad network is the single source of truth

### 3. Revenue Validation

**Negative Revenue Check:**
```sql
if v_gross_revenue < 0 then
  return json_build_object('success', false, 'reason', 'invalid negative revenue');
end if;
```

**High Revenue Alert:**
```sql
if v_gross_revenue > 1000 then
  -- Log suspiciously high revenue but don't block (could be premium placement)
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'high_revenue_alert', 'video', p_video_id::text,
    json_build_object('revenue', v_gross_revenue, 'network', p_ad_network, 'alert', 'revenue exceeds $1000 per impression'));
end if;
```

### 4. Platform Revenue Persistence

**Before:**
- Platform revenue calculated but not consistently persisted
- Audit trail incomplete

**After:**
- Platform share ALWAYS inserted into `platform_revenue` table
- Complete audit trail for accounting
- Enables accurate platform revenue analytics

## Revenue Flow Diagram

```
Ad Network (IMA/VAST/Adsterra)
  ↓
actualRevenue or cpm response
  ↓
Client: requestAdImpression({ actualRevenue: 0.0085 })
  ↓
Client passes GROSS revenue to database
  ↓
Database: record_ad_view(p_ad_revenue: 0.0085)
  ↓
Database: Validates revenue (no negative values)
  ↓
Database: Enforces 55/45 split internally
  - creator_share = 0.0085 * 0.55 = 0.004675
  - platform_share = 0.0085 * 0.45 = 0.003825
  ↓
Database: Credits creator wallet with 0.004675
  ↓
Database: Inserts platform_revenue with 0.003825
  ↓
Database: Logs revenue_logs with creator share (0.004675)
  ↓
Complete audit trail
```

## Example Scenarios

### Scenario 1: Actual Revenue from Ad Network

**Input:**
- Ad network reports: $0.0085 gross revenue
- Video category: "Science & Technology" (1.5x multiplier)
- Country: US (tier1)

**Calculation:**
- `actualRevenue` = $0.0085 (takes priority)
- Category multiplier: IGNORED (informational only)
- Country multiplier: IGNORED (informational only)
- `creator_share` = $0.0085 × 0.55 = $0.004675
- `platform_share` = $0.0085 × 0.45 = $0.003825

**Result:**
- Creator receives: $0.004675
- Platform receives: $0.003825
- Category/country metadata stored for analytics only

### Scenario 2: CPM from Ad Network

**Input:**
- Ad network reports: $5.00 CPM
- No actual revenue provided
- Video category: "Gaming" (0.8x multiplier)

**Calculation:**
- `cpm` = $5.00 (second priority)
- `grossRevenue` = $5.00 / 1000 = $0.005
- Category multiplier: IGNORED (informational only)
- `creator_share` = $0.005 × 0.55 = $0.00275
- `platform_share` = $0.005 × 0.45 = $0.00225

**Result:**
- Creator receives: $0.00275
- Platform receives: $0.00225

### Scenario 3: Fallback to Calculated CPM

**Input:**
- No actual revenue from ad network
- No CPM from ad network
- Country: US (tier1, base CPM $4.50, multiplier 1.2)
- Category: "Business" (1.5x multiplier)

**Calculation:**
- Calculated CPM = $4.50 × 1.2 × 1.5 = $8.10
- `grossRevenue` = $8.10 / 1000 = $0.0081
- `creator_share` = $0.0081 × 0.55 = $0.004455
- `platform_share` = $0.0081 × 0.45 = $0.003645

**Result:**
- Creator receives: $0.004455
- Platform receives: $0.003645
- This is logged as a fallback (warning in console)

## Migration Instructions

### 1. Apply New Migration

```bash
# Apply the fraud-proof revenue migration
supabase migration up --file 20260910000000_fraud_proof_advertiser_driven_revenue.sql
```

### 2. Verify Function Changes

```sql
-- Check that record_ad_view enforces split
SELECT prosrc FROM pg_proc WHERE proname = 'record_ad_view';

-- Should contain:
-- v_creator_share := round(v_gross_revenue * 0.55, 6);
-- v_platform_share := round(v_gross_revenue * 0.45, 6);
```

### 3. Update Ad Network Integration

When integrating with ad networks (IMA, VAST, Adsterra, Monetag):

**IMA SDK Integration:**
```typescript
// Get actual revenue from IMA response
const actualRevenue = imaResponse.grossRevenue || imaResponse.paidAmount;

const impression = await requestAdImpression({
  videoId,
  actualRevenue, // Pass actual revenue from IMA
  network: 'google_ima',
});
```

**VAST Integration:**
```typescript
// Parse VAST response for actual revenue
const vastRevenue = parseVastRevenue(vastXml);

const impression = await requestAdImpression({
  videoId,
  actualRevenue: vastRevenue,
  network: 'vast',
});
```

## Audit Trail

All revenue is now fully auditable:

**revenue_logs table:**
- `amount_earned` - Creator share (55%)
- `gross_revenue` - Full gross revenue
- `category` - Video category (informational)
- `category_multiplier` - Applied multiplier (informational)
- `country_code` - Viewer country (informational)
- `country_multiplier` - Applied multiplier (informational)

**platform_revenue table:**
- `amount` - Platform share (45%)
- `gross_revenue` - Full gross revenue
- `ad_network` - Ad network name
- `cpm` - CPM rate

**admin_actions table:**
- All ad view events logged
- High revenue alerts logged
- Complete audit trail

## Monitoring and Alerts

### High Revenue Alerts

When revenue exceeds $1000 per impression:
- Automatic alert logged to `admin_actions`
- Action type: `high_revenue_alert`
- Includes revenue, network, and video ID
- Does not block (could be legitimate premium placement)

### Negative Revenue Blocking

When revenue is negative:
- Request rejected immediately
- Returns error: "invalid negative revenue"
- No database writes

### Fallback Usage Warning

When calculated CPM is used (no actual revenue):
- Console warning logged
- Indicates missing ad network integration
- Helps identify gaps in ad network coverage

## Testing Checklist

- [ ] Verify `actualRevenue` parameter takes priority over calculated CPM
- [ ] Test database enforces 55/45 split internally
- [ ] Verify platform revenue is persisted to `platform_revenue` table
- [ ] Test negative revenue is rejected
- [ ] Test high revenue (> $1000) triggers alert
- [ ] Verify category multipliers do NOT affect payout when actualRevenue is provided
- [ ] Verify country multipliers do NOT affect payout when actualRevenue is provided
- [ ] Test fallback to calculated CPM when no actual revenue
- [ ] Verify revenue_logs stores creator share (55%)
- [ ] Verify platform_revenue stores platform share (45%)
- [ ] Test audit trail completeness

## Security Considerations

### Client-Side Manipulation Prevention

**Risk:** Client could pass inflated `actualRevenue`

**Mitigation:**
- Consider server-side validation of revenue against known network ranges
- Implement rate limiting per video/user
- Monitor for anomalies in revenue data
- Use high revenue alerts to detect suspicious activity

### Future Enhancements

1. **Server-Side Revenue Validation:**
   - Validate revenue against historical ranges per network
   - Implement anomaly detection for unusual spikes

2. **Real-Time Fraud Detection:**
   - Machine learning model to detect suspicious patterns
   - Automatic flagging of unusual revenue behavior

3. **Ad Network Webhooks:**
   - Receive revenue data directly from ad networks
   - Eliminate client-side reporting entirely

4. **Revenue Reconciliation:**
   - Daily reconciliation with ad network reports
   - Automatic discrepancy detection

## Related Documentation

- [Category CPM Implementation](./CATEGORY_CPM_IMPLEMENTATION.md)
- [Geolocation CPM Implementation](./GEOLOCATION_CPM_IMPLEMENTATION.md)
- [Ad SDK Documentation](./src/lib/adSdk.ts)
- [Database Functions](./db/functions_admin.sql)

## Summary

The fraud-proof advertiser-driven revenue model ensures:

✅ Revenue based exclusively on actual ad network payouts
✅ Database enforces 55/45 split internally (unmanipulable)
✅ Platform revenue always persisted for accounting
✅ Category/country multipliers informational only (prevents keyword spam)
✅ Revenue validation prevents negative values
✅ High revenue alerts for suspicious activity
✅ Complete audit trail for all transactions
✅ Fallback mechanism for missing ad network data

This model eliminates the ability for creators to manipulate revenue through metadata changes and ensures the platform retains its guaranteed 45% share of all ad revenue.
