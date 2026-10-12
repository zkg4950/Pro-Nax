/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * Resumable Upload System
 * Supports chunked uploads with pause/resume/retry functionality
 */

import { getItem, setItem, getJSON, setJSON } from '@/lib/safeStorage';

export interface UploadChunk {
  index: number;
  offset: number;
  size: number;
  uploaded: boolean;
  retryCount: number;
}

export interface UploadState {
  fileId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: number;
  chunks: UploadChunk[];
  status: 'idle' | 'uploading' | 'paused' | 'completed' | 'failed';
  lastUpdated: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const STORAGE_KEY = 'pronax_upload_states';

/**
 * Generate unique file ID for tracking
 */
export function generateFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/**
 * Calculate total chunks needed for file
 */
export function calculateTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

/**
 * Initialize upload state for a file
 */
export function initializeUploadState(file: File): UploadState {
  const fileId = generateFileId(file);
  const totalChunks = calculateTotalChunks(file.size);
  
  const chunks: UploadChunk[] = [];
  for (let i = 0; i < totalChunks; i++) {
    chunks.push({
      index: i,
      offset: i * CHUNK_SIZE,
      size: Math.min(CHUNK_SIZE, file.size - (i * CHUNK_SIZE)),
      uploaded: false,
      retryCount: 0,
    });
  }

  const state: UploadState = {
    fileId,
    fileName: file.name,
    fileSize: file.size,
    totalChunks,
    uploadedChunks: 0,
    chunks,
    status: 'idle',
    lastUpdated: new Date().toISOString(),
  };

  saveUploadState(state);
  return state;
}

/**
 * Get upload state from localStorage
 */
export function getUploadState(fileId: string): UploadState | null {
  const states = getJSON<Record<string, UploadState>>(STORAGE_KEY, {});
  return states[fileId] || null;
}

/**
 * Save upload state to localStorage
 */
export function saveUploadState(state: UploadState): void {
  const states = getJSON<Record<string, UploadState>>(STORAGE_KEY, {});
  states[state.fileId] = {
    ...state,
    lastUpdated: new Date().toISOString(),
  };
  setJSON(STORAGE_KEY, states);
}

/**
 * Remove upload state from localStorage
 */
export function removeUploadState(fileId: string): void {
  const states = getJSON<Record<string, UploadState>>(STORAGE_KEY, {});
  delete states[fileId];
  setJSON(STORAGE_KEY, states);
}

/**
 * Get all incomplete uploads
 */
export function getIncompleteUploads(): UploadState[] {
  const states = getJSON<Record<string, UploadState>>(STORAGE_KEY, {});
  return Object.values(states).filter(
    (state: UploadState) => state.status !== 'completed' && state.status !== 'failed'
  );
}

/**
 * Get chunk data from file
 */
export function getChunkData(file: File, chunk: UploadChunk): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(chunk.offset, chunk.offset + chunk.size);
    const reader = new FileReader();
    reader.onload = () => resolve(new Blob([reader.result as ArrayBuffer]));
    reader.onerror = reject;
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Upload a single chunk with retry logic
 */
export async function uploadChunk(
  file: File,
  chunk: UploadChunk,
  uploadUrl: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      const chunkData = await getChunkData(file, chunk);
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${chunk.offset}-${chunk.offset + chunk.size - 1}/${file.size}`,
          'Content-Type': file.type,
        },
        body: chunkData,
      });

      if (response.ok) {
        return { success: true };
      }

      retryCount++;
      if (retryCount <= maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    } catch (error) {
      retryCount++;
      if (retryCount <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }
  }

  return { 
    success: false, 
    error: `Failed to upload chunk ${chunk.index} after ${maxRetries} retries` 
  };
}

/**
 * Perform resumable upload
 */
export async function performResumableUpload(
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void,
  onChunkComplete?: (chunkIndex: number) => void,
  onPause?: () => boolean
): Promise<{ success: boolean; error?: string }> {
  const fileId = generateFileId(file);
  let state = getUploadState(fileId);

  if (!state) {
    state = initializeUploadState(file);
  }

  state.status = 'uploading';
  saveUploadState(state);

  try {
    for (let i = 0; i < state.chunks.length; i++) {
      // Check if paused
      if (onPause && onPause()) {
        state.status = 'paused';
        saveUploadState(state);
        return { success: false, error: 'Upload paused' };
      }

      const chunk = state.chunks[i];
      
      // Skip already uploaded chunks
      if (chunk.uploaded) {
        continue;
      }

      const result = await uploadChunk(file, chunk, uploadUrl);

      if (result.success) {
        chunk.uploaded = true;
        state.uploadedChunks++;
        state.chunks[i] = chunk;
        saveUploadState(state);
        
        const progress = (state.uploadedChunks / state.totalChunks) * 100;
        onProgress(progress);
        
        if (onChunkComplete) {
          onChunkComplete(i);
        }
      } else {
        chunk.retryCount++;
        state.chunks[i] = chunk;
        saveUploadState(state);
        
        if (chunk.retryCount >= 3) {
          state.status = 'failed';
          saveUploadState(state);
          return { success: false, error: result.error };
        }
        
        // Retry this chunk
        i--;
      }
    }

    state.status = 'completed';
    saveUploadState(state);
    removeUploadState(fileId);
    
    return { success: true };
  } catch (error) {
    state.status = 'failed';
    saveUploadState(state);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    };
  }
}

/**
 * Resume an incomplete upload
 */
export function resumeUpload(fileId: string): UploadState | null {
  const state = getUploadState(fileId);
  if (state && state.status === 'paused') {
    state.status = 'uploading';
    saveUploadState(state);
    return state;
  }
  return null;
}

/**
 * Cancel an upload
 */
export function cancelUpload(fileId: string): void {
  removeUploadState(fileId);
}