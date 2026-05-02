import React, { useState } from 'react';
import axios from 'axios';
import { Notebook, Note } from '../types';
import { useStore } from '../store';
import { Plus, Trash2, X, FileText, FilePlus, Edit2, CheckCircle2, Combine, Loader2, Mic, MicOff, Copy, Download } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useVoice } from '../hooks/useVoice';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutech-vault-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function NotesArea({ notebook }: { notebook: Notebook }) {
  const { addNote, deleteNote, addSource, updateNote } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<string | null>(null);

  const { isRecording, toggle, isSupported } = useVoice((text) => setContent(text));

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

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNoteIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSynthesize = async () => {
    if (selectedNoteIds.length < 2) return;
    setIsSynthesizing(true);
    try {
      const res = await api.post('/ai/synthesize-notes', { noteIds: selectedNoteIds });
      setSynthesisResult(res.data.synthesis);
    } catch (e) {
      console.error('Synthesis failed', e);
      alert('Failed to synthesize research notes.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-neutral-900">
      {/* Notes Header */}
      <div className="p-5 flex items-center justify-between shrink-0 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/20 dark:bg-neutral-800/20">
        <div className="flex items-center gap-4">
           <h2 className="text-sm font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.2em]">Research Workbench</h2>
           {selectedNoteIds.length > 0 && (
              <span className="text-[11px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full animate-in fade-in slide-in-from-left-2">
                {selectedNoteIds.length} Selected
              </span>
           )}
        </div>
        <div className="flex items-center gap-3">
           {selectedNoteIds.length >= 2 && (
              <button 
                onClick={handleSynthesize}
                disabled={isSynthesizing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-blue-200 dark:shadow-blue-900/20 animate-in zoom-in-95"
              >
                {isSynthesizing ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />}
                Synthesize Research
              </button>
           )}
           <button 
             onClick={() => setIsAdding(true)}
             className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-2"
           >
             <Plus size={14} /> New note
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-10 scroll-smooth custom-scrollbar">
        {/* Notebook Summary Block */}
        <div className="max-w-4xl mx-auto pt-10">
          <div className="text-5xl mb-6">{notebook.emoji || '📜'}</div>
          <h1 className="text-4xl font-black text-neutral-900 dark:text-white mb-2 leading-tight tracking-tight">
            {notebook.title}
          </h1>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-black uppercase tracking-[0.3em] mb-10">
            {notebook.sources.length} SOURCES · {notebook.notes.length} SAVED NOTES
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {notebook.notes.map((note) => (
               <motion.div
                 layout
                 key={note.id}
                 onClick={() => handleEditNote(note)}
                 className={`bg-white dark:bg-neutral-800 rounded-[2rem] border-2 p-8 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative ${
                   selectedNoteIds.includes(note.id) ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/20' : 'border-neutral-100 dark:border-neutral-800'
                 }`}
               >
                 {/* Selection Checkbox */}
                 <button 
                   onClick={(e) => toggleSelect(note.id, e)}
                   className={`absolute -top-3 -left-3 w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-md z-10 ${
                     selectedNoteIds.includes(note.id) ? 'bg-blue-600 text-white scale-110 rotate-0' : 'bg-white dark:bg-neutral-900 text-neutral-200 dark:text-neutral-700 border-2 border-neutral-100 dark:border-neutral-800 hover:border-blue-300 opacity-0 group-hover:opacity-100 rotate-12 hover:rotate-0'
                   }`}
                 >
                   <CheckCircle2 size={18} />
                 </button>

                 <h3 className="text-base font-black text-neutral-800 dark:text-neutral-100 mb-4 pr-8 leading-tight">{note.title}</h3>
                 <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-6 leading-relaxed font-medium">{note.content}</p>
                 
                 <div className="mt-8 pt-6 border-t border-neutral-50 dark:border-neutral-700 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">{format(Number(note.createdAt || Date.now()), 'd MMM, HH:mm')}</span>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            addSource(notebook.id, { title: note.title, content: note.content, type: 'text' });
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all"
                        >
                          <Combine size={12} /> Promote
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteNote(notebook.id, note.id); }}
                          className="p-2 text-neutral-300 dark:text-neutral-600 hover:text-red-500 transition-all hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                     </div>
                  </div>
               </motion.div>
             ))}

             {notebook.notes.length === 0 && (
               <div className="col-span-full py-32 text-center border-4 border-dashed border-neutral-50 dark:border-neutral-800/50 rounded-[3rem]">
                  <FileText className="mx-auto text-neutral-100 dark:text-neutral-800 mb-6" size={64} />
                  <p className="text-sm font-black text-neutral-300 dark:text-neutral-700 uppercase tracking-widest">No research notes captured yet</p>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Synthesis Result Modal */}
      <AnimatePresence>
        {synthesisResult && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-8">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white dark:bg-neutral-900 rounded-[3.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden border border-neutral-200 dark:border-neutral-800"
            >
               <header className="p-10 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-800/50">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/20">
                        <Combine size={24} />
                     </div>
                     <div>
                        <h2 className="text-xl font-black text-neutral-900 dark:text-white">Synthesized Research Report</h2>
                        <p className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mt-1">AI Synthesis Pipeline • {selectedNoteIds.length} Nodes Merged</p>
                     </div>
                  </div>
                  <button onClick={() => setSynthesisResult(null)} className="p-3 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-2xl transition-all text-neutral-400 dark:text-neutral-500"><X size={24} /></button>
               </header>
               
               <div className="flex-1 overflow-y-auto p-12 prose prose-sm prose-neutral max-w-none custom-scrollbar selection:bg-blue-100 dark:selection:bg-blue-900/30">
                  <div className="text-neutral-700 dark:text-neutral-300 leading-loose text-sm whitespace-pre-wrap font-medium">
                     {synthesisResult}
                  </div>
               </div>
               
               <footer className="p-8 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(synthesisResult);
                      alert('Synthesis copied!');
                    }}
                    className="flex items-center gap-2 px-6 py-3 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-2xl transition-all text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400"
                  >
                    <Copy size={16} /> Copy Text
                  </button>
                  <button 
                    onClick={() => {
                      addSource(notebook.id, { title: `Synthesis: ${notebook.title}`, content: synthesisResult, type: 'text' });
                      setSynthesisResult(null);
                      setSelectedNoteIds([]);
                      alert('Synthesis promoted to source!');
                    }}
                    className="bg-blue-600 text-white px-10 py-4 rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center gap-3"
                  >
                    <FilePlus size={18} /> Promote to Source
                  </button>
               </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Note Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-8">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-neutral-900 rounded-[3.5rem] shadow-2xl p-12 max-w-2xl w-full border border-neutral-100 dark:border-neutral-800"
            >
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight">{editNoteId ? 'Refine Insight' : 'Capture Insight'}</h3>
                <button onClick={() => { setIsAdding(false); setEditNoteId(null); setTitle(''); setContent(''); }} className="text-neutral-300 dark:text-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-200 transition-all"><X size={28} /></button>
              </div>
              
              <div className="space-y-8">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-transparent focus:border-blue-100 dark:focus:border-blue-900 rounded-2xl py-5 px-8 text-sm font-black text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 outline-none transition-all"
                />
                <div className="relative">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Note content..."
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-transparent focus:border-blue-100 dark:focus:border-blue-900 rounded-[2.5rem] py-8 px-8 text-sm font-medium text-neutral-600 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 outline-none min-h-[350px] resize-none transition-all leading-relaxed"
                  />
                  {isSupported && (
                    <button 
                      onClick={toggle}
                      className={`absolute bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl transition-all flex items-center justify-center ${isRecording ? 'bg-red-500 text-white scale-110 animate-pulse' : 'bg-white dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 hover:text-blue-500 dark:hover:text-blue-400 border border-neutral-100 dark:border-neutral-800'}`}
                    >
                      {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-12 flex justify-end">
                <button 
                  onClick={handleAddNote}
                  disabled={!title.trim() || !content.trim()}
                  className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-12 py-5 rounded-full font-black text-xs uppercase tracking-[0.2em] hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-all shadow-2xl disabled:opacity-30 disabled:scale-100"
                >
                  {editNoteId ? 'Update Insight' : 'Commit Note'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
