
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Database, Search, Play, Table as TableIcon, Loader2, AlertCircle, 
  Plus, X, Terminal, Code, Trash2, Download, CheckSquare, 
  Square, CheckCircle2, Save, FileCode, History
} from 'lucide-react';

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
  
  // SQL Terminal State
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM ');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [sqlHistory, setSqlHistory] = useState<string[]>([]);

  // UI Grid State
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [selectedRows, setSelectedRows] = useState<Set<any>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);

  // Manual Creator State
  const [showTableCreator, setShowTableCreator] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableCols, setNewTableCols] = useState([{ name: 'id', type: 'UUID', primary: true }]);

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return response.json();
  }, []);

  const fetchTables = async () => {
    const data = await fetchWithAuth(`/api/data/${projectId}/tables`);
    setTables(Array.isArray(data) ? data : []);
    if (data.length > 0 && !selectedTable) setSelectedTable(data[0].name);
  };

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
      setColOrder(uiSettings.columnOrder || rawCols.map((c: any) => c.name));
      setColWidths(uiSettings.columnWidths || {});
    } finally { setLoading(false); }
  };

  const runSql = async () => {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/data/${projectId}/query`, {
        method: 'POST',
        body: JSON.stringify({ sql: sqlQuery })
      });
      if (res.error) throw new Error(res.error);
      setQueryResult(res);
      setSqlHistory([sqlQuery, ...sqlHistory.slice(0, 9)]);
      setSuccessMsg('Query executed successfully.');
      setTimeout(() => setSuccessMsg(null), 2000);
      fetchTables();
    } catch (e: any) { setError(e.message); }
    finally { setExecuting(false); }
  };

  const handleResizeStart = (e: React.MouseEvent, colName: string) => {
    e.stopPropagation();
    setIsResizing(true);
    resizingRef.current = { col: colName, startX: e.pageX, startWidth: colWidths[colName] || 200 };

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

  const handleManualCreateTable = async () => {
    const colSql = newTableCols.map(c => `"${c.name}" ${c.type} ${c.primary ? 'PRIMARY KEY' : ''}`).join(', ');
    const sql = `CREATE TABLE public."${newTableName}" (${colSql});`;
    setExecuting(true);
    try {
      const res = await fetchWithAuth(`/api/data/${projectId}/query`, { method: 'POST', body: JSON.stringify({ sql }) });
      if (res.error) throw new Error(res.error);
      setShowTableCreator(false);
      fetchTables();
      setSuccessMsg(`Table ${newTableName} created.`);
    } catch(e: any) { setError(e.message); }
    finally { setExecuting(false); }
  };

  useEffect(() => { fetchTables(); }, [projectId]);
  useEffect(() => { if (selectedTable) fetchTableDetails(selectedTable); }, [selectedTable]);

  const orderedColumns = colOrder.map(name => columns.find(c => c.name === name)).filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-[#FDFDFD]">
      <header className="border-b border-slate-200 px-10 py-6 bg-white flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl"><Database size={24} /></div>
          <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter">Data Hub</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em]">{projectId}</p></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setActiveTab('tables')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'tables' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>DATA BROWSER</button>
            <button onClick={() => setActiveTab('query')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'query' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>SQL TERMINAL</button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="p-6 space-y-4">
            <button onClick={() => setShowTableCreator(true)} className="w-full bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-100"><Plus size={16} /> NEW TABLE</button>
            <div className="relative group"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input placeholder="Search tables..." className="w-full pl-12 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none" /></div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-1">
            {tables.map(t => (
              <button key={t.name} onClick={() => { setSelectedTable(t.name); setActiveTab('tables'); }} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${selectedTable === t.name && activeTab === 'tables' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-50'}`}>
                <div className="flex items-center gap-4"><TableIcon size={18} /><span className="text-sm font-bold tracking-tight">{t.name}</span></div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col bg-[#FAFBFC] relative">
          {(error || successMsg) && (
            <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 p-4 ${error ? 'bg-rose-600' : 'bg-emerald-600'} text-white text-xs font-bold rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4`}>
              {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {error || successMsg}
              <button onClick={() => { setError(null); setSuccessMsg(null); }} className="ml-4 opacity-50"><X size={14}/></button>
            </div>
          )}

          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
                 <h3 className="text-xl font-black text-slate-900 font-mono">public.{selectedTable}</h3>
                 <div className="flex gap-4">
                   <button className="bg-white text-slate-700 border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Download size={14} /> EXPORT CSV</button>
                 </div>
               </div>
               <div className="flex-1 overflow-auto p-10">
                 {loading ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-300" size={40} /></div> : (
                   <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden inline-block min-w-full">
                     <table className="table-fixed border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="w-16 px-6 py-6 border-r border-slate-100 text-center"><Square size={18} className="text-slate-300 mx-auto" /></th>
                            {orderedColumns.map(col => (
                              <th key={col.name} className="relative px-8 py-6 text-left border-r border-slate-100" style={{ width: colWidths[col.name] || 200 }}>
                                <div className="flex flex-col gap-1"><span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{col.name}</span><span className="text-[9px] font-mono text-indigo-500 font-bold">{col.type}</span></div>
                                <div onMouseDown={(e) => handleResizeStart(e, col.name)} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500" />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {tableData.map((row, i) => (
                            <tr key={i} className="hover:bg-indigo-50/20 transition-colors">
                              <td className="px-6 py-5 text-center border-r border-slate-100"><Square size={18} className="text-slate-200 mx-auto" /></td>
                              {orderedColumns.map(col => (
                                <td key={col.name} className="px-8 py-5 text-xs font-mono text-slate-600 truncate border-r border-slate-100 last:border-r-0">
                                  {row[col.name] === null ? <span className="text-slate-200 italic">null</span> : String(row[col.name])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                     </table>
                   </div>
                 )}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-10 gap-6">
              <div className="flex-1 flex flex-col bg-slate-950 rounded-[3rem] overflow-hidden shadow-2xl border border-white/5">
                <div className="px-10 py-5 bg-slate-900/50 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3"><Terminal size={18} className="text-indigo-400"/><span className="text-[10px] font-black text-white uppercase tracking-widest">SQL COMMAND TERMINAL</span></div>
                  <button onClick={runSql} disabled={executing} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all">
                    {executing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} RUN QUERY
                  </button>
                </div>
                <textarea value={sqlQuery} onChange={(e) => setSqlQuery(e.target.value)} className="flex-1 p-10 bg-transparent text-emerald-400 font-mono text-lg outline-none resize-none spellcheck-false" />
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm overflow-hidden flex flex-col">
                 <div className="flex items-center gap-3 mb-6"><History size={18} className="text-slate-400"/><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">QUERY RESULTS</span></div>
                 <div className="flex-1 overflow-auto">
                    {queryResult ? (
                      <pre className="text-xs font-mono text-slate-600">{JSON.stringify(queryResult.rows || queryResult, null, 2)}</pre>
                    ) : <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-4"><Terminal size={48}/><span className="text-[10px] font-black uppercase tracking-widest">Awaiting execution...</span></div>}
                 </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showTableCreator && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[500] flex items-center justify-center p-8 animate-in fade-in">
           <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 shadow-2xl border border-slate-100 animate-in zoom-in-95">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">Manual Table Sculptor</h3>
              <div className="space-y-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Table Identifier</label>
                    <input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="users_v2" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-5 px-8 text-xl font-bold text-slate-900 outline-none" />
                 </div>
                 <div className="space-y-4 max-h-60 overflow-y-auto pr-4">
                    {newTableCols.map((col, idx) => (
                      <div key={idx} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl">
                         <input value={col.name} onChange={(e) => {
                            const next = [...newTableCols]; next[idx].name = e.target.value; setNewTableCols(next);
                         }} className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold" placeholder="col_name" />
                         <select value={col.type} onChange={(e) => {
                            const next = [...newTableCols]; next[idx].type = e.target.value; setNewTableCols(next);
                         }} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black">
                            <option value="UUID">UUID</option><option value="TEXT">TEXT</option><option value="TIMESTAMP">TIMESTAMP</option><option value="BOOLEAN">BOOLEAN</option><option value="JSONB">JSONB</option>
                         </select>
                         <button onClick={() => setNewTableCols(newTableCols.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-600 p-2"><Trash2 size={16}/></button>
                      </div>
                    ))}
                 </div>
                 <button onClick={() => setNewTableCols([...newTableCols, { name: 'new_col', type: 'TEXT', primary: false }])} className="text-indigo-600 text-xs font-black uppercase tracking-widest flex items-center gap-2">+ ADD COLUMN</button>
                 <div className="flex gap-6 pt-6">
                    <button onClick={() => setShowTableCreator(false)} className="flex-1 py-5 text-slate-400 font-black uppercase tracking-widest text-[10px]">Abort</button>
                    <button onClick={handleManualCreateTable} className="flex-[2] py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-indigo-100">Provision Table</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseExplorer;
