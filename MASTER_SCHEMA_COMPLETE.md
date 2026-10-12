# ProNax Master Schema - Complete Documentation

## Overview
This `master_schema_and_functions.sql` file contains the complete, production-ready database schema for the ProNax video platform. It includes **60+ tables**, **70+ database functions**, full RLS policies, triggers, and indexes.

## What's Included

### 1. Tables (60+)

#### User & Profile (7 tables)
- `profiles` - User profiles with metadata
- `user_roles` - Role assignments (admin, moderator, user, support)
- `super_admins` - Owner tier admins
- `admin_invites` - Pending admin invitations
- `user_settings` - User preferences
- `notification_preferences` - Notification settings
- `user_consents` - GDPR consent tracking

#### Monetization (6 tables)
- `user_wallets` - Creator wallets with 55/45 split support
- `wallet_transactions` - Transaction history
- `revenue_logs` - Creator revenue with geolocation/category metadata
- `platform_revenue` - Platform 45% share accounting
- `withdrawal_requests` - Payout requests
- `user_withdrawal_methods` - Saved payment methods
- `creator_earnings` - Aggregated earnings by period

#### Video (13 tables)
- `videos` - Main video table
- `video_subtitles` - Video captions
- `video_views` - View tracking
- `video_likes` - Like tracking
- `video_comments` - Comments
- `comment_likes` - Comment likes
- `video_saves` - Saved videos
- `video_shares` - Share tracking
- `video_downloads` - Download tracking
- `video_reports` - Content reports
- `video_ads` - Video-specific ads

#### Social (5 tables)
- `follows` - Follow relationships
- `community_posts` - Creator posts
- `community_post_likes` - Post likes
- `playlists` - User playlists
- `playlist_items` - Playlist videos
- `watch_history` - Watch history

#### Copyright & Content Protection (6 tables)
- `copyright_claims` - Copyright claims
- `copyright_claim_events` - Claim audit trail
- `copyright_fingerprints` - Registered fingerprints
- `audio_fingerprints_songs` - Audio fingerprint registry
- `audio_fingerprints` - Audio fingerprint hashes
- `pdq_image_hashes` - PDQ image hashes
- `vpdq_video_hashes` - vPDQ video hashes

#### Moderation & Admin (7 tables)
- `user_strikes` - User strikes system
- `moderation_queue` - Content moderation queue
- `moderation_settings` - Moderation configuration
- `admin_actions` - Admin audit log
- `audit_logs` - Comprehensive audit log
- `rate_limit_events` - Rate limiting
- `ip_rules` - IP block/allow rules
- `appeals` - User appeals

#### Analytics & Events (5 tables)
- `analytics_events` - Analytics tracking
- `ab_tests` - A/B tests
- `ab_assignments` - A/B test assignments
- `ab_events` - A/B test events
- `ab_experiments` - A/B experiments

#### Live Streaming (2 tables)
- `streams` - Live streams
- `live_chat_messages` - Live chat

#### Notifications & Messaging (3 tables)
- `notifications` - User notifications
- `channel_notices` - Channel-specific notices
- `push_subscriptions` - Web push subscriptions

#### Configuration & System (15 tables)
- `system_config` - System configuration (site_name = 'ProNax')
- `app_settings` - Application settings
- `feature_flags` - Feature flags
- `categories` - Video categories
- `ad_settings` - Ad configuration
- `sidebar_menu` - Navigation menu
- `dynamic_routes` - Dynamic page routes
- `dynamic_widgets` - Dynamic widgets
- `trending_sounds` - Trending audio
- `challenges` - Video challenges
- `creator_marketplace` - Creator services
- `activity_log` - Activity tracking
- `algorithm_audit_log` - Algorithm changes
- `storage_config` - Encrypted storage credentials
- `account_deletion_requests` - GDPR deletion requests

#### Materialized Views (1)
- `mv_trending_videos` - Trending videos with velocity scores

### 2. Database Functions (70+)

#### Admin Functions (20+)
- `admin_bootstrap_status()` - Check if initial admin can be claimed
- `admin_set_role()` - Grant/revoke user roles
- `admin_revoke_admin()` - Revoke all admin roles
- `admin_set_owner()` - Grant/revoke owner status
- `admin_invite_by_email()` - Invite admin by email
- `admin_cancel_invite()` - Cancel pending invite
- `admin_team_list()` - List admin team members
- `admin_ban_user()` - Ban a user
- `admin_unban_user()` - Unban a user
- `admin_flag_bot()` - Flag user as bot
- `admin_unflag_bot()` - Unflag bot
- `admin_issue_strike()` - Issue a strike
- `admin_revoke_strike()` - Revoke a strike
- `active_strike_count()` - Count active strikes
- `admin_moderate_video()` - Moderate video (approve, remove, shadowban, flag)
- `admin_set_video_boost()` - Set boost score
- `delete_video_with_storage()` - Delete video
- `admin_resolve_appeal()` - Resolve user appeal
- `admin_set_ip_rule()` - Set IP block/allow rule
- `admin_delete_ip_rule()` - Delete IP rule
- `admin_update_user_profile()` - Update user profile
- `admin_get_user_details()` - Get user details
- `admin_get_user_videos()` - Get user videos
- `admin_get_user_emails()` - Get emails for multiple users
- `admin_mark_withdrawal_processed()` - Mark withdrawal as processed
- `admin_adjust_wallet()` - Admin wallet adjustment

#### Monetization Functions (4)
- `record_ad_view()` - Record ad impression with enforced 55/45 split
- `record_ad_view_by_placement()` - Record ad with placement type (long-form vs shorts)
- `request_withdrawal()` - Request a withdrawal
- `process_withdrawal()` - Process a withdrawal (admin only)

#### User Functions (25+)
- `handle_new_user()` - Create profile on auth.users insert
- `get_studio_dashboard()` - Studio dashboard for creators
- `get_platform_overview()` - Admin platform overview
- `get_channel_analytics()` - Channel analytics
- `get_aggregated_analytics()` - Detailed analytics data
- `get_traffic_sources_analytics()` - Traffic source breakdown
- `get_geography_analytics()` - Geographic breakdown
- `get_realtime_views()` - Realtime view counts
- `toggle_like()` - Like/unlike a video
- `post_comment()` - Post a comment
- `toggle_follow()` - Follow/unfollow a user
- `toggle_save()` - Save/unsave a video
- `record_share()` - Record a video share
- `record_download()` - Record a video download
- `record_view()` - Record a video view
- `get_home_feed_v2()` - Get home feed
- `get_shorts_feed()` - Get Shorts feed
- `get_related_videos()` - Get related videos
- `search_videos()` - Full-text search for videos
- `search_channels()` - Search for channels
- `get_channel_community_posts()` - Get community posts
- `toggle_community_post_like()` - Like/unlike community post
- `log_video_impression()` - Log video impression
- `log_search_analytics()` - Log search for analytics
- `record_watch_history()` - Record watch history
- `record_heartbeat()` - Record watch heartbeat
- `record_watch_progress()` - Record watch progress
- `get_video_retention()` - Get video retention stats
- `search_videos_suggest()` - Autocomplete suggestions

#### Copyright Functions (3)
- `create_copyright_claim()` - Create a copyright claim
- `dispute_copyright_claim()` - Dispute a copyright claim
- `release_copyright_claim()` - Release a copyright claim

#### Storage Functions (1)
- `get_active_storage_config()` - Get active storage configuration

#### Notification Functions (4)
- `get_notification_preferences()` - Get notification preferences
- `update_notification_preferences()` - Update notification preferences
- `register_push_subscription()` - Register web push subscription
- `remove_push_subscription()` - Remove web push subscription

#### Algorithm Functions (2)
- `get_algo_weights()` - Get algorithm weights
- `update_algorithm_weights()` - Update algorithm weights

#### A/B Testing Functions (2)
- `assign_ab_variant()` - Assign user to A/B test variant
- `record_ab_event()` - Record A/B test event

#### GDPR Functions (3)
- `export_my_data()` - Export user data
- `request_account_deletion()` - Request account deletion
- `cancel_account_deletion()` - Cancel pending deletion

#### Additional Utility Functions (5)
- `get_trending_videos()` - Get trending videos
- `get_user_settings()` - Get user settings
- `update_user_settings()` - Update user settings
- `record_video_share()` - Record video share with platform details
- `get_video_share_count()` - Get total share count
- `get_video_share_breakdown()` - Get share breakdown by platform

### 3. Key Features

#### 55/45 Revenue Split (Fraud-Proof)
- **Creator share: 55%**
- **Platform share: 45%**
- Split is enforced at database level in `record_ad_view()` and `record_ad_view_by_placement()`
- Client cannot manipulate the final payout
- Actual gross revenue from ad networks is the source of truth
- Category and country multipliers are informational/analytics only

#### Geolocation Support
- Country code, name, tier tracking
- Country multiplier metadata
- Geographic analytics breakdown

#### Category/Niche Support
- Category multiplier metadata
- Category tier tracking (premium, high, standard, low)
- Category analytics

#### Placement Type Support
- Long-form vs Shorts placement
- Placement multiplier tracking
- Shorts-specific CPM support

#### Full RLS Policies
- Public read for public content
- Owner-only write for user data
- Admin override for management
- Role-based access control

#### Triggers
- Automatic timestamp updates
- Count maintenance (likes, comments, shares, followers)
- Profile creation on signup
- Full-text search vector updates

### 4. App Name
The site name is set to **"ProNax"** in the `system_config` table (not TubeApp, YouTube, TikTok, or any other big app name).

### 5. Platform Comparison
This schema provides features comparable to:
- **YouTube**: Video hosting, monetization, comments, likes, subscriptions, copyright detection
- **TikTok**: Shorts support, trending sounds, community posts, stitch/duet/reaction features
- **Instagram**: Stories (community posts), reels (shorts), social features

**No big app names are hardcoded** - this is the ProNax platform.

## Usage

Run this script in Supabase SQL Editor to set up the complete database:

```sql
-- Copy the entire content of master_schema_and_functions.sql
-- Paste into Supabase SQL Editor
-- Execute
```

## Important Notes

1. **This is a comprehensive migration** - it creates or updates all tables, functions, RLS policies, and triggers
2. **55/45 split is enforced at database level** - client cannot manipulate
3. **All admin functions are included** - ban, unban, delete video, moderate, flag, strikes, withdrawals
4. **Full studio analytics** - dashboard, channel analytics, geography, traffic sources
5. **GDPR compliant** - data export and deletion functions
6. **Copyright detection** - audio, PDQ, and vPDQ fingerprinting support
7. **No external app names** - ProNax branding throughout

## File Statistics
- **Total lines**: 4,100
- **Tables**: 60+
- **Functions**: 70+
- **Triggers**: 15+
- **Indexes**: 100+
- **RLS policies**: 50+
