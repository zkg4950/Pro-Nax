/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import React from 'react';

/**
 * Ad blocking detection utility
 * Detects if ad blocking software is active
 */

export interface AdBlockDetectionResult {
  isBlocked: boolean;
  method: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect ad blocking using multiple methods
 */
export function detectAdBlock(): AdBlockDetectionResult {
  const results: { method: string; blocked: boolean; confidence: 'high' | 'medium' | 'low' }[] = [];

  // Method 1: Check for blocked ad classes
  try {
    const adTestDiv = document.createElement('div');
    adTestDiv.innerHTML = '&nbsp;';
    adTestDiv.className = 'adsbox adbanner banner-ad ad-text google-ad';
    adTestDiv.style.position = 'absolute';
    adTestDiv.style.left = '-99999px';
    document.body.appendChild(adTestDiv);
    
    const isBlocked = adTestDiv.offsetHeight === 0 || adTestDiv.style.display === 'none';
    document.body.removeChild(adTestDiv);
    
    results.push({
      method: 'blocked-classes',
      blocked: isBlocked,
      confidence: 'high'
    });
  } catch {
    results.push({
      method: 'blocked-classes',
      blocked: false,
      confidence: 'low'
    });
  }

  // Method 2: Check for common ad server blocking
  try {
    const testUrl = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    const testScript = document.createElement('script');
    testScript.src = testUrl;
    testScript.async = true;
    testScript.style.display = 'none';
    
    // We can't actually load this, but we can check if it would be blocked
    // by checking if common ad domains are accessible
    results.push({
      method: 'ad-server-block',
      blocked: false, // Can't reliably test without network requests
      confidence: 'low'
    });
  } catch {
    results.push({
      method: 'ad-server-block',
      blocked: false,
      confidence: 'low'
    });
  }

  // Method 3: Check for ad-blocking extensions
  try {
    const hasAdBlockExtension = 
      typeof window !== 'undefined' && 
      ((window as any).adblock !== undefined || 
       (window as any).blockAdBlock !== undefined ||
       (window as any).AdblockPlus !== undefined);
    
    results.push({
      method: 'extension-detection',
      blocked: hasAdBlockExtension,
      confidence: 'high'
    });
  } catch {
    results.push({
      method: 'extension-detection',
      blocked: false,
      confidence: 'low'
    });
  }

  // Method 4: Check for blocked ad elements in DOM
  try {
    const adElements = document.querySelectorAll('[class*="ad-"], [id*="ad-"], [class*="banner"], [id*="banner"]');
    let blockedCount = 0;
    
    adElements.forEach(el => {
      const computedStyle = window.getComputedStyle(el);
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        blockedCount++;
      }
    });
    
    results.push({
      method: 'dom-element-analysis',
      blocked: blockedCount > 0,
      confidence: blockedCount > 2 ? 'high' : 'medium'
    });
  } catch {
    results.push({
      method: 'dom-element-analysis',
      blocked: false,
      confidence: 'low'
    });
  }

  // Aggregate results
  const highConfidenceBlocked = results.filter(r => r.blocked && r.confidence === 'high').length > 0;
  const mediumConfidenceBlocked = results.filter(r => r.blocked && r.confidence === 'medium').length > 0;
  const anyBlocked = results.filter(r => r.blocked).length > 0;

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (highConfidenceBlocked) {
    confidence = 'high';
  } else if (mediumConfidenceBlocked || anyBlocked) {
    confidence = 'medium';
  }

  const blockedMethod = results.find(r => r.blocked)?.method || 'unknown';

  return {
    isBlocked: highConfidenceBlocked || (anyBlocked && confidence !== 'low'),
    method: blockedMethod,
    confidence
  };
}

/**
 * Hook to detect ad blocking
 */
export function useAdBlockDetection() {
  const [result, setResult] = React.useState<AdBlockDetectionResult>({
    isBlocked: false,
    method: 'unknown',
    confidence: 'low'
  });

  React.useEffect(() => {
    // Delay detection to avoid affecting initial render
    const timer = setTimeout(() => {
      const detectionResult = detectAdBlock();
      setResult(detectionResult);
      
      // Log for analytics
      console.log('[AdBlockDetection]', detectionResult);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return result;
}