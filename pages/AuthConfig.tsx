
import React, { useState } from 'react';
import { Mail, Globe, ShieldCheck, UserPlus, Lock, Key } from 'lucide-react';

const AuthConfig: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [emailAuth, setEmailAuth] = useState(true);
  const [googleAuth, setGoogleAuth] = useState(false);

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Authentication</h2>
        <p className="text-slate-500">Configure how users identify themselves within this project.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Email/Password */}
        <section className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="p-6 flex items-start gap-4 border-b border-slate-100">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Mail size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Email & Password</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={emailAuth} 
                    onChange={(e) => setEmailAuth(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="text-sm text-slate-500 mt-1">Allow users to sign up using an email address and a password.</p>
            </div>
          </div>
          {emailAuth && (
            <div className="p-6 bg-slate-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Confirm Email</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Secure Passwords (Min 8 chars)</span>
                <input type="checkbox" className="rounded" defaultChecked />
              </div>
            </div>
          )}
        </section>

        {/* OAuth */}
        <section className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="p-6 flex items-start gap-4 border-b border-slate-100">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <Globe size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Google OAuth</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={googleAuth} 
                    onChange={(e) => setGoogleAuth(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="text-sm text-slate-500 mt-1">Enable one-click login with Google accounts.</p>
            </div>
          </div>
          {googleAuth && (
            <div className="p-6 bg-slate-50/50 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Client ID</label>
                <input 
                  type="password" 
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value="10928374-jklasnd-googleusercontent.com"
                  readOnly
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Client Secret</label>
                <input 
                  type="password" 
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value="GOCSPX-jsadjas71239"
                  readOnly
                />
              </div>
            </div>
          )}
        </section>

        {/* User Management Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="flex items-center justify-center gap-3 p-4 border border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 transition-all font-medium">
            <UserPlus size={20} /> Create User Manualy
          </button>
          <button className="flex items-center justify-center gap-3 p-4 border border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition-all font-medium">
            <Lock size={20} /> Reset All Sessions
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthConfig;
