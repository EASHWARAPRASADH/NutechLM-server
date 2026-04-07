export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  password?: string;
  passwordUpdatedAt: number;
  passwordNeverExpires?: boolean;
  needsPasswordReset?: boolean;
  customLogoUrl?: string; // Admin-assigned personal/org logo
  createdAt: number;
}

export interface Source {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'url' | 'image' | 'pdf';
  fileUrl?: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: number;
  feedbackType?: 'up' | 'down';
  feedbackText?: string;
}

export interface Notebook {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  sources: Source[];
  selectedSourceIds: string[];
  notes: Note[];
  chatHistory: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  sourcesCount?: number;
  notesCount?: number;
}

export interface SystemSettings {
  allowGuestLogin: boolean;
  passwordExpiryDays: number;
  theme: 'light' | 'dark' | 'system';
}

// ═══════════════════════════════════════════
// Admin-Controlled Platform Configuration
// ═══════════════════════════════════════════

export interface PlatformSettings {
  platformName: string;
  platformTagline: string;
  copyrightText: string;
  logoUrl: string;
  footerText: string;
  primaryColor: string;
  accentColor: string;
  loginBannerText: string;
  maxSourcesPerNotebook: number;
  maxFileSizeMb: number;
  enableVoice: boolean;
  enableExport: boolean;
  aiModelMode: '14b' | '7b';
  chatBackgroundUrl?: string;
  chatBackgroundTransparency?: number;
  preferredVoice?: 'male1' | 'female1' | 'male2' | 'female2' | 'specialist';
  allowGuestLogin?: boolean;
}

export interface UserPreferences {
  userId: string;
  displayName?: string;
  customLogoUrl?: string;
  theme?: 'light' | 'dark' | 'system';
}
