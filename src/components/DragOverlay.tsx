import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import { FileText, Link as LinkIcon, Image as ImageIcon, FileDigit as PdfIcon } from 'lucide-react';

export default function DragOverlay() {
  const { draggedSource } = useStore();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (!draggedSource) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1,
          x: mousePos.x + 5, 
          y: mousePos.y + 5 
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 800, mass: 0.1 }}
        className="absolute"
      >
        <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-2 border-blue-500 shadow-2xl rounded-2xl p-4 min-w-[180px] max-w-[240px] flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-500 shrink-0">
            {draggedSource.type === 'url' ? <LinkIcon size={18} /> : 
             draggedSource.type === 'image' ? <ImageIcon size={18} /> : 
             draggedSource.type === 'pdf' ? <PdfIcon size={18} /> : 
             <FileText size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
              {draggedSource.title}
            </p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
              Source Tag
            </p>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
