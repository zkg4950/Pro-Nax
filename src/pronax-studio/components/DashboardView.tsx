/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React from "react";
import {
  Upload,
  TrendingUp,
  Eye,
  Clock,
  DollarSign,
  MessageSquare,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  Video as VideoIcon,
  Zap,
} from "lucide-react";
import { BarChart, Bar, Tooltip, ResponsiveContainer } from "recharts";
import { ChannelStats, Video } from "../types";

interface DashboardViewProps {
  channelStats: ChannelStats | null;
  latestVideo?: Video;
  allVideos: Video[];
  onOpenUploadModal: () => void;
  onOpenAIAssistant: () => void;
  onSelectVideoForAnalytics: (video: Video) => void;
  onSelectView: (view: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  channelStats: channelStatsProp,
  latestVideo,
  allVideos,
  onOpenUploadModal,
  onOpenAIAssistant,
  onSelectVideoForAnalytics,
  onSelectView,
}) => {
  const channelStats: ChannelStats = channelStatsProp ?? {
    name: "Your channel",
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
  const topVideos = [...allVideos].sort((a, b) => b.views - a.views).slice(0, 3);

  return (
    <div className="p-4 md:p-6 space-y-6 text-gray-100 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-[#1f1f1f] via-[#252525] to-[#1a1a1a] p-6 rounded-2xl border border-[#333] shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Channel dashboard
            </h1>
            <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Monetized Channel
            </span>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Welcome back to {channelStats.name}. Here is your live performance summary.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={onOpenAIAssistant}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95"
            id="dashboard-ai-coach-btn"
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            <span>AI Growth Coach</span>
          </button>

          <button
            onClick={onOpenUploadModal}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95"
            id="dashboard-upload-btn"
          >
            <Upload className="h-4 w-4" />
            <span>Upload video</span>
          </button>
        </div>
      </div>

      {/* Main Grid: 3 columns layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Latest Video Performance */}
        <div className="bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] p-5 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-3 mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <VideoIcon className="h-4 w-4 text-red-500" />
                Latest video performance
              </h2>
              <span className="text-[11px] font-medium text-gray-400 bg-[#282828] px-2 py-0.5 rounded-md">
                First 4 days
              </span>
            </div>

            {latestVideo ? (
              <div className="space-y-4">
                <div className="relative group rounded-xl overflow-hidden bg-black border border-[#333]">
                  <img
                    src={latestVideo.thumbnail}
                    alt={latestVideo.title}
                    className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {latestVideo.duration}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white line-clamp-2 hover:text-red-400 cursor-pointer transition-colors break-words whitespace-normal leading-tight" dir="auto">
                  {latestVideo.title}
                </h3>

                <div className="space-y-2.5 border-t border-b border-[#2a2a2a] py-3 text-xs">
                  {latestVideo.views > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Ranking by views</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        1 of {allVideos.length || 10}
                        <TrendingUp className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Views</span>
                    <span className="font-bold text-white">
                      {latestVideo.views.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Impressions CTR</span>
                    <span className={`font-semibold ${latestVideo.ctr > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                      {latestVideo.ctr}%{latestVideo.ctr > 0 && latestVideo.ctr >= 5 ? ' (High)' : latestVideo.ctr > 0 && latestVideo.ctr >= 3 ? ' (Medium)' : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Average view duration</span>
                    <span className="font-semibold text-white">
                      {latestVideo.avgViewDuration}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No videos uploaded yet.</p>
            )}
          </div>

          {latestVideo && (
            <div className="mt-4 pt-2 flex items-center gap-2">
              <button
                onClick={() => onSelectVideoForAnalytics(latestVideo)}
                className="flex-1 bg-[#2b2b2b] hover:bg-[#383838] text-white text-xs font-semibold py-2 rounded-xl transition-colors text-center"
              >
                GO TO VIDEO ANALYTICS
              </button>
              <button
                onClick={() => onSelectView("comments")}
                className="bg-[#2b2b2b] hover:bg-[#383838] text-gray-300 p-2 rounded-xl transition-colors"
                title="See Comments"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Column 2: Channel Analytics Overview */}
        <div className="bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] p-5 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-3 mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Channel analytics
              </h2>
              <span className="text-[11px] text-gray-400">Last 28 days</span>
            </div>

            {/* Subscriber / Follower stats */}
            <div className="bg-[#171717] p-4 rounded-xl border border-[#2a2a2a] mb-4">
              <p className="text-xs text-gray-400 font-medium">
                Current followers
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white tracking-tight">
                  {channelStats.subscribers.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
                  +{channelStats.subscriberChange28Days.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Summary Metrics Grid */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-[#252525] rounded-xl">
                <div className="flex items-center gap-2 text-gray-300">
                  <Eye className="h-4 w-4 text-blue-400" />
                  <span>Views</span>
                </div>
                <span className="font-bold text-white">
                  {channelStats.views28Days >= 1000000
                    ? (channelStats.views28Days / 1000000).toFixed(2) + 'M'
                    : (channelStats.views28Days / 1000).toFixed(2) + 'k'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#252525] rounded-xl">
                <div className="flex items-center gap-2 text-gray-300">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <span>Watch time (hours)</span>
                </div>
                <span className="font-bold text-white">
                  {(channelStats.watchTimeHours28Days / 1000).toFixed(1)}K
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#252525] rounded-xl">
                <div className="flex items-center gap-2 text-gray-300">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <span>Your estimated revenue</span>
                </div>
                <span className="font-bold text-emerald-400">
                  ${channelStats.estimatedRevenue28Days.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Top Content List */}
            <div className="mt-5 border-t border-[#2d2d2d] pt-3">
              <p className="text-xs font-bold text-gray-300 mb-2">
                Top content (Last 28 days)
              </p>
              <div className="space-y-2">
                {topVideos.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => onSelectVideoForAnalytics(v)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[#282828] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        className="h-8 w-12 rounded object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-xs text-gray-200 truncate break-words whitespace-normal font-medium leading-tight" dir="auto">
                        {v.title}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-gray-400 shrink-0">
                      {v.views.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => onSelectView("analytics")}
            className="mt-4 w-full bg-[#2b2b2b] hover:bg-[#383838] text-white text-xs font-semibold py-2 rounded-xl transition-colors text-center"
          >
            GO TO CHANNEL ANALYTICS
          </button>
        </div>

        {/* Column 3: Realtime Activity & Creator Updates */}
        <div className="space-y-6">
          {/* Realtime 48h Views Ticker */}
          <div className="bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] p-5 shadow-md">
            <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-3 mb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400 fill-amber-400" />
                Realtime
              </h2>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Updating live
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Views • Last 48 hours</p>
                <p className="text-2xl font-black text-white mt-0.5">
                  {channelStats.realtime48HoursViews.toLocaleString()}
                </p>
              </div>

              {/* Animated mini bar visualization */}
              <div className="h-16 pt-2 border-b border-[#2a2a2a] pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { hour: '1', views: Math.floor(channelStats.realtime48HoursViews / 16) },
                    { hour: '2', views: Math.floor(channelStats.realtime48HoursViews / 15) },
                    { hour: '3', views: Math.floor(channelStats.realtime48HoursViews / 14) },
                    { hour: '4', views: Math.floor(channelStats.realtime48HoursViews / 13) },
                    { hour: '5', views: Math.floor(channelStats.realtime48HoursViews / 12) },
                    { hour: '6', views: Math.floor(channelStats.realtime48HoursViews / 11) },
                    { hour: '7', views: Math.floor(channelStats.realtime48HoursViews / 10) },
                    { hour: '8', views: Math.floor(channelStats.realtime48HoursViews / 9) },
                    { hour: '9', views: Math.floor(channelStats.realtime48HoursViews / 8) },
                    { hour: '10', views: Math.floor(channelStats.realtime48HoursViews / 7) },
                    { hour: '11', views: Math.floor(channelStats.realtime48HoursViews / 6) },
                    { hour: '12', views: Math.floor(channelStats.realtime48HoursViews / 5) },
                    { hour: '13', views: Math.floor(channelStats.realtime48HoursViews / 4) },
                    { hour: '14', views: Math.floor(channelStats.realtime48HoursViews / 3) },
                    { hour: '15', views: Math.floor(channelStats.realtime48HoursViews / 2) },
                    { hour: '16', views: channelStats.realtime48HoursViews },
                  ]}>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#181818",
                        borderColor: "#333",
                        borderRadius: "10px",
                        fontSize: "11px",
                      }}
                    />
                    <Bar dataKey="views" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Last 60 minutes:</span>
                <span className="font-bold text-white">
                  {channelStats.realtime60MinsViews.toLocaleString()} views
                </span>
              </div>
            </div>
          </div>

          {/* Creator Insider / Studio News */}
          <div className="bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] p-5 shadow-md">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              What's new in Studio
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#262626] rounded-xl border border-[#333]">
                <p className="font-bold text-white">
                  🚀 Gemini AI Creator Coach Released
                </p>
                <p className="text-gray-400 mt-1 line-clamp-2">
                  Generate viral video titles, auto-summarize descriptions, and
                  get instant comment smart replies using AI.
                </p>
                <button
                  onClick={onOpenAIAssistant}
                  className="mt-2 text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  Try AI Coach now <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>

              <div className="p-3 bg-[#262626] rounded-xl border border-[#333]">
                <p className="font-bold text-white">
                  🎵 Expanded Royalty-Free Audio Library
                </p>
                <p className="text-gray-400 mt-1 line-clamp-2">
                  Over 5,000 new tracks added for copyright-safe background music
                  and sound effects.
                </p>
                <button
                  onClick={() => onSelectView("audio-library")}
                  className="mt-2 text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                >
                  Open Audio Library <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
