# ProNax Complete SQL Setup Guide

## Important: Run Order

### Step 1: Run Master Schema
Pehle **master_schema_and_functions.sql** run karo - ye saare tables, functions, triggers, RLS policies create karta hai.

### Step 2: Run Complete App SQL
Phir **COMPLETE_APP_SQL.sql** run karo - ye app config tables ka default data insert karta hai aur app_settings table ko proper structure mein recreate karta hai.

## What's Included in COMPLETE_APP_SQL.sql

### 1. app_settings (Proper Structure)
- **IMPORTANT:** Table recreate hota hai proper structure ke saath
- App features: uploads, live, shorts, comments, ads, wallet, downloads
- Homepage sections order
- Algorithm weights: category affinity, freshness boost, CTR weight, retention weight, watched penalty

### 2. system_config
- Site name, description, logo, colors
- Maintenance mode toggle
- Signup/uploads/ads enable/disable
- Minimum withdrawal amount

### 3. feature_flags
- Feature toggles for controlled rollouts
- Homepage v2, shorts feed, live streaming, creator wallet, etc.

### 4. categories
- Video categories with icons
- Music, Gaming, Education, Entertainment, Sports, Technology, Comedy, News, Lifestyle, Science

### 5. sidebar_menu
- Navigation menu items
- Home, Shorts, Explore, Live, Library, History, Saved

### 6. ad_settings
- Ad slot configurations
- Pre-roll, mid-roll, post-roll, banner slots

### 7. trending_sounds
- Audio trending (no default data, dynamic)

### 8. challenges
- Video challenges (no default data, dynamic)

## Tables Already in Master Schema

Ye tables already **master_schema_and_functions.sql** mein hain:
- ✓ profiles, user_roles, super_admins, admin_invites
- ✓ user_settings, notification_preferences, user_consents
- ✓ user_wallets, wallet_transactions, revenue_logs, platform_revenue
- ✓ withdrawal_requests, user_withdrawal_methods, creator_earnings
- ✓ videos, video_subtitles, video_views, video_likes, video_comments
- ✓ follows, community_posts, playlists, watch_history
- ✓ copyright_claims, copyright_fingerprints, audio_fingerprints
- ✓ pdq_image_hashes, vpdq_video_hashes
- ✓ user_strikes, moderation_queue, admin_actions, audit_logs
- ✓ analytics_events, ab_tests, ab_assignments, ab_events
- ✓ streams, live_chat_messages
- ✓ conversations, messages, conversation_participants, presence
- ✓ notifications, push_subscriptions, channel_notices
- ✓ storage_config, account_deletion_requests
- ✓ mv_trending_videos (materialized view)

## Before Running

1. **Backup le lo** (if database mein existing data hai)
2. Supabase SQL Editor mein jao
3. Pehle `master_schema_and_functions.sql` run karo
4. Phir `COMPLETE_APP_SQL.sql` run karo

## If You Already Have Data

Agar database mein pehle se data hai to:
- `COMPLETE_APP_SQL.sql` mein `ON CONFLICT` clauses hain jo existing data ko overwrite nahi karenge
- `app_settings` table recreate hota hai, to agar usme important data hai to pehle backup le lo

## Troubleshooting

Agar koi error aaye:
1. Check karo ke `master_schema_and_functions.sql` successfully run ho chuka hai
2. Check karo ke koi table conflicts to nahi hain
3. Error message share karo, main fix kar dunga
