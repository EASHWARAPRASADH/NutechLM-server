import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Plus, Book, Trash2, Wind, LogOut, Search, Filter, Shield, User, Edit3, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import DarkModeToggle from './DarkModeToggle';
import Footer from './Footer';

export default function Dashboard() {
  const { notebooks, createNotebook, updateNotebook, deleteNotebook, currentUser, isGuest, logout, platformSettings } = useStore();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'sources'>('updated');

  const isAdmin = currentUser?.role === 'admin';

  const userNotebooks = useMemo(() => {
    return notebooks
      .filter(n => n.title.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'sources') return ((b as any).sourcesCount || 0) - ((a as any).sourcesCount || 0);
        return b.updatedAt - a.updatedAt;
      });
  }, [notebooks, searchTerm, sortBy]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createNotebook(newTitle.trim());
    setNewTitle('');
    setIsCreating(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors duration-300">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
        className="max-w-7xl mx-auto px-6 py-12 md:py-20 lg:px-12"
      >
        <header className="mb-12 md:mb-20 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {(currentUser?.customLogoUrl || platformSettings.logoUrl) ? (
                <img src={currentUser?.customLogoUrl || platformSettings.logoUrl} alt="Logo" className="w-10 h-10 rounded-xl shadow-xl object-contain" />
              ) : (
                <motion.div 
                  whileHover={{ rotate: 180 }}
                  className="w-10 h-10 bg-neutral-900 dark:bg-white rounded-xl flex items-center justify-center shadow-xl text-white dark:text-neutral-900"
                >
                  <Wind size={24} />
                </motion.div>
              )}
              <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">{platformSettings.platformName}</h1>
              {isAdmin && (
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-brand-primary/20 text-[9px] font-black uppercase tracking-widest text-brand-primary rounded-md border border-blue-100 dark:border-brand-primary/30">
                  SYSTEM ADMIN
                </span>
              )}
              {isGuest && (
                <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-500/20 text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 rounded-md border border-amber-100 dark:border-amber-500/30">
                  GUEST EXPLORER
                </span>
              )}
            </div>
            <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-neutral-900 dark:text-white">
              {platformSettings.platformTagline.split(' ')[0] || 'Research'} <br />
              <span className="text-neutral-300 dark:text-neutral-700">{platformSettings.platformTagline.split(' ').slice(1).join(' ') || 'Studio'}.</span>
            </h2>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative group flex-1 md:flex-none">
              <div className="flex items-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl shadow-black/5 hover:border-blue-500/50 transition-all focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 overflow-hidden w-full md:w-96">
                <div className="pl-4 text-neutral-400 group-focus-within:text-blue-500 transition-colors">
                  <Search size={18} />
                </div>
                <input 
                  type="text" 
                  placeholder="Search notebooks, sources..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 bg-transparent border-none py-4 px-3 text-sm focus:outline-none dark:text-white font-medium"
                />
                <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-800" />
                <div className="relative">
                  <button 
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-2 ${sortBy !== 'updated' ? 'text-brand-primary' : 'text-neutral-400'}`}
                  >
                    <Filter size={18} />
                  </button>

                  <AnimatePresence>
                    {isFilterOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-[calc(100%+8px)] w-64 bg-white dark:bg-neutral-900 rounded-[2rem] shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 z-[100] backdrop-blur-2xl"
                      >
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4 px-1">Sort Logic</p>
                        <div className="space-y-1">
                          {[
                            { id: 'updated', label: 'Recently Modified' },
                            { id: 'title', label: 'Alphabetical Order' },
                            { id: 'sources', label: 'Resource Density' },
                          ].map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => { setSortBy(opt.id as any); setIsFilterOpen(false); }}
                              className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${sortBy === opt.id ? 'bg-brand-primary text-white shadow-lg' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DarkModeToggle />
              {isAdmin && (
                <button 
                  onClick={() => navigate('/admin')}
                  className="p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl shadow-black/5 hover:bg-blue-50 dark:hover:bg-brand-primary/10 text-brand-primary transition-all flex items-center gap-2 font-black uppercase tracking-widest text-[10px]"
                >
                  <Shield size={18} />
                  Oversight
                </button>
              )}
              <button 
                onClick={() => isGuest ? alert("Sign in to provision your own research assets.") : setIsCreating(true)}
                className={`px-8 py-4 ${isGuest ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed opacity-50' : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-2xl'} rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl flex items-center gap-3 shrink-0`}
              >
                <Plus size={18} />
                New Asset
              </button>
              <button 
                onClick={() => { logout(); navigate('/'); }}
                className="p-4 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-2xl transition-all"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

      <AnimatePresence>
        {isCreating && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="bg-white dark:bg-neutral-900 p-6 rounded-3xl shadow-2xl w-full max-w-md border border-neutral-100 dark:border-neutral-800"
            >
              <h2 className="text-xl font-medium mb-4 text-neutral-900 dark:text-white">Create new notebook</h2>
              <form onSubmit={handleCreate}>
                <input
                  type="text"
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Notebook title..."
                  className="w-full border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-neutral-50/50 dark:bg-neutral-800/50 text-neutral-900 dark:text-white"
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium transition-colors rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTitle.trim()}
                    className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-6 py-2 rounded-xl disabled:opacity-50 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
                  >
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.05 } }
        }}
        initial="hidden" animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <AnimatePresence mode="popLayout">
          {userNotebooks.map((notebook) => (
            <motion.div
              layout
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 }
              }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              key={notebook.id}
              onClick={() => navigate(`/notebook/${notebook.id}`)}
              className="group bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 hover:shadow-xl hover:shadow-neutral-200/50 dark:hover:shadow-black/50 transition-all cursor-pointer relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 dark:bg-brand-primary/30 text-brand-primary dark:text-blue-400 rounded-2xl">
                  <Book size={24} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      (e.currentTarget.closest('.group')?.querySelector('h3') as HTMLElement)?.focus();
                    }}
                    className="p-2 text-neutral-400 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full"
                    title="Rename Notebook"
                  >
                    <Edit3 size={18} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Terminate asset "${notebook.title}"?`)) {
                        await deleteNotebook(notebook.id);
                      }
                    }}
                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full"
                    title="Delete Notebook"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <h3 
                className="text-lg font-medium mb-2 text-neutral-900 dark:text-white outline-none cursor-text hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 -ml-1 transition-colors"
                contentEditable
                suppressContentEditableWarning
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
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
              </h3>
              {isAdmin && notebook.ownerId !== currentUser?.id && (
                <div className="flex items-center gap-1.5 mb-3 text-[10px] font-black text-brand-accent uppercase tracking-widest bg-brand-accent/10 px-2 py-1 rounded-lg w-fit">
                  <User size={10} />
                  <span>{notebook.ownerId}</span>
                </div>
              )}
              <div className="text-sm text-neutral-500 dark:text-neutral-400 flex justify-between items-center">
                <span className="bg-brand-accent/10 text-brand-accent font-black text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-lg border border-brand-accent/20">{(notebook as any).sourcesCount || 0} resources</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{format(notebook.updatedAt, 'MMM d, yyyy')}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {(userNotebooks.length === 0 || isGuest) && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="col-span-full border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-[3rem] p-20 flex flex-col items-center justify-center text-center space-y-6 bg-white/50 dark:bg-neutral-900/30"
          >
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 text-brand-primary rounded-[2.5rem] flex items-center justify-center shadow-inner">
               <Globe size={40} />
            </div>
            <div className="max-w-md space-y-2">
               <h3 className="text-xl font-black uppercase tracking-tight">Public Intelligence Hub</h3>
               <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium italic">
                  {isGuest 
                    ? "Welcome, Researcher. You are in read-only mode. Explore global intelligence nodes via the sidebar or initialize a notebook to begin custom research." 
                    : "Your neural archive is empty. Initialize your first asset to begin the research cycle."}
               </p>
            </div>
            {isGuest && (
               <button 
                  onClick={() => logout()}
                  className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-105 transition-all"
               >
                  Sign In for Full Access
               </button>
            )}
          </motion.div>
        )}
      </motion.div>
      </motion.div>
      <Footer />
    </div>
  );
}
