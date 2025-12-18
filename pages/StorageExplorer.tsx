
import React, { useState, useEffect } from 'react';
import { 
  Folder, File, Upload, HardDrive, Search, Trash2, 
  Download, Image as ImageIcon, FileText, MoreVertical, 
  Plus, Loader2, CheckCircle2, ChevronRight 
} from 'lucide-react';

const StorageExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [buckets, setBuckets] = useState<any[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Simulação de fetch de buckets
    setBuckets([{ name: 'avatars', public: true }, { name: 'documents', public: false }]);
    setLoading(false);
  }, [projectId]);

  const handleUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      // Mock de novo arquivo
      setFiles([{ name: 'profile_01.png', size: '1.2MB', type: 'image/png', updated: 'Just now' }, ...files]);
    }, 1500);
  };

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      <header className="px-10 py-8 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100">
            <HardDrive size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Cascata Storage</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Infraestrutura Nativa de Objetos</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <button className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all">
             <Plus size={18} /> Novo Bucket
           </button>
           <button 
             onClick={handleUpload}
             className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
           >
             {isUploading ? <Loader2 size={18} className="animate-spin" /> : <><Upload size={18} /> Enviar Arquivo</>}
           </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Buckets Sidebar */}
        <aside className="w-72 border-r border-slate-200 bg-white p-6 space-y-2">
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-4 block">Buckets</span>
           {buckets.map(b => (
             <button 
               key={b.name}
               onClick={() => setSelectedBucket(b.name)}
               className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${selectedBucket === b.name ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
             >
               <div className="flex items-center gap-3">
                 <Folder size={18} className={selectedBucket === b.name ? 'text-white' : 'text-slate-400'} />
                 <span className="text-sm font-bold">{b.name}</span>
               </div>
               {b.public && <span className="text-[8px] bg-white/20 px-2 py-0.5 rounded-full font-black uppercase">Public</span>}
             </button>
           ))}
        </aside>

        {/* Files Grid */}
        <main className="flex-1 p-10 overflow-y-auto">
          {selectedBucket ? (
            <div className="space-y-8">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3 text-slate-400 text-sm font-bold">
                   <span>Buckets</span>
                   <ChevronRight size={14} />
                   <span className="text-slate-900">{selectedBucket}</span>
                 </div>
                 <div className="relative">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input placeholder="Procurar arquivos..." className="pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 w-64" />
                 </div>
               </div>

               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                 {files.length === 0 ? (
                   <div className="col-span-full py-40 flex flex-col items-center justify-center text-slate-300">
                     <ImageIcon size={80} className="mb-6 opacity-10" />
                     <p className="text-sm font-black uppercase tracking-widest">Nenhum arquivo encontrado</p>
                   </div>
                 ) : (
                   files.map((f, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-[2.5rem] p-6 group hover:shadow-2xl hover:border-indigo-200 transition-all cursor-pointer relative">
                        <div className="aspect-square bg-slate-50 rounded-[2rem] flex items-center justify-center mb-4 group-hover:bg-indigo-50 transition-colors">
                            {f.type.includes('image') ? <ImageIcon className="text-indigo-400" size={40} /> : <FileText className="text-slate-400" size={40} />}
                        </div>
                        <h4 className="text-xs font-black text-slate-900 truncate pr-8">{f.name}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{f.size} • {f.updated}</p>
                        <button className="absolute bottom-6 right-6 p-2 text-slate-300 hover:text-rose-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                    </div>
                   ))
                 )}
               </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
               <HardDrive size={120} className="mb-8 opacity-5" />
               <h3 className="text-3xl font-black text-slate-300 tracking-tighter uppercase tracking-widest">Selecione um Bucket</h3>
               <p className="text-slate-400 mt-2 font-bold uppercase tracking-widest text-[10px]">Arquivos isolados por schema físico.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default StorageExplorer;
