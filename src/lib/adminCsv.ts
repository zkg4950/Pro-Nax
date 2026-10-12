/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. */
/**
 * Minimal CSV export helper for admin list toolbars.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(filename: string, rows: Row[], columns?: string[]): void {
  if (!rows.length) return;
  const cols = columns && columns.length ? columns : Object.keys(rows[0]);
  const header = cols.join(',');
  const lines = rows.map((row) => cols.map((c) => escapeCsvCell(row[c])).join(','));
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
