
import React, { useState, useEffect } from 'react';
import { 
  Zap, Globe, Plus, Trash2, Send, Activity, 
  CheckCircle2, AlertCircle, Loader2, ShieldCheck, 
  Settings, ExternalLink, RefreshCcw
} from 'lucide-react';

const EventManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newHook, setNewHook] = useState({ target_url: '', event_type: 'INSERT', table_name: '*' });

  const fetchHooks = async () => {
    // Mock de dados por enquanto
    setWebhooks([
      { id: '1', target_url: 'https://api.myapp.com/webhooks', event_type: 'INSERT', table_name: 'users', is_active: true },
      { id: '2', target_url: 'https://n8n.workflow.io/webhook/123', event_type: '*', table_name: '*', is_active: false }
    ]);
    setLoading(false);
  };

  useEffect(() => { fetchHooks(); }, [projectId]);

  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto w-full space-y-12">
      <header className="flex items-end justify-between gap-8">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Event Pipeline</h2>
          <p className="text-slate-500 mt-2 text-lg">Conecte o Cascata a serviços externos via Webhooks nativos.</p>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
        >
          <Plus size={20} /> Adicionar Webhook
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-6">
          {webhooks.map(hook => (
            <div key={hook.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 hover:shadow-2xl transition-all group">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${hook.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Zap size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 truncate max-w-md">{hook.target_url}</h4>
                    <div className="flex items-center gap-2 mt-1">
                       <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full uppercase">{hook.event_type}</span>
                       <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">Table: {hook.table_name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Settings size={18}/></button>
                   <button className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={18}/></button>
                </div>
              </div>
              <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${hook.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{hook.is_active ? 'Ativo' : 'Pausado'}</span>
                 </div>
                 <button className="text-[10px] font-black text-indigo-600 uppercase flex items-center gap-2 hover:underline">
                    <Send size={12}/> Testar Payload
                 </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-8">
           <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
              <Activity className="absolute -bottom-4 -right-4 text-white/5 w-40 h-40" />
              <h3 className="text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2">
                <ShieldCheck className="text-indigo-400" size={20} /> Segurança de Eventos
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6 font-medium">
                Cada webhook enviado inclui um header <code>X-Cascata-Signature</code>. Use este segredo para validar que a requisição partiu da sua instância oficial.
              </p>
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 font-mono text-[10px] text-indigo-300 break-all">
                whsec_8f93...2d1a
              </div>
           </div>

           <div className="bg-indigo-50 border border-indigo-100 rounded-[2.5rem] p-8">
              <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-4">Dica Pro</h3>
              <p className="text-xs text-indigo-700/70 font-medium leading-relaxed">
                Combine Webhooks com as <b>RPC Logic Engine</b> para criar workflows complexos. Por exemplo, dispare um email de boas-vindas sempre que um usuário for inserido.
              </p>
           </div>
        </aside>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[500] flex items-center justify-center p-8 animate-in zoom-in-95">
           <div className="bg-white rounded-[3.5rem] w-full max-w-xl p-12 shadow-2xl border border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">Novo Webhook</h3>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL de Destino</label>
                    <input 
                      placeholder="https://sua-api.com/hooks" 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none" 
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Evento</label>
                       <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-black text-indigo-600 outline-none">
                          <option>INSERT</option>
                          <option>UPDATE</option>
                          <option>DELETE</option>
                          <option>*</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tabela</label>
                       <input placeholder="users" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none" />
                    </div>
                 </div>
                 <div className="flex gap-4 pt-8">
                    <button onClick={() => setShowAdd(false)} className="flex-1 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Cancelar</button>
                    <button className="flex-[2] bg-indigo-600 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl">Criar Endpoint</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default EventManager;
