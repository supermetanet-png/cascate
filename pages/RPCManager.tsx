
import React, { useState, useEffect } from 'react';
import { Code2, Play, Plus, Book, Clock, Terminal, Loader2 } from 'lucide-react';

const RPCManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [functions, setFunctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRpc, setSelectedRpc] = useState<string | null>(null);

  useEffect(() => {
    const fetchFunctions = async () => {
      try {
        const response = await fetch(`/api/data/${projectId}/functions`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
        });
        const data = await response.json();
        setFunctions(data);
      } catch (err) {
        console.error('Error fetching functions');
      } finally {
        setLoading(false);
      }
    };
    fetchFunctions();
  }, [projectId]);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full flex gap-8">
      <div className="flex-1 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Database Functions (RPC)</h2>
          <p className="text-slate-500">Your SQL functions are automatically exposed as HTTP endpoints.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {functions.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl text-center text-slate-400">
                No custom SQL functions found in public schema.
              </div>
            ) : (
              functions.map(f => (
                <div key={f.name} className="border border-slate-200 rounded-xl bg-white p-5 hover:border-indigo-200 hover:shadow-sm transition-all flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="p-2 bg-slate-50 text-slate-400 rounded-lg"><Code2 size={20} /></div>
                    <div>
                      <h4 className="font-bold text-slate-900 font-mono">{f.name}</h4>
                      <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">{f.type}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedRpc(f.name)}
                    className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg border border-indigo-100"
                  >
                    View API Endpoint
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="w-96 space-y-6">
        {selectedRpc && (
          <div className="border border-indigo-200 rounded-xl p-6 bg-indigo-50/50 sticky top-8">
            <h3 className="font-bold text-indigo-900 mb-4">Invocação via API</h3>
            <p className="text-xs text-slate-600 mb-4">Use este endpoint para executar a lógica de banco via HTTP:</p>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-400 overflow-x-auto">
              <div className="text-emerald-400">curl</div> -X POST \<br/>
              &nbsp;&nbsp;https://{window.location.host}/api/data/{projectId}/rpc/{selectedRpc} \<br/>
              &nbsp;&nbsp;-H <span className="text-amber-300">"Content-Type: application/json"</span> \<br/>
              &nbsp;&nbsp;-d <span className="text-amber-300">'{`{"param1": "valor"}`}'</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RPCManager;
