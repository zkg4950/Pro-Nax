/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
// Google IMA SDK adapter — loads on demand and requests a VAST/VMAP tag.
// Hands back lifecycle events so the player can pause/resume the content video,
// and reports the served impression to `record_ad_view` for wallet crediting.
//
// Usage:
//   const ima = useImaAds({
//     vastTagUrl,                       // VAST/VMAP url from Adsterra / PropellerAds / Google Ad Manager
//     videoElement: videoRef.current,
//     adContainer: adContainerRef.current,
//     videoId,                          // platform video id — used for wallet crediting
//     onAdStarted, onAdEnded, onAllAdsCompleted, onAdError,
//   });
//   ima.requestAds();                   // call after user-gesture (e.g. first play click)
//
// VAST tag examples:
//   Adsterra:     https://www.profitabledisplaynetwork.com/<zone>/vast.xml
//   PropellerAds: https://www.cooperateddingtomeasures.com/<zone>?vast=1
//   Google AdX:   https://pubads.g.doubleclick.net/gampad/ads?...&output=vast

import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/loose';
import { requestAdImpression } from '@/lib/adSdk';

declare global {
  interface Window {
    google?: any;
  }
}

const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
let imaLoadPromise: Promise<void> | null = null;

function loadImaSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.ima) return Promise.resolve();
  if (imaLoadPromise) return imaLoadPromise;
  imaLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = IMA_SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { imaLoadPromise = null; reject(new Error('IMA SDK load failed')); };
    document.head.appendChild(s);
  });
  return imaLoadPromise;
}

export interface UseImaAdsOptions {
  vastTagUrl?: string;
  videoElement: HTMLVideoElement | null;
  adContainer: HTMLDivElement | null;
  videoId?: string;
  onAdStarted?: () => void;
  onAdEnded?: () => void;
  onAllAdsCompleted?: () => void;
  onAdError?: (e: unknown) => void;
}

export function useImaAds(opts: UseImaAdsOptions) {
  const adsManagerRef = useRef<any>(null);
  const adsLoaderRef = useRef<any>(null);
  const displayContainerRef = useRef<any>(null);

  const cleanup = useCallback(() => {
    try { adsManagerRef.current?.destroy(); } catch { /* noop */ }
    try { displayContainerRef.current?.destroy(); } catch { /* noop */ }
    adsManagerRef.current = null;
    adsLoaderRef.current = null;
    displayContainerRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const creditAdView = useCallback(async () => {
    if (!opts.videoId) return;
    try {
      const impr = await requestAdImpression({
        videoId: opts.videoId,
        placementType: 'shorts',
        isShort: true
      });
      if (!impr.filled) return;
      await supabase.rpc('record_ad_view_by_placement', {
        p_video_id: opts.videoId,
        p_ad_revenue: impr.revenue,
        p_ad_network: impr.network,
        p_cpm: impr.adjustedCpm || impr.cpm,
        p_country_code: impr.countryCode || null,
        p_country_name: impr.countryName || null,
        p_country_tier: impr.countryTier || null,
        p_placement_type: 'shorts',
      });
    } catch { /* swallow — never break playback on accounting failure */ }
  }, [opts.videoId]);

  const requestAds = useCallback(async () => {
    if (!opts.vastTagUrl || !opts.videoElement || !opts.adContainer) return;
    try {
      await loadImaSdk();
      const ima = window.google!.ima;
      cleanup();

      const display = new ima.AdDisplayContainer(opts.adContainer, opts.videoElement);
      display.initialize();
      displayContainerRef.current = display;

      const loader = new ima.AdsLoader(display);
      adsLoaderRef.current = loader;

      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e: any) => {
        const settings = new ima.AdsRenderingSettings();
        settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
        const manager = e.getAdsManager(opts.videoElement, settings);
        adsManagerRef.current = manager;

        manager.addEventListener(ima.AdEvent.Type.STARTED, () => { opts.onAdStarted?.(); creditAdView(); });
        manager.addEventListener(ima.AdEvent.Type.COMPLETE, () => opts.onAdEnded?.());
        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => opts.onAllAdsCompleted?.());
        manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (err: any) => opts.onAdError?.(err.getError?.() ?? err));

        try {
          const w = opts.videoElement!.clientWidth || 640;
          const h = opts.videoElement!.clientHeight || 360;
          manager.init(w, h, ima.ViewMode.NORMAL);
          manager.start();
        } catch (err) { opts.onAdError?.(err); }
      }, false);
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (err: any) => opts.onAdError?.(err.getError?.() ?? err), false);

      const req = new ima.AdsRequest();
      req.adTagUrl = opts.vastTagUrl;
      req.linearAdSlotWidth = opts.videoElement.clientWidth || 640;
      req.linearAdSlotHeight = opts.videoElement.clientHeight || 360;
      req.nonLinearAdSlotWidth = opts.videoElement.clientWidth || 640;
      req.nonLinearAdSlotHeight = (opts.videoElement.clientHeight || 360) / 3;
      loader.requestAds(req);
    } catch (err) {
      opts.onAdError?.(err);
    }
  }, [opts, cleanup, creditAdView]);

  return { requestAds, cleanup };
}
