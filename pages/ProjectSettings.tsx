
import React, { useState } from 'react';
import { 
  Shield, 
  Key, 
  Globe, 
  Lock, 
  Save, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Copy, 
  RefreshCw, 
  Zap,
  // Added ChevronRight icon as it was missing from imports but used in the JSX
  ChevronRight
} from 'lucide-react';

const ProjectSettings: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [customDomain, setCustomDomain] = useState('');
  const [jwtSecret, setJwtSecret] = useState('ck_7f8e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess('Project infrastructure updated.');
      setTimeout(() => setSuccess(null), 3000);
    }, 1000);
  };

  const rotateSecret = () => {
    if(confirm("DANGER: Rotating the JWT Secret will invalidate all active sessions for this project. Continue?")) {
      const newSecret = 'ck_' + Math.random().toString(36).substring(2, 20) + Math.random().toString(36).substring(2, 20);
      setJwtSecret(newSecret);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-12">
      {success && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[500] p-5 rounded-3xl bg-emerald-600 text-white shadow-2xl flex items-center gap-4 animate-bounce">
          <CheckCircle2 size={20} />
          <span className="text-sm font-black uppercase tracking-tight">{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm space-y-10 relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform"><Globe size={160} /></div>
           <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Globe size={20} /></div>
              Custom Domain
           </h3>
           <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Hostname</label>
                <input 
                  value={customDomain} 
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="e.g. api.your-app.com"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                />
              </div>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">Point your CNAME to the global load balancer. Our Nginx controller will automatically route traffic based on this host header.</p>
           </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm space-y-10 relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform"><Shield size={160} /></div>
           <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Lock size={20} /></div>
              Security Vector
           </h3>
           <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">JWT Master Secret</label>
                   <button onClick={rotateSecret} className="text-[10px] font-black text-rose-600 flex items-center gap-1 hover:text-rose-800 transition-colors uppercase tracking-widest"><RefreshCw size={12} /> Rotate</button>
                </div>
                <div className="relative">
                  <input 
                    type="password"
                    value={jwtSecret}
                    readOnly
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-6 pr-14 text-sm font-mono font-bold text-slate-500 outline-none" 
                  />
                  <button onClick={() => { navigator.clipboard.writeText(jwtSecret); setSuccess('Secret copied!'); setTimeout(() => setSuccess(null), 3000); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-600 transition-colors">
                    <Copy size={20} />
                  </button>
                </div>
              </div>
              <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4">
                 <AlertCircle className="text-amber-500 shrink-0" size={20} />
                 <p className="text-[11px] text-amber-900 font-bold leading-relaxed">This secret signs all project-level JWTs. If exposed, rotation is mandatory.</p>
              </div>
           </div>
        </div>
      </div>

      <div className="flex justify-center pt-8">
        <button 
          onClick={handleSave}
          disabled={loading}
          className="bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center gap-4 hover:bg-indigo-600 transition-all shadow-2xl active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Push Infrastructure Update</>}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[3rem] p-10 mt-12">
        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-6">API Quick Start</h4>
        <div className="bg-slate-950 rounded-2xl p-8 space-y-4">
           <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-indigo-400 font-bold uppercase">POST</span>
              <span className="text-slate-400">/auth/login</span>
           </div>
           <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-emerald-400 font-bold uppercase">GET</span>
              <span className="text-slate-400">/tables/YOUR_TABLE/rows</span>
           </div>
           <div className="mt-4 pt-4 border-t border-white/5">
              <a href="#" className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 hover:text-indigo-300 transition-colors"><Zap size={14} /> View Open API Documentation <ChevronRight size={14} /></a>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSettings;
