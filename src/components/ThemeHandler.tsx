import { useEffect } from 'react';
import { useStore } from '../store';

export default function ThemeHandler() {
  const isDarkMode = useStore((state) => state.isDarkMode);
  const platformSettings = useStore((state) => state.platformSettings);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    // Inject dynamic branding colors into root CSS variables
    const root = document.documentElement;
    if (platformSettings.primaryColor) {
      root.style.setProperty('--primary-hex', platformSettings.primaryColor);
    }
    if (platformSettings.accentColor) {
      root.style.setProperty('--accent-hex', platformSettings.accentColor);
    }
  }, [platformSettings.primaryColor, platformSettings.accentColor]);

  return null;
}
