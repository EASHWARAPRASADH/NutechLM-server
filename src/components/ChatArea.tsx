import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Notebook, Source } from '../types';
import { useStore } from '../store';
import { Send, Brain, Globe, Loader2, Sparkles, Trash2, Volume2, VolumeX, Bookmark, X, Plus, Mic, MicOff, Clock, Copy, Check, ThumbsUp, ThumbsDown, FileText, ListCollapse, MessageSquare, Download, StopCircle, Speech, FileSpreadsheet, Edit3, MoreVertical, ArrowRight, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import ConfigureChatModal from './ConfigureChatModal';
import { Settings, RefreshCw } from 'lucide-react';
import { generateChatResponse, generateSpeech, generateNoteTitle, generateChatSummary, generateFollowUpQuestions } from '../lib/ai';
import { motion, AnimatePresence } from 'motion/react';
import { useVoice } from '../hooks/useVoice';
import { exportToPdf, exportToWord, exportToExcel } from '../lib/export';

// Color palette for citation badges — each source gets a unique color
const CITATION_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', hover: 'hover:bg-blue-200 dark:hover:bg-blue-800', border: 'border-blue-300 dark:border-blue-700' },
  { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', hover: 'hover:bg-purple-200 dark:hover:bg-purple-800', border: 'border-purple-300 dark:border-purple-700' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', hover: 'hover:bg-emerald-200 dark:hover:bg-emerald-800', border: 'border-emerald-300 dark:border-emerald-700' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', hover: 'hover:bg-amber-200 dark:hover:bg-amber-800', border: 'border-amber-300 dark:border-amber-700' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', hover: 'hover:bg-rose-200 dark:hover:bg-rose-800', border: 'border-rose-300 dark:border-rose-700' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', hover: 'hover:bg-cyan-200 dark:hover:bg-cyan-800', border: 'border-cyan-300 dark:border-cyan-700' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', hover: 'hover:bg-indigo-200 dark:hover:bg-indigo-800', border: 'border-indigo-300 dark:border-indigo-700' },
];

function getCitationColor(num: number) {
  return CITATION_COLORS[(num - 1) % CITATION_COLORS.length];
}

/**
 * Renders text with color-coded citation badges [1], [2], etc.
 * Each citation number gets a unique color for visual distinction.
 */
function CitedText({ text, sources, onCitationClick, onCitationHover, onCitationLeave }: { 
  text: string; 
  sources: Source[]; 
  onCitationClick?: (sourceIndex: number) => void;
  onCitationHover?: (source: Source, rect: DOMRect) => void;
  onCitationLeave?: () => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  
  return (
    <>
      {parts.map((part, i) => {
        const uniqueKey = `part-${i}-${part.substring(0, 5)}`;
        const citationMatch = part.match(/^\[(\d+)\]$/);
        if (citationMatch) {
          const num = parseInt(citationMatch[1]);
          const source = sources[num - 1];
          const color = getCitationColor(num);
          return (
            <button
              key={uniqueKey}
              onClick={(e) => { e.stopPropagation(); onCitationClick?.(num); }}
              onMouseEnter={(e) => {
                if (source) onCitationHover?.(source, e.currentTarget.getBoundingClientRect());
              }}
              onMouseLeave={() => onCitationLeave?.()}
              className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 mx-[1px] text-[10px] font-black ${color.bg} ${color.text} ${color.hover} rounded-md align-super cursor-pointer transition-all leading-none shadow-sm border ${color.border} hover:scale-110 active:scale-95`}
            >
              {num}
            </button>
          );
        }
        return <span key={uniqueKey}>{part}</span>;
      })}
    </>
  );
}

/**
 * Custom markdown renderer that injects citation badges into rendered markdown.
 */
function CitedMarkdown({ content, sources, onCitationClick }: {
  content: string;
  sources: Source[];
  onCitationClick?: (sourceIndex: number) => void;
}) {
  const [hoveredSource, setHoveredSource] = useState<Source | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number, y: number } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  const handleHover = (source: Source, rect: DOMRect) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredSource(source);
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSource(null);
    }, 250); // slight delay allowing mouse to enter popover
  };

  const proxiedOnCitationClick = (n: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredSource(null); // Close popover on click
    onCitationClick?.(n);
  };

  const renderedMarkdown = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-3 leading-[1.8] text-[14.5px]">
            {processChildren(children, sources, proxiedOnCitationClick, handleHover, handleLeave)}
          </p>
        ),
        li: ({ children }) => (
          <li className="mb-2 leading-[1.7] text-[14.5px]">
            {processChildren(children, sources, proxiedOnCitationClick, handleHover, handleLeave)}
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-extrabold text-brand-primary">
            {processChildren(children, sources, proxiedOnCitationClick, handleHover, handleLeave)}
          </strong>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <code className={`block bg-neutral-100 dark:bg-neutral-800 rounded-xl p-4 text-sm font-mono overflow-x-auto my-3 border border-neutral-200 dark:border-neutral-700 ${className || ''}`}>
                {children}
              </code>
            );
          }
          return (
            <code className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-md text-[13px] font-mono text-brand-primary dark:text-brand-primary-400 border border-neutral-200 dark:border-neutral-700">
              {children}
            </code>
          );
        },
        h1: ({ children }) => (
          <h1 className="text-xl font-black mt-8 mb-4 text-brand-primary uppercase tracking-tighter">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-extrabold mt-6 mb-3 text-brand-primary uppercase tracking-tight border-b border-neutral-100 dark:border-neutral-800 pb-2">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-black mt-4 mb-2 text-brand-accent uppercase tracking-tight">
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 my-3 pl-2">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 my-3 pl-2">
            {children}
          </ol>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-brand-accent/50 pl-4 py-2 my-4 bg-brand-accent/5 dark:bg-brand-accent/10 rounded-r-xl italic text-neutral-600 dark:text-neutral-400">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
            <table className="w-full text-sm border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-neutral-100 dark:bg-neutral-800">
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-3 text-left text-[11px] font-black text-neutral-600 dark:text-neutral-300 uppercase tracking-wider border-b-2 border-neutral-200 dark:border-neutral-700">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-[13px] text-neutral-700 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800">
            {processChildren(children, sources, proxiedOnCitationClick, handleHover, handleLeave)}
          </td>
        ),
        tr: ({ children }) => (
          <tr className="even:bg-neutral-50/50 dark:even:bg-neutral-900/30 hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors">
            {children}
          </tr>
        ),
        em: ({ children }) => (
          <em className="text-neutral-500 dark:text-neutral-400 not-italic text-[13.5px] font-medium">
            ({processChildren(children, sources, proxiedOnCitationClick, handleHover, handleLeave)})
          </em>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  ), [content, sources]); // Only re-render markdown when content or sources change

  return (
    <div className="relative">
      {renderedMarkdown}

      {/* Citation Hover Popover */}
      <AnimatePresence>
        {hoveredSource && popoverPos && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: -15, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            style={{ 
              position: 'fixed',
              left: popoverPos.x,
              top: popoverPos.y,
              transform: 'translateX(-50%) translateY(-100%)',
              zIndex: 1000
            }}
            onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
            onMouseLeave={() => handleLeave()}
            onClick={() => {
               const idx = sources.findIndex(s => s.id === hoveredSource.id);
               if (idx >= 0) proxiedOnCitationClick(idx + 1);
            }}
            className="w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-2xl p-4 cursor-pointer hover:border-brand-primary/50 transition-colors pointer-events-auto"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary text-[9px] font-black uppercase tracking-widest rounded border border-brand-primary/20">
                {hoveredSource.type || 'SOURCE'}
              </div>
              <h4 className="text-[11px] font-black text-neutral-900 dark:text-neutral-100 truncate flex-1 uppercase tracking-tight">
                {hoveredSource.title}
              </h4>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-3 italic">
              "{hoveredSource.content.substring(0, 180)}..."
            </p>
            <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Click to view full doc</span>
              <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Process inline children to inject citation badges into text nodes */
function processChildren(
  children: React.ReactNode, 
  sources: Source[], 
  onCitationClick?: (n: number) => void,
  onCitationHover?: (source: Source, rect: DOMRect) => void,
  onCitationLeave?: () => void
): React.ReactNode {
  if (!children) return children;
  
  const processNode = (node: React.ReactNode, key: number): React.ReactNode => {
    if (typeof node === 'string') {
      // Check if this string contains citations
      if (/\[\d+\]/.test(node)) {
        return <CitedText 
          key={key} 
          text={node} 
          sources={sources} 
          onCitationClick={onCitationClick} 
          onCitationHover={onCitationHover}
          onCitationLeave={onCitationLeave}
        />;
      }
      return node;
    }
    if (React.isValidElement(node) && node.props.children) {
      return React.cloneElement(node as React.ReactElement, {
        children: processChildren(node.props.children, sources, onCitationClick, onCitationHover, onCitationLeave)
      } as any);
    }
    return node;
  };

  if (Array.isArray(children)) {
    return children.map((child, i) => processNode(child, i));
  }
  return processNode(children, 0);
}

export default function ChatArea({ notebook }: { notebook: Notebook }) {
  const { 
    addChatMessage, 
    updateChatFeedback,
    generateNotebookSummary,
    masterSources,
    addNote,
    isGeneratingSummary,
    setPreviewSourceId
  } = useStore();
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackCommentId, setFeedbackCommentId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    chatAreaRef.current?.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [notebook.chatHistory, isLoading, streamingContent]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    await addChatMessage(notebook.id, { role: 'user', content: userMessage });
    setIsLoading(true);

    const allAvailableSources = [...notebook.sources, ...(masterSources || [])];
    const activeSources = (notebook.selectedSourceIds || []).length > 0 
      ? allAvailableSources.filter(s => (notebook.selectedSourceIds || []).includes(s.id))
      : allAvailableSources;

    try {
      abortControllerRef.current = new AbortController();
      const response = await generateChatResponse(
        userMessage, 
        activeSources, 
        notebook.chatHistory,
        (token) => setStreamingContent(prev => (prev === null ? '' : prev) + token),
        undefined, 
        masterSources,
        abortControllerRef.current.signal,
        { 
          chatGoal: notebook.chatGoal, 
          chatLength: notebook.chatLength, 
          customGoal: notebook.customGoal 
        }
      );
      
      setStreamingContent(null);
      await addChatMessage(notebook.id, { role: 'model', content: response });

      // Generate follow-up questions
      try {
        const questions = await generateFollowUpQuestions(response, activeSources);
        setSuggestedQuestions(questions.slice(0, 3));
      } catch (e) {
        console.warn('Failed to generate follow-up questions', e);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error generating response:', error);
        setStreamingContent(null);
        await addChatMessage(notebook.id, {
          role: 'model',
          content: 'Sorry, I encountered an error generating a response.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sourcesCount = notebook.selectedSourceIds?.length || 0;
  const dateStr = format(new Date(), 'd MMMM yyyy');

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-neutral-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Chat Header */}
      <div className="p-5 flex items-center justify-between shrink-0 border-b border-neutral-50 dark:border-neutral-800">
        <h2 className="text-base font-medium text-neutral-800 dark:text-neutral-200">Chat</h2>
        <div className="flex items-center gap-3 text-neutral-500">
          <Settings 
            size={18} 
            className="cursor-pointer hover:text-blue-600 transition-colors" 
            onClick={() => setIsConfigOpen(true)}
          />
          <RotateCcw 
            size={18} 
            className="cursor-pointer hover:text-orange-500 transition-colors" 
            title="Clear Chat"
            onClick={async () => {
              if (window.confirm('Clear all chat history for this notebook?')) {
                await useStore.getState().clearChat(notebook.id);
              }
            }}
          />
          <div className="relative group">
            <MoreVertical 
              size={18} 
              className="cursor-pointer hover:text-neutral-800 transition-colors" 
            />
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-neutral-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] py-2">
               <button 
                 onClick={() => {
                   const text = notebook.chatHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
                   const blob = new Blob([text], { type: 'text/plain' });
                   const url = URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = `${notebook.title}-chat.txt`;
                   a.click();
                 }}
                 className="w-full px-4 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
               >
                 <Download size={14} /> Export Transcript
               </button>
               <div className="my-1 border-t border-neutral-100" />
               <button 
                 onClick={async () => {
                   if (window.confirm('Delete this entire notebook? This cannot be undone.')) {
                     await useStore.getState().deleteNotebook(notebook.id);
                     window.location.href = '/dashboard';
                   }
                 }}
                 className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
               >
                 <Trash2 size={14} /> Delete Notebook
               </button>
            </div>
          </div>
        </div>
      </div>

      <div ref={chatAreaRef} className="flex-1 overflow-y-auto px-10 pb-10 space-y-8 scroll-smooth">
        {/* Notebook Summary Block (NotebookLM Style) - Always at top */}
        <div className="max-w-3xl mx-auto pt-10">
            <div className="text-5xl mb-6">{notebook.emoji || '📜'}</div>
            <h1 className="text-4xl font-bold text-neutral-800 dark:text-white mb-2 leading-tight">
              {notebook.title}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mb-10 flex items-center gap-3">
              <span>{sourcesCount} {sourcesCount === 1 ? 'source' : 'sources'} · {dateStr}</span>
              <button 
                onClick={() => useStore.getState().generateNotebookSummary(notebook.id)}
                disabled={isGeneratingSummary}
                className="p-1 hover:bg-neutral-100 rounded-md transition-colors text-neutral-400 hover:text-neutral-600 disabled:opacity-50"
                title="Regenerate summary"
              >
                <RefreshCw size={14} className={isGeneratingSummary ? 'animate-spin' : ''} />
              </button>
            </p>

            <div className="prose prose-neutral max-w-none text-neutral-700 leading-relaxed">
              {isGeneratingSummary ? (
                <div className="flex flex-col gap-3 py-4">
                  <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full w-full animate-pulse" />
                  <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full w-[90%] animate-pulse" />
                  <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-full w-[80%] animate-pulse" />
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> Synthesizing research brief...
                  </p>
                </div>
              ) : notebook.description ? (
                <div className="dark:text-neutral-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{notebook.description}</ReactMarkdown>
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-neutral-100 dark:border-neutral-800 rounded-3xl bg-neutral-50/50 dark:bg-neutral-800/30">
                  <Sparkles size={24} className="text-blue-400 mb-3" />
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium text-center px-6">
                    Your research brief is ready to be synthesized.
                  </p>
                  <button 
                    onClick={() => generateNotebookSummary(notebook.id)}
                    className="mt-4 px-6 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all shadow-sm"
                  >
                    Generate Research Brief
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Chat History */}
        <div className="max-w-3xl mx-auto space-y-8 pt-10">
          {notebook.chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 text-sm dark:text-neutral-200' : 'w-full'}`}>
                {msg.role === 'model' ? (
                  <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-8 shadow-sm">
                    <CitedMarkdown 
                      content={msg.content} 
                      sources={[...notebook.sources, ...masterSources]} 
                      onCitationClick={(n) => {
                        const allSources = [...notebook.sources, ...masterSources];
                        const s = allSources[n - 1];
                        if (s) setPreviewSourceId(s.id);
                      }}
                    />
                    <div className="mt-8 flex items-center gap-4 text-neutral-400">
                       <button 
                         onClick={async () => {
                           if (savedMessageIds.has(msg.id)) return;
                           const title = msg.content.split('\n')[0].substring(0, 50).replace(/[#*]/g, '') || 'Saved insight';
                           await addNote(notebook.id, { title, content: msg.content });
                           setSavedMessageIds(prev => new Set(prev).add(msg.id));
                         }}
                         className={`transition-all flex items-center gap-1 text-[10px] font-medium border px-3 py-1.5 rounded-full ${savedMessageIds.has(msg.id) ? 'bg-green-50 border-green-200 text-green-600' : 'hover:text-neutral-600 border-neutral-200 text-neutral-400'}`}
                       >
                         {savedMessageIds.has(msg.id) ? <Check size={12}/> : <Bookmark size={12}/>}
                         {savedMessageIds.has(msg.id) ? 'Saved' : 'Save to note'}
                       </button>
                        <div className="flex items-center gap-3 ml-auto text-neutral-400">
                           <button 
                             onClick={() => {
                               navigator.clipboard.writeText(msg.content);
                               alert('Copied to clipboard');
                             }}
                             className="hover:text-blue-600 transition-colors"
                             title="Copy to clipboard"
                           >
                             <Copy size={14} />
                           </button>
                           
                           <div className="flex items-center gap-1.5 relative">
                             <button 
                               onClick={() => {
                                 const newType = msg.feedbackType === 'up' ? null : 'up';
                                 updateChatFeedback(notebook.id, msg.id, newType, msg.feedbackText || '');
                                 if (newType) setFeedbackCommentId(msg.id);
                               }}
                               className={`transition-colors p-1.5 rounded-lg border ${msg.feedbackType === 'up' ? 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm' : 'text-neutral-400 hover:text-green-600 hover:bg-neutral-50 border-transparent'}`} 
                               title="Like"
                             >
                               <ThumbsUp size={16} fill={msg.feedbackType === 'up' ? 'currentColor' : 'none'} />
                             </button>
                             
                             <button 
                               onClick={() => {
                                 const newType = msg.feedbackType === 'down' ? null : 'down';
                                 updateChatFeedback(notebook.id, msg.id, newType, msg.feedbackText || '');
                                 if (newType) setFeedbackCommentId(msg.id);
                               }}
                               className={`transition-colors p-1.5 rounded-lg border ${msg.feedbackType === 'down' ? 'text-red-600 bg-red-50 border-red-200 shadow-sm' : 'text-neutral-400 hover:text-red-600 hover:bg-neutral-50 border-transparent'}`} 
                               title="Dislike"
                             >
                               <ThumbsDown size={16} fill={msg.feedbackType === 'down' ? 'currentColor' : 'none'} />
                             </button>

                             {msg.feedbackType && (
                               <div className="relative group/comment">
                                 <button 
                                   onClick={() => setFeedbackCommentId(feedbackCommentId === msg.id ? null : msg.id)}
                                   className={`p-1 rounded-md transition-all ${msg.feedbackText ? 'text-blue-600 bg-blue-50' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50'}`}
                                   title="Add Comment"
                                 >
                                   <MessageSquare size={14} />
                                 </button>
                                 
                                 {feedbackCommentId === msg.id && (
                                   <div className="absolute right-0 bottom-full mb-3 w-64 bg-white border border-neutral-200 rounded-2xl shadow-2xl p-4 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                      <p className="text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-wider">Provide Feedback</p>
                                      <textarea 
                                        id={`feedback-${msg.id}`}
                                        autoFocus
                                        defaultValue={msg.feedbackText || ''}
                                        onBlur={(e) => {
                                          updateChatFeedback(notebook.id, msg.id, msg.feedbackType, e.target.value);
                                          setFeedbackCommentId(null);
                                        }}
                                        placeholder="Why did you give this rating?"
                                        className="w-full h-20 bg-neutral-50 border-none rounded-xl p-3 text-[11px] focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                      />
                                      <div className="flex justify-between items-center mt-2">
                                        <button 
                                          onClick={() => setFeedbackCommentId(null)}
                                          className="text-[10px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors"
                                        >
                                          Cancel
                                        </button>
                                        <button 
                                          onClick={() => {
                                            const textarea = document.getElementById(`feedback-${msg.id}`) as HTMLTextAreaElement;
                                            updateChatFeedback(notebook.id, msg.id, msg.feedbackType, textarea?.value || '');
                                            setFeedbackCommentId(null);
                                          }}
                                          className="px-4 py-1.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:scale-105 active:scale-95 transition-all"
                                        >
                                          Submit Feedback
                                        </button>
                                      </div>
                                   </div>
                                 )}
                               </div>
                             )}
                           </div>

                           <div className="relative group/export">
                             <button className="hover:text-neutral-800 transition-colors" title="Export">
                               <Download size={14} />
                             </button>
                             <div className="absolute right-0 bottom-full mb-2 w-36 bg-white border border-neutral-200 rounded-xl shadow-xl opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-[100] py-2">
                                <button 
                                  onClick={() => exportToPdf(notebook)}
                                  className="w-full px-4 py-2 text-left text-[10px] text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                                >
                                  <FileText size={12} /> PDF Report
                                </button>
                                <button 
                                  onClick={() => exportToWord(notebook)}
                                  className="w-full px-4 py-2 text-left text-[10px] text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                                >
                                  <FileText size={12} /> Word Doc
                                </button>
                                {msg.content.includes('| ---') && (
                                  <button 
                                    onClick={() => exportToExcel(notebook)}
                                    className="w-full px-4 py-2 text-left text-[10px] text-green-600 hover:bg-green-50 flex items-center gap-2"
                                  >
                                    <FileSpreadsheet size={12} /> Excel Table
                                  </button>
                                )}
                             </div>
                           </div>
                        </div>
                    </div>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          {streamingContent && (
            <div className="flex flex-col items-start w-full">
               <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-8 shadow-sm w-full">
                  <CitedMarkdown 
                    content={streamingContent} 
                    sources={[...notebook.sources, ...masterSources]} 
                    onCitationClick={(n) => {
                      const allSources = [...notebook.sources, ...masterSources];
                      const s = allSources[n - 1];
                      if (s) setPreviewSourceId(s.id);
                    }}
                  />
               </div>
            </div>
          )}

          {isLoading && !streamingContent && (
            <div className="flex items-center gap-3 text-neutral-400 animate-pulse pl-4">
              <div className="w-2 h-2 bg-neutral-300 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          )}
        </div>
      </div>

      {/* Suggested Questions Chips */}
      {suggestedQuestions.length > 0 && (
        <div className="px-6 pb-2 max-w-3xl mx-auto flex flex-wrap gap-2">
          {suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => {
                setInput(q);
                setSuggestedQuestions([]);
              }}
              className="px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-6 pt-2 shrink-0">
        <form 
          onSubmit={handleSend} 
          className="max-w-3xl mx-auto relative group"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('scale-[1.02]', 'ring-2', 'ring-blue-400');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('scale-[1.02]', 'ring-2', 'ring-blue-400');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('scale-[1.02]', 'ring-2', 'ring-blue-400');
            const source = useStore.getState().draggedSource;
            if (source) {
              const mention = ` @${source.title} `;
              setInput(prev => prev + mention);
              useStore.getState().setDraggedSource(null);
            }
          }}
        >
          <div className="bg-[#f8f9fa] dark:bg-neutral-800/50 group-focus-within:bg-white dark:group-focus-within:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-[2rem] p-2 pl-6 pr-2 flex items-center transition-all shadow-sm group-focus-within:shadow-md">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Start typing..."
              className="flex-1 bg-transparent border-none outline-none text-sm py-3 dark:text-white"
            />
            <div className="flex items-center gap-4 mr-2">
              <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">{sourcesCount} {sourcesCount === 1 ? 'source' : 'sources'}</span>
              <button 
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 bg-neutral-100 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 rounded-full flex items-center justify-center hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black transition-all disabled:opacity-50 disabled:hover:bg-neutral-100 disabled:hover:text-neutral-400"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfigureChatModal 
        notebook={notebook} 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
      />
    </div>
  );
}
