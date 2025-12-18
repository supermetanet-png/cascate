
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Code2, 
  Play, 
  Plus, 
  Book, 
  Clock, 
  Terminal, 
  Loader2, 
  Folder, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  FileCode, 
  Search, 
  MoreVertical, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  X, 
  Zap, 
  Info,
  ExternalLink,
  Save,
  Cpu,
  RefreshCw,
  Layout,
  /* Added missing AlertCircle import */
  AlertCircle
} from 'lucide-react';

type AssetType = 'rpc' | 'trigger' | 'cron' | 'folder';

interface ProjectAsset {
  id: string;
  name: string;
  type: AssetType;
  parent_id: string | null;
  metadata: {
    notes?: string;
    db_object_name?: string;
  };
}

const RPCManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeContext, setActiveContext] = useState<AssetType>('rpc');
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [dbObjects, setDbObjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ProjectAsset | null>(null);
  
  // Editor State
  const [editorSql, setEditorSql] = useState('-- Writing high-performance SQL...');
  const [notes, setNotes] = useState('');
  const [testParams, setTestParams] = useState('{\n  "param1": "value"\n}');
  const [testResult, setTestResult] = useState<any>(null);
  
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${response.status}`);
    }
    return response.json();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [assetsData, functionsData, triggersData] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/assets`),
        fetchWithAuth(`/api/data/${projectId}/functions`),
        fetchWithAuth(`/api/data/${projectId}/triggers`)
      ]);
      setAssets(assetsData);
      // Combine all DB objects for discovery
      setDbObjects([...functionsData.map((f:any) => ({...f, type: 'rpc'})), ...triggersData.map((t:any) => ({...t, type: 'trigger'}))]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const handleCreateAsset = async (name: string, type: AssetType, parentId: string | null = null) => {
    try {
      const newAsset = await fetchWithAuth(`/api/data/${projectId}/assets`, {
        method: 'POST',
        body: JSON.stringify({ name, type, parent_id: parentId })
      });
      setAssets([...assets, newAsset]);
      setSelectedAsset(newAsset);
      setSuccessMsg(`${type.toUpperCase()} asset initialized.`);
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveObject = async () => {
    if (!selectedAsset) return;
    setExecuting(true);
    try {
      // Execute the SQL to save to DB
      await fetchWithAuth(`/api/data/${projectId}/query`, {
        method: 'POST',
        body: JSON.stringify({ sql: editorSql })
      });
      
      // Update metadata (notes) in system
      const updated = await fetchWithAuth(`/api/data/${projectId}/assets`, {
        method: 'POST',
        body: JSON.stringify({ 
          ...selectedAsset, 
          metadata: { ...selectedAsset.metadata, notes } 
        })
      });
      
      setAssets(assets.map(a => a.id === updated.id ? updated : a));
      setSuccessMsg('Object compiled and committed successfully.');
      setTimeout(() => setSuccessMsg(null), 2000);
      fetchData(); // Refresh DB object definitions
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const executeTest = async () => {
    if (!selectedAsset) return;
    setExecuting(true);
    try {
      const params = JSON.parse(testParams);
      const sql = selectedAsset.type === 'rpc' 
        ? `SELECT public.${selectedAsset.name}(${Object.values(params).map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`
        : `-- Logic test for ${selectedAsset.type}`;
        
      const result = await fetchWithAuth(`/api/data/${projectId}/query`, {
        method: 'POST',
        body: JSON.stringify({ sql })
      });
      setTestResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const copyCurl = () => {
    if (!selectedAsset) return;
    const curl = `curl -X POST https://api.cascata.io/data/${projectId}/rpc/${selectedAsset.name} \\
  -H "Content-Type: application/json" \\
  -d '${testParams}'`;
    navigator.clipboard.writeText(curl);
    setSuccessMsg('cURL copied to clipboard');
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const filteredAssets = useMemo(() => {
    return assets.filter(a => a.type === 'folder' || a.type === activeContext);
  }, [assets, activeContext]);

  const treeData = useMemo(() => {
    const buildTree = (parentId: string | null = null) => {
      return filteredAssets
        .filter(a => a.parent_id === parentId)
        .map(a => ({
          ...a,
          children: a.type === 'folder' ? buildTree(a.id) : []
        }));
    };
    return buildTree(null);
  }, [filteredAssets]);

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const renderTreeItem = (item: any) => {
    const isFolder = item.type === 'folder';
    const isExpanded = expandedFolders.has(item.id);
    const isSelected = selectedAsset?.id === item.id;

    return (
      <div key={item.id} className="select-none">
        <div 
          onClick={() => {
            if (isFolder) toggleFolder(item.id);
            else {
              setSelectedAsset(item);
              const dbObj = dbObjects.find(o => o.name === item.name);
              setEditorSql(dbObj?.definition || `-- Define ${item.name}...`);
              setNotes(item.metadata?.notes || '');
            }
          }}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all group ${isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          {isFolder ? (
            <>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={18} className={isSelected ? 'text-white' : 'text-slate-400'} />
            </>
          ) : (
            <FileCode size={18} className={isSelected ? 'text-white' : 'text-slate-400'} />
          )}
          <span className="text-sm font-bold truncate">{item.name}</span>
          {!isFolder && (
            <div className={`ml-auto opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? 'text-white' : 'text-slate-300'}`}>
              <MoreVertical size={14} />
            </div>
          )}
        </div>
        {isFolder && isExpanded && (
          <div className="pl-6 mt-1 space-y-1">
            {item.children.map(renderTreeItem)}
            <button 
              onClick={(e) => { e.stopPropagation(); handleCreateAsset('new_' + activeContext, activeContext, item.id); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
            >
              <Plus size={12} /> Add {activeContext.toUpperCase()}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#FDFDFD] overflow-hidden">
      {/* Notifications */}
      {(error || successMsg) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[400] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {/* Fix: AlertCircle was missing from imports */}
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || successMsg}</span>
          <button onClick={() => { setError(null); setSuccessMsg(null); }} className="ml-4 opacity-50"><X size={16} /></button>
        </div>
      )}

      {/* Header Context Switcher */}
      <header className="border-b border-slate-200 px-10 py-6 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl"><Cpu size={24} /></div>
          <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter leading-tight">Logic Engine</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em]">Project Orchestration</p></div>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setActiveContext('rpc')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeContext === 'rpc' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Code2 size={16}/> RPC</button>
            <button onClick={() => setActiveContext('trigger')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeContext === 'trigger' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Zap size={16}/> TRIGGERS</button>
            <button onClick={() => setActiveContext('cron')} className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all flex items-center gap-2 ${activeContext === 'cron' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}><Clock size={16}/> CRON JOBS</button>
          </div>
          <button onClick={() => handleCreateAsset('new_folder', 'folder')} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all" title="New Folder"><FolderPlus size={24} /></button>
          <button onClick={() => handleCreateAsset('new_' + activeContext, activeContext)} className="bg-indigo-600 text-white px-8 py-3.5 rounded-2xl text-xs font-black flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"><Plus size={20} /> NEW {activeContext.toUpperCase()}</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="p-6">
            <div className="relative group"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} /><input placeholder="Search assets..." className="w-full pl-12 pr-4 py-3.5 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" /></div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-1">
            <div className="flex items-center justify-between px-3 py-4"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeContext} Registry</span><RefreshCw size={12} className={`text-slate-300 hover:text-indigo-600 cursor-pointer ${loading ? 'animate-spin' : ''}`} onClick={fetchData} /></div>
            {treeData.map(renderTreeItem)}
          </div>
        </aside>

        {/* Main Editor Surface */}
        <main className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC]">
          {selectedAsset ? (
            <div className="flex-1 flex flex-col">
              <div className="bg-white border-b border-slate-200 px-10 py-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Object</span><span className="text-xl font-black text-slate-900 tracking-tight">{selectedAsset.name}</span></div>
                  <div className="h-10 w-[1px] bg-slate-200"></div>
                  <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dbObjects.some(o => o.name === selectedAsset.name) ? 'bg-emerald-500' : 'bg-slate-200 animate-pulse'}`}></span><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dbObjects.some(o => o.name === selectedAsset.name) ? 'Synchronized' : 'Draft Mode'}</span></div>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={handleSaveObject} disabled={executing} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-xs font-black flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50">{executing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} SAVE & DEPLOY</button>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Editor Column */}
                <div className="flex-1 flex flex-col border-r border-slate-200">
                  <div className="flex-1 flex relative">
                    <textarea 
                      value={editorSql} 
                      onChange={(e) => setEditorSql(e.target.value)}
                      className="flex-1 bg-slate-950 text-emerald-400 p-12 font-mono text-base outline-none resize-none spellcheck-false" 
                    />
                    
                    {/* Documentation Column (15%) */}
                    <div className="w-[180px] bg-slate-900/50 border-l border-white/5 flex flex-col p-6 shrink-0">
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Book size={12}/> Documentation</span>
                       <textarea 
                        value={notes} 
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Project notes and logic description..." 
                        className="flex-1 bg-transparent text-slate-400 text-xs font-medium leading-relaxed outline-none resize-none placeholder:text-slate-600" 
                       />
                    </div>
                  </div>

                  {/* Tester Panel (Next to Editor - Bottom/Right area) */}
                  <div className="h-96 border-t border-slate-200 bg-white p-10 flex gap-10 overflow-hidden shrink-0">
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex items-center justify-between"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layout size={14}/> Test Payload (JSON)</span></div>
                      <textarea 
                        value={testParams} 
                        onChange={(e) => setTestParams(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-[2rem] p-6 font-mono text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" 
                      />
                    </div>
                    <div className="w-[450px] flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Terminal size={14}/> Output Manifest</span>
                        <div className="flex items-center gap-2">
                          <button onClick={copyCurl} title="Copy cURL" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Copy size={16}/></button>
                          <button onClick={executeTest} disabled={executing} className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">{executing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run Logic</button>
                        </div>
                      </div>
                      <div className="flex-1 bg-slate-900 rounded-[2rem] p-6 font-mono text-xs text-slate-300 overflow-auto border border-white/5">
                        {testResult ? (
                          <pre>{JSON.stringify(testResult, null, 2)}</pre>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3 opacity-50"><Terminal size={32}/><span className="text-[10px] uppercase font-black tracking-widest">Awaiting execution...</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-20 text-center">
              <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center text-slate-200 mb-8"><Code2 size={64} /></div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Business Logic Workspace</h3>
              <p className="text-slate-400 mt-4 max-w-sm font-medium leading-relaxed">Select an RPC function, trigger or cron job from the registry to begin architecting your project logic.</p>
              <div className="grid grid-cols-1 gap-4 mt-12 w-full max-w-lg">
                 <div className="bg-white border border-slate-200 rounded-3xl p-6 flex items-center gap-6 text-left hover:shadow-xl transition-all group cursor-pointer" onClick={() => handleCreateAsset('new_rpc', 'rpc')}>
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all"><Plus size={24}/></div>
                    <div><h4 className="font-black text-slate-900 text-sm uppercase tracking-tight">Create RPC Function</h4><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Expose SQL as RESTful endpoints</p></div>
                 </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default RPCManager;
