import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Shield, ArrowRight, Loader2, KeyRound, AlertCircle, CheckCircle2, Globe } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const login = useStore(state => state.login);
  const platformSettings = useStore(state => state.platformSettings);
  const navigate = useNavigate();

  // Load saved email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('nutech-saved-email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Save or clear remembered email
    if (rememberMe) {
      localStorage.setItem('nutech-saved-email', email);
    } else {
      localStorage.removeItem('nutech-saved-email');
    }

    // Minor delay for premium feel
    await new Promise(r => setTimeout(r, 400));

    const result = await login(email, password);
    
    setIsLoading(false);

    if (result === 'success') {
      navigate('/dashboard');
    } else if (result === 'needs_reset') {
      navigate('/dashboard'); // AuthGuard will catch and force the reset modal
    } else {
      setError('Invalid email or password. Access denied.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 dark:opacity-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-[2.5rem] p-10 shadow-2xl border border-neutral-200 dark:border-neutral-800 relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          {platformSettings.logoUrl ? (
            <img src={platformSettings.logoUrl} alt="Logo" className="w-16 h-16 rounded-2xl shadow-xl object-contain mb-6" />
          ) : (
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-16 h-16 bg-neutral-900 dark:bg-white rounded-2xl flex items-center justify-center mb-6 text-white dark:text-neutral-900 shadow-xl"
            >
              <Shield size={32} />
            </motion.div>
          )}
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">{platformSettings.platformName}</h1>
          <p className="text-neutral-500 text-sm mt-1 uppercase tracking-widest font-bold">{platformSettings.loginBannerText}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-1">Corporate Email</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-neutral-900 dark:text-white"
                placeholder="admin@nutech.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Credential</label>
            </div>
            <div className="relative group">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-neutral-900 dark:text-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Remember Me / Save Toggle */}
          <div 
            onClick={() => setRememberMe(!rememberMe)}
            className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/30 rounded-xl border border-neutral-100 dark:border-neutral-800 cursor-pointer hover:border-blue-500/30 transition-all group"
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${rememberMe ? 'bg-brand-primary text-white shadow-md' : 'bg-neutral-200 dark:bg-neutral-700'}`}>
              {rememberMe && <CheckCircle2 size={13} />}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">Remember Email</p>
              <p className="text-[9px] text-neutral-400 uppercase tracking-widest font-black">Save for next session</p>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold"
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50 disabled:scale-100"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Initialize Access
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 pt-10 border-t border-neutral-100 dark:border-neutral-800 text-center space-y-4">
          {platformSettings.allowGuestLogin && (
            <button 
              onClick={() => {
                useStore.getState().setGuestMode(true);
                navigate('/dashboard');
              }}
              className="w-full py-4 px-6 bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all border border-blue-100 dark:border-blue-900/20 flex items-center justify-center gap-2 group"
            >
              <Globe size={14} className="group-hover:rotate-12 transition-transform" />
              Explore Global Intel (Guest)
            </button>
          )}

          <div className="flex flex-col gap-2 p-5 bg-neutral-50 dark:bg-neutral-800/30 rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-700">
            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Administrator Access Warning</p>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-500 leading-relaxed font-medium">
              Only pre-authorized user certificates can initialize sessions. For new credentials, contact the Nutech Intelligence Admin.
            </p>
            <div className="mt-2 pt-2 border-t border-neutral-200/50 dark:border-neutral-700/50">
              <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Support / Contact</p>
              <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mt-1">+91 98401 68832</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
