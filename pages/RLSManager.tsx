
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Shield, Lock, Plus, AlertCircle, Loader2, X, 
  CheckCircle2, Zap, Sliders, Save, Database, Activity, ShieldAlert,
  ChevronRight, ChevronDown
} from 'lucide-react';

const RLSManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'policies' | 'governor'>('policies');
  const [policies, setPolicies] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  
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
      if (curr?.security_config) {
         setSecurityConfig(typeof curr.security_config === 'string' ? JSON.parse(curr.security_config) : curr.security_config);
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const groupedPolicies = useMemo(() => {
    const groups: Record<string, any[]> = {};
    policies.forEach(p => {
      const table = p.tablename;
      if (!groups[table]) groups[table] = [];
      groups[table].push(p);
    });
    return groups;
  }, [policies]);

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
    setSecurityConfig((prev: any) => {
      const next = { ...prev };
      if (!next.table_permissions) next.table_permissions = {};
      if (!next.table_permissions[table]) next.table_permissions[table] = {};
      if (!next.table_permissions[table][role]) next.table_permissions[table][role] = { create: true, read: true, update: true, delete: true };
      
      next.table_permissions[table][role] = {
        ...next.table_permissions[table][role],
        [op]: val
      };
      return next;
    });
  };

  const toggleTable = (tableName: string) => {
    const next = new Set(expandedTables);
    if (next.has(tableName)) next.delete(tableName);
    else next.add(tableName);
    setExpandedTables(next);
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
          <div><h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">Access Control</h1><p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mt-1">RLS & Governor Management</p></div>
        </div>
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
          <button onClick={() => setActiveTab('policies')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeTab === 'policies' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Lock size={16}/> NATIVE RLS</button>
          <button onClick={() => setActiveTab('governor')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeTab === 'governor' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Sliders size={16}/> GOVERNOR</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-10">
        {activeTab === 'policies' ? (
          <div className="max-w-6xl mx-auto space-y-8 pb-40">
             <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-white flex items-center gap-8 shadow-2xl relative overflow-hidden mb-12">
                <div className="absolute top-0 right-0 p-10 opacity-10"><Shield size={180} /></div>
                <div className="w-20 h-20 bg-white/20 rounded-3xl backdrop-blur-md flex items-center justify-center shrink-0"><Zap size={40} /></div>
                <div><h3 className="text-2xl font-black mb-1 italic">Physical Policies</h3><p className="text-indigo-100 text-sm font-medium opacity-80 max-w-2xl">Regras aplicadas no núcleo do PostgreSQL. Isolamento total de dados por linha.</p></div>
             </div>
             
             {Object.keys(groupedPolicies).length === 0 ? <EmptyState /> : (
                Object.entries(groupedPolicies).map(([tableName, tablePolicies]) => (
                  <div key={tableName} className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                    <button onClick={() => toggleTable(tableName)} className="w-full px-10 py-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <Database className="text-indigo-600" size={20} />
                        <span className="text-lg font-black text-slate-900 tracking-tight">public.{tableName}</span>
                        <span className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">{tablePolicies.length} POLICIES</span>
                      </div>
                      {expandedTables.has(tableName) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                    {expandedTables.has(tableName) && (
                      <div className="px-10 pb-8 space-y-4 pt-4 border-t border-slate-50">
                        {tablePolicies.map((p, i) => <PolicyCard key={i} policy={p} />)}
                      </div>
                    )}
                  </div>
                ))
             )}
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-12 pb-40">
             <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
                <div className="flex items-center gap-8 relative z-10">
                   <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shrink-0"><Activity size={40} /></div>
                   <div><h3 className="text-2xl font-black mb-1 italic">Cascata Governor</h3><p className="text-slate-400 text-sm font-medium max-w-xl">Portão de segurança inteligente que valida operações antes do banco de dados.</p></div>
                </div>
                <button onClick={saveGovernor} disabled={executing} className="bg-white text-slate-900 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 hover:bg-indigo-50 transition-all shadow-xl">
                  {executing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Deploy Security Rules
                </button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm space-y-6">
                   <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-3"><Activity size={18} className="text-indigo-600"/> Throttling</h4>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisições/Min por IP</p>
                   <input type="number" value={securityConfig.rate_limit || 0} onChange={(e) => setSecurityConfig({...securityConfig, rate_limit: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-8 text-2xl font-black text-indigo-600 outline-none" />
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm space-y-8">
                   <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-3"><Database size={18} className="text-emerald-600"/> Fast Access Permissions</h4>
                   <div className="space-y-4">
                      {tables.map(t => (
                        <div key={t.name} className="p-6 border border-slate-100 bg-slate-50/50 rounded-3xl flex items-center justify-between gap-8">
                           <div className="flex items-center gap-4 min-w-[140px]"><Database size={14} className="text-slate-400"/><span className="text-sm font-black text-slate-800 font-mono">{t.name}</span></div>
                           <div className="flex-1 flex justify-around gap-4">
                              <PermGroup label="ANON" table={t.name} role="anon" config={securityConfig.table_permissions?.[t.name]?.anon} onUpdate={updateTablePerm} />
                              <PermGroup label="AUTH" table={t.name} role="authenticated" config={securityConfig.table_permissions?.[t.name]?.authenticated} onUpdate={updateTablePerm} />
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
    <div className="flex flex-col items-center gap-2">
       <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase">{label}</span>
       <div className="flex gap-1.5">
          {['create', 'read', 'update', 'delete'].map(op => {
            const isActive = config?.[op] !== false;
            return (
              <button key={op} onClick={() => onUpdate(table, role, op, !isActive)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-600 text-white'}`}>
                <span className="text-[9px] font-black">{op[0].toUpperCase()}</span>
              </button>
            );
          })}
       </div>
    </div>
  );
};

const PolicyCard = ({ policy }: any) => (
  <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex items-center justify-between hover:border-indigo-200 transition-all">
    <div className="flex items-center gap-5">
      <div className="w-10 h-10 bg-white border border-slate-200 text-indigo-600 rounded-xl flex items-center justify-center"><Lock size={18}/></div>
      <div><h4 className="text-sm font-black text-slate-900 tracking-tight">{policy.policyname}</h4><p className="text-[9px] font-mono text-indigo-500 font-bold uppercase tracking-widest mt-1">FOR {policy.cmd} TO {policy.roles.join(', ')}</p></div>
    </div>
    <div className="text-right">
       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Row Filter</span>
       <code className="text-[10px] bg-slate-200 px-3 py-1 rounded-lg font-mono font-bold text-slate-700">{policy.qual}</code>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="py-40 text-center flex flex-col items-center">
    <ShieldAlert size={80} className="text-slate-100 mb-6" />
    <h4 className="text-xl font-black text-slate-300 uppercase tracking-widest">No Active RLS Policies</h4>
  </div>
);

export default RLSManager;
