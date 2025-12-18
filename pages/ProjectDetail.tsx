
import React, { useState, useEffect } from 'react';
import { Shield, Key, Database, Activity, CheckCircle2, Loader2, Server } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockChartData = [
  { name: '00:00', requests: 400 }, { name: '08:00', requests: 900 },
  { name: '12:00', requests: 1200 }, { name: '16:00', requests: 1500 },
  { name: '23:59', requests: 600 }
];

const ProjectDetail: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/data/${projectId}/stats`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
        });
        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching real stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [projectId]);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{projectId} Instance</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded">Production Env</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-600 font-bold text-sm uppercase tracking-widest">
              <CheckCircle2 size={14} /> Healthy
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Isolated Tables" 
          value={loading ? '...' : stats?.tables?.toString() || '0'} 
          icon={<Database className="text-indigo-600" />} 
          label="Schema: public"
        />
        <StatCard 
          title="Auth Users" 
          value={loading ? '...' : stats?.users?.toString() || '0'} 
          icon={<Shield className="text-emerald-500" />} 
          label="Schema: auth"
        />
        <StatCard 
          title="DB Storage" 
          value={loading ? '...' : stats?.size || '0 MB'} 
          icon={<Server className="text-blue-500" />} 
          label="Physical Disk Usage"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 border border-slate-200 rounded-[2rem] p-8 bg-white shadow-sm overflow-hidden relative">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-900">Traffic Monitor (Virtual)</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                <Tooltip />
                <Area type="monotone" dataKey="requests" stroke="#4f46e5" fillOpacity={1} fill="url(#colorReq)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-slate-200 rounded-[2rem] p-8 bg-white shadow-sm space-y-8">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Key size={18} className="text-indigo-600" />
            Connection Info
          </h3>
          <ConfigItem label="Project Endpoint" value={`https://api.cascata.io/data/${projectId}`} />
          <ConfigItem label="Database Name" value={`cascata_proj_${projectId.replace(/-/g, '_')}`} />
          <ConfigItem label="Auth Mode" value="JWT Multi-Tenant" />
          
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
            <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mb-1">Security Status</p>
            <p className="text-xs text-indigo-900 font-medium">This instance is running with a dedicated PostgreSQL database process. Data isolation is physical.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string, value: string, icon: React.ReactNode, label: string }> = ({ title, value, icon, label }) => (
  <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all group">
    <div className="flex items-center justify-between mb-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-4xl font-black text-slate-900 mb-1">{value}</div>
    <div className="text-sm font-bold text-slate-400 uppercase tracking-tighter">{title}</div>
  </div>
);

const ConfigItem: React.FC<{ label: string, value: string }> = ({ label, value }) => (
  <div className="space-y-1.5">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono text-xs text-slate-600 truncate">
      {value}
    </div>
  </div>
);

export default ProjectDetail;
