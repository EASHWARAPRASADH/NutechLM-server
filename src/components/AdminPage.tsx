import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, Key, Cpu, Users, ChevronLeft, LayoutDashboard, 
  Settings, Lock, Globe, Database, Activity, Terminal, 
  ExternalLink, CheckCircle2, AlertCircle, Save, RefreshCw,
  Trash2, UserCheck, Palette, Upload, Image as ImageIcon, ToggleLeft, ToggleRight, Zap, MessageSquare, ThumbsUp, ThumbsDown,
  Edit3, Maximize2, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { PlatformSettings } from '../types';
import axios from 'axios';
import SourcePreview from './SourcePreview';

/**
 * Administrative Command Center
 * God-Mode control over the entire NutechLM platform.
 */
export default function AdminPage() {
  const { 
    currentUser, notebooks, masterSources, users, systemSettings, platformSettings,
    updateSystemSettings, savePlatformSettings, fetchPlatformSettings, fetchMe,
    uploadPlatformBackground,
    logout, registerUser, resetUserPassword, deleteUser, fetchUsers, fetchNotebooks, deleteNotebook,
    addMasterSource, deleteMasterSource, updateMasterSource, setPreviewSourceId
  } = useStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'ai' | 'users' | 'master' | 'customization' | 'feedback'>('overview');
  const [localSettings, setLocalSettings] = useState(systemSettings);
  const [localPlatform, setLocalPlatform] = useState<PlatformSettings>(platformSettings);
  const [neuralCoreStatus, setNeuralCoreStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [masterUploadStatus, setMasterUploadStatus] = useState<{ uploading: boolean; progress: number; error: string | null }>({ uploading: false, progress: 0, error: null });
  const [securitySaveStatus, setSecuritySaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedAsset, setLastSavedAsset] = useState<string | null>(null);
  const masterFileRef = useRef<HTMLInputElement>(null);
  const [feedbackData, setFeedbackData] = useState<any[]>([]);

  // Sync localPlatform when platformSettings changes
  useEffect(() => { setLocalPlatform(platformSettings); }, [platformSettings]);
  useEffect(() => { setLocalSettings(systemSettings); }, [systemSettings]);

  // Prevent non-admins from viewing
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  // Refresh users on tab change
  useEffect(() => {
    if (currentUser?.role === 'admin') {
      if (activeTab === 'users') {
        fetchUsers();
        fetchNotebooks();
      }
      if (activeTab === 'feedback') {
        const token = localStorage.getItem('nutech-vault-token');
        axios.get('/api/admin/feedback', { headers: { Authorization: `Bearer ${token}` } })
          .then(res => setFeedbackData(res.data))
          .catch(err => console.error(err));
      }
    }
  }, [activeTab, currentUser, fetchUsers, fetchNotebooks]);

  // Check Neural Core Status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('http://localhost:11434/api/tags');
        setNeuralCoreStatus(res.ok ? 'online' : 'offline');
      } catch (e) {
        setNeuralCoreStatus('offline');
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveSecurity = async () => {
    setSecuritySaveStatus('saving');
    try {
      await updateSystemSettings(localSettings);
      setSecuritySaveStatus('saved');
    } catch (e) {
      setSecuritySaveStatus('idle');
    }
    setTimeout(() => setSecuritySaveStatus('idle'), 2000);
  };

  const handleSavePlatform = async () => {
    setSaveStatus('saving');
    await savePlatformSettings(localPlatform);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const token = localStorage.getItem('nutech-vault-token');
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.logoUrl) {
        setLocalPlatform(prev => ({ ...prev, logoUrl: data.logoUrl }));
        await savePlatformSettings({ logoUrl: data.logoUrl });
        fetchPlatformSettings();
      }
    } catch (err) {
      console.error('Logo upload failed:', err);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadPlatformBackground(file);
      if (url) {
        setLocalPlatform(prev => ({ ...prev, chatBackgroundUrl: url }));
      }
    } catch (err) {
      console.error('Background upload failed:', err);
    }
  };

  const handleUserLogoUpload = async (userId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const token = localStorage.getItem('nutech-vault-token');
      const res = await fetch(`/api/users/${userId}/logo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.logoUrl) {
        // Refetch users to see the change in the state
        fetchUsers();
        // If updating the current user's own logo, refresh their profile
        if (userId === currentUser?.id) {
          fetchMe();
        }
      }
    } catch (err) {
      console.error('User logo upload failed:', err);
    }
  };

  const handleMasterFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMasterUploadStatus({ uploading: true, progress: 0, error: `Initializing ${file.name}...` });

    try {
      const token = localStorage.getItem('nutech-vault-token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post('/api/upload', formData, {
        headers: { 'Authorization': `Bearer ${token}` },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
          setMasterUploadStatus(prev => ({ ...prev, progress: percent }));
        }
      });

      const data = res.data;
      const titleInput = document.getElementById('master-title') as HTMLInputElement;
      const contentInput = document.getElementById('master-content') as HTMLTextAreaElement;
      const typeInput = document.getElementById('master-type') as HTMLSelectElement;

      if (titleInput) titleInput.value = data.title || file.name;
      if (contentInput) contentInput.value = data.content;
      if (typeInput) {
        // Ensure the dropdown shows the correct type detected by the server
        const matchedOption = Array.from(typeInput.options).find(opt => opt.value === data.type);
        if (matchedOption) typeInput.value = data.type;
      }

      // Store fileUrl temporarily to use in push
      (window as any)._lastMasterFileUrl = data.fileUrl;

      setMasterUploadStatus({ uploading: false, progress: 0, error: `Synced: ${file.name}` });
    } catch (err) {
      setMasterUploadStatus({ uploading: false, progress: 0, error: 'Upload failed' });
    }
  };

  const stats = useMemo(() => {
    const totalSources = notebooks.reduce((acc, n) => acc + ((n as any).sourcesCount || 0), 0);
    const totalNotes = notebooks.reduce((acc, n) => acc + ((n as any).notesCount || 0), 0);
    const activeUsers = users.length;
    
    return [
      { id: 'users', label: 'Active Personnel', value: activeUsers, icon: Users, color: 'text-brand-primary', bg: 'bg-brand-primary/10' },
      { id: 'ai', label: 'Ingested Sources', value: totalSources, icon: Cpu, color: 'text-purple-500', bg: 'bg-purple-500/10' },
      { id: 'master', label: 'Master Sources', value: (masterSources || []).length, icon: Globe, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { id: 'ai', label: 'Research Depth', value: totalNotes, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    ];
  }, [notebooks, masterSources, users]);

  if (!currentUser || currentUser.role !== 'admin') return null;

  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-80 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col p-8">
        <div 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-4 mb-12 cursor-pointer group"
        >
          <div className="w-12 h-12 bg-neutral-900 dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-neutral-900 shadow-2xl group-hover:scale-105 transition-transform overflow-hidden p-0.5">
            {platformSettings.logoUrl ? (
              <img src={platformSettings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Shield size={24} />
            )}
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tighter leading-none text-neutral-900 dark:text-white uppercase">Command Center</h1>
            <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] mt-1.5 animate-pulse">ADMIN V3.0</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'ai', label: 'AI Intelligence', icon: Cpu },
            { id: 'security', label: 'Security Policy', icon: Lock },
            { id: 'users', label: 'User Assets', icon: Users },
            { id: 'master', label: 'Master Sources', icon: Globe },
            { id: 'customization', label: 'Customization', icon: Palette },
            { id: 'feedback', label: 'Feedback Logs', icon: MessageSquare },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all ${
                activeTab === item.id 
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xl' 
                  : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
              {activeTab === item.id && <motion.div layoutId="tab" className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-primary" />}
            </button>
          ))}
        </nav>

        <div className="pt-8 border-t border-neutral-100 dark:border-neutral-800">
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all uppercase tracking-widest"
          >
            <RefreshCw size={18} />
            Termination Session
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-24 px-12 border-b border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/dashboard')}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-neutral-400 group"
            >
              <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-2" />
            <span className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em]">{activeTab}</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-brand-primary/20 text-brand-primary rounded-full border border-blue-100 dark:border-blue-900/30">
              <div className={`w-2 h-2 rounded-full ${neuralCoreStatus === 'online' ? 'bg-brand-primary animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">Neural Core: {neuralCoreStatus.toUpperCase()}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-12">
          <AnimatePresence mode="wait">
            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === 'overview' && (
              <motion.div 
                key="overview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {stats.map((stat, i) => (
                    <button 
                      key={i} 
                      onClick={() => setActiveTab(stat.id as any)}
                      className="p-8 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-sm relative overflow-hidden group text-left transition-all hover:shadow-xl hover:-translate-y-1 active:scale-[0.98]"
                    >
                      <div className={`absolute top-0 right-0 w-24 h-24 ${stat.bg} rounded-bl-[4rem] flex items-center justify-center p-6 text-white transition-transform group-hover:scale-110`}>
                        <stat.icon size={32} className={stat.color} />
                      </div>
                      <h3 className="text-3xl font-black text-neutral-900 dark:text-white mb-2">{stat.value}</h3>
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{stat.label}</p>
                    </button>
                  ))}
                </div>

                <div className="p-10 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-[3rem] relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 p-12 opacity-5">
                    <Terminal size={200} />
                  </div>
                  <h2 className="text-4xl font-black mb-4 relative z-10 uppercase tracking-tight">Global System Pulse</h2>
                  <p className="text-neutral-400 dark:text-neutral-500 mb-8 max-w-md font-bold leading-relaxed">All localized intelligence nodes are operating within peak performance parameters. Security verified.</p>
                  <div className="flex gap-4 relative z-10">
                    <div className="px-6 py-3 bg-white/5 dark:bg-neutral-900/5 rounded-2xl flex items-center gap-3 border border-white/10 dark:border-neutral-900/10 backdrop-blur-md">
                      <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Neural Pipeline [LOCKED]</span>
                    </div>
                    <div className="px-6 py-3 bg-white/5 dark:bg-neutral-900/5 rounded-2xl flex items-center gap-3 border border-white/10 dark:border-neutral-900/10 backdrop-blur-md">
                      <div className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Access Node [AUTHORIZED]</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═══ AI INTELLIGENCE TAB ═══ */}
            {activeTab === 'ai' && (
              <motion.div 
                key="ai" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl space-y-12"
              >
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Neural Intelligence Hub</h2>
                  <p className="text-neutral-500 font-medium leading-relaxed italic">NutechLM autonomously optimizes local neuro-synaptic switching to provide maximum reasoning depth with zero external data leakage.</p>
                </div>

                <div className="p-12 bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 space-y-12 shadow-xl relative overflow-hidden">
                  {/* Neural Background Decoration */}
                  <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-brand-primary/5 to-transparent pointer-events-none" />
                  
                  <div className="flex items-center gap-8 relative z-10">
                    <div className="w-24 h-24 bg-neutral-900 dark:bg-white rounded-[2.5rem] flex items-center justify-center text-white dark:text-neutral-900 shadow-2xl relative group">
                      <div className="absolute inset-0 bg-brand-primary blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
                      <Cpu size={48} className="relative z-10" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <h3 className="text-3xl font-black uppercase tracking-tight leading-none">Neural Engine v4.0</h3>
                      </div>
                      <p className="text-[11px] font-black text-brand-primary uppercase tracking-[0.3em]">Status: Operational & Secured</p>
                    </div>
                  </div>

                  <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

                  <div className="space-y-10 relative z-10">
                    <div className="space-y-3">
                      <h3 className="text-2xl font-black uppercase tracking-tight">Neural Core Density</h3>
                      <p className="text-[11px] font-black text-neutral-400 uppercase tracking-widest leading-relaxed max-w-2xl">
                        Adjust the neuro-synaptic density of the active thinking core. Higher density provides multi-step reasoning capabilities but requires more local system resources.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* 14B CORE */}
                      <button 
                        onClick={() => setLocalPlatform(prev => ({ ...prev, aiModelMode: '14b' }))}
                        className={`text-left p-10 rounded-[3rem] border-2 transition-all duration-700 relative overflow-hidden group ${localPlatform.aiModelMode === '14b' ? 'bg-white dark:bg-neutral-900 border-brand-primary shadow-2xl scale-[1.02]' : 'bg-neutral-50 dark:bg-neutral-800/30 border-neutral-100 dark:border-neutral-800 opacity-60 hover:opacity-80'}`}
                      >
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-3">
                            <Shield size={28} className={localPlatform.aiModelMode === '14b' ? 'text-brand-primary' : 'text-neutral-400'} />
                            <span className="text-[11px] font-black uppercase tracking-widest text-neutral-400">Research Gold Standard</span>
                          </div>
                          {localPlatform.aiModelMode === '14b' && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-[10px] font-black uppercase tracking-tighter rounded-full shadow-lg">
                              <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                              Active Core
                            </div>
                          )}
                        </div>
                        <h4 className="text-3xl font-black italic tracking-tighter mb-3 uppercase">Full Intelligence (14B)</h4>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed mb-6">
                          The absolute gold standard for technical analysis. Perfect for complex cross-referencing, multi-step reasoning, and extreme citation precision.
                        </p>
                        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          <span className="flex items-center gap-1.5"><Activity size={12} /> High Density</span>
                          <span className="flex items-center gap-1.5"><Database size={12} /> 14.2B Params</span>
                        </div>
                        {localPlatform.aiModelMode === '14b' && (
                          <div className="absolute bottom-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Activity size={120} />
                          </div>
                        )}
                      </button>

                      {/* 7B CORE */}
                      <button 
                        onClick={() => setLocalPlatform(prev => ({ ...prev, aiModelMode: '7b' }))}
                        className={`text-left p-10 rounded-[3rem] border-2 transition-all duration-700 relative overflow-hidden group ${localPlatform.aiModelMode === '7b' ? 'bg-white dark:bg-neutral-900 border-brand-primary shadow-2xl scale-[1.02]' : 'bg-neutral-50 dark:bg-neutral-800/30 border-neutral-100 dark:border-neutral-800 opacity-60 hover:opacity-80'}`}
                      >
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-3">
                            <Zap size={28} className={localPlatform.aiModelMode === '7b' ? 'text-brand-primary' : 'text-neutral-400'} />
                            <span className="text-[11px] font-black uppercase tracking-widest text-neutral-400">Performance Tuned</span>
                          </div>
                          {localPlatform.aiModelMode === '7b' && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-[10px] font-black uppercase tracking-tighter rounded-full shadow-lg">
                              <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                              Active Core
                            </div>
                          )}
                        </div>
                        <h4 className="text-3xl font-black italic tracking-tighter mb-3 uppercase">High Performance (7B)</h4>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed mb-6">
                          Lightning-fast responses with low resource footprint. Ideal for M1/M2 Air machines and rapid-fire queries that require instant feedback.
                        </p>
                        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          <span className="flex items-center gap-1.5"><Zap size={12} /> Low Latency</span>
                          <span className="flex items-center gap-1.5"><Database size={12} /> 7.4B Params</span>
                        </div>
                        {localPlatform.aiModelMode === '7b' && (
                          <div className="absolute bottom-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Zap size={120} />
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-8 flex flex-col items-center gap-6">
                    <button 
                      onClick={handleSavePlatform}
                      disabled={saveStatus === 'saving'}
                      className="w-full md:w-auto px-20 flex items-center justify-center gap-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-6 rounded-[2.5rem] font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl disabled:opacity-50"
                    >
                      {saveStatus === 'saving' ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
                      {saveStatus === 'saving' ? 'Committing Neural Changes...' : saveStatus === 'saved' ? 'Platform Optimized' : 'Update Intelligence Profile'}
                    </button>
                    
                    <div className="p-10 bg-brand-primary dark:bg-brand-primary text-white rounded-[2.5rem] border border-white/20 flex items-start gap-6 shadow-2xl relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                        <Lock size={24} className="text-white" />
                      </div>
                      <div className="space-y-2 relative z-10">
                        <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                          Neural Safety Protocol v1.4
                          <span className="px-2 py-0.5 bg-white/20 rounded text-[8px]">Fail-over Enabled</span>
                        </h4>
                        <p className="text-[11px] text-white/90 font-bold leading-relaxed italic">
                          Intelligence Mode affects the entire platform instantly. If the 14B model runner crashes (Error 500) due to memory, the system will automatically fail-over to the 7B model for that specific request to ensure zero research downtime.
                        </p>
                      </div>
                      <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═══ SECURITY TAB ═══ */}
            {activeTab === 'security' && (
              <motion.div 
                key="security" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl space-y-12"
              >
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Security & Policies</h2>
                  <p className="text-neutral-500 font-medium italic">Fine-tune global authentication parameters and credential rotation cycles.</p>
                </div>

                <div className="p-12 bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 space-y-12 shadow-xl">
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase">Credential Rotation</h3>
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Global password expiration cycle</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-4xl font-black tabular-nums">{localSettings.passwordExpiryDays}</span>
                        <span className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">Days</span>
                      </div>
                    </div>
                    <input 
                      type="range" min="1" max="365"
                      value={localSettings.passwordExpiryDays}
                      onChange={(e) => setLocalSettings({ ...localSettings, passwordExpiryDays: parseInt(e.target.value) })}
                      className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full appearance-none accent-brand-primary outline-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-black text-neutral-300 uppercase tracking-[0.2em]">
                      <span>1 Day</span>
                      <span>180 Days</span>
                      <span>365 Days</span>
                    </div>
                  </div>

                  <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black uppercase">Guest Exploration</h3>
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Enable anonymous platform viewing</p>
                    </div>
                    <button 
                      onClick={() => setLocalSettings({ ...localSettings, allowGuestLogin: !localSettings.allowGuestLogin })}
                      className={`w-16 h-9 rounded-full transition-all relative ${localSettings.allowGuestLogin ? 'bg-brand-primary' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                    >
                      <motion.div 
                        animate={{ x: localSettings.allowGuestLogin ? 32 : 4 }}
                        className="absolute top-1.5 w-6 h-6 rounded-full bg-white shadow-lg"
                      />
                    </button>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleSaveSecurity}
                      disabled={securitySaveStatus === 'saving'}
                      className="w-full flex items-center justify-center gap-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-6 rounded-[2.5rem] font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl disabled:opacity-50"
                    >
                      {securitySaveStatus === 'saving' ? <RefreshCw size={20} className="animate-spin" /> : 
                       securitySaveStatus === 'saved' ? <CheckCircle2 size={20} className="text-green-500" /> : <Save size={20} />}
                      {securitySaveStatus === 'saving' ? 'Committing Security Updates...' : 
                       securitySaveStatus === 'saved' ? 'Security Optimized' : 'Commit Security Updates'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═══ USERS TAB ═══ */}
            {activeTab === 'users' && (
              <motion.div 
                key="users" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="space-y-16"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
                  {/* Creation Form */}
                  <div className="lg:col-span-1 space-y-8">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Provision Account</h2>
                      <p className="text-neutral-500 font-bold text-sm leading-relaxed italic">Issue new research certificates. Users will be prompted to establish a custom password upon first login.</p>
                    </div>

                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target as any;
                        const name = form.username.value;
                        const email = form.email.value;
                        const pass = form.password.value;
                        const role = form.role.value as any;
                        try {
                          await registerUser(name, email, pass, role);
                          setRegistrationStatus('success');
                          form.reset();
                          setTimeout(() => setRegistrationStatus('idle'), 3000);
                        } catch (err) {
                          setRegistrationStatus('error');
                          setTimeout(() => setRegistrationStatus('idle'), 3000);
                        }
                      }}
                      className="p-12 bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 space-y-8 shadow-xl"
                    >
                      <AnimatePresence>
                        {registrationStatus === 'success' && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="bg-green-500/10 border border-green-500/20 text-green-500 p-4 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest"
                          >
                            <CheckCircle2 size={16} />
                            Certificate Registered
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Full Name / Profile Name</label>
                        <input name="username" type="text" required className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-800 rounded-3xl py-5 px-6 text-sm font-bold focus:outline-none focus:ring-8 focus:ring-brand-primary/5 focus:border-brand-primary transition-all dark:text-white" placeholder="Dr. Sarah Connor" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Email ID</label>
                        <input name="email" type="email" required className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-800 rounded-3xl py-5 px-6 text-sm font-bold focus:outline-none focus:ring-8 focus:ring-brand-primary/5 focus:border-brand-primary transition-all dark:text-white" placeholder="researcher@nutech.com" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Initial Password</label>
                        <input name="password" type="text" required className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-800 rounded-3xl py-5 px-6 text-sm font-mono focus:outline-none focus:ring-8 focus:ring-brand-primary/5 focus:border-brand-primary transition-all dark:text-white" defaultValue="password123" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Authority Level</label>
                        <select name="role" className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-800 rounded-3xl py-5 px-6 text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-8 focus:ring-brand-primary/5 focus:border-brand-primary transition-all dark:text-white appearance-none cursor-pointer">
                          <option value="user">Standard Researcher</option>
                          <option value="admin">System Administrator</option>
                        </select>
                      </div>
                      <button type="submit" className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-6 rounded-3xl font-black uppercase tracking-widest text-[11px] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl">
                        Register Certificate
                      </button>
                    </form>
                  </div>

                  {/* User List */}
                  <div className="lg:col-span-2 space-y-8">
                    <div className="space-y-4">
                      <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Credential Auditing</h2>
                      <p className="text-neutral-500 font-bold text-sm leading-relaxed italic">Absolute oversight of all system identities and their security status.</p>
                    </div>

                    <div className="bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-2xl">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-neutral-50/50 dark:bg-neutral-800/50">
                            <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Identity</th>
                            <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Identity Branding</th>
                            <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Authority</th>
                            <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Status</th>
                            <th className="text-right py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Control</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {users.map((u) => (
                            <tr key={u.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors group">
                              <td className="py-7 px-10">
                                <div className="flex flex-col gap-1">
                                  <span className="font-bold text-neutral-900 dark:text-white text-base">{u.name || 'Unnamed Researcher'}</span>
                                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest font-bold">{u.email}</span>
                                </div>
                              </td>
                              <td className="py-7 px-10">
                                <div className="flex items-center gap-4 group/brand">
                                  <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm relative">
                                    {u.customLogoUrl || platformSettings.logoUrl ? (
                                      <img src={u.customLogoUrl || platformSettings.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                                    ) : (
                                      <Shield size={16} className="text-neutral-300" />
                                    )}
                                    {u.customLogoUrl && (
                                      <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-brand-primary border border-white dark:border-neutral-900 rounded-full" title="Custom Logo Active" />
                                    )}
                                  </div>
                                  <label className="opacity-0 group-hover/brand:opacity-100 transition-opacity cursor-pointer">
                                    <span className="text-[9px] font-black text-brand-primary uppercase underline tracking-widest">Update Logo</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUserLogoUpload(u.id, e)} />
                                  </label>
                                </div>
                              </td>
                              <td className="py-7 px-10">
                                <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-100 dark:border-red-900/30' : 'bg-blue-50 dark:bg-brand-primary/20 text-brand-primary border border-blue-100 dark:border-blue-900/30'}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-7 px-10">
                                {u.passwordNeverExpires ? (
                                  <span className="flex items-center gap-2 text-brand-primary text-[10px] font-black uppercase tracking-widest">
                                    <div className="w-2 h-2 rounded-full bg-brand-primary" />
                                    Never Expires
                                  </span>
                                ) : u.needsPasswordReset ? (
                                  <span className="flex items-center gap-2 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                    Reset Pending
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-2 text-green-500 text-[10px] font-black uppercase tracking-widest">
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    Secure
                                  </span>
                                )}
                              </td>
                              <td className="py-7 px-10 text-right">
                                <div className="flex items-center justify-end gap-3 text-neutral-400">
                                  <button 
                                    onClick={() => resetUserPassword(u.id)}
                                    title="Administrative Reset"
                                    className="p-3.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-brand-primary/20 rounded-2xl transition-all"
                                  >
                                    <Key size={18} />
                                  </button>
                                  {u.id !== 'admin-id' && (
                                    <button 
                                      onClick={() => {
                                        if (confirm(`Terminate access for ${u.email}?`)) {
                                          deleteUser(u.id);
                                        }
                                      }}
                                      title="Revoke Certificate"
                                      className="p-3.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  )}
                                  {u.id === 'admin-id' && (
                                    <div className="p-3.5 text-green-500">
                                      <UserCheck size={18} />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Notebooks Section */}
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Active Research Assets</h2>
                  <p className="text-neutral-500 font-bold text-sm leading-relaxed italic">Absolute visibility over all user-created notebooks and intelligence activities.</p>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-2xl mb-20">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-neutral-50/50 dark:bg-neutral-800/50">
                        <th className="text-left py-7 px-12 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Notebook Title</th>
                        <th className="text-left py-7 px-12 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Owner ID</th>
                        <th className="text-left py-7 px-12 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Sources</th>
                        <th className="text-left py-7 px-12 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Last Active</th>
                        <th className="text-right py-7 px-12 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {notebooks.map((n) => (
                        <tr key={n.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors group">
                          <td className="py-7 px-12 font-black text-lg text-neutral-900 dark:text-white">
                            {n.title}
                          </td>
                          <td className="py-7 px-12">
                            <span className="text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl text-neutral-500 font-black uppercase tracking-widest">{n.ownerId.toUpperCase()}</span>
                          </td>
                          <td className="py-7 px-12">
                            <span className="text-[10px] font-black text-brand-primary bg-blue-50 dark:bg-brand-primary/20 px-4 py-2 rounded-xl uppercase tracking-widest">{(n as any).sourcesCount || 0} Resources</span>
                          </td>
                          <td className="py-7 px-12">
                            <span className="text-xs text-neutral-400 font-black uppercase tracking-widest">{format(n.updatedAt, 'MMM d, HH:mm')}</span>
                          </td>
                          <td className="py-7 px-12 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => navigate(`/notebook/${n.id}`)}
                                className="p-4 text-neutral-300 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-brand-primary/20 rounded-2xl transition-all"
                                title="Open Notebook"
                              >
                                <ExternalLink size={20} />
                              </button>
                              <button 
                                onClick={() => {
                                  if (confirm(`Delete notebook "${n.title}"? This cannot be undone.`)) {
                                    deleteNotebook(n.id);
                                  }
                                }}
                                className="p-4 text-neutral-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all"
                                title="Delete Notebook"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {notebooks.length === 0 && (
                    <div className="p-24 text-center flex flex-col items-center gap-6">
                      <Database size={64} className="text-neutral-100 dark:text-neutral-800" />
                      <p className="text-neutral-400 font-black uppercase tracking-[0.3em] text-xs">No research assets indexed</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ═══ MASTER SOURCES TAB ═══ */}
            {activeTab === 'master' && (
              <motion.div 
                key="master" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl space-y-12 pb-20"
              >
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Master Sources</h2>
                  <p className="text-neutral-500 font-medium leading-relaxed italic">Deploy global intelligence assets that automatically enrich the reasoning context of all platform notebooks.</p>
                </div>

                {/* Deployment Center */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-6">
                    <div className="p-8 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 shadow-xl space-y-6">
                      <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
                        <Globe size={32} />
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Deploy New Asset</h3>
                      
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Asset Title</label>
                          <input 
                            type="text"
                            placeholder="e.g., Global Industry Report 2026"
                            id="master-title"
                            className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold focus:ring-2 focus:ring-brand-primary transition-all"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Asset Type</label>
                          <select 
                            id="master-type"
                            className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold focus:ring-2 focus:ring-brand-primary transition-all"
                            onChange={(e) => {
                              const container = document.getElementById('master-content-container');
                              const fileBtn = document.getElementById('master-file-trigger');
                              if (['pdf', 'image'].includes(e.target.value)) {
                                if (container) container.classList.add('hidden');
                                if (fileBtn) fileBtn.classList.remove('hidden');
                              } else {
                                if (container) container.classList.remove('hidden');
                                if (fileBtn) fileBtn.classList.add('hidden');
                              }
                            }}
                          >
                            <option value="text">Raw Intelligence (Text)</option>
                            <option value="url">External Node (URL)</option>
                            <option value="pdf">Document Asset (PDF/Office)</option>
                            <option value="image">Media Asset (Image)</option>
                          </select>
                        </div>

                        <input type="file" ref={masterFileRef} onChange={handleMasterFileUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" />
                        
                        <button 
                          id="master-file-trigger"
                          onClick={() => masterFileRef.current?.click()}
                          className="hidden w-full group aspect-video border-4 border-dashed border-neutral-100 dark:border-neutral-800 rounded-[2rem] flex flex-col items-center justify-center gap-4 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-900/10 transition-all cursor-pointer bg-white dark:bg-neutral-800"
                        >
                          <div className="w-16 h-16 bg-neutral-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center text-neutral-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-lg"><Upload size={24} /></div>
                          <div className="text-center px-4">
                            <p className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Cloud Ingestion</p>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-1">Deploy PDF, Media, Docs Globally</p>
                          </div>
                        </button>

                        <div className="space-y-1.5" id="master-content-container">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Intelligence Content / URL</label>
                          <textarea 
                            id="master-content"
                            placeholder="Enter the source data or full URL..."
                            className="w-full bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl px-5 py-3.5 text-sm font-bold focus:ring-2 focus:ring-brand-primary transition-all min-h-[120px]"
                          />
                        </div>

                        <button 
                          onClick={async () => {
                            const title = (document.getElementById('master-title') as HTMLInputElement).value;
                            const type = (document.getElementById('master-type') as HTMLSelectElement).value;
                            const content = (document.getElementById('master-content') as HTMLTextAreaElement).value;
                            
                            if (!title || !content) return alert('Asset parameters incomplete.');
                            
                            try {
                              const type = (document.getElementById('master-type') as HTMLSelectElement).value;
                              const fileUrl = (window as any)._lastMasterFileUrl;
                              
                              await addMasterSource({ 
                                title, 
                                content, 
                                type: type as any,
                                fileUrl: ['pdf', 'image'].includes(type) ? fileUrl : undefined
                              });
                              
                              // Clear form
                              (document.getElementById('master-title') as HTMLInputElement).value = '';
                              (document.getElementById('master-content') as HTMLTextAreaElement).value = '';
                              if (['pdf', 'image'].includes(type)) (window as any)._lastMasterFileUrl = undefined;
                              setMasterUploadStatus({ uploading: false, progress: 0, error: null });
                              alert('Master Intelligence Asset Deployed Globally.');
                            } catch (e) {
                              alert('Deployment failed.');
                            }
                          }}
                          className={`${masterUploadStatus.uploading ? 'opacity-50 cursor-not-allowed' : ''} w-full py-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl`}
                        >
                          {masterUploadStatus.uploading ? 'Synching Vault...' : 'Push to Global Pipeline'}
                        </button>

                        {masterUploadStatus.error && (
                          <div className="p-4 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-2xl flex items-center gap-3 border border-neutral-200 dark:border-neutral-700">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             <span className="text-[9px] font-black uppercase tracking-widest">{masterUploadStatus.error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                       <h3 className="text-xl font-black uppercase tracking-tight ml-4">Active Intelligence Nodes</h3>
                       <div className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                         {masterSources.length} Network Assets
                       </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {(!masterSources || masterSources.length === 0) ? (
                        <div className="p-12 text-center bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-dashed border-neutral-300 dark:border-neutral-700">
                          <Globe className="mx-auto text-neutral-300 mb-4 opacity-20" size={64} />
                          <p className="text-neutral-400 font-bold uppercase tracking-widest text-[10px]">No Master Sources Deployed</p>
                        </div>
                      ) : (
                        masterSources.map((source) => (
                          <div key={source.id} className="p-6 bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between group hover:shadow-lg transition-all">
                            <div className="flex items-center gap-5">
                              <div className="w-12 h-12 bg-neutral-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-400">
                                {source.type === 'url' && <Globe size={20} />}
                                {source.type === 'text' && <Terminal size={20} />}
                                {source.type === 'pdf' && <Database size={20} className="text-blue-500" />}
                                {source.type === 'image' && <ImageIcon size={20} className="text-purple-500" />}
                              </div>
                              <div>
                                <h4 
                                  className="font-black uppercase tracking-tight text-neutral-900 dark:text-white outline-none cursor-text hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 -ml-1 transition-colors"
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    const text = e.currentTarget.textContent?.trim();
                                    if (text && text !== source.title) {
                                      updateMasterSource(source.id, { title: text });
                                      setLastSavedAsset(source.id);
                                      setTimeout(() => setLastSavedAsset(null), 2000);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    }
                                  }}
                                >
                                  {source.title}
                                </h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest">{source.type} asset</span>
                                  <span className="w-1 h-1 rounded-full bg-neutral-300" />
                                  <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Added {format(source.createdAt || Date.now(), 'MMM dd, yyyy')}</span>
                                  <AnimatePresence>
                                    {lastSavedAsset === source.id && (
                                      <motion.span 
                                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                        className="text-[9px] font-black text-green-500 uppercase tracking-widest flex items-center gap-1"
                                      >
                                        <CheckCircle2 size={10} />
                                        Neural Link Synced
                                      </motion.span>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  // Find the H4 and focus it
                                  const h4 = (document.activeElement?.closest('.group')?.querySelector('h4')) as HTMLElement;
                                  if (h4) h4.focus();
                                }}
                                className="p-3 text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all"
                                title="Rename Asset"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button 
                                onClick={() => setPreviewSourceId(source.id)}
                                className="p-3 text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all"
                                title="Preview Asset"
                              >
                                <Maximize2 size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  if (confirm(`Revoke global access for ${source.title}?`)) {
                                    deleteMasterSource(source.id);
                                  }
                                }}
                                className="p-3 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                                title="Delete Asset"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═══ CUSTOMIZATION TAB ═══ */}
            {activeTab === 'customization' && (
              <motion.div 
                key="customization" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl space-y-12"
              >
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Platform Customization</h2>
                  <p className="text-neutral-500 font-medium italic">Control every visual element of the platform. Changes apply globally to all users.</p>
                </div>

                {/* BRANDING */}
                <div className="p-12 bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 space-y-10 shadow-xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-neutral-900 dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-neutral-900 shadow-xl">
                      <Palette size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight">Branding & Identity</h3>
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Logo, name, copyright, footer</p>
                    </div>
                  </div>

                  {/* Logo Upload Section */}
                  <div className="p-8 bg-neutral-50/50 dark:bg-neutral-800/30 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 flex items-center gap-10 shadow-inner group">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-3xl bg-white dark:bg-neutral-900 flex items-center justify-center border-4 border-white dark:border-neutral-800 overflow-hidden shadow-2xl relative z-10">
                        {localPlatform.logoUrl ? (
                          <img src={localPlatform.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                          <Shield size={32} className="text-neutral-200" />
                        )}
                      </div>
                      <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-brand-primary text-white rounded-2xl flex items-center justify-center shadow-xl border-4 border-white dark:border-neutral-900 z-20 transition-transform group-hover:scale-110">
                        <ImageIcon size={16} />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-tight">Identity Source</h4>
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">PNG, SVG, JPG • Transparent recommended</p>
                      </div>
                      
                      <label className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-brand-primary/20">
                        <Upload size={14} />
                        Update Identity
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Platform Name</label>
                      <input 
                        value={localPlatform.platformName}
                        onChange={(e) => setLocalPlatform(prev => ({ ...prev, platformName: e.target.value }))}
                        className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-lg font-black focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Tagline</label>
                      <input 
                        value={localPlatform.platformTagline}
                        onChange={(e) => setLocalPlatform(prev => ({ ...prev, platformTagline: e.target.value }))}
                        className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-lg font-black focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Copyright Text</label>
                    <input 
                      value={localPlatform.copyrightText}
                      onChange={(e) => setLocalPlatform(prev => ({ ...prev, copyrightText: e.target.value }))}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Footer Text</label>
                    <input 
                      value={localPlatform.footerText}
                      onChange={(e) => setLocalPlatform(prev => ({ ...prev, footerText: e.target.value }))}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Login Banner Text</label>
                    <input 
                      value={localPlatform.loginBannerText}
                      onChange={(e) => setLocalPlatform(prev => ({ ...prev, loginBannerText: e.target.value }))}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all dark:text-white"
                    />
                  </div>
                </div>

                {/* COLOR SCHEME */}
                <div className="p-12 bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 space-y-10 shadow-xl">
                  <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: localPlatform.primaryColor }} />
                    Color Scheme
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Primary Color</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="color" 
                          value={localPlatform.primaryColor}
                          onChange={(e) => setLocalPlatform(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="w-16 h-16 rounded-2xl cursor-pointer border-2 border-neutral-200 dark:border-neutral-700"
                        />
                        <input 
                          value={localPlatform.primaryColor}
                          onChange={(e) => setLocalPlatform(prev => ({ ...prev, primaryColor: e.target.value }))}
                          className="flex-1 bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-sm font-mono font-bold focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary dark:text-white uppercase"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Accent Color</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="color" 
                          value={localPlatform.accentColor}
                          onChange={(e) => setLocalPlatform(prev => ({ ...prev, accentColor: e.target.value }))}
                          className="w-16 h-16 rounded-2xl cursor-pointer border-2 border-neutral-200 dark:border-neutral-700"
                        />
                        <input 
                          value={localPlatform.accentColor}
                          onChange={(e) => setLocalPlatform(prev => ({ ...prev, accentColor: e.target.value }))}
                          className="flex-1 bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-sm font-mono font-bold focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary dark:text-white uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  {/* CHAT BACKGROUND */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 border-t border-neutral-100 dark:border-neutral-800 pt-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Chat Wallpaper</label>
                        <button 
                          onClick={() => {
                            const doodleUrl = 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=2070&auto=format&fit=crop';
                            setLocalPlatform(prev => ({ ...prev, chatBackgroundUrl: doodleUrl }));
                          }}
                          className="text-[9px] font-black text-brand-primary uppercase underline tracking-widest"
                        >
                          Apply WhatsApp Doodle
                        </button>
                      </div>
                      
                      {/* Wallpaper Preview */}
                      <div className="relative group/wp mb-4">
                        <div className="w-full h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 overflow-hidden relative">
                          {localPlatform.chatBackgroundUrl ? (
                            <div className="w-full h-full relative">
                              <img 
                                src={localPlatform.chatBackgroundUrl} 
                                alt="Wallpaper Preview" 
                                className="w-full h-full object-cover opacity-60 group-hover/wp:scale-110 transition-transform duration-700"
                              />
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                                <span className="px-3 py-1 bg-white/90 dark:bg-neutral-900/90 rounded-full text-[9px] font-black uppercase tracking-widest text-brand-primary shadow-lg">Current Wallpaper</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center italic text-neutral-400 text-[10px] uppercase tracking-widest">No Wallpaper Selected</div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <input 
                          value={localPlatform.chatBackgroundUrl || ''}
                          onChange={(e) => setLocalPlatform(prev => ({ ...prev, chatBackgroundUrl: e.target.value }))}
                          placeholder="e.g. wallpaper URL or upload below..."
                          className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary dark:text-white"
                        />
                        <label className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-2xl font-bold text-xs uppercase tracking-widest cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all border-2 border-dashed border-neutral-200 dark:border-neutral-700">
                          <Upload size={14} />
                          Upload Custom Wallpaper
                          <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" />
                        </label>
                      </div>
                    </div>
                    <div className="space-y-4">
                       <div className="flex items-center justify-between ml-2 mr-2">
                         <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Background Fade / Transparency</label>
                         <span className="text-xs font-black text-brand-primary tabular-nums">{Math.round((localPlatform.chatBackgroundTransparency || 0) * 100)}%</span>
                       </div>
                       <input 
                         type="range" min="0" max="1" step="0.05"
                         value={localPlatform.chatBackgroundTransparency || 0}
                         onChange={(e) => setLocalPlatform(prev => ({ ...prev, chatBackgroundTransparency: parseFloat(e.target.value) }))}
                         className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full appearance-none accent-brand-primary outline-none cursor-pointer"
                       />
                       <div className="flex justify-between text-[10px] font-black text-neutral-300 uppercase tracking-[0.2em] px-2">
                         <span>Darker Overlay</span>
                         <span>Lighter Overlay</span>
                       </div>
                    </div>
                  </div>

                  {/* Preview Strip */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Live Preview</label>
                    <div className="flex items-center gap-3 p-6 bg-neutral-50 dark:bg-neutral-800 rounded-3xl border border-neutral-100 dark:border-neutral-700">
                      <button className="px-6 py-3 rounded-2xl text-white font-black text-xs uppercase tracking-widest" style={{ backgroundColor: localPlatform.primaryColor }}>
                        Primary Button
                      </button>
                      <button className="px-6 py-3 rounded-2xl text-white font-black text-xs uppercase tracking-widest" style={{ backgroundColor: localPlatform.accentColor }}>
                        Accent Badge
                      </button>
                      <span className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: localPlatform.primaryColor + '20', color: localPlatform.primaryColor }}>
                        Citation [1]
                      </span>
                      <span className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: localPlatform.accentColor + '20', color: localPlatform.accentColor }}>
                        Citation [2]
                      </span>
                    </div>
                  </div>
                </div>

                {/* FEATURE TOGGLES */}
                <div className="p-12 bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 space-y-10 shadow-xl">
                  <h3 className="text-2xl font-black uppercase tracking-tight">Feature Controls</h3>

                  {[
                    { key: 'enableVoice', label: 'Voice Recognition', desc: 'Enable speech-to-text input in chat' },
                    { key: 'enableExport', label: 'Export Capability', desc: 'Allow users to export notebooks as Excel/Word' },
                  ].map((feature) => (
                    <div key={feature.key} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="text-lg font-black uppercase">{feature.label}</h4>
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{feature.desc}</p>
                      </div>
                      <button
                        onClick={() => setLocalPlatform(prev => ({ ...prev, [feature.key]: !(prev as any)[feature.key] }))}
                        className={`w-16 h-9 rounded-full transition-all relative ${(localPlatform as any)[feature.key] ? 'bg-brand-primary' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                      >
                        <motion.div
                          animate={{ x: (localPlatform as any)[feature.key] ? 32 : 4 }}
                          className="absolute top-1.5 w-6 h-6 rounded-full bg-white shadow-lg"
                        />
                      </button>
                    </div>
                  ))}

                  <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Max Sources Per Notebook</label>
                      <input 
                        type="number" min="1" max="500"
                        value={localPlatform.maxSourcesPerNotebook}
                        onChange={(e) => setLocalPlatform(prev => ({ ...prev, maxSourcesPerNotebook: parseInt(e.target.value) || 50 }))}
                        className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-2xl font-black tabular-nums focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-2">Max File Upload Size (MB)</label>
                      <input 
                        type="number" min="1" max="1000"
                        value={localPlatform.maxFileSizeMb}
                        onChange={(e) => setLocalPlatform(prev => ({ ...prev, maxFileSizeMb: parseInt(e.target.value) || 100 }))}
                        className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-neutral-100 dark:border-neutral-700 rounded-2xl py-4 px-6 text-2xl font-black tabular-nums focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* SAVE BUTTON */}
                <motion.button 
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleSavePlatform}
                  disabled={saveStatus === 'saving'}
                  className="w-full flex items-center justify-center gap-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-7 rounded-[2.5rem] font-black uppercase tracking-widest text-xs shadow-2xl disabled:opacity-50 transition-all mb-20"
                >
                  {saveStatus === 'saving' ? (
                    <><RefreshCw size={20} className="animate-spin" /> Committing Changes...</>
                  ) : saveStatus === 'saved' ? (
                    <><CheckCircle2 size={20} /> Changes Saved Successfully</>
                  ) : (
                    <><Save size={20} /> Commit All Customizations</>
                  )}
                </motion.button>
              </motion.div>
            )}

            {/* ═══ FEEDBACK TAB ═══ */}
            {activeTab === 'feedback' && (
              <motion.div 
                key="feedback" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl space-y-12 pb-20"
              >
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">AI Feedback Loop</h2>
                  <p className="text-neutral-500 font-medium italic">Global tracking of user satisfaction on Neural Inference responses.</p>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-[3.5rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-2xl">
                  {feedbackData.length === 0 ? (
                    <div className="p-24 text-center flex flex-col items-center gap-6">
                      <MessageSquare size={64} className="text-neutral-100 dark:text-neutral-800" />
                      <p className="text-neutral-400 font-black uppercase tracking-[0.3em] text-xs">No feedback submitted yet</p>
                    </div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-neutral-50/50 dark:bg-neutral-800/50">
                          <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Rating</th>
                          <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">User & Asset</th>
                          <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Comment</th>
                          <th className="text-left py-7 px-10 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">AI Context (Truncated)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {feedbackData.map((f: any) => (
                          <tr key={f.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                            <td className="py-7 px-10">
                              {f.feedback_type === 'up' ? (
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center">
                                  <ThumbsUp size={18} />
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-red-50 text-red-500 dark:bg-red-900/20 rounded-xl flex items-center justify-center">
                                  <ThumbsDown size={18} />
                                </div>
                              )}
                            </td>
                            <td className="py-7 px-10">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-neutral-900 dark:text-white text-sm">{f.user_email}</span>
                                <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">{f.notebook_title}</span>
                              </div>
                            </td>
                            <td className="py-7 px-10">
                              <p className="text-xs text-neutral-600 dark:text-neutral-300 font-medium italic max-w-xs">{f.feedback_text || 'No comment provided'}</p>
                            </td>
                            <td className="py-7 px-10">
                              <p className="text-[10px] text-neutral-400 font-mono bg-neutral-50 dark:bg-neutral-800 p-2.5 rounded-xl max-w-xs truncate">{f.content}</p>
                              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400 mt-2 block">{format(f.created_at, 'MMM d, yyyy HH:mm')}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <SourcePreview />
    </div>
  );
}
