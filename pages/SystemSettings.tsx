
import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Globe, 
  Key, 
  Lock, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Cloud, 
  Fingerprint,
  Plus,
  CloudLightning,
  Info,
  Terminal,
  Copy,
  ChevronRight,
  ShieldAlert,
  FileText,
  Code,
  Server,
  ExternalLink
} from 'lucide-react';

const SystemSettings: React.FC = () => {
  const [adminEmail, setAdminEmail] = useState('admin@cascata.io');
  const [newPassword, setNewPassword] = useState('');
  const [globalDomain, setGlobalDomain] = useState('cascata.unibloom.shop');
  const [leEmail, setLeEmail] = useState('');
  
  const [showCertModal, setShowCertModal] = useState(false);
  const [sslMode, setSslMode] = useState<'letsencrypt' | 'cloudflare_pem'>('cloudflare_pem');
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMasterDefault = adminEmail === 'admin@cascata.io';

  const copyVpsCommand = () => {
    const cmd = `docker exec -it cascate-db-1 psql -U cascata_admin -d cascata_system -c "UPDATE system.admin_users SET email = 'REAL_EMAIL', password_hash = 'REAL_PASS' WHERE email = 'admin@cascata.io';"`;
    navigator.clipboard.writeText(cmd);
    setSuccess('VPS Command copied!');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/control/auth/update-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify({ email: adminEmail, password: newPassword })
      });
      if (!response.ok) throw new Error('Update failed. Check backend connectivity.');
      setSuccess('Root profile updated successfully.');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCertificate = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/control/system/certificates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify({ 
          domain: globalDomain, 
          cert: certPem, 
          key: keyPem, 
          provider: sslMode,
          email: leEmail
        })
      });
      if (!response.ok) throw new Error('Failed to save certificate configuration.');
      setSuccess(sslMode === 'letsencrypt' ? 'Let\'s Encrypt generation triggered!' : 'Certificates deployed.');
      setShowCertModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-12 lg:p-20 max-w-7xl mx-auto w-full space-y-12 pb-60">
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[500] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-4">Core Orchestration</h1>
          <p className="text-slate-400 text-xl font-medium max-w-2xl leading-relaxed">System identity and infrastructure security console.</p>
        </div>
        <div className="bg-white p-3 border border-slate-200 rounded-3xl flex items-center gap-4">
           <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><Fingerprint size={20} /></div>
           <div className="flex flex-col">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">System OID</span>
             <span className="text-xs font-mono font-bold text-slate-900">CASCADE-UNIBLOOM-01</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-[4rem] p-12 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform"><Shield size={160} /></div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Lock size={20} /></div>
            Master Identity
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-6 relative z-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
              <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 px-8 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha Mestra</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 px-8 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
            </div>
            <button disabled={loading} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200">
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Commit Security Updates'}
            </button>
          </form>
        </div>

        {/* Domain Card */}
        <div className="bg-white border border-slate-200 rounded-[4rem] p-12 shadow-sm flex flex-col group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform"><Globe size={160} /></div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Globe size={20} /></div>
            Global Hostname
          </h3>
          <div className="space-y-8 flex-1 relative z-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dashboard Domain</label>
              <input value={globalDomain} onChange={(e) => setGlobalDomain(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-xs font-mono font-bold text-slate-900 outline-none" />
            </div>

            <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-6">
              <div className="flex items-center justify-between">
                 <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">SSL Security</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Auto Let's Encrypt / PEM</p>
                 </div>
                 <button onClick={() => setShowCertModal(true)} className="bg-white border border-slate-200 text-slate-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                   <Plus size={14} /> Manage SSL
                 </button>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-amber-600 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                 <AlertCircle size={16} />
                 <span>Ensure Port 80 is open for Let's Encrypt validation.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SSL Modal */}
      {showCertModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[600] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white rounded-[4rem] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
              <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                 <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-orange-500 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-orange-500/20">
                       <CloudLightning size={32} />
                    </div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-900 tracking-tighter">SSL Architect</h3>
                       <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Secure your multi-tenant routes</p>
                    </div>
                 </div>
                 <button onClick={() => setShowCertModal(false)} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400 active:scale-90"><Terminal size={32} /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-12 space-y-12">
                 <div className="flex gap-4 p-2 bg-slate-50 rounded-3xl max-w-md mx-auto shadow-inner">
                    <button onClick={() => setSslMode('letsencrypt')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sslMode === 'letsencrypt' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>Let's Encrypt (Auto)</button>
                    <button onClick={() => setSslMode('cloudflare_pem')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sslMode === 'cloudflare_pem' ? 'bg-white shadow-md text-orange-600' : 'text-slate-400'}`}>Cloudflare (PEM)</button>
                 </div>

                 {sslMode === 'letsencrypt' ? (
                   <div className="max-w-2xl mx-auto space-y-10 py-10">
                      <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-[2.5rem] flex gap-6">
                        <Info className="text-indigo-600 shrink-0" size={32} />
                        <div className="space-y-2">
                          <h4 className="font-black text-slate-900 text-lg">Automatic Provisioning</h4>
                          <p className="text-sm text-slate-600 font-medium leading-relaxed">Let's Encrypt requires your domain to be pointed to this server's IP. Port 80 will be used temporarily for validation.</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail for Notification</label>
                         <input value={leEmail} onChange={(e) => setLeEmail(e.target.value)} placeholder="security@yourdomain.com" className="w-full bg-slate-50 border border-slate-200 rounded-3xl py-6 px-10 text-xl font-bold text-slate-900 outline-none" />
                      </div>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      <div className="space-y-4">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-2"><FileText size={14}/> Public Certificate (.pem)</label>
                         <textarea value={certPem} onChange={(e) => setCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" className="w-full h-96 bg-slate-900 text-emerald-400 p-8 rounded-[2.5rem] font-mono text-xs outline-none focus:ring-8 focus:ring-indigo-500/10 resize-none shadow-2xl" />
                      </div>
                      <div className="space-y-4">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-2"><Key size={14}/> Private RSA Key (.key)</label>
                         <textarea value={keyPem} onChange={(e) => setKeyPem(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" className="w-full h-96 bg-slate-900 text-amber-400 p-8 rounded-[2.5rem] font-mono text-xs outline-none focus:ring-8 focus:ring-indigo-500/10 resize-none shadow-2xl" />
                      </div>
                   </div>
                 )}
              </div>

              <footer className="p-10 bg-slate-50 border-t border-slate-100 flex gap-6">
                 <button onClick={() => setShowCertModal(false)} className="flex-1 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 rounded-2xl transition-all">Cancel</button>
                 <button onClick={handleSaveCertificate} disabled={loading || (sslMode === 'cloudflare_pem' && (!certPem || !keyPem)) || (sslMode === 'letsencrypt' && !leEmail)} className="flex-[3] bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-4 shadow-2xl active:scale-95 disabled:opacity-30 transition-all">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={18} /> {sslMode === 'letsencrypt' ? 'Initialize Auto-SSL' : 'Deploy SSL Manifest'}</>}
                 </button>
              </footer>
           </div>
        </div>
      )}

      {/* Security Alert Banner in Footer */}
      {isMasterDefault && (
        <div className="bg-rose-600 rounded-[3rem] p-12 text-white flex flex-col md:flex-row items-center gap-10 shadow-2xl shadow-rose-200 border-4 border-rose-500 overflow-hidden relative mt-20">
           <div className="absolute top-0 right-0 p-10 opacity-10"><ShieldAlert size={180} /></div>
           <div className="w-24 h-24 bg-white/20 rounded-[2rem] flex items-center justify-center shrink-0 backdrop-blur-md">
              <Lock size={48} />
           </div>
           <div className="flex-1 relative z-10">
              <h4 className="text-3xl font-black tracking-tighter uppercase mb-2">Emergency master key detected</h4>
              <p className="text-rose-100 text-lg font-medium leading-relaxed">Default credentials <code>admin@cascata.io</code> must be overridden immediately via UI or VPS command for root security.</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                 <button onClick={copyVpsCommand} className="bg-white text-rose-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-rose-50 transition-all active:scale-95 shadow-xl">
                    <Terminal size={18} /> Copy VPS Override Command
                 </button>
                 <a href="https://cascata.docs" target="_blank" className="bg-rose-700 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-rose-800 transition-all active:scale-95 border border-rose-500">
                    <ExternalLink size={18} /> Documentation
                 </a>
              </div>
           </div>
        </div>
      )}

      <div className="pt-12">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] px-4 mb-8">Node Topography</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <InfraNode title="Control Plane" url={`http://${window.location.hostname}/api/control`} status="online" icon={<Terminal size={20} />} />
           <InfraNode title="Data Plane" url={`http://${window.location.hostname}/api/data`} status="online" icon={<Server size={20} />} />
           <InfraNode title="Object Store" url={`/volumes/storage`} status="active" icon={<Cloud size={20} />} />
        </div>
      </div>
    </div>
  );
};

const InfraNode: React.FC<{ title: string, url: string, status: string, icon: React.ReactNode }> = ({ title, url, status, icon }) => (
  <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm flex items-center gap-6 hover:shadow-xl hover:shadow-indigo-500/5 transition-all">
    <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-black uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>{status}</span>
      </div>
      <p className="text-sm font-bold text-slate-900 truncate font-mono">{url}</p>
    </div>
  </div>
);

export default SystemSettings;
