import { X, ExternalLink, Copy, Search, ChevronUp, ChevronDown, Anchor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Persistent Right-Pane Source Viewer
 * Provides side-by-side document inspection with citation anchoring.
 */
export default function SourceViewer() {
  const { notebooks, activeNotebookId, previewSourceId, setPreviewSourceId } = useStore();
  const notebook = notebooks.find(n => n.id === activeNotebookId);
  const source = notebook?.sources.find(s => s.id === previewSourceId);

  if (!previewSourceId) return null;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      className="w-[450px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 flex flex-col h-full shadow-2xl z-[70] transition-colors duration-300"
    >
      {/* Header */}
      <header className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0">
             <Anchor size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="overflow-hidden">
             <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 truncate">{source?.title || 'Loading Source...'}</h2>
             <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">Document Inspector</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setPreviewSourceId(null)}
            className="p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors text-neutral-500 dark:text-neutral-400"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-4 py-2 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
         <div className="flex items-center gap-2">
            <button className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md text-neutral-500 dark:text-neutral-400 transition-all" title="Previous occurrence">
               <ChevronUp size={16} />
            </button>
            <button className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md text-neutral-500 dark:text-neutral-400 transition-all" title="Next occurrence">
               <ChevronDown size={16} />
            </button>
            <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1" />
            <span className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500">1 of 1 citations</span>
         </div>
         
         <div className="flex items-center gap-2">
            <button 
               onClick={() => {
                  if (source?.content) {
                     navigator.clipboard.writeText(source.content);
                     alert('Source content copied!');
                  }
               }}
               className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-300 transition-all"
            >
               <Copy size={14} />
               <span className="text-[11px] font-bold uppercase tracking-wider">Copy</span>
            </button>
         </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8 prose prose-neutral dark:prose-invert prose-sm max-w-none bg-neutral-50/30 dark:bg-neutral-950/30">
        {!source ? (
           <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">Synchronizing Document...</p>
           </div>
        ) : (
          <div className="dark:text-neutral-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {source.content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <footer className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
         <div className="flex items-center justify-between text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            <span>Uploaded: {source ? new Date(source.createdAt).toLocaleDateString() : '--'}</span>
            <span className="text-blue-600 dark:text-blue-400">Secure Neural Indexing Active</span>
         </div>
      </footer>
    </motion.div>
  );
}
