
import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';

const SystemSettings: React.FC = () => {
  const [adminEmail, setAdminEmail] = useState('admin@cascata.io');
  const [newPassword, setNewPassword] = useState('');
  const [globalDomain, setGlobalDomain] = useState('cascata.unibloom.shop');
  
  const [showCertModal, setShowCertModal] = useState(false);
  const [sslMode, setSslMode] = useState<'letsencrypt' | 'cloudflare_pem'>('cloudflare_pem');
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMasterDefault = adminEmail === 'admin@cascata.io';

  const copySqlToClipboard = () => {
    const sql = `-- EMERGENCY OVERRIDE FOR MASTER CREDENTIALS\nUPDATE system.admin_users SET email = 'your-new-email@domain.com', password_hash = 'your-new-password' WHERE email = 'admin@cascata.io';`;
    navigator.clipboard.writeText(sql);
    setSuccess('SQL Snippet copied to clipboard.');
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
      if (!response.ok) throw new Error('Failed to update admin credentials.');
      setSuccess('Administrator profile updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
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
        body: JSON.stringify({ domain: globalDomain, cert: certPem, key: keyPem, provider: sslMode })
      });
      if (!response.ok) throw new Error('Failed to save certificate.');
      setSuccess('Certificate saved. Nginx reload triggered.');
      setShowCertModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-12 lg:p-20 max-w-7xl mx-auto w-full space-y-12 pb-40">
      {/* Notifications */}
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[500] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-4">System Settings</h1>
          <p className="text-slate-400 text-xl font-medium max-w-2xl leading-relaxed">
            Global orchestration for Dashboard access and root security.
          </p>
        </div>
        <div className="bg-white p-3 border border-slate-200 rounded-3xl flex items-center gap-4">
           <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><Fingerprint size={20} /></div>
           <div>
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Core ID</span>
             <span className="text-xs font-mono font-bold text-slate-900 uppercase">CASCADE-UNIBLOOM-01</span>
           </div>
        </div>
      </div>

      {isMasterDefault && (
        <div className="bg-rose-600 rounded-[2.5rem] p-10 text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl shadow-rose-200 border-4 border-rose-500 animate-pulse">
           <div className="w-20 h-20 bg-white/20 rounded-[1.8rem] flex items-center justify-center shrink-0">
              <ShieldAlert size={48} />
           </div>
           <div className="flex-1">
              <h4 className="text-2xl font-black tracking-tight uppercase">Security Alert: Default Master Key</h4>
              <p className="text-rose-100 font-medium mt-1">You are currently using the default master credentials. This is highly unsafe for production environments.</p>
           </div>
           <button onClick={copySqlToClipboard} className="bg-white text-rose-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-rose-50 transition-all">
              <Copy size={18} /> Copy Override SQL
           </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm relative overflow-hidden">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center"><Lock size={20} /></div>
            Root Identity
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 pl-14 pr-6 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Password</label>
              <div className="relative">
                <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 pl-14 pr-6 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
              </div>
            </div>
            <button disabled={loading} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all">
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Commit Profile Changes'}
            </button>
          </form>
        </div>

        {/* Networking Card */}
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm flex flex-col">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Globe size={20} /></div>
            Global Identity
          </h3>
          <div className="space-y-8 flex-1">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Main Dashboard Domain</label>
              <input value={globalDomain} onChange={(e) => setGlobalDomain(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-xs font-mono font-bold text-slate-900 outline-none" />
            </div>

            <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-6">
              <div className="flex items-center justify-between">
                 <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">SSL / HTTPS</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Global Encryption</p>
                 </div>
                 <button onClick={() => setShowCertModal(true)} className="bg-white border border-slate-200 text-slate-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                   <Plus size={14} /> Add PEM Cert
                 </button>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-amber-600 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                 <AlertCircle size={16} />
                 <span>Origin Certificates Require Port 443 active</span>
              </div>
            </div>
            <div className="mt-auto">
               <p className="text-[11px] text-slate-400 font-medium italic">Project-specific domains (APIs) will be managed in their respective Settings tabs in Part 2.</p>
            </div>
          </div>
        </div>
      </div>

      {/* SSL Modal */}
      {showCertModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[600] flex items-center justify-center p-8 animate-in fade-in">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
              <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                 <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><CloudLightning size={32} /></div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Cloudflare Origin CA</h3>
                       <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Secure the route from Cloudflare to your node</p>
                    </div>
                 </div>
                 <button onClick={() => setShowCertModal(false)} className="text-slate-300 hover:text-slate-900 transition-colors"><Terminal size={32} /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-12 space-y-10">
                 <div className="flex gap-4 p-2 bg-slate-50 rounded-3xl max-w-md mx-auto">
                    <button onClick={() => setSslMode('cloudflare_pem')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sslMode === 'cloudflare_pem' ? 'bg-white shadow-md text-orange-600' : 'text-slate-400'}`}>Cloudflare (PEM)</button>
                    <button onClick={() => setSslMode('letsencrypt')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sslMode === 'letsencrypt' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>Let's Encrypt</button>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText size={12}/> Origin Certificate (.pem)</label>
                       <textarea value={certPem} onChange={(e) => setCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" className="w-full h-80 bg-slate-900 text-emerald-400 p-8 rounded-[2.5rem] font-mono text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 resize-none" />
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Key size={12}/> Private Key (.key)</label>
                       <textarea value={keyPem} onChange={(e) => setKeyPem(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" className="w-full h-80 bg-slate-900 text-amber-400 p-8 rounded-[2.5rem] font-mono text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 resize-none" />
                    </div>
                 </div>
              </div>

              <footer className="p-10 bg-slate-50 border-t border-slate-100 flex gap-6">
                 <button onClick={() => setShowCertModal(false)} className="flex-1 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Cancel</button>
                 <button onClick={handleSaveCertificate} disabled={loading || !certPem || !keyPem} className="flex-[3] bg-slate-900 text-white py-6 rounded-3xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-30">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} /> Deploy SSL Infrastructure</>}
                 </button>
              </footer>
           </div>
        </div>
      )}
    </div>
  );
};

export default SystemSettings;
