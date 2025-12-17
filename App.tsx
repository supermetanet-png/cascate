
import React, { useState, useEffect } from 'react';
import { 
  Layout, 
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
  Key
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import DatabaseExplorer from './pages/DatabaseExplorer';
import AuthConfig from './pages/AuthConfig';
import RLSManager from './pages/RLSManager';
import RPCManager from './pages/RPCManager';

// Simple Hash Router for the environment
const App: React.FC = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#/projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/projects');
      
      // Parse project ID if present
      const parts = window.location.hash.split('/');
      if (parts[1] === 'project' && parts[2]) {
        setSelectedProjectId(parts[2]);
      } else {
        setSelectedProjectId(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (hash: string) => {
    window.location.hash = hash;
  };

  const renderContent = () => {
    const hash = currentHash;
    if (hash === '#/projects' || hash === '') return <Dashboard onSelectProject={(id) => navigate(`#/project/${id}`)} />;
    
    if (hash.startsWith('#/project/')) {
      const parts = hash.split('/');
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
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 flex flex-col bg-slate-50/50">
        <div className="p-6 flex items-center gap-3 border-b border-slate-100 bg-white">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Layers className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">Cascata</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3">Main</div>
          <SidebarItem 
            icon={<Server size={18} />} 
            label="Projects" 
            active={currentHash === '#/projects'} 
            onClick={() => navigate('#/projects')} 
          />
          
          {selectedProjectId && (
            <>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-8 mb-2 px-3">Project Management</div>
              <SidebarItem 
                icon={<Activity size={18} />} 
                label="Overview" 
                active={currentHash.includes('/overview')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/overview`)} 
              />
              <SidebarItem 
                icon={<Database size={18} />} 
                label="Tables" 
                active={currentHash.includes('/database')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/database`)} 
              />
              <SidebarItem 
                icon={<Shield size={18} />} 
                label="Policies (RLS)" 
                active={currentHash.includes('/rls')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/rls`)} 
              />
              <SidebarItem 
                icon={<Code2 size={18} />} 
                label="Functions (RPC)" 
                active={currentHash.includes('/rpc')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/rpc`)} 
              />
              <SidebarItem 
                icon={<Users size={18} />} 
                label="Authentication" 
                active={currentHash.includes('/auth')} 
                onClick={() => navigate(`#/project/${selectedProjectId}/auth`)} 
              />
              <SidebarItem 
                icon={<Settings size={18} />} 
                label="Settings" 
                active={false} 
                onClick={() => {}} 
              />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">AD</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">Admin User</p>
              <p className="text-xs text-slate-500 truncate">Control Plane</p>
            </div>
            <LogOutButton />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-white flex flex-col">
        {renderContent()}
      </main>
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
      active 
        ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm ring-1 ring-indigo-200' 
        : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    <span className={active ? 'text-indigo-600' : 'text-slate-400'}>{icon}</span>
    {label}
  </button>
);

const LogOutButton = () => (
  <button className="text-slate-400 hover:text-red-500 transition-colors">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  </button>
);

export default App;
