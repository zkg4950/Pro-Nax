/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React from "react";
import { Upload, FolderOpen, Play, Pause, Volume2, Star, Trash2, Plus } from "lucide-react";
import { MediaAsset } from "./types";

interface MediaLibraryProps {
  media: MediaAsset[];
  previewingAudio: string | null;
  onToggleAudioPreview: (asset: MediaAsset) => void;
  onAddToTimeline: (asset: MediaAsset) => void;
  onDeleteAsset: (id: string) => void;
  onImportFiles: (files: FileList | File[]) => void;
  dragOverBin: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  media,
  previewingAudio,
  onToggleAudioPreview,
  onAddToTimeline,
  onDeleteAsset,
  onImportFiles,
  dragOverBin,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="bg-[#1a1a20] border border-[#2e2e38] rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-[#1e1e24] border-b border-[#2e2e38] flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Media Library</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-[#2a2a35] hover:bg-[#3a3a45] text-gray-400 hover:text-white transition"
            title="Import files"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            className="hidden"
            onChange={(e) => e.target.files && onImportFiles(e.target.files)}
          />
        </div>
      </div>

      <div
        className={`p-3 min-h-[200px] transition-colors ${
          dragOverBin ? "bg-red-500/10 border-2 border-dashed border-red-500/30" : ""
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {media.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">Drag files here or click import</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {media.map((asset) => (
              <div
                key={asset.id}
                className="bg-[#25252b] rounded-lg overflow-hidden border border-[#2e2e38] hover:border-[#3e3e48] transition group"
              >
                <div className="relative aspect-video bg-[#1a1a20]">
                  {asset.thumb ? (
                    <img src={asset.thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {asset.kind === "audio" ? (
                        <Volume2 className="h-6 w-6 text-gray-600" />
                      ) : (
                        <span className="text-gray-600 text-xs">{asset.kind}</span>
                      )}
                    </div>
                  )}
                  {asset.kind === "audio" && (
                    <button
                      onClick={() => onToggleAudioPreview(asset)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition"
                    >
                      {previewingAudio === asset.url ? (
                        <Pause className="h-6 w-6 text-white" />
                      ) : (
                        <Play className="h-6 w-6 text-white" />
                      )}
                    </button>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[10px] text-gray-300 truncate">{asset.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-gray-500">
                      {Math.round(asset.duration)}s · {(asset.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onAddToTimeline(asset)}
                        className="p-1 rounded hover:bg-[#3a3a45] text-gray-500 hover:text-white transition"
                        title="Add to timeline"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDeleteAsset(asset.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
