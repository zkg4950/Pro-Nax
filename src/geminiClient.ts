/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * Routes Pronax Studio's AI calls to the `pronax-gemini` edge function.
 *
 * CONTRACT: every function here returns either a real model result
 * (`{ ok: true, data }`) or an explicit failure (`{ ok: false, reason }`).
 *
 * There are deliberately NO fallback objects. A fabricated score, view count,
 * or revenue prediction rendered as if it came from a model is worse than no
 * answer at all: it is indistinguishable from a real result to the person
 * reading it, and it silently drives moderation and payout decisions. When the
 * model is unreachable, callers must surface "Analysis unavailable, retry".
 */
import type { AIContentQualityAssessment } from '@/lib/mlAlgorithmEngine';

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pronax-gemini`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Discriminated result: a real model answer, or an honest failure reason. */
export type AIResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Human-readable failure text for UI. Never implies a result was produced. */
export const AI_UNAVAILABLE = 'Analysis unavailable, retry';

export function geminiFetch(action: string, init?: RequestInit) {
  return fetch(`${BASE}/${action}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * Single transport for every AI action. Converts transport/HTTP/parse failures
 * into `{ ok: false, reason }` — never into a synthesized payload.
 */
async function callAI<T>(action: string, body: unknown): Promise<AIResult<T>> {
  try {
    const res = await geminiFetch(action, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      return { ok: false, reason: `${AI_UNAVAILABLE} (service responded ${res.status})` };
    }
    const parsed = (await res.json()) as unknown;
    if (parsed == null || typeof parsed !== 'object') {
      return { ok: false, reason: `${AI_UNAVAILABLE} (malformed response)` };
    }
    return { ok: true, data: parsed as T };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error';
    return { ok: false, reason: `${AI_UNAVAILABLE} (${detail})` };
  }
}

// ---------- Result shapes ----------

/**
 * Every field is optional on purpose: the UI must render only what the model
 * actually returned, never a padded default.
 */
export type ContentQualityResult = Partial<AIContentQualityAssessment> & {
  reasoning?: string;
};

export interface AlgorithmWeightsResult {
  optimizedWeights?: Record<string, number>;
  expectedPerformanceLiftPct?: number;
  reasoning?: string;
  focusRecommendation?: string;
}

export interface ModerationResult {
  isApproved: boolean;
  flagged: boolean;
  toxicityScore: number;
  spamScore: number;
  sentiment: string;
  categories: {
    toxicity: boolean;
    hateSpeech: boolean;
    harassment: boolean;
    spam: boolean;
    copyrightRisk: boolean;
  };
  reasoning?: string;
  suggestedAction?: string;
}

export interface VideoAnalysisResult {
  optimalThumbnails?: Array<{
    timestampSeconds: number;
    aestheticScore?: number;
    faceDetected?: boolean;
    description?: string;
    recommendedForCTR?: boolean;
  }>;
  keyMoments?: Array<{ timestampSeconds: number; label: string; importanceScore?: number }>;
  autoTags?: string[];
  aestheticQualityScore?: number;
  contentSummary?: string;
}

export interface CopyrightEvaluationResult {
  merit_score: number;
  merit_level: string;
  recommendation: string;
  reasoning: string;
  fair_use_factors: {
    transformative_nature: number;
    amount_used: number;
    market_effect: number;
  };
}

export interface CreatorCoachResult {
  advice: string;
  suggestions: string[];
  actionItems: string[];
  estimatedImpact: string;
  viralIdeas?: string[];
  titleExamples?: string[];
  scriptTemplate?: {
    hook: string;
    value: string;
    engagement: string;
    cta: string;
  };
}

// ---------- Actions ----------

export function analyzeVideoContentQuality(videoData: {
  title: string;
  description?: string;
  tags?: string[];
  category?: string;
  duration_seconds?: number;
  quality_resolution?: string;
}): Promise<AIResult<ContentQualityResult>> {
  return callAI<ContentQualityResult>('analyze-content-quality', videoData);
}

export function optimizeAlgorithmWeightsWithAI(
  currentWeights: Record<string, number>,
  metrics?: unknown,
): Promise<AIResult<AlgorithmWeightsResult>> {
  return callAI<AlgorithmWeightsResult>('optimize-algorithm-weights', { currentWeights, metrics });
}

export function analyzeContentWithAI(options: {
  text: string;
  title?: string;
  sentimentAnalysis?: boolean;
  toxicityDetection?: boolean;
  spamDetection?: boolean;
}): Promise<AIResult<ModerationResult>> {
  return callAI<ModerationResult>('analyze-content-moderation', options);
}

export function analyzeVideoWithAI(options: {
  videoFile?: File;
  title?: string;
  duration_seconds?: number;
  generateOptimalThumbnails?: boolean;
  detectKeyMoments?: boolean;
  aestheticScoring?: boolean;
  faceDetection?: boolean;
}): Promise<AIResult<VideoAnalysisResult>> {
  const title = options.title || options.videoFile?.name?.replace(/\.[^/.]+$/, '') || 'Untitled Video';
  return callAI<VideoAnalysisResult>('analyze-video-ai', {
    title,
    // Only forward a duration we actually know; no invented default.
    duration_seconds: options.duration_seconds,
    generateOptimalThumbnails: options.generateOptimalThumbnails ?? true,
    detectKeyMoments: options.detectKeyMoments ?? true,
    aestheticScoring: options.aestheticScoring ?? true,
    faceDetection: options.faceDetection ?? true,
  });
}

export function evaluateCopyrightDisputeWithAI(input: {
  claimId: string;
  videoTitle?: string;
  matchedReference?: string | null;
  matchType?: string | null;
  confidenceScore?: number | null;
  timestampStart?: string | null;
  timestampEnd?: string | null;
  durationSec: number;
  disputeReason?: string | null;
  claimant?: string | null;
}): Promise<AIResult<CopyrightEvaluationResult>> {
  return callAI<CopyrightEvaluationResult>('detect-copyright', input);
}

export function creatorCoachWithAI(request: {
  request: string;
  metrics?: Record<string, unknown>;
  recentVideos?: Array<unknown>;
}): Promise<AIResult<CreatorCoachResult>> {
  return callAI<CreatorCoachResult>('creator-coach', request);
}

/**
 * Validates that a copyright evaluation carries the fields the UI renders.
 * A partial payload is treated as a failure rather than padded with defaults.
 */
export function isCompleteCopyrightEvaluation(
  value: unknown,
): value is CopyrightEvaluationResult {
  if (value == null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const factors = v['fair_use_factors'] as Record<string, unknown> | undefined;
  return (
    typeof v['merit_score'] === 'number' &&
    typeof v['merit_level'] === 'string' &&
    typeof v['recommendation'] === 'string' &&
    factors != null &&
    typeof factors['transformative_nature'] === 'number' &&
    typeof factors['amount_used'] === 'number' &&
    typeof factors['market_effect'] === 'number'
  );
}
