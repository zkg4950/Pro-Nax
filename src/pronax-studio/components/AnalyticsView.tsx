/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  TrendingUp,
  Eye,
  Clock,
  UserPlus,
  DollarSign,
  Globe,
  Calendar,
  Layers,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ChannelStats, Video } from "../types";
import {
  useAnalyticsChartData,
  useTrafficSources,
  useGeographies,
  useRealTimeViews,
} from "../useAnalyticsData";
import { useLiveStudio } from "../useLiveStudio";
import { useAuthSession } from "@/hooks/useAuthSession";

// Lazy-load chart components to reduce initial bundle size
const ViewsChart = lazy(() => import("./analytics/ViewsChart"));
const TrafficSourcesChart = lazy(() => import("./analytics/TrafficSourcesChart"));
const RealtimeChart = lazy(() => import("./analytics/RealtimeChart"));

interface AnalyticsViewProps {
  channelStats: ChannelStats | null;
  selectedVideo?: Video | null;
  onClearSelectedVideo?: () => void;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  channelStats: channelStatsProp,
  selectedVideo,
  onClearSelectedVideo,
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
  const { user } = useAuthSession();
  const [activeTab, setActiveTab] = useState<
    "overview" | "content" | "audience" | "revenue"
  >("overview");

  // Content tab data - video performance
  const { videos } = useLiveStudio();
  const topVideos = React.useMemo(() => {
    return videos
      .slice()
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [videos]);
  const [selectedMetric, setSelectedMetric] = useState<
    "views" | "watchTime" | "subscribers" | "revenue"
  >("views");
  const [dateRange, setDateRange] = useState("28d");

  // Real-time data hooks
  const { data: chartData, loading: chartLoading, error: chartError, refresh: refreshChart } = useAnalyticsChartData(
    dateRange === "7d" ? 7 : dateRange === "28d" ? 28 : dateRange === "90d" ? 90 : 365
  );
  const { data: trafficSources, loading: trafficLoading, error: trafficError, refresh: refreshTraffic } = useTrafficSources();
  const { data: geographies, loading: geoLoading, error: geoError, refresh: refreshGeo } = useGeographies();
  const { data: realTimeViews, loading: realtimeLoading, error: realtimeError, refresh: refreshRealtime } = useRealTimeViews();
  
  // Dynamic import for minute views data to avoid import errors
  const [minuteViewsData, setMinuteViewsData] = useState<{ min: string; views: number }[]>([]);
  const [minuteViewsLoading, setMinuteViewsLoading] = useState(false);
  const [minuteViewsError, setMinuteViewsError] = useState<string | null>(null);
  
  const refreshMinuteFn = async () => {
    if (!user?.id) return;
    try {
      setMinuteViewsLoading(true);
      setMinuteViewsError(null);
      const { fetchMinuteViews } = await import("../analyticsApi");
      setMinuteViewsData(await fetchMinuteViews(user.id, 60));
    } catch (err) {
      setMinuteViewsError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setMinuteViewsLoading(false);
    }
  };

  useEffect(() => {
    const loadMinuteViews = async () => {
      if (!user?.id) return;
      
      try {
        setMinuteViewsLoading(true);
        setMinuteViewsError(null);
        
        const { fetchMinuteViews } = await import("../analyticsApi");
        const minuteData = await fetchMinuteViews(user.id, 60);
        setMinuteViewsData(minuteData);
        setMinuteViewsLoading(false);
        
        // Set up auto-refresh
        const interval = setInterval(async () => {
          try {
            const refreshedData = await fetchMinuteViews(user.id, 60);
            setMinuteViewsData(refreshedData);
          } catch (err) {
            console.warn('[AnalyticsView] Failed to refresh minute views:', err);
          }
        }, 10000);
        
        return () => clearInterval(interval);
      } catch (error) {
        console.warn('[AnalyticsView] Minute views data not available:', error);
        setMinuteViewsLoading(false);
        setMinuteViewsError("Real-time minute data not available");
      }
    };
    
    loadMinuteViews();
  }, [user?.id]);

  // Real-time WebSocket/SSE subscription for live updates
  const [liveViewCount, setLiveViewCount] = useState(0);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const liveSubscriptionRef = useRef<any>(null);

  // Setup real-time subscription for analytics events
  useEffect(() => {
    if (!user?.id) return;

    const setupRealtimeSubscription = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/loose");
        
        // Subscribe to new analytics events for real-time updates
        const channel = supabase
          .channel(`analytics:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'analytics_events',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              // Update live view count when new view events come in
              if (payload.new.event_type === 'view') {
                setLiveViewCount(prev => prev + 1);
                // Also trigger a refresh of the real-time data
                refreshRealtime();
              }
            }
          )
          .subscribe((status) => {
            setIsLiveConnected(status === 'SUBSCRIBED');
          });

        liveSubscriptionRef.current = channel;

        return () => {
          if (liveSubscriptionRef.current) {
            supabase.removeChannel(liveSubscriptionRef.current);
          }
        };
      } catch (error) {
        console.error('[AnalyticsView] Failed to setup realtime subscription:', error);
      }
    };

    setupRealtimeSubscription();
  }, [user?.id, refreshRealtime]);

  // Update live view count based on real-time data
  useEffect(() => {
    if (realTimeViews && !realtimeLoading) {
      setLiveViewCount(realTimeViews.last60Minutes);
    }
  }, [realTimeViews, realtimeLoading]);

  // Real-Time Views Ticker State
  const [realtime48h, setRealtime48h] = useState(realTimeViews?.last48Hours || channelStats.realtime48HoursViews || 0);
  const [realtime60m, setRealtime60m] = useState(realTimeViews?.last60Minutes || channelStats.realtime60MinsViews || 0);
  
  // Real-time minute bars from API
  const [minuteBars, setMinuteBars] = useState<{ min: string; views: number }[]>([]);

  // Update real-time views when data changes
  React.useEffect(() => {
    if (realTimeViews) {
      setRealtime48h(realTimeViews.last48Hours);
      setRealtime60m(realTimeViews.last60Minutes);
    }
  }, [realTimeViews]);

  // Update minute bars when data changes
  React.useEffect(() => {
    if (minuteViewsData && minuteViewsData.length > 0) {
      setMinuteBars(minuteViewsData);
    }
  }, [minuteViewsData]);

  // Handle date range change
  React.useEffect(() => {
    refreshChart();
  }, [dateRange, refreshChart]);

  const handleRefreshAll = () => {
    refreshChart();
    refreshTraffic();
    refreshGeo();
    if (refreshRealtime) refreshRealtime();
    if (refreshMinuteFn) refreshMinuteFn();
  };

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case "views":
        return "Views";
      case "watchTime":
        return "Watch time (hours)";
      case "subscribers":
        return "Followers";
      case "revenue":
        return "Estimated Revenue ($)";
    }
  };

  const getMetricColor = () => {
    switch (selectedMetric) {
      case "views":
        return "#3b82f6";
      case "watchTime":
        return "#a855f7";
      case "subscribers":
        return "#10b981";
      case "revenue":
        return "#10b981";
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 text-gray-100 max-w-7xl mx-auto">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              {selectedVideo ? `Analytics: ${selectedVideo.title}` : "Channel analytics"}
            </h1>
            {selectedVideo && onClearSelectedVideo && (
              <button
                onClick={onClearSelectedVideo}
                className="text-xs bg-[#282828] hover:bg-[#333] text-gray-300 px-2.5 py-1 rounded-full border border-[#444]"
              >
                ← Back to Channel Analytics
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Track performance, audience engagement, traffic sources, and revenue.
          </p>
        </div>

        {/* Date range picker */}
        <div className="flex items-center gap-2 bg-[#1f1f1f] border border-[#333] p-1.5 rounded-xl text-xs font-semibold">
          <Calendar className="h-4 w-4 text-gray-400 ml-2" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-transparent text-white focus:outline-none cursor-pointer pr-2"
          >
            <option value="7d" className="bg-[#222]">Last 7 days</option>
            <option value="28d" className="bg-[#222]">Last 28 days</option>
            <option value="90d" className="bg-[#222]">Last 90 days</option>
            <option value="365d" className="bg-[#222]">Last 365 days</option>
          </select>
          <button
            onClick={handleRefreshAll}
            className="p-1.5 hover:bg-[#333] rounded-lg transition"
            title="Refresh data"
          >
            <RefreshCw className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Analytics Tabs */}
      <div className="flex items-center border-b border-[#2d2d2d] gap-6 text-sm font-semibold text-gray-400 select-none">
        {(["overview", "content", "audience", "revenue"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 capitalize transition-all ${
              activeTab === tab
                ? "text-red-500 border-b-2 border-red-500 font-bold"
                : "hover:text-gray-200"
            }`}
            id={`analytics-tab-${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "content" && (
        <div className="bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] shadow-lg">
          <h2 className="text-sm font-bold text-white mb-4">Top performing videos</h2>
          {videos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400">No videos yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topVideos.map((video, idx) => (
                <div key={video.id} className="flex items-center gap-3 p-3 bg-[#252525] rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center text-xs font-bold text-gray-300">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{video.title}</p>
                    <p className="text-xs text-gray-400">{video.uploadDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{video.views.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">views</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "audience" && (
        <div className="bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] shadow-lg">
          <h2 className="text-sm font-bold text-white mb-4">Audience demographics</h2>
          {geoLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-[#2a2a2a] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : geoError ? (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <p className="text-xs text-gray-400">Failed to load audience data</p>
              <button
                onClick={refreshGeo}
                className="mt-3 text-xs text-blue-400 hover:text-blue-300"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {geographies.map((geo) => (
                <div key={geo.country} className="flex items-center justify-between p-2.5 bg-[#252525] rounded-xl">
                  <span className="font-medium text-gray-200">{geo.countryCode} {geo.country}</span>
                  <span className="font-bold text-white">{geo.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "revenue" && (
        <div className="bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] shadow-lg">
          <h2 className="text-sm font-bold text-white mb-4">Revenue breakdown</h2>
          <div className="space-y-4">
            <div className="p-4 bg-[#252525] rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Estimated Revenue</span>
                <span className="text-lg font-bold text-emerald-400">
                  ${channelStats.estimatedRevenue28Days.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-400">Last 28 days</p>
            </div>
            
            {chartLoading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-3"></div>
                  <p className="text-xs text-gray-400">Loading revenue data...</p>
                </div>
              </div>
            ) : chartError ? (
              <div className="h-48 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                  <p className="text-xs text-gray-400">Failed to load revenue data</p>
                  <button
                    onClick={refreshChart}
                    className="mt-3 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-48">
                <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500 text-xs">Loading chart...</div>}>
                  <ViewsChart
                    data={chartData}
                    selectedMetric="revenue"
                    metricLabel="Revenue"
                    metricColor="#10b981"
                  />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overview content (shown when overview tab is active) */}
      {activeTab === "overview" && (
        <>
          {/* Metric Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Views */}
            <div
              onClick={() => setSelectedMetric("views")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedMetric === "views"
                  ? "bg-[#252a36] border-blue-500/50 ring-2 ring-blue-500/30"
                  : "bg-[#1f1f1f] border-[#2d2d2d] hover:bg-[#252525]"
              }`}
            >
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-xs font-medium">Views</span>
                <Eye className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-xl font-black text-white mt-2">
                {selectedVideo
                  ? selectedVideo.views.toLocaleString()
                  : channelStats.views28Days >= 1000000
                    ? (channelStats.views28Days / 1000000).toFixed(2) + "M"
                    : (channelStats.views28Days / 1000).toFixed(2) + "k"}
              </p>
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mt-1">
                {channelStats.subscriberChange28Days > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3" /> +{channelStats.subscriberChange28Days} vs previous 28 days
                  </>
                ) : channelStats.subscriberChange28Days < 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 rotate-180" /> {channelStats.subscriberChange28Days} vs previous 28 days
                  </>
                ) : (
                  <>No change vs previous 28 days</>
                )}
              </span>
            </div>

            {/* Watch Time */}
            <div
              onClick={() => setSelectedMetric("watchTime")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedMetric === "watchTime"
                  ? "bg-[#2d2238] border-purple-500/50 ring-2 ring-purple-500/30"
                  : "bg-[#1f1f1f] border-[#2d2d2d] hover:bg-[#252525]"
              }`}
            >
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-xs font-medium">Watch time (hours)</span>
                <Clock className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-xl font-black text-white mt-2">
                {selectedVideo
                  ? (selectedVideo as any).watchTime?.toLocaleString() || "0"
                  : (channelStats.watchTimeHours28Days / 1000).toFixed(1) + "K"}
              </p>
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mt-1">
                {channelStats.views28Days > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3" /> +{Math.round((channelStats.views28Days / (channelStats.views28Days - 1000)) * 100)}% vs previous 28 days
                  </>
                ) : (
                  <>No data vs previous 28 days</>
                )}
              </span>
            </div>

            {/* Followers */}
            <div
              onClick={() => setSelectedMetric("subscribers")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedMetric === "subscribers"
                  ? "bg-[#1f3027] border-emerald-500/50 ring-2 ring-emerald-500/30"
                  : "bg-[#1f1f1f] border-[#2d2d2d] hover:bg-[#252525]"
              }`}
            >
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-xs font-medium">Followers</span>
                <UserPlus className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xl font-black text-white mt-2">
                +{channelStats.subscriberChange28Days.toLocaleString()}
              </p>
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3" /> +22% vs previous 28 days
              </span>
            </div>

            {/* Revenue */}
            <div
              onClick={() => setSelectedMetric("revenue")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedMetric === "revenue"
                  ? "bg-[#1f3027] border-emerald-500/50 ring-2 ring-emerald-500/30"
                  : "bg-[#1f1f1f] border-[#2d2d2d] hover:bg-[#252525]"
              }`}
            >
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-xs font-medium">Estimated Revenue</span>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xl font-black text-emerald-400 mt-2">
                ${channelStats.estimatedRevenue28Days.toLocaleString()}
              </p>
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3" /> +18% vs previous 28 days
              </span>
            </div>
          </div>

          {/* Real-time Views Ticker Card */}
          <div className="bg-[#1a1a1a] border border-[#2d2d2d] p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2a2a2a] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  {realtimeLoading ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-600 animate-pulse" />
                  ) : isLiveConnected ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-600" />
                  )}
                  <h2 className="text-sm font-bold text-white tracking-wide uppercase">
                    Real-Time Performance
                  </h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    realtimeLoading 
                      ? "bg-gray-600/20 text-gray-400 border-gray-500/30"
                      : isLiveConnected
                      ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30"
                      : "bg-yellow-600/20 text-yellow-400 border-yellow-500/30"
                  }`}>
                    {realtimeLoading ? "LOADING..." : isLiveConnected ? "LIVE CONNECTED" : "STANDBY"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isLiveConnected 
                    ? "Live view counter updates in real-time via WebSocket" 
                    : "Connecting to real-time analytics stream..."}
                </p>
              </div>

              <div className="flex items-center gap-6 text-xs font-mono font-bold">
                <div>
                  <span className="text-gray-400 block text-[10px]">LAST 48 HOURS</span>
                  {realtimeLoading ? (
                    <span className="text-lg text-gray-400 animate-pulse">---</span>
                  ) : realtimeError ? (
                    <span className="text-lg text-red-400">Error</span>
                  ) : (
                    <span className="text-lg text-white font-black">{realtime48h.toLocaleString()}</span>
                  )}
                </div>
                <div className="border-l border-[#333] pl-6">
                  <span className="text-gray-400 block text-[10px]">LIVE VIEW COUNT</span>
                  {realtimeLoading ? (
                    <span className="text-lg text-gray-400 animate-pulse">---</span>
                  ) : realtimeError ? (
                    <span className="text-lg text-red-400">Error</span>
                  ) : (
                    <span className="text-lg text-emerald-400 font-black">
                      {liveViewCount.toLocaleString()}
                      {isLiveConnected && <span className="ml-1 text-xs text-emerald-300">+{liveViewCount - realtime60m}</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 60-Minute Real-Time Ticker Bar Graph */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-gray-400">
                <span>Views per minute (60m ticker)</span>
                <div className="flex items-center gap-2">
                  {isLiveConnected && (
                    <span className="flex items-center gap-1 text-emerald-400 font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  )}
                  {minuteViewsLoading ? (
                    <span className="text-gray-400 font-mono">Loading...</span>
                  ) : minuteViewsError ? (
                    <span className="text-red-400 font-mono">Error loading data</span>
                  ) : (
                    <span className="text-emerald-400 font-mono">Feed active</span>
                  )}
                </div>
              </div>

              {minuteViewsLoading ? (
                <div className="h-28 w-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-3"></div>
                    <p className="text-xs text-gray-400">Loading real-time data...</p>
                  </div>
                </div>
              ) : minuteViewsError ? (
                <div className="h-28 w-full flex items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                    <p className="text-xs text-gray-400">Failed to load real-time data</p>
                    {refreshMinuteFn && (
                      <button
                        onClick={refreshMinuteFn}
                        className="mt-3 text-xs text-blue-400 hover:text-blue-300"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ) : minuteBars.length === 0 ? (
                <div className="h-28 w-full flex items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                    <p className="text-xs text-gray-400">No real-time data available yet</p>
                    <p className="text-xs text-gray-500 mt-1">Views will appear here once your content starts getting traffic</p>
                  </div>
                </div>
              ) : (
                <div className="h-28 w-full">
                  <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500 text-xs">Loading...</div>}>
                    <RealtimeChart
                      minuteData={minuteBars}
                      last60Minutes={realtime60m}
                      last48Hours={realtime48h}
                      loading={minuteViewsLoading}
                      error={minuteViewsError}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Main Graph */}
          <div className="bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-white">
                  {getMetricLabel()} over time
                </h2>
                <p className="text-xs text-gray-400">
                  Daily trend breakdown for selected date range
                </p>
              </div>
              {chartError && (
                <button
                  onClick={refreshChart}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <AlertCircle className="h-3 w-3" /> Failed to load - Retry
                </button>
              )}
            </div>

            {chartLoading ? (
              <div className="h-72 w-full flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3"></div>
                  <p className="text-xs text-gray-400">Loading chart data...</p>
                </div>
              </div>
            ) : chartError ? (
              <div className="h-72 w-full flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                  <p className="text-xs text-gray-400">Failed to load analytics data</p>
                </div>
              </div>
            ) : (
              <div className="h-72 w-full">
                <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500 text-xs">Loading chart...</div>}>
                  <ViewsChart
                    data={chartData.length > 0 ? chartData : []}
                    selectedMetric={selectedMetric}
                    metricLabel={getMetricLabel()}
                    metricColor={getMetricColor()}
                  />
                </Suspense>
              </div>
            )}
          </div>

          {/* Traffic Sources & Demographics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Traffic Sources Bar Breakdown */}
            <div className="bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-400" />
                  Traffic sources
                </h2>
                {trafficError && (
                  <button
                    onClick={refreshTraffic}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" /> Retry
                  </button>
                )}
              </div>

              {trafficLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-4 bg-[#2a2a2a] rounded animate-pulse" />
                      <div className="h-2 bg-[#2a2a2a] rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : trafficError ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                  <p className="text-xs text-gray-400">Failed to load traffic sources</p>
                </div>
              ) : trafficSources.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-xs text-gray-400">No traffic source data available yet</p>
                  <p className="text-xs text-gray-500 mt-1">Traffic data will appear once your content starts getting views</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trafficSources.map((ts, idx) => (
                    <div key={ts.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-gray-200">{ts.name}</span>
                        <span className="text-gray-400 font-bold">
                          {ts.percentage}% ({ts.views.toLocaleString()} views)
                        </span>
                      </div>
                      <div className="w-full bg-[#121212] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${ts.percentage}%`,
                            backgroundColor: COLORS[idx % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Geography / Audience */}
            <div className="bg-[#1f1f1f] p-5 rounded-2xl border border-[#2d2d2d] shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-400" />
                  Top geographies & Audience
                </h2>
                {geoError && (
                  <button
                    onClick={refreshGeo}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" /> Retry
                  </button>
                )}
              </div>

              {geoLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between">
                        <div className="h-4 bg-[#2a2a2a] rounded animate-pulse w-24" />
                        <div className="h-4 bg-[#2a2a2a] rounded animate-pulse w-12" />
                      </div>
                      <div className="h-2 bg-[#2a2a2a] rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : geoError ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                  <p className="text-xs text-gray-400">Failed to load geography data</p>
                  <button
                    onClick={refreshGeo}
                    className="mt-3 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Retry
                  </button>
                </div>
              ) : geographies.length === 0 ? (
                <div className="text-center py-8">
                  <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-300 mb-2">No geography data available</p>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto">
                    Geographic data will appear here once your content starts getting views from different regions around the world.
                  </p>
                  <div className="mt-4 p-3 bg-[#252525] rounded-lg max-w-xs mx-auto">
                    <p className="text-xs text-gray-400">
                      <span className="text-emerald-400 font-semibold">Tip:</span> Share your content on social media to attract viewers from different countries!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {geographies.map((geo, idx) => {
                    const maxPercentage = Math.max(...geographies.map(g => g.percentage));
                    const relativeWidth = maxPercentage > 0 ? (geo.percentage / maxPercentage) * 100 : 0;
                    
                    return (
                      <div key={geo.country} className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{geo.countryCode}</span>
                            <span className="font-medium text-gray-200">{geo.country}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{geo.percentage}%</span>
                            {idx === 0 && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                Top
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-[#121212] rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 ease-out relative"
                            style={{
                              width: `${relativeWidth}%`,
                              backgroundColor: COLORS[idx % COLORS.length],
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {geographies.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#2a2a2a]">
                      <p className="text-xs text-gray-400 text-center">
                        Based on {geographies.reduce((sum, geo) => sum + geo.percentage, 0)}% of total views with known location data
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
