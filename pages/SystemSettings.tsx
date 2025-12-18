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
  ExternalLink,
  Settings,
  Terminal,
  Server,
  Fingerprint,
  Plus,
  ArrowRight,
  Database,
  CloudLightning,
  Info
} from 'lucide-react';

const SystemSettings: React.FC = () => {
  const [adminEmail, setAdminEmail] = useState('admin@cascata.io');
  const [newPassword, setNewPassword] = useState('');
  const [globalDomain, setGlobalDomain] = useState('cascata.io');
  
  const [showCertModal, setShowCertModal] = useState(false);
  const [sslMode, setSslMode] = useState<'letsencrypt' | 'cloudflare'>('letsencrypt');
  const [leEmail, setLeEmail] = useState('');
  const [leDomain, setLeDomain] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [cfZone, setCfZone] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleProvisionSSL = () => {
    setLoading(true);
    // Simulating orchestration task
    setTimeout(() => {
      setSuccess(`${sslMode === 'letsencrypt' ? 'Let\'s Encrypt' : 'Cloudflare'} SSL orchestration task queued.`);
      setShowCertModal(false);
      setLoading(false);
      setTimeout(() => setSuccess(null), 3000);
    }, 1500);
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
            Control Plane infrastructure, root access, and networking orchestration.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white p-3 border border-slate-200 rounded-3xl shadow-sm">
           <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
             <Fingerprint size={20} />
           </div>
           <div>
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">System OID</span>
             <span className="text-xs font-mono font-bold text-slate-900">CASCADE-CORE-01</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Administrator Profile Card */}
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:scale-110 transition-transform">
             <Shield size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
                <Lock size={20} />
              </div>
              Root Access
            </h3>
            
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email</label>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 pl-14 pr-6 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Root Password</label>
                <div className="relative">
                  <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new master key"
                    className="w-full bg-slate-50 border border-slate-100 rounded-[1.8rem] py-5 pl-14 pr-6 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                    required
                  />
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Root Credentials'}
              </button>
            </form>
            
            <div className="mt-8 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
               <div className="flex gap-4">
                  <Info size={20} className="text-indigo-600 shrink-0" />
                  <p className="text-[11px] text-indigo-900 leading-relaxed font-bold">
                    EMERGENCY ACCESS: The credentials "admin@cascata.io" / "admin123" are a hardcoded master fallback for initial provisioning. Use them if you lose access to your updated profile.
                  </p>
               </div>
            </div>
          </div>
        </div>

        {/* Networking & Domain Card */}
        <div className="bg-white border border-slate-200 rounded-[3.5rem] p-12 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:scale-110 transition-transform">
             <Globe size={160} />
          </div>
          <div className="relative z-10 h-full flex flex-col">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                <Globe size={20} />
              </div>
              Network Identity
            </h3>
            
            <div className="space-y-8 flex-1">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Main Studio Domain</label>
                <input 
                  value={globalDomain}
                  onChange={(e) => setGlobalDomain(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-xs font-mono font-bold text-slate-900 outline-none"
                />
              </div>

              <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-6">
                <div className="flex items-center justify-between">
                   <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">SSL / HTTPS</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Automatic Encryption</p>
                   </div>
                   <button 
                    onClick={() => setShowCertModal(true)}
                    className="bg-white border border-slate-200 text-slate-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm"
                   >
                     <Plus size={14} /> Add Certificate
                   </button>
                </div>
                
                <div className="flex items-center gap-4 text-xs font-bold text-emerald-600 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                   <CheckCircle2 size={16} />
                   <span>Internal Nginx Ready for Proxy Pass</span>
                </div>
              </div>

              <div className="mt-auto pt-6">
                 <p className="text-xs text-slate-400 font-medium leading-relaxed">
                   Note: Projects are segmented by Global Slug (ID). You can point unique domains to each API or use the main domain with the project prefix.
                 </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SSL Modal */}
      {showCertModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[600] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 shadow-[0_0_100px_rgba(0,0,0,0.4)] border border-slate-200 animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-12">
                 <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center shadow-xl">
                       <CloudLightning size={32} />
                    </div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Issue Certificate</h3>
                       <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Secure your endpoints</p>
                    </div>
                 </div>
                 <button onClick={() => setShowCertModal(false)} className="text-slate-300 hover:text-slate-900 transition-colors">
                    <Terminal size={32} />
                 </button>
              </div>

              <div className="flex gap-4 mb-10 p-2 bg-slate-50 rounded-3xl">
                 <button 
                  onClick={() => setSslMode('letsencrypt')}
                  className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sslMode === 'letsencrypt' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   Let's Encrypt
                 </button>
                 <button 
                  onClick={() => setSslMode('cloudflare')}
                  className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${sslMode === 'cloudflare' ? 'bg-white shadow-md text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   Cloudflare
                 </button>
              </div>

              <div className="space-y-6">
                 {sslMode === 'letsencrypt' ? (
                   <div className="space-y-4 animate-in slide-in-from-right-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Domain Name</label>
                        <input value={leDomain} onChange={(e) => setLeDomain(e.target.value)} placeholder="e.g. api.yourproject.com" className="w-full bg-slate-100 border-none rounded-2xl py-5 px-6 font-mono text-sm text-indigo-600" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ACME Email</label>
                        <input value={leEmail} onChange={(e) => setLeEmail(e.target.value)} placeholder="security@yourdomain.com" className="w-full bg-slate-100 border-none rounded-2xl py-5 px-6 font-bold text-sm" />
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                         <p className="text-[10px] text-slate-500 leading-relaxed">By proceeding, you accept Let's Encrypt TOS. Ensure Port 80 is open for the HTTP challenge.</p>
                      </div>
                   </div>
                 ) : (
                   <div className="space-y-4 animate-in slide-in-from-left-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cloudflare API Token</label>
                        <input value={cfToken} onChange={(e) => setCfToken(e.target.value)} type="password" placeholder="••••••••••••••••••••" className="w-full bg-slate-100 border-none rounded-2xl py-5 px-6 font-mono text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Zone ID</label>
                        <input value={cfZone} onChange={(e) => setCfZone(e.target.value)} placeholder="023e105f9c29..." className="w-full bg-slate-100 border-none rounded-2xl py-5 px-6 font-mono text-sm" />
                      </div>
                   </div>
                 )}

                 <div className="flex gap-6 pt-10">
                    <button onClick={() => setShowCertModal(false)} className="flex-1 py-6 text-slate-400 font-black uppercase tracking-widest text-[10px]">Cancel</button>
                    <button 
                      onClick={handleProvisionSSL}
                      disabled={loading}
                      className="flex-[2] bg-slate-900 text-white py-6 rounded-3xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 shadow-2xl shadow-slate-200"
                    >
                       {loading ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} /> Orchestrate SSL</>}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
      
      {/* Infrastructure Overview Section */}
      <div className="space-y-8 pt-12">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] px-4">Node Topology</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <InfraNode 
             title="Control API" 
             url={`http://${window.location.hostname}/api/control`} 
             status="online" 
             icon={<Terminal size={20} />} 
           />
           <InfraNode 
             title="Data Plane" 
             url={`http://${window.location.hostname}/api/data`} 
             status="online" 
             icon={<Server size={20} />} 
           />
           <InfraNode 
             title="Storage Node" 
             url={`/local/storage`} 
             status="active" 
             icon={<Cloud size={20} />} 
           />
        </div>
      </div>
    </div>
  );
};

const InfraNode: React.FC<{ title: string, url: string, status: string, icon: React.ReactNode }> = ({ title, url, status, icon }) => (
  <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm flex items-center gap-6">
    <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
           <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
           {status}
        </span>
      </div>
      <p className="text-sm font-bold text-slate-900 truncate font-mono">{url}</p>
    </div>
  </div>
);

export default SystemSettings;