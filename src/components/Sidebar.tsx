import { useState, useRef } from 'react';
import { Notebook, Source } from '../types';
import { useStore } from '../store';
import { 
  Plus, Search, FileText, Globe, Image as ImageIcon, 
  X, PanelLeftClose, PanelLeftOpen, ChevronDown, ArrowRight, Trash2, Loader2, Maximize2,
  Sparkles, Youtube, Link as LinkIcon, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

interface SidebarProps {
  notebook: Notebook;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ notebook, isCollapsed, onToggle }: SidebarProps) {
  const { 
    addSource, 
    toggleSourceSelection, 
    selectAllSources,
    deselectAllSources,
    setPreviewSourceId,
    deleteSource,
    generateNotebookSummary
  } = useStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isWebMode, setIsWebMode] = useState(true);
  const [webResults, setWebResults] = useState<{ summary: string; sources: any[] } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [importingSources, setImportingSources] = useState(false);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredSources = isWebMode 
    ? notebook.sources 
    : notebook.sources.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleWebSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;
    if (!isWebMode) return;
    setIsSearching(true);
    setWebResults(null);
    setSelectedSources(new Set());
    try {
      const token = localStorage.getItem('nutech-vault-token');
      const res = await axios.post('/api/ai/search', { query: searchQuery }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWebResults(res.data);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportSelected = async () => {
    if (!webResults || selectedSources.size === 0 || importingSources) return;
    setImportingSources(true);
    try {
      const token = localStorage.getItem('nutech-vault-token');
      const indices = Array.from(selectedSources);
      for (const index of indices) {
        const source = webResults.sources[index];
        if (importedUrls.has(source.url)) continue;
        const res = await axios.post(`/api/notebooks/${notebook.id}/sources/web`, {
          title: source.title,
          url: source.url
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        await addSource(notebook.id, {
          title: res.data.title || source.title,
          content: '',
          type: 'url',
          fileUrl: source.url
        });
        setImportedUrls(prev => new Set(prev).add(source.url));
      }
      setSelectedSources(new Set());
    } catch (err) {
      console.error('Import failed', err);
    } finally {
      setImportingSources(false);
    }
  };

  const toggleSelectAll = () => {
    if (!webResults) return;
    if (selectedSources.size === webResults.sources.length) {
      setSelectedSources(new Set());
    } else {
      const all = new Set<number>();
      webResults.sources.forEach((_, i) => all.add(i));
      setSelectedSources(all);
    }
  };

  const toggleSourceSelectionDiscovery = (index: number) => {
    const next = new Set(selectedSources);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedSources(next);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const filesArray = Array.from(files);
    try {
      const token = localStorage.getItem('nutech-vault-token');
      for (const file of filesArray) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axios.post('/api/upload', formData, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = res.data;
        await addSource(notebook.id, {
          title: data.title || file.name,
          content: data.content,
          type: data.type,
          fileUrl: data.fileUrl
        });
      }
      generateNotebookSummary(notebook.id);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getSourceIcon = (type: Source['type']) => {
    switch (type) {
      case 'pdf': return <div className="bg-red-50 text-red-600 p-1 rounded font-bold text-[8px]">PDF</div>;
      case 'url': return <Globe size={14} className="text-blue-500" />;
      default: return <FileText size={14} className="text-neutral-500" />;
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 gap-4">
        <button onClick={onToggle} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500">
          <PanelLeftOpen size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 selection:bg-blue-100 selection:text-blue-900 overflow-hidden border-r border-neutral-200 dark:border-neutral-800">
      {/* Sidebar Header */}
      <div className="p-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Sparkles className="text-white" size={18} />
          </div>
          <h1 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight">Nutech</h1>
        </div>
        <button onClick={onToggle} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 transition-colors">
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="px-5 space-y-4 shrink-0">
        {/* Add Source Button */}
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full py-3 bg-[#e8f0fe] dark:bg-blue-900/20 hover:bg-[#dce8fd] dark:hover:bg-blue-900/30 text-neutral-700 dark:text-blue-200 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-colors border border-transparent active:scale-[0.98]"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
          ) : (
            <Plus size={18} className="text-neutral-500 dark:text-blue-400" />
          )}
          Add sources
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />

        {/* Web Search Box */}
        <div className="bg-[#f8f9fa] dark:bg-neutral-800/50 rounded-2xl p-3 border border-neutral-100 dark:border-neutral-800 space-y-3">
          <div className="flex items-center gap-2 text-neutral-500 px-1">
            {isSearching ? <Loader2 size={16} className="animate-spin text-blue-500" /> : <Search size={16} />}
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWebSearch()}
              placeholder={isWebMode ? "Research the web..." : "Search sources..."} 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-neutral-400 dark:text-neutral-200"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-2">
              <button 
                onClick={() => setIsWebMode(!isWebMode)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isWebMode 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <Globe size={14} />
                Web
                <ChevronDown size={14} />
              </button>
            </div>
            <button 
              onClick={handleWebSearch}
              disabled={!searchQuery.trim() || isSearching}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                searchQuery.trim() && !isSearching ? 'bg-black dark:bg-white text-white dark:text-black hover:scale-110' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
              }`}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Discovery Results Section (Inline) */}
      <AnimatePresence mode="wait">
        {webResults && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-4 mt-4 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden flex flex-col shadow-xl"
          >
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-700 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50">
               <div className="flex items-center gap-2">
                 <Sparkles size={16} className="text-blue-600 dark:text-blue-400" />
                 <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Fast Research completed!</span>
               </div>
                <button 
                  onClick={() => setShowSummary(!showSummary)}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4"
                >
                  {showSummary ? 'Hide' : 'View'}
                </button>
             </div>
             
             <AnimatePresence>
               {showSummary && (
                 <motion.div 
                   initial={{ height: 0, opacity: 0 }}
                   animate={{ height: 'auto', opacity: 1 }}
                   exit={{ height: 0, opacity: 0 }}
                   className="px-4 pb-4 border-b border-neutral-100 dark:border-neutral-700"
                 >
                   <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100/50 dark:border-blue-800/50 p-3 rounded-xl mt-4">
                      <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400 italic">
                        {webResults.summary}
                      </p>
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
             
             <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                {webResults.sources.map((s, i) => (
                  <div 
                    key={i} 
                    onClick={() => toggleSourceSelectionDiscovery(i)}
                    className={`flex gap-3 p-2 rounded-xl transition-all cursor-pointer ${
                      selectedSources.has(i) ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50 border border-transparent'
                    }`}
                  >
                    <div className="shrink-0 mt-1 flex items-center gap-2">
                       <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                         selectedSources.has(i) ? 'bg-blue-600 border-blue-600' : 'border-neutral-300 dark:border-neutral-600'
                       }`}>
                         {selectedSources.has(i) && <Check size={10} className="text-white" />}
                       </div>
                       {s.url.includes('youtube.com') ? <Youtube size={16} className="text-red-500" /> : <Globe size={16} className="text-blue-500 dark:text-blue-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 truncate">{s.title}</p>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1">{s.snippet || 'No description available'}</p>
                    </div>
                  </div>
                ))}
             </div>

             <div className="p-4 pt-2 border-t border-neutral-100 dark:border-neutral-700 flex items-center justify-between bg-neutral-50/30 dark:bg-neutral-900/30">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setWebResults(null)}
                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-all"
                  >
                     <Plus size={16} className="rotate-45" />
                  </button>
                  <div className="flex items-center gap-2 ml-2">
                    <input 
                      type="checkbox" 
                      checked={webResults && selectedSources.size === webResults.sources.length}
                      onChange={toggleSelectAll}
                      className="w-3 h-3 rounded"
                    />
                    <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">Select all</span>
                  </div>
                </div>
                
                <button 
                  onClick={handleImportSelected}
                  disabled={selectedSources.size === 0 || importingSources}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  {importingSources ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Import
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Select All */}
      <div className="px-5 mt-6 flex items-center justify-end gap-2 mb-2 shrink-0">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Select all</span>
        <input 
          type="checkbox" 
          checked={notebook.selectedSourceIds?.length === notebook.sources.length && notebook.sources.length > 0}
          onChange={(e) => e.target.checked ? selectAllSources(notebook.id) : deselectAllSources(notebook.id)}
          className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-blue-500 bg-transparent"
        />
      </div>

      {/* Source List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
        {notebook.sources.length === 0 && !webResults && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
             <FileText size={40} className="text-neutral-300 dark:text-neutral-700 mb-4" />
             <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2">Saved sources will appear here</p>
             <p className="text-xs text-neutral-400 leading-relaxed">
               Click Add source above to add PDFs, websites, text, videos or audio files.
             </p>
          </div>
        )}
        {filteredSources.map((source) => (
          <div 
            key={source.id}
            draggable={true}
            onDragStart={() => useStore.getState().setDraggedSource(source)}
            onDragEnd={() => useStore.getState().setDraggedSource(null)}
            className="group flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all cursor-pointer active:scale-95 active:bg-neutral-100 dark:active:bg-neutral-700"
          >
            <div 
              className="flex items-center gap-3 overflow-hidden flex-1"
              onClick={() => setPreviewSourceId(source.id)}
            >
              <div className="shrink-0">{getSourceIcon(source.type)}</div>
              <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{source.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={(e) => { e.stopPropagation(); deleteSource(notebook.id, source.id); }}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 transition-all"
              >
                <Trash2 size={14} />
              </button>
              <input 
                type="checkbox" 
                checked={(notebook.selectedSourceIds || []).includes(source.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleSourceSelection(notebook.id, source.id);
                }}
                className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-blue-500 bg-transparent"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
