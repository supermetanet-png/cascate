
import React, { useState, useEffect } from 'react';
import { Shield, Lock, Unlock, Plus, Trash2, Edit2, AlertCircle, Loader2 } from 'lucide-react';

const RLSManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolicies = async () => {
    try {
      const response = await fetch(`/api/data/${projectId}/policies`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      const data = await response.json();
      setPolicies(data);
    } catch (err) {
      console.error('Error fetching policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [projectId]);

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Access Policies</h2>
          <p className="text-slate-500 mt-1">Row Level Security (RLS) policies currently active on {projectId}.</p>
        </div>
        <button className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 shadow-xl transition-all">
          <Plus size={20} /> Create Policy
        </button>
      </div>

      <div className="bg-indigo-600 rounded-[2rem] p-8 text-white flex items-center gap-8 relative overflow-hidden shadow-2xl shadow-indigo-200">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Shield size={160} /></div>
        <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md"><Shield size={32} /></div>
        <div className="relative z-10">
          <h4 className="text-xl font-bold mb-1">Security Enforcement Active</h4>
          <p className="text-indigo-100 text-sm max-w-md">RLS is the primary defense layer. Each project database in Cascata enforces policies at the database engine level.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            Active Policies <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{policies.length}</span>
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {policies.length === 0 ? (
              <div className="p-16 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-center flex flex-col items-center">
                <Unlock className="text-slate-200 mb-4" size={48} />
                <h4 className="text-slate-400 font-bold">No active policies found</h4>
                <p className="text-slate-400 text-sm mt-1">Your tables might be open to public access if RLS is not enabled.</p>
              </div>
            ) : (
              policies.map((p, i) => (
                <div key={i} className="border border-slate-200 rounded-[2rem] bg-white p-6 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                        <Lock size={20} />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{p.policyname}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{p.tablename}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{p.cmd}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto shadow-inner">
                      <span className="text-slate-500 select-none">USING</span> ({p.qual || 'true'})
                      {p.with_check && <><br/><span className="text-slate-500 select-none">WITH CHECK</span> ({p.with_check})</>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RLSManager;
