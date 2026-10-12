/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useStudioData } from './useStudioData';
import { useAuthSession } from '@/hooks/useAuthSession';

export function useStudio() {
  const { user } = useAuthSession();
  const studioData = useStudioData(user?.id);
  
  return {
    ...studioData,
    profile: studioData.profile,
    wallet: studioData.wallet,
    analytics: studioData.analytics,
  };
}
