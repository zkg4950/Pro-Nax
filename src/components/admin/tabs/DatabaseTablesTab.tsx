/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Table, Search, Plus, Edit, Trash2, RefreshCw, Eye,
  Code, Settings, ChevronRight, ChevronDown, Filter, Download,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Key, Type,
  Columns, Rows, Clock, FileText, Play, Save, X
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/loose';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = _supabase;

// Core tables that should be manageable
const CORE_TABLES = [
  'profiles', 'videos', 'video_comments', 'video_reports', 'video_likes',
  'video_shares', 'video_saves', 'video_views', 'video_downloads',
  'user_roles', 'super_admins', 'blocked_users', 'user_strikes',
  'copyright_claims', 'copyright_fingerprints', 'audio_fingerprints',
  'moderation_queue', 'moderation_settings', 'categories',
  'notifications', 'messages', 'conversations', 'reports',
  'wallet_transactions', 'user_wallets', 'withdrawal_requests',
  'creator_earnings', 'algorithm_audit_log', 'audit_logs',
  'app_settings', 'system_config', 'feature_flags'
];

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: string;
}

interface TableData {
  columns: TableColumn[];
  rows: any[];
  totalRows: number;
}

export function DatabaseTablesTab() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'data' | 'structure' | 'sql'>('data');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlResults, setSqlResults] = useState<any[] | null>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [showTableList, setShowTableList] = useState(true);

  // Load table structure and data
  const loadTableData = useCallback(async (tableName: string) => {
    setLoading(true);
    try {
      // Get table structure via PostgreSQL information schema
      const { data: columns, error: colError } = await supabase.rpc('admin_get_table_structure', {
        p_table_name: tableName
      });

      if (colError) {
        console.error('Error loading table structure:', colError);
        // Fallback: use direct query
        const { data: schemaData } = await supabase
          .from('information_schema.columns')
          .select('column_name, data_type, is_nullable, column_default')
          .eq('table_name', tableName)
          .eq('table_schema', 'public')
          .order('ordinal_position');

        const formattedColumns: TableColumn[] = (schemaData || []).map((col: any) => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          default: col.column_default,
          isPrimaryKey: col.column_name === 'id',
          isForeignKey: false
        }));

        // Load data
        const { data: rows, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('created_at', { ascending: false, nullsFirst: false });

        setTableData({
          columns: formattedColumns,
          rows: rows || [],
          totalRows: count || 0
        });
      } else {
        // Load data
        const { data: rows, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('created_at', { ascending: false, nullsFirst: false });

        setTableData({
          columns: columns || [],
          rows: rows || [],
          totalRows: count || 0
        });
      }
    } catch (error) {
      console.error('Error loading table data:', error);
      toast.error('Failed to load table data');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  // Refresh current table
  const refreshTable = useCallback(() => {
    if (selectedTable) {
      loadTableData(selectedTable);
    }
  }, [selectedTable, loadTableData]);

  // Handle table selection
  const handleTableSelect = useCallback((tableName: string) => {
    setSelectedTable(tableName);
    setShowTableList(false);
    setPage(0);
    loadTableData(tableName);
  }, [loadTableData]);

  // Handle row deletion
  const handleDeleteRow = useCallback(async (rowId: string) => {
    if (!selectedTable) return;

    if (!confirm(`Are you sure you want to delete this row from ${selectedTable}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from(selectedTable)
        .delete()
        .eq('id', rowId);

      if (error) throw error;

      toast.success('Row deleted successfully');
      refreshTable();
    } catch (error: any) {
      console.error('Error deleting row:', error);
      toast.error(error.message || 'Failed to delete row');
    }
  }, [selectedTable, refreshTable]);

  // Handle row update
  const handleUpdateRow = useCallback(async () => {
    if (!selectedTable || !editingRow) return;

    const row = tableData?.rows[editingRow];
    if (!row) return;

    try {
      const { error } = await supabase
        .from(selectedTable)
        .update(editData)
        .eq('id', row.id);

      if (error) throw error;

      toast.success('Row updated successfully');
      setEditingRow(null);
      setEditData({});
      refreshTable();
    } catch (error: any) {
      console.error('Error updating row:', error);
      toast.error(error.message || 'Failed to update row');
    }
  }, [selectedTable, editingRow, editData, tableData, refreshTable]);

  // Handle SQL query execution
  const handleExecuteSQL = useCallback(async () => {
    if (!sqlQuery.trim()) return;

    setSqlLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_execute_sql', {
        p_query: sqlQuery
      });

      if (error) throw error;

      setSqlResults(data || []);
      toast.success('Query executed successfully');
    } catch (error: any) {
      console.error('Error executing SQL:', error);
      toast.error(error.message || 'Failed to execute SQL');
    } finally {
      setSqlLoading(false);
    }
  }, [sqlQuery]);

  // Export table data
  const handleExport = useCallback(async () => {
    if (!selectedTable) return;

    try {
      const { data } = await supabase
        .from(selectedTable)
        .select('*')
        .limit(10000);

      if (!data) return;

      const csv = [
        tableData?.columns.map(c => c.name).join(','),
        ...data.map(row => tableData?.columns.map(c => row[c.name]).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTable}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Table exported successfully');
    } catch (error: any) {
      console.error('Error exporting table:', error);
      toast.error(error.message || 'Failed to export table');
    }
  }, [selectedTable, tableData]);

  // Initialize with first table
  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable);
    }
  }, [selectedTable, page, pageSize, loadTableData]);

  const filteredRows = useMemo(() => {
    if (!searchQuery || !tableData) return tableData.rows;

    const query = searchQuery.toLowerCase();
    return tableData.rows.filter(row =>
      Object.values(row).some(val =>
        String(val).toLowerCase().includes(query)
      )
    );
  }, [searchQuery, tableData]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTableList(!showTableList)}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
          >
            <Database className="w-5 h-5 text-cyan-400" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-white">Database Tables</h2>
            <p className="text-xs text-zinc-400">
              {selectedTable ? `Editing: ${selectedTable}` : 'Select a table to manage'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
            {(['data', 'structure', 'sql'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition ${
                  viewMode === mode
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {mode === 'data' && <Table className="w-3.5 h-3.5 inline mr-1" />}
                {mode === 'structure' && <Columns className="w-3.5 h-3.5 inline mr-1" />}
                {mode === 'sql' && <Code className="w-3.5 h-3.5 inline mr-1" />}
                {mode}
              </button>
            ))}
          </div>

          {selectedTable && (
            <>
              <button
                onClick={refreshTable}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                onClick={handleExport}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
                title="Export CSV"
              >
                <Download className="w-4 h-4 text-zinc-400" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table List Sidebar */}
      <AnimatePresence>
        {showTableList && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-64 bg-[#0b0e14]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search tables..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto custom-scrollbar">
              {CORE_TABLES.filter(table =>
                table.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(table => (
                <button
                  key={table}
                  onClick={() => handleTableSelect(table)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition ${
                    selectedTable === table
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  <span className="text-xs font-medium">{table}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      {selectedTable && tableData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Data View */}
          {viewMode === 'data' && (
            <>
              {/* Search & Filter */}
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search in table..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#121722]/80 border border-white/10 focus:border-cyan-500/60 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-zinc-500 outline-none transition"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Rows className="w-4 h-4" />
                  <span>{tableData.totalRows} rows</span>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-[#0b0e14]/80 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
                        {tableData.columns.map(col => (
                          <th key={col.name} className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            <div className="flex items-center gap-1">
                              {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-400" />}
                              {col.name}
                              <Type className="w-3 h-3 text-zinc-500" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={tableData.columns.length + 1} className="px-4 py-20 text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                          </td>
                        </tr>
                      ) : filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={tableData.columns.length + 1} className="px-4 py-20 text-center text-zinc-500 text-xs">
                            No data found
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, rowIndex) => (
                          <tr key={row.id || rowIndex} className="border-b border-white/5 hover:bg-white/5 transition">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingRow(rowIndex);
                                    setEditData(row);
                                  }}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition"
                                  title="Edit"
                                >
                                  <Edit className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </button>
                              </div>
                            </td>
                            {tableData.columns.map(col => (
                              <td key={col.name} className="px-4 py-3 whitespace-nowrap">
                                {editingRow === rowIndex ? (
                                  <input
                                    type="text"
                                    value={editData[col.name] || ''}
                                    onChange={(e) => setEditData({ ...editData, [col.name]: e.target.value })}
                                    className="w-full bg-[#121722] border border-cyan-500/30 rounded px-2 py-1 text-xs text-white outline-none"
                                  />
                                ) : (
                                  <span className="text-xs text-zinc-300">
                                    {row[col.name] === null ? (
                                      <span className="text-zinc-600 italic">null</span>
                                    ) : typeof row[col.name] === 'object' ? (
                                      <span className="text-zinc-500 italic">[object]</span>
                                    ) : String(row[col.name]).length > 50 ? (
                                      String(row[col.name]).substring(0, 50) + '...'
                                    ) : (
                                      String(row[col.name])
                                    )}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                  <div className="text-xs text-zinc-400">
                    Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, tableData.totalRows)} of {tableData.totalRows}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-zinc-400">Page {page + 1}</span>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * pageSize >= tableData.totalRows}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Edit Actions */}
                {editingRow !== null && (
                  <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 bg-cyan-500/5">
                    <button
                      onClick={() => {
                        setEditingRow(null);
                        setEditData({});
                      }}
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-400 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateRow}
                      className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-xs font-semibold text-black transition"
                    >
                      Save Changes
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Structure View */}
          {viewMode === 'structure' && (
            <div className="bg-[#0b0e14]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Columns className="w-4 h-4 text-cyan-400" />
                Table Structure: {selectedTable}
              </h3>
              <div className="space-y-2">
                {tableData.columns.map(col => (
                  <div key={col.name} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 flex-1">
                      {col.isPrimaryKey && <Key className="w-4 h-4 text-amber-400" />}
                      {col.isForeignKey && <AlertTriangle className="w-4 h-4 text-purple-400" />}
                      <span className="text-sm font-medium text-white">{col.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Type className="w-3.5 h-3.5" />
                      <span className="font-mono">{col.type}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {col.nullable ? (
                        <span className="px-2 py-0.5 rounded bg-zinc-500/20 text-zinc-400">NULLABLE</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">NOT NULL</span>
                      )}
                    </div>
                    {col.default && (
                      <div className="text-xs text-zinc-500 font-mono">
                        default: {col.default}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SQL Query View */}
          {viewMode === 'sql' && (
            <div className="bg-[#0b0e14]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code className="w-4 h-4 text-cyan-400" />
                SQL Query Executor
              </h3>
              <div className="space-y-2">
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter SQL query..."
                  className="w-full h-40 bg-[#121722] border border-white/10 focus:border-cyan-500/60 rounded-xl p-4 text-xs text-white font-mono placeholder:text-zinc-500 outline-none transition resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setSqlQuery('')}
                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-400 transition"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleExecuteSQL}
                    disabled={sqlLoading || !sqlQuery.trim()}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-xs font-semibold text-black transition disabled:opacity-40 flex items-center gap-2"
                  >
                    {sqlLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Execute
                  </button>
                </div>
              </div>

              {/* SQL Results */}
              {sqlResults && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-400">Results</h4>
                  <div className="bg-[#121722] rounded-xl p-4 max-h-96 overflow-auto custom-scrollbar">
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">
                      {JSON.stringify(sqlResults, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {!selectedTable && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Database className="w-16 h-16 text-zinc-600 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Select a Table</h3>
          <p className="text-sm text-zinc-400">Choose a table from the list to view and manage its data</p>
        </div>
      )}
    </div>
  );
}
