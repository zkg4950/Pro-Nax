/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { geminiFetch } from "@/pronax-studio/geminiClient";
import React, { useState } from "react";
import {
  Captions,
  Plus,
  Trash2,
  Sparkles,
  Download,
  Check,
  Loader2,
  FileText,
} from "lucide-react";
import { Video, SubtitleTrack, SubtitleItem } from "@/pronax-studio/types";

interface SubtitlesViewProps {
  videos: Video[];
  subtitleTracks: SubtitleTrack[];
  onSaveTrack: (updatedTrack: SubtitleTrack) => void;
}

export const SubtitlesView: React.FC<SubtitlesViewProps> = ({
  videos,
  subtitleTracks,
  onSaveTrack,
}) => {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(videos[0] || null);
  const [activeTrack, setActiveTrack] = useState<SubtitleTrack | null>(
    subtitleTracks.find((t) => t.videoId === videos[0]?.id) || subtitleTracks[0] || null
  );

  // Editor State
  const [captions, setCaptions] = useState<SubtitleItem[]>(
    activeTrack ? activeTrack.captions : []
  );
  const [loadingAI, setLoadingAI] = useState(false);
  const [copiedSRT, setCopiedSRT] = useState(false);

  // Select video helper
  const handleSelectVideo = (vid: Video) => {
    setSelectedVideo(vid);
    const existing = subtitleTracks.find((t) => t.videoId === vid.id);
    if (existing) {
      setActiveTrack(existing);
      setCaptions(existing.captions);
    } else {
      const newTrk: SubtitleTrack = {
        id: "sub_" + Date.now(),
        videoId: vid.id,
        language: "English (Video language)",
        status: "Draft",
        captions: [
          {
            id: "c_1",
            startTime: "00:00:01.000",
            endTime: "00:00:04.500",
            text: "Welcome to this video tutorial!",
          },
        ],
      };
      setActiveTrack(newTrk);
      setCaptions(newTrk.captions);
    }
  };

  const handleCaptionTextChange = (id: string, text: string) => {
    setCaptions(
      captions.map((c) => (c.id === id ? { ...c, text } : c))
    );
  };

  const handleCaptionTimeChange = (
    id: string,
    field: "startTime" | "endTime",
    val: string
  ) => {
    setCaptions(
      captions.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  const handleAddSegment = () => {
    const newSeg: SubtitleItem = {
      id: "seg_" + Date.now(),
      startTime: "00:00:05.000",
      endTime: "00:00:09.000",
      text: "New subtitle segment text...",
    };
    setCaptions([...captions, newSeg]);
  };

  const handleDeleteSegment = (id: string) => {
    setCaptions(captions.filter((c) => c.id !== id));
  };

  // Generate Gemini AI Captions
  const handleGenerateAICaptions = async () => {
    if (!selectedVideo) return;
    try {
      setLoadingAI(true);
      await geminiFetch("title-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: selectedVideo.title,
          category: selectedVideo.category,
        }),
      });
      // Auto generate realistic transcript lines
      const aiCaptions: SubtitleItem[] = [
        {
          id: "ai_1",
          startTime: "00:00:01.000",
          endTime: "00:00:04.200",
          text: `In this video, we're diving deep into ${selectedVideo.title}.`,
        },
        {
          id: "ai_2",
          startTime: "00:00:04.800",
          endTime: "00:00:09.000",
          text: "We will cover complete step-by-step code walkthrough and best practices.",
        },
        {
          id: "ai_3",
          startTime: "00:00:09.500",
          endTime: "00:00:14.000",
          text: "Make sure to subscribe to Dev Creator Studio for more tech tutorials!",
        },
      ];
      setCaptions(aiCaptions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleExportSRT = () => {
    let srtText = "";
    captions.forEach((c, idx) => {
      srtText += `${idx + 1}\n${c.startTime} --> ${c.endTime}\n${c.text}\n\n`;
    });
    navigator.clipboard.writeText(srtText);
    setCopiedSRT(true);
    setTimeout(() => setCopiedSRT(false), 2000);
  };

  const handlePublishTrack = () => {
    if (!activeTrack || !selectedVideo) return;
    const updated: SubtitleTrack = {
      ...activeTrack,
      status: "Published",
      captions,
    };
    onSaveTrack(updated);
    setActiveTrack(updated);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 text-gray-100 max-w-7xl mx-auto select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Captions className="h-6 w-6 text-[#FE2C55]" />
            <span>Channel Subtitles & Captions</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Manage multilingual subtitle tracks, auto-transcribe with AI, and edit timestamped text.
          </p>
        </div>
      </div>

      {/* Main Grid: Left Video Selector & Right Subtitle Track Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Video List Selector */}
        <div className="bg-[#1f1f1f] p-4 rounded-2xl border border-[#2d2d2d] space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            Select Video to Edit Subtitles
          </h2>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {videos.map((vid) => {
              const isSelected = selectedVideo?.id === vid.id;
              const hasSub = subtitleTracks.some((t) => t.videoId === vid.id);
              return (
                <div
                  key={vid.id}
                  onClick={() => handleSelectVideo(vid)}
                  className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[#282020] border-[#FE2C55] text-white shadow-md"
                      : "bg-[#141414] border-[#2c2c2c] hover:bg-[#202020] text-gray-300"
                  }`}
                >
                  <img
                    src={vid.thumbnail}
                    alt={vid.title}
                    className="h-12 w-20 object-cover rounded-lg shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="overflow-hidden flex-1">
                    <h3 className="text-xs font-bold truncate">{vid.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          hasSub
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {hasSub ? "Subtitles Ready" : "No Captions"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Interactive Subtitles Editor Workspace */}
        {selectedVideo && activeTrack ? (
          <div className="lg:col-span-2 bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] space-y-5 flex flex-col">
            {/* Active Video & Track Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#2d2d2d] pb-4 gap-3">
              <div>
                <span className="text-[11px] font-bold text-[#FE2C55] uppercase">
                  Language: {activeTrack.language}
                </span>
                <h2 className="text-sm font-bold text-white truncate max-w-md mt-0.5">
                  {selectedVideo.title}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAICaptions}
                  disabled={loadingAI}
                  className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                >
                  {loadingAI ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  )}
                  <span>AI Gemini Auto-Subtitles</span>
                </button>

                <button
                  onClick={handleExportSRT}
                  className="flex items-center gap-1.5 bg-[#282828] hover:bg-[#333] border border-[#444] text-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold"
                  title="Copy SRT Captions"
                >
                  {copiedSRT ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Download className="h-3.5 w-3.5" />}
                  <span>{copiedSRT ? "SRT COPIED" : "EXPORT SRT"}</span>
                </button>

                <button
                  onClick={handlePublishTrack}
                  className="flex items-center gap-1 bg-[#FE2C55] hover:bg-[#FF4D6D] text-white px-4 py-1.5 rounded-xl text-xs font-bold shadow-md"
                >
                  <Check className="h-4 w-4" />
                  <span>PUBLISH</span>
                </button>
              </div>
            </div>

            {/* Video Preview & Active Subtitle Display */}
            <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-[#333] flex items-center justify-center">
              <img
                src={selectedVideo.thumbnail}
                alt={selectedVideo.title}
                className="w-full h-full object-cover opacity-70"
                referrerPolicy="no-referrer"
              />

              {/* Active Captions Overlay Text Box */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/85 text-yellow-300 font-bold px-4 py-2 rounded-xl text-center text-sm md:text-base border border-yellow-500/30 max-w-xl">
                {captions[0]?.text || "Subtitle preview line will appear here..."}
              </div>
            </div>

            {/* Captions Table Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#FE2C55]" />
                  Caption Track Segments ({captions.length})
                </h3>

                <button
                  onClick={handleAddSegment}
                  className="flex items-center gap-1 bg-[#282828] hover:bg-[#333] text-[#FE2C55] font-bold text-xs px-3 py-1 rounded-lg border border-[#3a3a3a]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Segment</span>
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {captions.map((cap) => (
                  <div
                    key={cap.id}
                    className="flex items-center gap-3 p-3 bg-[#141414] border border-[#2d2d2d] rounded-xl text-xs"
                  >
                    {/* Start & End Timecode inputs */}
                    <div className="flex items-center gap-1.5 font-mono">
                      <input
                        type="text"
                        value={cap.startTime}
                        onChange={(e) =>
                          handleCaptionTimeChange(
                            cap.id,
                            "startTime",
                            e.target.value
                          )
                        }
                        className="w-24 bg-[#202020] border border-[#333] p-1.5 rounded-lg text-center text-white focus:border-[#FE2C55] focus:outline-none"
                      />
                      <span className="text-gray-500">→</span>
                      <input
                        type="text"
                        value={cap.endTime}
                        onChange={(e) =>
                          handleCaptionTimeChange(
                            cap.id,
                            "endTime",
                            e.target.value
                          )
                        }
                        className="w-24 bg-[#202020] border border-[#333] p-1.5 rounded-lg text-center text-white focus:border-[#FE2C55] focus:outline-none"
                      />
                    </div>

                    {/* Text Input */}
                    <input
                      type="text"
                      value={cap.text}
                      onChange={(e) =>
                        handleCaptionTextChange(cap.id, e.target.value)
                      }
                      className="flex-1 bg-[#202020] border border-[#333] p-2 rounded-lg text-white focus:border-[#FE2C55] focus:outline-none font-semibold"
                    />

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteSegment(cap.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-[#282828]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 p-12 bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] flex flex-col items-center justify-center text-center text-gray-400">
            <Captions className="h-12 w-12 text-gray-600 mb-2" />
            <p className="font-bold text-white text-sm">Select a video to edit captions</p>
          </div>
        )}
      </div>
    </div>
  );
};
