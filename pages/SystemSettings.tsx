
import React, { useState, useEffect } from 'react';
import { 
  Shield, Globe, Key, Lock, Mail, CheckCircle2, AlertCircle, Loader2, 
  ExternalLink, ShieldCheck, RefreshCw, Activity, Terminal, CloudLightning
} from 'lucide-react';

const SystemSettings: React.FC = () => {
  const [adminEmail, setAdminEmail] = useState('admin@cascata.io');
  const [globalDomain, setGlobalDomain] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/control/system/config', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      const data = await res.json();
      if (data.global_domain) {
        setGlobalDomain(data.global_domain);
        setCurrentDomain(data.global_domain);
      }
    } catch (e) { setError('Falha ao sincronizar registro mestre.'); }
    finally { setFetching(false); }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSaveDomain = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/control/system/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify({ key: 'global_domain', value: globalDomain })
      });
      if (!response.ok) throw new Error('Falha ao salvar configuração.');
      setSuccess('Configurações de domínio propagadas.');
      setCurrentDomain(globalDomain);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-12 lg:p-20 max-w-7xl mx-auto w-full space-y-16 pb-80">
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[500] p-6 rounded-[2rem] shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <h1 className="text-7xl font-black text-slate-900 tracking-tighter mb-4 italic">Orchestration</h1>
          <p className="text-slate-400 text-xl font-medium max-w-2xl leading-relaxed">Infraestrutura soberana e trava de domínio global.</p>
        </div>
        <button onClick={fetchConfig} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all">
          <RefreshCw className={fetching ? 'animate-spin' : ''} size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="bg-white border border-slate-200 rounded-[4rem] p-12 shadow-sm relative overflow-hidden">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Lock size={20} /></div>
            Root Identity
          </h3>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Administrador Master</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input value={adminEmail} readOnly className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold text-slate-400 outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[4rem] p-12 shadow-sm flex flex-col group relative overflow-hidden">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Globe size={20} /></div>
            Global Endpoint
          </h3>
          <div className="space-y-8 flex-1 relative z-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Domínio FQDN</label>
              <input 
                value={globalDomain} 
                onChange={(e) => setGlobalDomain(e.target.value)} 
                placeholder="studio.meu-dominio.com"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-8 text-lg font-mono font-black text-indigo-600 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" 
              />
              <div className="flex items-center gap-2 mt-4 px-2">
                 <div className={`w-2 h-2 rounded-full ${currentDomain ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                 <p className="text-[10px] text-slate-400 font-black uppercase">
                   Status: {currentDomain ? `Travado em ${currentDomain}` : 'Acesso via IP Permitido (Configuração Inicial)'}
                 </p>
              </div>
            </div>
            
            <div className="flex gap-4">
               <button 
                onClick={handleSaveDomain}
                disabled={loading || !globalDomain || globalDomain === currentDomain}
                className="flex-[2] bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-xl disabled:opacity-30"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : 'Salvar Domínio'}
              </button>
              
              {currentDomain && (
                <button 
                  onClick={() => alert('Provisionando SSL via Certbot...')}
                  className="flex-1 bg-emerald-500 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-xl"
                >
                  <CloudLightning size={16} /> SSL
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
