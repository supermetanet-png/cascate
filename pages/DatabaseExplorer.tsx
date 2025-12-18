
import React, { useState, useEffect } from 'react';
import { Database, Search, Play, Table as TableIcon, Loader2, AlertCircle, CheckCircle2, Plus, Columns, Settings, Trash2, X } from 'lucide-react';

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
  
  // No-Code Table Builder State
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
      setError('Falha ao carregar tabelas');
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
      if (data.command === 'CREATE' || data.command === 'DROP' || data.command === 'ALTER') {
        fetchTables();
      }
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
      setNewTableColumns([{ name: 'id', type: 'uuid', primaryKey: true, nullable: false, default: 'gen_random_uuid()' }]);
      fetchTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [projectId]);

  useEffect(() => {
    if (selectedTable && activeTab === 'tables') {
      fetchTableDetails(selectedTable);
    }
  }, [selectedTable, activeTab]);

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b border-slate-200 px-8 py-4 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
            <Database size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Data Explorer</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PostgreSQL Instance: {projectId}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('tables')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'tables' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              BROWSER
            </button>
            <button 
              onClick={() => setActiveTab('query')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'query' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              SQL EDITOR
            </button>
          </div>
          <button 
            onClick={() => setShowCreateTable(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            <Plus size={16} /> NEW TABLE
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r border-slate-200 bg-slate-50/30 flex flex-col">
          <div className="p-5 border-b border-slate-100">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={14} />
              <input 
                placeholder="Search tables..." 
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm" 
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <p className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Public Schema</p>
            {tables.map(t => (
              <button 
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 ${selectedTable === t.name ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
              >
                <TableIcon size={16} className={selectedTable === t.name ? 'text-white' : 'text-slate-400'} />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            {tables.length === 0 && !loading && (
              <div className="text-center py-10 px-6">
                <TableIcon size={32} className="mx-auto text-slate-200 mb-3" />
                <p className="text-xs text-slate-400 font-medium">No tables found.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          {error && (
            <div className="m-6 p-4 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-2xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
              <AlertCircle size={18} className="shrink-0" /> {error}
            </div>
          )}

          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedTable && (
                <div className="px-8 py-4 bg-white border-b border-slate-200 flex items-center gap-8">
                  <div className="flex items-center gap-4 border-r border-slate-100 pr-8">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Columns</span>
                    <span className="text-lg font-black text-slate-900">{columns.length}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rows (est)</span>
                    <span className="text-lg font-black text-slate-900">{tableData.length}</span>
                  </div>
                </div>
              )}
              
              <div className="flex-1 overflow-auto p-6">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                    <Loader2 className="animate-spin text-indigo-500" size={40} />
                    <p className="text-xs font-bold uppercase tracking-widest">Introspecting Schema...</p>
                  </div>
                ) : selectedTable ? (
                  <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-w-full">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          {columns.map(col => (
                            <th key={col.name} className="px-6 py-4 text-left group">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-wider">{col.name}</span>
                                <span className="text-[9px] font-mono text-indigo-500 font-bold uppercase tracking-tighter">{col.type}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {tableData.map((row, i) => (
                          <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                            {columns.map(col => (
                              <td key={col.name} className="px-6 py-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                                {row[col.name] === null ? <span className="text-slate-300 italic">null</span> : String(row[col.name])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {tableData.length === 0 && (
                          <tr>
                            <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-400">
                              <div className="flex flex-col items-center gap-2">
                                <Database size={32} className="opacity-10" />
                                <span className="text-xs font-bold uppercase tracking-widest">No rows in this table</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                    <TableIcon size={64} className="opacity-20" />
                    <p className="text-lg font-black tracking-tight text-slate-400">Select a table to explore data</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
              <div className="p-4 bg-slate-900 border-b border-white/5 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <Play size={16} />
                  </div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Raw SQL Terminal</span>
                </div>
                <button 
                  onClick={handleRunQuery}
                  disabled={executing}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-xl shadow-emerald-900/20"
                >
                  {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  EXECUTE
                </button>
              </div>
              <textarea 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 w-full bg-slate-950 text-emerald-400 p-8 font-mono text-sm focus:outline-none resize-none spellcheck-false"
                placeholder="-- Write your SQL here..."
              />
              {queryResult && (
                <div className="h-2/5 bg-slate-900 border-t border-white/10 overflow-auto p-6 font-mono shadow-2xl">
                  <div className="flex items-center gap-4 mb-4 border-b border-white/5 pb-3">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Execution Report</span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded uppercase">
                      {queryResult.command} OK
                    </span>
                    <span className="text-[10px] text-slate-500">Affected: {queryResult.rowCount} rows</span>
                  </div>
                  <pre className="text-[11px] text-slate-300 leading-relaxed">
                    {JSON.stringify(queryResult.rows, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* No-Code Table Builder Modal */}
      {showCreateTable && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-300">
            <header className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Table Builder</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Designing Schema for {projectId}</p>
                </div>
              </div>
              <button onClick={() => setShowCreateTable(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={24} className="text-slate-400" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-10 space-y-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Table Name</label>
                <input 
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/ /g, '_'))}
                  placeholder="e.g. products_v1"
                  className="w-full bg-slate-100 border-none rounded-2xl py-4 px-6 text-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Columns size={14} className="text-indigo-600" /> Column Definitions
                  </h4>
                  <button 
                    onClick={() => setNewTableColumns([...newTableColumns, { name: 'new_column', type: 'text', primaryKey: false, nullable: true }])}
                    className="text-xs font-black text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all border border-indigo-100"
                  >
                    + ADD COLUMN
                  </button>
                </div>

                <div className="space-y-3">
                  {newTableColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 group">
                      <input 
                        value={col.name}
                        onChange={(e) => {
                          const updated = [...newTableColumns];
                          updated[idx].name = e.target.value.toLowerCase().replace(/ /g, '_');
                          setNewTableColumns(updated);
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <select 
                        value={col.type}
                        onChange={(e) => {
                          const updated = [...newTableColumns];
                          updated[idx].type = e.target.value;
                          setNewTableColumns(updated);
                        }}
                        className="w-40 bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-medium text-slate-600 outline-none"
                      >
                        <option value="uuid">UUID</option>
                        <option value="text">TEXT</option>
                        <option value="integer">INTEGER</option>
                        <option value="boolean">BOOLEAN</option>
                        <option value="timestamptz">TIMESTAMP TZ</option>
                        <option value="jsonb">JSONB</option>
                      </select>
                      <label className="flex items-center gap-2 cursor-pointer select-none px-3">
                        <input 
                          type="checkbox" 
                          checked={col.primaryKey}
                          onChange={(e) => {
                            const updated = [...newTableColumns];
                            updated[idx].primaryKey = e.target.checked;
                            if (e.target.checked) updated[idx].nullable = false;
                            setNewTableColumns(updated);
                          }}
                        />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">PK</span>
                      </label>
                      <button 
                        onClick={() => setNewTableColumns(newTableColumns.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="p-8 border-t border-slate-100 bg-slate-50 flex gap-4">
              <button onClick={() => setShowCreateTable(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-all uppercase tracking-widest text-xs">Discard</button>
              <button 
                onClick={handleCreateTable}
                disabled={executing || !newTableName}
                className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-50"
              >
                {executing ? 'CREATING...' : 'SAVE TABLE SCHEMA'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseExplorer;
