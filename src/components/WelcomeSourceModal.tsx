import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Globe, FileUp, Youtube, 
  Link as LinkIcon, FileText, X, ArrowRight, 
  Cloud, Copy, Loader2, Sparkles, HardDrive
} from 'lucide-react';
import { useStore } from '../store';
import axios from 'axios';

interface WelcomeSourceModalProps {
  notebookId: string;
  onClose: () => void;
}

export default function WelcomeSourceModal({ notebookId, onClose }: WelcomeSourceModalProps) {
  const { addSource, addWebSource } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const token = localStorage.getItem('nutech-vault-token');
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axios.post('/api/upload', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        await addSource(notebookId, {
          title: res.data.title || file.name,
          content: res.data.content,
          type: res.data.type,
          fileUrl: res.data.fileUrl
        });
      }
      onClose();
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleWebResearch = async () => {
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    try {
      const token = localStorage.getItem('nutech-vault-token');
      const res = await axios.post('/api/ai/search', { query: searchQuery }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Add the synthesized research as a first source
      await addSource(notebookId, {
        title: `Research: ${searchQuery}`,
        content: res.data.summary,
        type: 'url'
      });
      onClose();
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/60 dark:bg-neutral-950/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 transition-colors duration-300">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden relative"
      >
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-neutral-300 dark:text-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-200 p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-full transition-all z-10"
        >
          <X size={20} />
        </button>

        <div className="p-10 flex flex-col items-center text-center space-y-10">
          {/* Header */}
          <div className="space-y-3">
            <h1 className="text-2xl md:text-3xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
              Create Audio and Video Overviews from<br/>
              <span className="text-blue-600 dark:text-blue-400">YouTube videos</span>
            </h1>
          </div>

          {/* Search Box */}
          <div className="w-full relative group">
            <div className="absolute -inset-1 bg-blue-600/10 rounded-3xl opacity-20 group-hover:opacity-40 blur transition duration-1000"></div>
            <div className="relative bg-[#f8f9fa] dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700 rounded-3xl p-3 flex flex-col gap-3">
               <div className="flex items-center gap-3 px-3">
                  <Search className="text-neutral-400 dark:text-neutral-500" size={18} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleWebResearch()}
                    placeholder="Search the web for new sources"
                    className="bg-transparent border-none outline-none text-base text-neutral-800 dark:text-white w-full placeholder:text-neutral-300 dark:placeholder:text-neutral-600 font-medium"
                  />
               </div>
               <div className="flex items-center justify-between">
                  <div className="flex gap-2 px-1">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-full text-[10px] font-bold text-neutral-500 dark:text-neutral-400 shadow-sm">
                       <Globe size={12} />
                       Web
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-full text-[10px] font-bold text-neutral-500 dark:text-neutral-400 shadow-sm">
                       <Sparkles size={12} className="text-blue-600 dark:text-blue-400" />
                       Fast research
                    </div>
                  </div>
                  <button 
                    onClick={handleWebResearch}
                    disabled={!searchQuery.trim() || isSearching}
                    className="w-8 h-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 hover:bg-black dark:hover:bg-white text-neutral-400 hover:text-white dark:hover:text-black rounded-full flex items-center justify-center transition-all disabled:opacity-30 shadow-sm"
                  >
                    {isSearching ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={18} />}
                  </button>
               </div>
            </div>
          </div>

          {/* Drop Area */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-[16/5] border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-blue-500/50 dark:hover:border-blue-400/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all cursor-pointer group"
          >
             <p className="text-lg font-medium text-neutral-500 dark:text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">or drop your files</p>
             <p className="text-[10px] text-neutral-400 dark:text-neutral-600">pdf, images, docs, audio, <span className="underline">and more</span></p>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />

          {/* Action Grid */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
             {[
               { label: 'Upload files', icon: FileUp },
               { label: 'Websites', icon: Youtube, color: 'text-red-500 dark:text-red-400' },
               { label: 'Drive', icon: Cloud, color: 'text-blue-500 dark:text-blue-400' },
               { label: 'Copied text', icon: Copy }
             ].map((action, i) => (
               <button 
                key={i}
                onClick={() => action.label === 'Upload files' && fileInputRef.current?.click()}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all group shadow-sm"
               >
                 <action.icon size={16} className={action.color || 'text-neutral-400 dark:text-neutral-500 group-hover:text-black dark:group-hover:text-white'} />
                 {action.label}
               </button>
             ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
