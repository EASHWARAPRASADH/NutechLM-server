import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import NotesArea from './NotesArea';
import { ArrowLeft, Wind, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Download, FileSpreadsheet, FileText, Share2, Home, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DarkModeToggle from './DarkModeToggle';
import { exportToExcel, exportToWord, exportToPdf } from '../lib/export';
import SourceViewer from './SourceViewer';
import GuideView from './GuideView';
import WelcomeSourceModal from './WelcomeSourceModal';

export default function NotebookView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notebooks, setActiveNotebook, currentUser, fetchNotebookDetails, isLoading, previewSourceId } = useStore();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'chat' | 'notes' | 'guide'>('chat');
  const [showWelcome, setShowWelcome] = useState(false);

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
    // Generate summary if we have sources but no research brief yet
    if (notebook && notebook.sources.length > 0 && (!notebook.description || notebook.description.trim() === "")) {
      console.log(`[NotebookView] Auto-triggering research brief for ${notebook.id}`);
      useStore.getState().generateNotebookSummary(notebook.id);
    }
    
    // Show welcome modal if no sources exist
    if (notebook && notebook.sources.length === 0 && !isLoading && !isLocalLoading) {
      setShowWelcome(true);
    }
  }, [notebook?.id, notebook?.sources.length, notebook?.description, isLoading, isLocalLoading]);

  if ((isLoading || isLocalLoading) && !notebook) {
     return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#f0f2f9]">
           <div className="w-10 h-10 border-2 border-black border-t-transparent rounded-full animate-spin mb-4" />
        </div>
     );
  }

  if (!notebook) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#f0f2f9]">
        <h2 className="text-xl font-bold mb-4">Notebook not found</h2>
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 font-bold hover:underline">
          Go back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-950 overflow-hidden selection:bg-blue-100 selection:text-blue-900 transition-colors duration-300">
      {/* Welcome Onboarding Modal */}
      <AnimatePresence>
        {showWelcome && (
          <WelcomeSourceModal 
            notebookId={notebook.id} 
            onClose={() => setShowWelcome(false)} 
          />
        )}
      </AnimatePresence>

      {/* NotebookLM Header */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 z-50 border-b border-neutral-100 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md cursor-pointer hover:scale-105 transition-transform" onClick={() => navigate('/dashboard')}>
             <Wind className="text-white" size={18} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-400 dark:text-neutral-500">NotebookLM</span>
            <span className="text-sm text-neutral-300 dark:text-neutral-700">/</span>
            <div className="flex items-center gap-1.5">
               <span className="text-base">{notebook.emoji || '📜'}</span>
               <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 tracking-tight">{notebook.title}</h1>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert('Notebook link copied to clipboard!');
            }}
            className="bg-blue-600 text-white px-5 py-1.5 rounded-full text-[13px] font-semibold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
          >
            <Share2 size={14} /> Share
          </button>
          
          <button 
            onClick={() => {
              const content = `# ${notebook.title}\n\n${notebook.description}\n\n## Sources\n${notebook.sources.map(s => `- ${s.title}`).join('\n')}`;
              const blob = new Blob([content], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${notebook.title}.md`;
              a.click();
            }}
            className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-all"
            title="Export Notebook"
          >
            <Download size={18} />
          </button>

          <DarkModeToggle />

          <div className="relative group">
            <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-500 dark:text-neutral-400 cursor-pointer overflow-hidden hover:ring-2 hover:ring-blue-100 transition-all">
               {currentUser?.avatarUrl ? (
                 <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
               ) : (
                 <span>{currentUser?.name?.substring(0, 2).toUpperCase() || 'U'}</span>
               )}
            </div>
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] py-2">
               <div className="px-4 py-2 border-b border-neutral-50 dark:border-neutral-800 mb-1">
                 <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 truncate">{currentUser?.name}</p>
                 <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{currentUser?.email}</p>
               </div>
               <button 
                 onClick={() => navigate('/dashboard')}
                 className="w-full px-4 py-2 text-left text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-2"
               >
                 <Home size={14} /> Dashboard
               </button>
               <button 
                 onClick={() => {
                   localStorage.removeItem('nutech-vault-token');
                   window.location.href = '/login';
                 }}
                 className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-900/20 flex items-center gap-2"
               >
                 <LogOut size={14} /> Sign Out
               </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-4 pt-0 min-h-0 overflow-hidden relative">
        {/* Left Column: Sources */}
        <div className={`flex flex-col h-full transition-all duration-300 ${isSidebarCollapsed ? 'w-12' : 'w-80'}`}>
          <div className="flex-1 notebook-card overflow-hidden flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-[2rem]">
            <Sidebar notebook={notebook} isCollapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
          </div>
        </div>

        {/* Middle Column: Chat/Notes/Guide Toggle Area */}
        <div className="flex-1 h-full notebook-card overflow-hidden flex flex-col relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm rounded-[2rem]">
          {/* Internal Tab Toggle - Centered to avoid overlap */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex bg-neutral-100/80 dark:bg-neutral-800/80 backdrop-blur-md p-1 rounded-full border border-neutral-200 dark:border-neutral-700 shadow-sm">
             {[
               { id: 'guide', label: 'Guide' },
               { id: 'chat', label: 'Chat' },
               { id: 'notes', label: 'Notes' }
             ].map((tab) => (
               <button 
                 key={tab.id}
                 onClick={() => setViewMode(tab.id as any)}
                 className={`px-4 py-1 rounded-full text-xs font-semibold transition-all ${viewMode === tab.id ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-white shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
               >
                 {tab.label}
               </button>
             ))}
          </div>

          <AnimatePresence mode="wait">
            {viewMode === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <ChatArea notebook={notebook} />
              </motion.div>
            )}
            {viewMode === 'notes' && (
              <motion.div 
                key="notes"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <NotesArea notebook={notebook} />
              </motion.div>
            )}
            {viewMode === 'guide' && (
              <motion.div 
                key="guide"
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <GuideView notebook={notebook} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Persistent Source Viewer */}
        <AnimatePresence>
          {previewSourceId && (
            <SourceViewer />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

