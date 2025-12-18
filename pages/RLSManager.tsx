
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Shield, Lock, Unlock, Plus, Trash2, Edit2, AlertCircle, Loader2, X, 
  CheckCircle2, Zap, User, Users, Globe, Eye, Code, ChevronDown, 
  Activity, ShieldAlert, Sliders, Save, Database
} from 'lucide-react';

const RLSManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'policies' | 'governor'>('policies');
  const [policies, setPolicies] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [executing, setExecuting] = useState(false);
  
  // Security Config State
  const [securityConfig, setSecurityConfig] = useState<any>({
    rate_limit: 0,
    table_permissions: {}
  });

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return response.json();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [policiesData, tablesData, projects] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/policies`),
        fetchWithAuth(`/api/data/${projectId}/tables`),
        fetchWithAuth(`/api/control/projects`)
      ]);
      setPolicies(policiesData);
      setTables(tablesData);
      const curr = projects.find((p:any) => p.slug === projectId);
      setProject(curr);
      if (curr?.security_config) setSecurityConfig(curr.security_config);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const saveGovernor = async () => {
    setExecuting(true);
    try {
      await fetchWithAuth(`/api/control/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ security_config: securityConfig })
      });
      setSuccessMsg('Governor security policies updated.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) { setError('Failed to save governor config.'); }
    finally { setExecuting(false); }
  };

  const updateTablePerm = (table: string, role: string, op: string, val: boolean) => {
    const next = { ...securityConfig };
    if (!next.table_permissions[table]) next.table_permissions[table] = {};
    if (!next.table_permissions[table][role]) next.table_permissions[table][role] = { create: true, read: true, update: true, delete: true };
    next.table_permissions[table][role][op] = val;
    setSecurityConfig(next);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAFBFC] overflow-hidden">
      {(error || successMsg) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[400] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || successMsg}</span>
          <button onClick={() => { setError(null); setSuccessMsg(null); }} className="ml-4 opacity-50"><X size={16} /></button>
        </div>
      )}

      <header className="px-10 py-8 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Shield size={24} /></div>
          <div><h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">Security Center</h1><p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mt-1">Multi-layer Governance</p></div>
        </div>
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
          <button onClick={() => setActiveTab('policies')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeTab === 'policies' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Lock size={16}/> RLS POLICIES</button>
          <button onClick={() => setActiveTab('governor')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeTab === 'governor' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Sliders size={16}/> GOVERNOR</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-10">
        {activeTab === 'policies' ? (
          <div className="max-w-6xl mx-auto space-y-8">
             <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-white flex items-center gap-8 shadow-2xl shadow-indigo-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-10"><Shield size={180} /></div>
                <div className="w-20 h-20 bg-white/20 rounded-3xl backdrop-blur-md flex items-center justify-center shrink-0"><Zap size={40} /></div>
                <div><h3 className="text-2xl font-black mb-1">Database RLS (PostgreSQL Native)</h3><p className="text-indigo-100 text-sm font-medium opacity-80 max-w-2xl">Políticas aplicadas diretamente no motor do banco de dados para isolamento físico de linhas.</p></div>
             </div>
             {/* Listagem de políticas simplificada */}
             <div className="grid grid-cols-1 gap-4">
                {policies.length === 0 ? <EmptyState /> : policies.map((p, i) => <PolicyCard key={i} policy={p} />)}
             </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-12">
             <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
                <div className="flex items-center gap-8 relative z-10">
                   <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shrink-0 shadow-2xl shadow-indigo-500/30"><Activity size={40} /></div>
                   <div><h3 className="text-2xl font-black mb-1 italic">Security Governor</h3><p className="text-slate-400 text-sm font-medium max-w-xl">Capa de firewall inteligente que valida permissões CRUD e Rate Limits antes das requisições atingirem o banco.</p></div>
                </div>
                <button onClick={saveGovernor} disabled={executing} className="bg-white text-slate-900 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 hover:bg-indigo-50 transition-all shadow-xl active:scale-95">
                  {executing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Governor Rules
                </button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm space-y-6">
                   <div className="flex items-center gap-4 mb-4"><div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Activity size={20}/></div><h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">Global Rate Limit</h4></div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Requisições por Minuto / IP</p>
                   <input type="number" value={securityConfig.rate_limit} onChange={(e) => setSecurityConfig({...securityConfig, rate_limit: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-8 text-2xl font-black text-indigo-600 outline-none" />
                   <p className="text-[10px] text-slate-400 font-medium">Use <b>0</b> para desativar o limite de tráfego.</p>
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm space-y-8">
                   <div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center"><Database size={20}/></div><h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">Table Access Overrides</h4></div></div>
                   
                   <div className="space-y-4">
                      {tables.map(t => (
                        <div key={t.name} className="p-6 border border-slate-100 bg-slate-50/50 rounded-3xl flex items-center justify-between gap-8 group">
                           <div className="flex items-center gap-4 min-w-[140px]"><div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors"><Database size={14}/></div><span className="text-sm font-black text-slate-800 font-mono tracking-tight">{t.name}</span></div>
                           
                           <div className="flex-1 flex justify-around gap-4">
                              <PermGroup label="ANON" table={t.name} role="anon" config={securityConfig.table_permissions[t.name]?.anon} onUpdate={updateTablePerm} />
                              <div className="w-[1px] bg-slate-200 h-10"></div>
                              <PermGroup label="AUTH" table={t.name} role="authenticated" config={securityConfig.table_permissions[t.name]?.authenticated} onUpdate={updateTablePerm} />
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PermGroup = ({ label, table, role, config = { create: true, read: true, update: true, delete: true }, onUpdate }: any) => {
  return (
    <div className="flex flex-col items-center gap-3">
       <span className="text-[9px] font-black text-slate-400 tracking-widest">{label}</span>
       <div className="flex gap-2">
          {['create', 'read', 'update', 'delete'].map(op => {
            const isActive = config[op] !== false;
            return (
              <button key={op} onClick={() => onUpdate(table, role, op, !isActive)} title={`${op.toUpperCase()}: ${isActive ? 'Allowed' : 'Denied'}`} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-600 text-white shadow-lg shadow-rose-200'}`}>
                <span className="text-[8px] font-black">{op[0].toUpperCase()}</span>
              </button>
            );
          })}
       </div>
    </div>
  );
};

const PolicyCard = ({ policy }: any) => (
  <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] flex items-center justify-between group hover:border-indigo-300 transition-all">
    <div className="flex items-center gap-6">
      <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all"><Lock size={20}/></div>
      <div><h4 className="font-black text-slate-900">{policy.policyname}</h4><p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-1">ON public.{policy.tablename} FOR {policy.cmd}</p></div>
    </div>
    <div className="flex items-center gap-4">
       <div className="text-right"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Visibility</span><code className="text-[10px] font-bold text-indigo-600 font-mono">{policy.qual}</code></div>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="py-40 border-4 border-dashed border-slate-100 rounded-[4rem] text-center flex flex-col items-center">
    <ShieldAlert size={80} className="text-slate-100 mb-6" />
    <h4 className="text-xl font-black text-slate-300 uppercase tracking-widest">No Active RLS Policies</h4>
  </div>
);

export default RLSManager;
