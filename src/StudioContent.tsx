/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@/lib/router-compat';
import { Search, Filter, Upload, RefreshCw } from 'lucide-react';
import { useStudio } from './StudioLayout';
import { ChannelContentDashboard } from '@/components/ChannelContentDashboard';
import { supabase } from '@/integrations/supabase/loose';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function StudioContent() {
  const { loading, videos, fetchAll } = useStudio();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      const matchSearch = !search || (v.title ?? '').toLowerCase().includes(search.toLowerCase());
      const matchVis = visibilityFilter === 'all' || (v.visibility ?? 'public') === visibilityFilter;
      return matchSearch && matchVis;
    });
  }, [videos, search, visibilityFilter]);

  const handleVisibilityChange = async (videoId: string, visibility: string) => {
    const { error } = await supabase.rpc('creator_update_video_visibility', {
      p_video_id: videoId,
      p_visibility: visibility,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Visibility updated');
    fetchAll();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal text-[#0f0f0f]">Channel content</h1>
          <p className="text-sm text-[#606060] mt-1">{videos.length} videos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-9 h-9 rounded-full hover:bg-white border border-[#e5e5e5] grid place-items-center text-[#606060]"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition"
          >
            <Upload className="w-4 h-4" /> Upload videos
          </Link>
        </div>
      </div>

      {/* Filters bar - ProNax Studio style tabs */}
      <div className="studio-card p-0 overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-[#e5e5e5]">
          {['Videos', 'Live', 'Shorts', 'Posts'].map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                i === 0
                  ? 'border-[#0f0f0f] text-[#0f0f0f]'
                  : 'border-transparent text-[#606060] hover:text-[#0f0f0f]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#e5e5e5] bg-[#fafafa]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#606060]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter"
              className="w-full h-9 pl-9 pr-4 rounded border border-[#e5e5e5] bg-white text-sm text-[#0f0f0f] outline-none focus:border-[#065fd4]"
            />
          </div>
          <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
            <SelectTrigger className="w-[140px] h-9 bg-white border-[#e5e5e5] text-sm">
              <Filter className="w-3.5 h-3.5 mr-2 text-[#606060]" />
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="p-4">
          <ChannelContentDashboard
            videos={filtered}
            loading={loading}
            variant="studio"
            onEdit={(id) => navigate(`/studio/content/${id}`)}
            onAnalytics={(id) => navigate(`/studio/content/${id}?tab=analytics`)}
            onVisibilityChange={handleVisibilityChange}
          />
        </div>
      </div>
    </div>
  );
}
