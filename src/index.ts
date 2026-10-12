// ProNax main entry point
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const pronax = {
  auth: {
    signInWithOAuth: async (provider: any, opts?: SignInOptions) => {
      // OAuth authentication via Supabase
      return { error: new Error("OAuth authentication via Supabase") };
    },
  },
};
