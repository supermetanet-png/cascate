import React, { useState, useEffect } from 'react';
import { Mail, Globe, ShieldCheck, UserPlus, Lock, Key, Loader2, Calendar, MoreHorizontal, User, AlertCircle, Info } from 'lucide-react';

const AuthConfig: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [emailAuth, setEmailAuth] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/data/${projectId}/auth/users`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/data/${projectId}/auth/users`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify(newUser)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create user');
      }
      setShowAddUser(false);
      setNewUser({ email: '', password: '' });
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [projectId]);

  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto w-full space-y-12 pb-32">
      <div className="flex items-end justify-between gap-8">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Identity Services</h2>
          <p className="text-slate-500 mt-2 text-lg">Manage users and authentication providers for {projectId}.</p>
        </div>
        <button 
          onClick={() => setShowAddUser(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all shadow-xl shadow-indigo-100 hover:-translate-y-0.5"
        >
          <UserPlus size={20} /> CREATE USER
        </button>
      </div>

      {/* Identity Separation Notice */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white flex items-center gap-8 border border-white/5 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-8 opacity-10"><ShieldCheck size={140} /></div>
         <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <Info size={32} className="text-indigo-400" />
         </div>
         <div className="relative z-10">
            <h4 className="font-black text-lg uppercase tracking-tight mb-1">Identity Separation Warning</h4>
            <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-2xl">
              These are the end-users of the application <b>"{projectId}"</b>. They exist in the isolated <code>auth.users</code> table of this instance and <b>do not</b> have access to the Cascata Management Studio.
            </p>
         </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2rem] flex items-center gap-4 text-rose-600">
          <AlertCircle size={24} />
          <span className="text-sm font-bold uppercase tracking-widest">{error}</span>
          <button onClick={() => fetchUsers()} className="ml-auto bg-rose-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Retry Connection</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User List Table */}
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

        {/* Auth Settings Panel */}
        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-8">
             <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Configuration</h3>
                <Settings size={20} className="text-slate-300" />
             </div>

             <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail size={18} className="text-indigo-600" />
                    <span className="text-sm font-bold text-slate-700">Email Auth</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={emailAuth} onChange={(e) => setEmailAuth(e.target.checked)} className="sr-only peer" />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe size={18} className="text-rose-500" />
                    <span className="text-sm font-bold text-slate-700">Google OAuth</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
             </section>

             <div className="pt-6 border-t border-slate-100">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Instance Security</p>
               <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                 <p className="text-xs text-slate-600 leading-relaxed font-medium">JWT signing for {projectId} uses a dedicated 256-bit secret stored in the Control Plane.</p>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Manual User Creation Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-md:p-8 p-10 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-black text-slate-900 mb-2">New Identity</h2>
            <p className="text-slate-500 mb-8 text-sm">Add a user manually to the auth.users table of this project.</p>
            
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold text-slate-800"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold text-slate-800"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all uppercase tracking-widest text-[10px]">Cancel</button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create Identity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Settings: React.FC<any> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

export default AuthConfig;