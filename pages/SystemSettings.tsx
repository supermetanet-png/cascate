
import React, { useState, useEffect } from 'react';
import { 
  Shield, Globe, Key, Lock, Mail, CheckCircle2, AlertCircle, Loader2, Cloud, 
  Fingerprint, Plus, CloudLightning, Info, Terminal, Copy, ChevronRight, 
  ShieldAlert, FileText, Code, Server, ExternalLink, RefreshCw, Activity
} from 'lucide-react';

const SystemSettings: React.FC = () => {
  const [adminEmail, setAdminEmail] = useState('admin@cascata.io');
  const [globalDomain, setGlobalDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/control/projects', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      // Em uma implementação real, haveria um endpoint /api/control/system/config
    } catch (e) {}
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
      if (!response.ok) throw new Error('Falha ao salvar configuração mestre.');
      setSuccess('Domínio Global vinculado. Acesso por IP será desativado após o reinício.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
          <p className="text-slate-400 text-xl font-medium max-w-2xl leading-relaxed">Configurações críticas de infraestrutura e segurança.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="bg-white border border-slate-200 rounded-[4rem] p-12 shadow-sm">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Lock size={20} /></div>
            Perfil Administrativo
          </h3>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Root Email</label>
              <input value={adminEmail} readOnly className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 px-8 text-sm font-bold text-slate-400 outline-none" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[4rem] p-12 shadow-sm flex flex-col group relative overflow-hidden">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Globe size={20} /></div>
            Domínio Mestre (Locking)
          </h3>
          <div className="space-y-8 flex-1 relative z-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">FQDN Global do Studio</label>
              <input 
                value={globalDomain} 
                onChange={(e) => setGlobalDomain(e.target.value)} 
                placeholder="studio.seu-dominio.com"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-xs font-mono font-bold text-slate-900 outline-none" 
              />
              <p className="text-[10px] text-rose-500 font-bold px-2 mt-4 uppercase">
                Atenção: Definir um domínio irá desativar permanentemente o acesso via IP direto.
              </p>
            </div>
            <button 
              onClick={handleSaveDomain}
              disabled={loading || !globalDomain}
              className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-xl"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : 'Ativar Trava de Domínio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
