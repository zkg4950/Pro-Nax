/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React, { useState } from "react";
import {
  Menu,
  Search,
  Sparkles,
  Video,
  Upload,
  Radio,
  ListPlus,
  PlaySquare,
  ChevronDown,
  User,
  Check,
  LogOut,
  Clock,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { ChannelStats } from "../types";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  channelStats: ChannelStats | null;
  onToggleSidebar: () => void;
  onOpenUploadModal: () => void;
  onOpenLiveControlRoom?: () => void;
  onOpenAIAssistant: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sessionTimeoutWarning?: boolean;
  onRefreshSession?: () => void;
  onUserActivity?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  channelStats,
  onToggleSidebar,
  onOpenUploadModal,
  onOpenLiveControlRoom,
  onOpenAIAssistant,
  searchQuery,
  onSearchChange,
  sessionTimeoutWarning,
  onRefreshSession,
  onUserActivity,
}) => {
  const { isAuthenticated, user, openAuthModal, signOut } = useAuth();
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Fallback stats when not authenticated
  const safeChannelStats = channelStats || {
    name: "Studio",
    handle: "@studio",
    avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
    subscribers: 0,
    subscriberChange28Days: 0,
    views28Days: 0,
    watchTimeHours28Days: 0,
    estimatedRevenue28Days: 0,
    realtime48HoursViews: 0,
    realtime60MinsViews: 0,
  };

  return (
    <>
      {/* Session Timeout Warning Banner */}
      {sessionTimeoutWarning && (
        <div className="sticky top-0 z-50 flex items-center justify-between bg-amber-900/90 border-b border-amber-700 px-3 sm:px-4 py-2 text-amber-100 text-xs">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="font-medium">Your session will expire soon due to inactivity</span>
          </div>
          <button
            onClick={() => {
              if (onRefreshSession) onRefreshSession();
              if (onUserActivity) onUserActivity();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-700 text-amber-100 font-medium transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Stay signed in</span>
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#272727] bg-[#0f0f0f] px-3 sm:px-4 text-white select-none">
      {/* Mobile Search Overlay Bar */}
      {isMobileSearchOpen ? (
        <div className="flex w-full items-center gap-2 animate-in fade-in duration-150">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search channel..."
              className="w-full rounded-full bg-[#121212] border border-[#303030] py-2 pl-10 pr-4 text-xs text-gray-100 placeholder-gray-500 focus:border-red-500 focus:outline-none"
              autoFocus
            />
          </div>
          <button
            onClick={() => setIsMobileSearchOpen(false)}
            className="text-xs font-semibold text-gray-400 hover:text-white px-2 py-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {/* Left section: Hamburger & Logo */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <button
              onClick={onToggleSidebar}
              className="rounded-full p-2 text-gray-300 hover:bg-[#272727] hover:text-white transition-colors"
              title="Toggle Menu"
              id="toggle-sidebar-btn"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-1.5 cursor-pointer">
              <div className="flex h-7 w-9 sm:w-10 items-center justify-center rounded-lg bg-red-600 font-bold text-white shadow-sm">
                <Video className="h-4 w-4 fill-current text-white" />
              </div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white truncate max-w-[120px] sm:max-w-none">
                Pronax Studio
              </span>
            </div>
          </div>

          {/* Middle section: Desktop Search Bar */}
          <div className="relative hidden md:flex w-full max-w-md lg:max-w-xl items-center mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search across your channel (videos, comments, settings)..."
                className="w-full rounded-full bg-[#121212] border border-[#303030] py-2 pl-10 pr-4 text-sm text-gray-100 placeholder-gray-500 focus:border-red-500 focus:bg-[#000000] focus:outline-none transition-all"
                id="global-search-input"
              />
            </div>
          </div>

          {/* Right section: Mobile Search Toggle + AI Coach + Create Button + User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Mobile Search Button */}
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-2 rounded-full text-gray-300 hover:bg-[#272727]"
              title="Search"
            >
              <Search className="h-4 w-4" />
            </button>

            {isAuthenticated ? (
              <>
                {/* Studio AI Assistant Button */}
                <button
                  onClick={onOpenAIAssistant}
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:from-purple-500 hover:to-indigo-500 transition-all active:scale-95"
                  id="open-ai-assistant-btn"
                >
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-amber-300" />
                  <span className="hidden sm:inline">Studio AI Coach</span>
                  <span className="sm:hidden text-[10px]">AI</span>
                </button>

                {/* Create Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowCreateDropdown(!showCreateDropdown)}
                    className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#383838] bg-[#212121] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#323232] transition-colors"
                    id="create-menu-btn"
                  >
                    <Upload className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span className="hidden xs:inline">CREATE</span>
                    <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                  </button>

                  {showCreateDropdown && (
                    <div
                      className="absolute right-0 mt-2 w-52 sm:w-56 rounded-xl border border-[#333] bg-[#212121] py-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                      onMouseLeave={() => setShowCreateDropdown(false)}
                    >
                      <button
                        onClick={() => {
                          setShowCreateDropdown(false);
                          onOpenUploadModal();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-medium text-gray-200 hover:bg-[#2a2a2a] hover:text-white"
                        id="create-upload-video-option"
                      >
                        <Upload className="h-4 w-4 text-blue-400" />
                        <span>Upload video</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateDropdown(false);
                          onOpenUploadModal();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-medium text-gray-200 hover:bg-[#2a2a2a] hover:text-white"
                      >
                        <PlaySquare className="h-4 w-4 text-red-400" />
                        <span>Create Short</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateDropdown(false);
                          if (onOpenLiveControlRoom) onOpenLiveControlRoom();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-medium text-gray-200 hover:bg-[#2a2a2a] hover:text-white"
                        id="header-go-live-option"
                      >
                        <Radio className="h-4 w-4 text-rose-500" />
                        <span>Go live</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateDropdown(false);
                          alert("New playlist creation dialog");
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-medium text-gray-200 hover:bg-[#2a2a2a] hover:text-white"
                      >
                        <ListPlus className="h-4 w-4 text-emerald-400" />
                        <span>New playlist</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* User Profile Avatar & Switcher */}
                <div className="relative ml-0.5">
                  <button
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                    className="flex items-center gap-2 rounded-full focus:outline-none ring-2 ring-transparent focus:ring-red-500"
                    id="profile-menu-btn"
                  >
                    <img
                      src={safeChannelStats.avatar}
                      alt={safeChannelStats.name}
                      className="h-8 w-8 rounded-full object-cover border border-[#444]"
                      referrerPolicy="no-referrer"
                    />
                  </button>

                  {showProfileDropdown && (
                    <div
                      className="absolute right-0 mt-2 w-60 sm:w-64 rounded-2xl border border-[#333] bg-[#212121] py-3 shadow-2xl z-50 text-gray-200"
                      onMouseLeave={() => setShowProfileDropdown(false)}
                    >
                      <div className="flex items-center gap-3 border-b border-[#2d2d2d] px-4 pb-3">
                        <img
                          src={safeChannelStats.avatar}
                          alt={safeChannelStats.name}
                          className="h-10 w-10 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="overflow-hidden">
                          <p className="truncate text-sm font-semibold text-white">
                            {safeChannelStats.name}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {safeChannelStats.handle}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-emerald-400">
                            {safeChannelStats.subscribers.toLocaleString()} followers
                          </p>
                        </div>
                      </div>

                      <div className="py-1">
                        <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#2a2a2a] cursor-pointer">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>Your Pronax Channel</span>
                          </div>
                          <Check className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div
                          onClick={() => alert("Switch channel dialog")}
                          className="px-4 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] hover:text-white cursor-pointer"
                        >
                          Switch account
                        </div>
                        <div
                          onClick={() => alert("Pronax Account Settings")}
                          className="px-4 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] hover:text-white cursor-pointer"
                        >
                          Pronax Account Settings
                        </div>
                        <div className="border-t border-[#2d2d2d] my-1"></div>
                        <div
                          onClick={async () => {
                            setShowProfileDropdown(false);
                            await signOut();
                            window.location.href = '/';
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-[#2a2a2a] hover:text-red-300 cursor-pointer"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sign out</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={openAuthModal}
                className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors cursor-pointer"
              >
                Sign in
              </button>
            )}
          </div>
        </>
      )}
    </header>
    </>
  );
};
