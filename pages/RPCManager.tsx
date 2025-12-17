
import React, { useState } from 'react';
import { Code2, Play, Plus, Book, Clock, Terminal } from 'lucide-react';

const RPCManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [selectedRpc, setSelectedRpc] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full flex gap-8">
      <div className="flex-1 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Database Functions (RPC)</h2>
            <p className="text-slate-500">Expose complex SQL logic as secure HTTP endpoints.</p>
          </div>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
            <Plus size={20} /> New Function
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <RpcItem 
            name="calculate_total_revenue" 
            args="shop_id uuid" 
            returns="numeric" 
            onSelect={() => setSelectedRpc('calculate_total_revenue')} 
          />
          <RpcItem 
            name="sync_external_inventory" 
            args="provider text, api_key text" 
            returns="jsonb" 
            onSelect={() => setSelectedRpc('sync_external_inventory')} 
          />
        </div>
      </div>

      {/* Helper / Details Panel */}
      <div className="w-96 space-y-6">
        <div className="border border-slate-200 rounded-xl p-6 bg-slate-50 h-fit">
          <div className="flex items-center gap-3 mb-6">
            <Book className="text-indigo-600" size={20} />
            <h3 className="font-bold text-slate-800">Quick Guide</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every function you create in your database is automatically exposed at:
          </p>
          <div className="mt-3 bg-white border border-slate-200 rounded p-2 font-mono text-[10px] text-slate-500">
            POST /rpc/{`{function_name}`}
          </div>
          <div className="mt-6 space-y-4">
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
              <p className="text-xs text-slate-500">Create a PL/pgSQL function</p>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
              <p className="text-xs text-slate-500">Invoke it with JSON parameters</p>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
              <p className="text-xs text-slate-500">Cascata handles type mapping & execution</p>
            </div>
          </div>
        </div>

        {selectedRpc && (
          <div className="border border-indigo-200 rounded-xl p-6 bg-indigo-50/50">
            <h3 className="font-bold text-indigo-900 mb-4">HTTP Example</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-400">
              <div className="text-emerald-400">curl</div> -X POST \<br/>
              &nbsp;&nbsp;https://api.cascata.io/rpc/{selectedRpc} \<br/>
              &nbsp;&nbsp;-H <span className="text-amber-300">"Authorization: Bearer..."</span> \<br/>
              &nbsp;&nbsp;-d <span className="text-amber-300">'{`{"shop_id": "..."}`}'</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const RpcItem: React.FC<{ name: string, args: string, returns: string, onSelect: () => void }> = ({ name, args, returns, onSelect }) => (
  <div className="border border-slate-200 rounded-xl bg-white p-5 hover:border-indigo-200 hover:shadow-sm transition-all flex items-center justify-between">
    <div className="flex gap-4">
      <div className="p-2 bg-slate-50 text-slate-400 rounded-lg">
        <Code2 size={20} />
      </div>
      <div>
        <h4 className="font-bold text-slate-900">{name}</h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-mono text-slate-500">({args})</span>
          <span className="text-slate-300">→</span>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-tighter">{returns}</span>
        </div>
      </div>
    </div>
    <div className="flex gap-2">
      <button 
        onClick={onSelect}
        className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-100"
      >
        View API
      </button>
      <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Play size={18} fill="currentColor" /></button>
    </div>
  </div>
);

export default RPCManager;
