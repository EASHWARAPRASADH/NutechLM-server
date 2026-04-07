import { useStore } from '../store';

/**
 * Global footer component that reads from admin-configured platform settings.
 * Renders copyright text and footer message from the database.
 */
export default function Footer() {
  const { platformSettings } = useStore();

  return (
    <footer className="w-full py-6 px-8 border-t border-neutral-100 dark:border-neutral-800 bg-white/50 dark:bg-neutral-950/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
          {platformSettings.copyrightText}
        </p>
        <p className="text-[10px] font-bold text-neutral-300 dark:text-neutral-600 uppercase tracking-widest">
          {platformSettings.footerText}
        </p>
      </div>
    </footer>
  );
}
