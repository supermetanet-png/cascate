
import React, { useState, useEffect } from 'react';
import { Database, Search, Play, Table as TableIcon, Loader2, AlertCircle, Plus, Columns, Settings, Trash2, X, Terminal, Code } from 'lucide-react';

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
  
  // Table Builder State
  const [newTableName, setNewTableName] = useState('');
  const [newTableColumns, setNewTableColumns] = useState<any[]>([
    { name: 'id', type: 'uuid', primaryKey: true, nullable: false, default: 'gen_random_uuid()' },
    { name: 'created_at', type: 'timestamptz', primaryKey: false, nullable: false, default: 'now()' }
  ]);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/data/${projectId}/tables`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      const data = await response.json();
      setTables(data);
      if (data.length > 0 && !selectedTable) setSelectedTable(data[0].name);
    } catch (err) {
      setError('System connection failure');
    } finally {
      setLoading(false);
    }
  };

  const fetchTableDetails = async (tableName: string) => {
    setLoading(true);
    setError(null);
    try {
      const [dataRes, colsRes] = await Promise.all([
        fetch(`/api/data/${projectId}/tables/${tableName}/data`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
        }),
        fetch(`/api/data/${projectId}/tables/${tableName}/columns`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
        })
      ]);
      const data = await dataRes.json();
      const cols = await colsRes.json();
      if (data.error) throw new Error(data.error);
      setTableData(data);
      setColumns(cols);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunQuery = async () => {
    setExecuting(true);
    setError(null);
    try {
      const response = await fetch(`/api/data/${projectId}/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify({ sql: query }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setQueryResult(data);
      if (['CREATE', 'DROP', 'ALTER'].some(cmd => data.command?.includes(cmd))) fetchTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleCreateTable = async () => {
    setExecuting(true);
    try {
      const response = await fetch(`/api/data/${projectId}/tables`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify({ name: newTableName, columns: newTableColumns }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setShowCreateTable(false);
      setNewTableName('');
      fetchTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => { fetchTables(); }, [projectId]);
  useEffect(() => { if (selectedTable && activeTab === 'tables') fetchTableDetails(selectedTable); }, [selectedTable, activeTab]);

  return (
    <div className="flex h-full flex-col bg-[#FDFDFD]">
      <header className="border-b border-slate-200 px-10 py-6 bg-white flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.03)] z-10">
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
            <button 
              onClick={() => setActiveTab('tables')}
              className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'tables' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              DATA BROWSER
            </button>
            <button 
              onClick={() => setActiveTab('query')}
              className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'query' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              SQL TERMINAL
            </button>
          </div>
          <button 
            onClick={() => setShowCreateTable(true)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 hover:-translate-y-0.5"
          >
            <Plus size={18} /> CREATE TABLE
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Robusta */}
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-6">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
              <input 
                placeholder="Search resources..." 
                className="w-full pl-12 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium" 
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-1">
            <div className="flex items-center justify-between px-3 py-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Tables</span>
              <span className="text-[10px] font-mono text-indigo-500 font-bold">{tables.length}</span>
            </div>
            {tables.map(t => (
              <button 
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 group ${selectedTable === t.name ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4">
                  <TableIcon size={18} className={selectedTable === t.name ? 'text-white' : 'text-slate-300 group-hover:text-indigo-400'} />
                  <span className="text-sm font-bold tracking-tight">{t.name}</span>
                </div>
                {selectedTable === t.name && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col relative">
          {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 p-4 bg-rose-600 text-white text-xs font-bold rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
              <AlertCircle size={18} /> {error}
              <button onClick={() => setError(null)} className="ml-4 opacity-50 hover:opacity-100"><X size={14} /></button>
            </div>
          )}

          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col">
              {selectedTable && (
                <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center gap-12">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Schema Identity</span>
                    <span className="text-xl font-black text-slate-900 font-mono">public.{selectedTable}</span>
                  </div>
                  <div className="h-10 w-[1px] bg-slate-100"></div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Live Records</span>
                    <span className="text-xl font-black text-indigo-600">{tableData.length}</span>
                  </div>
                </div>
              )}
              
              <div className="flex-1 overflow-auto p-10 bg-[#FAFBFC]">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-6">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      <Database className="absolute inset-0 m-auto text-indigo-600" size={24} />
                    </div>
                    <p className="text-sm font-black uppercase tracking-widest text-slate-500">Connecting to Engine...</p>
                  </div>
                ) : selectedTable ? (
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-100 overflow-hidden min-w-full">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {columns.map(col => (
                            <th key={col.name} className="px-8 py-6 text-left group">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">{col.name}</span>
                                <span className="text-[9px] font-mono text-indigo-500 font-bold tracking-tight">{col.type}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tableData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            {columns.map(col => (
                              <td key={col.name} className="px-8 py-5 text-sm font-medium text-slate-700 font-mono">
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
                    <p className="text-slate-400 font-medium">Select a resource to begin exploration.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
              <div className="px-8 py-5 bg-slate-900/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <h4 className="text-white font-black text-sm tracking-tight">SQL Console v1</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">PostgreSQL Input Buffer</p>
                  </div>
                </div>
                <button 
                  onClick={handleRunQuery}
                  disabled={executing}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white px-8 py-3 rounded-2xl text-xs font-black flex items-center gap-3 transition-all shadow-2xl shadow-emerald-500/20"
                >
                  {executing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                  EXECUTE QUERY
                </button>
              </div>
              <textarea 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 w-full bg-[#020617] text-emerald-400 p-12 font-mono text-lg leading-relaxed focus:outline-none resize-none spellcheck-false"
              />
              {queryResult && (
                <div className="h-[45%] bg-[#0f172a] border-t border-white/5 overflow-auto p-10 font-mono animate-in slide-in-from-bottom-10">
                  <div className="flex items-center gap-6 mb-8 pb-4 border-b border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Response Stream</span>
                    <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg">Status: {queryResult.command} OK</span>
                    <span className="text-xs font-bold text-slate-500">Latency: {queryResult.duration}</span>
                  </div>
                  <div className="space-y-4">
                     <pre className="text-xs text-slate-300 leading-6">
                        {JSON.stringify(queryResult.rows, null, 2)}
                     </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* No-Code Table Builder Modal (Robust) */}
      {showCreateTable && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="bg-white rounded-[3.5rem] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-slate-200 flex flex-col animate-in zoom-in-95">
            <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl">
                  <Plus size={32} />
                </div>
                <div>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter">Schema Architect</h3>
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Designing public schema for {projectId}</p>
                </div>
              </div>
              <button onClick={() => setShowCreateTable(false)} className="p-4 hover:bg-slate-200 rounded-full transition-colors">
                <X size={32} className="text-slate-400" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-16 space-y-16">
              <div className="space-y-4 max-w-xl">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Table Identity</label>
                <input 
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/ /g, '_'))}
                  placeholder="e.g. core_products"
                  className="w-full bg-slate-100 border-none rounded-[1.5rem] py-6 px-8 text-2xl font-black text-slate-900 focus:ring-4 focus:ring-indigo-500/20 transition-all outline-none placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-8">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                    <Code size={18} className="text-indigo-600" /> Attributes Definition
                  </h4>
                  <button 
                    onClick={() => setNewTableColumns([...newTableColumns, { name: 'new_column', type: 'text', primaryKey: false, nullable: true }])}
                    className="text-xs font-black text-indigo-600 hover:bg-indigo-50 px-6 py-3 rounded-2xl transition-all border-2 border-indigo-100"
                  >
                    + ADD ATTRIBUTE
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {newTableColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-6 bg-slate-50 p-6 rounded-[1.8rem] border border-slate-100 group hover:border-indigo-200 transition-all">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm">{idx + 1}</div>
                      <input 
                        value={col.name}
                        onChange={(e) => {
                          const updated = [...newTableColumns];
                          updated[idx].name = e.target.value.toLowerCase().replace(/ /g, '_');
                          setNewTableColumns(updated);
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-2xl py-3 px-6 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-indigo-500/10 outline-none"
                      />
                      <select 
                        value={col.type}
                        onChange={(e) => {
                          const updated = [...newTableColumns];
                          updated[idx].type = e.target.value;
                          setNewTableColumns(updated);
                        }}
                        className="w-56 bg-white border border-slate-200 rounded-2xl py-3 px-5 text-sm font-black text-indigo-600 outline-none"
                      >
                        <option value="uuid">UUID v4</option>
                        <option value="text">STRING / TEXT</option>
                        <option value="integer">INTEGER (32-bit)</option>
                        <option value="boolean">BOOLEAN</option>
                        <option value="timestamptz">TIMESTAMP (TZ)</option>
                        <option value="jsonb">JSONB OBJECT</option>
                      </select>
                      <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <input 
                          type="checkbox" 
                          checked={col.primaryKey}
                          onChange={(e) => {
                            const updated = [...newTableColumns];
                            updated[idx].primaryKey = e.target.checked;
                            setNewTableColumns(updated);
                          }}
                          className="w-5 h-5 accent-indigo-600"
                        />
                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">PK</span>
                      </div>
                      <button 
                        onClick={() => setNewTableColumns(newTableColumns.filter((_, i) => i !== idx))}
                        className="p-3 text-slate-300 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="p-12 border-t border-slate-100 bg-slate-50/50 flex gap-6">
              <button onClick={() => setShowCreateTable(false)} className="flex-1 py-6 text-slate-400 font-black hover:bg-slate-200 rounded-[1.5rem] transition-all uppercase tracking-widest text-sm">Cancel Design</button>
              <button 
                onClick={handleCreateTable}
                disabled={executing || !newTableName}
                className="flex-[2] py-6 bg-indigo-600 text-white font-black rounded-[1.5rem] shadow-2xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all uppercase tracking-[0.2em] text-sm disabled:opacity-50"
              >
                {executing ? 'PROVISIONING ARCHITECTURE...' : 'COMMIT TABLE TO DATABASE'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseExplorer;
