import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Lock, Unlock, Plus, Trash2, Edit2, AlertCircle, Loader2, X, Terminal, CheckCircle2, Zap, User, Users, Globe, Eye, Code } from 'lucide-react';

const RLSManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [policies, setPolicies] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [executing, setExecuting] = useState(false);

  // New Policy State
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    table: '',
    command: 'SELECT',
    role: 'public',
    using: 'true',
    withCheck: ''
  });

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${response.status}`);
    }
    return response.json();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [policiesData, tablesData] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/policies`),
        fetchWithAuth(`/api/data/${projectId}/tables`)
      ]);
      setPolicies(policiesData);
      setTables(tablesData);
      if (tablesData.length > 0) setNewPolicy(prev => ({ ...prev, table: tablesData[0].name }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const handleDelete = async (table: string, name: string) => {
    if (!confirm(`Delete policy "${name}" on "${table}"?`)) return;
    setExecuting(true);
    try {
      await fetchWithAuth(`/api/data/${projectId}/policies/${table}/${name}`, { method: 'DELETE' });
      setSuccessMsg('Policy successfully dropped.');
      fetchData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleCreate = async () => {
    setExecuting(true);
    try {
      await fetchWithAuth(`/api/data/${projectId}/policies`, {
        method: 'POST',
        body: JSON.stringify(newPolicy)
      });
      setShowModal(false);
      setSuccessMsg('Policy created and RLS enforced.');
      fetchData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const applyTemplate = (type: string) => {
    switch (type) {
      case 'read_all':
        setNewPolicy({ ...newPolicy, name: `Enable read for everyone`, command: 'SELECT', role: 'public', using: 'true', withCheck: '' });
        break;
      case 'auth_all':
        setNewPolicy({ ...newPolicy, name: `Authenticated full access`, command: 'ALL', role: 'authenticated', using: 'true', withCheck: 'true' });
        break;
      case 'user_own':
        setNewPolicy({ ...newPolicy, name: `Users can only see own data`, command: 'SELECT', role: 'authenticated', using: 'user_id = auth.uid()', withCheck: '' });
        break;
      case 'user_manage':
        setNewPolicy({ ...newPolicy, name: `Users can manage own data`, command: 'ALL', role: 'authenticated', using: 'user_id = auth.uid()', withCheck: 'user_id = auth.uid()' });
        break;
    }
  };

  const generatedSQL = `CREATE POLICY "${newPolicy.name || 'name'}"\nON public."${newPolicy.table || 'table'}"\nFOR ${newPolicy.command}\nTO ${newPolicy.role}\nUSING (${newPolicy.using || 'true'})${newPolicy.withCheck ? `\nWITH CHECK (${newPolicy.withCheck})` : ''};`;

  return (
    <div className="flex flex-col h-full bg-[#FAFBFC] overflow-hidden">
      <header className="px-10 py-10 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.8rem] flex items-center justify-center shadow-2xl shadow-slate-200">
            <Shield size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">Access Control</h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">Row-Level Security & Orchestration</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-[1.5rem] font-black flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
          <Plus size={24} /> CREATE POLICY
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-10 relative">
        {(error || successMsg) && (
          <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[200] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
            {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            <span className="text-sm font-black tracking-tight">{error || successMsg}</span>
            <button onClick={() => { setError(null); setSuccessMsg(null); }} className="ml-4 opacity-50"><X size={16} /></button>
          </div>
        )}

        <div className="max-w-6xl mx-auto space-y-10">
          <div className="bg-indigo-600 rounded-[3rem] p-12 text-white flex items-center gap-10 relative overflow-hidden shadow-2xl shadow-indigo-100">
            <div className="absolute top-0 right-0 p-12 opacity-10"><Shield size={220} /></div>
            <div className="w-24 h-24 bg-white/20 rounded-[2rem] backdrop-blur-md flex items-center justify-center"><Zap size={48} className="text-white" /></div>
            <div className="relative z-10 max-w-2xl">
              <h4 className="text-3xl font-black tracking-tight mb-2">Physical Security Enforcement</h4>
              <p className="text-indigo-100 text-lg font-medium leading-relaxed">Cascata leverages native PostgreSQL RLS. Each policy is compiled into the query execution plan, ensuring high-performance data isolation per role.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between px-4">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Active Manifest ({policies.length})</h3>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-40 text-slate-300 gap-6">
                <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest">Scanning Schemas...</span>
              </div>
            ) : policies.length === 0 ? (
              <div className="bg-white border-4 border-dashed border-slate-100 rounded-[4rem] p-32 text-center flex flex-col items-center">
                <Unlock className="text-slate-100 mb-8" size={120} />
                <h4 className="text-2xl font-black text-slate-300 tracking-tight uppercase tracking-[0.1em]">No Security Policies Defined</h4>
                <p className="text-slate-400 mt-4 font-medium max-w-sm">RLS is disabled by default. Your data is currently accessible based on standard grant permissions.</p>
                <button onClick={() => setShowModal(true)} className="mt-10 bg-slate-900 text-white px-10 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest">Shield this Instance</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 pb-20">
                {policies.map((p, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 hover:border-indigo-300 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all group flex flex-col gap-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                          <Lock size={24} />
                        </div>
                        <div>
                          <h4 className="text-xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{p.policyname}</h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg uppercase tracking-widest border border-indigo-100">{p.tablename}</span>
                            <span className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.cmd}</span>
                            <span className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              {p.roles.includes('authenticated') ? <Users size={12} /> : p.roles.includes('anon') ? <User size={12} /> : <Globe size={12} />}
                              {p.roles.join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <button onClick={() => handleDelete(p.tablename, p.policyname)} className="p-3 text-slate-200 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all">
                           <Trash2 size={20} />
                         </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex flex-col gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Eye size={12} /> Row Visibility (USING)</span>
                        <code className="text-xs font-mono text-slate-700">{p.qual || 'true'}</code>
                      </div>
                      <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex flex-col gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Edit2 size={12} /> Write Validation (WITH CHECK)</span>
                        <code className="text-xs font-mono text-slate-700">{p.with_check || 'null'}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* NO-CODE POWERFUL POLICY BUILDER MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[300] flex items-center justify-center p-8 overflow-y-auto">
          <div className="bg-white rounded-[4rem] w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
            <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-8">
                <div className="w-16 h-16 bg-slate-900 rounded-[1.8rem] flex items-center justify-center text-white shadow-2xl">
                  <Shield size={32} />
                </div>
                <div>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter">Policy Architect</h3>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">No-Code RLS Generator</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400">
                <X size={32} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-12 flex flex-col lg:flex-row gap-12">
              <div className="flex-1 space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Logic Template</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => applyTemplate('read_all')} className="p-5 border border-slate-200 rounded-[1.8rem] text-left hover:border-indigo-600 hover:bg-indigo-50 transition-all flex flex-col gap-2 group">
                      <span className="text-[10px] font-black text-slate-900 uppercase">Public Read</span>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Allow anyone to read data without authentication.</p>
                    </button>
                    <button onClick={() => applyTemplate('auth_all')} className="p-5 border border-slate-200 rounded-[1.8rem] text-left hover:border-indigo-600 hover:bg-indigo-50 transition-all flex flex-col gap-2 group">
                      <span className="text-[10px] font-black text-slate-900 uppercase">Authenticated Full</span>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Logged users can perform all actions.</p>
                    </button>
                    <button onClick={() => applyTemplate('user_own')} className="p-5 border border-slate-200 rounded-[1.8rem] text-left hover:border-indigo-600 hover:bg-indigo-50 transition-all flex flex-col gap-2 group">
                      <span className="text-[10px] font-black text-slate-900 uppercase">Owner Visibility</span>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Restrict data visibility to the record owner.</p>
                    </button>
                    <button onClick={() => applyTemplate('user_manage')} className="p-5 border border-slate-200 rounded-[1.8rem] text-left hover:border-indigo-600 hover:bg-indigo-50 transition-all flex flex-col gap-2 group">
                      <span className="text-[10px] font-black text-slate-900 uppercase">Owner Management</span>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Full CRUD control for record owners only.</p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Table</label>
                    <select value={newPolicy.table} onChange={(e) => setNewPolicy({ ...newPolicy, table: e.target.value })} className="w-full bg-slate-100 border-none rounded-2xl py-4 px-6 text-sm font-black text-slate-900 outline-none">
                      {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Policy Identity</label>
                    <input value={newPolicy.name} onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })} className="w-full bg-slate-100 border-none rounded-2xl py-4 px-6 text-sm font-bold text-slate-900 outline-none" placeholder="e.g. users_can_read_own" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Command Mode</label>
                    <div className="flex gap-2">
                      {['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'].map(cmd => (
                        <button key={cmd} onClick={() => setNewPolicy({ ...newPolicy, command: cmd })} className={`flex-1 py-3 text-[9px] font-black rounded-xl border transition-all ${newPolicy.command === cmd ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>{cmd}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role Permission</label>
                    <div className="flex gap-2">
                      {['public', 'authenticated', 'anon'].map(role => (
                        <button key={role} onClick={() => setNewPolicy({ ...newPolicy, role })} className={`flex-1 py-3 text-[9px] font-black rounded-xl border transition-all ${newPolicy.role === role ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-200'}`}>{role.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visibility Logic (USING)</label>
                      <button onClick={() => setNewPolicy({ ...newPolicy, using: 'auth.uid() = user_id' })} className="text-[9px] font-black text-indigo-600 hover:underline">Insert auth.uid()</button>
                    </div>
                    <textarea value={newPolicy.using} onChange={(e) => setNewPolicy({ ...newPolicy, using: e.target.value })} className="w-full bg-slate-900 text-emerald-400 p-6 rounded-[1.8rem] font-mono text-sm h-24 outline-none border-2 border-transparent focus:border-indigo-500/30" />
                  </div>
                  {(newPolicy.command !== 'SELECT' && newPolicy.command !== 'DELETE') && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validation Logic (WITH CHECK)</label>
                        <button onClick={() => setNewPolicy({ ...newPolicy, withCheck: 'auth.uid() = user_id' })} className="text-[9px] font-black text-indigo-600 hover:underline">Insert auth.uid()</button>
                      </div>
                      <textarea value={newPolicy.withCheck} onChange={(e) => setNewPolicy({ ...newPolicy, withCheck: e.target.value })} className="w-full bg-slate-900 text-amber-400 p-6 rounded-[1.8rem] font-mono text-sm h-24 outline-none border-2 border-transparent focus:border-indigo-500/30" />
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:w-96 space-y-6">
                <div className="bg-slate-950 rounded-[3rem] p-8 flex flex-col gap-6 h-fit sticky top-0 shadow-2xl border border-white/5">
                  <div className="flex items-center gap-3 text-white border-b border-white/10 pb-6">
                    <Code size={20} className="text-indigo-400" />
                    <span className="font-black text-sm uppercase tracking-widest">Manifest Preview</span>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-400 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                    {generatedSQL}
                  </pre>
                  <div className="mt-4 pt-6 border-t border-white/10">
                    <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                      <p className="text-[10px] text-indigo-300 font-bold leading-relaxed">Tip: "USING" controls which rows are returned in a SELECT. "WITH CHECK" controls data validation on INSERT/UPDATE.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="p-12 border-t border-slate-100 bg-slate-50/50 flex gap-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-6 text-slate-400 font-black uppercase tracking-widest text-xs">Abort</button>
              <button onClick={handleCreate} disabled={executing || !newPolicy.name} className="flex-[3] py-6 bg-indigo-600 text-white font-black rounded-[2rem] shadow-2xl shadow-indigo-200 uppercase tracking-widest text-xs flex items-center justify-center gap-3">
                {executing ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} /> COMMIT SECURITY POLICY</>}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default RLSManager;