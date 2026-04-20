import { useState, useRef, useEffect } from 'react';
import { Notebook, Source } from '../types';
import { useStore } from '../store';
import { Send, Brain, Globe, Loader2, Sparkles, Trash2, Volume2, VolumeX, Bookmark, X, Plus, Mic, MicOff, Clock, Copy, Check, ThumbsUp, ThumbsDown, FileText, ListCollapse, MessageSquare, Download, StopCircle, Speech, FileSpreadsheet, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { generateChatResponse, generateSpeech, generateNoteTitle, generateChatSummary, generateFollowUpQuestions } from '../lib/ai';
import { motion, AnimatePresence } from 'motion/react';
import { useVoice } from '../hooks/useVoice';

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

  return (
    <div className="relative">
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
              {children}
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
              ({children})
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>

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
    return node;
  };

  if (Array.isArray(children)) {
    return children.map((child, i) => processNode(child, i));
  }
  return processNode(children, 0);
}

export default function ChatArea({ notebook }: { notebook: Notebook }) {
  const { addChatMessage, updateChatMessage, clearChat, updateChatFeedback, platformSettings, savePlatformSettings, addNote, updateNote, masterSources } = useStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [isSummarizingChat, setIsSummarizingChat] = useState(false);
  const [globalSummarizing, setGlobalSummarizing] = useState<{isActive: boolean, message: string}>({isActive: false, message: ''});
  const [followUps, setFollowUps] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  
  const [feedbackState, setFeedbackState] = useState<{messageId: string, type: 'up' | 'down'} | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadingStatuses = [
        "Initializing Deep Thinking Mode [14B]...",
        "Engaging Neural Reasoning Cores...",
        "Executing Exhaustive Source Analysis...",
        "Synthesizing Multi-Layer Insights...",
        "Cross-Referencing Scientific Data...",
        "Finalizing High-Intelligence Response...",
        "Generating Pedagogical Synthesis..."
      ];

  // Global Summarization listener
  useEffect(() => {
    const handler = ((e: CustomEvent) => setGlobalSummarizing(e.detail)) as EventListener;
    window.addEventListener('nutech:chat-loading', handler);
    return () => window.removeEventListener('nutech:chat-loading', handler);
  }, []);

  // Load platform branding/settings
  useEffect(() => {
    fetchPlatformSettings();
  }, [fetchPlatformSettings]);

  const toggleVoicePreference = async () => {
    const voices: Array<'male1' | 'female1' | 'male2' | 'female2' | 'specialist'> = ['male1', 'female1', 'male2', 'female2', 'specialist'];
    const current = platformSettings.preferredVoice || 'male1';
    const currentIndex = voices.indexOf(current as any);
    const nextVoice = voices[(currentIndex + 1) % voices.length];
    await savePlatformSettings({ preferredVoice: nextVoice });
  };

  // Cycle loading status messages
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      setLoadingStatusIndex(0);
      interval = setInterval(() => {
        setLoadingStatusIndex(prev => (prev + 1) % loadingStatuses.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLoading, loadingStatuses.length]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [inferenceTimings, setInferenceTimings] = useState<Record<string, number>>({});
  const [highlightedCitation, setHighlightedCitation] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isRecording, toggle, isSupported } = useVoice((text) => setInput(text));

  const toggleRecording = () => {
    if (!isSupported) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    toggle();
  };

  const handleCopy = (content: string, messageId: string) => {
    navigator.clipboard.writeText(content.replace(/\[\d+\]/g, ''));
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCitationClick = (sourceNum: number) => {
    const allSources = [...notebook.sources, ...masterSources];
    const source = allSources[sourceNum - 1];
    if (source) {
      setHighlightedSourceId(source.id);
      setHighlightedCitation(sourceNum);
      setTimeout(() => { setHighlightedCitation(null); setHighlightedSourceId(null); }, 3000);
    }
  };

  const handleSpeak = async (text: string, messageId: string) => {
    if (speakingId === messageId) {
      setSpeakingId(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis.cancel();
      return;
    }
    setSpeakingId(messageId);
    try {
      const cleanText = text
        .replace(/\[\d+\]/g, '')
        .replace(/[*#_|~`]/g, '')
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      const isTamil = /[\u0B80-\u0BFF]/.test(text) || /[\u0B80-\u0BFF]/.test(cleanText);

      // Primary: High-Fidelity Local Neural Engine (Natural VITS)
      if (!isTamil) {
        const voicePref = platformSettings.preferredVoice || 'male1';
        const b64Audio = await generateSpeech(text, voicePref as any);
        if (b64Audio) {
          // Stop previous audio if any
          if (audioRef.current) {
            audioRef.current.pause();
          }
          const audio = new Audio(`data:audio/wav;base64,${b64Audio}`);
          audioRef.current = audio;
          audio.onended = () => {
            if (speakingId === messageId) setSpeakingId(null);
            audioRef.current = null;
          };
          audio.onerror = () => {
            setSpeakingId(null);
            audioRef.current = null;
          };
          audio.play();
          return;
        }
      }

      // Fallback to Browser SpeechSynthesis (Required for Tamil/Non-English)
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (isTamil) {
        utterance.lang = 'ta-IN';
      }

      const availableVoices = window.speechSynthesis.getVoices();

      if (isTamil) {
        // Find a Tamil voice if possible
        const tamilVoice = availableVoices.find(v => v.lang.startsWith('ta'));
        if (tamilVoice) utterance.voice = tamilVoice;
      } else {
        // Find a high-quality native fallback if Neural fails
        const bestVoice = availableVoices.find(v => v.name.includes('Google') || v.name.includes('Siri')) || availableVoices[0];
        if (bestVoice) utterance.voice = bestVoice;
      }

      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = (e) => {
        console.error('Speech Synthesis Error:', e);
        setSpeakingId(null);
      };
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('TTS error:', error);
      setSpeakingId(null);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const exportToPDF = async (messageId?: string) => {
    // If no ID, export full chat area; else find the specific message DOM
    const targetElement = messageId 
      ? document.getElementById(`msg-body-${messageId}`) 
      : chatAreaRef.current;

    if (!targetElement) return;
    
    setExportingId(messageId || 'full');
    try {
      const canvas = await html2canvas(targetElement as HTMLElement, {
        backgroundColor: platformSettings.chatBackgroundUrl ? null : '#ffffff',
        scale: 2, // Better clarity
        useCORS: true,
        logging: false,
        scrollY: -window.scrollY,
        windowHeight: (targetElement as HTMLElement).scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, 280)); // Limit to one page for now or handle splitting
      pdf.save(`nutech_intel_export_${Date.now()}.pdf`);
    } catch (e) {
      console.error("PDF Export failed:", e);
    } finally {
      setExportingId(null);
    }
  };

  const exportToWord = (content: string, messageId: string) => {
    setExportingId(messageId);
    try {
      const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Nutech Intel Export</title><style>body { font-family: sans-serif; line-height: 1.6; }</style></head><body>";
      const footer = "</body></html>";
      
      // Basic markdown to HTML-ish conversion for Word
      const cleanContent = content
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br/>')
        .replace(/\[\d+\]/g, ''); // Remove citations for clean word doc

      const html = header + `<h1>Research Intelligence Summary</h1><hr/>` + cleanContent + footer;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nutech_intel_extract_${Date.now()}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Word Export failed:", e);
    } finally {
      setExportingId(null);
    }
  };

  const exportToExcelFromTable = (messageContent: string) => {
    // 1. Identify the table block using a more robust regex that ignores non-table lines
    const rows = messageContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('|') && line.endsWith('|'));

    if (rows.length < 2) {
      alert("No valid table structure detected for export.");
      return;
    }

    // 2. Parse the table data, removing markdown artifacts and HTML tags like <br>
    const tableData = rows
      .map(row => row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim().replace(/<br\s*\/?>/gi, ' ')))
      // Filter out the separator line (|---|---|)
      .filter(row => !row.every(cell => cell.match(/^[-: ]+$/)));

    if (tableData.length === 0) {
      alert("Selected table contains no valid data.");
      return;
    }

    // 3. Generate and trigger download
    const ws = XLSX.utils.aoa_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Intel Table Export");
    
    const fileName = `nutech_intel_extract_${Date.now()}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const submitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedbackState?.messageId && feedbackState?.type) {
      updateChatFeedback(notebook.id, feedbackState.messageId, feedbackState.type, feedbackText);
    }
    setFeedbackState(null);
    setFeedbackText('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [notebook.chatHistory, isLoading]);

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

    const startTime = performance.now();

    try {
      abortControllerRef.current = new AbortController();
      const response = await generateChatResponse(
        userMessage, 
        activeSources, 
        notebook.chatHistory,
        (token) => setStreamingContent(prev => (prev === null ? '' : prev) + token),
        undefined, 
        masterSources,
        abortControllerRef.current.signal
      );
      const elapsed = (performance.now() - startTime) / 1000;
      
      setStreamingContent(null);
      await addChatMessage(notebook.id, { role: 'model', content: response });
      
      const newHistory = [...notebook.chatHistory, {role: 'user' as const, content: userMessage}, {role: 'model' as const, content: response}];
      const questions = await generateFollowUpQuestions(newHistory);
      setFollowUps(questions);
      
      // We'll use the last message id approach in render
      setInferenceTimings(prev => ({ ...prev, latest: elapsed }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Response aborted by user.');
        setStreamingContent(null);
        return;
      }
      console.error('Error generating response:', error);
      setStreamingContent(null);
      await addChatMessage(notebook.id, {
        role: 'model',
        content: 'Sorry, I encountered an error generating a response. Please check your local model connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditStart = (msg: any) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
  };

  const handleEditSave = async (msgId: string) => {
    if (!editInput.trim() || isLoading) return;
    
    setIsLoading(true);
    setEditingMessageId(null);
    
    try {
      // 1. Update the user prompt in DB
      await updateChatMessage(notebook.id, msgId, editInput.trim());
      
      // 2. Clear follow-ups as the context has changed
      setFollowUps([]);
      
      const allAvailableSources = [...notebook.sources, ...(masterSources || [])];
      const activeSources = (notebook.selectedSourceIds || []).length > 0 
        ? allAvailableSources.filter(s => (notebook.selectedSourceIds || []).includes(s.id))
        : allAvailableSources;

      abortControllerRef.current = new AbortController();
      setStreamingContent('');
      
      // 3. Regenerate — Note that we include the full history. 
      // The model will see the *updated* message at its original position.
      const response = await generateChatResponse(
        editInput.trim(), 
        activeSources, 
        notebook.chatHistory, 
        (token) => setStreamingContent(prev => (prev === null ? '' : prev) + token),
        undefined, 
        masterSources,
        abortControllerRef.current.signal
      );
      
      setStreamingContent(null);
      await addChatMessage(notebook.id, { role: 'model', content: response });
    } catch (error) {
      console.error('Failed to update and regenerate:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNote = async (content: string) => {
    const tempTitle = content.split('\n')[0].substring(0, 40).replace(/[#*`\[\]0-9]/g, '').trim() || 'AI Response';
    const noteId = await addNote(notebook.id, { title: tempTitle, content });
    try {
      const aiTitle = await generateNoteTitle(content);
      if (aiTitle) await updateNote(notebook.id, noteId, { title: aiTitle });
    } catch (e) {
      console.warn('Failed to generate AI title:', e);
    }
  };

  const handleSaveToAssets = async () => {
    if (notebook.chatHistory.length < 2) return;
    setIsSummarizingChat(true);
    try {
      const summary = await generateChatSummary(notebook.chatHistory, notebook.sources);
      const title = await generateNoteTitle(summary.substring(0, 500));
      await addNote(notebook.id, {
        title: title || 'Research Brief',
        content: summary
      });
      // Optional: Success feedback could be added here
    } catch (error) {
      console.error('Chat persistence error:', error);
    } finally {
      setIsSummarizingChat(false);
    }
  };

  const clearMessages = async () => {
    if (confirm('Permanently redact intelligence history for this session?')) {
      await clearChat(notebook.id);
      setInferenceTimings({});
    }
  };

  // Find the latest model message for timing
  const lastModelMsgIndex = notebook.chatHistory.length - 1;
  const latestTiming = inferenceTimings.latest;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-neutral-900 relative transition-colors duration-300">
      {/* Header Actions */}
      <AnimatePresence>
        {notebook.chatHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-3 right-3 z-10 flex items-center gap-2"
          >
            {notebook.chatHistory.length >= 2 && (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleSaveToAssets}
                disabled={isSummarizingChat}
                className="flex items-center gap-2 px-3 py-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-primary dark:text-brand-primary-400 hover:bg-blue-50 dark:hover:bg-brand-primary/30 transition-colors shadow-sm border border-neutral-100 dark:border-neutral-800 disabled:opacity-50"
                title="Save Conversation to Assets"
              >
                {isSummarizingChat ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={14} />}
                Save to Assets
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={clearMessages}
              className="p-2.5 text-neutral-400 hover:text-red-500 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shadow-sm border border-neutral-100 dark:border-neutral-800"
              title="Clear Chat"
            >
              <Trash2 size={14} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Citation highlight overlay */}
      <AnimatePresence>
        {highlightedCitation !== null && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-3 left-3 z-10 flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-2xl shadow-xl text-xs font-bold"
          >
            <FileText size={14} />
            Viewing Source [{highlightedCitation}]: {notebook.sources[highlightedCitation - 1]?.title || 'Unknown'}
          </motion.div>
        )}
      </AnimatePresence>
      
      <div 
        className="flex-1 flex flex-col min-h-0 bg-white dark:bg-neutral-900 relative transition-colors duration-300"
        style={platformSettings.chatBackgroundUrl ? {
          backgroundImage: `url(${platformSettings.chatBackgroundUrl})`,
          backgroundSize: platformSettings.chatBackgroundUrl.includes('unsplash') ? 'cover' : '400px',
          backgroundRepeat: platformSettings.chatBackgroundUrl.includes('unsplash') ? 'no-repeat' : 'repeat',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          backgroundColor: `rgba(0, 0, 0, ${platformSettings.chatBackgroundTransparency || 0.08})`, 
          backgroundBlendMode: 'overlay'
        } : {}}
      >
        <div ref={chatAreaRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth pb-32 relative z-10">
          {platformSettings.chatBackgroundUrl && (
            <div 
              className="absolute inset-0 z-[-1] pointer-events-none" 
              style={{ backgroundColor: `rgba(255, 255, 255, ${platformSettings.chatBackgroundTransparency || 0.1})` }}
            />
          )}
          <AnimatePresence mode="popLayout">
            {notebook.chatHistory.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 max-w-md mx-auto text-center"
            >
              <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }} 
                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
              >
                <Sparkles size={48} className="mb-6 text-brand-primary opacity-50" />
              </motion.div>
              <h2 className="text-2xl font-medium text-neutral-700 dark:text-neutral-300 mb-3 uppercase tracking-tight">Studio</h2>
              <p className="text-[15px] leading-relaxed italic mb-6">
                Ask questions about your sources, request summaries, or brainstorm ideas. The AI will base its answers on the documents you've added.
              </p>
              {notebook.sources.length > 0 && (
                <div className="text-[10px] font-black uppercase tracking-widest text-brand-primary bg-blue-50 dark:bg-brand-primary/20 px-4 py-2 rounded-full border border-blue-100 dark:border-brand-primary/30">
                  {notebook.sources.length} source{notebook.sources.length !== 1 ? 's' : ''} loaded • Ready to analyze
                </div>
              )}
            </motion.div>
          ) : (
            notebook.chatHistory.map((msg, idx) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                key={msg.id && msg.id !== "" ? msg.id : `msg-${idx}-${msg.role}-${msg.content.substring(0, 10)}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-3xl px-6 py-5 relative group ${
                    msg.role === 'user'
                      ? 'max-w-[70%] bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-tr-sm'
                      : 'max-w-[90%] bg-white dark:bg-neutral-800/50 text-neutral-800 dark:text-neutral-200 rounded-tl-sm border border-neutral-100 dark:border-neutral-800 shadow-sm'
                  }`}
                >
                  {msg.role === 'model' ? (
                    <>
                      {/* Model response with citations */}
                      <div className="prose-override" id={`msg-body-${msg.id}`}>
                        <CitedMarkdown 
                          content={msg.content} 
                          sources={[...notebook.sources, ...(masterSources || [])]}
                          onCitationClick={handleCitationClick}
                        />
                      </div>

                      {/* Timing badge */}
                      {idx === lastModelMsgIndex && latestTiming != null && (
                        <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-700/50">
                          <Clock size={10} className="text-neutral-400" />
                          <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">
                            Generated in {latestTiming.toFixed(1)}s
                          </span>
                        </div>
                      )}

                      {/* Action bar — NotebookLM style */}
                      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-700/50">
                        <button
                          onClick={() => handleSaveNote(msg.content)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-brand-primary/20 rounded-lg transition-all"
                        >
                          <Bookmark size={12} />
                          Save to note
                        </button>

                        <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1" />

                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className={`p-2 rounded-lg transition-all ${copiedId === msg.id ? 'text-green-500' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                          title="Copy"
                        >
                          {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSpeak(msg.content, msg.id)}
                            className={`p-2 rounded-lg transition-all ${speakingId === msg.id ? 'text-brand-primary bg-blue-50 dark:bg-brand-primary/30 animate-pulse' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                            title={speakingId === msg.id ? "Stop" : "Read Aloud"}
                          >
                            {speakingId === msg.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                          </button>
                          
                          {/* Neural Voice Selection Dropdown */}
                          <select 
                            value={platformSettings.preferredVoice || 'male1'} 
                            onChange={(e) => savePlatformSettings({ preferredVoice: e.target.value as any })}
                            className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 text-[9px] text-neutral-500 font-black uppercase tracking-widest outline-none py-1 px-2 rounded-lg focus:ring-0 focus:border-brand-primary cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all appearance-none"
                            title="Select AI Voice"
                          >
                            <option value="male1">Intel 1 (M)</option>
                            <option value="female1">Intel 2 (F)</option>
                            <option value="male2">Intel 3 (M+)</option>
                            <option value="female2">Intel 4 (F+)</option>
                            <option value="specialist">Specialist</option>
                          </select>
                        </div>

                        <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1" />

                        <div className="flex gap-0.5">
                          <button 
                            onClick={() => exportToPDF(msg.id)} 
                            className={`p-2 ${exportingId === msg.id ? 'text-brand-primary animate-pulse' : 'text-neutral-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'} rounded-lg transition-all flex items-center gap-1`} 
                            title="Export PDF"
                          >
                            <FileText size={14} />
                          </button>
                          <button 
                            onClick={() => exportToWord(msg.content, msg.id)} 
                            className={`p-2 ${exportingId === msg.id ? 'text-brand-primary animate-pulse' : 'text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'} rounded-lg transition-all flex items-center gap-1`} 
                            title="Export as Document (.doc)"
                          >
                            <Download size={14} />
                          </button>
                        </div>

                        {msg.content.includes('|--') && (
                          <button 
                            onClick={() => exportToExcelFromTable(msg.content)} 
                            className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-all flex items-center gap-1.5 group/excel" 
                            title="Export Table to Excel"
                          >
                            <FileSpreadsheet size={14} className="group-hover/excel:scale-110 transition-transform" />
                            <span className="text-[9px] font-bold">.xlsx</span>
                          </button>
                        )}

                        <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1" />

                        <button onClick={() => setFeedbackState({messageId: msg.id, type: 'up'})} className="p-2 text-neutral-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all" title="Helpful">
                          <ThumbsUp size={14} />
                        </button>
                        <button onClick={() => setFeedbackState({messageId: msg.id, type: 'down'})} className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Not Helpful">
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                      
                      {/* Feedback Comment Box */}
                      <AnimatePresence>
                        {feedbackState?.messageId === msg.id && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 overflow-hidden"
                          >
                            <form onSubmit={submitFeedback} className="flex gap-2">
                              <input 
                                type="text"
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                placeholder="Add your feedback comment..."
                                className="flex-1 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-primary"
                                autoFocus
                              />
                              <button type="submit" className="bg-brand-primary text-white px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-600 transition-colors">
                                Submit
                              </button>
                              <button type="button" onClick={() => setFeedbackState(null)} className="text-neutral-400 hover:text-neutral-600 px-2">
                                <X size={14} />
                              </button>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <div className="relative group/user">
                      {editingMessageId === msg.id ? (
                        <div className="flex flex-col gap-3 min-w-[300px]">
                          <textarea
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 min-h-[100px] resize-none"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                             <button
                              onClick={() => setEditingMessageId(null)}
                              className="px-4 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleEditSave(msg.id)}
                              disabled={isLoading}
                              className="px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center gap-2"
                            >
                              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                              Save & Regenerate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                          <button
                            onClick={() => handleEditStart(msg)}
                            className="absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-neutral-300 hover:text-brand-primary opacity-0 group-hover/user:opacity-100 transition-all"
                            title="Edit Prompt"
                          >
                            <Edit3 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
          {globalSummarizing.isActive && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-start"
            >
              <div className="bg-white dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-3xl rounded-tl-sm px-6 py-5 flex items-center gap-3 shadow-sm">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <motion.span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 min-w-[200px]">
                  {globalSummarizing.message}
                </motion.span>
              </div>
            </motion.div>
          )}
          {streamingContent !== null ? (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="flex justify-start"
            >
              <div className="max-w-[90%] bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl rounded-tl-sm px-6 py-5 shadow-xl">
                <div className="flex items-center gap-2 mb-4 text-brand-primary">
                  <div className="flex gap-1">
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 rounded-full bg-brand-primary" />
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 rounded-full bg-brand-primary" />
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 rounded-full bg-brand-primary" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
                    Deep Thinking Neural Link (RAG Active)...
                  </span>
                </div>
                <div className="prose-override">
                  <CitedMarkdown 
                    content={streamingContent || '| Thinking...'} 
                    sources={[...notebook.sources, ...(masterSources || [])]}
                  />
                </div>
              </div>
            </motion.div>
          ) : isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-start"
            >
              <div className="bg-white dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-3xl rounded-tl-sm px-6 py-5 flex items-center gap-3 shadow-sm">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <motion.span 
                  key={loadingStatusIndex}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-sm font-bold text-neutral-500 dark:text-neutral-400 min-w-[200px]"
                >
                  {loadingStatuses[loadingStatusIndex]}
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
          {followUps.length > 0 && notebook.chatHistory.length > 0 && !isLoading && !globalSummarizing.isActive && (
             <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="flex flex-wrap gap-2 mt-4 justify-start">
                <div className="w-full text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                   <Sparkles size={12} className="text-purple-500" />
                   Suggested Follow-ups
                </div>
                {followUps.map((q, idx) => (
                   <button 
                      key={idx} 
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => {
                           const form = document.getElementById('chat-form') as HTMLFormElement;
                           if (form) form.requestSubmit();
                        }, 50);
                      }}
                      className="px-4 py-2 bg-purple-50/50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-xl text-xs font-bold border border-purple-200 dark:border-purple-800 transition-colors text-left"
                   >
                      {q}
                   </button>
                ))}
             </motion.div>
          )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800 z-20 transition-colors duration-300">
        <form 
          id="chat-form"
          onSubmit={handleSend} 
          className={`max-w-3xl mx-auto relative group transition-all duration-300 rounded-[1.5rem] border-2 shadow-sm ${
            isDraggingOver ? 'border-brand-primary bg-blue-50/20 dark:bg-brand-primary/10 scale-[1.02] ring-4 ring-brand-primary/10' : 'border-transparent'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            setDraggedSource(null);
            const sourceId = e.dataTransfer.getData('sourceId');
            if (sourceId && !(notebook.selectedSourceIds || []).includes(sourceId)) {
              toggleSourceSelection(notebook.id, sourceId);
            }
          }}
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-brand-primary/10 backdrop-blur-[2px] rounded-[1.5rem] pointer-events-none border-2 border-dashed border-brand-primary animate-pulse">
              <div className="bg-brand-primary text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-bold text-sm">
                <Plus size={18} />
                Tag Resource for Inference
              </div>
            </div>
          )}
          {(notebook.selectedSourceIds || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 items-center">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mr-1 ml-1">Sources:</span>
              <AnimatePresence>
                {(notebook.selectedSourceIds || []).map((id) => {
                  const source = notebook.sources.find(s => s.id === id);
                  if (!source) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                      key={id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-brand-primary/30 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-900/50 shadow-sm"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest max-w-[120px] truncate">{source.title}</span>
                      <button type="button" onClick={() => toggleSourceSelection(notebook.id, id)} className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full transition-colors">
                        <X size={10} />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          <div className="flex flex-col gap-3 px-1 mb-3">
          <div className="relative flex items-end gap-2 bg-neutral-100/80 dark:bg-neutral-800/80 rounded-[1.5rem] p-2 border border-transparent focus-within:border-neutral-300 dark:focus-within:border-neutral-600 focus-within:bg-white dark:focus-within:bg-neutral-800 transition-all shadow-sm focus-within:shadow-md">
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              type="button" onClick={toggleRecording}
              className={`p-3 rounded-2xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-lg' : 'text-neutral-400 hover:text-brand-primary hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </motion.button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              placeholder="Ask about your sources..."
              className="w-full max-h-32 min-h-[48px] bg-transparent border-none focus:ring-0 resize-none py-3 px-4 text-[15px] font-medium outline-none text-neutral-900 dark:text-neutral-100"
              rows={1}
            />
            {isLoading ? (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                type="button" onClick={handleStop}
                className="p-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-colors shrink-0 mb-0.5 mr-0.5 shadow-sm"
                title="Stop Neural Link"
              >
                <StopCircle size={18} className="animate-pulse" />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                type="submit" disabled={!input.trim()}
                className="p-3 bg-brand-primary text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-brand-primary transition-colors shrink-0 mb-0.5 mr-0.5 shadow-sm"
              >
                <Send size={18} />
              </motion.button>
            )}
          </div>
        </div>
      </form>
    </div>
  </div>
);
}
