import { create } from 'zustand';
import { Notebook, Source, User, SystemSettings, Note, PlatformSettings } from './types';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutech-vault-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface AppState {
  currentUser: User | null;
  notebooks: Notebook[];
  masterSources: Source[];
  systemSettings: SystemSettings;
  platformSettings: PlatformSettings;
  users: User[];
  isLoading: boolean;
  activeNotebookId: string | null;
  highlightedSourceId: string | null;
  draggedSource: Source | null;
  previewSourceId: string | null;
  isGuest: boolean;
  isDarkMode: boolean;

  initSession: () => Promise<void>;
  fetchMe: () => Promise<void>;
  login: (email: string, pass: string) => Promise<'success' | 'needs_reset' | false>;
  logout: () => void;
  updatePassword: (newPass: string, neverExpire?: boolean) => Promise<void>;
  updateProfile: (profile: { name?: string; avatarUrl?: string }) => Promise<void>;
  toggleDarkMode: () => void;
  
  fetchUsers: () => Promise<void>;
  registerUser: (name: string, email: string, pass: string, role: 'admin' | 'user') => Promise<void>;
  resetUserPassword: (id: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  fetchNotebooks: () => Promise<void>;
  fetchNotebookDetails: (id: string) => Promise<void>;
  setActiveNotebook: (id: string | null) => void;
  createNotebook: (title: string) => Promise<void>;
  updateNotebook: (id: string, updates: Partial<Notebook>) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;

  addSource: (notebookId: string, source: Omit<Source, 'id' | 'createdAt'>) => Promise<void>;
  updateSource: (notebookId: string, sourceId: string, updates: Partial<Source>) => Promise<void>;
  deleteSource: (notebookId: string, sourceId: string) => Promise<void>;
  toggleSourceSelection: (notebookId: string, sourceId: string) => void;
  selectAllSources: (notebookId: string) => void;
  deselectAllSources: (notebookId: string) => void;
  
  addNote: (notebookId: string, note: { title: string; content: string }) => Promise<string>;
  updateNote: (notebookId: string, noteId: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (notebookId: string, noteId: string) => Promise<void>;

  addChatMessage: (notebookId: string, message: { role: 'user' | 'model'; content: string }) => Promise<void>;
  updateChatMessage: (notebookId: string, messageId: string, content: string) => Promise<void>;
  updateChatFeedback: (notebookId: string, messageId: string, feedbackType: 'up' | 'down', feedbackText: string) => Promise<void>;
  clearChat: (notebookId: string) => Promise<void>;

  updateSystemSettings: (settings: SystemSettings) => void;
  setHighlightedSourceId: (id: string | null) => void;
  setDraggedSource: (source: Source | null) => void;
  setPreviewSourceId: (id: string | null) => void;

  // Platform Settings (Admin branding/customization)
  fetchPlatformSettings: () => Promise<void>;
  savePlatformSettings: (settings: Partial<PlatformSettings>) => Promise<void>;
  uploadPlatformBackground: (file: File) => Promise<string | null>;

  // Master Sources (Global Assets)
  fetchMasterSources: () => Promise<void>;
  addMasterSource: (source: Omit<Source, 'id' | 'createdAt'>) => Promise<void>;
  updateMasterSource: (id: string, updates: Partial<Source>) => Promise<void>;
  deleteMasterSource: (id: string) => Promise<void>;
  setGuestMode: (enabled: boolean) => void;
}

// Safe check for browser environment
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// Read initial dark mode preference
const getInitialDarkMode = (): boolean => {
  if (!isBrowser) return false;
  const stored = localStorage.getItem('nutech-dark-mode');
  if (stored !== null) return stored === 'true';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

const DEFAULT_PLATFORM: PlatformSettings = {
  platformName: 'NutechLM',
  platformTagline: 'Deep Research Engine',
  copyrightText: '© 2026 Nutech Intelligence. All rights reserved.',
  logoUrl: '',
  footerText: 'Powered by NutechLM Neural Engine',
  primaryColor: '#2563EB',
  accentColor: '#8B5CF6',
  loginBannerText: 'Secure Research Environment',
  maxSourcesPerNotebook: 50,
  maxFileSizeMb: 100,
  enableVoice: true,
  enableExport: true,
  aiModelMode: '14b',
  chatBackgroundUrl: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=2070&auto=format&fit=crop',
  chatBackgroundTransparency: 0.08,
  preferredVoice: 'male1',
};

const mapNotebook = (n: any): Notebook => ({
  id: n.id,
  ownerId: n.owner_id || n.ownerId || '',
  title: n.title,
  description: n.description || '',
  createdAt: n.created_at || n.createdAt,
  updatedAt: n.updated_at || n.updatedAt,
  sources: (n.sources || []).map((s: any) => ({
    ...s,
    fileUrl: s.file_url || s.fileUrl,
    createdAt: s.created_at || s.createdAt
  })),
  notes: (n.notes || []).map((nt: any) => ({
    ...nt,
    createdAt: nt.created_at || nt.createdAt
  })),
  chatHistory: (n.chatHistory || n.chat_history || []).map((c: any) => ({
    ...c,
    createdAt: c.created_at || c.createdAt,
    feedbackType: c.feedback_type,
    feedbackText: c.feedback_text
  })),
  selectedSourceIds: n.selectedSourceIds || [],
  sourcesCount: n.sourcesCount,
  notesCount: n.notesCount
});

export const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  notebooks: [],
  masterSources: [],
  systemSettings: { allowGuestLogin: false, passwordExpiryDays: 90, theme: 'system' },
  platformSettings: DEFAULT_PLATFORM,
  users: [],
  isLoading: true,
  isGuest: false,
  activeNotebookId: null,
  highlightedSourceId: null,
  draggedSource: null,
  previewSourceId: null,
  isDarkMode: getInitialDarkMode(),

  toggleDarkMode: () => {
    set((state) => {
      const next = !state.isDarkMode;
      if (isBrowser) localStorage.setItem('nutech-dark-mode', String(next));
      return { isDarkMode: next };
    });
  },

  initSession: async () => {
    // Fetch platform settings (public, no auth needed)
    get().fetchPlatformSettings();

    if (!isBrowser) return set({ isLoading: false });
    const token = localStorage.getItem('nutech-vault-token');
    try {
      const res = await api.get('/auth/me');
      set({ currentUser: res.data, isLoading: false, isGuest: false });
      get().fetchPlatformSettings();
      get().fetchMasterSources();
      get().fetchNotebooks();
    } catch (err) {
      if (isBrowser) localStorage.removeItem('nutech-vault-token');
      set({ currentUser: null, isLoading: false, isGuest: false });
    }
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/auth/me');
      set({ currentUser: res.data });
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  },

  login: async (email, pass) => {
    try {
      const res = await api.post('/auth/login', { email, password: pass });
      if (isBrowser) localStorage.setItem('nutech-vault-token', res.data.token);
      set({ currentUser: res.data.user, isGuest: false });
      get().fetchMasterSources();
      get().fetchNotebooks();
      if (res.data.user.needsPasswordReset) {
        return 'needs_reset';
      }
      return 'success';
    } catch (err) {
      return false;
    }
  },

  logout: () => {
    if (isBrowser) localStorage.removeItem('nutech-vault-token');
    set({ currentUser: null, notebooks: [], users: [], masterSources: [], isGuest: false });
  },

  updatePassword: async (newPass, neverExpire) => {
    await api.post('/auth/reset', { newPassword: newPass, neverExpire: !!neverExpire });
    const res = await api.get('/auth/me');
    set({ currentUser: res.data });
  },

  updateProfile: async (profile) => {
    await api.put('/auth/profile', profile);
    const res = await api.get('/auth/me');
    set({ currentUser: res.data });
  },

  fetchUsers: async () => {
    try {
      const res = await api.get('/users');
      set({ users: res.data });
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    }
  },

  registerUser: async (name, email, pass, role) => {
    await api.post('/auth/register', { name, email, password: pass, role });
    get().fetchUsers();
  },

  resetUserPassword: async (id) => {
    await api.post(`/users/${id}/reset`);
    get().fetchUsers();
  },

  deleteUser: async (id) => {
    await api.delete(`/users/${id}`);
    get().fetchUsers();
  },

  fetchNotebooks: async () => {
    if (get().isGuest) return;
    try {
      const res = await api.get('/notebooks');
      const newNotebooks = res.data.map(mapNotebook);
      set((state) => ({
        notebooks: newNotebooks.map(newNb => {
          const existing = state.notebooks.find(e => e.id === newNb.id);
          // Preserve full details (sources, notes, chat) if they already exist in the state
          return existing ? { 
            ...existing, 
            ...newNb, 
            sources: existing.sources.length > 0 ? existing.sources : newNb.sources,
            notes: existing.notes.length > 0 ? existing.notes : newNb.notes,
            chatHistory: existing.chatHistory.length > 0 ? existing.chatHistory : newNb.chatHistory,
            selectedSourceIds: existing.selectedSourceIds || []
          } : newNb;
        })
      }));
    } catch (e) {
      console.warn('Sync failed:', e);
    }
  },

  fetchNotebookDetails: async (id) => {
    try {
      const res = await api.get(`/notebooks/${id}`);
      const mapped = mapNotebook(res.data);
      set((state) => {
        const existing = state.notebooks.find(nb => nb.id === id);
        if (existing) {
          return { 
            notebooks: state.notebooks.map(nb => 
              nb.id === id ? { ...mapped, selectedSourceIds: existing.selectedSourceIds } : nb
            ) 
          };
        } else {
          return { notebooks: [...state.notebooks, mapped] };
        }
      });
    } catch (e) {
      console.error('Failed to fetch notebook details:', e);
    }
  },

  setActiveNotebook: (id) => set({ activeNotebookId: id }),
  createNotebook: async (title) => { await api.post('/notebooks', { title }); await get().fetchNotebooks(); },
  updateNotebook: async (id, updates) => { await api.patch(`/notebooks/${id}`, updates); await get().fetchNotebooks(); await get().fetchNotebookDetails(id); },
  deleteNotebook: async (id) => { await api.delete(`/notebooks/${id}`); await get().fetchNotebooks(); },

  addSource: async (nbId, source) => { await api.post(`/notebooks/${nbId}/sources`, source); await get().fetchNotebookDetails(nbId); },
  updateSource: async (nbId, sId, updates) => { await api.patch(`/notebooks/${nbId}/sources/${sId}`, updates); await get().fetchNotebookDetails(nbId); },
  deleteSource: async (nbId, sId) => { await api.delete(`/notebooks/${nbId}/sources/${sId}`); await get().fetchNotebookDetails(nbId); },

  toggleSourceSelection: (nbId, sId) => {
    set((state) => ({ 
      notebooks: state.notebooks.map(n => {
        if (n.id !== nbId) return n;
        const currentIds = n.selectedSourceIds || [];
        return { ...n, selectedSourceIds: currentIds.includes(sId) ? currentIds.filter(id => id !== sId) : [...currentIds, sId] };
      }) 
    }));
  },

  selectAllSources: (nbId) => {
    set((state) => ({
      notebooks: state.notebooks.map(n => n.id === nbId ? { ...n, selectedSourceIds: n.sources.map(s => s.id) } : n)
    }));
  },

  deselectAllSources: (nbId) => {
    set((state) => ({
      notebooks: state.notebooks.map(n => n.id === nbId ? { ...n, selectedSourceIds: [] } : n)
    }));
  },

  addNote: async (nbId, note) => { 
    const res = await api.post(`/notebooks/${nbId}/notes`, note); 
    await get().fetchNotebookDetails(nbId); 
    return res.data.id;
  },

  updateNote: async (nbId, ntId, updates) => { await api.patch(`/notebooks/${nbId}/notes/${ntId}`, updates); await get().fetchNotebookDetails(nbId); },
  deleteNote: async (nbId, ntId) => { await api.delete(`/notebooks/${nbId}/notes/${ntId}`); await get().fetchNotebookDetails(nbId); },

  addChatMessage: async (nbId, message) => {
    await api.post(`/notebooks/${nbId}/chat`, message);
    await get().fetchNotebookDetails(nbId);
  },
  
  updateChatMessage: async (nbId, msgId, content) => {
    await api.patch(`/notebooks/${nbId}/chat/${msgId}`, { content });
    await get().fetchNotebookDetails(nbId);
  },

  updateChatFeedback: async (nbId, messageId, feedbackType, feedbackText) => {
    await api.patch(`/notebooks/${nbId}/chat/${messageId}/feedback`, { feedbackType, feedbackText });
    await get().fetchNotebookDetails(nbId);
  },

  clearChat: async (nbId) => { await api.delete(`/notebooks/${nbId}/chat`); await get().fetchNotebookDetails(nbId); },

  updateSystemSettings: async (settings) => {
    try {
      await api.put('/settings', settings);
      set({ systemSettings: settings });
    } catch (e) {
      console.error('Failed to sync security settings:', e);
      throw e;
    }
  },
  setHighlightedSourceId: (id) => set({ highlightedSourceId: id }),
  setDraggedSource: (source) => set({ draggedSource: source }),
  setPreviewSourceId: (id) => set({ previewSourceId: id }),

  // ── Platform Settings ──
  fetchPlatformSettings: async () => {
    try {
      const res = await api.get('/settings');
      const settings = { ...DEFAULT_PLATFORM, ...res.data };
      set({ 
        platformSettings: settings,
        systemSettings: {
          ...get().systemSettings,
          allowGuestLogin: !!settings.allowGuestLogin,
          passwordExpiryDays: Number(settings.passwordExpiryDays) || 90
        }
      });
    } catch (e) {
      // Use defaults if endpoint not yet available
    }
  },

  setGuestMode: (enabled: boolean) => set({ isGuest: enabled, currentUser: null }),

  savePlatformSettings: async (settings) => {
    try {
      await api.put('/settings', settings);
      set((state) => ({ platformSettings: { ...state.platformSettings, ...settings } }));
    } catch (e) {
      console.error('Failed to save platform settings:', e);
    }
  },

  uploadPlatformBackground: async (file) => {
    const formData = new FormData();
    formData.append('background', file);
    try {
      const res = await api.post('/settings/background', formData);
      if (res.data.chatBackgroundUrl) {
        set((state) => ({ 
          platformSettings: { ...state.platformSettings, chatBackgroundUrl: res.data.chatBackgroundUrl } 
        }));
        return res.data.chatBackgroundUrl;
      }
      return null;
    } catch (e) {
      console.error('Background upload failed:', e);
      return null;
    }
  },

  // Master Sources
  fetchMasterSources: async () => {
    try {
      const res = await api.get('/master-sources');
      set({ masterSources: Array.isArray(res.data) ? res.data : [] });
    } catch (e) {
      console.warn('Failed to fetch master sources:', e);
    }
  },

  addMasterSource: async (source) => {
    await api.post('/admin/master-sources', source);
    get().fetchMasterSources();
  },

  updateMasterSource: async (id, updates) => {
    await api.patch(`/admin/master-sources/${id}`, updates);
    get().fetchMasterSources();
  },

  deleteMasterSource: async (id) => {
    await api.delete(`/admin/master-sources/${id}`);
    get().fetchMasterSources();
  }
}));