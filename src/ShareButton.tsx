/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState } from "react";
import { toast } from "sonner";

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  className?: string;
  variant?: 'default' | 'pronax';
  shareCount?: number;
  onShareClick?: () => void;
  formatCount?: (n: number) => string;
  shortId?: string;
}

export default function ShareButton({ title, text, url, className, variant = 'default', shareCount, onShareClick, formatCount, shortId }: ShareButtonProps) {
  const [shared, setShared] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const success = document.execCommand("copy");
      if (!success) throw new Error("execCommand copy failed");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: title,
      text: text || "Check this out",
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard(shareUrl);
        toast.success("Link copied to clipboard");
      }
      
      if (onShareClick) {
        onShareClick();
      }
      
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this link");
    }
  };

  const defaultFormatCount = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  if (variant === 'pronax') {
    const countFormatter = formatCount || defaultFormatCount;

    return (
      <button
        onClick={handleShare}
        aria-label="Share"
        className="flex flex-col items-center gap-1 group transition-transform active:scale-90 relative bg-transparent"
      >
        <div className="relative drop-shadow-lg">
          <div className="relative">
            <svg
              viewBox="0 0 48 48"
              aria-hidden="true"
              className="size-8 fill-white text-white"
            >
              <path
                fill="currentColor"
                d="M41.1 20.1 27.4 8.8a2 2 0 0 0-3.3 1.5v5.4C12.6 16.8 7 23.7 6.5 35.4c0 1.5 1.8 2.2 2.8 1.1 4.3-4.7 8.4-7.2 14.8-7.5v5.2a2 2 0 0 0 3.3 1.5l13.7-11.3a2.8 2.8 0 0 0 0-4.3Z"
              />
            </svg>
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-full blur-sm" />
          </div>
        </div>
        <span aria-live="polite" className="min-h-5 text-xs font-semibold text-white/90 drop-shadow-md">
          {shared ? "Copied" : (shareCount !== undefined ? countFormatter(shareCount) : 'Share')}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      aria-label="Share"
      className={
        className ||
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-sm hover:bg-secondary transition-colors"
      }
    >
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="size-4"
      >
        <path
          fill="currentColor"
          d="M41.1 20.1 27.4 8.8a2 2 0 0 0-3.3 1.5v5.4C12.6 16.8 7 23.7 6.5 35.4c0 1.5 1.8 2.2 2.8 1.1 4.3-4.7 8.4-7.2 14.8-7.5v5.2a2 2 0 0 0 3.3 1.5l13.7-11.3a2.8 2.8 0 0 0 0-4.3Z"
        />
      </svg>
      Share
    </button>
  );
}
