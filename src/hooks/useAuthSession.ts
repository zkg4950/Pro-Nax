/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useAuth } from '@/contexts/AuthContext';

/**
 * Auth session hook that uses the global AuthContext
 * This ensures consistent session management across the entire application
 * All components now use the same auth source
 */
export function useAuthSession() {
  const auth = useAuth();
  
  return {
    session: auth.session,
    user: auth.user,
    loading: auth.loading,
    isAuthenticated: auth.isAuthenticated,
    openAuthModal: auth.openAuthModal,
    closeAuthModal: auth.closeAuthModal,
    isAuthModalOpen: auth.isAuthModalOpen,
    signOut: auth.signOut,
  };
}