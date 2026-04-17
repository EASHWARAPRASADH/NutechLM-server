import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Notebook, Note } from '../types';
import { useStore } from '../store';
import { Plus, Trash2, X, FileText, FilePlus, Edit2, CheckCircle2, RotateCcw, Combine, Loader2, Mic, MicOff, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { generateNotesSummary } from '../lib/ai';
import { useVoice } from '../hooks/useVoice';

export default function NotesArea({ notebook }: { notebook: Notebook }) {
  const { addNote, deleteNote, addSource, updateNote } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [refreshingSummaryId, setRefreshingSummaryId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const { isRecording, toggle, isSupported } = useVoice((text) => setContent(text));

  const handleConvertToSource = async (note: any) => {
    await addSource(notebook.id, {
      title: note.title,
      content: note.content,
      type: 'text',
    });
    await deleteNote(notebook.id, note.id);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    
    if (editNoteId) {
      await updateNote(notebook.id, editNoteId, { title: title.trim(), content: content.trim() });
    } else {
      await addNote(notebook.id, {
        title: title.trim(),
        content: content.trim(),
      });
    }
    
    setTitle('');
    setContent('');
    setIsAdding(false);
    setEditNoteId(null);
  };

  const handleEditNote = (note: Note) => {
    setTitle(note.title);
    setContent(note.content);
    setEditNoteId(note.id);
    setIsAdding(true);
  };

  const toggleSelectNote = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSummarizeSelected = async () => {
    const selectedNotes = notebook.notes.filter(n => selectedIds.includes(n.id));
    if (selectedNotes.length < 2) return;

    setIsSummarizing(true);
    try {
      const summary = await generateNotesSummary(selectedNotes);
      await addNote(notebook.id, {
        title: `Intelligence Synthesis (${selectedNotes.length} nodes)`,
        content: summary
      });
      setSelectedIds([]);
    } catch (error) {
      console.error('Summarization error:', error);
      alert('Failed to generate summary');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (window.confirm(`Purge ${selectedIds.length} intelligence nodes from vault?`)) {
      for (const id of selectedIds) {
        await deleteNote(notebook.id, id);
      }
      setSelectedIds([]);
    }
  };

  const handleRefreshSummary = async (note: Note) => {
    setRefreshingSummaryId(note.id);
    try {
      const allNotes = notebook.notes.filter(n => n.id !== note.id);
      const sourcesAsNotes = notebook.sources.map(s => ({ title: s.title, content: s.content }));
      const combined = [...allNotes, ...sourcesAsNotes];
      if (combined.length === 0) {
        alert('No sources or notes available for re-synthesis.');
        return;
      }
      const summary = await generateNotesSummary(combined);
      await updateNote(notebook.id, note.id, { content: summary });
    } catch (error) {
      console.error('Re-synthesis error:', error);
      alert('Failed to refresh summary.');
    } finally {
      setRefreshingSummaryId(null);
    }
  };

  return (
    <motion.aside 
      initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
      className="w-80 flex flex-col h-full bg-neutral-50 dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800 z-0 transition-colors duration-300"
    >
      {/* Notes Section */}
      <div className="p-6 flex items-center justify-between">
        <h2 className="font-black text-neutral-800 dark:text-white uppercase text-[10px] tracking-[0.3em]">Neural Assets</h2>
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => setIsAdding(true)}
          className="p-2 bg-neutral-900 dark:bg-white shadow-xl rounded-full text-white dark:text-neutral-900"
        >
          <Plus size={16} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {notebook.notes.map((note) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: selectedIds.includes(note.id) ? 1.02 : 1,
                borderColor: selectedIds.includes(note.id) ? '#3b82f6' : undefined,
              }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              key={note.id}
              onClick={() => selectedIds.length > 0 && toggleSelectNote(note.id)}
              className={`group bg-white dark:bg-neutral-900 rounded-[1.5rem] border p-6 hover:shadow-xl transition-all relative cursor-pointer ${
                selectedIds.includes(note.id) 
                  ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-lg' 
                  : 'border-neutral-200 dark:border-neutral-800 shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-black text-xs text-neutral-900 dark:text-white pr-6 leading-tight uppercase tracking-tight line-clamp-2">{note.title}</h3>
                {selectedIds.includes(note.id) && (
                  <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
                )}
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap line-clamp-4 leading-loose">{note.content}</p>
              <div className="mt-6 flex items-center justify-between">
                <div className="text-[9px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-800 px-2.5 py-1 rounded-lg">
                   <FileText size={10} />
                   {format(Number(note.createdAt || Date.now()), 'MMM d, h:mm a')}
                </div>
                
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelectNote(note.id); }}
                  className={`p-1.5 rounded-lg transition-colors ${selectedIds.includes(note.id) ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 opacity-0 group-hover:opacity-100'}`}
                >
                  <CheckCircle2 size={12} />
                </button>
              </div>

              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditNote(note); }}
                  className="p-2 text-neutral-400 hover:text-amber-500 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm"
                  title="Modify Hub"
                >
                  <Edit2 size={12} />
                </button>
                {note.title.includes('Synthesis') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRefreshSummary(note); }}
                    disabled={refreshingSummaryId === note.id}
                    className={`p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm ${refreshingSummaryId === note.id ? 'text-blue-500 animate-spin' : 'text-neutral-400 hover:text-blue-500'}`}
                    title="Refresh Summary"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleConvertToSource(note); }}
                  className="p-2 text-neutral-400 hover:text-blue-500 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm"
                  title="Source Promotion"
                >
                  <FilePlus size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if(confirm('Revoke intelligence node?')) deleteNote(notebook.id, note.id); }}
                  className="p-2 text-neutral-400 hover:text-red-500 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-sm"
                  title="Purge Node"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {notebook.notes.length === 0 && !isAdding && (
          <div className="text-center py-20">
            <Combine size={32} className="mx-auto text-neutral-200 dark:text-neutral-800 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Vault Nodes Empty</p>
          </div>
        )}
      </div>

      {/* Floating Selection Toolbar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-6 py-4 rounded-[2rem] shadow-2xl flex items-center gap-6 z-50 whitespace-nowrap border border-neutral-800 dark:border-neutral-200"
          >
            <div className="flex items-center gap-3 pr-6 border-r border-neutral-700 dark:border-neutral-200">
              <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-1 rounded-md min-w-[24px] text-center">
                {selectedIds.length}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest">Active nodes</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSummarizeSelected}
                disabled={selectedIds.length < 2 || isSummarizing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/5 dark:hover:bg-black/5 transition-colors text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
              >
                {isSummarizing ? <Loader2 size={12} className="animate-spin" /> : <Combine size={12} />}
                Synthesize
              </button>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-red-500/20 text-red-400 dark:text-red-500 transition-colors text-[10px] font-black uppercase tracking-widest"
              >
                <Trash2 size={12} />
                Purge
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/5 dark:hover:bg-black/5 transition-colors text-[10px] font-black uppercase tracking-widest"
              >
                <RotateCcw size={12} />
                Release
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {isAdding && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white dark:bg-neutral-900 rounded-[2.5rem] shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] border border-neutral-100 dark:border-neutral-800 relative overflow-hidden"
              >
                <div className="flex items-center justify-between p-8 border-b border-neutral-100 dark:border-neutral-800">
                  <h3 className="font-black text-xl text-neutral-900 dark:text-white uppercase tracking-tight">{editNoteId ? 'Modify Hub' : 'Register Node'}</h3>
                  <button onClick={() => { setIsAdding(false); setEditNoteId(null); setTitle(''); setContent(''); }} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 p-2 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleAddNote} className="p-8 flex flex-col gap-6 overflow-y-auto">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-2">Node Identifier</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-800 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:border-blue-500 transition-all dark:text-white placeholder-neutral-300 dark:placeholder-neutral-600"
                      placeholder="Note title"
                    />
                  </div>
  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-2 flex items-center justify-between">
                      <span>Node Content</span>
                      {isSupported && (
                        <button 
                          type="button"
                          onClick={toggle}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-lg' : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-blue-100 dark:border-blue-900/50'}`}
                        >
                          {isRecording ? <MicOff size={10} /> : <Mic size={10} />}
                          <span className="text-[9px] font-black uppercase">{isRecording ? 'Terminate' : 'Dictate'}</span>
                        </button>
                      )}
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-800 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:border-blue-500 transition-all dark:text-white min-h-[180px] resize-none placeholder-neutral-300 dark:placeholder-neutral-600"
                      placeholder="Input intelligence..."
                    />
                  </div>
  
                  <div className="flex justify-end pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={!title.trim() || !content.trim()}
                      className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-2xl"
                    >
                      Commit Node
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.aside>
  );
}
