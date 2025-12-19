
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Folder, File, Upload, HardDrive, Search, Trash2, 
  Download, Image as ImageIcon, FileText, MoreVertical, 
  Plus, Loader2, CheckCircle2, ChevronRight, AlertCircle,
  FolderPlus, ChevronDown, MoreHorizontal, Copy, Edit, 
  ExternalLink, ArrowRight, Filter, SortAsc, SortDesc,
  Grid, List, X, Move, Share2, Eye
} from 'lucide-react';

interface StorageItem {
  name: string;
  type: 'file' | 'folder';
  size: number;
  updated_at: string;
  path: string;
}

const StorageExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [buckets, setBuckets] = useState<any[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // View States
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  
  // Modals
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newName, setNewName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [renamingItem, setRenamingItem] = useState<StorageItem | null>(null);

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const res = await fetch(url, {
      ...options,
      headers: { 
        ...options.headers, 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json' 
      }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, []);

  const fetchBuckets = async () => {
    try {
      const data = await fetchWithAuth(`/api/data/${projectId}/storage/buckets`);
      setBuckets(data);
      if (data.length > 0 && !selectedBucket) setSelectedBucket(data[0].name);
    } catch (e) { setError("Falha ao carregar infra de storage."); }
    finally { setLoading(false); }
  };

  const fetchItems = async () => {
    if (!selectedBucket) return;
    setLoading(true);
    try {
      const data = await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/list?path=${encodeURIComponent(currentPath)}`);
      setItems(data.items || []);
    } catch (e) { setError("Erro ao listar objetos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBuckets(); }, [projectId]);
  useEffect(() => { fetchItems(); }, [selectedBucket, currentPath]);

  const handleCreateBucket = async () => {
    if (!newName) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/buckets`, {
        method: 'POST',
        body: JSON.stringify({ name: newName })
      });
      setNewName('');
      setShowNewBucket(false);
      fetchBuckets();
      setSuccess("Bucket provisionado.");
    } catch (e) { setError("Erro ao criar bucket."); }
  };

  const handleCreateFolder = async () => {
    if (!newName || !selectedBucket) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/folder`, {
        method: 'POST',
        body: JSON.stringify({ name: newName, path: currentPath })
      });
      setNewName('');
      setShowNewFolder(false);
      fetchItems();
      setSuccess("Pasta criada.");
    } catch (e) { setError("Erro ao criar pasta."); }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !selectedBucket) return;
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('path', currentPath);
        
        await fetch(`/api/data/${projectId}/storage/${selectedBucket}/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('cascata_token')}` },
          body: formData
        });
      }
      fetchItems();
      setSuccess("Upload concluído.");
    } catch (e) { setError("Falha no upload."); }
    finally { setIsUploading(false); }
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Confirmar exclusão definitiva de ${path}?`)) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/object?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      });
      fetchItems();
      setSuccess("Removido.");
    } catch (e) { setError("Erro ao deletar."); }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Deletar ${selectedItems.size} itens permanentemente?`)) return;
    setLoading(true);
    try {
      for (const path of selectedItems) {
        await fetchWithAuth(`/api/data/${projectId}/storage/${selectedBucket}/object?path=${encodeURIComponent(path)}`, {
          method: 'DELETE'
        });
      }
      setSelectedItems(new Set());
      fetchItems();
      setSuccess("Itens removidos.");
    } catch (e) { setError("Erro na deleção em massa."); }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const sortedAndFilteredItems = useMemo(() => {
    let result = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (filterType !== 'all') {
      result = result.filter(i => {
        if (i.type === 'folder') return false;
        const ext = i.name.split('.').pop()?.toLowerCase();
        if (filterType === 'images') return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '');
        if (filterType === 'videos') return ['mp4', 'mov', 'avi'].includes(ext || '');
        if (filterType === 'docs') return ['pdf', 'doc', 'docx', 'txt', 'csv'].includes(ext || '');
        return true;
      });
    }

    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (sortBy === 'newest') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortBy === 'oldest') return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      if (sortBy === 'heaviest') return b.size - a.size;
      if (sortBy === 'lightest') return a.size - b.size;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [items, searchQuery, filterType, sortBy]);

  const toggleSelect = (path: string) => {
    const next = new Set(selectedItems);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedItems(next);
  };

  const getPublicLink = (path: string) => {
    return `${window.location.origin}/api/data/${projectId}/storage/${selectedBucket}/object/${path}`;
  };

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC] overflow-hidden">
      {/* Dynamic Notifications */}
      {(error || success) && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[600] p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 ${error ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-black tracking-tight">{error || success}</span>
          <button onClick={() => { setError(null); setSuccess(null); }} className="ml-4 opacity-50"><X size={16} /></button>
        </div>
      )}

      <header className="px-10 py-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl">
            <HardDrive size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none">Storage Engine</h2>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em] mt-1">Sovereign Object Infrastructure</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="relative group mr-4">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Local search..." 
              className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 w-64 transition-all"
             />
           </div>
           
           <button onClick={() => setShowNewFolder(true)} disabled={!selectedBucket} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all"><FolderPlus size={24} /></button>
           
           <label className={`cursor-pointer bg-indigo-600 text-white px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 ${!selectedBucket || isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
             {isUploading ? <Loader2 size={18} className="animate-spin" /> : <><Upload size={18} /> Ingest Data</>}
             <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={!selectedBucket || isUploading} />
           </label>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR: TREE VIEW */}
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
           <div className="p-6 border-b border-slate-50">
              <button onClick={() => setShowNewBucket(true)} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                <Plus size={14} /> New Instance (Bucket)
              </button>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-1">
             <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-4 mb-4 block">Registry Root</span>
             {buckets.map(b => (
               <div key={b.name} className="space-y-1">
                 <button 
                   onClick={() => { setSelectedBucket(b.name); setCurrentPath(''); }}
                   className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all group ${selectedBucket === b.name && currentPath === '' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-50'}`}
                 >
                   <div className="flex items-center gap-4">
                     <Folder size={20} className={selectedBucket === b.name && currentPath === '' ? 'text-white' : 'text-slate-300'} />
                     <span className="text-sm font-bold tracking-tight">{b.name}</span>
                   </div>
                   <MoreHorizontal size={14} className="opacity-0 group-hover:opacity-50" />
                 </button>
               </div>
             ))}
           </div>
        </aside>

        {/* MAIN: FILE LIST & BREADCRUMBS */}
        <main 
          className={`flex-1 flex flex-col bg-[#FDFDFD] relative transition-all ${isDragging ? 'bg-indigo-50/50 ring-4 ring-indigo-500 ring-inset' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}
        >
          {/* Breadcrumbs & Controls */}
          <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-20">
             <div className="flex items-center gap-3 text-slate-400 text-sm font-black">
                <HardDrive size={16} />
                <span className="hover:text-indigo-600 cursor-pointer transition-colors" onClick={() => setCurrentPath('')}>{selectedBucket || 'Root'}</span>
                {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                  <React.Fragment key={i}>
                    <ChevronRight size={14} />
                    <span 
                      className="hover:text-indigo-600 cursor-pointer transition-colors" 
                      onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
                    >
                      {part}
                    </span>
                  </React.Fragment>
                ))}
             </div>

             <div className="flex items-center gap-6">
                <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100">
                   <select 
                    value={filterType} 
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest px-4 py-2 outline-none text-slate-500"
                   >
                     <option value="all">All Formats</option>
                     <option value="images">Visuals</option>
                     <option value="videos">Motion</option>
                     <option value="docs">Documented</option>
                   </select>
                   <div className="w-[1px] h-4 bg-slate-200 mx-2"></div>
                   <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest px-4 py-2 outline-none text-slate-500"
                   >
                     <option value="newest">Recent First</option>
                     <option value="oldest">Historical</option>
                     <option value="heaviest">Bulk Size</option>
                     <option value="lightest">Minimal</option>
                   </select>
                </div>
                
                {selectedItems.size > 0 && (
                  <div className="flex items-center gap-2 animate-in slide-in-from-right-4">
                    <button onClick={handleBulkDelete} className="px-6 py-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center gap-2"><Trash2 size={14}/> Delete {selectedItems.size}</button>
                  </div>
                )}
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-10">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-6">
                 <Loader2 size={64} className="animate-spin text-indigo-600" />
                 <p className="text-xs font-black uppercase tracking-widest">Compiling Filesystem...</p>
              </div>
            ) : sortedAndFilteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-6">
                 <div className="w-32 h-32 rounded-[3rem] bg-slate-50 flex items-center justify-center"><Folder size={64} className="opacity-10" /></div>
                 <p className="text-sm font-black uppercase tracking-widest text-slate-400">Directory is currently empty</p>
                 <button onClick={() => document.querySelector('input[type="file"]')?.dispatchEvent(new MouseEvent('click'))} className="mt-4 text-xs font-black text-indigo-600 hover:underline">UPLOAD FIRST ASSET</button>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="w-16 px-8 py-6 text-center">
                         <button onClick={() => selectedItems.size === sortedAndFilteredItems.length ? setSelectedItems(new Set()) : setSelectedItems(new Set(sortedAndFilteredItems.map(i => i.path)))} className="text-slate-300 hover:text-indigo-600">
                           {selectedItems.size === sortedAndFilteredItems.length && sortedAndFilteredItems.length > 0 ? <CheckCircle2 size={18} /> : <div className="w-4 h-4 border-2 border-slate-200 rounded" />}
                         </button>
                      </th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Manifest Entity</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Volume</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Modified At</th>
                      <th className="px-8 py-6 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedAndFilteredItems.map((item) => (
                      <tr 
                        key={item.path}
                        className={`group hover:bg-indigo-50/30 transition-colors cursor-pointer ${selectedItems.has(item.path) ? 'bg-indigo-50' : ''}`}
                        onClick={() => toggleSelect(item.path)}
                        onDoubleClick={() => item.type === 'folder' && setCurrentPath(item.path)}
                      >
                        <td className="px-8 py-5 text-center">
                           <div className={`w-4 h-4 border-2 rounded transition-all ${selectedItems.has(item.path) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                             {selectedItems.has(item.path) && <CheckCircle2 size={12} className="text-white mx-auto" />}
                           </div>
                        </td>
                        <td className="px-8 py-5">
                           <div className="flex items-center gap-6">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${item.type === 'folder' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                                 {item.type === 'folder' ? <Folder size={24} /> : item.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? <ImageIcon size={24} /> : <FileText size={24} />}
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{item.name}</span>
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.type === 'folder' ? 'Sub-Directory' : item.name.split('.').pop()?.toUpperCase() + ' Binary'}</span>
                              </div>
                           </div>
                        </td>
                        <td className="px-8 py-5 font-mono text-xs font-bold text-slate-500">
                           {item.type === 'file' ? formatSize(item.size) : '--'}
                        </td>
                        <td className="px-8 py-5 text-right font-mono text-xs font-bold text-slate-400">
                           {new Date(item.updated_at).toLocaleDateString()} {new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-8 py-5 text-right relative">
                           <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {item.type === 'file' && (
                                <button onClick={(e) => { e.stopPropagation(); window.open(getPublicLink(item.path), '_blank'); }} title="Visualizar (Nova Aba)" className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm">
                                   <Eye size={18} />
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(getPublicLink(item.path)); setSuccess("Link copiado."); }} title="Copy URL" className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm">
                                 <Share2 size={18} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(item.path); }} title="Delete" className="p-3 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl transition-all shadow-sm">
                                 <Trash2 size={18} />
                              </button>
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

      {/* MODALS */}
      {(showNewBucket || showNewFolder) && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white rounded-[3.5rem] w-full max-w-lg p-12 shadow-2xl border border-slate-100 animate-in zoom-in-95">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">{showNewBucket ? 'New Bucket' : 'New Folder'}</h3>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Entity Identity</label>
                    <input 
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/gi, '_'))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-8 text-lg font-black text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10" 
                      placeholder="e.g. assets_production"
                    />
                 </div>
                 <div className="flex gap-4 pt-4">
                    <button onClick={() => { setShowNewBucket(false); setShowNewFolder(false); setNewName(''); }} className="flex-1 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Abort</button>
                    <button 
                      onClick={showNewBucket ? handleCreateBucket : handleCreateFolder}
                      className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
                    >
                      Initialize Identity
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StorageExplorer;
