
import React, { useState } from 'react';
import { Plus, Search, ExternalLink, Activity, Database, Clock } from 'lucide-react';
import { Project } from '../types';

interface DashboardProps {
  onSelectProject: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onSelectProject }) => {
  const [projects] = useState<Project[]>([
    {
      id: 'proj_7612',
      name: 'E-Commerce Backend',
      status: 'healthy',
      database_url: 'postgres://user:***@db:5432/ecommerce',
      api_url: 'https://api.cascata.io/proj_7612',
      created_at: '2024-01-10T08:00:00Z',
      jwt_secret: '********************'
    },
    {
      id: 'proj_9901',
      name: 'Mobile App API',
      status: 'degraded',
      database_url: 'postgres://user:***@db:5432/mobile_api',
      api_url: 'https://api.cascata.io/proj_9901',
      created_at: '2024-01-12T14:30:00Z',
      jwt_secret: '********************'
    }
  ]);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Your Projects</h1>
          <p className="text-slate-500 mt-1">Manage and monitor your isolated backend instances.</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg shadow-indigo-100">
          <Plus size={20} /> New Project
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search projects..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>
        <select className="border border-slate-200 rounded-lg px-4 py-2 bg-white text-slate-600 outline-none">
          <option>All Statuses</option>
          <option>Healthy</option>
          <option>Degraded</option>
          <option>Error</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onClick={() => onSelectProject(project.id)} />
        ))}
        
        {/* Create placeholder */}
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-500 cursor-pointer transition-all bg-slate-50/50 group">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center mb-4 group-hover:border-indigo-300 group-hover:bg-indigo-50">
            <Plus size={24} />
          </div>
          <span className="font-medium">Create New Project</span>
        </div>
      </div>
    </div>
  );
};

const ProjectCard: React.FC<{ project: Project, onClick: () => void }> = ({ project, onClick }) => {
  const statusColor = {
    healthy: 'bg-emerald-100 text-emerald-700',
    degraded: 'bg-amber-100 text-amber-700',
    error: 'bg-rose-100 text-rose-700'
  }[project.status];

  return (
    <div 
      onClick={onClick}
      className="border border-slate-200 rounded-xl p-6 bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-indigo-200 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
          <Database size={20} />
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
          {project.status}
        </span>
      </div>
      
      <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-1">{project.name}</h3>
      <p className="text-sm text-slate-500 mb-6 font-mono truncate">{project.id}</p>
      
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock size={14} />
          <span>Created Jan 15, 2024</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity size={14} />
          <span>8.2k requests/24h</span>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-indigo-600 text-sm font-semibold">
        <span>Manage Instance</span>
        <ExternalLink size={16} />
      </div>
    </div>
  );
};

export default Dashboard;
