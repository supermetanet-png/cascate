
import React, { useState, useEffect } from 'react';
import { 
  Database, Settings, Shield, Activity, Code2, Users, Layers,
  ChevronRight, Plus, Search, Terminal, Server, Key, Bell,
  Command, LogOut, Clock, Settings2, HardDrive, Zap
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import DatabaseExplorer from './pages/DatabaseExplorer';
import AuthConfig from './pages/AuthConfig';
import RLSManager from './pages/RLSManager';
import RPCManager from './pages/RPCManager';
import Login from './pages/Login';
import SystemSettings from './pages/SystemSettings';
import StorageExplorer from './pages/StorageExplorer';
import EventManager from './pages/EventManager';
import ProjectLogs from './pages/ProjectLogs';

const App: React.FC = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#/projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('cascata_token'));

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '#/projects';
      setCurrentHash(hash);
      const parts = hash.split('/');
      if (parts[1] === 'project' && parts[2]) setSelectedProjectId(parts[2]);
      else setSelectedProjectId(null);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (hash: string) => { window.location.hash = hash; };
  const handleLogout = () => { localStorage.removeItem('cascata_token'); setIsAuthenticated(false); navigate('#/login'); };

  const renderContent = () => {
    if (currentHash === '#/login') return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
    if (!isAuthenticated) return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
    if (currentHash === '#/projects' || currentHash === '') return <Dashboard onSelectProject={(id) => navigate(`#/project/${id}`)} />;
    if (currentHash === '#/settings') return <SystemSettings />;
    
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
        case 'storage': return <StorageExplorer projectId={projectId} />;
        case 'events': return <EventManager projectId={projectId} />;
        case 'logs': return <ProjectLogs projectId={projectId} />;
        default: return <ProjectDetail projectId={projectId} />;
      }
    }
    return <Dashboard onSelectProject={(id) => navigate(`#/project/${id}`)} />;
  };

  if (currentHash === '#/login' || !isAuthenticated) return renderContent();

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
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
          <SidebarItem icon={<Server size={18} />} label="All Projects" active={currentHash === '#/projects'} onClick={() => navigate('#/projects')} />
          <SidebarItem icon={<Settings2 size={18} />} label="System Settings" active={currentHash === '#/settings'} onClick={() => navigate('#/settings')} />
          
          {selectedProjectId && (
            <>
              <div className="mt-8 mb-3 px-3 flex items-center justify-between">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Instance</div>
              </div>
              <SidebarItem icon={<Activity size={18} />} label="Overview" active={currentHash.includes('/overview')} onClick={() => navigate(`#/project/${selectedProjectId}/overview`)} />
              <SidebarItem icon={<Database size={18} />} label="Data Browser" active={currentHash.includes('/database')} onClick={() => navigate(`#/project/${selectedProjectId}/database`)} />
              <SidebarItem icon={<HardDrive size={18} />} label="Native Storage" active={currentHash.includes('/storage')} onClick={() => navigate(`#/project/${selectedProjectId}/storage`)} />
              <SidebarItem icon={<Zap size={18} />} label="Event Hooks" active={currentHash.includes('/events')} onClick={() => navigate(`#/project/${selectedProjectId}/events`)} />
              <SidebarItem icon={<Terminal size={18} />} label="API Traffic" active={currentHash.includes('/logs')} onClick={() => navigate(`#/project/${selectedProjectId}/logs`)} />
              <SidebarItem icon={<Shield size={18} />} label="Access Control" active={currentHash.includes('/rls')} onClick={() => navigate(`#/project/${selectedProjectId}/rls`)} />
              <SidebarItem icon={<Clock size={18} />} label="RPC & Logic" active={currentHash.includes('/rpc')} onClick={() => navigate(`#/project/${selectedProjectId}/rpc`)} />
              <SidebarItem icon={<Users size={18} />} label="Auth Services" active={currentHash.includes('/auth')} onClick={() => navigate(`#/project/${selectedProjectId}/auth`)} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-rose-600 transition-all mb-4 group text-xs font-medium">
             <div className="flex items-center gap-2"><LogOut size={14} /> Logout</div>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col relative text-slate-900">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-end px-8 gap-4 sticky top-0 z-10 shadow-sm/5">
          <button className="text-slate-400 hover:text-slate-600 p-2"><Bell size={18} /></button>
          <div className="h-6 w-[1px] bg-slate-200 mx-2"></div>
          <button onClick={() => navigate('#/projects')} className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2"><Plus size={14} /> NEW PROJECT</button>
        </header>
        <div className="flex-1">{renderContent()}</div>
      </main>
    </div>
  );
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${active ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
    <span className={active ? 'text-white' : 'text-slate-400'}>{icon}</span> {label}
  </button>
);

export default App;
