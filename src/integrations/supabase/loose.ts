/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
// Typed re-export of the Supabase client.
// Historically this module widened the client to `any` so ported pages could
// call tables/RPCs missing from the generated types. The generated `Database`
// type now covers the full schema, so this is a plain typed re-export.
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Several optional product modules are newer than the generated schema snapshot.
// Keep this compatibility client widened until the next full type generation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> = typedSupabase as unknown as SupabaseClient<any>;
export default supabase;

// Widened client for schema added after the last type generation (messaging, privacy, presence).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseAny: SupabaseClient<any> = typedSupabase as unknown as SupabaseClient<any>;
