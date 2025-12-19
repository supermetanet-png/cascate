
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Folder, File, Upload, HardDrive, Search, Trash2, 
  Download, Image as ImageIcon, FileText, MoreVertical, 
  Plus, Loader2, CheckCircle2, ChevronRight, AlertCircle,
  FolderPlus, ChevronDown, MoreHorizontal, Copy, Edit, 
  ExternalLink, ArrowRight, Filter, SortAsc, SortDesc,
  Grid, List, X, Move, Share2, Settings2, Shield, Eye,
  Check, Square, CheckSquare, Zap, ShieldAlert, Lock,
  Copy as DuplicateIcon, Scissors, Share, ShieldEllipsis, Package,
  UserCheck, Globe, Fingerprint, Sparkles
} from 'lucide-react';

interface StorageItem {
  name: string;
  type: 'file' | 'folder';
  size: number;
  updated_at: string;
  path: string;
}

const SECTOR_DEFINITIONS = [
  { id: 'visual', label: 'Visual Content (Images)', desc: 'Raster and vector static visuals.', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif', 'heic', 'heif'], defaults: ['jpg', 'jpeg', 'png', 'webp', 'svg'] },
  { id: 'motion', label: 'Motion Content (Videos)', desc: 'Dynamic animations and video files.', exts: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', '3gp'], defaults: ['mp4', 'mov', 'webm'] },
  { id: 'audio', label: 'Audio Content', desc: 'Music, voice, podcasts and messages.', exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'm4p', 'amr', 'mid', 'midi', 'opus'], defaults: ['mp3', 'wav', 'ogg', 'm4a'] },
  { id: 'docs', label: 'Document Registry', desc: 'Formal documents and readable data.', exts: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'pages', 'epub', 'mobi', 'azw3'], defaults: ['pdf', 'doc', 'docx', 'txt'] },
  { id: 'structured', label: 'Structured Data & Exchanges', desc: 'Import/Export pipelines and integrations.', exts: ['csv', 'json', 'xml', 'yaml', 'yml', 'sql', 'xls', 'xlsx', 'ods', 'tsv', 'parquet', 'avro'], defaults: ['csv', 'json', 'xlsx'] },
  { id: 'archives', label: 'Archives & Bundles', desc: 'Compressed packages and backups.', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'dmg', 'pkg', 'xz', 'zst'], defaults: ['zip', 'rar', '7z'] },
  { id: 'exec', label: 'Executables & Installers', desc: 'Binary execution packages.', exts: ['exe', 'msi', 'bin', 'app', 'deb', 'rpm', 'sh', 'bat', 'cmd', 'vbs', 'ps1'], defaults: [] },
  { id: 'scripts', label: 'Scripts & Automation', desc: 'Interpreted code and system hooks.', exts: ['js', 'ts', 'py', 'rb', 'php', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'cs', 'swift', 'kt'], defaults: ['js', 'ts', 'py'] },
  { id: 'config', label: 'Configuration & Environment', exts: ['env', 'config', 'ini', 'xml', 'manifest', 'lock', 'gitignore', 'editorconfig', 'toml'], desc: 'Sensitive infrastructure manifests.', defaults: ['env', 'config', 'json', 'yml'] },
  { id: 'telemetry', label: 'Logs, Reports & Telemetry', exts: ['log', 'dump', 'out', 'err', 'crash', 'report', 'audit'], desc: 'System generated data and dumps.', defaults: ['log', 'report'] },
  { id: 'messaging', label: 'Messaging & Artifacts', exts: ['eml', 'msg', 'vcf', 'chat', 'ics', 'pbx'], desc: 'Communication exports and attachments.', defaults: ['eml', 'vcf'] },
  { id: 'ui_assets', label: 'Fonts & UI Assets', exts: ['ttf', 'otf', 'woff', 'woff2', 'eot', 'sketch', 'fig', 'ai', 'psd', 'xd'], desc: 'Typography and design interface assets.', defaults: ['ttf', 'otf', 'woff2'] },
  { id: 'simulation', label: '3D, CAD & Simulation', exts: ['obj', 'stl', 'fbx', 'dwg', 'dxf', 'dae', 'blend', 'step', 'iges', 'glf', 'gltf', 'glb'], desc: 'Heavy engineering and gaming assets.', defaults: ['obj', 'stl', 'glb'] },
  { id: 'backup_sys', label: 'Backup & Snapshots', exts: ['bak', 'sql', 'snapshot', 'dump', 'db', 'sqlite', 'sqlite3', 'rdb'], desc: 'System restoration and state data.', defaults: ['bak', 'sql'] },
  { id: 'global', label: 'Global Binary Limit', exts: [], desc: 'Fallback absolute rule for everything else.', defaults: [] }
];

const StorageExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [buckets, setBuckets] = useState<any[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modals & States
  const [showSettings, setShowSettings] = useState(false);
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<{ active: boolean, item: StorageItem | null }>({ active: false, item: null });
  const [showMoveModal, setShowMoveModal] = useState<{ active: boolean, target: string | null }>({ active: false, target: null });
  const [showPolicyModal, setShowPolicyModal] = useState<{ active: boolean, folder: StorageItem | null }>({ active: false, folder: null });
  
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [governance, setGovernance] = useState<any>({});
  const [projectData, setProjectData] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: StorageItem } | null>(null);

  // Policy Form State (FlutterFlow Style)
  const [activePolicy, setActivePolicy] = useState({
    access_level: 'public', // public, authenticated, restricted
    condition: 'none', // none, id_match
    id_field: 'owner_id'
  });

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bucketsRes, projectsRes] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/storage/buckets`),
        fetchWithAuth('/api/control/projects')
      ]);
      setBuckets(bucketsRes);
      const proj = projectsRes.find((p: any) => p.slug === projectId);
      setProjectData(proj);
      if (proj?.metadata?.storage_governance) setGovernance(proj.metadata.storage_governance);
      if (bucketsRes.length > 0 && !selectedBucket) setSelectedBucket(bucketsRes[0].name);
    } catch (e) { setError("Falha ao carregar infra de storage."); }
    finally { setLoading(false); }
  };

  const fetchItems = async () => {
    if (!selectedBucket) return;
    setLoading(true);
    try {
      const data = await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/list?path=${encodeURIComponent(currentPath)}`);
      setItems(data.items || []);
    } catch (e) { setError("Erro ao listar diretório."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [projectId]);
  useEffect(() => { fetchItems(); }, [selectedBucket, currentPath]);

  const safeCopyToClipboard = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setSuccess("Link copiado com sucesso.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) { setError("Erro ao copiar."); }
  };

  const handleRename = async () => {
    if (!showRenameModal.item || !newName) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ oldPath: showRenameModal.item.path, newName })
      });
      setSuccess("Manifesto renomeado.");
      setShowRenameModal({ active: false, item: null });
      setNewName('');
      fetchItems();
    } catch (e: any) { setError(JSON.parse(e.message).error || "Erro ao renomear."); }
  };

  const handleDuplicate = async (itemPath: string) => {
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ targetPath: itemPath })
      });
      setSuccess("Objeto duplicado.");
      fetchItems();
    } catch (e) { setError("Falha na duplicação."); }
  };

  const handleMove = async (oldPath: string, newPath: string) => {
    try {
      const fileName = oldPath.split('/').pop();
      const finalDest = newPath === '' ? fileName : `${newPath}/${fileName}`;
      await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/object`, {
        method: 'PATCH',
        body: JSON.stringify({ oldPath, newPath: finalDest })
      });
      setSuccess("Objeto realocado.");
      setShowMoveModal({ active: false, target: null });
      fetchItems();
    } catch (e) { setError("Erro ao mover."); }
  };

  const handleSavePolicy = async () => {
    if (!showPolicyModal.folder) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/policies`, {
        method: 'POST',
        body: JSON.stringify({ folderPath: showPolicyModal.folder.path, policy: activePolicy })
      });
      setSuccess("Políticas RLS aplicadas.");
      setShowPolicyModal({ active: false, folder: null });
    } catch (e) { setError("Erro ao salvar segurança."); }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !selectedBucket) return;
    setIsUploading(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('path', currentPath);
        const res = await fetch(`/api/data/${projectId}/storage/${selectedBucket}/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` },
          body: formData
        });
        if (!res.ok) {
           const errData = await res.json();
           throw new Error(errData.error || "Erro de Governança");
        }
      }
      fetchItems();
      setSuccess("Assets sincronizados.");
    } catch (e: any) { setError(e.message); }
    finally { setIsUploading(false); }
  };

  const handleDelete = async (itemPath: string) => {
    if (!confirm(`Deseja excluir permanentemente: ${itemPath}?`)) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/object?path=${encodeURIComponent(itemPath)}`, { method: 'DELETE' });
      fetchItems();
      setSuccess("Objeto removido.");
    } catch (e) { setError("Falha ao deletar."); }
  };

  const getPublicLink = (path: string) => {
    return `${window.location.origin}/api/data/${projectId}/storage/${selectedBucket}/object/${path}?apikey=${projectData?.anon_key || ''}`;
  };

  const getStudioLink = (path: string) => {
     return `${window.location.origin}/api/data/${projectId}/storage/${selectedBucket}/object/${path}?token=${localStorage.getItem('cascata_token')}`;
  };

  const handleContextMenu = (e: React.MouseEvent, item: StorageItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  useEffect(() => {
    const hide = () => setContextMenu(null);
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [items, searchQuery]);

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC] overflow-hidden select-none">
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[2000] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
          <button onClick={() => { setError(null); setSuccess(null); }} className="ml-4 opacity-50"><X size={16} /></button>
        </div>
      )}

      {/* CONTEXT MENU (POPUPS ON RIGHT CLICK) */}
      {contextMenu && (
        <div 
          className="fixed z-[900] bg-white border border-slate-200 shadow-2xl rounded-2xl p-2 w-64 animate-in zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <ContextButton icon={<Edit size={14}/>} label="Rename Entity" onClick={() => { setShowRenameModal({ active: true, item: contextMenu.item }); setNewName(contextMenu.item.name); setContextMenu(null); }} />
          <ContextButton icon={<DuplicateIcon size={14}/>} label="Duplicate" onClick={() => { handleDuplicate(contextMenu.item.path); setContextMenu(null); }} />
          <ContextButton icon={<Download size={14}/>} label="Download (Compress to .zip)" onClick={() => { window.open(`/api/data/${projectId}/storage/${selectedBucket}/zip?path=${contextMenu.item.path}&token=${localStorage.getItem('cascata_token')}`, '_blank'); setContextMenu(null); }} />
          <div className="h-[1px] bg-slate-100 my-1"></div>
          <ContextButton icon={<ShieldEllipsis size={14}/>} label="Policies (Visual Access Layer)" onClick={() => { setShowPolicyModal({ active: true, folder: contextMenu.item }); setContextMenu(null); }} />
          <ContextButton icon={<Scissors size={14}/>} label="Transfer (Move)" onClick={() => { setShowMoveModal({ active: true, target: contextMenu.item.path }); setContextMenu(null); }} />
          <div className="h-[1px] bg-slate-100 my-1"></div>
          <ContextButton icon={<Trash2 size={14}/>} label="Purge Permanently" color="text-rose-600" onClick={() => { handleDelete(contextMenu.item.path); setContextMenu(null); }} />
        </div>
      )}

      <header className="px-10 py-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl"><HardDrive size={28} /></div>
          <div><h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none">Storage Engine</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em] mt-1">Native Cloud Storage</p></div>
        </div>
        <div className="flex items-center gap-4">
           <div className="relative group mr-4">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Registry lookup..." className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-xs font-bold outline-none w-64 transition-all focus:ring-4 focus:ring-indigo-500/10" />
           </div>
           <button onClick={() => setShowSettings(true)} className="p-3 text-slate-400 hover:text-indigo-600 transition-all"><Settings2 size={24}/></button>
           <button onClick={() => setShowNewFolder(true)} disabled={!selectedBucket} className="p-3 text-slate-400 hover:text-indigo-600 transition-all disabled:opacity-30"><FolderPlus size={24} /></button>
           <label className={`cursor-pointer bg-indigo-600 text-white px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 hover:bg-indigo-700 shadow-xl ${!selectedBucket || isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
             {isUploading ? <Loader2 size={18} className="animate-spin" /> : <><Upload size={18} /> Ingest Data</>}
             <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
           </label>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
           <div className="p-6 border-b border-slate-50"><button onClick={() => setShowNewBucket(true)} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 transition-all flex items-center justify-center gap-2"><Plus size={14} /> New Bucket</button></div>
           <div className="flex-1 overflow-y-auto p-4 space-y-1">
             <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-4 mb-4 block">Registry Root</span>
             {buckets.map(b => (
               <button key={b.name} onClick={() => { setSelectedBucket(b.name); setCurrentPath(''); }} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all group ${selectedBucket === b.name && currentPath === '' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-50'}`}>
                 <div className="flex items-center gap-4"><Folder size={20} className={selectedBucket === b.name && currentPath === '' ? 'text-white' : 'text-slate-300'} /><span className="text-sm font-bold tracking-tight">{b.name}</span></div>
               </button>
             ))}
           </div>
        </aside>

        <main className="flex-1 flex flex-col bg-[#FDFDFD] relative overflow-hidden">
          <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-20">
             <div className="flex items-center gap-3 text-slate-400 text-sm font-black">
                <HardDrive size={16} />
                <span className="hover:text-indigo-600 cursor-pointer transition-colors" onClick={() => setCurrentPath('')}>{selectedBucket || 'Root'}</span>
                {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                  <React.Fragment key={i}><ChevronRight size={14} /><span className="hover:text-indigo-600 cursor-pointer transition-colors" onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}>{part}</span></React.Fragment>
                ))}
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-10">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-6"><Loader2 size={64} className="animate-spin text-indigo-600" /><p className="text-xs font-black uppercase tracking-widest">Parsing filesystem...</p></div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-6">
                <div className="w-32 h-32 rounded-[3rem] bg-slate-50 flex items-center justify-center"><Folder size={64} className="opacity-10" /></div>
                <p className="text-sm font-black uppercase tracking-widest text-slate-400">Empty Directory</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-slate-50 border-b border-slate-100"><th className="w-16 px-8 py-6"></th><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Manifest Entity</th><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Modified At</th><th className="px-8 py-6 w-32"></th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredItems.map((item) => (
                      <tr key={item.path} onContextMenu={(e) => handleContextMenu(e, item)} className="group hover:bg-indigo-50/30 transition-colors cursor-pointer" onDoubleClick={() => item.type === 'folder' && setCurrentPath(item.path)}>
                        <td className="px-8 py-5 text-center"><div className="w-4 h-4 border-2 rounded border-slate-200"></div></td>
                        <td className="px-8 py-5"><div className="flex items-center gap-6"><div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.type === 'folder' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>{item.type === 'folder' ? <Folder size={24} /> : <FileText size={24} />}</div><div className="flex flex-col"><span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{item.name}</span><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.type === 'folder' ? 'Directory' : 'Binary Asset'}</span></div></div></td>
                        <td className="px-8 py-5 text-right font-mono text-xs font-bold text-slate-400">{new Date(item.updated_at).toLocaleDateString()}</td>
                        <td className="px-8 py-5 text-right relative">
                           <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {item.type === 'file' ? (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); window.open(getStudioLink(item.path), '_blank'); }} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm"><Eye size={18} /></button>
                                  <button onClick={(e) => { e.stopPropagation(); safeCopyToClipboard(getPublicLink(item.path)); }} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm"><Share size={18} /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDuplicate(item.path); }} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm"><DuplicateIcon size={18} /></button>
                                  <button onClick={(e) => { e.stopPropagation(); setShowMoveModal({ active: true, target: item.path }); }} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm"><Scissors size={18} /></button>
                                </>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, item); }} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm"><MoreHorizontal size={18} /></button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(item.path); }} className="p-3 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm"><Trash2 size={18} /></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* POLICY MODAL (FLUTTERFLOW STYLE) */}
      {showPolicyModal.active && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[1100] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] w-full max-w-4xl overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95">
             <header className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.8rem] flex items-center justify-center shadow-xl"><Shield size={32} /></div>
                  <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter">Access Policies</h3><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Logic Layer for {showPolicyModal.folder?.name}</p></div>
                </div>
                <button onClick={() => setShowPolicyModal({ active: false, folder: null })} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={32} /></button>
             </header>

             <div className="p-12 space-y-12 bg-white">
                <section className="space-y-6">
                   <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><Globe size={14}/> Access Level</h4>
                   <div className="grid grid-cols-3 gap-6">
                      <PolicyCard active={activePolicy.access_level === 'public'} icon={<Globe size={24}/>} label="Public" desc="Anyone with anon key" onClick={() => setActivePolicy({...activePolicy, access_level: 'public'})} />
                      <PolicyCard active={activePolicy.access_level === 'authenticated'} icon={<UserCheck size={24}/>} label="Authenticated" desc="Logged-in users only" onClick={() => setActivePolicy({...activePolicy, access_level: 'authenticated'})} />
                      <PolicyCard active={activePolicy.access_level === 'restricted'} icon={<Lock size={24}/>} label="Restricted" desc="Specific conditions" onClick={() => setActivePolicy({...activePolicy, access_level: 'restricted'})} />
                   </div>
                </section>

                {activePolicy.access_level === 'restricted' && (
                  <section className="space-y-6 animate-in slide-in-from-top-4">
                     <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><Fingerprint size={14}/> Smart Conditions</h4>
                     <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] flex items-center justify-between">
                        <div className="flex items-center gap-6">
                           <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner"><Sparkles size={24}/></div>
                           <div><p className="text-sm font-bold text-slate-900">ID Verification</p><p className="text-xs text-slate-400">Match folder metadata with current session</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                           <span className="text-[10px] font-black text-slate-400">FOLDER FIELD</span>
                           <input value={activePolicy.id_field} onChange={e => setActivePolicy({...activePolicy, id_field: e.target.value})} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" placeholder="owner_id" />
                           <span className="text-slate-400">==</span>
                           <span className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black">AUTH.UID()</span>
                        </div>
                     </div>
                  </section>
                )}
             </div>

             <footer className="p-10 bg-slate-50 border-t border-slate-100 flex gap-6">
                <button onClick={() => setShowPolicyModal({ active: false, folder: null })} className="flex-1 py-6 text-slate-400 font-black uppercase text-xs">Discard</button>
                <button onClick={handleSavePolicy} className="flex-[3] py-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase shadow-2xl hover:bg-indigo-600 transition-all">Synchronize Security Layer</button>
             </footer>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {showRenameModal.active && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[1200] flex items-center justify-center p-8 animate-in zoom-in-95">
           <div className="bg-white rounded-[3.5rem] w-full max-w-lg p-12 shadow-2xl border border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8 flex items-center gap-4"><Edit className="text-indigo-600" /> Rename Manifest</h3>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-8 text-lg font-black outline-none mb-8" />
              <div className="flex gap-4">
                <button onClick={() => setShowRenameModal({ active: false, item: null })} className="flex-1 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Abort</button>
                <button onClick={handleRename} className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl">Apply Identity</button>
              </div>
           </div>
        </div>
      )}

      {/* MOVE MODAL */}
      {showMoveModal.active && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[1100] flex items-center justify-center p-8 animate-in zoom-in-95">
           <div className="bg-white rounded-[3.5rem] w-full max-w-xl p-12 shadow-2xl border border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8 flex items-center gap-4"><Move className="text-indigo-600" /> Relocate Object</h3>
              <p className="text-sm font-medium text-slate-400 mb-8 uppercase tracking-widest px-2">Select Destination Path</p>
              <div className="max-h-60 overflow-y-auto space-y-2 mb-8 bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner">
                 <button onClick={() => handleMove(showMoveModal.target!, '')} className="w-full p-4 rounded-2xl hover:bg-white text-left font-bold text-slate-600 flex items-center gap-3 border border-transparent hover:border-indigo-100 transition-all"><HardDrive size={18} className="text-slate-300"/> Root Registry</button>
                 {items.filter(i => i.type === 'folder' && i.path !== showMoveModal.target).map(folder => (
                   <button key={folder.path} onClick={() => handleMove(showMoveModal.target!, folder.path)} className="w-full p-4 rounded-2xl hover:bg-white text-left font-bold text-slate-600 flex items-center gap-3 border border-transparent hover:border-indigo-100 transition-all"><Folder size={18} className="text-indigo-400"/> {folder.name}</button>
                 ))}
              </div>
              <button onClick={() => setShowMoveModal({ active: false, target: null })} className="w-full py-5 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-900">Abort Relocation</button>
           </div>
        </div>
      )}

      {/* NEW BUCKET/FOLDER MODALS */}
      {(showNewBucket || showNewFolder) && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[1100] flex items-center justify-center p-8 animate-in zoom-in-95">
           <div className="bg-white rounded-[3.5rem] w-full max-w-lg p-12 shadow-2xl border border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">{showNewBucket ? 'New Storage Instance' : 'New Directory'}</h3>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/gi, '_'))} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-8 text-lg font-black outline-none mb-8" placeholder="entity_name" />
              <div className="flex gap-4">
                <button onClick={() => { setShowNewBucket(false); setShowNewFolder(false); setNewName(''); }} className="flex-1 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Abort</button>
                <button onClick={async () => {
                  try {
                    if (showNewBucket) await fetchWithAuth(`/api/data/${projectId}/storage/buckets`, { method: 'POST', body: JSON.stringify({ name: newName }) });
                    else await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/folder`, { method: 'POST', body: JSON.stringify({ name: newName, path: currentPath }) });
                    setNewName(''); setShowNewBucket(false); setShowNewFolder(false); fetchData(); fetchItems();
                    setSuccess("Entidade criada.");
                  } catch (e) { setError("Erro ao criar."); }
                }} className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl">Confirm Allocation</button>
              </div>
           </div>
        </div>
      )}

      {/* GOVERNANCE SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
            <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.8rem] flex items-center justify-center shadow-xl"><Shield size={32} /></div>
                <div><h3 className="text-4xl font-black text-slate-900 tracking-tighter">Governance Engine</h3><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Policy Administration</p></div>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={32} /></button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-12 space-y-4">
              {SECTOR_DEFINITIONS.map(sector => (
                <div key={sector.id} className="bg-slate-50 border border-slate-100 rounded-[2.5rem] overflow-hidden transition-all group">
                   <button onClick={() => setExpandedSector(expandedSector === sector.id ? null : sector.id)} className="w-full p-8 flex items-center justify-between text-left hover:bg-white transition-colors">
                     <div className="flex items-center gap-6">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${expandedSector === sector.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Zap size={24} /></div>
                       <div><h4 className="text-xl font-black text-slate-900 tracking-tight">{sector.label}</h4><p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">{sector.desc}</p></div>
                     </div>
                     <div className="flex items-center gap-8">
                        <div onClick={e => e.stopPropagation()} className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                           <input 
                            value={(governance[sector.id]?.max_size || '10').replace(/GB|MB|TB|KB/i, '')}
                            onChange={(e) => {
                               const unit = (governance[sector.id]?.max_size || 'MB').match(/GB|MB|TB|KB/i)?.[0] || 'MB';
                               setGovernance({ ...governance, [sector.id]: { ...governance[sector.id], max_size: e.target.value + unit } });
                            }}
                            className="bg-transparent border-none px-4 py-2 text-xs font-mono font-black text-indigo-600 w-16 text-center outline-none"
                           />
                           <select 
                            value={(governance[sector.id]?.max_size || 'MB').match(/GB|MB|TB|KB/i)?.[0] || 'MB'}
                            onChange={(e) => {
                               const val = (governance[sector.id]?.max_size || '10').replace(/GB|MB|TB|KB/i, '');
                               setGovernance({ ...governance, [sector.id]: { ...governance[sector.id], max_size: val + e.target.value } });
                            }}
                            className="bg-slate-50 border-none rounded-xl px-2 py-2 text-[10px] font-black text-slate-500 outline-none"
                           >
                             <option value="KB">KB</option><option value="MB">MB</option><option value="GB">GB</option><option value="TB">TB</option>
                           </select>
                        </div>
                        <ChevronDown size={20} className={`text-slate-300 transition-transform ${expandedSector === sector.id ? 'rotate-180' : ''}`} />
                     </div>
                   </button>
                   {expandedSector === sector.id && sector.id !== 'global' && (
                     <div className="p-8 pt-0 border-t border-slate-100 bg-white/50 animate-in slide-in-from-top-2">
                        <div className="flex items-center justify-between mb-6">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Whitelisted Terminations</span>
                           <div className="flex gap-4">
                              <button onClick={() => setGovernance({ ...governance, [sector.id]: { ...governance[sector.id], allowed_exts: sector.exts } })} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">Select All</button>
                              <button onClick={() => setGovernance({ ...governance, [sector.id]: { ...governance[sector.id], allowed_exts: [] } })} className="text-[10px] font-black text-rose-600 uppercase hover:underline">Clear All</button>
                           </div>
                        </div>
                        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                           {sector.exts.map(ext => (
                             <button key={ext} onClick={() => {
                               const current = governance[sector.id]?.allowed_exts || [];
                               const next = current.includes(ext) ? current.filter((e: string) => e !== ext) : [...current, ext];
                               setGovernance({ ...governance, [sector.id]: { ...governance[sector.id], allowed_exts: next } });
                             }} className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${governance[sector.id]?.allowed_exts?.includes(ext) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                               {governance[sector.id]?.allowed_exts?.includes(ext) ? <CheckSquare size={12} /> : <Square size={12} />}
                               <span className="text-[10px] font-black uppercase">.{ext}</span>
                             </button>
                           ))}
                        </div>
                     </div>
                   )}
                </div>
              ))}
            </div>
            <footer className="p-10 bg-slate-50 border-t border-slate-100 flex gap-6 shrink-0">
               <button onClick={() => setShowSettings(false)} className="flex-1 py-6 text-slate-400 font-black uppercase text-xs">Discard</button>
               <button onClick={async () => {
                 await fetchWithAuth(`/api/control/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ metadata: { storage_governance: governance } }) });
                 setShowSettings(false);
                 setSuccess("Políticas de governança atualizadas.");
               }} className="flex-[3] py-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase shadow-2xl">Commit Security Policy</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

const PolicyCard = ({ active, icon, label, desc, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`p-8 rounded-[2.5rem] border-2 transition-all flex flex-col items-center text-center gap-4 ${active ? 'bg-indigo-600 border-indigo-700 text-white shadow-2xl shadow-indigo-200' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
  >
    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${active ? 'bg-white/20' : 'bg-slate-50'}`}>{icon}</div>
    <div><h5 className="font-black text-sm uppercase tracking-tight">{label}</h5><p className={`text-[10px] mt-1 font-medium ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{desc}</p></div>
  </button>
);

const ContextButton = ({ icon, label, onClick, color = "text-slate-600" }: any) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold ${color} hover:bg-slate-50 rounded-xl transition-all text-left group`}>
    <span className="opacity-40 group-hover:opacity-100 transition-opacity">{icon}</span> {label}
  </button>
);

export default StorageExplorer;
