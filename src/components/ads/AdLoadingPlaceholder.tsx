/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import React from 'react';

interface AdLoadingPlaceholderProps {
  className?: string;
  placement?: string;
}

export const AdLoadingPlaceholder: React.FC<AdLoadingPlaceholderProps> = ({ 
  className = '', 
  placement 
}) => {
  return (
    <div 
      className={`relative aspect-video w-full overflow-hidden rounded-xl border border-white/5 bg-muted/20 ${className}`}
      data-ad-placement={placement}
      data-ad-loading="true"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground">Loading ad...</p>
        </div>
      </div>
    </div>
  );
};