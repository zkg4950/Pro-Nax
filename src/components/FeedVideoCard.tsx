/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { motion } from 'framer-motion';
import { MoreVertical, ListVideo, Bookmark, Share2, Clock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { SaveToPlaylistDialog } from '@/components/SaveToPlaylistDialog';
import { ShareDialog } from '@/components/ShareDialog';
import { addToQueue } from '@/lib/watchQueue';
import { saveToWatchLater } from '@/lib/watchLater';
import { showSavedToast } from './SavedToast';
import { AnimatedCounter, compactFormat } from '@/components/ui/animated-counter';
import { HoverSprite } from '@/components/HoverSprite';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function feedTimeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function feedFmtDuration(s: number | null | undefined) {
  if (!s || s <= 0) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

interface FeedVideoCardProps {
  id: string;
  title: string;
  channel: string;
  /** Raw numeric views — renders the animated counter. Ignored when viewsText is set. */
  views?: number;
  /** Pre-formatted views text, e.g. "1.2K" */
  viewsText?: string;
  timeText: string;
  durationText?: string;
  thumbUrl?: string | null;
  channelAvatar?: string | null;
  previewSpriteUrl?: string | null;
  previewSpriteFrames?: number | null;
  index?: number;
  href?: string;
  /** Optional overlay pinned to the top-left of the thumbnail (e.g. trending rank). */
  topBadge?: ReactNode;
  /** Optional content on the right side of the channel row. */
  metaRight?: ReactNode;
}

export function FeedVideoCard({
  id,
  title,
  channel,
  views,
  viewsText,
  timeText,
  durationText,
  thumbUrl,
  channelAvatar,
  previewSpriteUrl,
  previewSpriteFrames,
  index = 0,
  href,
  topBadge,
  metaRight,
}: FeedVideoCardProps) {
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const path = href ?? `/watch/${id}`;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.04 }}
      className="group relative min-w-0 px-3 pb-0 sm:px-0 v3d-stage"
    >
      <a href={href ?? `/watch/${id}`} className="block w-full">
        <div className="v3d-thumb relative aspect-video w-full overflow-hidden rounded-2xl bg-muted/20 sm:rounded-lg border border-border/40 shadow-xl shadow-background/60">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={title}
              loading={index < 3 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={index < 3 ? 'high' : 'low'}
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.025]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/15 to-accent/20" />
          )}
          {previewSpriteUrl && previewSpriteFrames ? (
            <HoverSprite url={previewSpriteUrl} frames={previewSpriteFrames} />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          {topBadge}
          {durationText ? (
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-background/80 text-foreground">
              {durationText}
            </span>
          ) : null}
        </div>

      </a>

      <div className="grid grid-cols-[minmax(0,1fr)_28px] items-start gap-2 pt-2 sm:grid-cols-[36px_minmax(0,1fr)_28px]">
        <div className="hidden h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted sm:block">
          {channelAvatar ? (
            <img src={channelAvatar} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[11px] font-bold text-muted-foreground">
              {(channel || 'C').slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <a href={href ?? `/watch/${id}`} className="block min-w-0">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-[19px] sm:text-[14px] sm:font-semibold sm:leading-[18px] text-foreground transition-colors group-hover:text-primary">
            {title}
          </h3>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] leading-[16px] text-muted-foreground">
            <span className="truncate">@{(channel || 'creator').replace(/\s+/g, '')}</span>
            {metaRight}
          </div>
          <p className="truncate text-[12px] leading-[16px] text-muted-foreground">
            {viewsText ?? <AnimatedCounter value={views ?? 0} format={compactFormat} />} views · {timeText}
          </p>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="More options"
              className="-mt-1 h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onSelect={() => {
                const n = addToQueue({ id, title, thumbUrl, channel });
                if (n === null) toast('Already in your queue');
                else toast.success(`Added to queue · ${n} video${n > 1 ? 's' : ''}`);
              }}
            >
              <ListVideo className="mr-2 h-4 w-4" /> Add to queue
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                const res = await saveToWatchLater(id);
                if (res.status === 'signed-out') toast('Sign in to save videos');
                else if (res.status === 'error') toast.error(res.message);
                else if (res.status === 'already')
                  showSavedToast({ label: 'Already in Watch later', thumbUrl, playlistId: res.playlistId });
                else showSavedToast({ label: 'Saved to Watch later', thumbUrl, playlistId: res.playlistId });
              }}
            >
              <Clock className="mr-2 h-4 w-4" /> Save to Watch later
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPlaylistOpen(true)}>
              <Bookmark className="mr-2 h-4 w-4" /> Save to playlist
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => setShareOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SaveToPlaylistDialog open={playlistOpen} onOpenChange={setPlaylistOpen} videoId={id} videoThumbUrl={thumbUrl} />
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        title={title}
      />
    </motion.div>
  );
}
