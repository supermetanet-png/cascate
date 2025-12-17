
import React from 'react';
import { Shield, Lock, Unlock, Plus, Trash2, Edit2, AlertCircle } from 'lucide-react';

const RLSManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Row Level Security (RLS)</h2>
          <p className="text-slate-500">Define granular access control policies for your database tables.</p>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
          <Plus size={20} /> New Policy
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-4">
        <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
        <div>
          <h4 className="font-bold text-amber-800 text-sm">Security Best Practice</h4>
          <p className="text-amber-700 text-sm mt-0.5">Always enable RLS on any table containing sensitive data. By default, tables are "Open" unless a policy or explicit lock is applied.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            Active Policies <span className="text-slate-400 text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">3 total</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <PolicyCard 
            name="Allow public read-only" 
            table="products" 
            action="SELECT" 
            definition="true" 
            status="active" 
          />
          <PolicyCard 
            name="Users can update own profile" 
            table="users" 
            action="UPDATE" 
            definition="auth.uid() = id" 
            status="active" 
          />
          <PolicyCard 
            name="Admin full access" 
            table="users" 
            action="ALL" 
            definition="auth.role() = 'admin'" 
            status="active" 
          />
        </div>
      </div>
    </div>
  );
};

const PolicyCard: React.FC<{ name: string, table: string, action: string, definition: string, status: string }> = ({ name, table, action, definition, status }) => (
  <div className="border border-slate-200 rounded-xl bg-white p-5 hover:border-indigo-200 hover:shadow-md transition-all group">
    <div className="flex items-start justify-between">
      <div className="flex gap-4">
        <div className="p-2 bg-slate-50 text-slate-400 rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
          <Shield size={20} />
        </div>
        <div>
          <h4 className="font-bold text-slate-900">{name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{table}</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{action}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg"><Edit2 size={16} /></button>
        <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded-lg"><Trash2 size={16} /></button>
      </div>
    </div>
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-emerald-400 overflow-x-auto">
        <span className="text-slate-500">USING</span> ({definition});
      </div>
    </div>
  </div>
);

export default RLSManager;
