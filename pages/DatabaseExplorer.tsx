
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Search, Play, Table as TableIcon, Loader2, AlertCircle, Plus, X, Terminal, Code, Trash2, Download, Upload, MoreHorizontal, Copy, Edit, CheckSquare, Square, CheckCircle2, Calendar, Wand2 } from 'lucide-react';

const DatabaseExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'query'>('tables');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // UI Controls
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [selectedRows, setSelectedRows] = useState<Set<any>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return response.json();
  }, []);

  const fetchTableDetails = async (tableName: string) => {
    setLoading(true);
    try {
      const [data, rawCols, uiSettings] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/tables/${tableName}/data`),
        fetchWithAuth(`/api/data/${projectId}/tables/${tableName}/columns`),
        fetchWithAuth(`/api/data/${projectId}/ui-settings/${tableName}`)
      ]);
      setTableData(data);
      setColumns(rawCols);
      
      const allColNames = rawCols.map((c: any) => c.name);
      const savedOrder = uiSettings.columnOrder || [];
      const finalOrder = savedOrder.length > 0 
        ? [...savedOrder.filter((c: string) => allColNames.includes(c)), ...allColNames.filter((c: string) => !savedOrder.includes(c))]
        : allColNames;
        
      setColOrder(finalOrder);
      setColWidths(uiSettings.columnWidths || {});
    } finally { setLoading(false); }
  };

  const handleResizeStart = (e: React.MouseEvent, colName: string) => {
    e.stopPropagation();
    setIsResizing(true);
    resizingRef.current = {
      col: colName,
      startX: e.pageX,
      startWidth: colWidths[colName] || 200
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = moveEvent.pageX - resizingRef.current.startX;
      const newWidth = Math.max(80, resizingRef.current.startWidth + delta);
      setColWidths(prev => ({ ...prev, [resizingRef.current!.col]: newWidth }));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      saveUISettings(colOrder, colWidths);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const saveUISettings = async (newOrder: string[], newWidths: Record<string, number>) => {
    if (!selectedTable) return;
    await fetchWithAuth(`/api/data/${projectId}/ui-settings/${selectedTable}`, {
      method: 'POST',
      body: JSON.stringify({ settings: { columnOrder: newOrder, columnWidths: newWidths } })
    });
  };

  const handleExport = (format: 'csv' | 'sql') => {
    if (!selectedTable) return;
    
    // Filtro de linhas: se houver seleção, exporta apenas selecionadas.
    const pkCol = columns.find(c => c.isPrimaryKey)?.name || columns[0]?.name;
    const dataToExport = selectedRows.size > 0 
      ? tableData.filter(row => selectedRows.has(row[pkCol]))
      : tableData;

    const header = colOrder.join(',');
    const rows = dataToExport.map(row => colOrder.map(col => String(row[col] || '')).join(','));
    const csvContent = [header, ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable}_${selectedRows.size > 0 ? 'selected' : 'all'}.csv`;
    a.click();
    setSuccessMsg(`Exported ${dataToExport.length} rows.`);
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  useEffect(() => { 
    const fetchTables = async () => {
      const data = await fetchWithAuth(`/api/data/${projectId}/tables`);
      setTables(data);
      if (data.length > 0 && !selectedTable) setSelectedTable(data[0].name);
    };
    fetchTables();
  }, [projectId]);

  useEffect(() => { if (selectedTable) fetchTableDetails(selectedTable); }, [selectedTable]);

  const orderedColumns = colOrder.map(name => columns.find(c => c.name === name)).filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-[#FDFDFD]">
      <header className="border-b border-slate-200 px-10 py-6 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl"><Database size={24} /></div>
          <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter">Instance Explorer</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em]">{projectId}</p></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setActiveTab('tables')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'tables' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>DATA BROWSER</button>
            <button onClick={() => setActiveTab('query')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'query' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>SQL TERMINAL</button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-6">
            <div className="relative group"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input placeholder="Search tables..." className="w-full pl-12 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none" /></div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-1">
            {tables.map(t => (
              <button key={t.name} onClick={() => setSelectedTable(t.name)} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${selectedTable === t.name ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-50'}`}>
                <div className="flex items-center gap-4"><TableIcon size={18} /><span className="text-sm font-bold tracking-tight">{t.name}</span></div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col bg-[#FAFBFC] relative">
          {(error || successMsg) && (
            <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 p-4 ${error ? 'bg-rose-600' : 'bg-emerald-600'} text-white text-xs font-bold rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4`}>
              {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {error || successMsg}
            </div>
          )}

          <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
            {selectedTable && (
              <div className="flex items-center gap-6">
                <h3 className="text-xl font-black text-slate-900 font-mono">public.{selectedTable}</h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">{tableData.length} ROWS</span>
              </div>
            )}
            <div className="flex gap-4">
              <button onClick={() => handleExport('csv')} className="bg-white text-slate-700 border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50">
                <Download size={14} /> EXPORT {selectedRows.size > 0 ? 'SELECTED' : 'ALL'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-10">
            {loading ? <div className="h-full flex items-center justify-center animate-pulse"><Loader2 size={40} className="animate-spin text-indigo-200" /></div> : (
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden inline-block min-w-full">
                <table className="table-fixed border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="w-16 px-6 py-6 border-r border-slate-100">
                        <button onClick={() => {
                          const pk = columns.find(c => c.isPrimaryKey)?.name || columns[0]?.name;
                          setSelectedRows(selectedRows.size === tableData.length ? new Set() : new Set(tableData.map(r => r[pk])));
                        }}>
                          {selectedRows.size === tableData.length ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} className="text-slate-300" />}
                        </button>
                      </th>
                      {orderedColumns.map(col => (
                        <th key={col.name} className="relative px-8 py-6 text-left border-r border-slate-100 last:border-r-0" style={{ width: colWidths[col.name] || 200 }}>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">{col.name}</span>
                            <span className="text-[9px] font-mono text-indigo-500 font-bold">{col.type}</span>
                          </div>
                          <div onMouseDown={(e) => handleResizeStart(e, col.name)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 group-hover:block" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableData.map((row, i) => {
                      const pk = columns.find(c => c.isPrimaryKey)?.name || columns[0]?.name;
                      const isSelected = selectedRows.has(row[pk]);
                      return (
                        <tr key={i} className={`hover:bg-indigo-50/20 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}>
                          <td className="px-6 py-5 text-center border-r border-slate-100">
                            <button onClick={() => {
                              const next = new Set(selectedRows);
                              isSelected ? next.delete(row[pk]) : next.add(row[pk]);
                              setSelectedRows(next);
                            }}>
                              {isSelected ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} className="text-slate-200" />}
                            </button>
                          </td>
                          {orderedColumns.map(col => (
                            <td key={col.name} className="px-8 py-5 text-xs font-mono text-slate-600 truncate border-r border-slate-100 last:border-r-0">
                              {row[col.name] === null ? <span className="text-slate-200 italic">null</span> : String(row[col.name])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DatabaseExplorer;
