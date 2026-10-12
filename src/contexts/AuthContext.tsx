/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { createContext, useContext, ReactNode, useCallback, useState, useEffect } from 'react';
import { useUnifiedAuth } from '@/lib/unified-auth';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any;
  session: any;
  loading: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ success: boolean; error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ success: boolean; error: string | null; needsVerification: boolean }>;
  signInWithGoogle: () => Promise<{ success: boolean; error: string | null }>;
  signOut: () => Promise<{ success: boolean; error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    authenticated,
    user,
    session,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
  } = useUnifiedAuth();
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openAuthModal = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const value: AuthContextType = {
    isAuthenticated: authenticated,
    user,
    session,
    loading,
    openAuthModal,
    closeAuthModal,
    isAuthModalOpen,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Alias for useAuth to maintain compatibility
 * This ensures all components use the same auth source
 */
export function useAuthSession() {
  return useAuth();
}