/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Video, Loader2, Check, X, Ban, Trash2, AlertCircle } from 'lucide-react';
import { ListToolbar, ListPager } from '@/ListToolbar';
import { useConfirmAction } from '@/ConfirmActionDialog';
import { useAdminList, type AdminListFilter } from '@/useAdminList';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/loose';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

const VIDEO_COLUMNS = 'id,title,owner_id,visibility,views_count,is_shadow_banned,is_removed,is_pending_review,auto_suppressed,boost_score,report_count,thumb_url,created_at,moderation_reason';

export function VideosTab() {
  const [status, setStatus] = useState<string>('all');
  const [confirm, confirmDialog] = useConfirmAction();

  const filters = useMemo<AdminListFilter[]>(() => {
    if (status === 'removed') return [{ column: 'is_removed', value: true }];
    if (status === 'shadow_banned') return [{ column: 'is_shadow_banned', value: true }];
    if (status === 'pending') return [{ column: 'is_pending_review', value: true }];
    if (status === 'all') return [];
    return [{ column: 'visibility', value: status }];
  }, [status]);

  const list = useAdminList({
    table: 'videos',
    select: VIDEO_COLUMNS,
    searchColumns: ['title'],
    filters,
    realtimeTables: ['videos'],
  });

  const removeVideo = async (videoId: string) => {
    await confirm({
      action: 'admin.video.remove',
      title: 'Remove Video',
      description: 'Are you sure you want to remove this video? This action cannot be undone.',
      destructive: true,
      run: async () => {
        const { error } = await supabase.rpc('admin_moderate_video', {
          p_video: videoId,
          p_action: 'remove',
          p_reason: 'Removed by admin'
        });

        if (error) {
          toast.error(error.message);
        } else {
          toast.success('Video removed successfully');
        }
      }
    });
  };

  const shadowBanVideo = async (videoId: string, isShadowBanned: boolean) => {
    const action = isShadowBanned ? 'unshadowban' : 'shadowban';
    const { error } = await supabase.rpc('admin_moderate_video', {
      p_video: videoId,
      p_action: action,
      p_reason: null
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isShadowBanned ? 'Video shadow ban removed' : 'Video shadow banned');
    }
  };

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg border border-border/40">
          {['all', 'public', 'private', 'unlisted', 'shadow_banned', 'removed', 'pending'].map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition ${
                status === s ? 'gradient-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <ListToolbar
          list={list}
          exportName="videos"
          exportColumns={VIDEO_COLUMNS.split(',')}
          placeholder="Search videos..."
        />
      </div>

      <div className="space-y-2">
        {list.loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : list.rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No videos found
          </div>
        ) : (
          list.rows.map((v: any) => (
            <div key={v.id} className="glass rounded-xl border border-border/30 p-3">
              <div className="flex items-start gap-3 flex-wrap">
                {v.thumb_url ? (
                  <img src={v.thumb_url} alt="" className="w-24 h-14 object-cover rounded border border-border/40" />
                ) : (
                  <div className="w-24 h-14 rounded bg-muted/30 border border-border/40 flex items-center justify-center"><Video className="w-4 h-4 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium text-sm mb-1">{v.title || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground space-x-2">
                    <span>ID: {v.id.slice(0, 8)}...</span>
                    <span>Views: {v.views_count || 0}</span>
                    <span>{v.visibility}</span>
                  </div>
                  {v.moderation_reason && (
                    <div className="text-xs text-destructive mt-1">{v.moderation_reason}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  {v.is_shadow_banned ? (
                    <button
                      onClick={() => shadowBanVideo(v.id, true)}
                      className="p-2 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20"
                      title="Remove Shadow Ban"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => shadowBanVideo(v.id, false)}
                      className="p-2 rounded-lg bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
                      title="Shadow Ban"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeVideo(v.id)}
                    className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20"
                    title="Remove Video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <ListPager list={list} />
    </div>
  );
}