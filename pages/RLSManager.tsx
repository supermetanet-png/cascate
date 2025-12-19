
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Shield, Lock, Plus, AlertCircle, Loader2, X, 
  CheckCircle2, Zap, Sliders, Save, Database, Activity, ShieldAlert,
  ChevronRight, ChevronDown, Info
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
  
  // RLS Creator State
  const [showCreator, setShowCreator] = useState(false);
  const [newPolicy, setNewPolicy] = useState({ name: '', table: '', action: 'SELECT', role: 'public', check: 'true' });

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
      setPolicies(Array.isArray(policiesData) ? policiesData : []);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      
      const curr = projects.find((p:any) => p.slug === projectId);
      if (curr?.security_config) {
         const cfg = typeof curr.security_config === 'string' ? JSON.parse(curr.security_config) : curr.security_config;
         setSecurityConfig({ rate_limit: cfg.rate_limit || 0, table_permissions: cfg.table_permissions || {} });
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

  const handleCreateRLS = async () => {
    setExecuting(true);
    try {
      const sql = `CREATE POLICY "${newPolicy.name}" ON public."${newPolicy.table}" FOR ${newPolicy.action} TO ${newPolicy.role} USING (${newPolicy.check});`;
      await fetchWithAuth(`/api/data/${projectId}/query`, { method: 'POST', body: JSON.stringify({ sql }) });
      setShowCreator(false);
      fetchData();
      setSuccessMsg('RLS Policy deployed successfully.');
    } catch (e: any) { setError(e.message); } finally { setExecuting(false); }
  };

  const saveGovernor = async () => {
    setExecuting(true);
    try {
      await fetchWithAuth(`/api/control/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ security_config: securityConfig })
      });
      setSuccessMsg('Governor policies updated.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) { setError('Failed to save config.'); }
    finally { setExecuting(false); }
  };

  return (
    <div className="flex h-full flex-col bg-[#FAFBFC] overflow-hidden">
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
          <div><h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">Access Control</h1><p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mt-1">Multi-Layer Security</p></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setActiveTab('policies')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all ${activeTab === 'policies' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Lock size={16}/> NATIVE RLS</button>
            <button onClick={() => setActiveTab('governor')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all ${activeTab === 'governor' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Sliders size={16}/> GOVERNOR</button>
          </div>
          {activeTab === 'policies' && (
            <button onClick={() => setShowCreator(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"><Plus size={18} /> NEW POLICY</button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-10">
        {activeTab === 'policies' ? (
          <div className="max-w-6xl mx-auto space-y-8 pb-40">
             {Object.entries(groupedPolicies).map(([tableName, tablePolicies]) => (
               <div key={tableName} className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                 <button onClick={() => { const next = new Set(expandedTables); expandedTables.has(tableName) ? next.delete(tableName) : next.add(tableName); setExpandedTables(next); }} className="w-full px-10 py-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4"><Database className="text-indigo-600" size={20} /><span className="text-lg font-black text-slate-900 tracking-tight">public.{tableName}</span></div>
                    {expandedTables.has(tableName) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                 </button>
                 {expandedTables.has(tableName) && (
                   <div className="px-10 pb-8 space-y-4 pt-4 border-t border-slate-50 animate-in fade-in slide-in-from-top-2 duration-300">
                      {tablePolicies.map((p, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex items-center justify-between hover:border-indigo-200 transition-all">
                           <div className="flex items-center gap-5">
                              <div className="w-10 h-10 bg-white border border-slate-200 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm"><Lock size={18}/></div>
                              <div><h4 className="text-sm font-black text-slate-900">{p.policyname}</h4><p className="text-[9px] font-mono text-indigo-500 font-bold uppercase mt-1">FOR {p.cmd} TO {Array.isArray(p.roles) ? p.roles.join(', ') : 'public'}</p></div>
                           </div>
                           <code className="text-[10px] bg-slate-200 px-3 py-1 rounded-lg font-mono font-bold text-slate-700">{p.qual || 'true'}</code>
                        </div>
                      ))}
                   </div>
                 )}
               </div>
             ))}
             {Object.keys(groupedPolicies).length === 0 && <EmptyState />}
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-12 pb-40">
             <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 flex items-center gap-12 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Acesso Permitido</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded bg-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.5)]"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Acesso Bloqueado</span>
                </div>
                <div className="h-8 w-[1px] bg-slate-200"></div>
                <div className="flex items-center gap-4 text-indigo-600">
                  <Info size={20} />
                  <p className="text-[11px] font-black uppercase text-slate-400">Clique nas iniciais (C, R, U, D) para alternar permissões lógicas da API.</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm space-y-6">
                   <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-3"><Activity size={18} className="text-indigo-600"/> Rate Limiting</h4>
                   <input type="number" value={securityConfig.rate_limit || 0} onChange={(e) => setSecurityConfig({...securityConfig, rate_limit: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-8 text-2xl font-black text-indigo-600 outline-none" />
                   <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase">Limite global de requisições/min por IP no gateway da aplicação.</p>
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm space-y-8">
                   <div className="flex items-center justify-between mb-8">
                      <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-3"><Database size={18} className="text-emerald-500"/> Logical Permissions</h4>
                      <button onClick={saveGovernor} disabled={executing} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-600 transition-all shadow-xl">
                        {executing ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Governor
                      </button>
                   </div>
                   <div className="space-y-4">
                      {tables.map(t => (
                        <div key={t.name} className="p-6 border border-slate-100 bg-slate-50/50 rounded-3xl flex items-center justify-between hover:bg-indigo-50/10 transition-colors">
                           <div className="flex items-center gap-4 min-w-[140px]"><Database size={14} className="text-slate-400"/><span className="text-sm font-black font-mono text-slate-800">{t.name}</span></div>
                           <div className="flex-1 flex justify-around gap-4">
                              <PermGroup label="ANON" table={t.name} role="anon" config={securityConfig.table_permissions?.[t.name]?.anon} onUpdate={(tbl: string, rl: string, op: string, val: boolean) => {
                                const next = { ...securityConfig };
                                if (!next.table_permissions) next.table_permissions = {};
                                if (!next.table_permissions[tbl]) next.table_permissions[tbl] = {};
                                if (!next.table_permissions[tbl][rl]) next.table_permissions[tbl][rl] = { create: true, read: true, update: true, delete: true };
                                next.table_permissions[tbl][rl][op] = val;
                                setSecurityConfig(next);
                                setSuccessMsg(`Acesso de [${rl.toUpperCase()}] para [${op.toUpperCase()}] em [${tbl}] ${val ? 'ativado' : 'bloqueado'}.`);
                                setTimeout(() => setSuccessMsg(null), 3000);
                              }} />
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {showCreator && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[500] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white rounded-[3rem] w-full max-w-xl p-12 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-300">
              <button onClick={() => setShowCreator(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition-all"><X size={24} /></button>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">New RLS Policy</h3>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Policy Identifier</label>
                    <input placeholder="Ex: enable_read_for_anon" value={newPolicy.name} onChange={(e) => setNewPolicy({...newPolicy, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Table</label>
                    <select value={newPolicy.table} onChange={(e) => setNewPolicy({...newPolicy, table: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-black text-indigo-600 outline-none">
                       <option value="">Select Table</option>
                       {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operation</label>
                       <select value={newPolicy.action} onChange={(e) => setNewPolicy({...newPolicy, action: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-black text-emerald-600 outline-none">
                          <option value="SELECT">SELECT</option><option value="INSERT">INSERT</option><option value="UPDATE">UPDATE</option><option value="DELETE">DELETE</option><option value="ALL">ALL</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Role</label>
                       <input placeholder="anon" value={newPolicy.role} onChange={(e) => setNewPolicy({...newPolicy, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none" />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SQL Expression (USING)</label>
                    <textarea placeholder="true" value={newPolicy.check} onChange={(e) => setNewPolicy({...newPolicy, check: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-mono font-bold text-indigo-600 outline-none h-32 resize-none" />
                 </div>
                 <button onClick={handleCreateRLS} disabled={executing || !newPolicy.name || !newPolicy.table} className="w-full py-5 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-30">
                    {executing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Deploy Policy to Database'}
                 </button>
              </div>
           </div>
        </div>
      )}
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
              <button 
                key={op} 
                onClick={() => onUpdate(table, role, op, !isActive)} 
                title={`${label} [${op.toUpperCase()}] Access`}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-[0_4px_10px_rgba(16,185,129,0.1)]' : 'bg-rose-600 text-white shadow-[0_4px_10px_rgba(225,29,72,0.3)]'}`}
              >
                <span className="text-[10px] font-black">{op[0].toUpperCase()}</span>
              </button>
            );
          })}
       </div>
    </div>
  );
};

const EmptyState = () => (
  <div className="py-40 text-center flex flex-col items-center animate-in fade-in duration-700">
    <ShieldAlert size={80} className="text-slate-100 mb-6" />
    <h4 className="text-xl font-black text-slate-300 uppercase tracking-widest italic">No Active Database Policies</h4>
    <p className="text-slate-400 text-sm mt-2 font-medium">Create your first Row-Level Security policy to secure this instance.</p>
  </div>
);

export default RLSManager;
