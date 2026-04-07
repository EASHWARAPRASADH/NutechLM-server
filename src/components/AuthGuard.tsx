import { useState, useMemo, ReactNode } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, KeyRound, AlertTriangle, CheckCircle2, Lock, Eye, EyeOff } from 'lucide-react';

function getPasswordStrength(password: string): { label: string; color: string; width: string; score: number } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '20%', score };
  if (score <= 2) return { label: 'Fair', color: 'bg-amber-500', width: '40%', score };
  if (score <= 3) return { label: 'Good', color: 'bg-blue-500', width: '60%', score };
  if (score <= 4) return { label: 'Strong', color: 'bg-green-500', width: '80%', score };
  return { label: 'Excellent', color: 'bg-emerald-500', width: '100%', score };
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { currentUser, isGuest, updatePassword, logout, systemSettings, isLoading } = useStore();
  const [isResetting, setIsResetting] = useState(false);
  const [neverExpire, setNeverExpire] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  // While initializing session, show nothing to prevent flashes
  if (isLoading) return null;

  // Guest traversal bypass
  if (isGuest) return <>{children}</>;

  if (!currentUser) return <>{children}</>;

  const expiryDays = systemSettings.passwordExpiryDays || 90;
  const daysPassed = Math.floor((Date.now() - currentUser.passwordUpdatedAt) / (24 * 60 * 60 * 1000));
  const isExpired = daysPassed >= expiryDays && !currentUser.passwordNeverExpires;
  const isExpiringSoon = daysPassed >= (expiryDays - 7) && daysPassed < expiryDays && !currentUser.passwordNeverExpires;
  const daysRemaining = expiryDays - daysPassed;
  const mustReset = isExpired || !!currentUser.needsPasswordReset;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && strength.score >= 2) {
      await updatePassword(newPassword, neverExpire);
      setNewPassword('');
      setIsResetting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {isExpiringSoon && !isExpired && !currentUser.needsPasswordReset && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white p-3 flex items-center justify-center gap-3 font-bold text-xs uppercase tracking-widest shadow-xl"
          >
            <AlertTriangle size={16} />
            Your password expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}. Please update it soon.
            <button 
              onClick={() => setIsResetting(true)}
              className="ml-4 px-3 py-1 bg-white text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
            >
              Update Now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(mustReset || isResetting) && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] bg-white dark:bg-neutral-950 flex items-center justify-center p-6 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-[2.5rem] p-10 border border-neutral-200 dark:border-neutral-800 shadow-2xl relative overflow-hidden"
            >
              {/* Security Background Decor */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl" />

              <div className="flex flex-col items-center text-center mb-8 relative">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6 text-blue-600">
                  <ShieldAlert size={32} />
                </div>
                <h2 className="text-2xl font-black tracking-tight mb-2">
                  {currentUser.needsPasswordReset ? 'Credential Update Required' : (isExpired ? 'Security Rotation Required' : 'Update Password')}
                </h2>
                <p className="text-neutral-500 text-sm leading-relaxed font-medium">
                  {currentUser.needsPasswordReset 
                    ? 'This is a pre-authorized account or your password was recently reset. Please establish a new secure credential to proceed.'
                    : (isExpired 
                        ? `Your password has reached the ${expiryDays}-day rotation limit. Please rotate your credentials to maintain studio access.`
                        : 'Security best practices recommend rotating your password regularly.')}
                </p>
              </div>

              <form onSubmit={handleReset} className="space-y-6 relative">
                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest ml-1">Establish New Password</label>
                  <div className="relative group">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input 
                      name="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl py-4 pl-12 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:text-white"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {newPassword.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-2 pt-1"
                    >
                      <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: strength.width }}
                          className={`h-full ${strength.color} rounded-full transition-all`}
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                          strength.score <= 1 ? 'text-red-500' : 
                          strength.score <= 2 ? 'text-amber-500' : 
                          strength.score <= 3 ? 'text-blue-500' : 'text-green-500'
                        }`}>
                          {strength.label}
                        </span>
                        <span className="text-[9px] text-neutral-400 font-medium">
                          Min 8 chars, uppercase, number, symbol
                        </span>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div 
                  onClick={() => setNeverExpire(!neverExpire)}
                  className="flex items-center gap-3 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:border-blue-500/50 transition-all group"
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${neverExpire ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}>
                    {neverExpire && <CheckCircle2 size={14} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">Password Never Expires</p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-black">Exclude from {expiryDays}-day rotation</p>
                  </div>
                  <Lock size={14} className="text-neutral-400" />
                </div>

                <button 
                  type="submit"
                  disabled={!newPassword || strength.score < 2}
                  className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-40 disabled:scale-100"
                >
                  Update & Initialize Session
                </button>
                
                {isResetting && !mustReset && (
                  <button 
                    type="button"
                    onClick={() => { setIsResetting(false); setNewPassword(''); }}
                    className="w-full text-neutral-400 text-[10px] font-black uppercase tracking-widest hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    Cancel update
                  </button>
                )}
                
                {mustReset && (
                  <button 
                    type="button"
                    onClick={() => { logout(); window.location.href = '/login'; }}
                    className="w-full text-neutral-400 text-[10px] font-black uppercase tracking-widest mt-8 hover:text-red-500 transition-colors"
                  >
                    Logout Session
                  </button>
                )}
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </>
  );
}
