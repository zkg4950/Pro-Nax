/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useCallback, useRef } from 'react';
import { AdSlot, demoAds, getMidrollTimestamps } from '@/lib/adNetworks';

// CRITICAL: This ad manager uses DEMO ADS only and does NOT integrate with the actual
// monetization system (requestAdImpression, record_ad_view). Mid-roll ads are currently
// NOT monetized - they are demo placeholders only. To monetize mid-rolls, this hook must
// be refactored to use the IMA SDK and call requestAdImpression/record_ad_view for each mid-roll.

export interface AdManagerState {
  isAdPlaying: boolean;
  currentAd: AdSlot | null;
  canSkip: boolean;
  skipCountdown: number;
  adBlockDetected: boolean;
  prerollCompleted: boolean;
  triggeredMidrolls: Set<number>;
}

export function useAdManager(videoDuration: number = 600) {
  const [state, setState] = useState<AdManagerState>({
    isAdPlaying: false,
    currentAd: null,
    canSkip: false,
    skipCountdown: 0,
    adBlockDetected: false,
    prerollCompleted: false,
    triggeredMidrolls: new Set(),
  });

  const skipTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const midrollPoints = getMidrollTimestamps(videoDuration);

  const showAd = useCallback((ad: AdSlot) => {
    setState(prev => ({
      ...prev,
      isAdPlaying: true,
      currentAd: ad,
      canSkip: !ad.skipAfter,
      skipCountdown: ad.skipAfter || 0,
    }));

    if (ad.skipAfter) {
      let countdown = ad.skipAfter;
      skipTimerRef.current = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(skipTimerRef.current);
          setState(prev => ({ ...prev, canSkip: true, skipCountdown: 0 }));
        } else {
          setState(prev => ({ ...prev, skipCountdown: countdown }));
        }
      }, 1000);
    }
  }, []);

  const dismissAd = useCallback(() => {
    if (skipTimerRef.current) clearInterval(skipTimerRef.current);
    setState(prev => ({
      ...prev,
      isAdPlaying: false,
      currentAd: null,
      canSkip: false,
      skipCountdown: 0,
      prerollCompleted: prev.currentAd?.placement === 'preroll' ? true : prev.prerollCompleted,
    }));
  }, []);

  const triggerPreroll = useCallback(() => {
    const preroll = demoAds.find(a => a.placement === 'preroll');
    if (preroll && !state.prerollCompleted) showAd(preroll);
    else setState(prev => ({ ...prev, prerollCompleted: true }));
  }, [showAd, state.prerollCompleted]);

  const checkMidroll = useCallback((currentTime: number) => {
    for (const point of midrollPoints) {
      if (
        Math.abs(currentTime - point) < 2 &&
        !state.triggeredMidrolls.has(point) &&
        !state.isAdPlaying
      ) {
        const midroll = demoAds.find(a => a.placement === 'midroll');
        if (midroll) {
          setState(prev => ({
            ...prev,
            triggeredMidrolls: new Set([...prev.triggeredMidrolls, point]),
          }));
          showAd(midroll);
        }
        break;
      }
    }
  }, [midrollPoints, showAd, state.triggeredMidrolls, state.isAdPlaying]);

  const detectAdBlock = useCallback(async () => {
    try {
      await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
        method: 'HEAD',
        mode: 'no-cors',
      });
      setState(prev => ({ ...prev, adBlockDetected: false }));
    } catch {
      setState(prev => ({ ...prev, adBlockDetected: true }));
    }
  }, []);

  const dismissAdBlock = useCallback(() => {
    setState(prev => ({ ...prev, adBlockDetected: false }));
  }, []);

  return {
    ...state,
    showAd,
    dismissAd,
    triggerPreroll,
    checkMidroll,
    detectAdBlock,
    dismissAdBlock,
    overlayAd: demoAds.find(a => a.placement === 'overlay') || null,
  };
}
