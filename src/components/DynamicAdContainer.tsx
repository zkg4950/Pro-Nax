/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useRef, useState } from 'react';
import { useAdSlot, bumpAdImpression } from '@/hooks/useAdSlot';
import { AdErrorBoundary } from '@/components/ads/AdErrorBoundary';
import { AdLoadingPlaceholder } from '@/components/ads/AdLoadingPlaceholder';
import { useAdPerformance } from '@/lib/ad-performance';
import { useAdBlockDetection } from '@/lib/adblock-detection';

export type AdFormat = 'html_script' | 'api_url';

/** Detects whether the stored ad code is a raw HTML/JS snippet or a plain media/API URL. */
export function detectAdFormat(code: string | null | undefined): AdFormat {
  const c = (code ?? '').trim();
  if (!c) return 'html_script';
  return /^https?:\/\/\S+$/i.test(c) && !c.includes('<') ? 'api_url' : 'html_script';
}

interface DynamicAdContainerProps {
  /** Placement key stored in `ad_settings.slot` (home_feed, in_stream, watch_sidebar…). */
  placement: string;
  className?: string;
  /** Optional click-through URL used for image creatives served from an API URL. */
  clickUrl?: string;
  /** Index for debugging and tracking */
  index?: number;
}

/**
 * Enhanced ad surface with proper loading states, error boundaries, layout shift prevention,
 * ad blocking detection, and performance monitoring.
 */
export function DynamicAdContainer({ placement, className, clickUrl, index }: DynamicAdContainerProps) {
  const { row, loading } = useAdSlot(placement);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);
  const [adVisible, setAdVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bumped = useRef(false);
  const code = row?.html_snippet?.trim() || '';
  
  // Performance monitoring
  const { metrics, recordLoad, recordRender, recordVisible, recordError, recordBlocked } = useAdPerformance(placement);
  
  // Ad blocking detection
  const adBlockDetection = useAdBlockDetection();

  // Track visibility
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !adVisible) {
            setAdVisible(true);
            recordVisible();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [adVisible, recordVisible]);

  // Track impression bump
  useEffect(() => {
    if (!row?.enabled || !code || bumped.current) return;
    bumped.current = true;
    bumpAdImpression(placement);
    recordLoad();
  }, [row, code, placement, recordLoad]);

  // Track ad blocking
  useEffect(() => {
    if (adBlockDetection.isBlocked) {
      recordBlocked();
      console.log('[DynamicAdContainer] Ad blocked for placement:', placement, adBlockDetection);
    }
  }, [adBlockDetection, placement, recordBlocked]);

  // Track render time
  useEffect(() => {
    if (adLoaded && !adError) {
      // Small delay to ensure render is complete
      const timer = setTimeout(() => {
        recordRender();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [adLoaded, adError, recordRender]);

  // Handle ad load completion
  const handleAdLoad = () => {
    setAdLoaded(true);
    setAdError(false);
  };

  // Handle ad error
  const handleAdError = (error: any) => {
    console.error('[DynamicAdContainer] Ad error for placement:', placement, error);
    setAdError(true);
    recordError(error);
  };

  // Show loading placeholder while loading
  if (loading) {
    return <AdLoadingPlaceholder className={className} placement={placement} />;
  }

  // Show nothing if ad is disabled or no code
  if (!row?.enabled || !code) {
    return null;
  }

  // Show error state if ad failed to load
  if (adError) {
    return (
      <div 
        className={`relative aspect-video w-full overflow-hidden rounded-xl border border-white/5 bg-muted/20 flex items-center justify-center ${className}`}
        data-ad-placement={placement}
        data-ad-error="true"
      >
        <div className="text-center text-muted-foreground text-xs">
          <p>Advertisement unavailable</p>
        </div>
      </div>
    );
  }

  const format = detectAdFormat(code);
  const isVideo = format === 'api_url' && /\.(mp4|webm|m3u8)(\?|$)/i.test(code);

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center}img,iframe,video{max-width:100%;max-height:100%}</style></head><body>${code}</body></html>`;

  const creative =
    format === 'api_url' ? (
      isVideo ? (
        <video
          src={code}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          onLoad={handleAdLoad}
          onError={handleAdError}
        />
      ) : (
        <img 
          src={code} 
          alt="Sponsored" 
          loading="lazy" 
          decoding="async" 
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={handleAdLoad}
          onError={handleAdError}
        />
      )
    ) : (
      <iframe
        title={`ad-${placement}`}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 h-full w-full border-0"
        onLoad={handleAdLoad}
        onError={handleAdError}
      />
    );

  const body = (
    <div className="v3d-thumb relative aspect-video w-full overflow-hidden rounded-xl border border-white/5 bg-muted/20">
      {creative}
      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/90">
        Sponsored
      </span>
      {/* Performance indicator (development only) */}
      {process.env.NODE_ENV === 'development' && metrics && (
        <div className="absolute bottom-2 right-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/90">
          {metrics.loadTime}ms
        </div>
      )}
    </div>
  );

  return (
    <AdErrorBoundary
      placement={placement}
      onError={(error, errorInfo) => {
        console.error('[DynamicAdContainer] Error boundary caught:', placement, error, errorInfo);
        handleAdError(error);
      }}
    >
      <div
        ref={containerRef}
        className={className ?? 'v3d-stage group relative w-full px-3 sm:px-0 pb-1 pt-2'}
        data-ad-placement={placement}
        data-ad-index={index}
        data-ad-loaded={adLoaded}
        data-ad-visible={adVisible}
        data-ad-blocked={adBlockDetection.isBlocked}
        aria-label="Advertisement"
      >
        {format === 'api_url' && clickUrl ? (
          <a 
            href={clickUrl} 
            target="_blank" 
            rel="noopener noreferrer sponsored" 
            className="block w-full"
            onClick={() => recordVisible()} // Track clicks
          >
            {body}
          </a>
        ) : (
          body
        )}
      </div>
    </AdErrorBoundary>
  );
}