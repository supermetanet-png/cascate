
import React, { useState } from 'react';
import { Plus, Search, ExternalLink, Activity, Database, Clock, MoreVertical, Terminal } from 'lucide-react';
import { Project } from '../types';

interface DashboardProps {
  onSelectProject: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onSelectProject }) => {
  const [projects] = useState<Project[]>([
    {
      id: 'proj_7612',
      name: 'Cascata Pro Shop',
      status: 'healthy',
      database_url: 'postgres://user:***@db:5432/ecommerce',
      api_url: 'https://api.cascata.io/proj_7612',
      created_at: '2024-01-10T08:00:00Z',
      jwt_secret: '********************'
    },
    {
      id: 'proj_9901',
      name: 'Sentinel Analytics',
      status: 'degraded',
      database_url: 'postgres://user:***@db:5432/mobile_api',
      api_url: 'https://api.cascata.io/proj_9901',
      created_at: '2024-01-12T14:30:00Z',
      jwt_secret: '********************'
    }
  ]);

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto w-full">
      <div className="flex items-end justify-between mb-12">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Project Registry</h1>
          <p className="text-slate-500 mt-2 text-lg">Your isolated, production-grade cloud environments.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
            <Terminal size={18} /> CLI Connect
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-indigo-100 hover:-translate-y-0.5">
            <Plus size={20} /> Create Project
          </button>
        </div>
      </div>

      <div className="mb-8 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search projects by name or UUID..." 
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          <select className="bg-white border border-slate-200 rounded-2xl px-6 py-3 text-slate-600 font-bold outline-none shadow-sm hover:border-slate-300 transition-colors">
            <option>All Regions</option>
            <option>us-east-1</option>
            <option>sa-east-1</option>
          </select>
          <select className="bg-white border border-slate-200 rounded-2xl px-6 py-3 text-slate-600 font-bold outline-none shadow-sm hover:border-slate-300 transition-colors">
            <option>All Statuses</option>
            <option>Healthy</option>
            <option>Degraded</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onClick={() => onSelectProject(project.id)} />
        ))}
        
        <button className="border-2 border-dashed border-slate-200 rounded-[2rem] p-8 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all group">
          <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center mb-6 group-hover:border-indigo-300 group-hover:scale-110 transition-all duration-300">
            <Plus size={32} />
          </div>
          <span className="font-bold text-lg">Provision New Instance</span>
          <p className="text-sm mt-1 text-slate-400">Dedicated DB & Edge Runtime</p>
        </button>
      </div>
    </div>
  );
};

const ProjectCard: React.FC<{ project: Project, onClick: () => void }> = ({ project, onClick }) => {
  const statusColor = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    error: 'bg-rose-500'
  }[project.status];

  return (
    <div 
      onClick={onClick}
      className="group relative bg-white border border-slate-200 rounded-[2rem] p-8 hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-200 transition-all cursor-pointer flex flex-col h-full overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-2 h-full bg-slate-100 group-hover:bg-indigo-500 transition-colors"></div>
      
      <div className="flex items-start justify-between mb-8">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
          <Database size={24} />
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor} animate-pulse`}></span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {project.status}
          </span>
          <button className="p-1 text-slate-300 hover:text-slate-600 transition-colors">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>
      
      <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors mb-2 leading-tight">
        {project.name}
      </h3>
      <p className="text-xs text-slate-400 mb-8 font-mono bg-slate-50 px-2 py-1 rounded inline-block w-fit">
        {project.id}
      </p>
      
      <div className="space-y-4 mt-auto">
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-indigo-500" />
            <span>Throughput</span>
          </div>
          <span className="text-slate-900">124 req/s</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <span>Uptime</span>
          </div>
          <span className="text-slate-900">99.98%</span>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-indigo-600 text-sm font-black">
        <span className="group-hover:translate-x-1 transition-transform inline-block">MANAGE STUDIO</span>
        <ExternalLink size={18} />
      </div>
    </div>
  );
};

export default Dashboard;
