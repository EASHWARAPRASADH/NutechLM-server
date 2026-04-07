import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useStore } from './store';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import NotebookView from './components/NotebookView';
import AdminPage from './components/AdminPage'; // Top-level administrative orchestrator
import ThemeHandler from './components/ThemeHandler';
import DragOverlay from './components/DragOverlay';
import AuthGuard from './components/AuthGuard';

export default function App() {
  const initSession = useStore((state) => state.initSession);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return (
    <Router>
      <ThemeHandler />
      <DragOverlay />
      <div className="min-h-screen font-sans bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors duration-300 overflow-x-hidden">
        <AuthGuard>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/notebook/:id" element={<NotebookView />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </AuthGuard>
      </div>
    </Router>
  );
}
