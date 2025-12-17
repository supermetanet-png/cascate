
import React, { useState } from 'react';
import { Database, Search, Filter, Play, RefreshCw, Table as TableIcon, Columns, Code } from 'lucide-react';
import { Table } from '../types';

const DatabaseExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'query'>('tables');
  const [selectedTable, setSelectedTable] = useState<string | null>('users');
  const [query, setQuery] = useState('SELECT * FROM public.users LIMIT 10;');

  const tables: Table[] = [
    {
      name: 'users',
      schema: 'public',
      rowCount: 1240,
      columns: [
        { name: 'id', type: 'uuid', isNullable: false, isPrimaryKey: true },
        { name: 'email', type: 'text', isNullable: false, isPrimaryKey: false },
        { name: 'created_at', type: 'timestamp', isNullable: false, isPrimaryKey: false }
      ]
    },
    {
      name: 'products',
      schema: 'public',
      rowCount: 450,
      columns: [
        { name: 'id', type: 'uuid', isNullable: false, isPrimaryKey: true },
        { name: 'name', type: 'text', isNullable: false, isPrimaryKey: false },
        { name: 'price', type: 'numeric', isNullable: false, isPrimaryKey: false }
      ]
    }
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-8 py-4 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Database size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Database Explorer</h2>
            <p className="text-xs text-slate-500 font-mono">Project: {projectId}</p>
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
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-200 bg-slate-50/50 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                placeholder="Find table..." 
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-2">Public Tables</div>
            {tables.map(t => (
              <button 
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${selectedTable === t.name ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-200/50'}`}
              >
                <TableIcon size={14} className={selectedTable === t.name ? 'text-indigo-500' : 'text-slate-400'} />
                {t.name}
                <span className="ml-auto text-[10px] text-slate-400 font-mono">{t.rowCount}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col p-8 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedTable}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase">public</span>
                    <span className="text-slate-400 text-sm">•</span>
                    <span className="text-slate-500 text-sm">Created 2 days ago</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                    <Columns size={16} /> Edit Columns
                  </button>
                  <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                    <Play size={16} /> Insert Row
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">
                        <input type="checkbox" className="rounded" />
                      </th>
                      {tables.find(t => t.name === selectedTable)?.columns.map(col => (
                        <th key={col.name} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          <div className="flex flex-col">
                            <span>{col.name}</span>
                            <span className="text-[10px] font-normal text-slate-400 lowercase">{col.type}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[1, 2, 3, 4, 5].map(i => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3"><input type="checkbox" className="rounded" /></td>
                        <td className="px-4 py-3 text-sm font-mono text-indigo-600 truncate max-w-[120px]">3f2a-11ed-a261...</td>
                        <td className="px-4 py-3 text-sm text-slate-600">user_{i}@example.com</td>
                        <td className="px-4 py-3 text-sm text-slate-500 italic">2024-01-15 12:00</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Code size={16} />
                  <span>query_main.sql</span>
                </div>
                <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-sm font-bold flex items-center gap-2 transition-all">
                  <Play size={14} fill="currentColor" /> RUN
                </button>
              </div>
              <textarea 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 w-full bg-slate-950 text-emerald-400 p-6 font-mono text-sm focus:outline-none resize-none"
                spellCheck={false}
              />
              <div className="h-1/3 border-t border-slate-800 bg-slate-900 flex flex-col">
                <div className="p-2 border-b border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-widest px-4">Result Output</div>
                <div className="flex-1 p-4 font-mono text-xs text-slate-400 overflow-y-auto">
                  {`[2024-01-15 14:02:11] Query executed successfully.
10 rows affected. (0.012s)

| id  | email               | created_at       |
|-----|---------------------|------------------|
| 101 | admin@cascata.io    | 2024-01-10 10:00 |
| 102 | client@cascata.io   | 2024-01-11 11:30 |
| ... | ...                 | ...              |`}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DatabaseExplorer;
