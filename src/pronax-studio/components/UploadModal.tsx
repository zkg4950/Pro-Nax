/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import React from "react";
import { UploadModal as CommonUploadModal } from "@/components/UploadModal";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoFile?: File | null;
  onVideoChange?: (file: File | null) => void;
  onRefresh?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  videoFile,
  onVideoChange,
  onRefresh,
}) => {
  return (
    <CommonUploadModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          if (onVideoChange) onVideoChange(null);
        }
      }}
      videoFile={videoFile}
      onVideoChange={onVideoChange}
      onSuccess={(payload) => {
        // Refresh the actual video list from database instead of synthetic local state
        if (onRefresh) {
          onRefresh();
        }
        if (onVideoChange) onVideoChange(null);
      }}
    />
  );
};
