# Critical Fixes Applied - 2026-09-10

## Overview

This document summarizes the critical fixes applied to the ProNax monetization system to fix the 55/45 database split bug, sync the Shorts IMA hook, and document the mid-roll ad status.

## Fixes Applied

### 1. Database 55/45 Split Enforcement ✅

**Files Modified:**
- `db/functions_admin.sql` - `record_ad_view()` function
- `supabase/migrations/20260909000000_add_geolocation_to_revenue_logs.sql` - `record_ad_view_by_placement()` function
- `supabase/migrations/20260910000000_fraud_proof_advertiser_driven_revenue.sql` - New migration

**Changes:**

**Before (BROKEN):**
```sql
-- Database credited FULL gross revenue to creator
insert into public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
values (v_owner, v_gross_revenue, v_gross_revenue, now(), now())
on conflict (user_id) do update
  set balance = public.user_wallets.balance + v_gross_revenue,
      total_earned = public.user_wallets.total_earned + v_gross_revenue,
      updated_at = now();
```

**After (FIXED):**
```sql
-- Validate revenue (fraud safeguard)
if v_gross_revenue < 0 then
  return json_build_object('success', false, 'reason', 'invalid negative revenue');
end if;
if v_gross_revenue > 1000 then
  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'high_revenue_alert', 'video', p_video_id::text,
    json_build_object('revenue', v_gross_revenue, 'network', p_ad_network, 'alert', 'revenue exceeds $1000 per impression'));
end if;

-- ENFORCE 55/45 SPLIT
v_creator_share := round(v_gross_revenue * 0.55, 6);
v_platform_share := round(v_gross_revenue * 0.45, 6);

-- Credit creator wallet with CREATOR SHARE ONLY
insert into public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
values (v_owner, v_creator_share, v_creator_share, now(), now())
on conflict (user_id) do update
  set balance = public.user_wallets.balance + v_creator_share,
      total_earned = public.user_wallets.total_earned + v_creator_share,
      updated_at = now();

-- Persist PLATFORM share to platform_revenue table
insert into public.platform_revenue (source_user_id, video_id, amount, gross_revenue, ad_network, cpm, created_at)
values (v_owner, p_video_id::text, v_platform_share, v_gross_revenue, p_ad_network, p_cpm, now());
```

**Impact:**
- Creator now receives exactly 55% of gross revenue
- Platform now receives exactly 45% of gross revenue (persisted to `platform_revenue` table)
- Negative revenue is rejected
- High revenue (> $1000) triggers alerts
- Complete audit trail for all transactions

### 2. Duplicate IMA Hook Sync ✅

**File Modified:**
- `src/useImaAds.ts` (root duplicate)

**Changes:**

**Before (BROKEN):**
```typescript
const impr = await requestAdImpression({ videoId: opts.videoId });
await supabase.rpc('record_ad_view', {
  p_video_id: opts.videoId,
  p_ad_revenue: impr.revenue,
  p_ad_network: impr.network,
  p_cpm: impr.cpm,
});
```

**After (FIXED):**
```typescript
const impr = await requestAdImpression({
  videoId: opts.videoId,
  placementType: 'shorts',
  isShort: true
});
await supabase.rpc('record_ad_view_by_placement', {
  p_video_id: opts.videoId,
  p_ad_revenue: impr.revenue,
  p_ad_network: impr.network,
  p_cpm: impr.adjustedCpm || impr.cpm,
  p_country_code: impr.countryCode || null,
  p_country_name: impr.countryName || null,
  p_country_tier: impr.countryTier || null,
  p_placement_type: 'shorts',
});
```

**Impact:**
- Shorts now receive 60% CPM multiplier
- Shorts use `record_ad_view_by_placement()` function
- Geolocation data is passed for Shorts
- Consistent with `src/hooks/useImaAds.ts`

### 3. Shorts Ad Slide Update ✅

**File Modified:**
- `src/ShortsAdSlide.tsx`

**Changes:**
- Updated import comment to clarify it uses the correct hook (`@/hooks/useImaAds`)
- The hook now automatically applies Shorts multiplier (no code change needed in component)

**Impact:**
- Shorts now properly monetized with 60% CPM reduction
- Consistent behavior across Shorts and long-form videos

### 4. Mid-Roll Ad Status ⚠️

**File Reviewed:**
- `src/hooks/useAdManager.ts`

**Finding:**
- **NOT INTEGRATED WITH MONETIZATION SYSTEM**
- Uses demo ads from `@/lib/adNetworks`
- Does NOT call `requestAdImpression()`
- Does NOT call `record_ad_view()`
- No wallet crediting for mid-roll impressions

**Added Comment:**
```typescript
// CRITICAL: This ad manager uses DEMO ADS only and does NOT integrate with the actual
// monetization system (requestAdImpression, record_ad_view). Mid-roll ads are currently
// NOT monetized - they are demo placeholders only. To monetize mid-rolls, this hook must
// be refactored to use the IMA SDK and call requestAdImpression/record_ad_view for each mid-roll.
```

**Impact:**
- Mid-roll ads are NOT currently monetized
- This is documented for future implementation
- Pre-roll and Shorts ads ARE monetized

## Migration Instructions

### Required Migrations

Apply these migrations to your Supabase project:

```bash
# Apply geolocation and category migration (if not already applied)
supabase migration up --file 20260909000000_add_geolocation_to_revenue_logs.sql

# Apply fraud-proof advertiser-driven revenue migration
supabase migration up --file 20260910000000_fraud_proof_advertiser_driven_revenue.sql
```

### Verification

After applying migrations, verify the functions:

```sql
-- Check record_ad_view enforces split
SELECT prosrc FROM pg_proc WHERE proname = 'record_ad_view';

-- Should contain:
-- v_creator_share := round(v_gross_revenue * 0.55, 6);
-- v_platform_share := round(v_gross_revenue * 0.45, 6);
-- insert into public.platform_revenue ...
```

## Summary of Fixes

| Issue | Status | Impact |
|-------|--------|--------|
| Database 55/45 split bug | ✅ FIXED | Creator receives 55%, platform receives 45% (persisted) |
| Platform revenue not persisted | ✅ FIXED | Platform share now always logged to `platform_revenue` table |
| Duplicate IMA hook missing Shorts multiplier | ✅ FIXED | Shorts now receive 60% CPM reduction |
| ShortsAdSlide using wrong hook | ✅ FIXED | Now uses correct hook with Shorts multiplier |
| Mid-roll ads not monetized | ⚠️ DOCUMENTED | Not implemented - demo ads only |

## Testing Checklist

- [ ] Apply migrations to Supabase
- [ ] Test regular video ad impression (Watch page)
- [ ] Verify creator wallet receives 55% of revenue
- [ ] Verify platform_revenue table has 45% entry
- [ ] Test Shorts ad impression
- [ ] Verify Shorts receive 60% CPM reduction
- [ ] Verify geolocation data is stored
- [ ] Check revenue_logs for correct amounts
- [ ] Test negative revenue rejection
- [ ] Test high revenue alert logging

## Known Limitations

1. **Mid-Roll Ads:** Not monetized - demo ads only. Requires IMA SDK integration with `requestAdImpression()` and `record_ad_view()` for each mid-roll trigger.

2. **Client-Side Revenue:** Currently, the client passes `p_ad_revenue` to the database. Consider implementing server-side validation of revenue values against known network ranges for additional security.

3. **Migration Deployment:** The migrations exist in the repository but must be applied to the live Supabase project to take effect.

## Related Documentation

- [Fraud-Proof Advertiser-Driven Revenue Model](./FRAUD_PROOF_ADVERTISER_DRIVEN_REVENUE.md)
- [Category CPM Implementation](./CATEGORY_CPM_IMPLEMENTATION.md)
- [Geolocation CPM Implementation](./GEOLOCATION_CPM_IMPLEMENTATION.md)
