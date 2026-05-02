import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileText, HelpCircle, GraduationCap, ChevronRight, BookOpen, Lightbulb, CheckCircle2, Clock, Users, Cpu, Sparkles } from 'lucide-react';
import { Notebook } from '../types';
import axios from 'axios';

interface GuideData {
  toc: { title: string; summary: string }[];
  faqs: { question: string; answer: string }[];
  studyGuide: {
    glossary: { term: string; definition: string }[];
    questions: { question: string; options: string[]; correctIndex: number }[];
  };
}

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutech-vault-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function GuideView({ notebook }: { notebook: Notebook }) {
  const [data, setData] = useState<GuideData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'toc' | 'faq' | 'study'>('toc');

  useEffect(() => {
    const fetchGuide = async () => {
      try {
        const res = await api.get(`/notebooks/${notebook.id}/guide`);
        setData(res.data);
      } catch (e) {
        console.error('Failed to fetch guide', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchGuide();
  }, [notebook.id]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6" />
        <p className="text-sm font-black text-neutral-400 uppercase tracking-[0.2em] animate-pulse">Analyzing Sources...</p>
      </div>
    );
  }

  if (!data || (data.toc.length === 0 && data.faqs.length === 0)) {
     return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
           <BookOpen size={48} className="text-neutral-200 mb-4" />
           <p className="text-neutral-400 text-sm font-medium">Add some sources to generate your research guide.</p>
        </div>
     );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-neutral-900 transition-colors duration-300">
      {/* Sub-navigation */}
      <div className="flex items-center gap-8 px-12 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/30 sticky top-0 z-10 backdrop-blur-sm">
        {[
          { id: 'toc', label: 'Table of Contents', icon: FileText },
          { id: 'faq', label: 'FAQ', icon: HelpCircle },
          { id: 'study', label: 'Study Guide', icon: GraduationCap },
        ].map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id as any)}
            className={`flex items-center gap-2 pb-2 border-b-2 transition-all ${
              activeSection === sec.id 
              ? 'border-blue-600 text-blue-600 dark:text-blue-400' 
              : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <sec.icon size={16} />
            <span className="text-[11px] font-black uppercase tracking-wider">{sec.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
        <div className="max-w-3xl mx-auto">
          {activeSection === 'toc' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 dark:shadow-blue-900/20">
                    <FileText className="text-white" size={20} />
                 </div>
                 <h2 className="text-2xl font-black text-neutral-800 dark:text-white">Structural Overview</h2>
              </div>
              {data.toc.map((item, i) => (
                <div key={i} className="group p-6 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-700 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all cursor-default">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{item.title}</h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed italic">{item.summary}</p>
                    </div>
                    <ChevronRight size={16} className="text-neutral-300 dark:text-neutral-600 group-hover:text-blue-400 dark:group-hover:text-blue-500 transition-all group-hover:translate-x-1" />
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeSection === 'faq' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="flex items-center gap-3 mb-8">
                 <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200 dark:shadow-purple-900/20">
                    <HelpCircle className="text-white" size={20} />
                 </div>
                 <h2 className="text-2xl font-black text-neutral-800 dark:text-white">Frequently Asked Questions</h2>
              </div>
              {data.faqs.map((faq, i) => (
                <div key={i} className="space-y-3 p-6 border-l-4 border-purple-500 bg-neutral-50 dark:bg-neutral-800/50 rounded-r-2xl">
                  <h3 className="text-sm font-black text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                    <Lightbulb size={14} className="text-amber-500" />
                    {faq.question}
                  </h3>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </motion.div>
          )}

          {activeSection === 'study' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <div className="flex items-center gap-3 mb-8">
                 <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900/20">
                    <GraduationCap className="text-white" size={20} />
                 </div>
                 <h2 className="text-2xl font-black text-neutral-800 dark:text-white">Study Guide</h2>
              </div>
              
              {/* Glossary */}
              <section className="space-y-6">
                <h3 className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                   Glossary of Terms
                   <div className="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.studyGuide.glossary.map((item, i) => (
                    <div key={i} className="p-4 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-xl shadow-sm">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block mb-1">{item.term}</span>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">{item.definition}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Quiz Questions */}
              <section className="space-y-6">
                <h3 className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                   Knowledge Check
                   <div className="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                </h3>
                {data.studyGuide.questions.map((q, i) => (
                  <div key={i} className="p-8 bg-neutral-900 dark:bg-neutral-950 text-white rounded-[2rem] space-y-6 shadow-xl">
                    <h4 className="text-sm font-bold leading-relaxed">{q.question}</h4>
                    <div className="grid grid-cols-1 gap-3">
                      {q.options.map((opt, oi) => (
                        <button key={oi} className="text-left px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-xs hover:bg-white/10 transition-all flex items-center justify-between group">
                          {opt}
                          <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center group-hover:border-white/40 transition-all">
                             <div className="w-1.5 h-1.5 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-all" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

                {/* Quick Actions */}
                <section className="space-y-6">
                  <h3 className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2">
                     Research Accelerators
                     <div className="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { label: 'Generate Timeline', icon: Clock, prompt: 'Analyze the sources and create a detailed chronological timeline of all key events mentioned.' },
                      { label: 'Cast of Characters', icon: Users, prompt: 'Identify all key organizations, people, and stakeholders mentioned in the sources and describe their roles.' },
                      { label: 'Technical Deep-Dive', icon: Cpu, prompt: 'Extract and explain all technical specifications, architectures, or methodologies found in these documents.' },
                      { label: 'Critical Analysis', icon: Sparkles, prompt: 'Find potential contradictions or gaps in the research presented in these sources.' }
                    ].map((act, i) => (
                      <button 
                        key={i}
                        onClick={() => {
                          const input = document.getElementById('chat-input') as HTMLTextAreaElement;
                          if (input) {
                            input.value = act.prompt;
                            input.focus();
                            // Trigger the Tab change to Chat
                            const chatTab = document.querySelector('button[title="Chat"]') as HTMLButtonElement;
                            if (chatTab) chatTab.click();
                          }
                        }}
                        className="flex items-center gap-3 p-4 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
                      >
                        <div className="w-8 h-8 bg-neutral-50 dark:bg-neutral-900 rounded-lg flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                           <act.icon size={16} className="text-neutral-400 dark:text-neutral-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                        </div>
                        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200">{act.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    );
  }
