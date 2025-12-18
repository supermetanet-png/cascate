
import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Settings, 
  Shield, 
  Activity, 
  Code2, 
  Users, 
  Layers,
  ChevronRight,
  Plus,
  Search,
  Terminal,
  Server,
  Key,
  Bell,
  Command
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import DatabaseExplorer from './pages/DatabaseExplorer';
import AuthConfig from './pages/AuthConfig';
import RLSManager from './pages/RLSManager';
import RPCManager from './pages/RPCManager';

const App: React.FC = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#/projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '#/projects';
      setCurrentHash(hash);
      
      const parts = hash.split('/');
      if (parts[1] === 'project' && parts[2]) {
        setSelectedProjectId(parts[2]);
      } else {
        setSelectedProjectId(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (hash: string) => {
    window.location.hash = hash;
  };

  const renderContent = () => {
    if (currentHash === '#/projects' || currentHash === '') return <Dashboard onSelectProject={(id) => navigate(`#/project/${id}`)} />;
    
    if (currentHash.startsWith('#/project/')) {
      const parts = currentHash.split('/');
      const section = parts[3] || 'overview';
      const projectId = parts[2];

      switch(section) {
        case 'overview': return <ProjectDetail projectId={projectId} />;
        case 'database': return <DatabaseExplorer projectId={projectId} />;
        case 'auth': return <AuthConfig projectId={projectId} />;
        case 'rls': return <RLSManager projectId={projectId} />;
        case 'rpc': return <RPCManager projectId={projectId} />;
        default: return <ProjectDetail projectId={projectId} />;
      }
    }

    return <Dashboard onSelectProject={(id) => navigate(`#/project/${id}`)} />;
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="w-[260px] border-r border-slate-200 flex flex-col bg-white shadow-sm z-20">
        <div className="p-5 flex items-center gap-3 border-b border-slate-100">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-slate-900 block leading-none">Cascata</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 block">Studio v1.0</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 px-3">Main Console</div>
          <SidebarItem 
            icon={<Server size={18} />} 
            label="All Projects" 
            active={currentHash === '#/projects'} 
            onClick={() => navigate('#/projects')} 
          />
          
          {selectedProjectId && (
            <>
              <div className="mt-8 mb-3 px-3 flex items-center justify-between">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Instance</div>
                <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">Active</span>
              </div>
              <SidebarItem 
                icon={<Activity size={18} />} 
                label="Overview" 
                active={currentHash.includes('/overview')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/overview`)} 
              />
              <SidebarItem 
                icon={<Database size={18} />} 
                label="Data Browser" 
                active={currentHash.includes('/database')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/database`)} 
              />
              <SidebarItem 
                icon={<Shield size={18} />} 
                label="Access Control" 
                active={currentHash.includes('/rls')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/rls`)} 
              />
              <SidebarItem 
                icon={<Code2 size={18} />} 
                label="Edge Functions" 
                active={currentHash.includes('/rpc')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/rpc`)} 
              />
              <SidebarItem 
                icon={<Users size={18} />} 
                label="Auth Services" 
                active={currentHash.includes('/auth')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/auth`)} 
              />
              <SidebarItem 
                icon={<Settings size={18} />} 
                label="Project Config" 
                active={false} 
                onClick={() => {}} 
              />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 transition-all mb-4 group">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Command size={14} />
              <span>Quick Actions</span>
            </div>
            <span className="text-[10px] bg-white border border-slate-200 px-1 rounded text-slate-400 group-hover:border-slate-300">⌘K</span>
          </button>
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shadow-md">AD</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">Admin</p>
              <p className="text-[10px] text-slate-400 truncate">Root Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-end px-8 gap-4 sticky top-0 z-10 shadow-sm/5">
          <button className="text-slate-400 hover:text-slate-600 transition-colors p-2">
            <Bell size={18} />
          </button>
          <div className="h-6 w-[1px] bg-slate-200 mx-2"></div>
          <button className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
            <Plus size={14} /> NEW PROJECT
          </button>
        </header>
        <div className="flex-1">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
      active 
        ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-100' 
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <span className={active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}>{icon}</span>
    {label}
  </button>
);

export default App;
