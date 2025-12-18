
import React, { useState, useEffect } from 'react';
import { Database, Search, Filter, Play, RefreshCw, Table as TableIcon, Columns, Code, Loader2 } from 'lucide-react';
import { Table } from '../types';

const DatabaseExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'query'>('tables');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('SELECT * FROM public.users LIMIT 10;');

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const response = await fetch(`/api/data/${projectId}/tables`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
        });
        const data = await response.json();
        setTables(data);
        if (data.length > 0) setSelectedTable(data[0].name);
      } catch (err) {
        console.error('Error fetching tables');
      } finally {
        setLoading(false);
      }
    };
    fetchTables();
  }, [projectId]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-8 py-4 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Database size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Data Explorer</h2>
            <p className="text-xs text-slate-500 font-mono">Isolated DB: {projectId}</p>
          </div>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'tables' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Table Editor
          </button>
          <button 
            onClick={() => setActiveTab('query')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'query' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            SQL Editor
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-slate-200 bg-slate-50/50 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input placeholder="Find table..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex justify-center p-4"><Loader2 className="animate-spin text-slate-300" size={20} /></div>
            ) : (
              tables.map(t => (
                <button 
                  key={t.name}
                  onClick={() => setSelectedTable(t.name)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${selectedTable === t.name ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-200/50'}`}
                >
                  <TableIcon size={14} className={selectedTable === t.name ? 'text-indigo-500' : 'text-slate-400'} />
                  {t.name}
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col p-8 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900">{selectedTable || 'Select a table'}</h3>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                    <Play size={16} /> Insert Row
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl bg-white p-12 flex flex-col items-center justify-center text-slate-400">
                <TableIcon size={48} className="mb-4 opacity-20" />
                <p>Select a table to browse its data from the isolated project database.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
               <textarea 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 w-full bg-slate-950 text-emerald-400 p-6 font-mono text-sm focus:outline-none resize-none"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DatabaseExplorer;
