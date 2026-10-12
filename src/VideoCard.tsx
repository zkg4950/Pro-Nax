/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { motion } from 'framer-motion';
import { useNavigate } from '@/lib/router-compat';
import { CheckCircle2, MoreVertical } from 'lucide-react';

interface VideoCardProps {
  id: string;
  title: string;
  channel: string;
  views: string;
  time: string;
  thumbnail?: string;
  duration: string;
  monetized?: boolean;
  channelAvatar?: string;
  layout?: 'grid' | 'list';
  is_short?: boolean;
}

export function VideoCard({
  id,
  title,
  channel,
  views,
  time,
  thumbnail,
  duration,
  monetized = true,
  channelAvatar,
  layout = 'grid',
  is_short = false,
}: VideoCardProps) {
  const navigate = useNavigate();

  const initials = channel
    ? channel.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'PN';

  const handleClick = () => {
    navigate(is_short ? `/shorts/${id}` : `/watch/${id}`);
  };

  /* ---------------- LIST LAYOUT (Search / Sidebar) ---------------- */
  if (layout === 'list') {
    return (
      <div
        onClick={handleClick}
        className="group flex w-full cursor-pointer gap-3 px-3 py-1.5 active:bg-white/5 transition-colors"
      >
        <div className="relative aspect-video w-36 sm:w-40 shrink-0 overflow-hidden rounded-xl bg-neutral-900">
          {thumbnail && (
            <img
              src={thumbnail}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-semibold text-white">
            {duration}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-start pt-0.5">
          <h3 className="line-clamp-2 text-xs font-medium leading-tight text-white">
            {title}
          </h3>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-neutral-400">
            <span className="truncate">@{channel.replace(/\s+/g, '')}</span>
            {monetized && (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-cyan-400 fill-cyan-400/20" />
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
            <span>{views} views</span>
            <span>•</span>
            <span>{time}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- GRID LAYOUT (Authentic ProNax Mobile Style) ---------------- */
  return (
    <div
      onClick={handleClick}
      className="group w-full cursor-pointer mb-3 active:opacity-90 transition-opacity v3d-stage"
    >
      {/* Thumbnail: full-bleed on mobile, elevated card on larger screens */}
      <div className="px-0 sm:px-0">
        <div className="v3d-thumb relative aspect-video w-full overflow-hidden rounded-none sm:rounded-2xl bg-neutral-900">
          {thumbnail && (
            <img
              src={thumbnail}
              alt={title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* Duration badge */}
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 backdrop-blur-xs px-1.5 py-0.5 text-[11px] font-medium text-white">
            {duration}
          </span>
        </div>
      </div>

      {/* Metadata Row: Avatar + Title + Meta + 3 Dots */}
      <div className="flex gap-3 px-3 pt-2.5 items-start">
        {/* Channel Avatar */}
        <div className="shrink-0 pt-0.5">
          {channelAvatar ? (
            <img
              src={channelAvatar}
              alt={channel}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-bold text-white">
              {initials}
            </div>
          )}
        </div>

        {/* Title & Stats */}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-normal leading-[18px] text-white">
            {title}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[12px] text-neutral-400 leading-none">
            <span className="truncate">@{channel.replace(/\s+/g, '')}</span>
            {monetized && (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-cyan-400 fill-cyan-400/20" />
            )}
            <span>•</span>
            <span>{views} views</span>
            <span>•</span>
            <span>{time}</span>
          </div>
        </div>

        {/* ProNax Style 3-Dots Menu Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="shrink-0 p-1 text-neutral-400 hover:text-white rounded-full active:bg-white/10"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}