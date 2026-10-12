/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * Audio Fingerprint Service
 * Handles communication with FastAPI server for audio copyright detection
 */

import { config } from '@/config/app.config';

export interface FingerprintResult {
  success: boolean;
  song_id?: number;
  song_name?: string;
  num_hashes?: number;
  fingerprint_time?: number;
  owner_id?: string;
  video_id?: string;
  file_hash?: string;
  error?: string;
}

export interface RecognitionResult {
  success: boolean;
  matched?: boolean;
  song_id?: number;
  song_name?: string;
  confidence?: number;
  offset_seconds?: number;
  match_time?: number;
  message?: string;
  file_hash?: string;
  error?: string;
}

export interface FingerprintStats {
  success: boolean;
  num_songs?: number;
  num_fingerprints?: number;
  error?: string;
}

class AudioFingerprintService {
  private workerUrl: string;
  private isServiceAvailable: boolean = true;

  constructor(workerUrl?: string) {
    // Use provided URL, config URL, or fallback to localhost
    const copyrightPort = process.env.COPYRIGHT_SERVICE_PORT || '8000';
    this.workerUrl = workerUrl || config.copyright.audioFingerprintUrl || `http://localhost:${copyrightPort}`;
  }

  /**
   * Check if the service is available with timeout
   */
  private async checkServiceAvailability(): Promise<boolean> {
    if (!this.isServiceAvailable) {
      return false; // Already marked as unavailable
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(`${this.workerUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.isServiceAvailable = response.ok;
      return this.isServiceAvailable;
    } catch (error) {
      console.warn('Audio fingerprint service health check failed:', error);
      this.isServiceAvailable = false;
      return false;
    }
  }

  /**
   * Fingerprint an audio/video file for copyright detection
   * Automatically extracts audio from video files using FFmpeg
   */
  async fingerprintAudio(
    audioFile: File,
    songName: string,
    ownerId: string,
    videoId?: string
  ): Promise<FingerprintResult> {
    // Check service availability first
    const isAvailable = await this.checkServiceAvailability();
    if (!isAvailable) {
      console.warn('Audio fingerprint service unavailable, skipping fingerprinting');
      return {
        success: false,
        error: 'Audio fingerprint service unavailable - please ensure Python services are running',
      };
    }

    try {
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('song_name', songName);
      formData.append('owner_id', ownerId);
      if (videoId) {
        formData.append('video_id', videoId);
      }

      const response = await fetch(`${this.workerUrl}/fingerprint`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fingerprinting audio:', error);
      this.isServiceAvailable = false; // Mark as unavailable on error
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Recognize an audio/video file against the fingerprint database
   * Automatically extracts audio from video files using FFmpeg
   */
  async recognizeAudio(audioFile: File): Promise<RecognitionResult> {
    // Check service availability first
    const isAvailable = await this.checkServiceAvailability();
    if (!isAvailable) {
      console.warn('Audio fingerprint service unavailable, skipping recognition');
      return {
        success: false,
        matched: false,
        error: 'Audio fingerprint service unavailable - please ensure Python services are running',
      };
    }

    try {
      const formData = new FormData();
      formData.append('file', audioFile);

      const response = await fetch(`${this.workerUrl}/recognize`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error recognizing audio:', error);
      this.isServiceAvailable = false; // Mark as unavailable on error
      return {
        success: false,
        matched: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get statistics about the fingerprint database
   */
  async getStats(): Promise<FingerprintStats> {
    try {
      const response = await fetch(`${this.workerUrl}/stats`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete fingerprints for a specific song
   */
  async deleteFingerprints(songId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.workerUrl}/fingerprints/${songId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting fingerprints:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if the FastAPI server is healthy
   */
  async healthCheck(): Promise<{ status: string; worker_initialized: boolean }> {
    try {
      const response = await fetch(`${this.workerUrl}/health`);
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'unhealthy', worker_initialized: false };
    }
  }

  /**
   * Check if file is a duplicate using SHA-256 hash
   * This prevents storage waste from duplicate uploads
   */
  async checkDuplicate(file: File): Promise<{ success: boolean; is_duplicate: boolean; file_hash?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.workerUrl}/check-duplicate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking duplicate:', error);
      return {
        success: false,
        is_duplicate: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const audioFingerprintService = new AudioFingerprintService();
