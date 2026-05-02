import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import NotesArea from './NotesArea';
import { ArrowLeft, Wind, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DarkModeToggle from './DarkModeToggle';
import { exportToExcel, exportToWord, exportToPdf } from '../lib/export';
import SourcePreview from './SourcePreview';

export default function NotebookView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notebooks, setActiveNotebook, currentUser, fetchNotebookDetails, isLoading } = useStore();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isLocalLoading, setIsLocalLoading] = useState(true);

  const notebook = notebooks.find((n) => n.id === id);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (!currentUser && !isLoading) {
      navigate('/login');
      return;
    }
    
    if (id) {
      setActiveNotebook(id);
      setIsLocalLoading(true);
      fetchNotebookDetails(id).finally(() => setIsLocalLoading(false));
    } else {
      setIsLocalLoading(false);
    }
    
    return () => setActiveNotebook(null);
  }, [id, setActiveNotebook, currentUser, navigate, fetchNotebookDetails, isLoading]);

  useEffect(() => {
    if (notebook && currentUser && !isAdmin && notebook.ownerId !== currentUser.id) {
       navigate('/dashboard');
    }
    
    // Auto-summary trigger: If we enter a notebook that already has sources, trigger brief generation
    if (notebook && notebook.sources.length > 0 && !notebook.description) {
      console.log(`[NotebookView] Auto-triggering summary for notebook: ${notebook.id}`);
      useStore.getState().generateNotebookSummary(notebook.id);
    }
  }, [notebook?.id, notebook?.title, notebook?.sources.length, currentUser, isAdmin, navigate]);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!isExportOpen) return;
    const handleClick = () => setIsExportOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isExportOpen]);

  if ((isLoading || isLocalLoading) && !notebook) {
     return (
        <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-neutral-950">
           <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
           <p className="text-xs font-black uppercase tracking-[0.3em] text-neutral-400">Initializing Neural Session...</p>
        </div>
     );
  }

  if (!notebook) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-neutral-950 transition-colors duration-300">
        <Wind className="text-brand-primary mb-4 animate-pulse" size={48} />
        <h2 className="text-2xl font-bold tracking-tighter mb-4 text-neutral-900 dark:text-white">Notebook not found</h2>
        <button onClick={() => navigate('/dashboard')} className="text-brand-primary hover:text-blue-700 font-bold transition-colors">
          Go back to dashboard
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex h-screen overflow-hidden bg-white dark:bg-neutral-950 transition-colors duration-300"
    >
      <AnimatePresence mode="wait">
        {!isSidebarCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="overflow-hidden"
          >
            <Sidebar notebook={notebook} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.main 
        layout
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.5, delay: 0.1 }}
        className="flex-1 flex flex-col min-w-0 bg-white dark:bg-neutral-900 shadow-xl shadow-neutral-200/50 dark:shadow-black/50 z-10 rounded-t-[2rem] mt-2 mx-2 border border-neutral-200 dark:border-neutral-800 overflow-hidden"
      >
        <header className="h-14 border-b border-neutral-100 dark:border-neutral-800 flex items-center px-4 shrink-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-1 mr-2">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/dashboard')}
              className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              title={isSidebarCollapsed ? "Open Sidebar" : "Close Sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </motion.button>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold tracking-tighter text-neutral-800 dark:text-white uppercase text-sm">{notebook.title}</h1>
          </div>
          
          <div className="ml-auto flex items-center gap-2">
            {/* Export Dropdown */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={(e) => { e.stopPropagation(); setIsExportOpen(!isExportOpen); }}
                className={`p-2 rounded-full transition-colors flex items-center gap-1.5 ${
                  isExportOpen
                    ? 'bg-blue-100 dark:bg-brand-primary/30 text-brand-primary'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
                title="Export Notebook"
              >
                <Download size={18} />
              </motion.button>

              <AnimatePresence>
                {isExportOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 top-[calc(100%+6px)] w-56 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-3 z-[100]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-2 px-2">Export As</p>
                    <button
                      onClick={() => { exportToExcel(notebook); setIsExportOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold hover:bg-green-50 dark:hover:bg-green-900/10 text-neutral-700 dark:text-neutral-300 hover:text-green-700 dark:hover:text-green-400 transition-all"
                    >
                      <FileSpreadsheet size={16} className="text-green-600" />
                      Excel Spreadsheet (.xlsx)
                    </button>
                    <button
                      onClick={() => { exportToWord(notebook); setIsExportOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-900/10 text-neutral-700 dark:text-neutral-300 hover:text-blue-700 dark:hover:text-blue-400 transition-all"
                    >
                      <FileText size={16} className="text-brand-primary" />
                      Word Document (.doc)
                    </button>
                    <button
                      onClick={() => { exportToPdf(notebook); setIsExportOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold hover:bg-purple-50 dark:hover:bg-purple-900/10 text-neutral-700 dark:text-neutral-300 hover:text-purple-700 dark:hover:text-purple-400 transition-all"
                    >
                      <FileText size={16} className="text-purple-600" />
                      PDF Document (.pdf)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <DarkModeToggle />
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setIsNotesCollapsed(!isNotesCollapsed)}
              className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              title={isNotesCollapsed ? "Open Notes" : "Close Notes"}
            >
              {isNotesCollapsed ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
            </motion.button>
          </div>
        </header>

        <ChatArea notebook={notebook} />
      </motion.main>

      <AnimatePresence mode="wait">
        {!isNotesCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="overflow-hidden"
          >
            <NotesArea notebook={notebook} />
          </motion.div>
        )}
      </AnimatePresence>
      <SourcePreview />
    </motion.div>
  );
}
