/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAdminContext } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/_admin")({
  beforeLoad: async () => {
    try {
      // Temporary development bypass - REMOVE IN PRODUCTION
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.warn('[Admin Route] Development mode: Bypassing admin check');
        return {
          isAdmin: true,
          isModerator: true,
          isSupport: true,
          userId: 'dev-user',
        };
      }

      const adminContext = await getAdminContext();
      if (!adminContext.isAdmin && !adminContext.isModerator) {
        throw redirect({ to: "/" });
      }
      return adminContext;
    } catch (error) {
      // If there's any error (including auth errors), redirect to home
      console.error('[Admin Route] Error:', error);
      throw redirect({ to: "/" });
    }
  },
});
