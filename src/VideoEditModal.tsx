/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { geminiFetch } from "@/pronax-studio/geminiClient";
import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Save,
  DollarSign,
  Loader2,
} from "lucide-react";
import { Video } from "@/pronax-studio/types";

interface VideoEditModalProps {
  video: Video | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveVideo: (updated: Video) => void;
}

export const VideoEditModal: React.FC<VideoEditModalProps> = ({
  video,
  isOpen,
  onClose,
  onSaveVideo,
}) => {
  const [title, setTitle] = useState(video?.title ?? "");
  const [description, setDescription] = useState(video?.description ?? "");
  const [visibility, setVisibility] = useState(video?.visibility ?? "Public");
  const [monetization, setMonetization] = useState(video?.monetization ?? true);
  const [category, setCategory] = useState(video?.category ?? "Gaming");
  const [tagsInput, setTagsInput] = useState(video?.tags?.join(", ") ?? "");
  const [thumbnail, setThumbnail] = useState(video?.thumbnail ?? "");

  // Sync state whenever selected video changes
  useEffect(() => {
    if (video) {
      setTitle(video.title ?? "");
      setDescription(video.description ?? "");
      setVisibility(video.visibility ?? "Public");
      setMonetization(video.monetization ?? true);
      setCategory(video.category ?? "Gaming");
      setTagsInput(video.tags?.join(", ") ?? "");
      setThumbnail(video.thumbnail ?? "");
    }
  }, [video]);

  // AI loading states
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [loadingDescription, setLoadingDescription] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  // Generate AI Titles using Gemini endpoint
  const generateAITitles = async () => {
    try {
      setLoadingTitles(true);
      const res = await geminiFetch("title-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: title,
          category,
          targetAudience: "Developers, Tech Enthusiasts, ProNax Creators",
        }),
      });
      const data = await res.json();
      if (data.titles && Array.isArray(data.titles)) {
        setTitleSuggestions(data.titles);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTitles(false);
    }
  };

  // Generate AI Description
  const generateAIDescription = async () => {
    try {
      setLoadingDescription(true);
      const res = await geminiFetch("generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          keyPoints: description,
          links: "Subscribe: @devcreatorstudio | Socials: twitter.com/devcreator",
        }),
      });
      const data = await res.json();
      if (data.description) {
        setDescription(data.description);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDescription(false);
    }
  };

  // Generate AI Tags
  const generateAITags = async () => {
    try {
      setLoadingTags(true);
      const res = await geminiFetch("generate-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          topic: category,
        }),
      });
      const data = await res.json();
      if (data.tags && Array.isArray(data.tags)) {
        setTagsInput(data.tags.join(", "));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTags(false);
    }
  };

  const handleSave = () => {
    const updatedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onSaveVideo({
      ...(video as Video),
      title,
      description,
      visibility,
      monetization,
      category,
      tags: updatedTags,
      thumbnail,
    });
    onClose();
  };

  if (!isOpen || !video) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#333] w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col text-gray-100 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d2d2d] bg-[#222]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Video details</span>
            <span className="text-xs text-gray-400 font-normal">
              ({video.id})
            </span>
          </h2>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
              id="save-video-details-btn"
            >
              <Save className="h-4 w-4" />
              <span>SAVE CHANGES</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[#333] text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form Inputs */}
            <div className="md:col-span-2 space-y-5">
              {/* Title Section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-300 uppercase">
                    Title (required)
                  </label>
                  <button
                    onClick={generateAITitles}
                    disabled={loadingTitles}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-bold text-xs bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg"
                  >
                    {loadingTitles ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-amber-300" />
                    )}
                    <span>AI Viral Titles</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-[#101010] border border-[#333] p-3 text-sm font-semibold text-white focus:border-red-500 focus:outline-none"
                />

                {/* AI Title Suggestions Drawer */}
                {titleSuggestions.length > 0 && (
                  <div className="mt-3 p-3 bg-[#231d30] border border-purple-500/30 rounded-xl space-y-2">
                    <p className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                      Gemini High-CTR Title Ideas (Click to apply):
                    </p>
                    <div className="space-y-1">
                      {titleSuggestions.map((t, idx) => (
                        <button
                          key={idx}
                          onClick={() => setTitle(t)}
                          className="w-full text-left p-2 rounded-lg bg-[#181422] hover:bg-[#2f2540] text-xs text-gray-200 border border-[#3d3055] transition-colors line-clamp-1"
                        >
                          "{t}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description Section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-300 uppercase">
                    Description
                  </label>
                  <button
                    onClick={generateAIDescription}
                    disabled={loadingDescription}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-bold text-xs bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg"
                  >
                    {loadingDescription ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-amber-300" />
                    )}
                    <span>AI SEO Description</span>
                  </button>
                </div>

                <textarea
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl bg-[#101010] border border-[#333] p-3 text-xs text-white focus:border-red-500 focus:outline-none leading-relaxed"
                />
              </div>

              {/* Tags Section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-300 uppercase">
                    Tags (Comma Separated)
                  </label>
                  <button
                    onClick={generateAITags}
                    disabled={loadingTags}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-bold text-xs bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg"
                  >
                    {loadingTags ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-amber-300" />
                    )}
                    <span>AI Tags</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full rounded-xl bg-[#101010] border border-[#333] p-3 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Right 1 Col: Video Preview & Visibility */}
            <div className="space-y-5 bg-[#141414] p-4 rounded-2xl border border-[#2a2a2a]">
              {/* Thumbnail Preview */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                  Thumbnail
                </label>
                <div className="relative rounded-xl overflow-hidden bg-black border border-[#333] aspect-video">
                  <img
                    src={thumbnail}
                    alt={title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Visibility Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  Visibility
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full rounded-xl bg-[#222] border border-[#333] p-2.5 text-xs text-white focus:border-red-500 focus:outline-none font-semibold"
                >
                  <option value="Public">Public (Everyone can see)</option>
                  <option value="Unlisted">Unlisted (Anyone with link)</option>
                  <option value="Private">Private (Only you)</option>
                </select>
              </div>

              {/* Monetization Toggle */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  Monetization
                </label>
                <button
                  onClick={() => setMonetization(!monetization)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all ${
                    monetization
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-[#222] border-[#333] text-gray-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <span>Monetization Status</span>
                  </div>
                  <span>{monetization ? "ON" : "OFF"}</span>
                </button>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl bg-[#222] border border-[#333] p-2.5 text-xs text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="Science & Technology">Science & Technology</option>
                  <option value="Education">Education</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Gaming">Gaming</option>
                  <option value="Howto & Style">Howto & Style</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
