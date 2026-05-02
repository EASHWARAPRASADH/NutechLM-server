import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check } from 'lucide-react';
import { Notebook } from '../types';
import { useStore } from '../store';

interface Props {
  notebook: Notebook;
  isOpen: boolean;
  onClose: () => void;
}

export default function ConfigureChatModal({ notebook, isOpen, onClose }: Props) {
  const { updateNotebook } = useStore();
  const [goal, setGoal] = useState(notebook.chatGoal || 'default');
  const [length, setLength] = useState(notebook.chatLength || 'default');
  const [customGoal, setCustomGoal] = useState(notebook.customGoal || '');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state with notebook prop when it changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setGoal(notebook.chatGoal || 'default');
      setLength(notebook.chatLength || 'default');
      setCustomGoal(notebook.customGoal || '');
    }
  }, [isOpen, notebook.id, notebook.chatGoal, notebook.chatLength, notebook.customGoal]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateNotebook(notebook.id, {
        chatGoal: goal,
        chatLength: length,
        customGoal: goal === 'custom' ? customGoal : ''
      });
      onClose();
    } catch (e) {
      console.error('Failed to save config', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-neutral-100 dark:border-neutral-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="p-6 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800">
            <h2 className="text-lg font-medium">Configure chat</h2>
            <button onClick={onClose} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 dark:text-neutral-500">
              <X size={20} />
            </button>
          </header>

          <div className="p-8 space-y-8">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Notebooks can be customised to help you achieve different goals: do research, help learn, show various perspectives or converse in a particular style and tone.
            </p>

            {/* Conversational Goal */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Define your conversational goal, style or role</h3>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'default', label: 'Default', desc: 'Best for general purpose research and brainstorming tasks.' },
                  { id: 'learning_guide', label: 'Learning guide', desc: 'Provides structured explanations and quizzes you on concepts.' },
                  { id: 'custom', label: 'Custom', desc: 'Define your own personality or research persona.' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setGoal(opt.id as any)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all border ${
                      goal === opt.id 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-400/20' 
                      : 'bg-neutral-100 dark:bg-neutral-800 border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {goal === opt.id && <Check size={14} />}
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                {goal === 'default' ? 'Best for general purpose research and brainstorming tasks.' : 
                 goal === 'learning_guide' ? 'Optimized for pedagogical clarity and interactive testing.' : 
                 'Provide a custom system prompt below.'}
              </p>
              
              {goal === 'custom' && (
                <textarea 
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  placeholder="e.g. Speak like a technical architect or focus only on legal implications."
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none min-h-[100px] resize-none text-neutral-800 dark:text-white"
                />
              )}
            </div>

            {/* Response Length */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Choose your response length</h3>
              <div className="flex gap-3">
                {[
                  { id: 'default', label: 'Default' },
                  { id: 'longer', label: 'Longer' },
                  { id: 'shorter', label: 'Shorter' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setLength(opt.id as any)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all border ${
                      length === opt.id 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-400/20' 
                      : 'bg-neutral-100 dark:bg-neutral-800 border-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {length === opt.id && <Check size={14} />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="p-6 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-bold transition-all shadow-lg shadow-blue-400/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Save Changes
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
