
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, Terminal, Filter, RefreshCw, 
  ChevronRight, Circle, Clock, Database, Globe, Loader2,
  Search, ShieldAlert, Trash2, Download, X, Eye, 
  Settings2, Calendar, Lock, Globe2, Cpu, ArrowRight,
  CheckCircle2, Code, ShieldCheck, EyeOff, AlertTriangle
} from 'lucide-react';

const ProjectLogs: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [currentUserIp, setCurrentUserIp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hideInternal, setHideInternal] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('cascata_token');
      const [logsRes, projectsRes, ipRes] = await Promise.all([
        fetch(`/api/data/${projectId}/logs`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/control/projects', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/control/me/ip', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      const logsData = await logsRes.json();
      const projectsData = await projectsRes.json();
      const ipData = await ipRes.json();
      
      setLogs(Array.isArray(logsData) ? logsData : []);
      setProject(projectsData.find((p: any) => p.slug === projectId));
      setCurrentUserIp(ipData.ip);
    } catch (err) {
      console.error('Telemetria offline');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBlockIp = async (ip: string, isInternal: boolean) => {
    // PROTEÇÃO CRÍTICA: Bloqueia tentativa de bloquear o próprio servidor ou o IP do operador atual
    const isSelfBlocking = ip === currentUserIp;
    
    if (isInternal) {
      alert("Operação Abortada: Este IP pertence à infraestrutura interna da Cascata e não pode ser bloqueado para garantir a integridade do Studio.");
      return;
    }

    if (isSelfBlocking) {
      if (!confirm(`ALERTA DE SEGURANÇA: O IP ${ip} corresponde ao SEU IP ATUAL. Se você bloquear este IP, perderá acesso imediato ao painel e a todas as APIs. Deseja realmente prosseguir com este auto-bloqueio?`)) return;
    } else {
      if (!confirm(`Confirmar bloqueio do IP ${ip}? Ele perderá acesso imediato a todas as APIs deste projeto.`)) return;
    }

    setExecuting(true);
    try {
      const response = await fetch(`/api/control/projects/${projectId}/block-ip`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify({ ip })
      });
      if (response.ok) {
        setSuccess(`IP ${ip} bloqueado.`);
        fetchData();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e) {
      setError("Erro ao bloquear IP.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setExecuting(false);
    }
  };

  const handleClearLogs = async (days: number) => {
    if (!confirm(`Remover permanentemente logs com mais de ${days} dias?`)) return;
    setExecuting(true);
    try {
      await fetch(`/api/control/projects/${projectId}/logs?days=${days}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      setSuccess(`Registros removidos.`);
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      alert("Erro na limpeza");
    } finally {
      setExecuting(false);
    }
  };

  const handleExportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs_${projectId}_${new Date().toISOString()}.json`;
    link.click();
  };

  const filteredLogs = hideInternal 
    ? logs.filter(l => !l.geo_info?.is_internal) 
    : logs;

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC] overflow-hidden">
      {/* Notifications */}
      {success && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[600] bg-indigo-600 text-white px-8 py-4 rounded-[2rem] shadow-2xl animate-bounce flex items-center gap-3">
          <CheckCircle2 size={18} />
          <span className="text-xs font-black uppercase tracking-widest">{success}</span>
        </div>
      )}
      {error && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[600] bg-rose-600 text-white px-8 py-4 rounded-[2rem] shadow-2xl animate-pulse flex items-center gap-3">
          <AlertTriangle size={18} />
          <span className="text-xs font-black uppercase tracking-widest">{error}</span>
        </div>
      )}

      <header className="px-10 py-8 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl">
            <Activity size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none">Observability Hub</h2>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em] mt-1">Deep API Telemetry & Traffic Insights</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
             <button 
                onClick={() => setHideInternal(!hideInternal)} 
                className={`p-3 transition-all rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${hideInternal ? 'text-slate-400' : 'bg-white shadow-sm text-indigo-600'}`}
                title={hideInternal ? "Mostrar Tráfego Interno" : "Ocultar Tráfego Interno"}
              >
                {hideInternal ? <EyeOff size={18} /> : <Eye size={18} />}
                {hideInternal ? 'INTERNAL HIDDEN' : 'INTERNAL VISIBLE'}
             </button>
             <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
             <button onClick={() => fetchData()} className="p-3 text-slate-500 hover:text-indigo-600 transition-all"><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
             <button onClick={handleExportLogs} className="p-3 text-slate-500 hover:text-indigo-600 transition-all"><Download size={20} /></button>
             <button onClick={() => setShowSettings(true)} className="p-3 text-slate-500 hover:text-indigo-600 transition-all"><Settings2 size={20} /></button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        <main className="flex-1 overflow-y-auto px-10 py-10">
          <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Snapshot</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoint</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Identity</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLogs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="py-40 text-center">
                      <Terminal size={64} className="mx-auto text-slate-100 mb-6" />
                      <p className="text-sm font-black text-slate-300 uppercase tracking-widest">Awaiting first request...</p>
                    </td>
                  </tr>
                ) : filteredLogs.map((log) => {
                  const isInternal = log.geo_info?.is_internal;
                  return (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className={`hover:bg-indigo-50/30 transition-all cursor-pointer group ${selectedLog?.id === log.id ? 'bg-indigo-50' : ''} ${isInternal ? 'opacity-60' : ''}`}
                    >
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">{new Date(log.created_at).toLocaleTimeString()}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">{new Date(log.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${log.method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            {log.method}
                          </span>
                          <div className="flex flex-col">
                            <code className="text-sm font-mono font-bold text-slate-600 truncate max-w-[200px]">{log.path}</code>
                            {isInternal && <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1"><ShieldCheck size={8} /> STUDIO INTERNAL</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                          {log.user_role}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${log.status_code >= 400 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          <Circle size={8} className={log.status_code >= 400 ? 'fill-rose-500' : 'fill-emerald-500'} />
                          <span className="font-black text-xs">{log.status_code}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                         <span className={`text-xs font-mono font-black ${log.duration_ms > 100 ? 'text-amber-500' : 'text-emerald-500'}`}>
                           {log.duration_ms}ms
                         </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>

        {/* LOG DETAILS DRAWER */}
        {selectedLog && (
          <aside className="w-[500px] bg-white border-l border-slate-200 overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col shadow-2xl relative z-20">
            <header className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${selectedLog.status_code >= 400 ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                   <Activity size={24} />
                </div>
                <div>
                   <h3 className="text-xl font-black text-slate-900 tracking-tight">Request DNA</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {selectedLog.id.slice(0, 8)}...</p>
                </div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-3 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={24}/></button>
            </header>

            <div className="p-10 space-y-10">
              {/* Security Block Action with Intelligence */}
              <div className={`rounded-[2.5rem] p-8 text-white relative overflow-hidden group ${selectedLog.geo_info?.is_internal ? 'bg-slate-900' : 'bg-rose-600'}`}>
                <ShieldAlert className="absolute -bottom-4 -right-4 w-32 h-32 opacity-10 group-hover:scale-125 transition-transform" />
                <h4 className="font-black uppercase text-xs tracking-widest mb-1">Source Governance</h4>
                <p className="text-[10px] font-medium opacity-80 mb-6 flex items-center gap-2">
                  IP: {selectedLog.client_ip} 
                  {selectedLog.client_ip === currentUserIp && <span className="bg-white/20 px-2 py-0.5 rounded-lg border border-white/10">(SEU IP ATUAL)</span>}
                </p>
                
                <button 
                  onClick={() => handleBlockIp(selectedLog.client_ip, selectedLog.geo_info?.is_internal)}
                  disabled={project?.blocklist?.includes(selectedLog.client_ip) || selectedLog.geo_info?.is_internal}
                  className="w-full bg-white text-slate-900 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  {selectedLog.geo_info?.is_internal ? (
                    <><Lock size={14}/> IP INTERNO PROTEGIDO</>
                  ) : project?.blocklist?.includes(selectedLog.client_ip) ? (
                    <><Lock size={14}/> IP JÁ BLOQUEADO</>
                  ) : (
                    <><ShieldAlert size={14} className="text-rose-600"/> BLOQUEAR ORIGEM</>
                  )}
                </button>
                {selectedLog.client_ip === currentUserIp && !selectedLog.geo_info?.is_internal && (
                  <p className="mt-4 text-[9px] font-black text-rose-200 leading-tight text-center uppercase tracking-widest">CUIDADO: BLOQUEAR SEU PRÓPRIO IP INTERROMPERÁ SEU ACESSO.</p>
                )}
              </div>

              {/* Rich Metadata Sections */}
              <div className="space-y-8">
                <DetailSection icon={<Globe2 size={16}/>} label="Origin Insights">
                  <div className="grid grid-cols-2 gap-4">
                    <InfoBox label="Client IP" value={selectedLog.client_ip} />
                    <InfoBox label="Latency" value={`${selectedLog.duration_ms}ms`} />
                  </div>
                </DetailSection>

                <DetailSection icon={<Cpu size={16}/>} label="Client Fingerprint">
                   <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 font-mono text-[10px] text-slate-500 break-words leading-relaxed">
                     {selectedLog.user_agent || 'Unknown UA'}
                   </div>
                </DetailSection>

                <DetailSection icon={<Code size={16}/>} label="Request Payload">
                   <pre className="bg-slate-950 text-emerald-400 p-6 rounded-[2rem] font-mono text-[11px] overflow-auto max-h-60 shadow-inner">
                     {JSON.stringify(selectedLog.payload, null, 2)}
                   </pre>
                </DetailSection>

                <DetailSection icon={<Lock size={16}/>} label="System Headers">
                   <pre className="bg-slate-50 border border-slate-100 p-6 rounded-[2rem] font-mono text-[11px] text-slate-600 overflow-auto">
                     {JSON.stringify(selectedLog.headers, null, 2)}
                   </pre>
                </DetailSection>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* SETTINGS / CLEANUP MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[500] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white rounded-[4rem] w-full max-w-2xl p-12 shadow-2xl border border-slate-200 animate-in zoom-in-95">
              <header className="flex items-center justify-between mb-10">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Settings2 size={24} /></div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Telemetria Governance</h3>
                 </div>
                 <button onClick={() => setShowSettings(false)} className="text-slate-300 hover:text-slate-900 transition-colors"><X size={32}/></button>
              </header>

              <div className="space-y-12">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Manual Purge Controls</label>
                    <div className="grid grid-cols-3 gap-3">
                       {[3, 7, 15, 30, 60, 90].map(days => (
                         <button 
                           key={days} 
                           onClick={() => handleClearLogs(days)}
                           className="py-4 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all flex flex-col items-center gap-1 group"
                         >
                           <Trash2 size={14} className="group-hover:animate-bounce" />
                           {days} Dias
                         </button>
                       ))}
                    </div>
                 </div>

                 <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-4">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <Calendar size={18} className="text-indigo-600" />
                          <span className="text-sm font-bold text-slate-800">Retention Strategy</span>
                       </div>
                       <select 
                        value={project?.log_retention_days || 30}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await fetch(`/api/control/projects/${projectId}/settings`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` },
                            body: JSON.stringify({ log_retention_days: parseInt(val) })
                          });
                          fetchData();
                        }}
                        className="bg-white border-none rounded-xl px-4 py-2 text-xs font-black text-indigo-600 outline-none shadow-sm"
                       >
                          <option value="7">7 Dias</option>
                          <option value="30">30 Dias</option>
                          <option value="90">90 Dias</option>
                          <option value="365">1 Ano</option>
                       </select>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                       O sistema executa automaticamente um cron job a cada 24h para remover registros que excedam sua política de retenção.
                    </p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const DetailSection: React.FC<{ icon: React.ReactNode, label: string, children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3 text-slate-400">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </div>
    {children}
  </div>
);

const InfoBox: React.FC<{ label: string, value: string }> = ({ label, value }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-1">
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">{label}</span>
    <span className="text-xs font-bold text-slate-900 font-mono truncate">{value}</span>
  </div>
);

export default ProjectLogs;
