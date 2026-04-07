import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Download, FileText, Image as ImageIcon, Globe, FileDigit as PdfIcon, Maximize2 } from 'lucide-react';
import { useEffect } from 'react';

/**
 * High-fidelity source preview modal.
 * Handles Text, Image, PDF, and URL previews in a premium cinematic overlay.
 */
export default function SourcePreview() {
  const { previewSourceId, notebooks, masterSources, setPreviewSourceId } = useStore();
  
  // Find the source anywhere in the platform
  const allSources = [...(notebooks.flatMap(n => n.sources || [])), ...masterSources];
  const source = allSources.find(s => s.id === previewSourceId);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewSourceId(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [setPreviewSourceId]);

  if (!previewSourceId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-12 bg-neutral-950/90 backdrop-blur-xl"
        onClick={() => setPreviewSourceId(null)}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white dark:bg-neutral-900 w-full h-full rounded-[2.5rem] shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="h-20 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between px-8 shrink-0 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 text-brand-primary rounded-xl flex items-center justify-center shadow-sm">
                {source?.type === 'url' ? <Globe size={20} /> : 
                 source?.type === 'image' ? <ImageIcon size={20} /> : 
                 source?.type === 'pdf' ? <PdfIcon size={20} /> : 
                 <FileText size={20} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-neutral-900 dark:text-white truncate uppercase tracking-tight leading-none mb-1">
                  {source?.title || 'System Resource'}
                </h2>
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                  Asset Class: {source?.type || 'Unknown'} • Verified Node
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {source?.fileUrl && (
                <a 
                  href={source.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-3 text-neutral-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest"
                >
                  <ExternalLink size={18} />
                  <span className="hidden md:inline">Open Native</span>
                </a>
              )}
              <button 
                onClick={() => setPreviewSourceId(null)}
                className="p-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white rounded-2xl transition-all shadow-sm"
              >
                <X size={24} />
              </button>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-auto bg-neutral-50/30 dark:bg-black/20 p-8 flex flex-col items-center">
            {!source ? (
               <div className="h-full flex flex-col items-center justify-center text-neutral-400 gap-4">
                  <div className="w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">Querying Vault...</p>
               </div>
            ) : source.type === 'image' && source.fileUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <img 
                  src={source.fileUrl} 
                  alt={source.title} 
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800"
                />
              </div>
            ) : source.type === 'pdf' && source.fileUrl ? (
              <iframe 
                src={`${source.fileUrl}#toolbar=0`} 
                className="w-full h-full rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl"
                title={source.title}
              />
            ) : source.type === 'url' ? (
              <div className="w-full h-full space-y-6 max-w-4xl">
                 <div className="p-10 bg-white dark:bg-neutral-800 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-700 shadow-xl space-y-6">
                    <div className="flex items-center gap-3 text-blue-500 font-black text-xs uppercase tracking-widest">
                       <Globe size={16} /> Link Resource
                    </div>
                    <div className="text-neutral-900 dark:text-neutral-100 font-bold leading-[1.8] whitespace-pre-wrap text-base">
                       {source.content}
                    </div>
                 </div>
                 <a 
                  href={source.title.startsWith('http') ? source.title : '#'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-brand-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                >
                  <ExternalLink size={18} /> Visit Source
                </a>
              </div>
            ) : (
              <div className="w-full max-w-4xl bg-white dark:bg-neutral-800 rounded-[2.5rem] shadow-xl border border-neutral-200 dark:border-neutral-700 p-12 overflow-y-auto">
                <div className="prose dark:prose-invert max-w-none">
                   <div className="text-neutral-950 dark:text-neutral-50 font-medium leading-[2] whitespace-pre-wrap text-[15px]">
                      {source.content}
                   </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <footer className="h-12 border-t border-neutral-100 dark:border-neutral-800 px-8 flex items-center justify-between shrink-0 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">
             <div>Neural Artifact Identification: {source?.id.toUpperCase()}</div>
             <div className="flex items-center gap-4">
                <span>Safe to Process</span>
                <div className="w-2 h-2 rounded-full bg-green-500" />
             </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
