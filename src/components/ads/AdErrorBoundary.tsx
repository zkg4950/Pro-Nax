/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface AdErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  placement: string;
  onError?: (error: Error, errorInfo: ErrorInfo, placement: string) => void;
}

interface AdErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AdErrorBoundary extends Component<AdErrorBoundaryProps, AdErrorBoundaryState> {
  constructor(props: AdErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AdErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AdErrorBoundary] Error caught for placement:', this.props.placement, error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo, this.props.placement);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Fallback ad placeholder
      return (
        <div 
          className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/5 bg-muted/20 flex items-center justify-center"
          data-ad-placement={this.props.placement}
          data-ad-error="true"
        >
          <div className="text-center text-muted-foreground text-xs">
            <p>Advertisement unavailable</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}