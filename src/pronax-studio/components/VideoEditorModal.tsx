/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  X,
  Play,
  Pause,
  Scissors,
  EyeOff,
  Music,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FolderOpen,
  Undo,
  Redo,
  Maximize2,
  Minimize2,
  MousePointer2,
  Film,
  Type,
  Sparkles as EffectsIcon,
  Video as VideoIcon,
  Magnet,
  Diamond,
  Lock,
  Unlock,
  Eye,
  Download,
  Wand2,
  Layers,
  Keyboard,
  Sliders,
} from "lucide-react";

import {
  Video,
  TrackKind,
  ToolMode,
  BlendMode,
  TransitionKind,
  MediaAsset,
  Filters,
  Transform,
  Keyframe,
  TextStyle,
  Clip,
  Track,
  EditorDoc,
} from "./editor/types";
import { validateEditorVideo } from "../utils/videoTypeConversion";
import {
  TRACK_COLORS,
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  TEXT_PRESETS,
  TRANSITIONS,
  uid,
  clamp,
  formatTime,
  formatTC,
  parseDurationSec,
  filterCss,
  pseudoWave,
} from "./editor/constants";
import { Slider } from "./editor/Slider";
import { Waveform } from "./editor/Waveform";
import { Panel } from "./editor/Panel";
import { useTimelineInteraction } from "./editor/useTimelineInteraction";
import { Timeline } from "./editor/Timeline";
import { VideoPreview } from "./editor/VideoPreview";
import { ExportPanel, ExportSettings } from "./editor/ExportPanel";

interface VideoEditorModalProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveVideo: (updated: Video) => void;
}

const newClip = (partial: Partial<Clip> & { trackId: string; start: number }): Clip => ({
  id: uid("clip"),
  name: "Clip",
  duration: 8,
  srcIn: 0,
  srcDuration: 8,
  transitionIn: "none",
  filters: { ...DEFAULT_FILTERS },
  transform: { ...DEFAULT_TRANSFORM },
  blend: "normal",
  chroma: { enabled: false, similarity: 40, color: "#00b140" },
  keyframes: [],
  volume: 100,
  fadeIn: 0,
  fadeOut: 0,
  color: "#3b82f6",
  ...partial,
});

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export const VideoEditorModal: React.FC<VideoEditorModalProps> = ({
  video: videoProp,
  isOpen,
  onClose,
  onSaveVideo,
}) => {
  // Validate video data on mount and when video changes
  useEffect(() => {
    if (videoProp) {
      const validation = validateEditorVideo(videoProp);
      if (!validation.valid) {
        console.error('Invalid video data in editor:', validation.errors);
        // Could show error UI here, but for now we'll log and continue
      }
    }
  }, [videoProp]);

  const totalHint = Math.max(30, parseDurationSec(videoProp?.duration));

  /* ---------------- document + history ---------------- */
  const initialDoc = useMemo<EditorDoc>(() => {
    const tracks: Track[] = [
      { id: "T1", kind: "text", name: "T1", muted: false, solo: false, locked: false, hidden: false, volume: 100, pan: 0 },
      { id: "AJ1", kind: "adjustment", name: "ADJ", muted: false, solo: false, locked: false, hidden: false, volume: 100, pan: 0 },
      { id: "V2", kind: "video", name: "V2", muted: false, solo: false, locked: false, hidden: false, volume: 100, pan: 0 },
      { id: "V1", kind: "video", name: "V1", muted: false, solo: false, locked: false, hidden: false, volume: 100, pan: 0 },
      { id: "A1", kind: "audio", name: "A1", muted: false, solo: false, locked: false, hidden: false, volume: 90, pan: 0 },
      { id: "A2", kind: "audio", name: "A2", muted: false, solo: false, locked: false, hidden: false, volume: 60, pan: -20 },
    ];
    const base = Math.min(totalHint, 45);
    const clips: Clip[] = [
      newClip({
        trackId: "V1",
        start: 0,
        duration: base * 0.55,
        srcDuration: base,
        name: videoProp?.title ?? "Main Footage",
        color: TRACK_COLORS.video,
      }),
      newClip({
        trackId: "V1",
        start: base * 0.6,
        duration: base * 0.4,
        srcDuration: base,
        name: "B-Roll",
        transitionIn: "cross-dissolve",
        color: TRACK_COLORS.video,
      }),
      newClip({
        trackId: "A1",
        start: 0,
        duration: base,
        srcDuration: base,
        name: "Original Audio",
        color: TRACK_COLORS.audio,
        fadeIn: 1,
        fadeOut: 2,
      }),
      newClip({
        trackId: "T1",
        start: 2,
        duration: 6,
        srcDuration: 6,
        name: "Lower Third",
        color: TRACK_COLORS.text,
        text: {
          content: "Dev Creator Studio",
          preset: "lower-third",
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 44,
          color: "#ffffff",
          stroke: 0,
          strokeColor: "#000000",
          shadow: 12,
          boxed: true,
          align: "left",
        },
      }),
    ];
    return {
      tracks,
      clips,
      blurOverlays: videoProp?.blurOverlays ?? [
        { id: "b1", type: "face", shape: "ellipse", x: 35, y: 25, width: 20, height: 25, startTime: 4, endTime: 12 },
      ],
      endScreenElements: videoProp?.endScreenElements ?? [],
    };
  }, [videoProp, totalHint]);

  const [doc, setDoc] = useState<EditorDoc>(initialDoc);
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);

  useEffect(() => {
    setDoc(initialDoc);
    setPast([]);
    setFuture([]);
    setSelectedClipId(null);
  }, [initialDoc]);

  const commit = useCallback(
    (updater: (d: EditorDoc) => EditorDoc) => {
      setDoc((prev) => {
        const next = updater(prev);
        setPast((p) => [...p.slice(-49), prev]);
        setFuture([]);
        return next;
      });
    },
    []
  );

  const live = useCallback((updater: (d: EditorDoc) => EditorDoc) => setDoc(updater), []);

  const undo = useCallback(() => {
    setPast((p) => {
      const prev = p[p.length - 1];
      if (!prev) return p;
      setDoc((cur) => {
        setFuture((f) => [cur, ...f]);
        return prev;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      const next = f[0];
      if (!next) return f;
      setDoc((cur) => {
        setPast((p) => [...p, cur]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  /* ---------------- ui state ---------------- */
  const [activeTab, setActiveTab] = useState<"media" | "effects" | "text" | "transitions" | "audio">("media");
  const [inspectorTab, setInspectorTab] = useState<"properties" | "color" | "audio" | "keyframes">("properties");
  const [tool, setTool] = useState<ToolMode>("select");
  const [snapping, setSnapping] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [viewportZoom, setViewportZoom] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [dragOverBin, setDragOverBin] = useState(false);
  const [previewingAudio, setPreviewingAudio] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const [showExport, setShowExport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAudioSelector, setShowAudioSelector] = useState(false);
  const [audioTrackName, setAudioTrackName] = useState("Original Video Audio");
  const [claimResolved, setClaimResolved] = useState(false);
  const [claimData, setClaimData] = useState({
    start: 12,
    end: 28,
    type: "Audio/Visual",
    content: "Copyrighted Music - T-Series"
  });
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const [showTrimTime, setShowTrimTime] = useState<string | null>(null);
  const [trimMode, setTrimMode] = useState<"trim-in" | "trim-out" | null>(null);
  const [videoLoadError, setVideoLoadError] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  const duration = useMemo(() => {
    // Calculate total timeline duration based on all clips
    const maxClipEnd = doc.clips.length > 0 
      ? Math.max(...doc.clips.map((c) => c.start + c.duration))
      : 0;
    
    // Consider video duration if available
    const videoDur = videoDuration || 0;
    
    // Use the hint for base duration but ensure it covers all content
    const baseDuration = Math.max(totalHint, 30);
    
    // Return the maximum of all durations
    return Math.max(baseDuration, maxClipEnd, videoDur);
  }, [doc.clips, totalHint, videoDuration]);

  const pxPerSec = (zoom / 100) * 24;

  // Use extracted timeline interaction hook
  const {
    dragRef,
    snapPoints,
    applySnap,
    timeFromClientX,
    patchClip,
    razorAt,
    deleteSelected,
  } = useTimelineInteraction(doc, duration, pxPerSec, snapping, playhead, timelineRef as React.RefObject<HTMLDivElement>, commit, live, setSelectedClipId);


  // Initialize Web Audio API for real audio mixing
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Audio preview playback
  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;

    if (previewingAudio) {
      audio.src = previewingAudio;
      audio.play().catch(console.error);
    } else {
      audio.pause();
      audio.src = '';
    }
  }, [previewingAudio]);

  // Real-time audio mixing for timeline playback
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !videoRef.current) return;

    const setupAudioNodes = () => {
      doc.tracks.filter(t => t.kind === 'audio').forEach(track => {
        if (!gainNodesRef.current.has(track.id)) {
          const gainNode = ctx.createGain();
          gainNode.gain.value = track.volume / 100;
          gainNodesRef.current.set(track.id, gainNode);
        }
      });
    };

    setupAudioNodes();
  }, [doc.tracks]);

  const updateTrackVolume = (trackId: string, volume: number) => {
    const gainNode = gainNodesRef.current.get(trackId);
    if (gainNode) {
      gainNode.gain.value = volume / 100;
    }
  };

  const toggleAudioPreview = (asset: MediaAsset) => {
    if (previewingAudio === asset.url) {
      setPreviewingAudio(null);
    } else {
      setPreviewingAudio(asset.url);
    }
  };

  const restrictionList: string[] = Array.isArray(videoProp?.restrictions)
    ? (videoProp?.restrictions as string[])
    : videoProp?.restrictions && videoProp.restrictions !== "None"
      ? [String(videoProp.restrictions)]
      : [];
  const hasClaim = restrictionList.some((r) => r.toLowerCase().includes("copyright"));

  const selected = doc.clips.find((c) => c.id === selectedClipId) ?? null;
  const selectedTrack = doc.tracks.find((t) => t.id === selected?.trackId) ?? null;

  /* ------------------------------------------------------------------ */
  /* ADVANCED COPYRIGHT ACTIONS                                         */
  /* ------------------------------------------------------------------ */

  // A. TRIM OUT SEGMENT (pronax Studio style Ripple Edit)
  const trimClaimSegment = useCallback(() => {
    commit((d) => {
      const claimStart = claimData.start;
      const claimEnd = claimData.end;
      const claimDuration = claimEnd - claimStart;

      // Sabse pehle un clips ko filter karo jo poori tarah claim ke andar hain
      let newClips = d.clips.filter(c => !(c.start >= claimStart && (c.start + c.duration) <= claimEnd));

      // Jo clips beech mein hain unhein split aur adjust karo
      newClips = newClips.map(c => {
        // Case 1: Clip claim ke baad start ho rahi hai (Shift it left)
        if (c.start >= claimEnd) {
          return { ...c, start: c.start - claimDuration };
        }
        
        // Case 2: Clip claim se pehle start hui par claim ke beech mein khatam ho rahi hai
        if (c.start < claimStart && (c.start + c.duration) > claimStart) {
          return { ...c, duration: claimStart - c.start };
        }

        // Case 3: Clip claim ke andar start hui par claim ke baad khatam ho rahi hai
        if (c.start >= claimStart && c.start < claimEnd) {
          const overlap = claimEnd - c.start;
          return { 
            ...c, 
            start: claimStart, 
            duration: c.duration - overlap,
            srcIn: c.srcIn + overlap 
          };
        }

        return c;
      });

      return { ...d, clips: newClips };
    });
    setClaimResolved(true);
  }, [claimData, commit]);

  // B. MUTE ONLY CLAIMED SEGMENT
  const muteClaimSegment = useCallback(() => {
    // Isme hum razor tool ki tarah claim ke start/end par cut lagayenge
    // Aur beech wale clips ki volume 0 kar denge
    commit(d => {
      const claimStart = claimData.start;
      const claimEnd = claimData.end;
      let newClips = [...d.clips];

      // Helper function to split a clip at a specific time
      const splitClipAt = (clip: Clip, splitTime: number): Clip[] => {
        if (splitTime <= clip.start || splitTime >= clip.start + clip.duration) {
          return [clip];
        }
        
        const offset = splitTime - clip.start;
        const leftDuration = offset;
        const rightDuration = clip.duration - offset;

        const left: Clip = {
          ...clip,
          id: uid("clip"),
          duration: leftDuration,
          srcDuration: leftDuration,
          keyframes: clip.keyframes
            .filter(k => k.time < offset)
            .map(k => ({ ...k, id: uid("kf") })),
        };

        const right: Clip = {
          ...clip,
          id: uid("clip"),
          start: splitTime,
          duration: rightDuration,
          srcIn: clip.srcIn + offset,
          srcDuration: rightDuration,
          keyframes: clip.keyframes
            .filter(k => k.time >= offset)
            .map(k => ({ ...k, id: uid("kf"), time: k.time - offset })),
        };

        return [left, right];
      };

      // First, split all clips that intersect with claim boundaries
      let splitClips: Clip[] = [];
      newClips.forEach(clip => {
        const clipEnd = clip.start + clip.duration;
        
        // Check if clip needs splitting at claim start
        if (clip.start < claimStart && clipEnd > claimStart) {
          const [left, right] = splitClipAt(clip, claimStart);
          splitClips.push(left, right);
        }
        // Check if clip needs splitting at claim end
        else if (clip.start < claimEnd && clipEnd > claimEnd) {
          const [left, right] = splitClipAt(clip, claimEnd);
          splitClips.push(left, right);
        }
        else {
          splitClips.push(clip);
        }
      });

      // Now mute clips that are fully within the claimed segment
      splitClips = splitClips.map(c => {
        const clipEnd = c.start + c.duration;
        if (c.start >= claimStart && clipEnd <= claimEnd) {
          return { ...c, volume: 0 };
        }
        return c;
      });

      return { ...d, clips: splitClips };
    });
    setClaimResolved(true);
  }, [claimData, commit]);

  const addTrack = (kind: TrackKind) =>
    commit((d) => {
      const count = d.tracks.filter((t) => t.kind === kind).length + 1;
      const prefix = kind === "video" ? "V" : kind === "audio" ? "A" : kind === "text" ? "T" : "ADJ";
      const t: Track = {
        id: uid("trk"),
        kind,
        name: `${prefix}${count}`,
        muted: false,
        solo: false,
        locked: false,
        hidden: false,
        volume: 100,
        pan: 0,
      };
      return { ...d, tracks: kind === "audio" ? [...d.tracks, t] : [t, ...d.tracks] };
    });

  const addAssetToTimeline = (asset: MediaAsset) => {
    const kind: TrackKind = asset.kind === "audio" ? "audio" : "video";
    const track = doc.tracks.find((t) => t.kind === kind) ?? doc.tracks[0];
    if (!track) return;
    const trackClips = doc.clips.filter((c) => c.trackId === track.id);
    const start = trackClips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    const clip = newClip({
      trackId: track.id,
      start,
      duration: asset.duration,
      srcDuration: asset.duration,
      name: asset.name,
      assetId: asset.id,
      color: TRACK_COLORS[kind],
    });
    commit((d) => ({ ...d, clips: [...d.clips, clip] }));
    setSelectedClipId(clip.id);
  };

  const addTextClip = (preset: TextStyle["preset"], label: string) => {
    const track = doc.tracks.find((t) => t.kind === "text")!;
    const clip = newClip({
      trackId: track.id,
      start: playhead,
      duration: 5,
      srcDuration: 5,
      name: label,
      color: TRACK_COLORS.text,
      text: {
        content: label.toUpperCase(),
        preset,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 800,
        fontSize: 48,
        color: "#ffffff",
        stroke: 0,
        strokeColor: "#000000",
        shadow: 10,
        boxed: preset === "lower-third",
        align: preset === "lower-third" ? "left" : "center",
      },
    });
    commit((d) => ({ ...d, clips: [...d.clips, clip] }));
    setSelectedClipId(clip.id);
    setInspectorTab("properties");
  };

  const addKeyframe = (prop: Keyframe["prop"], value: number) => {
    if (!selected) return;
    const time = clamp(playhead - selected.start, 0, selected.duration);
    patchClip(selected.id, {
      keyframes: [
        ...selected.keyframes.filter((k) => !(k.prop === prop && Math.abs(k.time - time) < 0.05)),
        { id: uid("kf"), prop, time, value },
      ].sort((a, b) => a.time - b.time),
    });
  };

  /* ---------------- Trim Presets ---------------- */
  const trimToPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    const clip = doc.clips.find(c => c.id === selectedClipId);
    if (!clip) return;

    // Trim from playhead to end
    if (playhead > clip.start && playhead < clip.start + clip.duration) {
      const newStart = playhead;
      const delta = newStart - clip.start;
      commit((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id === selectedClipId
            ? { ...c, start: newStart, duration: clip.duration - delta, srcIn: Math.max(0, clip.srcIn + delta) }
            : c
        ),
      }));
    }
  }, [selectedClipId, playhead, doc.clips, commit]);

  const trimFromPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    const clip = doc.clips.find(c => c.id === selectedClipId);
    if (!clip) return;

    // Trim from start to playhead
    if (playhead > clip.start && playhead < clip.start + clip.duration) {
      const newDuration = playhead - clip.start;
      commit((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id === selectedClipId ? { ...c, duration: newDuration } : c
        ),
      }));
    }
  }, [selectedClipId, playhead, doc.clips, commit]);

  const trimClipToSelection = useCallback(() => {
    if (!selectedClipId) return;
    const clip = doc.clips.find(c => c.id === selectedClipId);
    if (!clip) return;

    // Trim clip to current selection (if we had selection)
    // For now, just trim to 10 seconds from current position
    const trimStart = Math.max(clip.start, playhead);
    const trimDuration = Math.min(10, clip.start + clip.duration - trimStart);
    
    if (trimDuration > 0.2) {
      const delta = trimStart - clip.start;
      commit((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id === selectedClipId
            ? { ...c, start: trimStart, duration: trimDuration, srcIn: Math.max(0, clip.srcIn + delta) }
            : c
        ),
      }));
    }
  }, [selectedClipId, playhead, doc.clips, commit]);

  /* ---------------- Enhanced Trim Undo/Redo ---------------- */
  // Note: All trim operations already use commit() which saves to history
  // The undo/redo system is already robust with 50-step history buffer
  // Trim-specific improvements: add visual feedback for undo/redo actions

  /* ---------------- media import ---------------- */
  const ingestFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const url = URL.createObjectURL(file);
      const kind: MediaAsset["kind"] = file.type.startsWith("audio")
        ? "audio"
        : file.type.startsWith("image")
          ? "image"
          : "video";
      const asset: MediaAsset = {
        id: uid("asset"),
        name: file.name,
        kind,
        url,
        duration: kind === "image" ? 5 : 10,
        size: file.size,
        ...(kind === "image" ? { thumb: url } : {}),
      };
      setMedia((m) => [...m, asset]);

      if (kind === "video") {
        const el = document.createElement("video");
        el.preload = "metadata";
        el.src = url;
        el.muted = true;
        el.onloadedmetadata = () => {
          const dur = isFinite(el.duration) ? el.duration : 10;
          // Extract video metadata
          const videoWidth = el.videoWidth;
          const videoHeight = el.videoHeight;
          const fps = 30; // Default, could be extracted from container
          
          el.currentTime = Math.min(1, dur / 2);
          el.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 240;
            canvas.height = 135;
            const ctx = canvas.getContext("2d");
            let thumb: string | undefined;
            try {
              ctx?.drawImage(el, 0, 0, canvas.width, canvas.height);
              thumb = canvas.toDataURL("image/jpeg", 0.7);
            } catch {
              thumb = undefined;
            }
            setMedia((m) =>
              m.map((a) => (a.id === asset.id ? { 
                ...a, 
                duration: dur, 
                ...(thumb ? { thumb } : {}),
                metadata: {
                  width: videoWidth,
                  height: videoHeight,
                  fps,
                  codec: file.type.split('/')[1] || 'h264'
                }
              } : a))
            );
          };
        };
      } else if (kind === "audio") {
        const el = document.createElement("audio");
        el.preload = "metadata";
        el.src = url;
        el.onloadedmetadata = async () => {
          const dur = isFinite(el.duration) ? el.duration : 10;
          setMedia((m) =>
            m.map((a) => (a.id === asset.id ? { 
              ...a, 
              duration: dur,
              metadata: {
                sampleRate: 44100,
                channels: 2,
                codec: file.type.split('/')[1] || 'aac'
              }
            } : a))
          );
          
          // Generate waveform data
          try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuffer = await fetch(url).then(response => response.arrayBuffer());
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0);
            
            // Downsample for waveform visualization
            const samples = 100;
            const blockSize = Math.floor(channelData.length / samples);
            const waveform: number[] = [];
            for (let i = 0; i < samples; i++) {
              let sum = 0;
              for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(channelData[i * blockSize + j]);
              }
              waveform.push(sum / blockSize);
            }
            
            setMedia((m) =>
              m.map((a) => (a.id === asset.id ? { ...a, waveform } : a))
            );
          } catch (error) {
            console.error('Failed to generate waveform:', error);
          }
        };
      }
    }
  }, []);

  const onClipPointerDown = (
    e: React.PointerEvent,
    clip: Clip,
    mode: "move" | "trim-in" | "trim-out"
  ) => {
    e.stopPropagation();
    const track = doc.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;
    
    // Select the clip and ensure inspector updates
    setSelectedClipId(clip.id);
    
    // Auto-switch to properties tab when selecting a clip
    setInspectorTab("properties");
    
    // Show trim time tooltip when trimming
    if (mode === "trim-in" || mode === "trim-out") {
      setTrimMode(mode);
      const time = mode === "trim-in" ? clip.start : clip.start + clip.duration;
      setShowTrimTime(formatTime(time));
    }
    
    if (tool === "razor") {
      razorAt(timeFromClientX(e.clientX), clip.id);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (mode === "move") {
      const slip = tool === "slip" || e.altKey;
      dragRef.current = slip
        ? { mode: "slip", id: clip.id, startX: e.clientX, orig: { ...clip } }
        : { mode: "move", id: clip.id, grabOffset: timeFromClientX(e.clientX) - clip.start, originTrack: clip.trackId };
    } else {
      dragRef.current = { mode, id: clip.id, startX: e.clientX, orig: { ...clip } };
    }
  };

  const onTimelinePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = timeFromClientX(e.clientX);

    if (drag.mode === "move") {
      const raw = Math.max(0, t - drag.grabOffset);
      const { value, guide } = applySnap(raw);
      setSnapGuide(guide);
      
      const rowEls = document.querySelectorAll<HTMLElement>("[data-track-row]");
      let targetTrack = drag.originTrack;
      rowEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          targetTrack = el.getAttribute("data-track-row") ?? targetTrack;
        }
      });
      const tgt = doc.tracks.find((tr) => tr.id === targetTrack);
      const cur = doc.clips.find((c) => c.id === drag.id);
      const compatible =
        tgt && cur
          ? tgt.locked
            ? false
            : cur.text
              ? tgt.kind === "text"
              : doc.tracks.find((x) => x.id === drag.originTrack)?.kind === tgt.kind
          : false;
      live((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id === drag.id ? { ...c, start: value, trackId: compatible ? targetTrack : c.trackId } : c
        ),
      }));
    } else if (drag.mode === "trim-in") {
      const raw = clamp(t, 0, drag.orig.start + drag.orig.duration - 0.2);
      const { value, guide } = applySnap(raw);
      setSnapGuide(guide);
      setShowTrimTime(formatTime(value)); // Update trim time display
      const delta = value - drag.orig.start;
      live((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id === drag.id
            ? { ...c, start: value, duration: drag.orig.duration - delta, srcIn: Math.max(0, drag.orig.srcIn + delta) }
            : c
        ),
      }));
    } else if (drag.mode === "trim-out") {
      const raw = clamp(t, drag.orig.start + 0.2, duration);
      const { value, guide } = applySnap(raw);
      setSnapGuide(guide);
      setShowTrimTime(formatTime(value)); // Update trim time display
      live((d) => ({
        ...d,
        clips: d.clips.map((c) => (c.id === drag.id ? { ...c, duration: value - drag.orig.start } : c)),
      }));
    } else if (drag.mode === "slip") {
      const deltaSec = (e.clientX - drag.startX) / pxPerSec;
      const maxIn = Math.max(0, drag.orig.srcDuration - drag.orig.duration);
      live((d) => ({
        ...d,
        clips: d.clips.map((c) =>
          c.id === drag.id ? { ...c, srcIn: clamp(drag.orig.srcIn - deltaSec, 0, maxIn) } : c
        ),
      }));
    }
  };

  const endDrag = () => {
    if (dragRef.current) {
      dragRef.current = null;
      setSnapGuide(null);
      setShowTrimTime(null); // Hide trim time tooltip
      setTrimMode(null); // Reset trim mode
      setDoc((cur) => {
        setPast((p) => [...p.slice(-49), cur]);
        setFuture([]);
        return cur;
      });
    }
  };

  const onRulerPointerDown = (e: React.PointerEvent) => {
    setPlayhead(timeFromClientX(e.clientX));
    const move = (ev: PointerEvent) => setPlayhead(timeFromClientX(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* wheel zoom */
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setZoom((z) => clamp(z * Math.exp(-dy * 0.0015), 25, 800));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------------- canvas transform box ---------------- */
  const canvasDrag = useRef<
    | null
    | { mode: "move" | "scale" | "rotate"; startX: number; startY: number; orig: Transform; cx: number; cy: number }
  >(null);

  const onBoxPointerDown = (e: React.PointerEvent, mode: "move" | "scale" | "rotate") => {
    if (!selected) return;
    e.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    canvasDrag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...selected.transform },
      cx: rect ? rect.left + rect.width / 2 : 0,
      cy: rect ? rect.top + rect.height / 2 : 0,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onBoxPointerMove = (e: React.PointerEvent) => {
    const d = canvasDrag.current;
    if (!d || !selected) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (d.mode === "move") {
      patchClip(
        selected.id,
        {
          transform: {
            ...d.orig,
            x: d.orig.x + ((e.clientX - d.startX) / rect.width) * 100,
            y: d.orig.y + ((e.clientY - d.startY) / rect.height) * 100,
          },
        },
        false
      );
    } else if (d.mode === "scale") {
      const delta = (e.clientX - d.startX + (e.clientY - d.startY)) / 3;
      patchClip(selected.id, { transform: { ...d.orig, scale: clamp(d.orig.scale + delta, 10, 400) } }, false);
    } else {
      const ang = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
      patchClip(selected.id, { transform: { ...d.orig, rotation: Math.round(ang) } }, false);
    }
  };

  const onBoxPointerUp = () => {
    if (canvasDrag.current) {
      canvasDrag.current = null;
      setDoc((cur) => {
        setPast((p) => [...p.slice(-49), cur]);
        return cur;
      });
    }
  };

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const meta = e.metaKey || e.ctrlKey;
      
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
        return;
      }
      
      if (meta && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setShowExport(true);
        return;
      }
      
      if (meta && e.key.toLowerCase() === "d" && selectedClipId) {
        e.preventDefault();
        // Duplicate selected clip
        const clip = doc.clips.find(c => c.id === selectedClipId);
        if (clip) {
          const newClip = {
            ...clip,
            id: uid("clip"),
            start: clip.start + clip.duration + 0.5,
            keyframes: clip.keyframes.map(k => ({ ...k, id: uid("kf") }))
          };
          commit((d) => ({ ...d, clips: [...d.clips, newClip] }));
          setSelectedClipId(newClip.id);
        }
        return;
      }
      
      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          setIsPlaying((p) => !p);
          break;
        case "c":
          setTool("razor");
          razorAt(playhead);
          break;
        case "v":
          setTool("select");
          break;
        case "y":
          setTool("slip");
          break;
        case "s":
          setSnapping((s) => !s);
          break;
        case "delete":
        case "backspace":
          deleteSelected();
          break;
        case "arrowleft":
          setPlayhead((p) => clamp(p - (e.shiftKey ? 1 : 1 / 30), 0, duration));
          break;
        case "arrowright":
          setPlayhead((p) => clamp(p + (e.shiftKey ? 1 : 1 / 30), 0, duration));
          break;
        case "arrowup":
          if (selectedClipId) {
            const clip = doc.clips.find(c => c.id === selectedClipId);
            const trackIndex = doc.tracks.findIndex(t => t.id === clip?.trackId);
            if (trackIndex > 0) {
              const newTrack = doc.tracks[trackIndex - 1];
              if (newTrack && clip) {
                patchClip(selectedClipId, { trackId: newTrack.id });
              }
            }
          }
          break;
        case "arrowdown":
          if (selectedClipId) {
            const clip = doc.clips.find(c => c.id === selectedClipId);
            const trackIndex = doc.tracks.findIndex(t => t.id === clip?.trackId);
            if (trackIndex < doc.tracks.length - 1) {
              const newTrack = doc.tracks[trackIndex + 1];
              if (newTrack && clip) {
                patchClip(selectedClipId, { trackId: newTrack.id });
              }
            }
          }
          break;
        case "home":
          setPlayhead(0);
          break;
        case "end":
          setPlayhead(duration);
          break;
        case "1":
          setInspectorTab("properties");
          break;
        case "2":
          setInspectorTab("color");
          break;
        case "3":
          setInspectorTab("audio");
          break;
        case "4":
          setInspectorTab("keyframes");
          break;
        case "escape":
          setSelectedClipId(null);
          break;
        case "?":
          setShowShortcuts(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, playhead, duration, undo, redo, deleteSelected, razorAt, selectedClipId, doc.clips, doc.tracks]);

  /* ---------------- export ---------------- */
  const [exportCfg, setExportCfg] = useState({ res: "1080p", fps: 30, format: "MP4", bitrate: 12 });
  const [renderPct, setRenderPct] = useState<number | null>(null);
  const [renderStep, setRenderStep] = useState("");
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportVideoRef = useRef<HTMLVideoElement>(null);

  const startRender = async () => {
    setRenderPct(0);
    setRenderStep("Initializing render engine...");
    
    try {
      // Create canvas for rendering
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      // Set resolution based on export config
      const resolutions: Record<string, { width: number; height: number }> = {
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
        '4K': { width: 3840, height: 2160 }
      };
      const res = resolutions[exportCfg.res] || resolutions['1080p'];
      canvas.width = res.width;
      canvas.height = res.height;
      
      setRenderStep("Setting up MediaRecorder...");
      setRenderPct(5);
      
      // Setup MediaRecorder with appropriate mime type
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8', 
        'video/webm',
        'video/mp4'
      ];
      
      let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      if (!selectedMimeType) {
        throw new Error('No supported video format found');
      }
      
      const stream = canvas.captureStream(exportCfg.fps);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: exportCfg.bitrate * 1000000
      });
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        setExportBlob(blob);
        setRenderPct(100);
        setRenderStep("Render complete!");
      };
      
      mediaRecorder.start();
      setRenderPct(10);
      setRenderStep("Rendering frames...");
      
      // Get the main video element
      const mainVideo = videoRef.current;
      if (!mainVideo) throw new Error('Main video not found');
      
      // Store original playback state
      const wasPlaying = !mainVideo.paused;
      const originalTime = mainVideo.currentTime;
      mainVideo.pause();
      
      // Render frame by frame
      const totalFrames = Math.ceil(duration * exportCfg.fps);
      const frameInterval = 1 / exportCfg.fps;
      
      for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame * frameInterval;
        
        // Update progress
        const progress = 10 + (frame / totalFrames) * 80;
        setRenderPct(progress);
        setRenderStep(`Rendering frame ${frame + 1} of ${totalFrames}...`);
        
        // Seek video to current frame time
        mainVideo.currentTime = currentTime;
        await new Promise(resolve => {
          if (mainVideo.seeking) {
            mainVideo.onseeked = resolve;
          } else {
            resolve(undefined);
          }
        });
        
        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame
        ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);
        
        // Apply CSS filters to context if there are active video clips
        if (activeVideoClips.length > 0) {
          const filters = activeVideoClips[0].filters;
          ctx.filter = filterCss(filters);
        }
        
        // Render text overlays for active clips
        const activeTextClips = doc.clips.filter(c => 
          c.text && 
          playhead >= c.start && 
          playhead <= c.start + c.duration
        );
        
        activeTextClips.forEach(clip => {
          if (!clip.text) return;
          const ts = clip.text;
          
          ctx.save();
          ctx.font = `${ts.fontWeight} ${ts.fontSize}px ${ts.fontFamily}`;
          ctx.fillStyle = ts.color;
          ctx.textAlign = ts.align === 'left' ? 'left' : ts.align === 'right' ? 'right' : 'center';
          
          // Position text based on alignment
          const x = ts.align === 'left' ? 100 : ts.align === 'right' ? canvas.width - 100 : canvas.width / 2;
          const y = ts.preset === 'lower-third' ? canvas.height - 100 : canvas.height / 2;
          
          // Apply text shadow
          if (ts.shadow > 0) {
            ctx.shadowColor = 'rgba(0,0,0,0.75)';
            ctx.shadowBlur = ts.shadow;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = ts.shadow / 3;
          }
          
          // Draw background box if enabled
          if (ts.boxed) {
            const metrics = ctx.measureText(ts.content);
            const padding = 20;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            const boxX = ts.align === 'left' ? x - padding : ts.align === 'right' ? x - metrics.width - padding : x - metrics.width / 2 - padding;
            ctx.fillRect(boxX, y - ts.fontSize, metrics.width + padding * 2, ts.fontSize + padding * 1.5);
            
            // Redraw text
            ctx.fillStyle = ts.color;
          }
          
          ctx.fillText(ts.content, x, y);
          ctx.restore();
        });
        
        // Small delay to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      // Stop recording
      mediaRecorder.stop();
      
      // Restore video state
      mainVideo.currentTime = originalTime;
      if (wasPlaying) mainVideo.play();
      
    } catch (error) {
      console.error('Render error:', error);
      setRenderStep(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setRenderPct(null);
    }
  };
  
  const downloadExport = () => {
    if (!exportBlob) return;
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pronax-export-${Date.now()}.${exportCfg.format.toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportBlob(null);
    setShowExport(false);
  };

  /* ---------------- save ---------------- */
  const handleSave = () => {
    if (!videoProp) return;
    const finalRestrictions = claimResolved
      ? restrictionList.filter((r) => !r.toLowerCase().includes("copyright"))
      : restrictionList;
    onSaveVideo({
      ...videoProp,
      restrictions: finalRestrictions.length ? finalRestrictions : ["None"],
      trimmedStartSec: Math.min(...doc.clips.map((c) => c.start), 0),
      trimmedEndSec: duration,
      blurOverlays: doc.blurOverlays,
      endScreenElements: doc.endScreenElements,
    });
    onClose();
  };

  /* ---------------- project save/load ---------------- */
  const saveProject = () => {
    const projectData = {
      version: '1.0',
      timestamp: Date.now(),
      videoId: videoProp?.id,
      doc: {
        tracks: doc.tracks,
        clips: doc.clips,
        blurOverlays: doc.blurOverlays,
        endScreenElements: doc.endScreenElements,
      },
      media: media.map(m => ({
        ...m,
        // Don't save blob URLs, they won't work after reload
        url: m.url.startsWith('blob:') ? '' : m.url,
        thumb: m.thumb?.startsWith('blob:') ? '' : m.thumb,
      })),
      exportCfg,
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pronax-project-${videoProp?.title || 'untitled'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target?.result as string);
        if (projectData.doc) {
          setDoc(projectData.doc);
          setExportCfg(projectData.exportCfg || exportCfg);
          // Note: Media URLs won't work for blob URLs, user needs to re-import
          if (projectData.media) {
            setMedia(projectData.media);
          }
        }
      } catch (error) {
        console.error('Failed to load project:', error);
      }
    };
    reader.readAsText(file);
  };

  const projectInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- derived render data ---------------- */
  // Performance optimization: memoize active clips calculation
  const activeVideoClips = useMemo(() => {
    return doc.clips
      .filter((c) => {
        const t = doc.tracks.find((tr) => tr.id === c.trackId);
        return t && !t.hidden && t.kind !== "audio" && playhead >= c.start && playhead <= c.start + c.duration;
      })
      .sort((a, b) => {
        const ai = doc.tracks.findIndex((t) => t.id === a.trackId);
        const bi = doc.tracks.findIndex((t) => t.id === b.trackId);
        return bi - ai;
      });
  }, [doc.clips, doc.tracks, playhead]);

  // Performance optimization: memoize keyframe value calculation
  const kfValue = useCallback((clip: Clip, prop: Keyframe["prop"], fallback: number) => {
    const ks = clip.keyframes.filter((k) => k.prop === prop).sort((a, b) => a.time - b.time);
    const first = ks[0];
    const last = ks[ks.length - 1];
    if (!first || !last) return fallback;
    const t = playhead - clip.start;
    if (t <= first.time) return first.value;
    if (t >= last.time) return last.value;
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i];
      const b = ks[i + 1];
      if (!a || !b) continue;
      if (t >= a.time && t <= b.time) {
        const r = (t - a.time) / Math.max(0.0001, b.time - a.time);
        return a.value + (b.value - a.value) * r;
      }
    }
    return fallback;
  }, [playhead]);

  // Performance optimization: memoize transition style calculation
  const transitionStyle = useCallback((clip: Clip): React.CSSProperties => {
    if (clip.transitionIn === "none") return {};
    const t = playhead - clip.start;
    const dur = 0.9;
    if (t > dur) return {};
    const p = clamp(t / dur, 0, 1);
    switch (clip.transitionIn) {
      case "fade":
      case "cross-dissolve":
        return { opacity: p };
      case "slide-left":
        return { transform: `translateX(${(1 - p) * 100}%)` };
      case "slide-right":
        return { transform: `translateX(${-(1 - p) * 100}%)` };
      case "zoom-in":
        return { transform: `scale(${0.6 + p * 0.4})`, opacity: p };
      case "zoom-out":
        return { transform: `scale(${1.5 - p * 0.5})`, opacity: p };
      case "wipe":
        return { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
      case "glitch":
        return {
          opacity: 0.4 + p * 0.6,
          filter: `hue-rotate(${(1 - p) * 180}deg)`,
          transform: `translateX(${Math.sin(t * 60) * (1 - p) * 12}px)`,
        };
      default:
        return {};
    }
  }, [playhead]);

  if (!isOpen || !videoProp) return null;

  const audioTracks = doc.tracks.filter((t) => t.kind === "audio");

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0d] text-white overflow-hidden select-none"
      style={{
        perspective: '2000px',
      }}
    >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        className="hidden"
        onChange={(e) => e.target.files && ingestFiles(e.target.files)}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            setAudioTrackName(e.target.files[0].name);
            ingestFiles(e.target.files);
          }
        }}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            loadProject(e.target.files[0]);
          }
        }}
      />
      <audio
        ref={audioPreviewRef}
        className="hidden"
        onEnded={() => setPreviewingAudio(null)}
      />

      {/* 2. TOP COPYRIGHT NOTICE BAR (pronax Studio Style) */}
      {hasClaim && !claimResolved && (
        <div className="bg-[#FE2C55]/90 backdrop-blur px-4 py-2 flex items-center justify-between border-b border-[#FE2C55]/50">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-full animate-pulse">
              <AlertTriangle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold">Copyright content found in your video</p>
              <p className="text-[10px] text-white/80">Impact: {claimData.content} ({formatTime(claimData.start)} - {formatTime(claimData.end)})</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={trimClaimSegment}
              className="bg-white text-[#FE2C55] text-[10px] font-bold px-3 py-1.5 rounded-md hover:bg-gray-100 transition-all flex items-center gap-1"
            >
              <Scissors className="h-3 w-3" /> Trim Out Segment
            </button>
            <button
              onClick={muteClaimSegment}
              className="bg-[#CC1A3E] text-white text-[10px] font-bold px-3 py-1.5 rounded-md border border-[#FE2C55]/30 hover:bg-[#B01535]"
            >
              <VolumeX className="h-3 w-3 inline mr-1" /> Mute Audio
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#2a2a35] bg-gradient-to-r from-[#1a1a20] to-[#151518] shrink-0 shadow-lg shadow-black/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[#2a2a35] text-gray-400 hover:text-white transition-all duration-200 shrink-0 hover:scale-105 hover:shadow-lg hover:shadow-[#FE2C55]/20"
            title="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5 truncate tracking-tight">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-lg">ProNax Video Suite</span>
              {hasClaim && !claimResolved ? (
                <span className="text-[10px] bg-[#FE2C55]/20 text-[#FE2C55] border border-[#FE2C55]/40 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 shadow-sm shadow-[#FE2C55]/10">
                  <AlertTriangle className="h-3 w-3" /> Copyright claim
                </span>
              ) : claimResolved ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 shadow-sm shadow-emerald-500/10"
                >
                  <CheckCircle2 className="h-3 w-3" /> Monetization restored
                </motion.span>
              ) : (
                <span className="hidden sm:inline text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2.5 py-1 rounded-full font-semibold shadow-sm shadow-blue-500/10">
                  NLE Pro
                </span>
              )}
            </h2>
            <p className="text-[11px] text-gray-400 truncate max-w-[220px] sm:max-w-md font-medium">{videoProp?.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Trim Preset Buttons */}
          {selectedClipId && (
            <div className="flex items-center gap-1.5 border-r border-[#333340] pr-2.5 mr-1">
              <button
                onClick={trimFromPlayhead}
                className="flex items-center gap-1.5 text-[10px] text-gray-300 hover:text-white bg-[#24282e] hover:bg-[#2e333a] px-2.5 py-2 rounded-lg border border-[#333340] transition-all duration-200 hover:scale-105 shadow-sm"
                title="Trim from start to playhead"
              >
                <SkipBack className="h-3 w-3" />
                <span className="hidden sm:inline">Trim Start</span>
              </button>
              <button
                onClick={trimToPlayhead}
                className="flex items-center gap-1.5 text-[10px] text-gray-300 hover:text-white bg-[#24282e] hover:bg-[#2e333a] px-2.5 py-2 rounded-lg border border-[#333340] transition-all duration-200 hover:scale-105 shadow-sm"
                title="Trim from playhead to end"
              >
                <SkipForward className="h-3 w-3" />
                <span className="hidden sm:inline">Trim End</span>
              </button>
              <button
                onClick={trimClipToSelection}
                className="flex items-center gap-1.5 text-[10px] text-gray-300 hover:text-white bg-[#24282e] hover:bg-[#2e333a] px-2.5 py-2 rounded-lg border border-[#333340] transition-all duration-200 hover:scale-105 shadow-sm"
                title="Trim to 10s from playhead"
              >
                <Scissors className="h-3 w-3" />
                <span className="hidden sm:inline">Trim 10s</span>
              </button>
            </div>
          )}
          
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-2.5 rounded-xl bg-[#24282e] hover:bg-[#2e333a] text-gray-300 transition-all duration-200 hover:scale-105 border border-[#333340] shadow-sm"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setDoc(initialDoc);
              setPast([]);
              setFuture([]);
            }}
            className="flex items-center gap-2 text-xs text-gray-300 hover:text-white bg-[#24282e] hover:bg-[#2e333a] px-4 py-2.5 rounded-xl border border-[#333340] transition-all duration-200 hover:scale-105 shadow-sm"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-medium">Reset</span>
          </button>
          <button
            onClick={saveProject}
            className="flex items-center gap-2 text-xs text-gray-300 hover:text-white bg-[#24282e] hover:bg-[#2e333a] px-4 py-2.5 rounded-xl border border-[#333340] transition-all duration-200 hover:scale-105 shadow-sm"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-medium">Save Project</span>
          </button>
          <button
            onClick={() => projectInputRef.current?.click()}
            className="flex items-center gap-2 text-xs text-gray-300 hover:text-white bg-[#24282e] hover:bg-[#2e333a] px-4 py-2.5 rounded-xl border border-[#333340] transition-all duration-200 hover:scale-105 shadow-sm"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-medium">Load Project</span>
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 px-4 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg shadow-blue-500/25"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-[#FE2C55] to-[#FF4D6D] hover:from-[#FF4D6D] hover:to-[#FE2C55] px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 shadow-xl shadow-[#FE2C55]/30 active:scale-95 hover:shadow-2xl hover:shadow-[#FE2C55]/40"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* LEFT: Media bin */}
        <div className="w-72 bg-[#0f0f12] border-r border-[#2a2a35] flex flex-col shrink-0">
          <div className="flex border-b border-[#2a2a35] bg-[#16161a]">
            {(["media", "effects", "text", "transitions", "audio"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-1 py-3 text-[9px] font-bold uppercase transition-all border-b-2 ${
                  activeTab === tab
                    ? "border-blue-500 text-blue-400 bg-blue-500/10 shadow-sm"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#1e1e24]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeTab === "media" && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverBin(true);
                  }}
                  onDragLeave={() => setDragOverBin(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverBin(false);
                    if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-200 ${
                    dragOverBin
                      ? "border-blue-400 bg-blue-500/15 shadow-lg shadow-blue-500/20 scale-[1.02]"
                      : "border-[#3a3a45] bg-[#1a1a20] hover:border-blue-500/50 hover:bg-[#1e1e26] hover:shadow-lg"
                  }`}
                >
                  <Upload className="h-6 w-6 mx-auto text-blue-400 mb-3" />
                  <p className="text-[12px] font-bold text-white">Drop media here</p>
                  <p className="text-[10px] text-gray-500 mt-1">MP4 · MOV · WebM · MP3 · WAV · PNG · JPG</p>
                </div>

                {media.length === 0 && (
                  <p className="text-[11px] text-gray-600 text-center pt-3 italic">Media bin is empty</p>
                )}

                {media.map((a) => (
                  <div key={a.id} className="bg-[#1a1a20] border border-[#2e2e38] rounded-xl overflow-hidden group hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200">
                    <div className="h-20 bg-black/60 flex items-center justify-center overflow-hidden relative">
                      {a.thumb ? (
                        <img src={a.thumb} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : a.kind === "audio" ? (
                        <Music className="h-7 w-7 text-emerald-400" />
                      ) : (
                        <VideoIcon className="h-7 w-7 text-blue-400" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      {a.kind === "audio" && (
                        <button
                          onClick={() => toggleAudioPreview(a)}
                          className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-all"
                        >
                          {previewingAudio === a.url ? (
                            <Pause className="h-4 w-4 text-white" />
                          ) : (
                            <Play className="h-4 w-4 text-white" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-[11px] font-bold text-white truncate">{a.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {formatTime(a.duration)} · {(a.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                      <button
                        onClick={() => addAssetToTimeline(a)}
                        className="mt-2 w-full py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-[10px] font-bold text-white flex items-center justify-center gap-1.5 transition-all duration-200 hover:scale-[1.02] shadow-md shadow-blue-500/20"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add to timeline
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === "effects" && (
              <>
                {[
                  { k: "chroma", label: "Chroma Key", desc: "Green screen removal" },
                  { k: "blur", label: "Gaussian Blur", desc: "Soften image" },
                  { k: "sepia", label: "Vintage Sepia", desc: "Warm film look" },
                  { k: "invert", label: "Invert", desc: "Negative colors" },
                ].map((fx) => (
                  <button
                    key={fx.k}
                    disabled={!selected}
                    onClick={() => {
                      if (!selected) return;
                      if (fx.k === "chroma") patchClip(selected.id, { chroma: { ...selected.chroma, enabled: true } });
                      if (fx.k === "blur") patchClip(selected.id, { filters: { ...selected.filters, blur: 6 } });
                      if (fx.k === "sepia") patchClip(selected.id, { filters: { ...selected.filters, sepia: 60 } });
                      if (fx.k === "invert") patchClip(selected.id, { filters: { ...selected.filters, invert: 100 } });
                      setInspectorTab("color");
                    }}
                    className="w-full p-2.5 bg-[#17171b] hover:bg-[#202026] disabled:opacity-40 border border-[#26262c] rounded-lg text-left transition-all"
                  >
                    <p className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <EffectsIcon className="h-3.5 w-3.5 text-purple-400" /> {fx.label}
                    </p>
                    <p className="text-[9px] text-gray-500 ml-5">{fx.desc}</p>
                  </button>
                ))}
                <div className="pt-2">
                  <p className="text-[9px] uppercase font-bold text-gray-500 mb-1.5">Blend mode</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["normal", "multiply", "screen", "overlay", "soft-light"] as BlendMode[]).map((b) => (
                      <button
                        key={b}
                        disabled={!selected}
                        onClick={() => selected && patchClip(selected.id, { blend: b })}
                        className={`px-2 py-1.5 rounded text-[9px] font-bold uppercase border transition-all disabled:opacity-40 ${
                          selected?.blend === b
                            ? "bg-purple-600 border-purple-400 text-white"
                            : "bg-[#17171b] border-[#26262c] text-gray-400 hover:text-white"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === "text" && (
              <>
                {TEXT_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => addTextClip(p.key, p.label)}
                    className="w-full p-2.5 bg-[#17171b] hover:bg-[#202026] border border-[#26262c] rounded-lg text-left transition-all"
                  >
                    <p className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <Type className="h-3.5 w-3.5 text-yellow-400" /> {p.label}
                    </p>
                    <p className="text-[9px] text-gray-500 ml-5">{p.hint}</p>
                  </button>
                ))}
              </>
            )}

            {activeTab === "transitions" && (
              <>
                <p className="text-[9px] text-gray-500 pb-1">
                  {selected ? `Applies to: ${selected.name}` : "Select a clip first"}
                </p>
                {TRANSITIONS.map((t) => (
                  <button
                    key={t.key}
                    disabled={!selected}
                    onClick={() => selected && patchClip(selected.id, { transitionIn: t.key })}
                    className={`w-full p-2.5 rounded-lg text-[11px] font-bold text-left flex items-center gap-2 border transition-all disabled:opacity-40 ${
                      selected?.transitionIn === t.key
                        ? "bg-cyan-600/25 border-cyan-500 text-cyan-200"
                        : "bg-[#17171b] border-[#26262c] text-gray-300 hover:text-white"
                    }`}
                  >
                    <Wand2 className="h-3.5 w-3.5 text-cyan-400" /> {t.label}
                  </button>
                ))}
              </>
            )}

            {activeTab === "audio" && (
              <>
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full p-2.5 bg-[#17171b] hover:bg-[#202026] border border-[#26262c] rounded-lg text-[11px] font-bold text-gray-200 flex items-center gap-2"
                >
                  <Music className="h-3.5 w-3.5 text-emerald-400" /> Swap / add music
                </button>
                <p className="text-[9px] text-gray-500 pt-1">Current bed: {audioTrackName}</p>
              </>
            )}
          </div>

          <div className="p-2 border-t border-[#242428] grid grid-cols-4 gap-1">
            {(["video", "audio", "text", "adjustment"] as TrackKind[]).map((k) => (
              <button
                key={k}
                onClick={() => addTrack(k)}
                title={`Add ${k} track`}
                className="py-1.5 rounded bg-[#1c1c22] hover:bg-[#26262e] text-[8px] font-bold uppercase text-gray-400 hover:text-white"
              >
                +{k[0]}
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: Program Monitor */}
        <div className="flex-1 bg-[#09090c] flex flex-col min-w-0">
          {/* Video Controls Top Bar */}
          <div className="h-10 border-b border-[#2a2a35] bg-[#1E1E24] flex items-center justify-between px-4">
            <span className="text-[11px] font-medium text-gray-400">Program Monitor</span>
            <div className="flex items-center gap-2">
              <select
                value={exportCfg.res}
                onChange={(e) => setExportCfg({ ...exportCfg, res: e.target.value })}
                className="bg-[#121215] text-white text-[10px] font-bold px-2 py-1 rounded border border-[#3a3a45] outline-none hover:border-blue-500/40 transition-colors"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4K">4K</option>
              </select>
              <div className="h-5 w-px bg-[#3a3a45]" />
              <button onClick={() => setViewportZoom(clamp(viewportZoom - 10, 30, 200))} className="p-1 hover:bg-[#2a2a35] rounded text-gray-400 hover:text-white transition-all">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-mono text-gray-300 w-8 text-center">{viewportZoom}%</span>
              <button onClick={() => setViewportZoom(clamp(viewportZoom + 10, 30, 200))} className="p-1 hover:bg-[#2a2a35] rounded text-gray-400 hover:text-white transition-all">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <div className="h-5 w-px bg-[#3a3a45]" />
              <button onClick={() => setFullscreen(!fullscreen)} className="p-1 hover:bg-[#2a2a35] rounded text-gray-400 hover:text-white transition-all">
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
            <div
              ref={viewportRef}
              onPointerMove={onBoxPointerMove}
              onPointerUp={onBoxPointerUp}
              onPointerDown={() => setSelectedClipId(null)}
              className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden border border-[#3a4a5d] shadow-2xl"
              style={{
                transform: `perspective(1600px) rotateX(2.5deg) scale(${viewportZoom / 100})`,
                transformStyle: 'preserve-3d',
                boxShadow:
                  '0 50px 100px -30px rgba(59,130,246,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 2px 0 rgba(255,255,255,0.08) inset, 0 0 60px rgba(59,130,246,0.15)',
                transition: 'transform .45s cubic-bezier(.2,.7,.2,1)',
              }}
            >
              <video
                ref={videoRef}
                src={videoProp?.url || videoProp?.videoUrl || ''}
                className="absolute inset-0 w-full h-full object-contain"
                muted={false}
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                style={{
                  filter: activeVideoClips.length > 0 
                    ? filterCss(activeVideoClips[0].filters) 
                    : 'none'
                }}
                onLoadStart={() => {
                  console.log('[VideoEditor] Video loading started', videoProp?.url || videoProp?.videoUrl);
                  setVideoLoadError(false);
                }}
                onCanPlay={() => {
                  console.log('[VideoEditor] Video can play');
                  setVideoLoadError(false);
                }}
                onError={(e) => {
                  // Avoid circular structure error by logging only error message
                  const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                  console.error('[VideoEditor] Video error:', errorMessage);
                  // Stop playback attempts on error
                  setIsPlaying(false);
                  setVideoLoadError(true);
                }}
              />

              {/* Video Error Fallback UI */}
              {videoLoadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-8">
                  <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Video Load Failed</h3>
                  <p className="text-gray-400 text-sm text-center mb-4">
                    The video URL is not accessible (403 Forbidden). 
                    Please upload a local video file or use a different video source.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm transition-all"
                  >
                    Upload Local Video
                  </button>
                </div>
              )}

              {activeVideoClips.map((clip) => {
                const asset = media.find((m) => m.id === clip.assetId);
                const op = kfValue(clip, "opacity", clip.transform.opacity);
                const style: React.CSSProperties = {
                  mixBlendMode: clip.blend === "normal" ? undefined : (clip.blend as any),
                  opacity: op / 100,
                  filter: `${filterCss(clip.filters)} blur(${kfValue(clip, "blur", clip.filters.blur)}px)`,
                  transform: `translate(${kfValue(clip, "x", clip.transform.x)}%, ${kfValue(
                    clip,
                    "y",
                    clip.transform.y
                  )}%) scale(${kfValue(clip, "scale", clip.transform.scale) / 100}) rotate(${kfValue(
                    clip,
                    "rotation",
                    clip.transform.rotation
                  )}deg)`,
                  ...transitionStyle(clip),
                };
                if (clip.text) {
                  const ts = clip.text;
                  const local = playhead - clip.start;
                  return (
                    <div
                      key={clip.id}
                      className="absolute inset-0 flex px-10"
                      style={{
                        ...style,
                        alignItems: ts.preset === "lower-third" ? "flex-end" : "center",
                        justifyContent:
                          ts.align === "left" ? "flex-start" : ts.align === "right" ? "flex-end" : "center",
                        paddingBottom: ts.preset === "lower-third" ? "12%" : undefined,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: ts.fontFamily,
                          fontWeight: ts.fontWeight,
                          fontSize: ts.fontSize,
                          color: ts.color,
                          WebkitTextStroke: ts.stroke ? `${ts.stroke}px ${ts.strokeColor}` : undefined,
                          textShadow:
                            ts.preset === "neon"
                              ? `0 0 8px ${ts.color}, 0 0 24px ${ts.color}, 0 0 48px ${ts.color}`
                              : ts.shadow
                                ? `0 ${ts.shadow / 3}px ${ts.shadow}px rgba(0,0,0,.75)`
                                : undefined,
                          background: ts.boxed ? "rgba(0,0,0,.6)" : undefined,
                          padding: ts.boxed ? "8px 18px" : undefined,
                          borderLeft: ts.preset === "lower-third" ? "4px solid #ef4444" : undefined,
                          transform:
                            ts.preset === "glitch"
                              ? `translateX(${Math.sin(local * 40) * 3}px)`
                              : ts.preset === "kinetic"
                                ? `scale(${1 + Math.sin(local * 4) * 0.05})`
                                : undefined,
                          letterSpacing: ts.preset === "kinetic" ? "0.06em" : undefined,
                        }}
                      >
                        {ts.content}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={clip.id} className="absolute inset-0" style={style}>
                    {asset?.kind === "image" || asset?.thumb ? (
                      <img src={asset.thumb ?? asset.url} alt={clip.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-black/0" />
                    )}
                    {clip.chroma.enabled && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at 50% 50%, transparent ${100 - clip.chroma.similarity}%, ${clip.chroma.color}22 100%)`,
                          mixBlendMode: "screen",
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {doc.blurOverlays
                .filter((b) => playhead >= b.startTime && playhead <= b.endTime)
                .map((b) => (
                  <div
                    key={b.id}
                    style={{
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      width: `${b.width}%`,
                      height: `${b.height}%`,
                      backdropFilter: "blur(10px)",
                      borderRadius: b.shape === "ellipse" ? "50%" : 8,
                    }}
                    className="absolute border border-purple-400/60 bg-white/5"
                  />
                ))}

              {selected && (
                <div
                  onPointerDown={(e) => onBoxPointerDown(e, "move")}
                  className="absolute cursor-move"
                  style={{
                    left: `${25 + selected.transform.x}%`,
                    top: `${25 + selected.transform.y}%`,
                    width: "50%",
                    height: "50%",
                    transform: `scale(${selected.transform.scale / 100}) rotate(${selected.transform.rotation}deg)`,
                    outline: "1.5px solid #3b82f6",
                    outlineOffset: -1,
                  }}
                >
                  {[
                    ["-6px", "-6px"],
                    ["calc(100% - 6px)", "-6px"],
                    ["-6px", "calc(100% - 6px)"],
                    ["calc(100% - 6px)", "calc(100% - 6px)"],
                  ].map(([l, t], i) => (
                    <div
                      key={i}
                      onPointerDown={(e) => onBoxPointerDown(e, "scale")}
                      style={{ left: l, top: t }}
                      className="absolute h-3 w-3 bg-white border border-blue-500 rounded-sm cursor-nwse-resize"
                    />
                  ))}
                  <div
                    onPointerDown={(e) => onBoxPointerDown(e, "rotate")}
                    className="absolute left-1/2 -top-7 -ml-1.5 h-3 w-3 rounded-full bg-amber-400 border border-white cursor-grab"
                  />
                  <div className="absolute left-1/2 -top-4 w-px h-4 bg-amber-400/70" />
                  <div className="absolute -top-6 left-0 text-[9px] font-mono text-blue-300 bg-black/70 px-1.5 rounded">
                    {selected.name}
                  </div>
                </div>
              )}

              <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/15 pointer-events-none shadow-lg">
                <span className="text-xs font-mono font-bold text-white tracking-wide">
                  {formatTC(playhead, exportCfg.fps)} / {formatTC(duration, exportCfg.fps)}
                </span>
              </div>
            </div>
          </div>

          <div className="h-14 border-t border-[#2a2a35] bg-[#111114] flex items-center justify-center gap-3 shrink-0">
            <button onClick={() => setPlayhead(0)} className="p-2 text-gray-400 hover:text-white hover:bg-[#1e1e24] rounded-lg transition-all hover:scale-110">
              <SkipBack className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="p-3 rounded-xl bg-gradient-to-r from-[#FE2C55] to-[#FF4D6D] hover:from-[#FF4D6D] hover:to-[#FE2C55] text-white shadow-lg shadow-[#FE2C55]/25 transition-all hover:scale-105"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
            <button onClick={() => setPlayhead(duration)} className="p-2 text-gray-400 hover:text-white hover:bg-[#1e1e24] rounded-lg transition-all hover:scale-110">
              <SkipForward className="h-4.5 w-4.5" />
            </button>
            <span className="ml-4 font-mono text-[11px] text-gray-400 bg-[#1e1e24] px-3 py-1.5 rounded-lg border border-[#2e2e38]">
              {exportCfg.res} · {exportCfg.fps}fps
            </span>
          </div>
        </div>

        {/* RIGHT: Inspector */}
        <div className="w-[20rem] bg-[#0f0f12] border-l border-[#2a2a35] flex flex-col shrink-0">
          <div className="flex border-b border-[#2a2a35] bg-[#16161a]">
            {(["properties", "color", "audio", "keyframes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setInspectorTab(tab)}
                className={`flex-1 px-1 py-3 text-[9px] font-bold uppercase transition-all border-b-2 ${
                  inspectorTab === tab
                    ? "border-blue-500 text-blue-400 bg-blue-500/10 shadow-sm"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#1e1e24]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!selected && (
              <p className="text-[12px] text-gray-600 text-center pt-10 italic">
                Select a clip on the timeline to edit its properties.
              </p>
            )}

            {selected && inspectorTab === "properties" && (
              <>
                <Panel title="Transform" icon={<Layers className="h-3 w-3" />}>
                  <Slider label="Position X" value={selected.transform.x} min={-100} max={100} accent="#3b82f6"
                    onChange={(v) => patchClip(selected.id, { transform: { ...selected.transform, x: v } }, false)}
                    onKey={() => addKeyframe("x", selected.transform.x)} />
                  <Slider label="Position Y" value={selected.transform.y} min={-100} max={100} accent="#3b82f6"
                    onChange={(v) => patchClip(selected.id, { transform: { ...selected.transform, y: v } }, false)}
                    onKey={() => addKeyframe("y", selected.transform.y)} />
                  <Slider label="Scale" value={selected.transform.scale} min={10} max={400} suffix="%" accent="#3b82f6"
                    onChange={(v) => patchClip(selected.id, { transform: { ...selected.transform, scale: v } }, false)}
                    onKey={() => addKeyframe("scale", selected.transform.scale)} />
                  <Slider label="Rotation" value={selected.transform.rotation} min={-180} max={180} suffix="°" accent="#f59e0b"
                    onChange={(v) => patchClip(selected.id, { transform: { ...selected.transform, rotation: v } }, false)}
                    onKey={() => addKeyframe("rotation", selected.transform.rotation)} />
                  <Slider label="Opacity" value={selected.transform.opacity} min={0} max={100} suffix="%" accent="#a855f7"
                    onChange={(v) => patchClip(selected.id, { transform: { ...selected.transform, opacity: v } }, false)}
                    onKey={() => addKeyframe("opacity", selected.transform.opacity)} />
                </Panel>

                <Panel title="Clip" icon={<Film className="h-3 w-3" />}>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                    <div className="bg-[#1e1e24] px-2 py-1 rounded border border-[#2e2e38]">In: {formatTC(selected.start, exportCfg.fps)}</div>
                    <div className="bg-[#1e1e24] px-2 py-1 rounded border border-[#2e2e38]">Out: {formatTC(selected.start + selected.duration, exportCfg.fps)}</div>
                    <div className="bg-[#1e1e24] px-2 py-1 rounded border border-[#2e2e38]">Dur: {formatTC(selected.duration, exportCfg.fps)}</div>
                    <div className="bg-[#1e1e24] px-2 py-1 rounded border border-[#2e2e38]">Src: {formatTC(selected.srcIn, exportCfg.fps)}</div>
                  </div>
                  <div className="flex gap-1.5 pt-2">
                    <button onClick={() => razorAt(playhead, selected.id)} className="flex-1 py-2 rounded-lg bg-[#1e1e24] hover:bg-[#2a2a35] text-[10px] font-bold text-gray-200 flex items-center justify-center gap-1.5 border border-[#3a3a45] transition-all hover:scale-[1.02]">
                      <Scissors className="h-3.5 w-3.5" /> Split
                    </button>
                    <button onClick={deleteSelected} className="flex-1 py-2 rounded-lg bg-[#FE2C55]/90 hover:bg-[#FF4D6D] text-[10px] font-bold text-white flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02] shadow-md shadow-[#FE2C55]/20">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-bold text-gray-500 mb-2">Transition in</p>
                    <select
                      value={selected.transitionIn}
                      onChange={(e) => patchClip(selected.id, { transitionIn: e.target.value as TransitionKind })}
                      className="w-full bg-[#1e1e24] border border-[#3a3a45] rounded-lg px-3 py-2 text-[11px] text-white outline-none hover:border-blue-500/40 transition-colors"
                    >
                      <option value="none">None</option>
                      {TRANSITIONS.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </Panel>

                {selected.text && (
                  <Panel title="Text" icon={<Type className="h-3 w-3" />}>
                    <input
                      value={selected.text.content}
                      onChange={(e) =>
                        patchClip(selected.id, { text: { ...selected.text!, content: e.target.value } }, false)
                      }
                      className="w-full bg-[#1e1e24] border border-[#3a3a45] rounded-xl px-3 py-2.5 text-[11px] text-white outline-none hover:border-blue-500/40 transition-colors"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={selected.text.fontFamily}
                        onChange={(e) => patchClip(selected.id, { text: { ...selected.text!, fontFamily: e.target.value } })}
                        className="bg-[#1e1e24] border border-[#3a3a45] rounded-lg px-3 py-2 text-[10px] text-white outline-none hover:border-blue-500/40 transition-colors"
                      >
                        <option value="Inter, system-ui, sans-serif">Inter</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Courier New', monospace">Courier</option>
                        <option value="Impact, sans-serif">Impact</option>
                      </select>
                      <select
                        value={selected.text.fontWeight}
                        onChange={(e) => patchClip(selected.id, { text: { ...selected.text!, fontWeight: Number(e.target.value) } })}
                        className="bg-[#1e1e24] border border-[#3a3a45] rounded-lg px-3 py-2 text-[10px] text-white outline-none hover:border-blue-500/40 transition-colors"
                      >
                        {[300, 400, 600, 700, 800, 900].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                    <Slider label="Size" value={selected.text.fontSize} min={12} max={140} accent="#eab308"
                      onChange={(v) => patchClip(selected.id, { text: { ...selected.text!, fontSize: v } }, false)} />
                    <Slider label="Stroke" value={selected.text.stroke} min={0} max={10} accent="#eab308"
                      onChange={(v) => patchClip(selected.id, { text: { ...selected.text!, stroke: v } }, false)} />
                    <Slider label="Drop shadow" value={selected.text.shadow} min={0} max={40} accent="#eab308"
                      onChange={(v) => patchClip(selected.id, { text: { ...selected.text!, shadow: v } }, false)} />
                    <div className="flex items-center gap-2">
                      <input type="color" value={selected.text.color}
                        onChange={(e) => patchClip(selected.id, { text: { ...selected.text!, color: e.target.value } }, false)}
                        className="h-9 w-12 bg-transparent rounded-lg cursor-pointer border border-[#3a3a45]" />
                      <button
                        onClick={() => patchClip(selected.id, { text: { ...selected.text!, boxed: !selected.text!.boxed } })}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${selected.text.boxed ? "bg-yellow-600 text-white shadow-md shadow-yellow-500/20" : "bg-[#1e1e24] text-gray-400 hover:bg-[#2a2a35] border border-[#3a3a45]"}`}
                      >
                        Background box
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      {(["left", "center", "right"] as const).map((a) => (
                        <button key={a}
                          onClick={() => patchClip(selected.id, { text: { ...selected.text!, align: a } })}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-bold capitalize transition-all ${selected.text!.align === a ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-[#1e1e24] text-gray-400 hover:bg-[#2a2a35] border border-[#3a3a45]"}`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </Panel>
                )}
              </>
            )}

            {selected && inspectorTab === "color" && (
              <>
                <Panel title="Basic correction" icon={<Sliders className="h-3 w-3" />}>
                  {([
                    ["Brightness", "brightness", 0, 200, "%"],
                    ["Contrast", "contrast", 0, 200, "%"],
                    ["Saturation", "saturate", 0, 300, "%"],
                    ["Hue rotate", "hue", -180, 180, "°"],
                    ["Blur", "blur", 0, 20, "px"],
                    ["Sepia", "sepia", 0, 100, "%"],
                    ["Invert", "invert", 0, 100, "%"],
                    ["Temperature", "temperature", -100, 100, ""],
                  ] as [string, keyof Filters, number, number, string][]).map(([label, key, min, max, suffix]) => (
                    <Slider
                      key={key}
                      label={label}
                      value={selected.filters[key]}
                      min={min}
                      max={max}
                      suffix={suffix}
                      accent="#22d3ee"
                      onChange={(v) => patchClip(selected.id, { filters: { ...selected.filters, [key]: v } }, false)}
                      {...(key === "blur" ? { onKey: () => addKeyframe("blur", selected.filters.blur) } : {})}
                    />
                  ))}
                  <button
                    onClick={() => patchClip(selected.id, { filters: { ...DEFAULT_FILTERS } })}
                    className="w-full py-2 rounded-lg bg-[#1e1e24] hover:bg-[#2a2a35] text-[10px] font-bold text-gray-300 border border-[#3a3a45] transition-all hover:scale-[1.02]"
                  >
                    Reset color
                  </button>
                </Panel>

                <Panel title="HSL / Curves" icon={<EffectsIcon className="h-3 w-3" />}>
                  <div className="h-24 rounded bg-[#0e0e12] border border-[#2a2a32] relative overflow-hidden">
                    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                      {[25, 50, 75].map((g) => (
                        <g key={g}>
                          <line x1={g} y1="0" x2={g} y2="100" stroke="#26262c" strokeWidth="0.5" />
                          <line x1="0" y1={g} x2="100" y2={g} stroke="#26262c" strokeWidth="0.5" />
                        </g>
                      ))}
                      <path
                        d={`M0,100 C25,${100 - selected.filters.brightness / 2} 75,${
                          100 - selected.filters.contrast / 2
                        } 100,0`}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                  <div className="flex gap-1">
                    {["#ef4444", "#f59e0b", "#84cc16", "#06b6d4", "#3b82f6", "#a855f7"].map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          patchClip(selected.id, {
                            filters: { ...selected.filters, hue: (parseInt(c.slice(1, 3), 16) % 60) - 30 },
                          })
                        }
                        style={{ background: c }}
                        className="flex-1 h-5 rounded"
                      />
                    ))}
                  </div>
                </Panel>

                <Panel title="Chroma key" icon={<EyeOff className="h-3 w-3" />}>
                  <button
                    onClick={() => patchClip(selected.id, { chroma: { ...selected.chroma, enabled: !selected.chroma.enabled } })}
                    className={`w-full py-2 rounded-lg text-[10px] font-bold transition-all ${selected.chroma.enabled ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20" : "bg-[#1e1e24] text-gray-400 hover:bg-[#2a2a35] border border-[#3a3a45]"}`}
                  >
                    {selected.chroma.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <div className="flex items-center gap-2">
                    <input type="color" value={selected.chroma.color}
                      onChange={(e) => patchClip(selected.id, { chroma: { ...selected.chroma, color: e.target.value } }, false)}
                      className="h-9 w-12 bg-transparent rounded-lg cursor-pointer border border-[#3a3a45]" />
                    <span className="text-[10px] text-gray-400">Key color</span>
                  </div>
                  <Slider label="Similarity" value={selected.chroma.similarity} min={0} max={100} suffix="%" accent="#10b981"
                    onChange={(v) => patchClip(selected.id, { chroma: { ...selected.chroma, similarity: v } }, false)} />
                </Panel>
              </>
            )}

            {inspectorTab === "audio" && (
              <>
                {/* Track Mixer */}
                <Panel title="Track Mixer" icon={<Sliders className="h-3 w-3" />}>
                  {audioTracks.map((t) => {
                    const peak = t.muted ? 0 : clamp((t.volume / 100) * (0.55 + 0.45 * Math.abs(Math.sin(playhead * 3 + t.id.length))), 0, 1);
                    return (
                      <div key={t.id} className="bg-[#1e1e24] border border-[#3a3a45] rounded-lg p-3 mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-emerald-300">{t.name}</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => commit((d) => ({ ...d, tracks: d.tracks.map((x) => (x.id === t.id ? { ...x, muted: !x.muted } : x)) }))}
                              className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${t.muted ? "bg-[#FE2C55] text-white" : "bg-[#2a2a35] text-gray-400 hover:bg-[#3a3a45] border border-[#3a3a45]"}`}
                            >
                              M
                            </button>
                            <button
                              onClick={() => commit((d) => ({ ...d, tracks: d.tracks.map((x) => (x.id === t.id ? { ...x, solo: !x.solo } : x)) }))}
                              className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${t.solo ? "bg-amber-500 text-black" : "bg-[#2a2a35] text-gray-400 hover:bg-[#3a3a45] border border-[#3a3a45]"}`}
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-3 bg-[#0d0d10] rounded overflow-hidden flex flex-col-reverse">
                            <div
                              style={{ height: `${peak * 100}%`, background: peak > 0.85 ? "#ef4444" : peak > 0.6 ? "#eab308" : "#10b981" }}
                              className="w-full transition-all duration-100"
                            />
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <input
                              type="range" min={0} max={150} value={t.volume}
                              onChange={(e) => {
                                const newVolume = Number(e.target.value);
                                live((d) => ({ ...d, tracks: d.tracks.map((x) => (x.id === t.id ? { ...x, volume: newVolume } : x)) }));
                                updateTrackVolume(t.id, newVolume);
                              }}
                              style={{ accentColor: "#10b981" }}
                              className="w-full h-1.5 bg-[#2a2a35] rounded"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-gray-500 font-medium">L</span>
                              <input
                                type="range" min={-100} max={100} value={t.pan}
                                onChange={(e) => live((d) => ({ ...d, tracks: d.tracks.map((x) => (x.id === t.id ? { ...x, pan: Number(e.target.value) } : x)) }))}
                                style={{ accentColor: "#3b82f6" }}
                                className="flex-1 h-1.5 bg-[#2a2a35] rounded"
                              />
                              <span className="text-[8px] text-gray-500 font-medium">R</span>
                            </div>
                            <p className="text-[8px] font-mono text-gray-500">
                              {t.volume === 0 ? "-∞" : Math.round(20 * Math.log10(t.volume / 100))} dB
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Panel>

                {/* Selected Clip Audio */}
                {selected && (
                  <Panel title="Clip audio" icon={<Volume2 className="h-3 w-3" />}>
                    <Slider label="Volume" value={selected.volume} min={0} max={200} suffix="%" accent="#10b981"
                      onChange={(v) => patchClip(selected.id, { volume: v }, false)} />
                    <Slider label="Fade in" value={selected.fadeIn} min={0} max={5} step={0.1} suffix="s" accent="#10b981"
                      onChange={(v) => patchClip(selected.id, { fadeIn: v }, false)} />
                    <Slider label="Fade out" value={selected.fadeOut} min={0} max={5} step={0.1} suffix="s" accent="#10b981"
                      onChange={(v) => patchClip(selected.id, { fadeOut: v }, false)} />
                    {selectedTrack && (
                      <p className="text-[10px] text-gray-500">
                        Track {selectedTrack.name} · {Math.round(20 * Math.log10(Math.max(0.01, selected.volume / 100)))} dB
                      </p>
                    )}
                  </Panel>
                )}
              </>
            )}

            {selected && inspectorTab === "keyframes" && (
              <Panel title="Keyframes" icon={<Diamond className="h-3 w-3" />}>
                {selected.keyframes.length === 0 && (
                  <p className="text-[10px] text-gray-600 italic">
                    No keyframes. Use the ◇ button next to a property to record one at the playhead.
                  </p>
                )}
                {selected.keyframes.map((k) => (
                  <div key={k.id} className="flex items-center justify-between bg-[#1e1e24] border border-[#3a3a45] rounded-lg px-3 py-2">
                    <span className="text-[10px] font-mono text-amber-300 font-medium">{k.prop}</span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {formatTC(k.time, exportCfg.fps)} → {Math.round(k.value)}
                    </span>
                    <button
                      onClick={() => patchClip(selected.id, { keyframes: selected.keyframes.filter((x) => x.id !== k.id) })}
                      className="text-gray-500 hover:text-red-400 hover:bg-red-500/10 p-1 rounded transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </Panel>
            )}
          </div>
        </div>
      </div>


      {/* Timeline Section */}
      <div className="h-[22rem] bg-[#121215] border-t border-[#2a2a35] flex flex-col shrink-0">
        {/* Timeline Toolbar - Unified 40px height */}
        <div className="h-10 flex items-center justify-between px-4 border-b border-[#2a2a35] bg-[#1E1E24]">
          {/* Left: Tools */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-[#121215] rounded-lg p-0.5 border border-[#3a3a45]">
              {([
                ["select", <MousePointer2 key="s" className="h-4 w-4" />, "Select (V)"],
                ["razor", <Scissors key="r" className="h-4 w-4" />, "Split (C)"],
                ["slip", <Film key="y" className="h-4 w-4" />, "Ripple (Y)"],
              ] as [ToolMode, React.ReactNode, string][]).map(([k, icon, title]) => (
                <button
                  key={k}
                  title={title}
                  onClick={() => setTool(k)}
                  className={`p-1.5 rounded transition-all ${
                    tool === k ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-[#2a2a35]"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSnapping((s) => !s)}
              title="Snapping (S)"
              className={`p-1.5 rounded-lg border transition-all ${
                snapping ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-[#121215] border-[#3a3a45] text-gray-500 hover:text-gray-300"
              }`}
            >
              <Magnet className="h-4 w-4" />
            </button>
          </div>

          {/* Center: Playback & Timecode */}
          <div className="flex items-center gap-3">
            <button onClick={() => setPlayhead(0)} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2a35] rounded-lg transition-all">
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="p-2 rounded-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white transition-all"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <button onClick={() => setPlayhead(duration)} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2a35] rounded-lg transition-all">
              <SkipForward className="h-4 w-4" />
            </button>
            {/* Neutral timecode readout - not clickable */}
            <div className="px-4 py-1.5 bg-[#121215] rounded-lg border border-[#3a3a45]">
              <span className="font-mono text-xs text-gray-300">
                {formatTC(playhead, exportCfg.fps)} <span className="text-gray-500">/</span> {formatTC(duration, exportCfg.fps)}
              </span>
            </div>
          </div>

          {/* Right: Zoom & Undo/Redo */}
          <div className="flex items-center gap-2">
            <button onClick={deleteSelected} disabled={!selectedClipId}
              className="p-1.5 rounded-lg bg-[#121215] hover:bg-[#2a2a35] text-gray-400 disabled:opacity-40 border border-[#3a3a45] transition-all">
              <Trash2 className="h-4 w-4" />
            </button>
            <div className="h-6 w-px bg-[#3a3a45]" />
            <button onClick={() => setZoom(Math.max(25, zoom - 50))} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2a35] rounded-lg transition-all">
              <ZoomOut className="h-4 w-4" />
            </button>
            <input type="range" min={25} max={800} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
              style={{ accentColor: "#3b82f6" }} className="w-24 h-1.5 bg-[#2a2a35] rounded" />
            <button onClick={() => setZoom(Math.min(800, zoom + 50))} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2a35] rounded-lg transition-all">
              <ZoomIn className="h-4 w-4" />
            </button>
            <div className="h-6 w-px bg-[#3a3a45]" />
            <button onClick={undo} disabled={!past.length} className="p-1.5 rounded-lg bg-[#121215] hover:bg-[#2a2a35] text-gray-400 disabled:opacity-40 border border-[#3a3a45] transition-all">
              <Undo className="h-4 w-4" />
            </button>
            <button onClick={redo} disabled={!future.length} className="p-1.5 rounded-lg bg-[#121215] hover:bg-[#2a2a35] text-gray-400 disabled:opacity-40 border border-[#3a3a45] transition-all">
              <Redo className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tracks area */}
        <div className="flex-1 flex min-h-0">
          <div className="w-44 shrink-0 border-r border-[#2a2a35] bg-[#131317] overflow-hidden">
            <div className="h-14 border-b border-[#2a2a35]" />
            <div className="overflow-y-auto">
              {doc.tracks.map((t) => {
                const trackLabel = `${t.name} - ${t.kind.toUpperCase()}`;
                const bgColor = t.kind === "video" ? "bg-[#1a1f2e]" : t.kind === "audio" ? "bg-[#1a1f1a]" : t.kind === "text" ? "bg-[#1f1a1a]" : "bg-[#1f1a2e]";
                return (
                  <div key={t.id} className={`h-14 border-b border-[#1e1e24] px-4 py-2 flex flex-col justify-center ${bgColor}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white">{trackLabel}</span>
                      <div className="flex gap-1">
                        <button onClick={() => commit((d) => ({ ...d, tracks: d.tracks.map((x) => x.id === t.id ? { ...x, hidden: !x.hidden } : x) }))}
                          className="text-gray-500 hover:text-white hover:bg-[#2a2a35] p-1 rounded transition-all">
                          {t.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => commit((d) => ({ ...d, tracks: d.tracks.map((x) => x.id === t.id ? { ...x, locked: !x.locked } : x) }))}
                          className="text-gray-500 hover:text-white hover:bg-[#2a2a35] p-1 rounded transition-all">
                          {t.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </button>
                        {t.kind === "audio" && (
                          <button onClick={() => commit((d) => ({ ...d, tracks: d.tracks.map((x) => x.id === t.id ? { ...x, muted: !x.muted } : x) }))}
                            className="text-gray-500 hover:text-white hover:bg-[#2a2a35] p-1 rounded transition-all">
                            {t.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            ref={timelineRef}
            onPointerMove={onTimelinePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0a0a0d]"
          >
            <div style={{ width: Math.max(duration * pxPerSec + 40, timelineRef.current?.scrollWidth || 0), position: "relative", minHeight: "100%" }}>
              <div
                onPointerDown={onRulerPointerDown}
                className="h-14 sticky top-0 z-20 bg-[#131317] border-b border-[#2a2a35] cursor-ew-resize flex items-end"
              >
                <div className="w-full h-8 border-b border-[#2a2a35]">
                  {Array.from({ length: Math.ceil(duration / 5) + 1 }).map((_, i) => (
                    <div key={i} style={{ left: i * 5 * pxPerSec }} className="absolute top-0 h-full border-l border-[#3a3a45]">
                      <span className="ml-2 text-[9px] font-mono text-gray-500">{formatTime(i * 5)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {doc.tracks.map((t) => {
                const trackBgColor = t.kind === "video" ? "bg-[#1a1f2e]" : t.kind === "audio" ? "bg-[#1a1f1a]" : t.kind === "text" ? "bg-[#1f1a1a]" : "bg-[#1f1a2e]";
                const isTrackVisible = !t.hidden;
                const isTrackLocked = t.locked;
                return (
                  <div
                    key={t.id}
                    data-track-row={t.id}
                    onDoubleClick={(e) => tool === "razor" && !isTrackLocked && razorAt(timeFromClientX(e.clientX))}
                    className={`h-14 border-b border-[#1e1e24] relative ${isTrackLocked ? "opacity-50" : ""} ${!isTrackVisible ? "opacity-30" : ""} ${trackBgColor}`}
                  >
                    {isTrackVisible && doc.clips
                      .filter((c) => c.trackId === t.id)
                      .map((c) => {
                        const w = Math.max(6, c.duration * pxPerSec);
                        const isSel = c.id === selectedClipId;
                        const col = TRACK_COLORS[t.kind];
                        return (
                          <div
                            key={c.id}
                            onPointerDown={(e) => !isTrackLocked && onClipPointerDown(e, c, "move")}
                            style={{
                              left: c.start * pxPerSec,
                              width: w,
                              background: `${col}40`,
                              borderColor: isSel ? "#fff" : `${col}cc`,
                              boxShadow: isSel ? `0 0 0 2px ${col}, 0 0 20px ${col}55` : undefined,
                            }}
                            className={`absolute top-2 bottom-2 rounded-xl border-2 overflow-hidden hover:border-white/80 transition-colors ${
                              isTrackLocked ? "cursor-not-allowed" : tool === "razor" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
                            }`}
                          >
                          {t.kind === "audio" && (
                            <Waveform 
                              seed={c.id.length} 
                              width={w} 
                              color={`${col}cc`} 
                              waveformData={media.find(m => m.id === c.assetId)?.waveform}
                            />
                          )}

                          {t.kind === "audio" && c.fadeIn > 0 && (
                            <div style={{ width: c.fadeIn * pxPerSec }} className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-black/70 to-transparent pointer-events-none" />
                          )}
                          {t.kind === "audio" && c.fadeOut > 0 && (
                            <div style={{ width: c.fadeOut * pxPerSec }} className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-black/70 to-transparent pointer-events-none" />
                          )}

                          {c.transitionIn !== "none" && (
                            <div className="absolute left-0 top-0 bottom-0 w-5 bg-cyan-400/25 border-r border-cyan-300/60 pointer-events-none flex items-center justify-center">
                              <Wand2 className="h-2.5 w-2.5 text-cyan-200" />
                            </div>
                          )}

                          <div className="relative h-full flex items-center px-2 pointer-events-none">
                            {t.kind === "audio" ? (
                              <Music className="h-3 w-3 text-white/80 shrink-0" />
                            ) : t.kind === "text" ? (
                              <Type className="h-3 w-3 text-white/80 shrink-0" />
                            ) : t.kind === "adjustment" ? (
                              <EffectsIcon className="h-3 w-3 text-white/80 shrink-0" />
                            ) : (
                              <Film className="h-3 w-3 text-white/80 shrink-0" />
                            )}
                            <span className="text-[9px] font-bold text-white ml-1 truncate">{c.name}</span>
                          </div>

                          <div className="absolute bottom-0 left-0 right-0 h-2.5 pointer-events-none">
                            {c.keyframes.map((k) => (
                              <div
                                key={k.id}
                                style={{ left: k.time * pxPerSec - 3 }}
                                className="absolute bottom-0.5 h-1.5 w-1.5 rotate-45 bg-amber-300 border border-amber-600"
                              />
                            ))}
                          </div>

                          {/* Trim Handles - Improved with better visual feedback */}
                          <div
                            onPointerDown={(e) => onClipPointerDown(e, c, "trim-in")}
                            className="absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize bg-transparent hover:bg-blue-500/30 group transition-all duration-150 border-l-2 border-transparent hover:border-blue-400"
                          >
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-3 h-8 bg-blue-500 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg shadow-blue-500/50">
                              <Scissors className="h-3 w-3 text-white" />
                            </div>
                          </div>
                          <div
                            onPointerDown={(e) => onClipPointerDown(e, c, "trim-out")}
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize bg-transparent hover:bg-blue-500/30 group transition-all duration-150 border-r-2 border-transparent hover:border-blue-400"
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-3 h-8 bg-blue-500 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg shadow-blue-500/50">
                              <Scissors className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Trim Time Tooltip */}
              {showTrimTime && trimMode && (
                <div 
                  className="fixed z-50 bg-black/90 text-white text-xs font-mono px-3 py-1.5 rounded border border-blue-500/50 shadow-xl pointer-events-none"
                  style={{ 
                    left: '50%',
                    top: '80px',
                    transform: 'translateX(-50%)'
                  }}
                >
                  {trimMode === 'trim-in' ? 'Start: ' : 'End: '}{showTrimTime}
                </div>
              )}

              {/* Trim Markers on Timeline Ruler */}
              {selected && (
                <>
                  <div 
                    style={{ left: selected.start * pxPerSec }}
                    className="absolute top-0 bottom-0 w-px bg-blue-400 z-20 pointer-events-none"
                  >
                    <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-blue-400 rotate-45" />
                  </div>
                  <div 
                    style={{ left: (selected.start + selected.duration) * pxPerSec }}
                    className="absolute top-0 bottom-0 w-px bg-blue-400 z-20 pointer-events-none"
                  >
                    <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-blue-400 rotate-45" />
                  </div>
                </>
              )}

              {/* COPYRIGHT RANGE HIGHLIGHTER */}
              {hasClaim && !claimResolved && (
                <div 
                  style={{ 
                    left: claimData.start * pxPerSec, 
                    width: (claimData.end - claimData.start) * pxPerSec,
                  }}
                  className="absolute top-0 bottom-0 z-10 pointer-events-none border-x border-[#FE2C55]/50 bg-[#FE2C55]/10"
                >
                  <div className="bg-[#FE2C55] text-white text-[8px] font-bold px-1 py-0.5 rounded-br-sm absolute top-7">
                    CLAIMED
                  </div>
                </div>
              )}

              {snapGuide !== null && (
                <div style={{ left: snapGuide * pxPerSec }} className="absolute top-0 bottom-0 w-px bg-amber-400 z-30 pointer-events-none" />
              )}

              <div style={{ left: playhead * pxPerSec }} className="absolute top-0 bottom-0 w-0.5 bg-[#FE2C55] z-40 pointer-events-none shadow-lg shadow-[#FE2C55]/50">
                <div className="w-3.5 h-3.5 -ml-[6px] bg-[#FE2C55] rotate-45 border-2 border-white/80 shadow-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141418] border border-[#2a2a32] w-full max-w-md rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#242428] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Download className="h-4 w-4 text-blue-400" /> Export settings
              </h3>
              <button
                onClick={() => {
                  setShowExport(false);
                  setRenderPct(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderPct === null ? (
              <>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500 mb-1.5">Resolution</p>
                    <div className="grid grid-cols-3 gap-2">
                      {["720p", "1080p", "4K"].map((r) => (
                        <button key={r} onClick={() => setExportCfg({ ...exportCfg, res: r })}
                          className={`py-2 rounded-lg text-[11px] font-bold border ${exportCfg.res === r ? "bg-blue-600 border-blue-400 text-white" : "bg-[#1c1c22] border-[#2a2a32] text-gray-400"}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500 mb-1.5">Frame rate</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[24, 30, 60].map((f) => (
                        <button key={f} onClick={() => setExportCfg({ ...exportCfg, fps: f })}
                          className={`py-2 rounded-lg text-[11px] font-bold border ${exportCfg.fps === f ? "bg-blue-600 border-blue-400 text-white" : "bg-[#1c1c22] border-[#2a2a32] text-gray-400"}`}>
                          {f} fps
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-gray-500 mb-1.5">Format</p>
                    <div className="grid grid-cols-3 gap-2">
                      {["MP4", "WEBM", "GIF"].map((f) => (
                        <button key={f} onClick={() => setExportCfg({ ...exportCfg, format: f })}
                          className={`py-2 rounded-lg text-[11px] font-bold border ${exportCfg.format === f ? "bg-blue-600 border-blue-400 text-white" : "bg-[#1c1c22] border-[#2a2a32] text-gray-400"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Slider label="Bitrate" value={exportCfg.bitrate} min={2} max={80} suffix=" Mbps"
                    onChange={(v) => setExportCfg({ ...exportCfg, bitrate: v })} />
                  <p className="text-[10px] text-gray-500">
                    Duration {formatTime(duration)} · est. {(duration * exportCfg.bitrate * 0.125).toFixed(1)} MB
                  </p>
                </div>
                <button onClick={startRender}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">
                  Start render
                </button>
              </>
            ) : (
              <div className="space-y-3 py-2">
                <p className="text-[11px] text-gray-300">{renderStep}</p>
                <div className="h-2 rounded-full bg-[#22222a] overflow-hidden">
                  <div style={{ width: `${renderPct}%` }} className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] duration-75" />
                </div>
                <p className="text-2xl font-bold font-mono text-white text-center">{Math.floor(renderPct)}%</p>
                {renderPct >= 100 && (
                  <div className="text-center space-y-2">
                    <p className="text-emerald-400 text-xs font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Render complete
                    </p>
                    <button onClick={downloadExport}
                      className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">
                      Download Video
                    </button>
                    <button onClick={() => { setShowExport(false); setRenderPct(null); setExportBlob(null); }}
                      className="w-full py-2 rounded-lg bg-[#1c1c22] hover:bg-[#26262e] text-white text-xs font-bold">
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141418] border border-[#2a2a32] w-full max-w-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#242428] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-amber-400" /> Keyboard Shortcuts
              </h3>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Space</span> Play / Pause</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">C</span> Razor / Split Tool</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">V</span> Select Tool</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Y</span> Slip Tool</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">S</span> Toggle Snapping</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Cmd/Ctrl + Z</span> Undo / Redo</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Cmd/Ctrl + S</span> Save Project</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Cmd/Ctrl + E</span> Export</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Cmd/Ctrl + D</span> Duplicate Clip</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Arrow Up/Down</span> Move Clip Track</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">1-4</span> Inspector Tabs</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Escape</span> Deselect</div>
              <div className="flex justify-between text-gray-300"><span className="font-bold text-white">Delete / Backspace</span> Remove Clip</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}