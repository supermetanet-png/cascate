
import React, { useState, useEffect } from 'react';
import { Plus, Search, ExternalLink, Activity, Database, Clock, MoreVertical, Terminal, Loader2 } from 'lucide-react';
import { Project } from '../types';

interface DashboardProps {
  onSelectProject: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', slug: '' });

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/control/projects', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` }
      });
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      console.error('Error fetching projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/control/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('cascata_token')}`
        },
        body: JSON.stringify(newProject),
      });
      if (response.ok) {
        setShowCreateModal(false);
        setNewProject({ name: '', slug: '' });
        fetchProjects();
      }
    } catch (err) {
      console.error('Error creating project');
    }
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto w-full">
      <div className="flex items-end justify-between mb-12">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Project Registry</h1>
          <p className="text-slate-500 mt-2 text-lg">Your isolated, production-grade cloud environments.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-indigo-100 hover:-translate-y-0.5">
            <Plus size={20} /> Create Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p className="font-medium">Loading your instances...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onClick={() => onSelectProject(project.slug)} />
          ))}
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="border-2 border-dashed border-slate-200 rounded-[2rem] p-8 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all group"
          >
            <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center mb-6 group-hover:border-indigo-300 group-hover:scale-110 transition-all duration-300">
              <Plus size={32} />
            </div>
            <span className="font-bold text-lg">Provision New Instance</span>
            <p className="text-sm mt-1 text-slate-400">Dedicated Schema & Keys</p>
          </button>
        </div>
      )}

      {/* Modal de Criação */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black text-slate-900 mb-2">New Project</h2>
            <p className="text-slate-500 mb-8">This will provision a new database schema and API gateway.</p>
            
            <form onSubmit={handleCreateProject} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Project Name</label>
                <input 
                  type="text" 
                  value={newProject.name}
                  onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="My SaaS App"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Database Slug (ID)</label>
                <input 
                  type="text" 
                  value={newProject.slug}
                  onChange={(e) => setNewProject({...newProject, slug: e.target.value.toLowerCase().replace(/ /g, '-')})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                  placeholder="my-saas-app"
                  required
                />
              </div>
              
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Provision Instance</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
        </div>
      </div>
      
      <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors mb-2 leading-tight">
        {project.name}
      </h3>
      <p className="text-xs text-slate-400 mb-8 font-mono bg-slate-50 px-2 py-1 rounded inline-block w-fit">
        ID: {project.slug}
      </p>
      
      <div className="space-y-4 mt-auto">
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-indigo-500" />
            <span>Mode</span>
          </div>
          <span className="text-slate-900">Isolated Schema</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <span>Region</span>
          </div>
          <span className="text-slate-900">Local VPS</span>
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
