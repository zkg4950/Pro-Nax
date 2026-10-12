/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  Gauge, PictureInPicture2, RectangleHorizontal as Rectangle, Settings as SettingsIcon, Check,
  Subtitles, Languages,
} from 'lucide-react';
import { encodeMediaUrl } from '@/lib/videoVariants';


interface VideoPlayerProps {
  title?: string;
  videoId?: string;
  src?: string;
  poster?: string;
  adVideoSrc?: string;
  adSkipAvailable?: boolean;
  adCountdown?: number;
  onAdEnded?: () => void;
  onAdSkip?: () => void;
  onTheaterToggle?: () => void;
  theater?: boolean;
  /** Fires once user has actively watched (playing) for ≥ threshold seconds */
  onWatchThreshold?: (seconds: number) => void;
  watchThreshold?: number;
  /** Fires when the actual video (not ad) finishes — used for autoplay-next */
  onVideoEnded?: () => void;
  /** Fires with cumulative watched seconds on pause, end, source change, and unmount. */
  onWatchProgress?: (seconds: number) => void;
  /** Subtitle tracks for the video */
  subtitles?: SubtitleTrack[];
}

interface SubtitleTrack {
  label: string;
  language: string;
  src: string;
  kind?: 'subtitles' | 'captions';
  default?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SPEED_KEY = 'pronax:playback_speed';
const readSavedSpeed = (): number => {
  if (typeof window === 'undefined') return 1;
  const n = Number(window.localStorage.getItem(SPEED_KEY));
  return SPEEDS.includes(n) ? n : 1;
};

export function VideoPlayer({
  title,
  src,
  poster,
  adVideoSrc,
  adSkipAvailable,
  adCountdown,
  onAdEnded,
  onAdSkip,
  onTheaterToggle,
  theater,
  onWatchThreshold,
  watchThreshold = 5,
  onVideoEnded,
  onWatchProgress,
  subtitles = [],
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [showAd, setShowAd] = useState(!!adVideoSrc);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(() => readSavedSpeed());
  const [speedOpen, setSpeedOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<'root' | 'speed' | 'quality' | 'subtitles'>('root');
  const [qualities, setQualities] = useState<{ label: string; level: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const hlsRef = useRef<Hls | null>(null);
  const [fs, setFs] = useState(false);
  const [pip, setPip] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);

  // Watch-threshold tracking
  const watchedRef = useRef(0);
  const firedRef = useRef(false);
  const lastTick = useRef<number | null>(null);

  useEffect(() => setShowAd(!!adVideoSrc), [adVideoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    const source = encodeMediaUrl(showAd ? adVideoSrc : src);
    setQualities([]);
    setCurrentLevel(-1);
    if (!video || !source) return;
    if (source.endsWith('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels.map((l, i) => ({
          label: `${l.height || Math.round((l.bitrate || 0) / 1000)}p`,
          level: i,
        }));
        setQualities(levels);
        setCurrentLevel(-1);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level));
      return () => { hls.destroy(); hlsRef.current = null; };
    } else {
      hlsRef.current = null;
      video.src = source;
    }
  }, [src, adVideoSrc, showAd]);

  // Load subtitle tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set default subtitle track
    if (subtitles.length > 0) {
      const defaultSubtitle = subtitles.find(s => s.default) || subtitles[0];
      if (defaultSubtitle) {
        setActiveSubtitle(defaultSubtitle.language);
      }
    }
  }, [subtitles, src, showAd]);

  // Flush accumulated watch seconds when source changes / component unmounts.
  const progressCbRef = useRef(onWatchProgress);
  useEffect(() => { progressCbRef.current = onWatchProgress; }, [onWatchProgress]);
  const flushProgress = useCallback(() => {
    const s = Math.round(watchedRef.current);
    if (s > 0) { try { progressCbRef.current?.(s); } catch { /* noop */ } }
  }, []);

  // reset watch tracking on real video (non-ad) change; flush previous first
  useEffect(() => {
    return () => {
      flushProgress();
      watchedRef.current = 0;
      firedRef.current = false;
      lastTick.current = null;
    };
  }, [src, flushProgress]);

  // Flush on tab hide / unload
  useEffect(() => {
    const onHide = () => flushProgress();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushProgress]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing) setControlsVisible(false);
    }, 3000);
  }, [playing]);

  useEffect(() => {
    showControls();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [playing, showControls]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const onVolChange = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const seek = (val: number) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = val;
    setCurrent(val);
  };

  const changeSpeed = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    try { window.localStorage.setItem(SPEED_KEY, String(s)); } catch { /* ignore */ }
    setSpeedOpen(false);
  };

  const changeSubtitle = (language: string | null) => {
    const video = videoRef.current;
    if (!video) return;

    setActiveSubtitle(language);

    // Hide all tracks
    Array.from(video.textTracks).forEach((track) => {
      track.mode = 'hidden';
    });

    // Show selected track
    if (language) {
      const track = Array.from(video.textTracks).find(
        (t) => t.language === language
      );
      if (track) {
        track.mode = 'showing';
      }
    }

    setSubtitleOpen(false);
  };

  // Apply persisted speed to the video element whenever the source changes
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [src, speed, showAd]);

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.().catch(() => {});
    } else {
      await document.exitFullscreen?.().catch(() => {});
    }
  };

  const togglePip = async () => {
    const v = videoRef.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> };
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch {/* ignore */}
  };

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnterPip = () => setPip(true);
    const onLeavePip = () => setPip(false);
    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, []);

  // Keyboard shortcuts: Space/K play, J -10s, L +10s, M mute, F fullscreen
  useEffect(() => {
    if (showAd) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const v = videoRef.current;
      if (!v) return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') { e.preventDefault(); togglePlay(); }
      else if (key === 'j') { e.preventDefault(); seek(Math.max(0, v.currentTime - 10)); showControls(); }
      else if (key === 'l') { e.preventDefault(); seek(Math.min(duration || v.currentTime + 10, v.currentTime + 10)); showControls(); }
      else if (key === 'm') { e.preventDefault(); toggleMute(); }
      else if (key === 'f') { e.preventDefault(); toggleFullscreen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAd, duration, showControls]);

  const fmt = (t: number) => {
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}:${(m % 60).toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full bg-black group select-none ${!controlsVisible && playing ? 'user-inactive cursor-none [&_*]:!cursor-none' : ''}`}
      onMouseMove={showControls}
      onMouseLeave={() => playing && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        poster={poster}
        preload={typeof document !== "undefined" && document.documentElement.dataset.perf === "low" ? "none" : "metadata"}
        className="w-full h-full object-contain"
        onClick={() => !showAd && togglePlay()}
        onPlay={() => { setPlaying(true); lastTick.current = performance.now(); }}
        onPause={() => { setPlaying(false); lastTick.current = null; flushProgress(); }}
        onVolumeChange={(e) => {
          const v = e.currentTarget;
          setVolume(v.volume); setMuted(v.muted);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurrent(v.currentTime);
          if (!showAd && !v.paused) {
            const now = performance.now();
            if (lastTick.current != null) {
              watchedRef.current += (now - lastTick.current) / 1000;
            }
            lastTick.current = now;
            if (!firedRef.current && watchedRef.current >= watchThreshold) {
              firedRef.current = true;
              onWatchThreshold?.(watchedRef.current);
            }
          }
        }}
        onEnded={() => {
          if (showAd) {
            setShowAd(false);
            onAdEnded?.();
          } else {
            flushProgress();
            onVideoEnded?.();
          }
        }}
        aria-label={title}
      >
        {/* WebVTT Subtitle Tracks */}
        {subtitles.map((subtitle, index) => (
          <track
            key={index}
            kind={subtitle.kind || 'subtitles'}
            label={subtitle.label}
            src={subtitle.src}
            srcLang={subtitle.language}
            default={subtitle.default}
          />
        ))}
      </video>

      {/* In-Stream Video Ad Controls & Overlay */}
      {showAd && (
        <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between p-4">
          {/* Top Bar: Ad Badge & Sound Control */}
          <div className="flex items-center justify-between gap-2 pointer-events-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/85 border border-amber-500/40 text-amber-300 backdrop-blur-md shadow-lg text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Ad · 1 of 1</span>
              {adCountdown !== undefined && adCountdown > 0 && (
                <span className="text-amber-200/80 font-mono text-[11px] border-l border-amber-500/30 pl-2">
                  {fmt(current)}
                </span>
              )}
            </div>

            <button
              onClick={toggleMute}
              className="p-2 rounded-full bg-slate-950/80 border border-white/20 text-white hover:bg-slate-900 transition backdrop-blur-md"
              aria-label="Toggle Ad Mute"
            >
              {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>
          </div>

          {/* Bottom Controls: Progress Bar & Skip Button */}
          <div className="space-y-3 pointer-events-auto">
            {/* Ad Progress Bar */}
            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-200"
                style={{ width: `${duration ? (current / duration) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="px-3 py-1 rounded-lg bg-slate-950/80 border border-white/10 backdrop-blur-md text-[11px] text-slate-300">
                Sponsored content
              </div>

              {adSkipAvailable ? (
                <button
                  onClick={() => { setShowAd(false); onAdSkip?.(); }}
                  className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs shadow-lg hover:bg-amber-300 transition duration-200 flex items-center gap-1.5 glow-amber"
                >
                  <span>Skip Ad</span>
                  <span className="text-sm">→</span>
                </button>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-slate-950/85 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold backdrop-blur-md">
                  Skip in {adCountdown}s
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Big center play (main video only) */}
      {!showAd && !playing && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <button
            onClick={togglePlay}
            className="pointer-events-auto"
            aria-label="Play"
          >
            <span className="flex items-center justify-center transition-transform hover:scale-110">
              <Play className="w-7 h-7 text-primary fill-primary" />
            </span>
          </button>
        </div>
      )}

      {/* Professional ProNax-style controls */}
      {!showAd && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 w-full flex flex-col transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex flex-col justify-end px-3 pb-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent">
            {/* Line 1: Progress Bar / Seekbar */}
            <div className="relative h-1 bg-white/20 cursor-pointer group/prog hover:h-1.5 transition-all mb-0 w-full"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                seek(((e.clientX - r.left) / r.width) * duration);
              }}
            >
              <div
                className="absolute inset-y-0 left-0 bg-red-600 group-hover/prog:bg-red-500 transition-colors"
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute -top-1.5 w-3.5 h-3.5 -ml-1.75 rounded-full bg-red-600 shadow-lg opacity-0 group-hover/prog:opacity-100 transition-all"
                style={{ left: `${pct}%` }}
              />
            </div>

            {/* Line 2: Bottom Control Bar */}
            <div className="flex items-center justify-between w-full px-3 py-1 text-white">
              <div className="flex items-center gap-2">
                <button onClick={togglePlay} className="p-1.5 rounded-full hover:bg-white/20 transition-colors" aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button onClick={toggleMute} className="p-1.5 rounded-full hover:bg-white/20 transition-colors" aria-label="Mute">
                    {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => onVolChange(Number(e.target.value))}
                    className="ProNax-slider w-0 group-hover/vol:w-24 transition-[width] duration-200"
                    aria-label="Volume"
                  />
                </div>

                <span className="text-xs tabular-nums text-white/90 font-medium">
                  {fmt(current)} / {fmt(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">

                {/* Settings (gear) */}
                <div className="relative">
                  <button
                    onClick={() => { setSettingsOpen((v) => !v); setSettingsPane('root'); }}
                    className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                    aria-label="Settings"
                  >
                    <SettingsIcon className={`w-4 h-4 ${settingsOpen ? 'text-white' : 'text-white/70'}`} />
                  </button>
                  {settingsOpen && (
                    <div className="absolute bottom-8 right-0 min-w-[200px] rounded-lg bg-zinc-900/95 backdrop-blur-lg border border-white/10 p-1 shadow-xl text-white text-xs">
                      {settingsPane === 'root' && (
                        <>
                          <button onClick={() => setSettingsPane('speed')} className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-white/10">
                            <span>Playback speed</span>
                            <span className="text-white/70">{speed}x ›</span>
                          </button>
                          <button onClick={() => setSettingsPane('quality')} className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-white/10">
                            <span>Quality</span>
                            <span className="text-white/70">
                              {currentLevel === -1 ? 'Auto' : (qualities.find(q => q.level === currentLevel)?.label ?? 'Auto')} ›
                            </span>
                          </button>
                          {subtitles.length > 0 && (
                            <button onClick={() => setSettingsPane('subtitles')} className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-white/10">
                              <span>Subtitles</span>
                              <span className="text-white/70">{activeSubtitle ? 'On' : 'Off'} ›</span>
                            </button>
                          )}
                        </>
                      )}
                      {settingsPane === 'speed' && (
                        <>
                          <button onClick={() => setSettingsPane('root')} className="w-full text-left px-3 py-2 text-white/60 hover:bg-white/10 rounded">‹ Speed</button>
                          {SPEEDS.map((s) => (
                            <button
                              key={s}
                              onClick={() => { changeSpeed(s); setSettingsOpen(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 ${s === speed ? 'text-white font-semibold' : 'text-white/70'}`}
                            >
                              {s === speed ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                              {s}x {s === 1 && '(Normal)'}
                            </button>
                          ))}
                        </>
                      )}
                      {settingsPane === 'quality' && (
                        <>
                          <button onClick={() => setSettingsPane('root')} className="w-full text-left px-3 py-2 text-white/60 hover:bg-white/10 rounded">‹ Quality</button>
                          <button
                            onClick={() => { if (hlsRef.current) hlsRef.current.currentLevel = -1; setCurrentLevel(-1); setSettingsOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 ${currentLevel === -1 ? 'text-white font-semibold' : 'text-white/70'}`}
                          >
                            {currentLevel === -1 ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                            Auto
                          </button>
                          {qualities.length === 0 && (
                            <div className="px-3 py-2 text-white/50">No variants available</div>
                          )}
                          {qualities.map((q) => (
                            <button
                              key={q.level}
                              onClick={() => { if (hlsRef.current) hlsRef.current.currentLevel = q.level; setCurrentLevel(q.level); setSettingsOpen(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 ${currentLevel === q.level ? 'text-white font-semibold' : 'text-white/70'}`}
                            >
                              {currentLevel === q.level ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                              {q.label}
                            </button>
                          ))}
                        </>
                      )}
                      {settingsPane === 'subtitles' && (
                        <>
                          <button onClick={() => setSettingsPane('root')} className="w-full text-left px-3 py-2 text-white/60 hover:bg-white/10 rounded">‹ Subtitles</button>
                          <button
                            onClick={() => { changeSubtitle(null); setSettingsOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 ${!activeSubtitle ? 'text-white font-semibold' : 'text-white/70'}`}
                          >
                            {!activeSubtitle ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                            Off
                          </button>
                          {subtitles.map((subtitle) => (
                            <button
                              key={subtitle.language}
                              onClick={() => { changeSubtitle(subtitle.language); setSettingsOpen(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 ${activeSubtitle === subtitle.language ? 'text-white font-semibold' : 'text-white/70'}`}
                            >
                              {activeSubtitle === subtitle.language ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                              <span>{subtitle.label}</span>
                              <span className="text-white/50 text-[10px]">{subtitle.language}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* CC/Captions quick toggle */}
                {subtitles.length > 0 && (
                  <button
                    onClick={() => changeSubtitle(activeSubtitle ? null : (subtitles.find(s => s.default)?.language || subtitles[0].language))}
                    className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                    aria-label="Toggle captions"
                  >
                    <Subtitles className={`w-4 h-4 ${activeSubtitle ? 'text-white' : 'text-white/70'}`} />
                  </button>
                )}

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="p-1.5 rounded-full hover:bg-white/20 transition-colors" aria-label="Fullscreen">
                  {fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ProNax-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          background: rgba(255,255,255,0.3);
          border-radius: 2px;
          outline: none;
        }
        .ProNax-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .ProNax-slider::-moz-range-thumb {
          width: 12px; height: 12px; border: 0;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        ::cue {
          background-color: rgba(0, 0, 0, 0.8) !important;
          color: white !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 20px !important;
          font-weight: 500 !important;
          line-height: 1.4 !important;
          padding: 4px 12px 45px 12px !important;
          border-radius: 4px !important;
          text-align: center !important;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
          z-index: 9999 !important;
          position: relative !important;
        }
        ::cue(*) {
          background-color: rgba(0, 0, 0, 0.8) !important;
          color: white !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 20px !important;
          font-weight: 500 !important;
          line-height: 1.4 !important;
          padding: 4px 12px 45px 12px !important;
          border-radius: 4px !important;
          text-align: center !important;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
          z-index: 9999 !important;
          position: relative !important;
        }
        video::cue {
          background-color: rgba(0, 0, 0, 0.8) !important;
          color: white !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 20px !important;
          font-weight: 500 !important;
          line-height: 1.4 !important;
          padding: 4px 12px 45px 12px !important;
          border-radius: 4px !important;
          text-align: center !important;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8) !important;
          z-index: 9999 !important;
          position: relative !important;
        }
      `}</style>
    </div>
  );
}

export default VideoPlayer;
