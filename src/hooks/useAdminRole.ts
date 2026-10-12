/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { getAdminContext, type AdminContext } from '@/lib/admin.functions';
import { supabase } from '@/integrations/supabase/loose';

const EMPTY: AdminContext = { isAdmin: false, isModerator: false, isSupport: false, userId: null };

/**
 * Live admin/moderator role state for the signed-in user.
 * Re-evaluates whenever the auth session changes so nav links and
 * admin-only tabs never rely on hardcoded flags.
 */
export function useAdminRole() {
  const [ctx, setCtx] = useState<AdminContext>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      // Temporary development bypass - REMOVE IN PRODUCTION
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.warn('[useAdminRole] Development mode: Bypassing role check');
        if (!alive) return;
        setCtx({
          isAdmin: true,
          isModerator: true,
          isSupport: true,
          userId: 'dev-user',
        });
        setLoading(false);
        return;
      }

      const next = await getAdminContext();
      if (!alive) return;
      setCtx(next);
      setLoading(false);
    };
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return { ...ctx, loading, isStaff: ctx.isAdmin || ctx.isModerator || ctx.isSupport };
}
