/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import { Video as StudioVideo } from '../types';
import { Video as EditorVideo, VideoBlurOverlay, VideoEndScreenElement } from '../components/editor/types';

/**
 * Type conversion utilities between Studio Video and Editor Video interfaces
 * Ensures type safety and proper data transformation
 */

/**
 * Convert Studio Video to Editor Video format
 */
export function studioVideoToEditorVideo(studioVideo: StudioVideo): EditorVideo {
  // Validate input data
  if (!studioVideo || !studioVideo.id) {
    throw new Error('Invalid studio video data: missing required fields');
  }

  // Convert restrictions to appropriate format
  let restrictions: string[] | string | undefined;
  if (Array.isArray(studioVideo.restrictions)) {
    restrictions = studioVideo.restrictions;
  } else if (typeof studioVideo.restrictions === 'string' && studioVideo.restrictions !== 'None') {
    restrictions = [studioVideo.restrictions];
  } else {
    restrictions = undefined;
  }

  // Convert blur overlays with proper type mapping
  const blurOverlays: VideoBlurOverlay[] = (studioVideo.blurOverlays || []).map((overlay: any) => {
    const validTypes: Array<"face" | "logo" | "plate" | "custom"> = ["face", "logo", "plate", "custom"];
    const safeType = validTypes.includes(overlay.type) ? overlay.type : "face";
    return {
      id: overlay.id,
      type: safeType,
      shape: overlay.shape === 'box' ? 'rect' : 'ellipse', // Map box to rect
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      startTime: overlay.startTime,
      endTime: overlay.endTime,
    };
  });

  // Convert end screen elements with proper type mapping
  const endScreenElements: VideoEndScreenElement[] = (studioVideo.endScreenElements || []).map((element: any) => ({
    id: element.id,
    type: element.type === 'video' ? 'video' :
           element.type === 'subscribe' ? 'subscribe' :
           element.type === 'playlist' ? 'playlist' : 'link',
    label: element.title || element.type,
    x: element.x,
    y: element.y,
    width: element.width || 100, // Default width if not specified
    height: element.height || 60, // Default height if not specified
    startTime: element.startTime,
    endTime: element.endTime,
  }));

  return {
    id: studioVideo.id,
    title: studioVideo.title,
    url: studioVideo.videoUrl,
    videoUrl: studioVideo.videoUrl,
    thumbnail: studioVideo.thumbnail,
    duration: studioVideo.duration,
    restrictions,
    trimmedStartSec: studioVideo.trimmedStartSec,
    trimmedEndSec: studioVideo.trimmedEndSec,
    blurOverlays,
    endScreenElements,
  };
}

/**
 * Convert Editor Video back to Studio Video format
 */
export function editorVideoToStudioVideo(editorVideo: EditorVideo, originalStudioVideo: StudioVideo): StudioVideo {
  // Validate input data
  if (!editorVideo || !editorVideo.id) {
    throw new Error('Invalid editor video data: missing required fields');
  }

  if (!originalStudioVideo) {
    throw new Error('Original studio video data required for conversion');
  }

  // Convert restrictions back to Studio format
  let restrictions: any;
  if (Array.isArray(editorVideo.restrictions)) {
    restrictions = editorVideo.restrictions;
  } else if (typeof editorVideo.restrictions === 'string') {
    restrictions = editorVideo.restrictions;
  } else {
    restrictions = 'None';
  }

  // Convert blur overlays back to Studio format
  const blurOverlays: any[] = (editorVideo.blurOverlays || []).map(overlay => ({
    id: overlay.id,
    type: overlay.type === 'face' ? 'face' : 'custom',
    shape: overlay.shape === 'rect' ? 'box' : 'ellipse',
    x: overlay.x,
    y: overlay.y,
    width: overlay.width,
    height: overlay.height,
    startTime: overlay.startTime,
    endTime: overlay.endTime,
  }));

  // Convert end screen elements back to Studio format
  const endScreenElements = (editorVideo.endScreenElements || []).map(element => ({
    id: element.id,
    type: element.type,
    title: element.label,
    x: element.x,
    y: element.y,
    startTime: element.startTime,
    endTime: element.endTime,
  }));

  return {
    ...originalStudioVideo,
    title: editorVideo.title,
    videoUrl: editorVideo.videoUrl || editorVideo.url,
    thumbnail: editorVideo.thumbnail || originalStudioVideo.thumbnail,
    duration: editorVideo.duration || originalStudioVideo.duration,
    restrictions,
    trimmedStartSec: editorVideo.trimmedStartSec,
    trimmedEndSec: editorVideo.trimmedEndSec,
    blurOverlays,
    endScreenElements,
  };
}

/**
 * Validate Studio Video data before conversion
 */
export function validateStudioVideo(video: StudioVideo): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!video.id) errors.push('Video ID is required');
  if (!video.title || video.title.trim().length === 0) errors.push('Video title is required');
  if (!video.duration) errors.push('Video duration is required');
  if (!video.thumbnail) errors.push('Video thumbnail is required');

  // Validate blur overlays if present
  if (video.blurOverlays) {
    video.blurOverlays.forEach((overlay, index) => {
      if (!overlay.id) errors.push(`Blur overlay ${index + 1} is missing ID`);
      if (overlay.startTime < 0) errors.push(`Blur overlay ${index + 1} has invalid start time`);
      if (overlay.endTime <= overlay.startTime) errors.push(`Blur overlay ${index + 1} has invalid end time`);
      if (overlay.width <= 0 || overlay.height <= 0) errors.push(`Blur overlay ${index + 1} has invalid dimensions`);
    });
  }

  // Validate end screen elements if present
  if (video.endScreenElements) {
    video.endScreenElements.forEach((element, index) => {
      if (!element.id) errors.push(`End screen element ${index + 1} is missing ID`);
      if (element.startTime < 0) errors.push(`End screen element ${index + 1} has invalid start time`);
      if (element.endTime <= element.startTime) errors.push(`End screen element ${index + 1} has invalid end time`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate Editor Video data before conversion
 */
export function validateEditorVideo(video: EditorVideo): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!video.id) errors.push('Video ID is required');
  if (!video.title || video.title.trim().length === 0) errors.push('Video title is required');

  // Validate blur overlays if present
  if (video.blurOverlays) {
    video.blurOverlays.forEach((overlay, index) => {
      if (!overlay.id) errors.push(`Blur overlay ${index + 1} is missing ID`);
      if (overlay.startTime < 0) errors.push(`Blur overlay ${index + 1} has invalid start time`);
      if (overlay.endTime <= overlay.startTime) errors.push(`Blur overlay ${index + 1} has invalid end time`);
      if (overlay.width <= 0 || overlay.height <= 0) errors.push(`Blur overlay ${index + 1} has invalid dimensions`);
    });
  }

  // Validate end screen elements if present
  if (video.endScreenElements) {
    video.endScreenElements.forEach((element, index) => {
      if (!element.id) errors.push(`End screen element ${index + 1} is missing ID`);
      if (element.startTime < 0) errors.push(`End screen element ${index + 1} has invalid start time`);
      if (element.endTime <= element.startTime) errors.push(`End screen element ${index + 1} has invalid end time`);
      if (element.width <= 0 || element.height <= 0) errors.push(`End screen element ${index + 1} has invalid dimensions`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Type guard to check if a video is a Studio Video
 */
export function isStudioVideo(video: any): video is StudioVideo {
  return video && 
         typeof video.id === 'string' &&
         typeof video.title === 'string' &&
         typeof video.description === 'string' &&
         typeof video.views === 'number';
}

/**
 * Type guard to check if a video is an Editor Video
 */
export function isEditorVideo(video: any): video is EditorVideo {
  return video && 
         typeof video.id === 'string' &&
         typeof video.title === 'string' &&
         (typeof video.url === 'string' || typeof video.videoUrl === 'string');
}