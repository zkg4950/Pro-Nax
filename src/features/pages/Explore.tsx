/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { Flame, TrendingUp, Sparkles, Loader2, PlayCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from '@/lib/router-compat';
import { supabase } from '@/integrations/supabase/loose';
import { FeedVideoCard } from '@/components/FeedVideoCard';

type V = {
  id: string;
  title: string;
  thumb_url: string | null;
  video_url: string | null;
  owner_id: string;
  created_at: string;
  views_count: number | null;
  duration_seconds: number | null;
  is_short: boolean | null;
  category: string | null;
  ownerName?: string;
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtDur(s: number | null) {
  if (!s || s <= 0) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

async function attachOwners(rows: V[]): Promise<V[]> {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((r) => r.owner_id))];
  const { data } = await supabase.from('profiles').select('id,display_name').in('id', ids);
  const map = new Map<string, string>((data ?? []).map((p: any) => [p.id, p.display_name || 'Creator']));
  return rows.map((r) => ({ ...r, ownerName: map.get(r.owner_id) || 'Creator' }));
}

export default function Explore() {
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<V[]>([]);
  const [fresh, setFresh] = useState<V[]>([]);
  const [shorts, setShorts] = useState<V[]>([]);

  // Load top + fresh + shorts (real data)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const baseSel = 'id,title,thumb_url,video_url,owner_id,created_at,views_count,duration_seconds,is_short,category';
      const [topRes, freshRes, shortsRes] = await Promise.all([
        supabase.from('videos').select(baseSel).eq('visibility', 'public').eq('status', 'ready').or('is_short.is.null,is_short.eq.false').order('views_count', { ascending: false }).limit(8),
        supabase.from('videos').select(baseSel).eq('visibility', 'public').eq('status', 'ready').or('is_short.is.null,is_short.eq.false').order('created_at', { ascending: false }).limit(8),
        supabase.from('videos').select(baseSel).eq('visibility', 'public').eq('status', 'ready').eq('is_short', true).order('views_count', { ascending: false }).limit(10),
      ]);
      if (cancelled) return;
      setTrending(await attachOwners((topRes.data as V[]) ?? []));
      setFresh(await attachOwners((freshRes.data as V[]) ?? []));
      setShorts(await attachOwners((shortsRes.data as V[]) ?? []));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex-1 min-h-screen px-4 pb-24 lg:pb-8">
      <div className="lg:px-6 py-6 space-y-10">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading explore…
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-4 h-4 text-rose-500 animate-pulse" />
                <h2 className="text-sm font-display font-bold uppercase tracking-wider text-foreground">
                  High-Level Trending on Pro Nax
                </h2>
              </div>
              {trending.length === 0
                ? <Empty msg="No videos yet — upload to be featured here." />
                : <Grid items={trending} />}
            </section>

            {shorts.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-display font-bold uppercase tracking-wider">Trending Shorts</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto no-scrollbar rail-gpu pb-2">
                  {shorts.map((s) => (
                    <Link key={s.id} to="/shorts" className="shrink-0 w-36 aspect-[9/16] rounded-xl overflow-hidden relative group card-vis" style={{ scrollSnapAlign: 'start' }}>
                      {s.thumb_url
                        ? <img src={s.thumb_url} alt={s.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition" />
                        : <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <PlayCircle className="absolute top-2 right-2 w-5 h-5 text-white/80" />
                      <p className="absolute bottom-2 left-2 right-2 text-[11px] text-white font-semibold line-clamp-2">{s.title}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-display font-bold uppercase tracking-wider">Fresh on Pro Nax</h2>
              </div>
              {fresh.length === 0
                ? <Empty msg="No new uploads yet." />
                : <Grid items={fresh} />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Grid({ items }: { items: V[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-3 mb-3 -mx-4 sm:mx-0">
      {items.map((v, i) => (
        <div key={v.id} className="card-vis relative">
          <FeedVideoCard
            id={String(v.id)}
            title={v.title}
            channel={v.ownerName || 'creator'}
            views={v.views_count ?? 0}
            timeText={timeAgo(v.created_at)}
            durationText={fmtDur(v.duration_seconds)}
            thumbUrl={v.thumb_url}
            index={i}
          />
        </div>
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-muted-foreground py-10 text-center">{msg}</p>;
}
