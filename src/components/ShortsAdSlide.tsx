/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
// Full-screen Shorts ad slide. ProNax Sponsored interstitial.
// • Uses Google IMA + VITE_SHORTS_VAST_URL when configured (real ad serving).
// • On impression, credits the just-watched short's uploader via record_ad_view
//   so revenue flows under the Upload-to-Earn model (55% creator / 45% platform).
// • Falls back to a polished "Sponsored slot available" placeholder otherwise,
//   so the slot is visible during testing without breaking the feed.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImaAds } from '@/hooks/useImaAds';
import { useAdSlot } from '@/hooks/useAdSlot';

interface ShortsAdSlideProps {
  active: boolean;
  attributeToVideoId?: string | null;
  onAdFinished: () => void;
}

const ENV_SHORTS_VAST_URL = import.meta.env.VITE_SHORTS_VAST_URL as string | undefined;
const SKIP_AFTER_SECONDS = 5;

export function ShortsAdSlide({ active, attributeToVideoId, onAdFinished }: ShortsAdSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [skipReady, setSkipReady] = useState(false);
  const [countdown, setCountdown] = useState(SKIP_AFTER_SECONDS);
  const [imaStarted, setImaStarted] = useState(false);

  // Admin-managed placement ("shorts_between") wins; env var is the fallback.
  const { row: slotRow } = useAdSlot('shorts_between');
  const SHORTS_VAST_URL =
    (slotRow?.enabled ? slotRow.vast_tag_url || undefined : undefined) ?? ENV_SHORTS_VAST_URL;

  const ima = useImaAds({
    vastTagUrl: SHORTS_VAST_URL,
    videoElement: videoRef.current,
    adContainer: adContainerRef.current,
    videoId: attributeToVideoId || undefined,
    onAdStarted: () => setImaStarted(true),
    onAdEnded: () => onAdFinished(),
    onAllAdsCompleted: () => onAdFinished(),
    onAdError: () => onAdFinished(),
  });

  // Request the VAST ad when this slide becomes active
  useEffect(() => {
    if (!active) return;
    setSkipReady(false);
    setCountdown(SKIP_AFTER_SECONDS);
    setImaStarted(false);
    if (SHORTS_VAST_URL) {
      ima.requestAds();
    }
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); setSkipReady(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => { clearInterval(t); ima.cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, SHORTS_VAST_URL]);

  return (
    <section className="relative w-full h-full snap-start snap-always flex items-center justify-center bg-black overflow-hidden">
      {/* 9:16 aspect ratio container for the ad */}
      <div className="relative h-full aspect-[9/16] max-h-full overflow-hidden">
        {/* Hidden content video element required by IMA SDK */}
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        {/* IMA renders the ad creative here */}
        <div ref={adContainerRef} className="absolute inset-0 z-10" />

        {/* Fallback / placeholder layer when no VAST tag is configured or ad hasn't started yet */}
        {(!SHORTS_VAST_URL || !imaStarted) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-0 flex flex-col items-center justify-center px-8 text-center bg-gradient-to-br from-primary/30 via-background to-secondary/30"
          >
            <div className="w-20 h-20 rounded-3xl glass-strong flex items-center justify-center mb-6">
              <Sparkles className="w-9 h-9 text-accent" />
            </div>
            <span className="text-[10px] font-display tracking-[0.2em] uppercase text-accent mb-2">Sponsored</span>
            <h3 className="text-xl font-bold text-foreground mb-2">
              {SHORTS_VAST_URL ? 'Loading ad…' : 'Premium ad slot'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {SHORTS_VAST_URL
                ? 'Your ad will play in a moment.'
                : 'Connect Adsterra, PropellerAds or Google Ad Manager VAST tag to start earning here.'}
            </p>
          </motion.div>
        )}

        {/* Top badge */}
        <div className="absolute top-4 left-4 z-20 px-2.5 py-1 rounded-full glass-strong text-[10px] font-display tracking-widest uppercase text-foreground">
          Sponsored
        </div>

        {/* Skip control */}
        <div className="absolute bottom-24 lg:bottom-10 right-3 z-20">
          {skipReady ? (
            <Button onClick={onAdFinished} size="sm" className="rounded-full gap-1">
              <SkipForward className="w-3.5 h-3.5" /> Skip ad
            </Button>
          ) : (
            <div className="px-3 py-1.5 rounded-full glass-strong text-xs text-foreground">
              Skip in {countdown}s
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
