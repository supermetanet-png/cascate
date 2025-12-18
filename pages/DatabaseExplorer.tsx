
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Search, Play, Table as TableIcon, Loader2, AlertCircle, Plus, X, Terminal, Code, Trash2, GripVertical } from 'lucide-react';

const DatabaseExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'query'>('tables');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('SELECT * FROM public.users LIMIT 10;');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateTable, setShowCreateTable] = useState(false);

  // Column State
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);
  const draggingRef = useRef<{ col: string } | null>(null);

  const [newTableName, setNewTableName] = useState('');
  const [newTableColumns, setNewTableColumns] = useState<any[]>([
    { name: 'id', type: 'uuid', primaryKey: true, nullable: false, default: 'gen_random_uuid()' },
    { name: 'created_at', type: 'timestamptz', primaryKey: false, nullable: false, default: 'now()' }
  ]);

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.status === 401) {
      localStorage.removeItem('cascata_token');
      window.location.hash = '#/login';
      throw new Error('Sessão expirada.');
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erro ${response.status}`);
    }
    return response.json();
  }, []);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await fetchWithAuth(`/api/data/${projectId}/tables`);
      setTables(data);
      if (data.length > 0 && !selectedTable) setSelectedTable(data[0].name);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchTableDetails = async (tableName: string) => {
    setLoading(true);
    setError(null);
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
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const saveUISettings = async (newOrder: string[], newWidths: Record<string, number>) => {
    if (!selectedTable) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/ui-settings/${selectedTable}`, {
        method: 'POST',
        body: JSON.stringify({ settings: { columnOrder: newOrder, columnWidths: newWidths } })
      });
    } catch (e) { console.error("UI persistence failure"); }
  };

  // Resize Logic
  const handleResizeStart = (e: React.MouseEvent, colName: string) => {
    e.preventDefault();
    resizingRef.current = {
      col: colName,
      startX: e.clientX,
      startWidth: colWidths[colName] || 200
    };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { col, startX, startWidth } = resizingRef.current;
    const newWidth = Math.max(80, startWidth + (e.clientX - startX));
    setColWidths(prev => ({ ...prev, [col]: newWidth }));
  };

  const handleResizeEnd = () => {
    if (resizingRef.current) saveUISettings(colOrder, colWidths);
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  // Reorder Logic
  const handleDragStart = (colName: string) => { draggingRef.current = { col: colName }; };
  const handleDragOver = (e: React.DragEvent, targetCol: string) => {
    e.preventDefault();
    if (!draggingRef.current || draggingRef.current.col === targetCol) return;
    const newOrder = [...colOrder];
    const dragIdx = newOrder.indexOf(draggingRef.current.col);
    const targetIdx = newOrder.indexOf(targetCol);
    newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, draggingRef.current.col);
    setColOrder(newOrder);
  };
  const handleDragEnd = () => {
    saveUISettings(colOrder, colWidths);
    draggingRef.current = null;
  };

  useEffect(() => { fetchTables(); }, [projectId]);
  useEffect(() => { if (selectedTable && activeTab === 'tables') fetchTableDetails(selectedTable); }, [selectedTable, activeTab]);

  const orderedColumns = colOrder.map(name => columns.find(c => c.name === name)).filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-[#FDFDFD]">
      <header className="border-b border-slate-200 px-10 py-6 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl">
            <Database size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Instance Explorer</h2>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em]">{projectId}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setActiveTab('tables')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'tables' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>DATA BROWSER</button>
            <button onClick={() => setActiveTab('query')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'query' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>SQL TERMINAL</button>
          </div>
          <button onClick={() => setShowCreateTable(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"><Plus size={18} /> CREATE TABLE</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-6">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input placeholder="Search tables..." className="w-full pl-12 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-1">
            <div className="flex items-center justify-between px-3 py-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Tables</span>
              <span className="text-[10px] font-mono text-indigo-500 font-bold">{tables.length}</span>
            </div>
            {tables.map(t => (
              <button key={t.name} onClick={() => setSelectedTable(t.name)} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all group ${selectedTable === t.name ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}>
                <div className="flex items-center gap-4">
                  <TableIcon size={18} className={selectedTable === t.name ? 'text-white' : 'text-slate-300'} />
                  <span className="text-sm font-bold tracking-tight">{t.name}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col relative">
          {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 p-4 bg-rose-600 text-white text-xs font-bold rounded-2xl shadow-2xl flex items-center gap-3">
              <AlertCircle size={18} /> {error}
              <button onClick={() => setError(null)} className="ml-4 opacity-50"><X size={14} /></button>
            </div>
          )}

          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedTable && (
                <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center gap-12">
                  <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Schema Identity</span><span className="text-xl font-black text-slate-900 font-mono">public.{selectedTable}</span></div>
                  <div className="h-10 w-[1px] bg-slate-100"></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Live Records</span><span className="text-xl font-black text-indigo-600">{tableData.length}</span></div>
                </div>
              )}
              
              <div className="flex-1 overflow-auto p-10 bg-[#FAFBFC]">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-6">
                    <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-sm font-black uppercase tracking-widest text-slate-500">Connecting to Engine...</p>
                  </div>
                ) : selectedTable ? (
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-100 overflow-hidden inline-block min-w-full">
                    <table className="table-fixed border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {orderedColumns.map(col => (
                            <th 
                              key={col.name} 
                              draggable 
                              onDragStart={() => handleDragStart(col.name)}
                              onDragOver={(e) => handleDragOver(e, col.name)}
                              onDragEnd={handleDragEnd}
                              className="relative px-8 py-6 text-left group border-r border-slate-100 select-none cursor-move"
                              style={{ width: colWidths[col.name] || 200 }}
                            >
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] truncate">{col.name}</span>
                                <span className="text-[9px] font-mono text-indigo-500 font-bold tracking-tight uppercase">{col.type}</span>
                              </div>
                              {/* Resize Handle */}
                              <div 
                                onMouseDown={(e) => handleResizeStart(e, col.name)}
                                className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-400 transition-colors z-20 active:bg-indigo-600"
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tableData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            {orderedColumns.map(col => (
                              <td key={col.name} className="px-8 py-5 text-sm font-medium text-slate-700 font-mono truncate border-r border-slate-100 last:border-r-0">
                                {row[col.name] === null ? <span className="text-slate-300 italic">null</span> : String(row[col.name])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-200">
                    <Database size={120} className="mb-8 opacity-5" />
                    <h3 className="text-3xl font-black text-slate-300 tracking-tighter">Instance Ready</h3>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
              <div className="px-8 py-5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400"><Terminal size={20} /></div>
                  <h4 className="text-white font-black text-sm tracking-tight">SQL Console v1</h4>
                </div>
                <button onClick={async () => {
                  setExecuting(true);
                  try {
                    const data = await fetchWithAuth(`/api/data/${projectId}/query`, { method: 'POST', body: JSON.stringify({ sql: query }) });
                    setQueryResult(data);
                    if (['CREATE', 'DROP', 'ALTER'].some(cmd => data.command?.includes(cmd))) fetchTables();
                  } catch (err: any) { setError(err.message); }
                  finally { setExecuting(false); }
                }} disabled={executing} className="bg-emerald-500 text-white px-8 py-3 rounded-2xl text-xs font-black flex items-center gap-3">
                  {executing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} EXECUTE
                </button>
              </div>
              <textarea value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 w-full bg-[#020617] text-emerald-400 p-12 font-mono text-lg outline-none resize-none" />
              {queryResult && (
                <div className="h-[45%] bg-[#0f172a] border-t border-white/5 overflow-auto p-10 font-mono animate-in slide-in-from-bottom-10">
                  <pre className="text-xs text-slate-300 leading-6">{JSON.stringify(queryResult.rows, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showCreateTable && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-8">
          <div className="bg-white rounded-[3.5rem] w-full max-w-5xl max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95">
            <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl"><Plus size={32} /></div>
                <div><h3 className="text-4xl font-black text-slate-900 tracking-tighter">Schema Architect</h3></div>
              </div>
              <button onClick={() => setShowCreateTable(false)} className="p-4 hover:bg-slate-200 rounded-full transition-colors"><X size={32} className="text-slate-400" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-16 space-y-16">
              <div className="space-y-4 max-w-xl">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Table Identity</label>
                <input value={newTableName} onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/ /g, '_'))} className="w-full bg-slate-100 border-none rounded-[1.5rem] py-6 px-8 text-2xl font-black text-slate-900 outline-none" placeholder="e.g. products" />
              </div>
              <div className="space-y-8">
                {newTableColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-6 bg-slate-50 p-6 rounded-[1.8rem] border border-slate-100">
                    <input value={col.name} onChange={(e) => { const upd = [...newTableColumns]; upd[idx].name = e.target.value.toLowerCase(); setNewTableColumns(upd); }} className="flex-1 bg-white border border-slate-200 rounded-2xl py-3 px-6 text-sm font-bold" />
                    <select value={col.type} onChange={(e) => { const upd = [...newTableColumns]; upd[idx].type = e.target.value; setNewTableColumns(upd); }} className="w-56 bg-white border border-slate-200 rounded-2xl py-3 px-5 text-sm font-black text-indigo-600 outline-none">
                      <option value="uuid">UUID</option><option value="text">TEXT</option><option value="integer">INT</option><option value="boolean">BOOL</option>
                    </select>
                    <button onClick={() => setNewTableColumns(newTableColumns.filter((_, i) => i !== idx))} className="p-3 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={24} /></button>
                  </div>
                ))}
                <button onClick={() => setNewTableColumns([...newTableColumns, { name: 'new_col', type: 'text', primaryKey: false, nullable: true }])} className="text-xs font-black text-indigo-600 hover:bg-indigo-50 px-6 py-3 rounded-2xl transition-all border-2 border-indigo-100">+ ADD ATTRIBUTE</button>
              </div>
            </div>
            <footer className="p-12 border-t border-slate-100 bg-slate-50/50 flex gap-6">
              <button onClick={() => setShowCreateTable(false)} className="flex-1 py-6 text-slate-400 font-black uppercase tracking-widest text-sm">Cancel</button>
              <button onClick={async () => {
                setExecuting(true);
                try {
                  await fetchWithAuth(`/api/data/${projectId}/tables`, { method: 'POST', body: JSON.stringify({ name: newTableName, columns: newTableColumns }) });
                  setShowCreateTable(false); setNewTableName(''); fetchTables();
                } catch (err: any) { setError(err.message); }
                finally { setExecuting(false); }
              }} disabled={executing || !newTableName} className="flex-[2] py-6 bg-indigo-600 text-white font-black rounded-[1.5rem] shadow-2xl shadow-indigo-500/30 uppercase tracking-[0.2em] text-sm">COMMIT TABLE</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseExplorer;
