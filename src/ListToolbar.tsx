/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. */
/**
 * Shared toolbar + pagination footer for every admin list.
 * Search, page-size selector, total count and CSV export (current filter).
 */
import { useState, type ReactNode } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import { PAGE_SIZES, EXPORT_MAX, type AdminList } from '@/useAdminList';
import { downloadCsv } from '@/lib/adminCsv';
import { toast } from 'sonner';

type Props = {
  list: AdminList;
  /** Base filename for the CSV export. */
  exportName: string;
  exportColumns?: string[];
  placeholder?: string;
  /** Extra filter controls rendered inline. */
  children?: ReactNode;
  searchable?: boolean;
};

export function ListToolbar({ list, exportName, exportColumns, placeholder = 'Search…', children, searchable = true }: Props) {
  const [exporting, setExporting] = useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      const rows = await list.fetchAllForExport();
      if (!rows.length) { toast.info('Nothing to export for the current filter'); return; }
      downloadCsv(exportName, rows, exportColumns);
      toast.success(`Exported ${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}${rows.length >= EXPORT_MAX ? ` (capped at ${EXPORT_MAX.toLocaleString()})` : ''}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {searchable && (
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full glass border border-border/40 rounded-xl pl-9 pr-8 py-2 text-xs outline-none focus:border-primary/50 transition"
          />
          {list.search && (
            <button
              onClick={() => list.setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {children}

      <select
        value={list.pageSize}
        onChange={(e) => list.setPageSize(Number(e.target.value))}
        aria-label="Rows per page"
        className="glass border border-border/40 rounded-xl px-2.5 py-2 text-xs outline-none focus:border-primary/50"
      >
        {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
      </select>

      <button
        onClick={() => void list.reload()}
        aria-label="Refresh"
        className="glass border border-border/40 rounded-xl p-2 hover:border-primary/40 transition"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${list.loading ? 'animate-spin' : ''}`} />
      </button>

      <button
        onClick={() => void doExport()}
        disabled={exporting}
        className="glass border border-border/40 rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 hover:border-primary/40 transition disabled:opacity-60"
      >
        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        CSV
      </button>
    </div>
  );
}

export function ListPager({ list }: { list: AdminList }) {
  const from = list.total === 0 ? 0 : list.page * list.pageSize + 1;
  const to = list.total === null
    ? list.page * list.pageSize + list.rows.length
    : Math.min((list.page + 1) * list.pageSize, list.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-3 border-t border-border/30">
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {list.total === null
          ? `${list.rows.length} rows`
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${list.total.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => list.setPage(Math.max(0, list.page - 1))}
          disabled={list.page === 0 || list.loading}
          aria-label="Previous page"
          className="glass border border-border/40 rounded-lg p-1.5 disabled:opacity-40 hover:border-primary/40 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] text-muted-foreground tabular-nums px-1">
          {list.page + 1} / {list.pageCount}
        </span>
        <button
          onClick={() => list.setPage(list.page + 1)}
          disabled={list.loading || list.page + 1 >= list.pageCount}
          aria-label="Next page"
          className="glass border border-border/40 rounded-lg p-1.5 disabled:opacity-40 hover:border-primary/40 transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
