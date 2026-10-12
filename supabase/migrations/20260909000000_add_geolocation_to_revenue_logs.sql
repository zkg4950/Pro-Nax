-- Add geolocation and category fields to revenue_logs table for country-based and category-based CPM tracking
-- Migration created: 2026-09-09

-- Add country-related columns to revenue_logs
ALTER TABLE public.revenue_logs 
ADD COLUMN IF NOT EXISTS country_code text,
ADD COLUMN IF NOT EXISTS country_name text,
ADD COLUMN IF NOT EXISTS country_tier text,
ADD COLUMN IF NOT EXISTS base_cpm numeric(14,4),
ADD COLUMN IF NOT EXISTS country_multiplier numeric(8,4);

-- Add category-related columns to revenue_logs
ALTER TABLE public.revenue_logs
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS category_multiplier numeric(8,4),
ADD COLUMN IF NOT EXISTS category_tier text;

-- Add index on country_code for faster geographic analytics
CREATE INDEX IF NOT EXISTS idx_revenue_logs_country_code ON public.revenue_logs(country_code);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_country_tier ON public.revenue_logs(country_tier);

-- Add index on category for faster category-based analytics
CREATE INDEX IF NOT EXISTS idx_revenue_logs_category ON public.revenue_logs(category);
CREATE INDEX IF NOT EXISTS idx_revenue_logs_category_tier ON public.revenue_logs(category_tier);

-- Add comment to document the new fields
COMMENT ON COLUMN public.revenue_logs.country_code IS 'ISO 3166-1 alpha-2 country code of the viewer';
COMMENT ON COLUMN public.revenue_logs.country_name IS 'Full country name of the viewer';
COMMENT ON COLUMN public.revenue_logs.country_tier IS 'Economic tier: tier1, tier2, tier3, or default';
COMMENT ON COLUMN public.revenue_logs.base_cpm IS 'Base CPM rate for the country before multipliers';
COMMENT ON COLUMN public.revenue_logs.country_multiplier IS 'Country-specific multiplier applied to base CPM';
COMMENT ON COLUMN public.revenue_logs.category IS 'Video category for category-based CPM adjustment';
COMMENT ON COLUMN public.revenue_logs.category_multiplier IS 'Category-specific multiplier applied to CPM';
COMMENT ON COLUMN public.revenue_logs.category_tier IS 'Category tier: premium, high, standard, low, or default';

-- Update existing records with default values for null country fields
UPDATE public.revenue_logs 
SET 
  country_code = 'XX',
  country_name = 'Unknown',
  country_tier = 'default',
  base_cpm = COALESCE(cpm, 0.50),
  country_multiplier = 1.0
WHERE country_code IS NULL;

-- Add function to track different ad placements (long-form vs shorts) with category support
CREATE OR REPLACE FUNCTION public.record_ad_view_by_placement(
  p_video_id uuid,
  p_ad_network text default null,
  p_ad_revenue numeric default 0,
  p_cpm numeric default 0,
  p_country_code text default null,
  p_country_name text default null,
  p_country_tier text default null,
  p_placement_type text default 'long_form', -- 'long_form' or 'shorts'
  p_category text default null,
  p_category_multiplier numeric default null,
  p_category_tier text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_category text;
  v_gross_revenue numeric := coalesce(p_ad_revenue, 0);
  v_is_short boolean;
  v_adjusted_cpm numeric := p_cpm;
  v_creator_share numeric;
  v_platform_share numeric;
begin
  select owner_id, is_short, category into v_owner, v_is_short, v_category from public.videos where id = p_video_id;
  if v_owner is null then
    return json_build_object('success', false, 'reason', 'video not found');
  end if;

  -- Use provided category or fall back to video category (INFORMATIONAL ONLY)
  if p_category is null then
    p_category := v_category;
  end if;

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

  -- ENFORCE 55/45 SPLIT (FRAUD-PROOF - cannot be manipulated by client)
  v_creator_share := round(v_gross_revenue * 0.55, 6);
  v_platform_share := round(v_gross_revenue * 0.45, 6);

  -- Adjusted CPM for informational purposes (NOT used for payout)
  if p_placement_type = 'shorts' or v_is_short then
    v_adjusted_cpm := p_cpm * 0.6; -- 60% of long-form CPM for Shorts (informational)
  else
    v_adjusted_cpm := p_cpm;
  end if;

  insert into public.user_wallets (user_id, balance, total_earned, created_at, updated_at)
  values (v_owner, v_creator_share, v_creator_share, now(), now())
  on conflict (user_id) do update
    set balance = public.user_wallets.balance + v_creator_share,
        total_earned = public.user_wallets.total_earned + v_creator_share,
        updated_at = now();

  -- Log revenue with placement, country, and category information
  insert into public.revenue_logs (user_id, video_id, views_count, amount_earned, ad_network, cpm, gross_revenue, country_code, country_name, country_tier, base_cpm, country_multiplier, category, category_multiplier, category_tier, created_at)
  values (v_owner, p_video_id::text, 1, v_creator_share, p_ad_network, v_adjusted_cpm, v_gross_revenue, p_country_code, p_country_name, p_country_tier,
    CASE
      WHEN p_country_multiplier IS NOT NULL AND p_country_multiplier > 0 THEN v_adjusted_cpm / p_country_multiplier
      ELSE v_adjusted_cpm
    END,
    COALESCE(p_country_multiplier, 1.0),
    p_category,
    COALESCE(p_category_multiplier, 1.0),
    p_category_tier,
    now());

  -- Persist PLATFORM share to platform_revenue table (for accounting)
  insert into public.platform_revenue (source_user_id, video_id, amount, gross_revenue, ad_network, cpm, created_at)
  values (v_owner, p_video_id::text, v_platform_share, v_gross_revenue, p_ad_network, v_adjusted_cpm, now());

  insert into public.admin_actions (admin_id, action, target_type, target_id, payload)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'ad_view', 'video', p_video_id::text,
    json_build_object(
      'network', p_ad_network,
      'gross_revenue', v_gross_revenue,
      'creator_share', v_creator_share,
      'platform_share', v_platform_share,
      'cpm', v_adjusted_cpm,
      'original_cpm', p_cpm,
      'placement_type', p_placement_type,
      'is_short', v_is_short,
      'owner', v_owner::text,
      'country_code', p_country_code,
      'country_name', p_country_name,
      'country_tier', p_country_tier,
      'category', p_category,
      'category_multiplier', p_category_multiplier,
      'category_tier', p_category_tier
    ));

  return json_build_object(
    'success', true,
    'gross_revenue', v_gross_revenue,
    'creator_share', v_creator_share,
    'platform_share', v_platform_share,
    'owner', v_owner::text,
    'placement_type', p_placement_type,
    'is_short', v_is_short,
    'adjusted_cpm', v_adjusted_cpm,
    'country_code', p_country_code,
    'country_name', p_country_name,
    'country_tier', p_country_tier,
    'category', p_category,
    'category_multiplier', p_category_multiplier,
    'category_tier', p_category_tier
  );
exception when others then
  return json_build_object('success', false, 'reason', sqlerrm);
end;
$$;
grant execute on function public.record_ad_view_by_placement(uuid, text, numeric, numeric, text, text, text, text, text, numeric, text) to authenticated;