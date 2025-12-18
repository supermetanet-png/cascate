
import React, { useState, useEffect } from 'react';
import { 
  Activity, Terminal, Filter, RefreshCw, 
  ChevronRight, Circle, Clock, Database, Globe 
} from 'lucide-react';

const ProjectLogs: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    // Mock de tráfego da API
    const mockLogs = [
      { id: '1', method: 'GET', path: '/tables/users/data', status: 200, duration: 42, role: 'authenticated', time: '12:45:01' },
      { id: '2', method: 'POST', path: '/tables/orders/rows', status: 201, duration: 128, role: 'service_role', time: '12:44:50' },
      { id: '3', method: 'GET', path: '/storage/avatars/object/p_1.jpg', status: 404, duration: 12, role: 'anon', time: '12:43:10' },
      { id: '4', method: 'PUT', path: '/tables/profiles/rows', status: 200, duration: 89, role: 'authenticated', time: '12:42:00' },
    ];
    setLogs(mockLogs);
    setLoading(false);
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
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center gap-10">
           <FilterItem icon={<Globe size={14}/>} label="Todos os Métodos" />
           <FilterItem icon={<Database size={14}/>} label="Apenas Tabelas" />
           <FilterItem icon={<Clock size={14}/>} label="Última Hora" />
        </div>
        
        <table className="w-full text-left">
           <thead className="bg-white border-b border-slate-100">
              <tr>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoint</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Latência</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-indigo-50/20 transition-colors group cursor-pointer">
                  <td className="px-10 py-5 text-[12px] font-mono font-bold text-slate-400">{log.time}</td>
                  <td className="px-10 py-5">
                    <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase ${log.method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      {log.method}
                    </span>
                  </td>
                  <td className="px-10 py-5 text-sm font-bold text-slate-600 font-mono tracking-tight">{log.path}</td>
                  <td className="px-10 py-5">
                    <div className="flex items-center gap-2">
                       <Circle size={8} className={log.status >= 400 ? 'fill-rose-500 text-rose-500' : 'fill-emerald-500 text-emerald-500'} />
                       <span className={`font-black text-xs ${log.status >= 400 ? 'text-rose-600' : 'text-emerald-600'}`}>{log.status}</span>
                    </div>
                  </td>
                  <td className="px-10 py-5 text-right font-mono text-xs text-slate-400 font-bold">{log.duration}ms</td>
                </tr>
              ))}
           </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-10">
         <MetricCard label="Média de Resposta" value="112ms" trend="-12%" />
         <MetricCard label="Taxa de Erro (4xx/5xx)" value="0.4%" trend="+0.02%" />
         <MetricCard label="Volume Total (24h)" value="12.4k req" trend="+5%" />
      </div>
    </div>
  );
};

const FilterItem = ({ icon, label }: any) => (
  <button className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
    {icon} {label}
  </button>
);

const MetricCard = ({ label, value, trend }: any) => (
  <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
    <div className="flex items-end justify-between">
       <span className="text-3xl font-black text-slate-900 tracking-tighter">{value}</span>
       <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${trend.startsWith('-') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{trend}</span>
    </div>
  </div>
);

export default ProjectLogs;
