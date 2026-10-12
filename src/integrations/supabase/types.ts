export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ab_assignments: {
        Row: {
          created_at: string
          experiment_id: string | null
          id: string
          test_id: string
          user_id: string
          variant: string
        }
        Insert: {
          created_at?: string
          experiment_id?: string | null
          id?: string
          test_id: string
          user_id: string
          variant: string
        }
        Update: {
          created_at?: string
          experiment_id?: string | null
          id?: string
          test_id?: string
          user_id?: string
          variant?: string
        }
        Relationships: []
      }
      ab_events: {
        Row: {
          created_at: string
          event: string
          experiment_id: string | null
          id: string
          test_id: string
          user_id: string | null
          value: number
          variant: string
        }
        Insert: {
          created_at?: string
          event: string
          experiment_id?: string | null
          id?: string
          test_id: string
          user_id?: string | null
          value: number
          variant: string
        }
        Update: {
          created_at?: string
          event?: string
          experiment_id?: string | null
          id?: string
          test_id?: string
          user_id?: string | null
          value?: number
          variant?: string
        }
        Relationships: []
      }
      ab_experiments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          metrics: Json
          name: string
          start_date: string | null
          status: string
          target_percentage: number
          updated_at: string
          variants: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          metrics: Json
          name: string
          start_date?: string | null
          status: string
          target_percentage: number
          updated_at?: string
          variants: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          metrics?: Json
          name?: string
          start_date?: string | null
          status?: string
          target_percentage?: number
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      ab_tests: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metrics: Json
          name: string
          status: string
          target: string
          updated_at: string
          variants: Json
          winner: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metrics: Json
          name: string
          status: string
          target: string
          updated_at?: string
          variants: Json
          winner?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metrics?: Json
          name?: string
          status?: string
          target?: string
          updated_at?: string
          variants?: Json
          winner?: string | null
        }
        Relationships: []
      }
      account_deletion_requests: {
        Row: {
          admin_note: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          reason: string | null
          reviewed_by: string | null
          scheduled_purge_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_by?: string | null
          scheduled_purge_at: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_by?: string | null
          scheduled_purge_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ad_settings: {
        Row: {
          ad_unit_id: string | null
          created_at: string
          enabled: boolean
          frequency: number
          html_snippet: string | null
          id: string
          impressions_count: number
          kind: string
          network: string
          notes: string | null
          publisher_id: string | null
          slot: string
          updated_at: string
          vast_tag_url: string | null
        }
        Insert: {
          ad_unit_id?: string | null
          created_at?: string
          enabled?: boolean
          frequency?: number
          html_snippet?: string | null
          id?: string
          impressions_count?: number
          kind: string
          network: string
          notes?: string | null
          publisher_id?: string | null
          slot: string
          updated_at?: string
          vast_tag_url?: string | null
        }
        Update: {
          ad_unit_id?: string | null
          created_at?: string
          enabled?: boolean
          frequency?: number
          html_snippet?: string | null
          id?: string
          impressions_count?: number
          kind?: string
          network?: string
          notes?: string | null
          publisher_id?: string | null
          slot?: string
          updated_at?: string
          vast_tag_url?: string | null
        }
        Relationships: []
      }
      admin_actions: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          payload: Json
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          payload: Json
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      admin_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
        }
        Relationships: []
      }
      algorithm_audit_log: {
        Row: {
          actor: string | null
          created_at: string
          id: string
          next: Json
          note: string | null
          previous: Json
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: string
          next: Json
          note?: string | null
          previous: Json
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: string
          next?: Json
          note?: string | null
          previous?: Json
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          cpm: number | null
          created_at: string
          event: string
          event_type: string | null
          gross_revenue: number | null
          id: string
          props: Json | null
          revenue: number | null
          user_id: string | null
          video_id: string | null
        }
        Insert: {
          cpm?: number | null
          created_at?: string
          event: string
          event_type?: string | null
          gross_revenue?: number | null
          id?: string
          props?: Json | null
          revenue?: number | null
          user_id?: string | null
          video_id?: string | null
        }
        Update: {
          cpm?: number | null
          created_at?: string
          event?: string
          event_type?: string | null
          gross_revenue?: number | null
          id?: string
          props?: Json | null
          revenue?: number | null
          user_id?: string | null
          video_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          accent_hex: string
          algo_category_affinity: number
          algo_ctr_weight: number
          algo_freshness_boost: number
          algo_retention_weight: number
          algo_watched_penalty: number
          app_name: string
          app_tagline: string | null
          feature_ads: boolean
          feature_comments: boolean
          feature_downloads: boolean
          feature_live: boolean
          feature_shorts: boolean
          feature_uploads: boolean
          feature_wallet: boolean
          homepage_sections: string[]
          id: number
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          accent_hex?: string
          algo_category_affinity?: number
          algo_ctr_weight?: number
          algo_freshness_boost?: number
          algo_retention_weight?: number
          algo_watched_penalty?: number
          app_name: string
          app_tagline?: string | null
          feature_ads?: boolean
          feature_comments?: boolean
          feature_downloads?: boolean
          feature_live?: boolean
          feature_shorts?: boolean
          feature_uploads?: boolean
          feature_wallet?: boolean
          homepage_sections?: string[]
          id: number
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          accent_hex?: string
          algo_category_affinity?: number
          algo_ctr_weight?: number
          algo_freshness_boost?: number
          algo_retention_weight?: number
          algo_watched_penalty?: number
          app_name?: string
          app_tagline?: string | null
          feature_ads?: boolean
          feature_comments?: boolean
          feature_downloads?: boolean
          feature_live?: boolean
          feature_shorts?: boolean
          feature_uploads?: boolean
          feature_wallet?: boolean
          homepage_sections?: string[]
          id?: number
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      appeals: {
        Row: {
          admin_note: string | null
          created_at: string
          email: string | null
          id: string
          message: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata: Json
          severity: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          enabled: boolean
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      challenge_participations: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          status: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          status?: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          status?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          banner_url: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          end_date: string | null
          hashtag: string
          id: string
          is_active: boolean
          is_featured: boolean
          participant_count: number
          start_date: string
          title: string
          video_count: number
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          end_date?: string | null
          hashtag: string
          id?: string
          is_active: boolean
          is_featured: boolean
          participant_count: number
          start_date: string
          title: string
          video_count: number
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          end_date?: string | null
          hashtag?: string
          id?: string
          is_active?: boolean
          is_featured?: boolean
          participant_count?: number
          start_date?: string
          title?: string
          video_count?: number
        }
        Relationships: []
      }
      channel_notices: {
        Row: {
          action_label: string | null
          action_required: boolean
          action_url: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_read: boolean
          message: string
          notice_type: string
          read_at: string | null
          related_claim_id: string | null
          related_video_id: string | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_required: boolean
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean
          message: string
          notice_type: string
          read_at?: string | null
          related_claim_id?: string | null
          related_video_id?: string | null
          severity: string
          title: string
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_required?: boolean
          action_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean
          message?: string
          notice_type?: string
          read_at?: string | null
          related_claim_id?: string | null
          related_video_id?: string | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          body: string | null
          created_at: string
          id: string
          user_id: string | null
          video_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          user_id?: string | null
          video_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          user_id?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          comments_count: number
          content: string
          created_at: string
          creator_id: string
          id: string
          is_pinned: boolean
          likes_count: number
          media_urls: string[] | null
          poll_expires_at: string | null
          poll_options: Json | null
          post_type: string
          shares_count: number
          updated_at: string
          visibility: string
        }
        Insert: {
          comments_count: number
          content: string
          created_at?: string
          creator_id: string
          id?: string
          is_pinned: boolean
          likes_count: number
          media_urls?: string[] | null
          poll_expires_at?: string | null
          poll_options?: Json | null
          post_type: string
          shares_count: number
          updated_at?: string
          visibility: string
        }
        Update: {
          comments_count?: number
          content?: string
          created_at?: string
          creator_id?: string
          id?: string
          is_pinned?: boolean
          likes_count?: number
          media_urls?: string[] | null
          poll_expires_at?: string | null
          poll_options?: Json | null
          post_type?: string
          shares_count?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      copyright_claim_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string | null
          claim_id: string
          created_at: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string | null
          claim_id: string
          created_at?: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string | null
          claim_id?: string
          created_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      copyright_claims: {
        Row: {
          action_taken: string | null
          claim_type: string
          claimant_id: string
          created_at: string
          detected_at: string
          dispute_evidence: string[] | null
          dispute_reason: string | null
          id: string
          match_percentage: number | null
          matched_content_id: string | null
          matched_content_owner: string | null
          matched_content_title: string | null
          notes: string | null
          policy_action: string | null
          resolved_at: string | null
          severity: string
          status: string
          updated_at: string
          video_id: string
        }
        Insert: {
          action_taken?: string | null
          claim_type: string
          claimant_id: string
          created_at?: string
          detected_at: string
          dispute_evidence?: string[] | null
          dispute_reason?: string | null
          id?: string
          match_percentage?: number | null
          matched_content_id?: string | null
          matched_content_owner?: string | null
          matched_content_title?: string | null
          notes?: string | null
          policy_action?: string | null
          resolved_at?: string | null
          severity: string
          status: string
          updated_at?: string
          video_id: string
        }
        Update: {
          action_taken?: string | null
          claim_type?: string
          claimant_id?: string
          created_at?: string
          detected_at?: string
          dispute_evidence?: string[] | null
          dispute_reason?: string | null
          id?: string
          match_percentage?: number | null
          matched_content_id?: string | null
          matched_content_owner?: string | null
          matched_content_title?: string | null
          notes?: string | null
          policy_action?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: []
      }
      copyright_fingerprints: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          fingerprint_data: Json
          id: string
          is_active: boolean
          metadata: Json | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          fingerprint_data: Json
          id?: string
          is_active: boolean
          metadata?: Json | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          fingerprint_data?: Json
          id?: string
          is_active?: boolean
          metadata?: Json | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_earnings: {
        Row: {
          cpm: number | null
          created_at: string
          creator_id: string
          gross_amount: number | null
          impressions: number | null
          last_computed_at: string
          period_end: string
          period_start: string
          source: string | null
          status: string | null
          total_earned: number
          total_views: number
          total_watch_seconds: number
          updated_at: string | null
          user_id: string
          video_id: string | null
        }
        Insert: {
          cpm?: number | null
          created_at?: string
          creator_id: string
          gross_amount?: number | null
          impressions?: number | null
          last_computed_at: string
          period_end: string
          period_start: string
          source?: string | null
          status?: string | null
          total_earned: number
          total_views: number
          total_watch_seconds: number
          updated_at?: string | null
          user_id: string
          video_id?: string | null
        }
        Update: {
          cpm?: number | null
          created_at?: string
          creator_id?: string
          gross_amount?: number | null
          impressions?: number | null
          last_computed_at?: string
          period_end?: string
          period_start?: string
          source?: string | null
          status?: string | null
          total_earned?: number
          total_views?: number
          total_watch_seconds?: number
          updated_at?: string | null
          user_id?: string
          video_id?: string | null
        }
        Relationships: []
      }
      creator_marketplace: {
        Row: {
          availability_status: string
          category: string
          created_at: string
          creator_id: string
          description: string | null
          id: string
          portfolio_urls: string[] | null
          price_max: number | null
          price_min: number | null
          pricing_type: string
          rating: number | null
          review_count: number
          title: string
          updated_at: string
          views_count: number
        }
        Insert: {
          availability_status: string
          category: string
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          portfolio_urls?: string[] | null
          price_max?: number | null
          price_min?: number | null
          pricing_type: string
          rating?: number | null
          review_count: number
          title: string
          updated_at?: string
          views_count: number
        }
        Update: {
          availability_status?: string
          category?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          portfolio_urls?: string[] | null
          price_max?: number | null
          price_min?: number | null
          pricing_type?: string
          rating?: number | null
          review_count?: number
          title?: string
          updated_at?: string
          views_count?: number
        }
        Relationships: []
      }
      dynamic_routes: {
        Row: {
          content: Json
          created_at: string
          enabled: boolean
          id: string
          path: string
          title: string | null
        }
        Insert: {
          content: Json
          created_at?: string
          enabled: boolean
          id?: string
          path: string
          title?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          path?: string
          title?: string | null
        }
        Relationships: []
      }
      dynamic_widgets: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          page: string
          position: number
          title: string | null
        }
        Insert: {
          config: Json
          created_at?: string
          enabled: boolean
          id?: string
          kind: string
          page: string
          position: number
          title?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          page?: string
          position?: number
          title?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          rollout_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled: boolean
          key: string
          rollout_percent: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          rollout_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      ip_rules: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ip_address: string
          mode: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address: string
          mode: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string
          mode?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      live_chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          stream_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          stream_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          stream_id?: string
          user_id?: string
        }
        Relationships: []
      }
      moderation_queue: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          escalated: boolean
          flagged_reason: string | null
          id: string
          notes: string | null
          owner_id: string | null
          priority: number
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot: Json | null
          status: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          escalated: boolean
          flagged_reason?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          priority: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot?: Json | null
          status: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          escalated?: boolean
          flagged_reason?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          priority?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot?: Json | null
          status?: string
        }
        Relationships: []
      }
      moderation_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          category: string | null
          created_at: string
          expires_at: string | null
          icon: string | null
          id: string
          payload: Json
          priority: string
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          category?: string | null
          created_at?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          payload?: Json
          priority?: string
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          category?: string | null
          created_at?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          payload?: Json
          priority?: string
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_revenue: {
        Row: {
          ad_network: string | null
          amount: number
          cpm: number | null
          created_at: string
          gross_revenue: number
          id: string
          source_user_id: string | null
          video_id: string
        }
        Insert: {
          ad_network?: string | null
          amount: number
          cpm?: number | null
          created_at?: string
          gross_revenue: number
          id?: string
          source_user_id?: string | null
          video_id: string
        }
        Update: {
          ad_network?: string | null
          amount?: number
          cpm?: number | null
          created_at?: string
          gross_revenue?: number
          id?: string
          source_user_id?: string | null
          video_id?: string
        }
        Relationships: []
      }
      playlist_items: {
        Row: {
          added_at: string
          id: string
          playlist_id: string
          position: number
          video_id: string
        }
        Insert: {
          added_at: string
          id?: string
          playlist_id: string
          position: number
          video_id: string
        }
        Update: {
          added_at?: string
          id?: string
          playlist_id?: string
          position?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
          visibility: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned_until: string | null
          banner_url: string | null
          bio: string | null
          bot_flag_reason: string | null
          bot_flagged_at: string | null
          country: string | null
          created_at: string
          daily_earnings_usd: number | null
          display_name: string | null
          email: string | null
          follower_count: number | null
          following_count: number | null
          handle: string | null
          id: string
          is_banned: boolean
          is_bot_flagged: boolean
          status: string
          total_views: number | null
          updated_at: string
          upload_limit_mb: number
          verified: boolean | null
          video_count: number | null
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_until?: string | null
          banner_url?: string | null
          bio?: string | null
          bot_flag_reason?: string | null
          bot_flagged_at?: string | null
          country?: string | null
          created_at?: string
          daily_earnings_usd?: number | null
          display_name?: string | null
          email?: string | null
          follower_count?: number | null
          following_count?: number | null
          handle?: string | null
          id?: string
          is_banned?: boolean
          is_bot_flagged?: boolean
          status?: string
          total_views?: number | null
          updated_at?: string
          upload_limit_mb?: number
          verified?: boolean | null
          video_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_until?: string | null
          banner_url?: string | null
          bio?: string | null
          bot_flag_reason?: string | null
          bot_flagged_at?: string | null
          country?: string | null
          created_at?: string
          daily_earnings_usd?: number | null
          display_name?: string | null
          email?: string | null
          follower_count?: number | null
          following_count?: number | null
          handle?: string | null
          id?: string
          is_banned?: boolean
          is_bot_flagged?: boolean
          status?: string
          total_views?: number | null
          updated_at?: string
          upload_limit_mb?: number
          verified?: boolean | null
          video_count?: number | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          blocked: boolean
          bucket: string
          created_at: string
          hits: number
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          blocked: boolean
          bucket: string
          created_at?: string
          hits: number
          id?: string
          ip_address?: string | null
          metadata: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          blocked?: boolean
          bucket?: string
          created_at?: string
          hits?: number
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      revenue_logs: {
        Row: {
          ad_network: string | null
          amount_earned: number
          base_cpm: number | null
          category: string | null
          category_multiplier: number | null
          category_tier: string | null
          country_code: string | null
          country_multiplier: number | null
          country_name: string | null
          country_tier: string | null
          created_at: string
          cpm: number | null
          gross_revenue: number | null
          id: string
          user_id: string
          video_id: string
          views_count: number
        }
        Insert: {
          ad_network?: string | null
          amount_earned: number
          base_cpm?: number | null
          category?: string | null
          category_multiplier?: number | null
          category_tier?: string | null
          country_code?: string | null
          country_multiplier?: number | null
          country_name?: string | null
          country_tier?: string | null
          created_at?: string
          cpm?: number | null
          gross_revenue?: number | null
          id?: string
          user_id: string
          video_id: string
          views_count: number
        }
        Update: {
          ad_network?: string | null
          amount_earned?: number
          base_cpm?: number | null
          category?: string | null
          category_multiplier?: number | null
          category_tier?: string | null
          country_code?: string | null
          country_multiplier?: number | null
          country_name?: string | null
          country_tier?: string | null
          created_at?: string
          cpm?: number | null
          gross_revenue?: number | null
          id?: string
          user_id?: string
          video_id?: string
          views_count?: number
        }
        Relationships: []
      }
      sidebar_menu: {
        Row: {
          created_at: string
          enabled: boolean
          href: string
          icon: string | null
          id: string
          label: string
          position: number
          section: string
        }
        Insert: {
          created_at?: string
          enabled: boolean
          href: string
          icon?: string | null
          id?: string
          label: string
          position: number
          section: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          href?: string
          icon?: string | null
          id?: string
          label?: string
          position?: number
          section?: string
        }
        Relationships: []
      }
      streams: {
        Row: {
          category: string | null
          chat_enabled: boolean
          chat_message_count: number
          created_at: string
          description: string | null
          ended_at: string | null
          id: string
          is_live: boolean
          mux_playback_id: string | null
          mux_stream_id: string | null
          mux_stream_key: string | null
          playback_url: string | null
          recording_enabled: boolean
          recording_url: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          stream_key: string | null
          stream_url: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          viewer_count: number
          viewer_peak: number
        }
        Insert: {
          category?: string | null
          chat_enabled: boolean
          chat_message_count: number
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          is_live: boolean
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          mux_stream_key?: string | null
          playback_url?: string | null
          recording_enabled: boolean
          recording_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status: string
          stream_key?: string | null
          stream_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
          viewer_count: number
          viewer_peak: number
        }
        Update: {
          category?: string | null
          chat_enabled?: boolean
          chat_message_count?: number
          created_at?: string
          description?: string | null
          ended_at?: string | null
          id?: string
          is_live?: boolean
          mux_playback_id?: string | null
          mux_stream_id?: string | null
          mux_stream_key?: string | null
          playback_url?: string | null
          recording_enabled?: boolean
          recording_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          stream_key?: string | null
          stream_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          viewer_count?: number
          viewer_peak?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          subscriber_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          subscriber_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          subscriber_id?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          ads_enabled: boolean
          created_at: string
          extra: Json
          favicon_url: string | null
          id: number
          logo_url: string | null
          maintenance_mode: boolean
          min_withdrawal: number
          primary_color: string | null
          signup_enabled: boolean
          site_description: string | null
          site_name: string
          updated_at: string
          uploads_enabled: boolean
        }
        Insert: {
          ads_enabled: boolean
          created_at?: string
          extra: Json
          favicon_url?: string | null
          id: number
          logo_url?: string | null
          maintenance_mode: boolean
          min_withdrawal: number
          primary_color?: string | null
          signup_enabled: boolean
          site_description?: string | null
          site_name: string
          updated_at?: string
          uploads_enabled: boolean
        }
        Update: {
          ads_enabled?: boolean
          created_at?: string
          extra?: Json
          favicon_url?: string | null
          id?: number
          logo_url?: string | null
          maintenance_mode?: boolean
          min_withdrawal?: number
          primary_color?: string | null
          signup_enabled?: boolean
          site_description?: string | null
          site_name?: string
          updated_at?: string
          uploads_enabled?: boolean
        }
        Relationships: []
      }
      trending_sounds: {
        Row: {
          artist: string | null
          audio_track_id: string
          category: string | null
          cover_url: string | null
          created_at: string
          id: string
          is_trending: boolean
          title: string | null
          trend_score: number
          updated_at: string
          usage_count: number
        }
        Insert: {
          artist?: string | null
          audio_track_id: string
          category?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_trending: boolean
          title?: string | null
          trend_score: number
          updated_at?: string
          usage_count: number
        }
        Update: {
          artist?: string | null
          audio_track_id?: string
          category?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_trending?: boolean
          title?: string | null
          trend_score?: number
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          advertising: boolean
          analytics: boolean
          anon_id: string | null
          created_at: string
          id: string
          necessary: boolean
          policy_version: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          advertising: boolean
          analytics: boolean
          anon_id?: string | null
          created_at?: string
          id?: string
          necessary: boolean
          policy_version: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          advertising?: boolean
          analytics?: boolean
          anon_id?: string | null
          created_at?: string
          id?: string
          necessary?: boolean
          policy_version?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          autoplay_shorts: boolean
          autoplay_videos: boolean
          captions_enabled: boolean
          captions_language: string
          custom_settings: Json
          language: string
          mini_player_enabled: boolean
          muted: boolean
          notifications_enabled: boolean
          playback_speed: number
          quality_preference: string
          restricted_mode: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          autoplay_shorts?: boolean
          autoplay_videos?: boolean
          captions_enabled?: boolean
          captions_language?: string
          custom_settings?: Json
          language?: string
          mini_player_enabled?: boolean
          muted?: boolean
          notifications_enabled?: boolean
          playback_speed?: number
          quality_preference?: string
          restricted_mode?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          autoplay_shorts?: boolean
          autoplay_videos?: boolean
          captions_enabled?: boolean
          captions_language?: string
          custom_settings?: Json
          language?: string
          mini_player_enabled?: boolean
          muted?: boolean
          notifications_enabled?: boolean
          playback_speed?: number
          quality_preference?: string
          restricted_mode?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_strikes: {
        Row: {
          created_at: string
          id: string
          issued_by: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issued_by?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issued_by?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          balance: number
          total_earned: number
          total_withdrawn: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_withdrawal_methods: {
        Row: {
          account_holder_name: string | null
          account_identifier: string
          id: string
          is_default: boolean
          method_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_identifier: string
          id?: string
          is_default: boolean
          method_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_identifier?: string
          id?: string
          is_default?: boolean
          method_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_ads: {
        Row: {
          ad_url: string
          created_at: string
          id: string
          status: string
          video_id: string
        }
        Insert: {
          ad_url: string
          created_at?: string
          id?: string
          status: string
          video_id: string
        }
        Update: {
          ad_url?: string
          created_at?: string
          id?: string
          status?: string
          video_id?: string
        }
        Relationships: []
      }
      video_comments: {
        Row: {
          created_at: string
          id: string
          likes_count: number | null
          parent_id: string | null
          replies_count: number | null
          text: string
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          replies_count?: number | null
          text: string
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          replies_count?: number | null
          text?: string
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      video_downloads: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      video_likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      video_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          status: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          video_id?: string
        }
        Relationships: []
      }
      video_saves: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      video_shares: {
        Row: {
          channel: string
          created_at: string
          id: string
          platform: string | null
          user_id: string | null
          video_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          platform?: string | null
          user_id?: string | null
          video_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          platform?: string | null
          user_id?: string | null
          video_id?: string
        }
        Relationships: []
      }
      video_views: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          user_id: string | null
          video_id: string
          viewer_id: string | null
          watch_seconds: number
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
          video_id: string
          viewer_id?: string | null
          watch_seconds: number
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
          video_id?: string
          viewer_id?: string | null
          watch_seconds?: number
        }
        Relationships: []
      }
      videos: {
        Row: {
          age_restriction: string | null
          aspect_ratio: number | null
          audio_track_id: string | null
          audio_track_title: string | null
          auto_suppressed: boolean
          boost_score: number
          category: string | null
          comments_count: number | null
          created_at: string
          description: string | null
          duet_source_video: string | null
          duration_seconds: number | null
          id: string
          is_pending_review: boolean
          is_removed: boolean
          is_shadow_banned: boolean
          is_short: boolean
          language: string | null
          license: string | null
          likes_count: number | null
          mime_type: string | null
          moderation_reason: string | null
          monetization_enabled: boolean | null
          original_sound_credit: string | null
          owner_id: string
          preview_sprite_frames: number | null
          preview_sprite_url: string | null
          preview_url: string | null
          published_at: string | null
          r2_thumb_key: string | null
          r2_video_key: string
          reaction_source_video: string | null
          report_count: number
          scheduled_at: string | null
          sha256: string | null
          shares_count: number | null
          size_bytes: number | null
          sound_usage_count: number
          status: string
          stitch_position: number | null
          stitch_source_videos: string[] | null
          tags: string[] | null
          thumb_url: string | null
          title: string
          trending_score: number
          updated_at: string
          variants: Json | null
          video_url: string
          views_count: number
          visibility: string
        }
        Insert: {
          age_restriction?: string | null
          aspect_ratio?: number | null
          audio_track_id?: string | null
          audio_track_title?: string | null
          auto_suppressed?: boolean
          boost_score?: number
          category?: string | null
          comments_count?: number | null
          created_at?: string
          description?: string | null
          duet_source_video?: string | null
          duration_seconds?: number | null
          id?: string
          is_pending_review?: boolean
          is_removed?: boolean
          is_shadow_banned?: boolean
          is_short?: boolean
          language?: string | null
          license?: string | null
          likes_count?: number | null
          mime_type?: string | null
          moderation_reason?: string | null
          monetization_enabled?: boolean | null
          original_sound_credit?: string | null
          owner_id: string
          preview_sprite_frames?: number | null
          preview_sprite_url?: string | null
          preview_url?: string | null
          published_at?: string | null
          r2_thumb_key?: string | null
          r2_video_key: string
          reaction_source_video?: string | null
          report_count?: number
          scheduled_at?: string | null
          sha256?: string | null
          shares_count?: number | null
          size_bytes?: number | null
          sound_usage_count?: number
          status?: string
          stitch_position?: number | null
          stitch_source_videos?: string[] | null
          tags?: string[] | null
          thumb_url?: string | null
          title: string
          trending_score?: number
          updated_at?: string
          variants?: Json | null
          video_url: string
          views_count?: number
          visibility?: string
        }
        Update: {
          age_restriction?: string | null
          aspect_ratio?: number | null
          audio_track_id?: string | null
          audio_track_title?: string | null
          auto_suppressed?: boolean
          boost_score?: number
          category?: string | null
          comments_count?: number | null
          created_at?: string
          description?: string | null
          duet_source_video?: string | null
          duration_seconds?: number | null
          id?: string
          is_pending_review?: boolean
          is_removed?: boolean
          is_shadow_banned?: boolean
          is_short?: boolean
          language?: string | null
          license?: string | null
          likes_count?: number | null
          mime_type?: string | null
          moderation_reason?: string | null
          monetization_enabled?: boolean | null
          original_sound_credit?: string | null
          owner_id?: string
          preview_sprite_frames?: number | null
          preview_sprite_url?: string | null
          preview_url?: string | null
          published_at?: string | null
          r2_thumb_key?: string | null
          r2_video_key?: string
          reaction_source_video?: string | null
          report_count?: number
          scheduled_at?: string | null
          sha256?: string | null
          shares_count?: number | null
          size_bytes?: number | null
          sound_usage_count?: number
          status?: string
          stitch_position?: number | null
          stitch_source_videos?: string[] | null
          tags?: string[] | null
          thumb_url?: string | null
          title?: string
          trending_score?: number
          updated_at?: string
          variants?: Json | null
          video_url?: string
          views_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          balance_after: number | null
          created_at: string
          delta: number
          id: string
          kind: string
          performed_by: string | null
          reason: string | null
          reference_id: string | null
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          delta: number
          id?: string
          kind: string
          performed_by?: string | null
          reason?: string | null
          reference_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          delta?: number
          id?: string
          kind?: string
          performed_by?: string | null
          reason?: string | null
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          created_at: string | null
          id: string
          last_watched_at: string | null
          updated_at: string
          user_id: string
          video_id: string
          watch_seconds: number
          watched_at: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_watched_at?: string | null
          updated_at?: string
          user_id: string
          video_id: string
          watch_seconds: number
          watched_at: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_watched_at?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string
          watch_seconds?: number
          watched_at?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount: number
          country: string | null
          created_at: string
          destination: string | null
          id: string
          method: string | null
          payment_details: Json
          processed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          country?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          method?: string | null
          payment_details?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          country?: string | null
          created_at?: string
          destination?: string | null
          id?: string
          method?: string | null
          payment_details?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      jwt_uid: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "support"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "support"],
    },
  },
} as const
