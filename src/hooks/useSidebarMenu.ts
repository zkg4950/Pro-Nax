/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useState } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/loose';
import type { SupabaseClient } from '@supabase/supabase-js';
const supabase = _supabase as SupabaseClient<any, any, any>;

export type SidebarItem = {
  id: string;
  label: string;
  path: string;
  icon: string | null;
  position: number;
  section: string;
  enabled: boolean;
  external: boolean;
  requires_auth: boolean;
};

export function useSidebarMenu(section = 'sidebar') {
  const [items, setItems] = useState<SidebarItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('sidebar_menu')
        .select('id,label,icon,href,section,position,enabled')
        .eq('section', section)
        .eq('enabled', true)
        .order('position', { ascending: true });
      if (!alive) return;
      setItems((data ?? []) as unknown as SidebarItem[]);
      setLoaded(true);
    };
    load();
    const ch = supabase
      .channel(`sidebar:${section}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sidebar_menu' }, load)
      .subscribe();
    return () => { alive = false; try { supabase.removeChannel(ch); } catch { /* noop */ } };
  }, [section]);

  return { items, loaded };
}
