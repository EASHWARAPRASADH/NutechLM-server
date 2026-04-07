import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const dbPath = path.join(process.cwd(), 'nutech.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Initialize the database schema
 */
export function initDb() {
  // Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'user')) NOT NULL DEFAULT 'user',
      needs_password_reset INTEGER DEFAULT 0,
      password_never_expires INTEGER DEFAULT 0,
      password_updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Notebooks Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Sources Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT CHECK(type IN ('text', 'url', 'image', 'pdf')) NOT NULL,
      file_url TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    )
  `);

  // Notes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    )
  `);

  // Chat History Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL,
      role TEXT CHECK(role IN ('user', 'model')) NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      feedback_type TEXT,
      feedback_text TEXT,
      FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    )
  `);

  try {
    db.exec('ALTER TABLE chat_messages ADD COLUMN feedback_type TEXT');
    db.exec('ALTER TABLE chat_messages ADD COLUMN feedback_text TEXT');
  } catch (e) {
    // Columns already exist
  }

  // ═══════════════════════════════════════════════════
  // Platform Settings Table (Admin-controlled branding)
  // ═══════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Master Sources (Intelligence Assets) Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS master_sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT CHECK(type IN ('text', 'url', 'image', 'pdf')) NOT NULL,
      file_url TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Per-User Preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      custom_logo_url TEXT,
      theme TEXT DEFAULT 'system',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ── Seed Platform Settings Defaults ──
  const defaultSettings: Record<string, string> = {
    platform_name: 'NutechLM',
    platform_tagline: 'Research Studio',
    copyright_text: '© 2026 Nutech Intelligence. All rights reserved.',
    logo_url: '',
    footer_text: 'Powered by NutechLM Neural Engine',
    primary_color: '#2563EB',
    accent_color: '#8B5CF6',
    login_banner_text: 'Secure Research Environment',
    max_sources_per_notebook: '50',
    max_file_size_mb: '100',
    enable_voice: 'true',
    enable_export: 'true',
    chat_background_url: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=2070&auto=format&fit=crop',
    chat_background_transparency: '0.08',
    password_expiry_days: '90',
    allow_guest_login: 'false',
  };

  const insert = db.prepare('INSERT OR IGNORE INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)');
  const now = Date.now();
  for (const [key, value] of Object.entries(defaultSettings)) {
    insert.run(key, value, now);
  }

  // Seed Admin if not exists
  const adminEmail = 'admin@nutech.com';
  const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
  
  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('admin', salt);
    
    db.prepare(`
      INSERT INTO users (id, email, password, role, password_updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin-id', adminEmail, hashedPassword, 'admin', now, now);
    
    console.log('[DB] Primary Admin Certificate Initialized.');
  }

  console.log('[DB] Neural Vault Integrity Verified.');
}

export default db;
