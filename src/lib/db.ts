import pkg from 'pg';
const { Pool } = pkg;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Supabase Client (for Storage)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Postgres Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase/Neon
  }
});

/**
 * Migration helper to initialize schemas
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log('[DB] Synchronizing Neural Vault with Cloud Postgres...');
    
    // Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        avatar_url TEXT,
        needs_password_reset INTEGER DEFAULT 0,
        password_never_expires INTEGER DEFAULT 0,
        password_updated_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);

    // Notebooks Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Sources Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        file_url TEXT,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
      )
    `);

    // Notes Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
      )
    `);

    // Chat History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        feedback_type TEXT,
        feedback_text TEXT,
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
      )
    `);

    // Platform Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    // Master Sources Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS master_sources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        file_url TEXT,
        created_at BIGINT NOT NULL
      )
    `);

    // Per-User Preferences
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        display_name TEXT,
        custom_logo_url TEXT,
        theme TEXT DEFAULT 'system',
        created_at BIGINT NOT NULL,
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

    const now = Date.now();
    for (const [key, value] of Object.entries(defaultSettings)) {
      await client.query(`
        INSERT INTO platform_settings (key, value, updated_at) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (key) DO NOTHING
      `, [key, value, now]);
    }

    // Seed Admin
    const adminEmail = 'admin@nutech.com';
    const adminCheck = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    
    if (adminCheck.rows.length === 0) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('admin', salt);
      await client.query(`
        INSERT INTO users (id, name, email, password, role, password_updated_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, ['admin-id', 'System Administrator', adminEmail, hashedPassword, 'admin', now, now]);
      console.log('[DB] Primary Admin Certificate Generated.');
    }

    console.log('[DB] Neural Vault Integrity Verified (Supabase Cloud).');
  } catch (err) {
    console.error('[DB] Migration Error:', err);
  } finally {
    client.release();
  }
}

/**
 * Compatibility wrapper to minimize changes in server.ts
 */
export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  prepare: (text: string) => {
    // This is a bridge for better-sqlite3 logic
    // Usage: db.prepare(sql).get(params) -> await db.prepare(sql).get(params)
    const sql = text.replace(/\?/g, (_, i) => `$${i + 1}`);
    return {
      get: async (...p: any[]) => {
        const res = await pool.query(sql, p);
        return res.rows[0];
      },
      all: async (...p: any[]) => {
        const res = await pool.query(sql, p);
        return res.rows;
      },
      run: async (...p: any[]) => {
        return pool.query(sql, p);
      }
    };
  }
};

export default db;
