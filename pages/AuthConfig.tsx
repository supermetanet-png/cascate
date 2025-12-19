
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Mail, Globe, ShieldCheck, UserPlus, Lock, Key, Loader2, 
  Calendar, MoreHorizontal, User, AlertCircle, Info, Link2,
  X, Search, CheckCircle2, Star, Database, ArrowRight, Sparkles,
  ChevronRight, Shield, Settings
} from 'lucide-react';

const AuthConfig: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [emailAuth, setEmailAuth] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', target_table: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Mapping State
  const [tables, setTables] = useState<any[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [mapping, setMapping] = useState({
    principal_table: '',
    additional_tables: [] as string[]
  });

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed request');
    }
    return response.json();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, projectsData, tablesData] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/auth/users`),
        fetchWithAuth('/api/control/projects'),
        fetchWithAuth(`/api/data/${projectId}/tables`)
      ]);
      
      setUsers(usersData);
      setTables(tablesData);
      
      const proj = projectsData.find((p: any) => p.slug === projectId);
      if (proj?.metadata?.user_table_mapping) {
        setMapping(proj.metadata.user_table_mapping);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!mapping.principal_table) {
      setError("É obrigatório escolher uma tabela principal para o mapeamento.");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithAuth(`/api/data/${projectId}/auth/mapping`, {
        method: 'POST',
        body: JSON.stringify(mapping)
      });
      setSuccess("Mapeamento de usuários sincronizado.");
      setShowMappingModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetchWithAuth(`/api/data/${projectId}/auth/users`, {
        method: 'POST',
        body: JSON.stringify(newUser)
      });
      setSuccess("Usuário e perfil vinculados com sucesso.");
      setShowAddUser(false);
      setNewUser({ email: '', password: '', target_table: '' });
      fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await fetchWithAuth(`/api/data/${projectId}/auth/users`);
      setUsers(data);
    } catch (err: any) { setError(err.message); }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const filteredTables = tables.filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()));

  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto w-full space-y-12 pb-32">
      {/* Toast Notifications */}
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[1000] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
          <button onClick={() => { setError(null); setSuccess(null); }} className="ml-4 opacity-50"><X size={16} /></button>
        </div>
      )}

      <div className="flex items-end justify-between gap-8">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Identity Services</h2>
          <p className="text-slate-500 mt-2 text-lg">Manage users and authentication providers for {projectId}.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowMappingModal(true)}
            className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Link2 size={20} /> LINKAR USER
          </button>
          <button 
            onClick={() => setShowAddUser(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all shadow-xl shadow-indigo-100 hover:-translate-y-0.5"
          >
            <UserPlus size={20} /> CREATE USER
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white flex items-center gap-8 border border-white/5 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-10"><ShieldCheck size={140} /></div>
         <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <Info size={32} className="text-indigo-400" />
         </div>
         <div className="relative z-10">
            <h4 className="font-black text-lg uppercase tracking-tight mb-1">Identity Separation & Mapping</h4>
            <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-2xl">
              Usuários do projeto <b>"{projectId}"</b> residem no esquema isolado. Vincule-os a tabelas do esquema <code>public</code> para gerenciar perfis, cargos e RLS granulares.
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              Project Users <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{users.length}</span>
            </h3>
          </div>

          <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
                <span className="text-xs font-bold uppercase tracking-widest">Querying auth schema...</span>
              </div>
            ) : users.length > 0 ? (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Identifier</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                    <th className="px-8 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            <User size={18} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{user.email}</span>
                            <span className="text-[10px] font-mono text-slate-400">{user.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-lg border border-emerald-100 uppercase tracking-widest">
                          Email
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <Calendar size={14} className="text-slate-300" />
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                          <MoreHorizontal size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-24 flex flex-col items-center justify-center gap-4 text-slate-300">
                <ShieldCheck size={48} className="opacity-10" />
                <p className="text-sm font-bold uppercase tracking-widest text-slate-400">No users found in this project</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-8">
             <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Mapping Status</h3>
                <Settings size={20} className="text-slate-300" />
             </div>

             <section className="space-y-4">
                <div className="flex flex-col gap-2">
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tabela Principal (Auth Map)</span>
                   <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                      <Database size={16} className="text-indigo-600" />
                      <span className="text-sm font-black text-indigo-900">{mapping.principal_table || 'Nenhuma tabela mapeada'}</span>
                   </div>
                </div>
                
                {mapping.additional_tables.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tabelas Alternativas</span>
                    <div className="flex flex-wrap gap-2">
                       {mapping.additional_tables.map(t => (
                         <span key={t} className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{t}</span>
                       ))}
                    </div>
                  </div>
                )}
             </section>

             <div className="pt-6 border-t border-slate-100">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Instance Security</p>
               <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                 <p className="text-xs text-slate-600 leading-relaxed font-medium">Cada novo usuário criará automaticamente um registro em <code>{mapping.principal_table}</code> vinculando via ID.</p>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* MAPPING MODAL (FLUTTERFLOW STYLE) */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[1100] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95">
             <header className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.8rem] flex items-center justify-center shadow-xl"><Link2 size={32} /></div>
                  <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter">User Data Mapping</h3><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Conecte o Auth ao esquema Public</p></div>
                </div>
                <button onClick={() => setShowMappingModal(false)} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={32} /></button>
             </header>

             <div className="flex-1 overflow-hidden flex flex-col p-12 bg-white space-y-8">
                <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 flex gap-6">
                   <Sparkles className="text-indigo-600 shrink-0" size={32} />
                   <p className="text-sm text-indigo-900 font-medium leading-relaxed">
                     Escolha quais tabelas do esquema <code>public</code> representarão os dados extras dos seus usuários (Perfis, Configurações). Marque a tabela <b>Estrela</b> como principal.
                   </p>
                </div>

                <div className="relative group">
                   <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                   <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Pesquisar tabelas públicas..." className="w-full pl-16 pr-8 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-4">
                   {filteredTables.map(table => (
                     <div key={table.name} className={`group flex items-center justify-between p-6 rounded-[1.8rem] border transition-all ${mapping.principal_table === table.name ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl' : mapping.additional_tables.includes(table.name) ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-white border-slate-100 hover:border-indigo-300'}`}>
                        <div className="flex items-center gap-6">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${mapping.principal_table === table.name ? 'bg-white/20' : 'bg-slate-50'}`}><Database size={20} /></div>
                           <div><span className="text-sm font-black uppercase tracking-tight">{table.name}</span><p className={`text-[10px] uppercase font-bold tracking-widest ${mapping.principal_table === table.name ? 'text-indigo-100' : 'text-slate-400'}`}>{mapping.principal_table === table.name ? 'Tabela Principal' : 'Clique para vincular'}</p></div>
                        </div>
                        <div className="flex items-center gap-3">
                           <button 
                             onClick={() => {
                               const current = mapping.additional_tables;
                               const next = current.includes(table.name) ? current.filter(t => t !== table.name) : [...current, table.name];
                               setMapping({ ...mapping, additional_tables: next });
                             }}
                             className={`p-3 rounded-xl transition-all ${mapping.additional_tables.includes(table.name) ? 'bg-indigo-400 text-white' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}
                           >
                             <CheckCircle2 size={18} />
                           </button>
                           <button 
                             onClick={() => setMapping({ ...mapping, principal_table: table.name, additional_tables: [...new Set([...mapping.additional_tables, table.name])] })}
                             className={`p-3 rounded-xl transition-all ${mapping.principal_table === table.name ? 'bg-white text-indigo-600' : 'bg-slate-100 text-slate-300 hover:bg-indigo-100 hover:text-indigo-600'}`}
                           >
                             <Star size={18} fill={mapping.principal_table === table.name ? 'currentColor' : 'none'} />
                           </button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>

             <footer className="p-10 bg-slate-50 border-t border-slate-100 flex gap-6">
                <button onClick={() => setShowMappingModal(false)} className="flex-1 py-6 text-slate-400 font-black uppercase text-xs">Descartar</button>
                <button onClick={handleSaveMapping} className="flex-[3] py-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase shadow-2xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-4">
                  {submitting ? <Loader2 className="animate-spin" /> : <><Sparkles size={18} /> Sincronizar Mapeamento</>}
                </button>
             </footer>
          </div>
        </div>
      )}

      {/* Manual User Creation Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-xl max-md:p-8 p-10 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">New Identity</h2>
            <p className="text-slate-500 mb-8 text-sm">Add a user manually and sync to the mapped public table.</p>
            
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-800"
                    placeholder="user@example.com"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-slate-800"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {mapping.additional_tables.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Connection Table (Target)</label>
                  <select 
                    value={newUser.target_table}
                    onChange={e => setNewUser({...newUser, target_table: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-xs font-black text-indigo-600 outline-none"
                  >
                    <option value="">Default ({mapping.principal_table || 'None'})</option>
                    {mapping.additional_tables.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all uppercase tracking-widest text-[10px]">Cancel</button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Shield size={16} /> Create & Sync Identity</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const PolicyCard = ({ active, icon, label, desc, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center text-center gap-4 ${active ? 'bg-indigo-600 border-indigo-700 text-white shadow-2xl shadow-indigo-200' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
  >
    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${active ? 'bg-white/20' : 'bg-slate-50'}`}>{icon}</div>
    <div><h5 className="font-black text-sm uppercase tracking-tight">{label}</h5><p className={`text-[10px] mt-1 font-medium ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{desc}</p></div>
  </button>
);

export default AuthConfig;
