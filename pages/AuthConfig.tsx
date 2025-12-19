
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Mail, Globe, ShieldCheck, UserPlus, Lock, Key, Loader2, 
  Calendar, MoreHorizontal, User, AlertCircle, Info, Link2,
  X, Search, CheckCircle2, Star, Database, ArrowRight, Sparkles,
  ChevronRight, Shield, Settings, Eye, EyeOff, Trash2, Edit3, KeyRound,
  Filter, ChevronLeft, ListFilter
} from 'lucide-react';

const AuthConfig: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUsers, setShowUsers] = useState(false); // Hidden by default
  const [showAddUser, setShowAddUser] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', target_table: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Paginação e Filtros
  const [limit, setLimit] = useState<string>('10');
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [filterTable, setFilterTable] = useState('');

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

  const fetchUsers = useCallback(async () => {
    if (!showUsers) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit,
        offset: offset.toString(),
        search,
        table: filterTable
      });
      const data = await fetchWithAuth(`/api/data/${projectId}/auth/users?${query}`);
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, limit, offset, search, filterTable, showUsers]);

  const fetchData = async () => {
    try {
      const [projectsData, tablesData] = await Promise.all([
        fetchWithAuth('/api/control/projects'),
        fetchWithAuth(`/api/data/${projectId}/tables`)
      ]);
      setTables(tablesData);
      const proj = projectsData.find((p: any) => p.slug === projectId);
      if (proj?.metadata?.user_table_mapping) {
        setMapping(proj.metadata.user_table_mapping);
      }
    } catch (err: any) { setError(err.message); }
  };

  useEffect(() => { fetchData(); }, [projectId]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
      fetchData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetchWithAuth(`/api/data/${projectId}/auth/users`, {
        method: 'POST',
        body: JSON.stringify(newUser)
      });
      setSuccess("Usuário e row pública vinculados com sucesso.");
      setShowAddUser(false);
      setNewUser({ email: '', password: '', target_table: '' });
      if (showUsers) fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Excluir usuário permanentemente? Isso removerá apenas o registro de autenticação.")) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/auth/users/${id}`, { method: 'DELETE' });
      setSuccess("Identidade removida.");
      fetchUsers();
    } catch (e: any) { setError(e.message); }
  };

  const filteredTablesList = tables.filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()));

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto w-full space-y-12 pb-32">
      {/* Toast */}
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[1500] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
          <button onClick={() => { setError(null); setSuccess(null); }} className="ml-4 opacity-50"><X size={16} /></button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <h2 className="text-5xl font-black text-slate-900 tracking-tighter italic">Identity Hub</h2>
          <p className="text-slate-400 mt-2 text-lg font-medium">Gestão de usuários e vínculos atômicos de RLS.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowMappingModal(true)}
            className="bg-white border-2 border-slate-100 text-slate-600 px-8 py-4 rounded-[1.5rem] font-black flex items-center gap-3 hover:bg-slate-50 transition-all shadow-sm uppercase tracking-widest text-[10px]"
          >
            <Link2 size={18} /> Linkar Tabelas
          </button>
          <button 
            onClick={() => setShowAddUser(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-[1.5rem] font-black flex items-center gap-3 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px]"
          >
            <UserPlus size={18} /> Criar Usuário
          </button>
        </div>
      </div>

      {/* Seção de Controles de Listagem */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 shadow-sm flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-1 min-w-[300px]">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  placeholder="Pesquisar por email..." 
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                <select 
                  value={filterTable} 
                  onChange={e => { setFilterTable(e.target.value); setOffset(0); }}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-[10px] font-black text-indigo-600 outline-none"
                >
                    <option value="">Todas as Classes</option>
                    {mapping.principal_table && <option value={mapping.principal_table}>{mapping.principal_table} (P)</option>}
                    {mapping.additional_tables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
          </div>

          <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Exibir:</span>
                <select 
                  value={limit} 
                  onChange={e => { setLimit(e.target.value); setOffset(0); }}
                  className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-[10px] font-black text-slate-600 outline-none"
                >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="250">250</option>
                    <option value="500">500</option>
                    <option value="all">Tudo</option>
                </select>
              </div>
              <button 
                onClick={() => setShowUsers(!showUsers)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showUsers ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {showUsers ? <><EyeOff size={14}/> Ocultar</> : <><Eye size={14}/> Revelar Lista</>}
              </button>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden min-h-[400px] flex flex-col">
            {!showUsers ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-6 p-20 opacity-40">
                <Lock size={64} />
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-widest">Registros Criptografados</p>
                  <p className="text-[10px] mt-2 font-medium">A listagem de usuários é protegida. Clique em Revelar para descriptografar.</p>
                </div>
              </div>
            ) : loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-40 gap-4">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Consultando schema de identidades...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-40 gap-4 opacity-20">
                <Search size={40} />
                <span className="text-[10px] font-black uppercase tracking-widest">Nenhum registro encontrado</span>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Identidade</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Auth</th>
                    <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Criação</th>
                    <th className="px-8 py-6 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-indigo-50/30 transition-all group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                            <User size={18} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{user.email}</span>
                            <span className="text-[9px] font-mono text-slate-400">{user.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded-lg border border-emerald-100 uppercase tracking-widest">Ativo</span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                          <Calendar size={14} />
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                         <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button title="Redefinir Senha" className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><KeyRound size={16} /></button>
                            <button title="Editar Perfil Público" className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit3 size={16} /></button>
                            <button onClick={() => handleDeleteUser(user.id)} title="Excluir" className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {showUsers && users.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-6">
                <button 
                  onClick={() => setOffset(Math.max(0, offset - parseInt(limit)))}
                  className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                  disabled={offset === 0}
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="bg-white px-6 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Offset {offset}
                </div>
                <button 
                  onClick={() => setOffset(offset + parseInt(limit))}
                  className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600"
                >
                  <ChevronRight size={20} />
                </button>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
             <div className="absolute top-0 right-0 p-6 opacity-10"><Shield size={100} /></div>
             <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
               <Sparkles size={16} className="text-indigo-400" /> Vínculo Forte
             </h3>
             <div className="space-y-4 relative z-10">
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                   <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Tabela de Perfis</span>
                   <p className="text-xs font-bold font-mono text-white truncate">{mapping.principal_table || 'Nenhuma'}</p>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic">
                  O Cascata vincula o UUID do Auth diretamente à Row da tabela pública via Transação Atômica.
                </p>
             </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">RLS Strategy</h4>
             <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
               <code className="text-[10px] font-mono text-indigo-600 block leading-relaxed">
                 CREATE POLICY "User Map" ON public."{mapping.principal_table || '...'} " <br/>
                 USING (auth.uid() = id);
               </code>
             </div>
          </div>
        </div>
      </div>

      {/* MODAL MAPPING */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[2000] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95">
             <header className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.8rem] flex items-center justify-center shadow-xl"><Link2 size={32} /></div>
                  <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter">User Data Mapping</h3><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Conecte o Auth ao esquema Public</p></div>
                </div>
                <button onClick={() => setShowMappingModal(false)} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={32} /></button>
             </header>

             <div className="flex-1 overflow-hidden flex flex-col p-12 bg-white space-y-8">
                <div className="relative group">
                   <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                   <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Pesquisar tabelas públicas..." className="w-full pl-16 pr-8 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-4">
                   {filteredTablesList.map(table => (
                     <div key={table.name} className={`group flex items-center justify-between p-6 rounded-[1.8rem] border transition-all ${mapping.principal_table === table.name ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl' : mapping.additional_tables.includes(table.name) ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-white border-slate-100 hover:border-indigo-300'}`}>
                        <div className="flex items-center gap-6">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${mapping.principal_table === table.name ? 'bg-white/20' : 'bg-slate-50'}`}><Database size={20} /></div>
                           <div><span className="text-sm font-black uppercase tracking-tight">{table.name}</span><p className={`text-[10px] uppercase font-bold tracking-widest ${mapping.principal_table === table.name ? 'text-indigo-100' : 'text-slate-400'}`}>{mapping.principal_table === table.name ? 'Tabela Principal' : 'Clique para vincular'}</p></div>
                        </div>
                        <div className="flex items-center gap-3">
                           <button onClick={() => {
                               const current = mapping.additional_tables;
                               const next = current.includes(table.name) ? current.filter(t => t !== table.name) : [...current, table.name];
                               setMapping({ ...mapping, additional_tables: next });
                             }} className={`p-3 rounded-xl transition-all ${mapping.additional_tables.includes(table.name) ? 'bg-indigo-400 text-white' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}><CheckCircle2 size={18} /></button>
                           <button onClick={() => setMapping({ ...mapping, principal_table: table.name, additional_tables: [...new Set([...mapping.additional_tables, table.name])] })} className={`p-3 rounded-xl transition-all ${mapping.principal_table === table.name ? 'bg-white text-indigo-600' : 'bg-slate-100 text-slate-300 hover:bg-indigo-100 hover:text-indigo-600'}`}><Star size={18} fill={mapping.principal_table === table.name ? 'currentColor' : 'none'} /></button>
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

      {/* MODAL CRIAR USUÁRIO */}
      {showAddUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[2000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter italic">Provision Identity</h2>
            <p className="text-slate-500 mb-8 text-sm font-medium">Criação manual com vínculo automático à Row pública.</p>
            
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                <input type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                <input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" required />
              </div>

              {(mapping.principal_table || mapping.additional_tables.length > 0) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Perfil (Tabela de Conexão)</label>
                  <select 
                    value={newUser.target_table}
                    onChange={e => setNewUser({...newUser, target_table: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-xs font-black text-indigo-600 outline-none"
                  >
                    <option value="">Principal ({mapping.principal_table || 'Nenhuma'})</option>
                    {mapping.additional_tables.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest">Cancelar</button>
                <button type="submit" disabled={submitting} className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Shield size={16} /> Criar e Vincular Row</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthConfig;
