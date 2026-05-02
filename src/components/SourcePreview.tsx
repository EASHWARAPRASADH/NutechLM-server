import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Download, FileText, Image as ImageIcon, Globe, FileDigit as PdfIcon, Maximize2 } from 'lucide-react';
import { useEffect } from 'react';

/**
 * High-fidelity source preview modal.
 * Handles Text, Image, PDF, and URL previews in a premium cinematic overlay.
 */
export default function SourcePreview() {
  const { previewSourceId, notebooks, activeNotebookId, masterSources, setPreviewSourceId } = useStore();
  
  const activeNotebook = notebooks.find(n => n.id === activeNotebookId);
  const source = activeNotebook?.sources.find(s => s.id === previewSourceId) || 
                 masterSources.find(s => s.id === previewSourceId);

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
        className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm"
        onClick={() => setPreviewSourceId(null)}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white w-full h-full max-w-5xl max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="h-16 border-b border-neutral-100 flex items-center justify-between px-8 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                {source?.type === 'url' ? <Globe size={16} /> : 
                 source?.type === 'image' ? <ImageIcon size={16} /> : 
                 source?.type === 'pdf' ? <PdfIcon size={16} /> : 
                 <FileText size={16} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-neutral-800 truncate">
                  {source?.title || 'Source Preview'}
                </h2>
                <p className="text-[10px] text-neutral-400 font-medium">
                  {source?.type?.toUpperCase() || 'DOCUMENT'} SOURCE
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {source?.fileUrl && (
                <a 
                  href={source.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 text-neutral-500 hover:text-blue-600 transition-colors"
                >
                  <ExternalLink size={20} />
                </a>
              )}
              <button 
                onClick={() => setPreviewSourceId(null)}
                className="p-2 text-neutral-400 hover:text-neutral-800 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-auto bg-neutral-50 p-8 flex flex-col items-center">
            {!source ? (
               <div className="h-full flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
               </div>
            ) : source.type === 'image' && source.fileUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <img 
                  src={source.fileUrl} 
                  alt={source.title} 
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-neutral-200"
                />
              </div>
            ) : source.type === 'pdf' && source.fileUrl ? (
              <iframe 
                src={`${source.fileUrl}#toolbar=0`} 
                className="w-full h-full rounded-xl border border-neutral-200 shadow-lg"
                title={source.title}
              />
            ) : (
              <div className="w-full max-w-4xl bg-white rounded-3xl shadow-sm border border-neutral-100 p-10 overflow-y-auto">
                <div className="prose prose-neutral max-w-none">
                   <div className="text-neutral-700 font-medium leading-[1.8] whitespace-pre-wrap text-[14.5px]">
                      {source.content}
                   </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
