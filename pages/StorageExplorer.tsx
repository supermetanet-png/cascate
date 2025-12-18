
import React, { useState, useEffect } from 'react';
import { 
  Folder, File, Upload, HardDrive, Search, Trash2, 
  Download, Image as ImageIcon, FileText, MoreVertical, 
  Plus, Loader2, CheckCircle2, ChevronRight, AlertCircle 
} from 'lucide-react';

const StorageExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [buckets, setBuckets] = useState<any[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBuckets = async () => {
    try {
      const res = await fetch(`/api/data/${projectId}/storage/buckets`, {
        headers: { 'apikey': localStorage.getItem(`cascata_key_${projectId}`) || '' }
      });
      const data = await res.json();
      setBuckets(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Falha ao carregar infra de storage.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async (bucketName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data/${projectId}/storage/${bucketName}/list`, {
        headers: { 'apikey': localStorage.getItem(`cascata_key_${projectId}`) || '' }
      });
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      setError("Erro ao listar objetos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuckets();
  }, [projectId]);

  useEffect(() => {
    if (selectedBucket) fetchFiles(selectedBucket);
  }, [selectedBucket]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedBucket) return;
    setIsUploading(true);
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/data/${projectId}/storage/${selectedBucket}/upload`, {
        method: 'POST',
        headers: { 'apikey': localStorage.getItem(`cascata_key_${projectId}`) || '' },
        body: formData
      });
      if (res.ok) {
        fetchFiles(selectedBucket);
      }
    } catch (e) {
      setError("Upload falhou.");
    } finally {
      setIsUploading(false);
    }
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
           <label className={`cursor-pointer bg-indigo-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 ${!selectedBucket || isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
             {isUploading ? <Loader2 size={18} className="animate-spin" /> : <><Upload size={18} /> Enviar Arquivo</>}
             <input type="file" className="hidden" onChange={handleUpload} disabled={!selectedBucket || isUploading} />
           </label>
        </div>
      </header>

      {error && (
        <div className="mx-10 mt-6 p-4 bg-rose-50 text-rose-600 rounded-2xl flex items-center gap-3 text-xs font-bold border border-rose-100 animate-pulse">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r border-slate-200 bg-white p-6 space-y-2">
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-4 block">Buckets</span>
           {buckets.length === 0 && !loading && <p className="px-4 text-[10px] text-slate-300 font-bold uppercase">Nenhum bucket criado</p>}
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
             </button>
           ))}
        </aside>

        <main className="flex-1 p-10 overflow-y-auto">
          {selectedBucket ? (
            <div className="space-y-8">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3 text-slate-400 text-sm font-bold">
                   <span>Buckets</span>
                   <ChevronRight size={14} />
                   <span className="text-slate-900">{selectedBucket}</span>
                 </div>
               </div>

               {loading ? (
                 <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                    <Loader2 size={40} className="animate-spin mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Escaneando volume...</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {files.length === 0 ? (
                    <div className="col-span-full py-40 flex flex-col items-center justify-center text-slate-300">
                      <ImageIcon size={80} className="mb-6 opacity-10" />
                      <p className="text-sm font-black uppercase tracking-widest">Vazio</p>
                    </div>
                  ) : (
                    files.map((f, i) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-[2.5rem] p-6 group hover:shadow-2xl hover:border-indigo-200 transition-all cursor-pointer relative">
                          <div className="aspect-square bg-slate-50 rounded-[2rem] flex items-center justify-center mb-4 group-hover:bg-indigo-50 transition-colors">
                              {f.name.match(/\.(jpg|jpeg|png|gif)$/i) ? <ImageIcon className="text-indigo-400" size={40} /> : <FileText className="text-slate-400" size={40} />}
                          </div>
                          <h4 className="text-xs font-black text-slate-900 truncate pr-8">{f.name}</h4>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Objeto Nativo</p>
                      </div>
                    ))
                  )}
                 </div>
               )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
               <HardDrive size={120} className="mb-8 opacity-5" />
               <h3 className="text-3xl font-black text-slate-300 tracking-tighter uppercase tracking-widest">Selecione um Bucket</h3>
               <p className="text-slate-400 mt-2 font-bold uppercase tracking-widest text-[10px]">Persistência Soberana de Objetos.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default StorageExplorer;
