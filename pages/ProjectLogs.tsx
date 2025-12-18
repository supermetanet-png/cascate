
import React, { useState, useEffect } from 'react';
import { 
  Activity, Terminal, Filter, RefreshCw, 
  ChevronRight, Circle, Clock, Database, Globe, Loader2 
} from 'lucide-react';

const ProjectLogs: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/data/${projectId}/logs`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [projectId]);

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto w-full space-y-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl">
            <Activity size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter">API Observability</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Monitoramento em Tempo Real</p>
          </div>
        </div>
        <button onClick={fetchLogs} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="bg-white border border-slate-200 rounded-[3rem] overflow-hidden shadow-sm">
        {loading && logs.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-300">
             <Loader2 size={40} className="animate-spin mb-4" />
             <p className="text-[10px] font-black uppercase tracking-widest">Coletando telemetria...</p>
          </div>
        ) : (
          <table className="w-full text-left">
             <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data/Hora</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoint</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Latência</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="py-20 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">Nenhum tráfego detectado</td></tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="hover:bg-indigo-50/20 transition-colors group cursor-pointer">
                    <td className="px-10 py-5 text-[12px] font-mono font-bold text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-10 py-5">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase ${log.method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-10 py-5 text-sm font-bold text-slate-600 font-mono tracking-tight">{log.path}</td>
                    <td className="px-10 py-5">
                      <div className="flex items-center gap-2">
                         <Circle size={8} className={log.status_code >= 400 ? 'fill-rose-500 text-rose-500' : 'fill-emerald-500 text-emerald-500'} />
                         <span className={`font-black text-xs ${log.status_code >= 400 ? 'text-rose-600' : 'text-emerald-600'}`}>{log.status_code}</span>
                      </div>
                    </td>
                    <td className="px-10 py-5 text-right font-mono text-xs text-slate-400 font-bold">{log.duration_ms}ms</td>
                  </tr>
                ))}
             </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ProjectLogs;
