import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Loader2, Plus, Check } from 'lucide-react';
import { useStore } from '../store';

export default function DiscoverSourcesModal({ 
  notebookId, 
  onClose 
}: { 
  notebookId: string; 
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ summary: string; sources: any[] } | null>(null);
  const [importingUrls, setImportingUrls] = useState<Set<string>>(new Set());
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());
  const [isImportingAll, setIsImportingAll] = useState(false);
  
  const { searchWeb, addWebSource } = useStore();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsSearching(true);
    setError(null);
    setResults(null);
    setImportedUrls(new Set());
    
    try {
      const data = await searchWeb(query);
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Failed to search the web.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async (source: any) => {
    setImportingUrls((prev) => new Set(prev).add(source.url));
    try {
      await addWebSource(notebookId, source.title, source.url);
      setImportedUrls((prev) => new Set(prev).add(source.url));
    } catch (err: any) {
      alert("Failed to import: " + (err.response?.data?.details || err.message));
    } finally {
      setImportingUrls((prev) => {
        const next = new Set(prev);
        next.delete(source.url);
        return next;
      });
    }
  };

  const handleImportAll = async () => {
    if (!results || results.sources.length === 0) return;
    setIsImportingAll(true);
    for (const source of results.sources) {
      if (!importedUrls.has(source.url)) {
        // We call the individual import function to show per-item progress
        await handleImport(source);
      }
    }
    setIsImportingAll(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-neutral-900 rounded-[2.5rem] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-neutral-100 dark:border-neutral-800"
      >
        <div className="p-8 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Discover Web Sources</h3>
            <p className="text-[10px] font-black text-brand-primary mt-1 uppercase tracking-widest">Powered by Google Search Grounding</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-2 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 flex-1 overflow-y-auto space-y-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you want to research?" 
                className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-3xl py-5 pl-14 pr-6 text-sm font-bold outline-none text-neutral-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all" 
                required 
              />
            </div>
            <button 
              type="submit" 
              disabled={isSearching} 
              className="bg-brand-primary text-white px-8 rounded-3xl font-black uppercase tracking-widest text-[11px] hover:bg-brand-secondary transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSearching ? <><Loader2 size={14} className="animate-spin" /> Searching...</> : 'Discover'}
            </button>
          </form>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-xs font-bold border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          {results && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                <h4 className="text-[10px] font-black text-blue-600 dark:text-brand-primary mb-2 uppercase tracking-widest">AI Synthesis</h4>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">{results.summary}</p>
              </div>

              <div>
                 <div className="flex justify-between items-center mb-4">
                   <h4 className="text-[11px] font-black text-neutral-900 dark:text-white uppercase tracking-widest">Recommended Sources ({results.sources.length})</h4>
                   {results.sources.length > 0 && (
                     <button
                       onClick={handleImportAll}
                       disabled={isImportingAll || results.sources.every(s => importedUrls.has(s.url))}
                       className="text-[10px] font-black uppercase tracking-widest bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white px-4 py-2 rounded-xl hover:bg-brand-primary hover:text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
                     >
                       {isImportingAll ? <><Loader2 size={12} className="animate-spin" /> Importing All...</> : <><Plus size={12} /> Import All</>}
                     </button>
                   )}
                 </div>
                 <div className="space-y-3">
                   {results.sources.map((source, i) => {
                     const isImporting = importingUrls.has(source.url);
                     const isImported = importedUrls.has(source.url);
                     
                     return (
                       <div key={i} className="p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:border-brand-primary/30 transition-colors bg-white dark:bg-neutral-900 flex flex-col gap-3">
                         <div className="flex justify-between items-start gap-4">
                           <div className="flex-1 min-w-0">
                             <a href={source.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-neutral-900 dark:text-white hover:text-brand-primary transition-colors truncate block">
                               {source.title}
                             </a>
                             <p className="text-[10px] text-neutral-400 mt-1 truncate">{source.url}</p>
                           </div>
                           <button
                             onClick={() => handleImport(source)}
                             disabled={isImporting || isImported}
                             className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                               isImported ? 'bg-emerald-500/10 text-emerald-500' :
                               isImporting ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400' :
                               'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700'
                             }`}
                           >
                             {isImported ? <><Check size={12} /> Imported</> :
                              isImporting ? <><Loader2 size={12} className="animate-spin" /> Importing...</> :
                              <><Plus size={12} /> Import Source</>}
                           </button>
                         </div>
                         <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium line-clamp-2">
                           {source.snippet}
                         </p>
                       </div>
                     );
                   })}
                   
                   {results.sources.length === 0 && (
                     <p className="text-xs text-neutral-500 text-center py-8 font-medium">No web sources found with enough text content for extraction.</p>
                   )}
                 </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
