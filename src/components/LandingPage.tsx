import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Wind, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import DarkModeToggle from './DarkModeToggle';
import { useStore } from '../store';

export default function LandingPage() {
  const navigate = useNavigate();
  const isDarkMode = useStore((state) => state.isDarkMode);
  const platformSettings = useStore((state) => state.platformSettings);
  const currentUser = useStore((state) => state.currentUser);
  
  // Mouse Parallax Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 100, damping: 30 });
  const springY = useSpring(mouseY, { stiffness: 100, damping: 30 });

  const rotateX = useTransform(springY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [35, 55]); // Centered around 45 degrees

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseX.set((e.clientX / innerWidth) - 0.5);
      mouseY.set((e.clientY / innerHeight) - 0.5);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className="h-screen w-full bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 overflow-hidden flex flex-col font-sans selection:bg-blue-100 dark:selection:bg-brand-primary/30 selection:text-blue-900 dark:selection:text-blue-100 transition-colors duration-300">
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between px-12 py-8 z-50"
      >
        <div className="flex items-center gap-2.5">
          {(currentUser?.customLogoUrl || platformSettings.logoUrl) ? (
            <img src={currentUser?.customLogoUrl || platformSettings.logoUrl} alt="Logo" className="w-9 h-9 rounded-xl shadow-sm object-contain" />
          ) : (
            <div className="w-9 h-9 bg-brand-primary rounded-xl flex items-center justify-center shadow-sm">
              <Wind className="text-white" size={20} />
            </div>
          )}
          <span className="text-xl font-bold tracking-tighter uppercase">{platformSettings.platformName}</span>
        </div>
        <div className="flex items-center gap-6">
          <DarkModeToggle />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-full text-sm font-bold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-sm"
          >
            Get Started
          </motion.button>
        </div>
      </motion.nav>

      {/* Main Content */}
      <main className="flex-1 relative flex items-center px-12 md:px-24">
        {/* Left Side: Text Content */}
        <div className="w-full md:w-1/2 relative z-10 text-left">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-brand-primary/20 text-brand-primary dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-6 border border-blue-100 dark:border-brand-primary/30">
              Intelligence Reimagined
            </span>
            <h1 className="text-7xl md:text-8xl font-bold tracking-tighter leading-[0.95] mb-8 text-neutral-900 dark:text-neutral-100">
              Harness the <br />
              <span className="text-brand-primary">Power of Wind.</span>
            </h1>
            <p className="text-lg md:text-xl text-neutral-500 dark:text-neutral-400 max-w-md mb-10 leading-relaxed font-medium">
              A minimal workspace for deep research. Transform your scattered notes into a cohesive intelligence engine.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto px-10 py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 group shadow-xl shadow-brand-primary/20 transition-all"
              >
                Start Thinking
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto px-10 py-4 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-800 rounded-2xl font-bold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
              >
                Watch Demo
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Right Side: 3D Windmill Object */}
        <div className="hidden md:flex absolute right-0 top-0 bottom-0 w-1/2 items-center justify-center pointer-events-none overflow-hidden perspective-[1500px]">
          <motion.div 
            className="relative w-[500px] h-[700px] flex items-center justify-center"
            style={{ transformStyle: 'preserve-3d', rotateX, rotateY }}
          >
            {/* Windmill Tower (Base) */}
            <div className="absolute bottom-0 w-24 h-[550px] border-x border-t border-neutral-200 dark:border-neutral-800" 
                 style={{ 
                   transform: 'translateY(50px) translateZ(-50px)',
                   clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
                   background: isDarkMode 
                    ? 'linear-gradient(to top, #0a0a0a, #171717)' 
                    : 'linear-gradient(to top, #e5e5e5, #f5f5f5)'
                 }} 
            />

            {/* Base Platform */}
            <div className="absolute bottom-0 w-48 h-4 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full" 
                 style={{ transform: 'translateY(100px) rotateX(90deg) translateZ(-50px)' }} 
            />
            
            {/* Rotating Head & Blades Container */}
            <div className="absolute top-[150px] w-20 h-20 flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
              {/* Nacelle Tail (Back part) */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-16 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full shadow-lg"
                style={{ 
                  transform: 'translateZ(-30px)',
                  background: isDarkMode 
                    ? 'linear-gradient(to bottom, #171717, #0a0a0a)' 
                    : 'linear-gradient(to bottom, #f5f5f5, #e5e5e5)'
                }}
              />

              {/* Head of the windmill */}
              <div className="absolute inset-0 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg flex items-center justify-center" style={{ transform: 'translateZ(20px)' }}>
                <div className="w-12 h-12 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-100 dark:border-neutral-700" />
              </div>
              
              {/* Rotating Blades */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] flex items-center justify-center"
                style={{ transformStyle: 'preserve-3d', transform: 'translateZ(60px)' }}
              >
                {[0, 90, 180, 270].map((deg) => (
                  <div 
                    key={deg}
                    style={{ 
                      transform: `rotate(${deg}deg) rotateX(15deg)`,
                      background: 'linear-gradient(to right, rgba(37, 99, 235, 0.12), transparent)'
                    }}
                    className="absolute top-1/2 left-1/2 w-[280px] h-[60px] origin-left -translate-y-1/2 rounded-r-[30px] border-r border-t border-brand-primary/20 backdrop-blur-[1px]"
                  />
                ))}
                {/* Center Hub */}
                <div className="w-12 h-12 bg-white dark:bg-neutral-800 border-2 border-brand-primary/30 rounded-full shadow-2xl z-10 flex items-center justify-center" style={{ transform: 'translateZ(40px)' }}>
                  <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
                </div>
              </motion.div>
            </div>

            {/* Floating Data Particles */}
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: Math.random() * 600 - 300, 
                  y: Math.random() * 600 - 300,
                  z: Math.random() * 400 - 200,
                  opacity: 0 
                }}
                animate={{ 
                  x: [null, Math.random() * 800 - 400],
                  y: [null, Math.random() * 800 - 400],
                  opacity: [0, 0.6, 0],
                  scale: [0, 1.5, 0]
                }}
                transition={{ 
                  duration: 12 + Math.random() * 12, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="absolute w-1 h-1 bg-blue-500 rounded-full blur-[0.5px]"
              />
            ))}
          </motion.div>
        </div>

        {/* Bottom Decorative Element */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 2 }}
          className="absolute bottom-12 left-12 flex flex-col items-start gap-4"
        >
          <div className="w-12 h-[1px] bg-gradient-to-r from-brand-primary to-transparent" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-500">Minimal Intelligence Engine</span>
        </motion.div>
      </main>
    </div>
  );
}

