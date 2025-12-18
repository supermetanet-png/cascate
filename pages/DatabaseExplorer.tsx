import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Search, Play, Table as TableIcon, Loader2, AlertCircle, Plus, X, Terminal, Code, Trash2, Download, Upload, MoreHorizontal, Copy, Edit, CheckSquare, Square, CheckCircle2, Calendar, Wand2 } from 'lucide-react';

// Fallback UUID generator for non-secure contexts (HTTP via IP)
const getUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const DatabaseExplorer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'query'>('tables');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('SELECT * FROM public.users LIMIT 10;');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Modals
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRowModal, setShowRowModal] = useState(false);
  const [isEditingRow, setIsEditingRow] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grid State
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [selectedRows, setSelectedRows] = useState<Set<any>>(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef<{ col: string, startX: number, startWidth: number } | null>(null);
  const draggingRef = useRef<{ col: string } | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, table: string } | null>(null);
  const [renameState, setRenameState] = useState<{ active: boolean, oldName: string, newName: string }>({ active: false, oldName: '', newName: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ active: boolean, table: string, confirmInput: string, rowCount: number, mode: 'table' | 'rows' }>({ active: false, table: '', confirmInput: '', rowCount: 0, mode: 'table' });

  // Creation/Import State
  const [newTableName, setNewTableName] = useState('');
  const [newTableColumns, setNewTableColumns] = useState<any[]>([
    { name: 'id', type: 'uuid', primaryKey: true, nullable: false, default: 'gen_random_uuid()' },
    { name: 'created_at', type: 'timestamptz', primaryKey: false, nullable: false, default: 'now()' }
  ]);
  const [currentRowData, setCurrentRowData] = useState<any>({});
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fetchWithAuth = useCallback(async (url: string, options: any = {}) => {
    const token = localStorage.getItem('cascata_token');
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (response.status === 401) { localStorage.removeItem('cascata_token'); window.location.hash = '#/login'; throw new Error('Session expired'); }
    if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `Error ${response.status}`); }
    return response.json();
  }, []);

  const fetchTables = async () => {
    try {
      const data = await fetchWithAuth(`/api/data/${projectId}/tables`);
      setTables(data);
      if (data.length > 0 && !selectedTable) setSelectedTable(data[0].name);
    } catch (err: any) { setError(err.message); }
  };

  const fetchTableDetails = async (tableName: string) => {
    setLoading(true);
    setError(null);
    setSelectedRows(new Set());
    try {
      const [data, rawCols, uiSettings] = await Promise.all([
        fetchWithAuth(`/api/data/${projectId}/tables/${tableName}/data`),
        fetchWithAuth(`/api/data/${projectId}/tables/${tableName}/columns`),
        fetchWithAuth(`/api/data/${projectId}/ui-settings/${tableName}`)
      ]);
      setTableData(data);
      setColumns(rawCols);
      const allColNames = rawCols.map((c: any) => c.name);
      const savedOrder = uiSettings.columnOrder || [];
      const finalOrder = savedOrder.length > 0 
        ? [...savedOrder.filter((c: string) => allColNames.includes(c)), ...allColNames.filter((c: string) => !savedOrder.includes(c))]
        : allColNames;
      setColOrder(finalOrder);
      setColWidths(uiSettings.columnWidths || {});
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const saveUISettings = async (newOrder: string[], newWidths: Record<string, number>) => {
    if (!selectedTable) return;
    try {
      await fetchWithAuth(`/api/data/${projectId}/ui-settings/${selectedTable}`, {
        method: 'POST',
        body: JSON.stringify({ settings: { columnOrder: newOrder, columnWidths: newWidths } })
      });
    } catch (e) { console.error("UI persistence failure"); }
  };

  const copyToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try { document.execCommand('copy'); } catch (err) { console.error('Fallback copy failed', err); }
    textArea.remove();
    setSuccessMsg('Copied to clipboard!');
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  // Grid Actions
  const handleResizeStart = (e: React.MouseEvent, colName: string) => {
    e.stopPropagation(); e.preventDefault();
    setIsResizing(true);
    resizingRef.current = { col: colName, startX: e.clientX, startWidth: colWidths[colName] || 200 };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { col, startX, startWidth } = resizingRef.current;
    const newWidth = Math.max(80, startWidth + (e.clientX - startX));
    setColWidths(prev => ({ ...prev, [col]: newWidth }));
  };

  const handleResizeEnd = () => {
    if (resizingRef.current) saveUISettings(colOrder, colWidths);
    resizingRef.current = null;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleDragStart = (e: React.DragEvent, colName: string) => {
    if (isResizing) { e.preventDefault(); return; }
    draggingRef.current = { col: colName };
  };

  const handleDragOver = (e: React.DragEvent, targetCol: string) => {
    e.preventDefault();
    if (!draggingRef.current || draggingRef.current.col === targetCol) return;
    const newOrder = [...colOrder];
    const dragIdx = newOrder.indexOf(draggingRef.current.col);
    const targetIdx = newOrder.indexOf(targetCol);
    newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, draggingRef.current.col);
    setColOrder(newOrder);
  };

  const handleDragEnd = () => { if (draggingRef.current) saveUISettings(colOrder, colWidths); draggingRef.current = null; };

  const pkCol = columns.find(c => c.isPrimaryKey)?.name || columns[0]?.name;
  const toggleRow = (val: any) => {
    const next = new Set(selectedRows);
    if (next.has(val)) next.delete(val); else next.add(val);
    setSelectedRows(next);
  };
  const toggleAll = () => {
    if (selectedRows.size === tableData.length && tableData.length > 0) setSelectedRows(new Set());
    else setSelectedRows(new Set(tableData.map(r => r[pkCol])));
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size > 5 && deleteConfirm.mode !== 'rows') {
      setDeleteConfirm({ active: true, table: selectedTable!, confirmInput: '', rowCount: selectedRows.size, mode: 'rows' });
      return;
    }
    setExecuting(true);
    try {
      await fetchWithAuth(`/api/data/${projectId}/tables/${selectedTable}/delete-rows`, {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedRows), pkColumn: pkCol })
      });
      setDeleteConfirm({ active: false, table: '', confirmInput: '', rowCount: 0, mode: 'table' });
      setSelectedRows(new Set());
      fetchTableDetails(selectedTable!);
    } catch (err: any) { setError(err.message); }
    finally { setExecuting(false); }
  };

  const handleRowAction = async () => {
    setExecuting(true);
    try {
      const url = `/api/data/${projectId}/tables/${selectedTable}/rows`;
      const method = isEditingRow ? 'PUT' : 'POST';
      const body = isEditingRow ? { 
        data: currentRowData, 
        pkColumn: pkCol, 
        pkValue: currentRowData[pkCol] 
      } : { data: currentRowData };

      await fetchWithAuth(url, {
        method,
        body: JSON.stringify(body)
      });
      
      setShowRowModal(false);
      setCurrentRowData({});
      fetchTableDetails(selectedTable!);
    } catch (err: any) { setError(err.message); }
    finally { setExecuting(false); }
  };

  const handleFileUpload = async (file: File) => {
    setExecuting(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const workbook = (window as any).XLSX.read(bstr, { type: 'binary', cellDates: true, dateNF: 'yyyy-mm-dd hh:mm:ss' });
        const sheetName = workbook.SheetNames[0];
        const rawData = (window as any).XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
        
        const fileName = file.name.split('.')[0].replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let targetTable = fileName;

        const existingTable = tables.find(t => t.name === fileName);
        if (!existingTable) {
          const sample = rawData[0] || {};
          const cols: any[] = Object.keys(sample).map(k => {
            const key = k.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            let type = 'text';
            const val = sample[k];
            if (!isNaN(Number(val)) && typeof val !== 'boolean') type = 'numeric';
            if (typeof val === 'string' && val.includes('-') && !isNaN(Date.parse(val))) type = 'timestamptz';
            return { name: key, type, nullable: true };
          });
          
          if (!cols.some(c => c.name === 'id')) {
            cols.unshift({ name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()', primaryKey: true });
          }

          await fetchWithAuth(`/api/data/${projectId}/tables`, { 
            method: 'POST', 
            body: JSON.stringify({ name: fileName, columns: cols }) 
          });
          await fetchTables();
        }

        for (const row of rawData) {
          const sanitizedRow = Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase(), v])
          );
          
          await fetchWithAuth(`/api/data/${projectId}/tables/${targetTable}/rows`, { 
            method: 'POST', 
            body: JSON.stringify({ data: sanitizedRow }) 
          }).catch(e => {
            console.error('Row insert failed:', sanitizedRow, e.message);
          });
        }

        setShowImportModal(false);
        setSelectedTable(targetTable);
        fetchTableDetails(targetTable);
        setSuccessMsg(`Imported data to ${targetTable} successfully.`);
        setTimeout(() => setSuccessMsg(null), 3000);
      };
      reader.readAsBinaryString(file);
    } catch (err: any) { setError(err.message); }
    finally { setExecuting(false); }
  };

  const handleExport = (format: 'csv' | 'sql') => {
    if (!selectedTable) return;
    if (format === 'csv') {
      const headers = colOrder.join(',');
      const rows = tableData.map(row => colOrder.map(col => {
        const val = row[col];
        return val === null ? '' : JSON.stringify(val);
      }).join(','));
      const content = [headers, ...rows].join('\n');
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${selectedTable}.csv`; a.click();
    } else {
      const inserts = tableData.map(row => {
        const columnsStr = colOrder.map(c => `"${c}"`).join(', ');
        const valuesStr = colOrder.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          return val;
        }).join(', ');
        return `INSERT INTO public."${selectedTable}" (${columnsStr}) VALUES (${valuesStr});`;
      }).join('\n');
      const blob = new Blob([inserts], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${selectedTable}.sql`; a.click();
    }
    setShowExportDropdown(false);
  };

  const onContextMenu = (e: React.MouseEvent, tableName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, table: tableName });
  };

  const handleExportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowExportDropdown(!showExportDropdown);
    if (!showExportDropdown) {
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
      exportTimerRef.current = setTimeout(() => setShowExportDropdown(false), 5000);
    }
  };

  useEffect(() => { fetchTables(); }, [projectId]);
  useEffect(() => { if (selectedTable && activeTab === 'tables') fetchTableDetails(selectedTable); }, [selectedTable, activeTab]);
  useEffect(() => {
    const hideMenus = () => { 
      setContextMenu(null); 
    };
    window.addEventListener('click', hideMenus);
    return () => window.removeEventListener('click', hideMenus);
  }, []);

  const orderedColumns = colOrder.map(name => columns.find(c => c.name === name)).filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-[#FDFDFD]">
      <header className="border-b border-slate-200 px-10 py-6 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-xl"><Database size={24} /></div>
          <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter">Instance Explorer</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-[0.2em]">{projectId}</p></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl">
            <button onClick={() => setActiveTab('tables')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'tables' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>DATA BROWSER</button>
            <button onClick={() => setActiveTab('query')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${activeTab === 'query' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>SQL TERMINAL</button>
          </div>
          <button onClick={() => setShowCreateTable(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"><Plus size={18} /> CREATE TABLE</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col">
          <div className="p-6">
            <div className="relative group"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input placeholder="Search tables..." className="w-full pl-12 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl outline-none" /></div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-1">
            <div className="flex items-center justify-between px-3 py-4"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Public Tables</span><span className="text-[10px] font-mono text-indigo-500 font-bold">{tables.length}</span></div>
            {tables.map(t => (
              <button 
                key={t.name} 
                onClick={() => setSelectedTable(t.name)} 
                onContextMenu={(e) => onContextMenu(e, t.name)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all group ${selectedTable === t.name ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4"><TableIcon size={18} className={selectedTable === t.name ? 'text-white' : 'text-slate-300'} /><span className="text-sm font-bold tracking-tight">{t.name}</span></div>
                <MoreHorizontal size={14} className="opacity-0 group-hover:opacity-50" />
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col relative">
          {(error || successMsg) && (
            <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 p-4 ${error ? 'bg-rose-600' : 'bg-emerald-600'} text-white text-xs font-bold rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4`}>
              {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {error || successMsg}
              <button onClick={() => { setError(null); setSuccessMsg(null); }} className="ml-4 opacity-50"><X size={14} /></button>
            </div>
          )}

          {activeTab === 'tables' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-10 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
                {selectedTable ? (
                  <div className="flex items-center gap-12">
                    <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Schema Identity</span><span className="text-xl font-black text-slate-900 font-mono">public.{selectedTable}</span></div>
                    <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Live Records</span><span className="text-xl font-black text-indigo-600">{tableData.length}</span></div>
                  </div>
                ) : <div />}
                
                <div className="flex items-center gap-3 relative">
                  {selectedRows.size > 0 && (
                    <button onClick={handleBulkDelete} className="bg-rose-50 text-rose-600 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-rose-100 transition-all border border-rose-200">
                      <Trash2 size={14} /> Delete Selected ({selectedRows.size})
                    </button>
                  )}
                  <button onClick={() => {
                    const initialData: Record<string, string> = {};
                    columns.forEach(c => {
                      if (c.name === 'id' && c.type === 'uuid') initialData[c.name] = getUUID();
                    });
                    setCurrentRowData(initialData);
                    setIsEditingRow(false);
                    setShowRowModal(true);
                  }} disabled={!selectedTable} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 disabled:opacity-50"><Plus size={14} /> ADD ROW</button>
                  <button onClick={() => setShowImportModal(true)} className="bg-white text-slate-700 border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all"><Upload size={14} /> IMPORT</button>
                  
                  <div className="relative">
                    <button onClick={handleExportClick} className="bg-white text-slate-700 border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all"><Download size={14} /> EXPORT</button>
                    {showExportDropdown && (
                      <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl p-2 z-[60] w-64 animate-in slide-in-from-top-2">
                        <button onClick={() => handleExport('csv')} className="w-full text-left px-5 py-4 text-[18px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 rounded-2xl flex items-center gap-3">.CSV Spreadsheet</button>
                        <button onClick={() => handleExport('sql')} className="w-full text-left px-5 py-4 text-[18px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 rounded-2xl flex items-center gap-3">.SQL Dump</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-10 bg-[#FAFBFC]">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-6"><div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div><p className="text-sm font-black uppercase tracking-widest text-slate-500">Connecting to Engine...</p></div>
                ) : selectedTable ? (
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-100 overflow-hidden inline-block min-w-full">
                    <table className="table-fixed border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="w-16 px-6 py-6 text-center border-r border-slate-100">
                             <button onClick={toggleAll} className="text-slate-300 hover:text-indigo-600 transition-colors">
                               {selectedRows.size === tableData.length && tableData.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                             </button>
                          </th>
                          {orderedColumns.map(col => (
                            <th 
                              key={col.name} 
                              draggable={!isResizing}
                              onDragStart={(e) => handleDragStart(e, col.name)}
                              onDragOver={(e) => handleDragOver(e, col.name)}
                              onDragEnd={handleDragEnd}
                              className={`relative px-8 py-6 text-left group border-r border-slate-100 select-none ${isResizing ? '' : 'cursor-move hover:bg-slate-100/50'}`}
                              style={{ width: colWidths[col.name] || 200 }}
                            >
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] truncate">{col.name}</span>
                                <span className="text-[9px] font-mono text-indigo-500 font-bold tracking-tight uppercase">{col.type}</span>
                              </div>
                              <div onMouseDown={(e) => handleResizeStart(e, col.name)} className="resize-handle" />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tableData.map((row, i) => {
                          const idVal = row[pkCol];
                          const isSelected = selectedRows.has(idVal);
                          return (
                            <tr 
                              key={i} 
                              onDoubleClick={() => {
                                setCurrentRowData({ ...row });
                                setIsEditingRow(true);
                                setShowRowModal(true);
                              }}
                              className={`hover:bg-indigo-50/30 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50' : ''}`}
                            >
                              <td className="px-6 py-5 text-center border-r border-slate-100">
                                <button onClick={(e) => { e.stopPropagation(); toggleRow(idVal); }} className={`${isSelected ? 'text-indigo-600' : 'text-slate-200'}`}>
                                  {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                </button>
                              </td>
                              {orderedColumns.map(col => (
                                <td key={col.name} className="px-8 py-5 text-sm font-medium text-slate-700 font-mono truncate border-r border-slate-100 last:border-r-0">
                                  {row[col.name] === null ? <span className="text-slate-300 italic">null</span> : String(row[col.name])}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-200"><Database size={120} className="mb-8 opacity-5" /><h3 className="text-3xl font-black text-slate-300 tracking-tighter uppercase tracking-widest">Select a Table</h3><p className="text-slate-400 mt-2 font-bold uppercase tracking-widest text-[10px]">Registry is online and healthy.</p></div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
              <div className="px-8 py-5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between z-10">
                <div className="flex items-center gap-4"><div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400"><Terminal size={20} /></div><h4 className="text-white font-black text-sm tracking-tight">SQL Console v1</h4></div>
                <button onClick={async () => {
                  setExecuting(true);
                  try {
                    const data = await fetchWithAuth(`/api/data/${projectId}/query`, { method: 'POST', body: JSON.stringify({ sql: query }) });
                    setQueryResult(data);
                    fetchTables();
                  } catch (err: any) { setError(err.message); }
                  finally { setExecuting(false); }
                }} disabled={executing} className="bg-emerald-500 text-white px-8 py-3 rounded-2xl text-xs font-black flex items-center gap-3 hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20">{executing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />} EXECUTE</button>
              </div>
              <textarea value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 w-full bg-[#020617] text-emerald-400 p-12 font-mono text-lg outline-none resize-none spellcheck-false" />
              {queryResult && (
                <div className="h-[45%] bg-[#0f172a] border-t border-white/5 overflow-auto p-10 font-mono animate-in slide-in-from-bottom-10"><pre className="text-xs text-slate-300 leading-6">{JSON.stringify(queryResult.rows, null, 2)}</pre></div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Custom Right-Click Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[200] bg-white border border-slate-200 shadow-[0_30px_60px_rgba(0,0,0,0.15)] rounded-[2.5rem] p-3 w-64 animate-in fade-in zoom-in-95" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { copyToClipboard(contextMenu.table); setContextMenu(null); }} className="w-full flex items-center gap-4 px-5 py-4 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-2xl transition-all text-left"><Copy size={16} /> Copy Table Name</button>
          <button onClick={async () => {
            const data = await fetchWithAuth(`/api/data/${projectId}/tables/${contextMenu.table}/sql`);
            copyToClipboard(data.sql);
            setContextMenu(null);
          }} className="w-full flex items-center gap-4 px-5 py-4 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-2xl transition-all text-left"><Code size={16} /> Copy Schema SQL</button>
          <button onClick={() => {
            setRenameState({ active: true, oldName: contextMenu.table, newName: contextMenu.table });
            setContextMenu(null);
          }} className="w-full flex items-center gap-4 px-5 py-4 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-2xl transition-all text-left"><Edit size={16} /> Rename Table</button>
          <div className="h-[1px] bg-slate-100 my-2" />
          <button onClick={() => {
            const table = tables.find(t => t.name === contextMenu.table);
            setDeleteConfirm({ active: true, table: contextMenu.table, confirmInput: '', rowCount: table?.count || 0, mode: 'table' });
            setContextMenu(null);
          }} className="w-full flex items-center gap-4 px-5 py-4 text-xs font-black text-rose-600 hover:bg-rose-50 rounded-2xl transition-all text-left"><Trash2 size={16} /> Delete Table</button>
        </div>
      )}

      {/* Row Modal */}
      {showRowModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-8">
          <div className="bg-white rounded-[3.5rem] w-full max-w-2xl p-12 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">{isEditingRow ? 'Edit Record' : 'Insert Record'}</h3>
            <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-4">
              {columns.map(col => (
                <div key={col.name} className="space-y-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{col.name} ({col.type})</label>
                    <div className="flex gap-2">
                       {col.type === 'uuid' && (
                         <button onClick={() => setCurrentRowData({ ...currentRowData, [col.name]: getUUID() })} className="text-[9px] font-black text-indigo-600 uppercase flex items-center gap-1 hover:text-indigo-800 transition-all"><Wand2 size={10} /> Gen UUID</button>
                       )}
                       {col.type.includes('timestamp') && (
                         <button 
                            onClick={() => {
                              // Format correctly for datetime-local input YYYY-MM-DDTHH:mm
                              const now = new Date();
                              const formatted = now.toISOString().slice(0, 16);
                              setCurrentRowData({ ...currentRowData, [col.name]: formatted });
                            }} 
                            className="text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1 hover:text-emerald-800 transition-all"
                         >
                           <Calendar size={10} /> Now
                         </button>
                       )}
                    </div>
                  </div>
                  <input 
                    type={col.type.includes('timestamp') ? 'datetime-local' : 'text'}
                    value={currentRowData[col.name] || ''}
                    placeholder={col.default || 'null'}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 ${isEditingRow && col.isPrimaryKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onChange={(e) => setCurrentRowData({ ...currentRowData, [col.name]: e.target.value })}
                    readOnly={isEditingRow && col.isPrimaryKey}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-6 mt-12 pt-8 border-t border-slate-100">
               <button onClick={() => setShowRowModal(false)} className="flex-1 py-5 text-slate-400 font-black uppercase tracking-widest text-xs">Cancel</button>
               <button onClick={handleRowAction} className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
                 {isEditingRow ? 'UPDATE RECORD' : 'SAVE RECORD'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-8">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl p-16 shadow-2xl border border-slate-100 animate-in zoom-in-95 text-center">
            <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mx-auto mb-10"><Upload size={48} /></div>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">Ingest Data</h3>
            <p className="text-slate-500 font-medium leading-relaxed mb-12">Select or drop a CSV, XLSX, or XLS file. Cascata will automatically create a new table or append data if a matching name is found.</p>
            
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => { 
                e.preventDefault(); 
                setIsDraggingFile(false); 
                const f = e.dataTransfer.files[0]; 
                if (f) handleFileUpload(f); 
              }}
              className={`relative border-4 border-dashed rounded-[3rem] p-20 transition-all ${isDraggingFile ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100'} hover:border-indigo-400 hover:bg-slate-50 cursor-pointer`}
            >
              <input type="file" accept=".csv, .xlsx, .xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="absolute inset-0 opacity-0 cursor-pointer" title="" />
              <div className="flex flex-col items-center pointer-events-none">
                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">{isDraggingFile ? 'Drop it now!' : 'Drop spreadsheet here'}</span>
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-2">Maximum 50MB per ingest</p>
              </div>
            </div>
            
            <button onClick={() => setShowImportModal(false)} className="mt-12 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Go Back</button>
          </div>
        </div>
      )}

      {/* Delete/Purge Modal */}
      {deleteConfirm.active && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[300] flex items-center justify-center p-8">
          <div className="bg-white rounded-[3.5rem] w-full max-w-lg p-12 text-center shadow-2xl border border-rose-100 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-50 rounded-[2.5rem] flex items-center justify-center text-rose-600 mx-auto mb-10"><Trash2 size={40} /></div>
            <h4 className="text-3xl font-black text-slate-900 tracking-tighter mb-4">Dangerous Operation</h4>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
              {deleteConfirm.mode === 'table' 
                ? `You are about to purge table "public.${deleteConfirm.table}" with ${deleteConfirm.rowCount} records. This operation cannot be reversed.`
                : `You are about to delete ${deleteConfirm.rowCount} specific records from "public.${selectedTable}".`
              }
            </p>
            {(deleteConfirm.rowCount > 3 || deleteConfirm.mode === 'rows') && (
              <div className="space-y-4 mb-8">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">To proceed, type the table name:</p>
                <input value={deleteConfirm.confirmInput} onChange={(e) => setDeleteConfirm({ ...deleteConfirm, confirmInput: e.target.value })} className="w-full bg-rose-50 border border-rose-100 rounded-2xl py-4 px-6 text-center text-sm font-bold text-rose-900 outline-none focus:ring-4 focus:ring-rose-500/20" placeholder={deleteConfirm.mode === 'table' ? deleteConfirm.table : selectedTable!} />
              </div>
            )}
            <div className="flex gap-6">
              <button onClick={() => setDeleteConfirm({ ...deleteConfirm, active: false })} className="flex-1 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Abort</button>
              <button 
                onClick={deleteConfirm.mode === 'table' ? async () => {
                  try {
                    await fetchWithAuth(`/api/data/${projectId}/tables/${deleteConfirm.table}`, { method: 'DELETE' });
                    setDeleteConfirm({ ...deleteConfirm, active: false });
                    setSelectedTable(null);
                    fetchTables();
                  } catch (e: any) { setError(e.message); }
                } : handleBulkDelete} 
                disabled={ (deleteConfirm.rowCount > 3 || deleteConfirm.mode === 'rows') && deleteConfirm.confirmInput !== (deleteConfirm.mode === 'table' ? deleteConfirm.table : (selectedTable || '')) }
                className="flex-[2] py-5 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl disabled:opacity-30 transition-all hover:bg-rose-700"
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameState.active && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[300] flex items-center justify-center p-8">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 animate-in zoom-in-95 shadow-2xl">
            <h4 className="text-2xl font-black text-slate-900 tracking-tight mb-8 uppercase tracking-widest">Rename Identifier</h4>
            <input value={renameState.newName} onChange={(e) => setRenameState({ ...renameState, newName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/gi, '_') })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-sm font-bold mb-8 outline-none focus:ring-4 focus:ring-indigo-500/20" />
            <div className="flex gap-4">
              <button onClick={() => setRenameState({ ...renameState, active: false })} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Abort</button>
              <button onClick={async () => {
                try {
                  const res = await fetchWithAuth(`/api/data/${projectId}/tables/${renameState.oldName}/rename`, { method: 'PUT', body: JSON.stringify({ newName: renameState.newName }) });
                  setRenameState({ ...renameState, active: false });
                  setSelectedTable(res.newName);
                  fetchTables();
                } catch (e: any) { setError(e.message); }
              }} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20">Commit Rename</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Table Creator Modal */}
      {showCreateTable && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-8">
          <div className="bg-white rounded-[4rem] w-full max-w-5xl max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95">
            <header className="p-12 border-b border-slate-100 flex items-center justify-between bg-slate-50/50"><div className="flex items-center gap-6"><div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl"><Plus size={32} /></div><div><h3 className="text-4xl font-black text-slate-900 tracking-tighter">Schema Architect</h3></div></div><button onClick={() => setShowCreateTable(false)} className="p-4 hover:bg-slate-200 rounded-full transition-colors"><X size={32} className="text-slate-400" /></button></header>
            <div className="flex-1 overflow-y-auto p-16 space-y-16">
              <div className="space-y-4 max-w-xl"><label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Table Identity</label><input value={newTableName} onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/gi, '_'))} className="w-full bg-slate-100 border-none rounded-[1.8rem] py-6 px-10 text-2xl font-black text-slate-900 outline-none" placeholder="e.g. products" /></div>
              <div className="space-y-8">
                {newTableColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <input value={col.name} onChange={(e) => { const upd = [...newTableColumns]; upd[idx].name = e.target.value.toLowerCase().replace(/[^a-z0-9_]/gi, '_'); setNewTableColumns(upd); }} className="flex-1 bg-white border border-slate-200 rounded-2xl py-4 px-8 text-sm font-bold outline-none" placeholder="Column name" />
                    <select value={col.type} onChange={(e) => { const upd = [...newTableColumns]; upd[idx].type = e.target.value; setNewTableColumns(upd); }} className="w-64 bg-white border border-slate-200 rounded-2xl py-4 px-6 text-sm font-black text-indigo-600 outline-none"><option value="uuid">UUID</option><option value="text">TEXT</option><option value="integer">INT</option><option value="numeric">NUMERIC</option><option value="boolean">BOOL</option><option value="timestamptz">TIMESTAMP</option></select>
                    <button onClick={() => setNewTableColumns(newTableColumns.filter((_, i) => i !== idx))} className="p-3 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={24} /></button>
                  </div>
                ))}
                <button onClick={() => setNewTableColumns([...newTableColumns, { name: 'new_col', type: 'text', primaryKey: false, nullable: true }])} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-8 py-4 rounded-2xl transition-all border-2 border-indigo-100 uppercase tracking-widest">+ ADD ATTRIBUTE</button>
              </div>
            </div>
            <footer className="p-12 border-t border-slate-100 bg-slate-50/50 flex gap-6"><button onClick={() => setShowCreateTable(false)} className="flex-1 py-8 text-slate-400 font-black uppercase tracking-widest text-xs">Abort</button><button onClick={async () => { setExecuting(true); try { await fetchWithAuth(`/api/data/${projectId}/tables`, { method: 'POST', body: JSON.stringify({ name: newTableName, columns: newTableColumns }) }); setShowCreateTable(false); setNewTableName(''); fetchTables(); } catch (err: any) { setError(err.message); } finally { setExecuting(false); } }} disabled={executing || !newTableName} className="flex-[2] py-8 bg-indigo-600 text-white font-black rounded-[2rem] shadow-2xl uppercase tracking-widest text-xs">Commit Table</button></footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseExplorer;