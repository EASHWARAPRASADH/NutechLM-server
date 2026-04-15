import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notebook, Source } from '../types';
import { useStore } from '../store';
import { 
  Plus, Search, FileText, Globe, Image as ImageIcon, 
  Trash2, ChevronLeft, Upload, X, Edit3,
  Maximize2, LayoutGrid, List, FilePlus, AlertCircle, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { generateSourceSummary, generateConsolidatedSummary } from '../lib/ai';
import axios from 'axios';

export default function Sidebar({ notebook }: { notebook: Notebook }) {
  const navigate = useNavigate();
  const { 
    addSource, 
    deleteSource, 
    toggleSourceSelection, 
    setActiveNotebook,
    setHighlightedSourceId,
    setDraggedSource,
    selectAllSources,
    deselectAllSources,
    setPreviewSourceId,
    addNote,
    addChatMessage,
    updateNotebook,
    updateSource,
    masterSources,
    isGuest
  } = useStore();
  
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const filteredSources = notebook.sources.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    setIsAdding(false);

    const filesArray = Array.from(files);
    
    try {
      const token = localStorage.getItem('nutech-vault-token');
      const newlyUploaded = [];
      
      for (const file of filesArray) {
        setUploadProgress(0); // Reset for each file
        setUploadError(`Uploading ${file.name}...`); 
        
        const formData = new FormData();
        formData.append('file', file);

        const res = await axios.post('/api/upload', formData, {
          headers: { 'Authorization': `Bearer ${token}` },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
            setUploadProgress(percentCompleted);
          }
        });

        const data = res.data;
        
        setUploadError(`Indexing ${file.name}...`); 
        
        await addSource(notebook.id, {
          title: data.title || file.name,
          content: data.content,
          type: data.type,
          fileUrl: data.fileUrl
        });
        
        newlyUploaded.push({ title: data.title || file.name, content: data.content });
      }
      
      // Multi-document summary or single summary
      if (newlyUploaded.length > 0) {
        setUploadError(newlyUploaded.length > 1 ? "Synthesizing full document batch..." : "Generating intelligence summary...");
        // Tell the chat area to show an active loading state!
        window.dispatchEvent(new CustomEvent('nutech:chat-loading', { detail: { isActive: true, message: "Synthesizing Source Guide..." } }));
        
        try {
           if (newlyUploaded.length > 1) {
              const consolidated = await generateConsolidatedSummary(newlyUploaded);
              await addChatMessage(notebook.id, { role: 'model', content: consolidated });
           } else {
              const single = await generateSourceSummary(newlyUploaded[0].title, newlyUploaded[0].content);
              await addChatMessage(notebook.id, { role: 'model', content: single });
           }
        } catch (sumErr) {
           console.error("Auto-summary failed:", sumErr);
        } finally {
           window.dispatchEvent(new CustomEvent('nutech:chat-loading', { detail: { isActive: false } }));
        }
      }
      
      setUploadError(null);
      setUploadProgress(0);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const url = (form.elements.namedItem('url') as HTMLInputElement).value;
    if (!url) return;

    setIsUploading(true);
    setUploadError(null);
    setIsAdding(false);

    try {
      const token = localStorage.getItem('nutech-vault-token');
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) throw new Error('Scraping failed');
      const data = await res.json();
      
      await addSource(notebook.id, {
        title: data.title || url,
        content: data.content,
        type: 'url'
      });
      
      try {
        const summary = await generateSourceSummary(data.title || url, data.content);
        
        // Automatic Chat Injection (Summary comes to center for immediate context)
        await addChatMessage(notebook.id, {
          role: 'model',
          content: summary
        });
      } catch (sumErr) {
        console.error('Auto-summary failed:', sumErr);
      }
      
      
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to index URL');
    } finally {
      setIsUploading(false);
    }
  };

  const getSourceIcon = (type: Source['type']) => {
    switch (type) {
      case 'url': return <Globe size={16} />;
      case 'image': return <ImageIcon size={16} />;
      case 'pdf': return <FileText size={16} />;
      default: return <FileText size={16} />;
    }
  };

  return (
    <motion.aside 
      initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      className="w-80 flex flex-col h-full bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 z-10"
    >
      <div className="p-6 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => { setActiveNotebook(null); navigate('/dashboard'); }}
            className="flex items-center gap-2 text-neutral-500 hover:text-brand-primary dark:hover:text-neutral-100 transition-colors group"
          >
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Library</span>
          </button>
          <div className="flex gap-1">
             <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white' : 'text-neutral-400'}`}><LayoutGrid size={14} /></button>
             <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg ${viewMode === 'list' ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white' : 'text-neutral-400'}`}><List size={14} /></button>
          </div>
        </div>
        
        <div className="group/nb flex items-center justify-between mb-2">
          <h1 
            className="text-2xl font-black text-neutral-900 dark:text-white truncate uppercase tracking-tight flex-1 cursor-text hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 -ml-1 transition-colors outline-none"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const text = e.currentTarget.textContent?.trim();
              if (text && text !== notebook.title) {
                updateNotebook(notebook.id, { title: text });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          >
            {notebook.title}
          </h1>
          <Edit3 size={14} className="text-neutral-300 opacity-0 group-hover/nb:opacity-100 transition-opacity" />
        </div>
        <p className="text-[10px] font-black text-brand-accent uppercase tracking-[0.2em] mb-6">Neural Vault • v3.0</p>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-brand-primary transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-transparent focus:border-brand-primary/20 focus:bg-white dark:focus:bg-neutral-800 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold transition-all outline-none text-neutral-900 dark:text-neutral-100"
          />
        </div>
      </div>

      <div className="p-6 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-800/30">
        <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
           <div className="w-1.5 h-1.5 rounded-full bg-brand-primary mb-0.5" />
           <span>Inference Nodes</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => selectAllSources(notebook.id)} className="text-[9px] font-black text-brand-primary hover:text-brand-primary uppercase tracking-widest">All</button>
          <span className="text-neutral-200 dark:text-neutral-700">|</span>
          <button onClick={() => deselectAllSources(notebook.id)} className="text-[9px] font-black text-neutral-400 hover:text-neutral-500 uppercase tracking-widest">Clear</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Master Intelligence Section */}
        {masterSources && masterSources.length > 0 && (
          <div className={`${viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}`}>
             <div className="flex items-center gap-2 mb-4">
                <Globe size={14} className="text-emerald-500" />
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Master Intelligence</span>
             </div>
             {masterSources.map((source) => (
                <div
                  key={source.id}
                  onClick={() => toggleSourceSelection(notebook.id, source.id)}
                  className={`group flex items-center gap-4 p-4 rounded-[1.5rem] border-2 transition-all cursor-pointer relative overflow-hidden ${
                    (notebook.selectedSourceIds || []).includes(source.id)
                      ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-500 shadow-lg'
                      : 'bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 shadow-sm'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    (notebook.selectedSourceIds || []).includes(source.id)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                  }`}>
                    {getSourceIcon(source.type)}
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <h3 
                      className="text-[11px] font-black text-neutral-900 dark:text-white uppercase tracking-tight outline-none cursor-text hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 -ml-1 transition-colors"
                      contentEditable
                      suppressContentEditableWarning
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const text = e.currentTarget.textContent?.trim();
                        if (text && text !== source.title) {
                          useStore.getState().updateMasterSource(source.id, { title: text });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                    >
                      {source.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[7px] font-black bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-emerald-500/20">Global Node</span>
                      <span className="text-[9px] text-neutral-400 dark:text-neutral-500 uppercase tracking-widest font-black">
                        {source.type}
                      </span>
                    </div>
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); (e.currentTarget.closest('.group')?.querySelector('h3') as HTMLElement)?.focus(); }}
                      className="p-2 text-neutral-400 hover:text-brand-primary rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Rename Global Asset"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPreviewSourceId(source.id); }} 
                      className="p-2 text-neutral-400 hover:text-brand-primary rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Preview Global Asset"
                    >
                      <Maximize2 size={12} />
                    </button>
                  </div>
                </div>
             ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
             <FilePlus size={14} className="text-brand-primary" />
             <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Upload Resources</span>
          </div>

          {/* Inline Upload Progress (NotebookLM Style) */}
          <AnimatePresence>
            {isUploading && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-brand-primary">
                       <Loader2 className="animate-spin" size={14} />
                       <span className="text-[9px] font-black uppercase tracking-widest">{uploadError || 'Synching Vault...'}</span>
                    </div>
                    {uploadProgress > 0 && <span className="text-[10px] font-black text-blue-600 dark:text-brand-primary">{uploadProgress}%</span>}
                  </div>
                  <div className="h-1.5 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress || (isUploading ? 5 : 0)}%` }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                        className="h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                     />
                  </div>
                </div>
              </motion.div>
            )}
            
            {!isUploading && uploadError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 border border-red-100 dark:border-red-900/30"
              >
                <AlertCircle size={14} />
                <span className="text-[10px] font-bold">{uploadError}</span>
                <button onClick={() => setUploadError(null)} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full transition-colors">
                  <X size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`${viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}`}>
          <AnimatePresence mode="popLayout">
          {filteredSources.map((source) => (
            <div
              key={source.id}
              draggable
              onDragStart={(e: React.DragEvent) => {
                e.dataTransfer.setData('sourceId', source.id);
                setDraggedSource(source);
              }}
              onDragEnd={() => setDraggedSource(null)}
              onClick={() => toggleSourceSelection(notebook.id, source.id)}
              onMouseEnter={() => setHighlightedSourceId(source.id)}
              onMouseLeave={() => setHighlightedSourceId(null)}
              className={`group relative transition-all cursor-pointer overflow-hidden border-2 flex ${
                viewMode === 'grid' ? 'flex-col items-center justify-center aspect-square p-2 rounded-2xl' : 'items-center gap-4 p-4 rounded-[1.5rem]'
              } ${
                (notebook.selectedSourceIds || []).includes(source.id)
                  ? 'bg-blue-50/50 dark:bg-blue-900/10 border-brand-primary shadow-lg'
                  : 'bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 shadow-sm'
              }`}
            >
              <div className={`rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                viewMode === 'grid' ? 'w-8 h-8 mb-2' : 'w-10 h-10'
              } ${
                (notebook.selectedSourceIds || []).includes(source.id)
                  ? 'bg-brand-primary text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
              }`}>
                {getSourceIcon(source.type)}
              </div>
              <div className={`${viewMode === 'grid' ? 'text-center' : 'flex-1'} min-w-0 pr-6 w-full`}>
                <h3 
                  className={`text-[9.5px] font-black text-neutral-900 dark:text-white uppercase tracking-tight outline-none cursor-text hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 -ml-1 transition-colors truncate w-full ${viewMode === 'grid' ? 'text-center' : ''}`}
                  contentEditable
                  suppressContentEditableWarning
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const text = e.currentTarget.textContent?.trim();
                    if (text && text !== source.title) {
                      updateSource(notebook.id, source.id, { title: text });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                >
                  {source.title}
                </h3>
                {viewMode === 'list' && (
                  <p className="text-[9px] text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-widest font-black">
                    {source.type}
                  </p>
                )}
              </div>

              <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => { e.stopPropagation(); (e.currentTarget.closest('.group')?.querySelector('h3') as HTMLElement)?.focus(); }}
                  className="p-2 text-neutral-400 hover:text-brand-primary rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title="Rename Asset"
                >
                  <Edit3 size={12} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setPreviewSourceId(source.id); }} 
                  className="p-2 text-neutral-400 hover:text-brand-primary rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title="Preview Asset"
                >
                  <Maximize2 size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); if (confirm('Purge asset?')) deleteSource(notebook.id, source.id); }} className="p-2 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Delete Asset"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </AnimatePresence>
        </div>
        </div>
      </div>

      {!isGuest && (
        <div className="p-6 mt-auto border-t border-neutral-100 dark:border-neutral-800">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setIsAdding(true)}
            className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl font-black uppercase tracking-widest text-[11px]"
          >
            <Plus size={18} />
            Upload Access
          </motion.button>
        </div>
      )}

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-100 dark:border-neutral-800"
            >
              <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                <h3 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Upload Access</h3>
                <button onClick={() => setIsAdding(false)} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-2 rounded-full transition-colors"><X size={24} /></button>
              </div>

              <div className="p-8 space-y-8">
                <div onClick={() => fileInputRef.current?.click()} className="group aspect-video border-4 border-dashed border-neutral-100 dark:border-neutral-800 rounded-[2rem] flex flex-col items-center justify-center gap-4 hover:border-brand-primary hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-all cursor-pointer">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" />
                  <div className="w-16 h-16 bg-neutral-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center text-neutral-400 group-hover:bg-brand-primary group-hover:text-white transition-all shadow-lg"><Upload size={24} /></div>
                  <div className="text-center">
                    <p className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Cloud Index</p>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-1">PDF, Media, Docs (OCR Enabled)</p>
                  </div>
                </div>

                <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.4em] text-neutral-300 dark:text-neutral-700"><span>or</span></div>

                <form onSubmit={handleUrlSubmit} className="space-y-4">
                  <div className="relative">
                    <Globe size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300" />
                    <input name="url" type="url" placeholder="Neural Path (URL)..." className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-3xl py-5 pl-14 pr-6 text-sm font-bold outline-none text-neutral-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all" required />
                  </div>
                  <button type="submit" disabled={isUploading} className="w-full bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white py-5 rounded-3xl font-black uppercase tracking-widest text-[11px] hover:bg-neutral-900 hover:text-white transition-all disabled:opacity-50">Scrape Intelligence</button>
                </form>


              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
