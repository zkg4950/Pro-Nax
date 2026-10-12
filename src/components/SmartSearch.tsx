/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Clock, TrendingUp, X, SlidersHorizontal, Loader2, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/loose';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const TRENDING = ['ai shorts', 'gaming', 'lofi beats', 'cricket highlights', 'react tutorial', 'cooking', 'travel vlog', 'tech review'];
const RECENT_KEY = 'pronax_recent_searches';

type Filters = {
  date: 'any' | 'today' | 'week' | 'month' | 'year';
  length: 'any' | 'short' | 'medium' | 'long';
  quality: 'any' | '4k' | 'hd' | 'sd';
  sort: 'relevance' | 'views' | 'date';
};

const DEFAULT_FILTERS: Filters = { date: 'any', length: 'any', quality: 'any', sort: 'relevance' };

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(q: string) {
  const cur = loadRecent().filter((x) => x !== q);
  cur.unshift(q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 8)));
}

export function SmartSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<Array<{ id: string; title: string; thumb_url: string | null; category: string | null; views_count: number | null; owner_id: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const startVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Voice search unavailable', { description: 'Your browser does not support Speech Recognition.' }); return; }
    try {
      if (recogRef.current) { recogRef.current.stop(); }
      const r = new SR();
      r.lang = 'en-US'; r.interimResults = true; r.continuous = false;
      r.onstart = () => { setListening(true); toast('Listening…', { description: 'Speak now', icon: '🎙️' }); };
      r.onresult = (ev: any) => {
        const text = Array.from(ev.results).map((x: any) => x[0].transcript).join(' ');
        setQ(text);
      };
      r.onerror = () => { setListening(false); toast.error('Voice error'); };
      r.onend = () => setListening(false);
      recogRef.current = r; r.start();
    } catch { setListening(false); }
  };
  const stopVoice = () => { try { recogRef.current?.stop(); } catch { /* noop */ } setListening(false); };

  useEffect(() => { setRecent(loadRecent()); }, [open]);

  // Live search with debounce
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      // Full-text ranked suggestions via search_videos_suggest RPC
      const { data: sug } = await supabase.rpc('search_videos_suggest', { p_q: q.trim(), p_limit: 12 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let list: Array<{ id: string; title: string; thumb_url: string | null; category: string | null; views_count: number | null; owner_id: string; created_at: string }> = Array.isArray(sug) ? sug.map((r: any) => ({
        id: r.id, title: r.title, thumb_url: r.thumb_url, category: r.category,
        views_count: r.views_count, owner_id: r.owner_id, created_at: new Date().toISOString(),
      })) : [];

      // Client-side filter refinements
      if (filters.date !== 'any' && list.length) {
        const map: Record<string, number> = { today: 1, week: 7, month: 30, year: 365 };
        const since = Date.now() - map[filters.date] * 86400000;
        list = list.filter((r) => new Date(r.created_at).getTime() >= since);
      }
      if (filters.sort === 'views') list = [...list].sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0));
      else if (filters.sort === 'date') list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      setResults(list);
      setLoading(false);
    }, 220);
    return () => clearTimeout(handle);
  }, [q, filters, open]);


  const activeFilterCount = useMemo(() =>
    Object.entries(filters).filter(([k, v]) => v !== (DEFAULT_FILTERS as Filters)[k]).length, [filters]);

  const go = (term: string) => {
    if (!term.trim()) return;
    pushRecent(term.trim());
    setOpen(false);
    setQ('');
    nav({
      to: '/search',
      search: { q: term.trim() } as never,
    });
  };

  const openVideo = (id: string) => {
    if (q.trim()) pushRecent(q.trim());
    setOpen(false);
    nav({
      to: '/watch/$id',
      params: { id },
    });
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 60); }}
        className="group relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-white transition-all duration-300 w-full backdrop-blur-xl bg-gradient-to-r from-primary/10 via-secondary/5 to-accent/10 border border-primary/25 hover:border-primary/60 shadow-[inset_0_1px_0_hsla(190,100%,90%,0.15),0_4px_20px_-6px_hsl(var(--glow-primary)/0.35)] hover:shadow-[inset_0_1px_0_hsla(190,100%,90%,0.2),0_6px_28px_-6px_hsl(var(--glow-primary)/0.6)]"
      >
        <Search className="w-4 h-4 text-primary drop-shadow-[0_0_6px_hsl(var(--glow-primary))]" />
        <span className="truncate tracking-wide">Search videos…</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-start justify-center pt-16 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl glass-strong rounded-2xl border border-border/40 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Search row */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
              <Search className="w-4 h-4 text-primary" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && go(q)}
                placeholder="Type to search live…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
              {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              <button
                type="button"
                onClick={listening ? stopVoice : startVoice}
                title={listening ? 'Stop listening' : 'Voice search'}
                className={`relative p-1.5 rounded-md transition ${listening ? 'text-primary' : 'hover:bg-muted/40'}`}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {listening && (
                  <span className="absolute inset-0 rounded-md ring-2 ring-primary/70 animate-ping" />
                )}
              </button>
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <button className="relative p-1.5 rounded-md hover:bg-muted/40">
                    <SlidersHorizontal className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">{activeFilterCount}</span>
                    )}
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="glass-strong border-l border-border/40">
                  <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
                  <div className="mt-6 space-y-6 text-sm">
                    <FilterGroup label="Upload Date" value={filters.date} onChange={(v) => setFilters({ ...filters, date: v as any })}
                      opts={[['any','Any time'],['today','Today'],['week','This week'],['month','This month'],['year','This year']]} />
                    <FilterGroup label="Length" value={filters.length} onChange={(v) => setFilters({ ...filters, length: v as any })}
                      opts={[['any','Any'],['short','Under 4 min'],['medium','4–20 min'],['long','Over 20 min']]} />
                    <FilterGroup label="Quality" value={filters.quality} onChange={(v) => setFilters({ ...filters, quality: v as any })}
                      opts={[['any','Any'],['4k','4K'],['hd','HD'],['sd','SD']]} />
                    <FilterGroup label="Sort by" value={filters.sort} onChange={(v) => setFilters({ ...filters, sort: v as any })}
                      opts={[['relevance','Relevance'],['date','Upload date'],['views','View count']]} />
                    <Button variant="outline" className="w-full" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</Button>
                  </div>
                </SheetContent>
              </Sheet>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted/40"><X className="w-4 h-4" /></button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {/* Live results */}
              {q.trim() && (
                <div className="p-3">
                  {results.length === 0 && !loading && (
                    <p className="text-xs text-muted-foreground px-3 py-6 text-center">No matches yet — keep typing.</p>
                  )}
                  {results.map((r) => (
                    <button key={r.id} onClick={() => openVideo(r.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 text-left transition">
                      <div className="w-20 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                        {r.thumb_url && <img src={r.thumb_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(r.views_count ?? 0).toLocaleString()} views · {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!q.trim() && (
                <div className="p-4 space-y-5">
                  {recent.length > 0 && (
                    <section>
                      <h4 className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                        <Clock className="w-3 h-3" /> Recent
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {recent.map((r) => (
                          <button key={r} onClick={() => go(r)} className="glass px-3 py-1 rounded-full text-xs hover:border-primary/50 hover:text-primary transition">{r}</button>
                        ))}
                      </div>
                    </section>
                  )}
                  <section>
                    <h4 className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                      <TrendingUp className="w-3 h-3" /> Trending
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {TRENDING.map((t) => (
                        <button key={t} onClick={() => go(t)} className="glass px-3 py-1 rounded-full text-xs hover:border-secondary/50 hover:text-secondary transition">#{t}</button>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterGroup({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <RadioGroup value={value} onValueChange={onChange} className="mt-2 space-y-1">
        {opts.map(([v, l]) => (
          <div key={v} className="flex items-center gap-2">
            <RadioGroupItem value={v} id={`${label}-${v}`} />
            <Label htmlFor={`${label}-${v}`} className="text-sm font-normal cursor-pointer">{l}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
