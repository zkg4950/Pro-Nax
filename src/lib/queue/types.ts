/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * Queue Type Definitions
 * Defines job types, data structures, and return types for async task queues
 */

export type JobType =
  | 'video-processing'
  | 'video-transcoding'
  | 'analytics-aggregation'
  | 'analytics-sync'
  | 'email-notification'
  | 'push-notification'
  | 'content-moderation'
  | 'copyright-check'
  | 'thumbnail-generation'
  | 'subtitle-generation'
  | 'supervisor-check';

/**
 * Video Processing Job Data
 */
export interface VideoProcessingJobData {
  videoId: string;
  videoPath: string;
  ownerId: string;
  thumbnail?: string;
  duration?: number;
  isShort?: boolean;
}

/**
 * Video Transcoding Job Data
 */
export interface VideoTranscodingJobData {
  videoId: string;
  inputPath: string;
  outputFormats: Array<'1080p' | '720p' | '480p' | '360p'>;
  ownerId: string;
}

/**
 * Analytics Aggregation Job Data
 */
export interface AnalyticsAggregationJobData {
  videoId?: string;
  userId?: string;
  channelId?: string;
  startDate: Date;
  endDate: Date;
  metrics: Array<'views' | 'likes' | 'comments' | 'shares' | 'watch-time'>;
}

/**
 * Analytics Sync Job Data
 */
export interface AnalyticsSyncJobData {
  events: Array<{
    userId?: string;
    videoId: string;
    eventType: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Email Notification Job Data
 */
export interface EmailNotificationJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Push Notification Job Data
 */
export interface PushNotificationJobData {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Content Moderation Job Data
 */
export interface ContentModerationJobData {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  userId: string;
  autoApproveThreshold?: number;
}

/**
 * Copyright Check Job Data
 */
export interface CopyrightCheckJobData {
  videoId: string;
  videoPath: string;
  ownerId: string;
  strictMode?: boolean;
}

/**
 * Thumbnail Generation Job Data
 */
export interface ThumbnailGenerationJobData {
  videoId: string;
  videoPath: string;
  timestamps?: number[]; // Timestamps to generate thumbnails at
  count?: number; // Number of thumbnails to generate
}

/**
 * Subtitle Generation Job Data
 */
export interface SubtitleGenerationJobData {
  videoId: string;
  videoPath: string;
  languages: string[];
  autoGenerate?: boolean;
}

/**
 * Supervisor Check Job Data
 */
export interface SupervisorCheckJobData {
  eventType?: string;
  severity?: string;
  data?: Record<string, any>;
  source?: string;
}

/**
 * Job Result Types
 */
export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  retryable?: boolean;
}

/**
 * Video Processing Result
 */
export interface VideoProcessingResult extends JobResult {
  data?: {
    videoId: string;
    thumbnailUrl?: string;
    duration?: number;
    isShort?: boolean;
    processedAt: Date;
  };
}

/**
 * Video Transcoding Result
 */
export interface VideoTranscodingResult extends JobResult {
  data?: {
    videoId: string;
    formats: Array<{
      quality: string;
      url: string;
      size: number;
    }>;
    processedAt: Date;
  };
}

/**
 * Analytics Aggregation Result
 */
export interface AnalyticsAggregationResult extends JobResult {
  data?: {
    videoId?: string;
    userId?: string;
    channelId?: string;
    startDate: Date;
    endDate: Date;
    metrics: Record<string, number>;
    aggregatedAt: Date;
  };
}

/**
 * Notification Result
 */
export interface NotificationResult extends JobResult {
  data?: {
    sent: boolean;
    delivered?: boolean;
    deliveredAt?: Date;
    error?: string;
  };
}

/**
 * Content Moderation Result
 */
export interface ContentModerationResult extends JobResult {
  data?: {
    videoId: string;
    approved: boolean;
    score: number;
    flags: string[];
    moderatedAt: Date;
  };
}

/**
 * Copyright Check Result
 */
export interface CopyrightCheckResult extends JobResult {
  data?: {
    videoId: string;
    hasCopyright: boolean;
    matches?: Array<{
      fingerprint: string;
      confidence: number;
      offset: number;
    }>;
    checkedAt: Date;
  };
}

/**
 * Job Options
 */
export interface JobOptions {
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed' | 'custom';
    delay: number;
  };
  delay?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
  priority?: number;
  repeat?: {
    every?: number;
    pattern?: string;
  };
  lifo?: boolean;
  timeout?: number;
}

/**
 * Queue Configuration
 */
export interface QueueConfig {
  connection: {
    host: string;
    port: number;
    password?: string;
  };
  defaultJobOptions?: JobOptions;
}

/**
 * Worker Configuration
 */
export interface WorkerConfig {
  connection: {
    host: string;
    port: number;
    password?: string;
  };
  concurrency: number;
  limiter?: {
    max: number;
    duration: number;
  };
}

/**
 * Job Data Union
 */
export type JobDataUnion =
  | VideoProcessingJobData
  | VideoTranscodingJobData
  | AnalyticsAggregationJobData
  | AnalyticsSyncJobData
  | EmailNotificationJobData
  | PushNotificationJobData
  | ContentModerationJobData
  | CopyrightCheckJobData
  | ThumbnailGenerationJobData
  | SubtitleGenerationJobData
  | SupervisorCheckJobData;

/**
 * Job Result Union
 */
export type JobResultUnion =
  | VideoProcessingResult
  | VideoTranscodingResult
  | AnalyticsAggregationResult
  | NotificationResult
  | ContentModerationResult
  | CopyrightCheckResult;
