/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { ContentView } from "./components/ContentView";
import { AnalyticsView } from "./components/AnalyticsView";
import { CommentsView } from "./components/CommentsView";
import { EarnView } from "./components/EarnView";
import { CustomizationView } from "./components/CustomizationView";
import { AudioLibraryView } from "./components/AudioLibraryView";
import { SubtitlesView } from "./components/SubtitlesView";
import { UploadModal } from "./components/UploadModal";
import { VideoEditModal } from "./components/VideoEditModal";
import { VideoEditorModal } from "./components/VideoEditorModal";
import { LiveControlRoomModal } from "./components/LiveControlRoomModal";
import { CopyrightClaimModal } from "./components/CopyrightClaimModal";
import { SettingsModal } from "./components/SettingsModal";
import { AIAssistantDrawer } from "./components/AIAssistantDrawer";

import { ViewMode, Video, AudioTrack, ChannelStats, SubtitleTrack } from "./types";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLiveStudio } from "./useLiveStudio";
import { useAuthSession } from "@/hooks/useAuthSession";
import { UniversalLoginModal } from "@/components/UniversalLoginModal";
import { Loader2, AlertCircle, Clock, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { 
  studioVideoToEditorVideo, 
  editorVideoToStudioVideo, 
  validateStudioVideo,
  validateEditorVideo 
} from "./utils/videoTypeConversion";

export default function App() {
  const { isAuthenticated, user, openAuthModal, closeAuthModal, isAuthModalOpen, signOut } = useAuthSession();
  const [currentView, setCurrentView] = useState<ViewMode>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Live data from the backend (videos, comments, channel stats)
  const live = useLiveStudio();
  const {
    channelStats,
    videos,
    comments,
    realUsers,
    authLoading,
  } = live;

  // Fallback values when not authenticated
  const safeChannelStats: ChannelStats = channelStats ?? {
    name: "",
    handle: "",
    avatar: "",
    banner: "",
    subscribers: 0,
    subscriberChange28Days: 0,
    views28Days: 0,
    watchTimeHours28Days: 0,
    estimatedRevenue28Days: 0,
    realtime48HoursViews: 0,
    realtime60MinsViews: 0,
  };
  const safeVideos = isAuthenticated ? videos : [];
  const safeComments = isAuthenticated ? comments : [];
  const safeRealUsers = isAuthenticated ? realUsers : [];

  // Local-only libraries (no backend tables yet)
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);

  // Search & Navigation Filters
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedVideoForAnalytics, setSelectedVideoForAnalytics] =
    useState<Video | null>(null);

  // Modals & Drawers States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const studioFileInputRef = useRef<HTMLInputElement>(null);

  const handleTriggerUpload = () => {
    if (studioFileInputRef.current) {
      studioFileInputRef.current.value = "";
      studioFileInputRef.current.click();
    } else {
      setIsUploadOpen(true);
    }
  };

  const handleStudioFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedVideoFile(file);
      setIsUploadOpen(true);
    }
  };

  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [editorVideo, setEditorVideo] = useState<Video | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [copyrightVideo, setCopyrightVideo] = useState<Video | null>(null);
  const [isLiveControlRoomOpen, setIsLiveControlRoomOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);


  // Handlers
  const handleToggleSidebar = () => {
    if (window.innerWidth < 768) {
      setIsMobileSidebarOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => !prev);
    }
  };

  const handleSelectView = (view: ViewMode) => {
    setIsMobileSidebarOpen(false);
    if (view === "settings") {
      setIsSettingsOpen(true);
    } else {
      setCurrentView(view);
      if (view !== "analytics") {
        setSelectedVideoForAnalytics(null);
      }
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSaveVideo = (updatedVideo: Video) => {
    try {
      // Check if this is an editor video that needs conversion
      if (editorVideo && updatedVideo.id === editorVideo.id) {
        // Validate editor video data
        const validation = validateEditorVideo(updatedVideo as any);
        if (!validation.valid) {
          setEditorError(`Cannot save video: ${validation.errors.join(', ')}`);
          console.error('Editor video validation failed:', validation.errors);
          return;
        }

        // Convert back to studio format
        const studioFormatVideo = editorVideoToStudioVideo(updatedVideo as any, editorVideo as any);
        void live.saveVideo(studioFormatVideo);
      } else {
        // Direct save for regular video edits
        void live.saveVideo(updatedVideo);
      }
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Failed to save video');
      console.error('Error saving video:', error);
    }
  };

  const handleDeleteVideo = (videoId: string) => {
    void live.deleteVideo(videoId);
  };

  const handleAddCommentReply = (commentId: string, replyText: string) => {
    void live.addCommentReply(commentId, replyText);
  };

  const handleToggleHeartComment = (commentId: string) => {
    live.toggleHeartComment(commentId);
  };

  const handleDeleteComment = (commentId: string) => {
    void live.deleteComment(commentId);
  };

  const handleToggleStarTrack = (trackId: string) => {
    setAudioTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, isStarred: !t.isStarred } : t))
    );
  };

  const handleOpenVideoAnalytics = (video: Video) => {
    setSelectedVideoForAnalytics(video);
    setCurrentView("analytics");
  };

  const handleResolveCopyrightClaim = (videoId: string, newRestriction: "None" | "Dispute Pending") => {
    live.setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId ? { ...v, restrictions: newRestriction } : v
      )
    );
  };


  const handleSaveSubtitleTrack = (updatedTrack: SubtitleTrack) => {
    setSubtitleTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === updatedTrack.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedTrack;
        return next;
      }
      return [...prev, updatedTrack];
    });
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-100 flex flex-col font-sans antialiased selection:bg-red-500 selection:text-white">
      {/* Hidden File Picker Input for direct Gallery/Browser selection */}
      <input
        type="file"
        accept="video/*"
        ref={studioFileInputRef}
        onChange={handleStudioFileSelected}
        className="hidden"
        aria-hidden="true"
      />

      {/* Top Navigation Header */}
      <Header
        channelStats={safeChannelStats}
        onToggleSidebar={handleToggleSidebar}
        onOpenUploadModal={handleTriggerUpload}
        onOpenLiveControlRoom={() => setIsLiveControlRoomOpen(true)}
        onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
        searchQuery={globalSearch}
        onSearchChange={setGlobalSearch}
      />

      {/* Main Container */}
      <div className="flex flex-1 relative">
        {/* Sidebar Menu - Only show when authenticated */}
        {isAuthenticated && (
          <Sidebar
            currentView={currentView}
            onSelectView={handleSelectView}
            channelStats={safeChannelStats}
            isCollapsed={isSidebarCollapsed}
            isMobileOpen={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* View Content Canvas */}
        <main className={`flex-1 min-w-0 bg-[#0f0f0f] overflow-x-hidden ${!isAuthenticated ? 'w-full' : ''}`}>
          <ErrorBoundary>
            {authLoading && (
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mb-4"></div>
                  <p className="text-gray-400 text-sm">Loading authentication...</p>
                </div>
              </div>
            )}

            {!authLoading && !isAuthenticated && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
                <div className="text-center max-w-md">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                    <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Sign in to access Studio</h2>
                  <p className="text-sm text-gray-400 mb-6">Manage your videos, analytics, and revenue with ProNax Studio.</p>
                  <button
                    onClick={openAuthModal}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm hover:from-red-500 hover:to-red-400 transition-all shadow-lg cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign in to Studio
                  </button>
                </div>
              </div>
            )}

            {isAuthenticated && live.loading && (
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mb-4"></div>
                  <p className="text-gray-400 text-sm">Loading studio data...</p>
                </div>
              </div>
            )}

            {isAuthenticated && live.loading && (
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mb-4"></div>
                  <p className="text-gray-400 text-sm">Loading studio data...</p>
                </div>
              </div>
            )}

            {isAuthenticated && currentView === "dashboard" && (
              <DashboardView
                channelStats={safeChannelStats}
                latestVideo={safeVideos[0]}
                allVideos={safeVideos}
                onOpenUploadModal={handleTriggerUpload}
                onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
                onSelectVideoForAnalytics={handleOpenVideoAnalytics}
                onSelectView={handleSelectView}
              />
            )}

            {isAuthenticated && currentView === "content" && (
              <ContentView
                videos={safeVideos}
                onOpenUploadModal={handleTriggerUpload}
                onEditVideo={(v) => setEditingVideo(v)}
                onOpenEditor={(v) => {
                  try {
                    // Validate video data before opening editor
                    const validation = validateStudioVideo(v);
                    if (!validation.valid) {
                      setEditorError(`Cannot open editor: ${validation.errors.join(', ')}`);
                      console.error('Video validation failed:', validation.errors);
                      return;
                    }

                    // Clear any previous errors
                    setEditorError(null);
                    setIsEditorLoading(true);

                    // Convert to editor format
                    const editorFormatVideo = studioVideoToEditorVideo(v);
                    setEditorVideo(editorFormatVideo as any); // Temporary cast until we update the component
                    setIsEditorLoading(false);
                  } catch (error) {
                    setEditorError(error instanceof Error ? error.message : 'Failed to open video editor');
                    setIsEditorLoading(false);
                    console.error('Error opening video editor:', error);
                  }
                }}
                onOpenCopyrightModal={(v) => setCopyrightVideo(v)}
                onSelectVideoAnalytics={handleOpenVideoAnalytics}
                onDeleteVideo={handleDeleteVideo}
                onSelectView={handleSelectView}
              />
            )}

            {isAuthenticated && currentView === "analytics" && (
              <AnalyticsView
                channelStats={safeChannelStats}
                selectedVideo={selectedVideoForAnalytics}
                onClearSelectedVideo={() => setSelectedVideoForAnalytics(null)}
              />
            )}

            {isAuthenticated && currentView === "comments" && (
              <CommentsView
                comments={safeComments}
                onAddReply={handleAddCommentReply}
                onToggleHeart={handleToggleHeartComment}
                onDeleteComment={handleDeleteComment}
              />
            )}

            {isAuthenticated && currentView === "earn" && (
              <EarnView channelStats={safeChannelStats} />
            )}

            {isAuthenticated && currentView === "customization" && (
              <CustomizationView
                channelStats={safeChannelStats}
                onUpdateChannelStats={(updated) => void live.updateChannel(updated)}

              />
            )}

            {isAuthenticated && currentView === "audio-library" && (
              <AudioLibraryView
                tracks={audioTracks}
                onToggleStarTrack={handleToggleStarTrack}
              />
            )}

            {isAuthenticated && currentView === "subtitles" && (
              <SubtitlesView
                videos={safeVideos}
                subtitleTracks={subtitleTracks}
                onSaveTrack={handleSaveSubtitleTrack}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Upload Video Wizard Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setSelectedVideoFile(null);
        }}
        videoFile={selectedVideoFile}
        onVideoChange={setSelectedVideoFile}
        onRefresh={() => void live.refresh()}
      />

      {/* Video Details & AI Edit Modal */}
      <VideoEditModal
        video={editingVideo}
        isOpen={!!editingVideo}
        onClose={() => setEditingVideo(null)}
        onSaveVideo={handleSaveVideo}
      />

      {/* Video Studio Editor Modal (Trim / Blur / End Screen) */}
      {editorError && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80">
          <div className="bg-red-950/90 border border-red-500/50 p-6 rounded-2xl max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-bold text-white">Editor Error</h3>
            </div>
            <p className="text-red-200 mb-4">{editorError}</p>
            <button
              onClick={() => {
                setEditorError(null);
                setEditorVideo(null);
              }}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg"
            >
              Close Editor
            </button>
          </div>
        </div>
      )}
      {isEditorLoading && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto mb-4" />
            <p className="text-white">Loading video editor...</p>
          </div>
        </div>
      )}
      <VideoEditorModal
        video={editorVideo as any}
        isOpen={!!editorVideo && !editorError && !isEditorLoading}
        onClose={() => {
          setEditorVideo(null);
          setEditorError(null);
        }}
        onSaveVideo={handleSaveVideo as any}
      />

      {/* Live Control Room Modal */}
      <LiveControlRoomModal
        isOpen={isLiveControlRoomOpen}
        onClose={() => setIsLiveControlRoomOpen(false)}
        channelStats={channelStats}
        currentVideo={videos[0] ? { id: videos[0].id, views: videos[0].views } : undefined}
        realUsers={realUsers}
      />

      {/* Copyright Claim Resolution Modal */}
      <CopyrightClaimModal
        video={copyrightVideo}
        isOpen={!!copyrightVideo}
        onClose={() => setCopyrightVideo(null)}
        onResolveClaim={handleResolveCopyrightClaim}
      />

      {/* Studio Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Studio AI Creator Assistant Drawer */}
      <AIAssistantDrawer
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
      />

      {/* Universal Login Modal */}
      <UniversalLoginModal 
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
      />
    </div>
  );
}
