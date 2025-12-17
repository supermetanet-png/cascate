
import React from 'react';
import { Shield, Key, Database, Activity, Globe, Copy, CheckCircle2 } from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

const data = [
  { name: '00:00', requests: 400, errors: 2 },
  { name: '04:00', requests: 300, errors: 1 },
  { name: '08:00', requests: 900, errors: 5 },
  { name: '12:00', requests: 1200, errors: 12 },
  { name: '16:00', requests: 1500, errors: 8 },
  { name: '20:00', requests: 800, errors: 3 },
  { name: '23:59', requests: 600, errors: 2 },
];

const ProjectDetail: React.FC<{ projectId: string }> = ({ projectId }) => {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">E-Commerce Backend</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded">{projectId}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 size={14} /> Active & Healthy
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all">Pause Project</button>
          <button className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium hover:bg-red-100 transition-all">Delete</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total Requests" value="128.4k" trend="+12.5%" icon={<Activity className="text-blue-500" />} />
        <StatCard title="API Error Rate" value="0.04%" trend="-2.1%" icon={<Shield className="text-rose-500" />} />
        <StatCard title="DB CPU Usage" value="24%" trend="Stable" icon={<Database className="text-emerald-500" />} />
        <StatCard title="Active Sessions" value="1,402" trend="+84" icon={<Globe className="text-amber-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 border border-slate-200 rounded-xl p-6 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800">Traffic Activity (24h)</h3>
            <select className="text-xs font-semibold text-slate-500 border border-slate-200 rounded p-1 outline-none">
              <option>Last 24 Hours</option>
              <option>Last 7 Days</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#4f46e5" fillOpacity={1} fill="url(#colorReq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Credentials */}
        <div className="border border-slate-200 rounded-xl p-6 bg-white shadow-sm flex flex-col">
          <h3 className="font-bold text-slate-800 mb-6">API Configuration</h3>
          
          <div className="space-y-6 flex-1">
            <ConfigItem label="Project URL" value={`https://api.cascata.io/${projectId}`} />
            <ConfigItem label="Anon Key (Public)" value="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." isSecret />
            <ConfigItem label="Service Role (Private)" value="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." isSecret />
            <ConfigItem label="JWT Secret" value="482f5b...d7a12b" isSecret />
          </div>

          <button className="mt-8 w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
            <Key size={16} /> Rotate Secrets
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string, value: string, trend: string, icon: React.ReactNode }> = ({ title, value, trend, icon }) => (
  <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <span className="text-slate-500 text-sm font-medium">{title}</span>
      {icon}
    </div>
    <div className="flex items-end gap-2">
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className={`text-xs font-bold ${trend.startsWith('+') ? 'text-emerald-500' : trend === 'Stable' ? 'text-slate-400' : 'text-rose-500'}`}>
        {trend}
      </span>
    </div>
  </div>
);

const ConfigItem: React.FC<{ label: string, value: string, isSecret?: boolean }> = ({ label, value, isSecret }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <button className="text-indigo-600 hover:text-indigo-800 transition-colors">
        <Copy size={12} />
      </button>
    </div>
    <div className="bg-slate-50 border border-slate-100 rounded px-3 py-2 font-mono text-xs text-slate-600 truncate">
      {isSecret ? '•'.repeat(24) : value}
    </div>
  </div>
);

export default ProjectDetail;
