import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { transcribeImageBest } from './src/lib/ai';
import { config } from 'dotenv';
import { initDb, db, supabase } from './src/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

config(); // Load environment variables

const JWT_SECRET = process.env.JWT_SECRET || 'nutech-neural-vault-secret-2026';

async function startServer() {
  // Initialize Database (Cloud Postgres)
  await initDb();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // ═══════════════════════════════════════════════════════════
  // OLLAMA PROXY (Resolves CORS & Connection Errors) — TOP LEVEL
  // ═══════════════════════════════════════════════════════════
  app.use('/api/ollama', async (req, res) => {
    // req.url contains the path after /api/ollama, e.g., /api/chat
    const subRoute = req.url.startsWith('/') ? req.url.substring(1) : req.url;
    const targetUrl = `http://localhost:11434/${subRoute}`;
    
    console.log(`[Ollama Proxy] ${req.method} -> ${targetUrl}`);
    
    try {
      const ollamaRes = await axios({
        method: req.method,
        url: targetUrl,
        data: req.method !== 'GET' ? req.body : undefined,
        responseType: (req.body && req.body.stream) ? 'stream' : 'json',
        timeout: 0
      });

      if (req.body && req.body.stream) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        ollamaRes.data.pipe(res);
      } else {
        res.json(ollamaRes.data);
      }
    } catch (error: any) {
      console.error(`[Ollama Proxy Error] Target: ${targetUrl}`, error.message);
      if (!res.headersSent) {
          res.status(500).json({ error: `Ollama unreachable at ${targetUrl}` });
      }
    }
  });

  // --- CORS SUPPORT ---
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // --- FILE UPLOAD SETUP (SUPABASE ENABLED) ---
  const storage = multer.memoryStorage();
  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit per file
  });

  // --- AUTH MIDDLEWARE ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  function mapToCamel(obj: any): any {
    if (Array.isArray(obj)) return obj.map(mapToCamel);
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
    const n: any = {};
    Object.keys(obj).forEach(k => {
      const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      n[ck] = mapToCamel(obj[k]);
    });
    return n;
  }

  // --- AUTH API ---

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Identity not recognized or credential mismatch.' });
    }
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        needsPasswordReset: user.needs_password_reset === 1,
        passwordNeverExpires: user.password_never_expires === 1,
        passwordUpdatedAt: user.password_updated_at
      }
    });
  });

  app.post('/api/auth/register', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    const { name, email, password, role } = req.body;
    const existing = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'This identity is already registered in the vault.' });
    
    const id = uuidv4();
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password || 'password123', salt);
    const now = Date.now();
    
    await db.prepare(`
      INSERT INTO users (id, name, email, password, role, needs_password_reset, password_updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name || 'New Researcher', email, hashedPassword, role || 'user', 1, now, now);
    
    res.json({ id, name, email, role: role || 'user' });
  });

  app.post('/api/auth/reset', authenticateToken, async (req: any, res) => {
    const { newPassword, neverExpire } = req.body;
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    const now = Date.now();
    const neverExpireFlag = neverExpire ? 1 : 0;
    
    await db.prepare('UPDATE users SET password = ?, needs_password_reset = 0, password_never_expires = ?, password_updated_at = ? WHERE id = ?')
      .run(hashedPassword, neverExpireFlag, now, req.user.id);
    
    res.json({ success: true });
  });

  app.put('/api/auth/profile', authenticateToken, async (req: any, res) => {
    const { name, avatarUrl } = req.body;
    if (name !== undefined) {
      await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    }
    if (avatarUrl !== undefined) {
      await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
    }
    res.json({ success: true });
  });

  app.post('/api/auth/avatar', authenticateToken, upload.single('avatar'), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
      const fileName = `avatars/${Date.now()}-${req.file.originalname}`;
      const { data, error } = await supabase.storage
        .from('vault')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('vault')
        .getPublicUrl(fileName);

      await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(publicUrl, req.user.id);
      res.json({ avatarUrl: publicUrl });
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      res.status(500).json({ error: 'Failed to upload avatar' });
    }
  });

  app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
    const user = await db.prepare(`
      SELECT u.*, p.custom_logo_url 
      FROM users u 
      LEFT JOIN user_preferences p ON u.id = p.user_id 
      WHERE u.id = ?
    `).get(req.user.id) as any;
    if (!user) return res.sendStatus(404);
    
    res.json({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatar_url,
      email: user.email,
      role: user.role,
      needsPasswordReset: user.needs_password_reset === 1,
      passwordNeverExpires: user.password_never_expires === 1,
      passwordUpdatedAt: user.password_updated_at,
      customLogoUrl: user.custom_logo_url
    });
  });

  app.get('/api/users', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const users = await db.prepare(`
      SELECT 
        u.id, 
        u.name,
        u.avatar_url as avatarUrl,
        u.email, 
        u.role, 
        u.needs_password_reset as needsPasswordReset, 
        u.password_never_expires as passwordNeverExpires, 
        u.password_updated_at as passwordUpdatedAt,
        p.custom_logo_url as customLogoUrl
      FROM users u
      LEFT JOIN user_preferences p ON u.id = p.user_id
    `).all();
    res.json(mapToCamel(users));
  });

  app.delete('/api/users/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (req.params.id === 'admin-id') return res.status(400).json({ error: 'Primary admin removal prohibited.' });
    await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/users/:id/reset', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('password123', salt);
    await db.prepare('UPDATE users SET password = ?, needs_password_reset = 1 WHERE id = ?').run(hashedPassword, req.params.id);
    res.json({ success: true });
  });

  // --- DATA API ---

  app.get('/api/notebooks', authenticateToken, async (req: any, res) => {
    const userId = req.user.id;
    // Admins see everything, users see their own
    const notebooks = req.user.role === 'admin' 
      ? await db.prepare('SELECT * FROM notebooks ORDER BY updated_at DESC').all()
      : await db.prepare('SELECT * FROM notebooks WHERE owner_id = ? ORDER BY updated_at DESC').all(userId);
    
    // For each notebook, attach count of sources and notes for summary
    const mappedNotebooks = mapToCamel(notebooks);
    const enriched = await Promise.all(mappedNotebooks.map(async (n: any) => {
      const sourcesCount = await db.prepare('SELECT COUNT(*) as count FROM sources WHERE notebook_id = ?').get(n.id) as any;
      const notesCount = await db.prepare('SELECT COUNT(*) as count FROM notes WHERE notebook_id = ?').get(n.id) as any;
      return {
        ...n,
        sourcesCount: sourcesCount.count,
        notesCount: notesCount.count
      };
    }));
    
    res.json(enriched);
  });

  app.post('/api/notebooks', authenticateToken, async (req: any, res) => {
    const { title, description } = req.body;
    const id = uuidv4();
    const now = Date.now();
    await db.prepare('INSERT INTO notebooks (id, owner_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, title, description || '', now, now);
    res.json({ id, title, description, createdAt: now, updatedAt: now });
  });

  app.delete('/api/notebooks/:id', authenticateToken, async (req: any, res) => {
    const n = await db.prepare('SELECT owner_id FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!n) return res.sendStatus(404);
    if (n.owner_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
    
    await db.prepare('DELETE FROM notebooks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/notebooks/:id', authenticateToken, async (req: any, res) => {
    const { title } = req.body;
    await db.prepare('UPDATE notebooks SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), req.params.id);
    res.json({ success: true });
  });

  app.get('/api/notebooks/:id', authenticateToken, async (req: any, res) => {
    const n = await db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!n) return res.sendStatus(404);
    if (n.owner_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
    
    const sources = await db.prepare('SELECT * FROM sources WHERE notebook_id = ?').all(n.id);
    const notes = await db.prepare('SELECT * FROM notes WHERE notebook_id = ?').all(n.id);
    const chatHistory = await db.prepare('SELECT * FROM chat_messages WHERE notebook_id = ? ORDER BY created_at ASC').all(n.id);
    
    res.json(mapToCamel({
      ...n,
      sources,
      notes,
      chatHistory
    }));
  });

  app.post('/api/notebooks/:id/sources', authenticateToken, async (req: any, res) => {
    const { title, content, type, fileUrl } = req.body;
    const sourceId = uuidv4();
    const now = Date.now();
    await db.prepare('INSERT INTO sources (id, notebook_id, title, content, type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(sourceId, req.params.id, title, content, type, fileUrl || null, now);
    await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ id: sourceId, title, content, type, fileUrl, createdAt: now });
  });

  app.patch('/api/notebooks/:id/sources/:sourceId', authenticateToken, async (req: any, res) => {
    const { title } = req.body;
    await db.prepare('UPDATE sources SET title = ? WHERE id = ? AND notebook_id = ?').run(title, req.params.sourceId, req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notebooks/:id/notes', authenticateToken, async (req: any, res) => {
    const { title, content } = req.body;
    const noteId = uuidv4();
    const now = Date.now();
    await db.prepare('INSERT INTO notes (id, notebook_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(noteId, req.params.id, title, content, now);
    await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ id: noteId, title, content, createdAt: now });
  });

  app.patch('/api/notebooks/:id/notes/:noteId', authenticateToken, async (req: any, res) => {
    const { title, content } = req.body;
    const now = Date.now();
    if (title !== undefined && content !== undefined) {
      await db.prepare('UPDATE notes SET title = ?, content = ? WHERE id = ? AND notebook_id = ?').run(title, content, req.params.noteId, req.params.id);
    } else if (title !== undefined) {
      await db.prepare('UPDATE notes SET title = ? WHERE id = ? AND notebook_id = ?').run(title, req.params.noteId, req.params.id);
    } else if (content !== undefined) {
      await db.prepare('UPDATE notes SET content = ? WHERE id = ? AND notebook_id = ?').run(content, req.params.noteId, req.params.id);
    }
    await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/notebooks/:id/notes/:noteId', authenticateToken, async (req: any, res) => {
    await db.prepare('DELETE FROM notes WHERE id = ? AND notebook_id = ?').run(req.params.noteId, req.params.id);
    await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/notebooks/:id/sources/:sourceId', authenticateToken, async (req: any, res) => {
    await db.prepare('DELETE FROM sources WHERE id = ? AND notebook_id = ?').run(req.params.sourceId, req.params.id);
    await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notebooks/:id/chat', authenticateToken, async (req: any, res) => {
    const { role, content } = req.body;
    const messageId = uuidv4();
    const now = Date.now();
    await db.prepare('INSERT INTO chat_messages (id, notebook_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(messageId, req.params.id, role, content, now);
    await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ id: messageId, role, content, createdAt: now });
  });

  app.delete('/api/notebooks/:id/chat', authenticateToken, async (req: any, res) => {
    await db.prepare('DELETE FROM chat_messages WHERE notebook_id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/notebooks/:id/chat/:messageId/feedback', authenticateToken, async (req: any, res) => {
    const { feedbackType, feedbackText } = req.body;
    try {
      await db.prepare('UPDATE chat_messages SET feedback_type = ?, feedback_text = ? WHERE id = ? AND notebook_id = ?')
        .run(feedbackType, feedbackText, req.params.messageId, req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error('Feedback save failed:', e);
      res.status(500).json({ error: 'Database update failed' });
    }
  });

  app.get('/api/admin/feedback', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const feedbackList = await db.prepare(`
      SELECT c.*, n.title as notebook_title, u.email as user_email
      FROM chat_messages c
      JOIN notebooks n ON c.notebook_id = n.id
      JOIN users u ON n.owner_id = u.id
      WHERE c.feedback_type IS NOT NULL
      ORDER BY c.created_at DESC
    `).all();
    res.json(feedbackList);
  });

  // ═══════════════════════════════════════════════════════════
  // PLATFORM SETTINGS API (Admin-controlled branding)
  // ═══════════════════════════════════════════════════════════

  // GET all platform settings
  app.get('/api/settings', async (req, res) => {
    try {
      const rows = await db.prepare('SELECT key, value FROM platform_settings').all() as any[];
      const settings: Record<string, any> = {};
      for (const row of rows) {
        if (row.value === 'true') settings[snakeToCamel(row.key)] = true;
        else if (row.value === 'false') settings[snakeToCamel(row.key)] = false;
        else if (!isNaN(Number(row.value)) && (row.key.match(/max_|_mb$/) || row.key.includes('days') || row.key.includes('transparency'))) 
          settings[snakeToCamel(row.key)] = Number(row.value);
        else settings[snakeToCamel(row.key)] = row.value;
      }
      res.json(settings);
    } catch (error) {
      res.json({});
    }
  });

  // PUT update platform settings
  app.put('/api/settings', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const updates = req.body;
    const now = Date.now();
    const upsert = await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?');
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = camelToSnake(key);
      const dbValue = String(value);
      await upsert.run(dbKey, dbValue, now, dbValue, now);
    }
    res.json({ success: true });
  });

  // POST upload platform logo
  app.post('/api/settings/logo', authenticateToken, upload.single('logo'), async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
      const fileName = `branding/${Date.now()}-${req.file.originalname}`;
      await supabase.storage.from('vault').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
      const { data: { publicUrl } } = supabase.storage.from('vault').getPublicUrl(fileName);
      
      const now = Date.now();
      await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?')
        .run('logo_url', publicUrl, now, publicUrl, now);
      
      res.json({ logoUrl: publicUrl });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  });

  // POST upload platform chat background
  app.post('/api/settings/background', authenticateToken, upload.single('background'), async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
      const fileName = `branding/${Date.now()}-${req.file.originalname}`;
      await supabase.storage.from('vault').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
      const { data: { publicUrl } } = supabase.storage.from('vault').getPublicUrl(fileName);
      
      const now = Date.now();
      await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?')
        .run('chat_background_url', publicUrl, now, publicUrl, now);
      
      res.json({ chatBackgroundUrl: publicUrl });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload background' });
    }
  });

  // GET all master sources
  app.get('/api/master-sources', authenticateToken, async (req, res) => {
    const sources = await db.prepare('SELECT * FROM master_sources ORDER BY created_at DESC').all();
    res.json(mapToCamel(sources));
  });

  // POST upload master source
  app.post('/api/admin/master-sources', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, content, type, fileUrl } = req.body;
    const id = uuidv4();
    const now = Date.now();
    await db.prepare('INSERT INTO master_sources (id, title, content, type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, title, content, type, fileUrl || null, now);
    res.json({ id, title, content, type, fileUrl, createdAt: now });
  });

  // PATCH master source
  app.patch('/api/admin/master-sources/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title } = req.body;
    await db.prepare('UPDATE master_sources SET title = ? WHERE id = ?').run(title, req.params.id);
    res.json({ success: true });
  });

  // DELETE master source
  app.delete('/api/admin/master-sources/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await db.prepare('DELETE FROM master_sources WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // GET user preferences
  app.get('/api/users/:id/preferences', authenticateToken, async (req: any, res) => {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') return res.sendStatus(403);
    const prefs = await db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.params.id) as any;
    if (!prefs) return res.json({ userId: req.params.id });
    res.json({
      userId: prefs.user_id,
      displayName: prefs.display_name,
      customLogoUrl: prefs.custom_logo_url,
      theme: prefs.theme,
    });
  });

  app.put('/api/users/:id/preferences', authenticateToken, async (req: any, res) => {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') return res.sendStatus(403);
    const { displayName, customLogoUrl, theme } = req.body;
    const now = Date.now();
    await db.prepare(`INSERT INTO user_preferences (user_id, display_name, custom_logo_url, theme, created_at) 
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name = ?, custom_logo_url = ?, theme = ?`)
      .run(req.params.id, displayName || null, customLogoUrl || null, theme || 'system', now, displayName || null, customLogoUrl || null, theme || 'system');
    res.json({ success: true });
  });

  // Upload per-user custom logo
  app.post('/api/users/:id/logo', authenticateToken, upload.single('logo'), async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
      const fileName = `logos/${Date.now()}-${req.file.originalname}`;
      await supabase.storage.from('vault').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
      const { data: { publicUrl } } = supabase.storage.from('vault').getPublicUrl(fileName);
      
      const now = Date.now();
      await db.prepare(`INSERT INTO user_preferences (user_id, custom_logo_url, created_at) 
        VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET custom_logo_url = ?`)
        .run(req.params.id, publicUrl, now, publicUrl);
      
      res.json({ logoUrl: publicUrl });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload user logo' });
    }
  });

  app.delete('/api/admin/notebooks/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await db.prepare('DELETE FROM notebooks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.put('/api/admin/notebooks/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, description } = req.body;
    const now = Date.now();
    if (title) await db.prepare('UPDATE notebooks SET title = ?, updated_at = ? WHERE id = ?').run(title, now, req.params.id);
    if (description !== undefined) await db.prepare('UPDATE notebooks SET description = ?, updated_at = ? WHERE id = ?').run(description, now, req.params.id);
    res.json({ success: true });
  });

  // ── SCRAPER ──
  app.post('/api/scrape', authenticateToken, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(response.data);
      $('script, style').remove();
      const title = $('title').text() || 'Untitled Source';
      const content = $('body').text().replace(/\s+/g, ' ').trim();
      res.json({ title, content });
    } catch (error) {
      res.status(500).json({ error: 'Failed to scrape URL' });
    }
  });

  // ── FILE UPLOAD (SUPABASE STORAGE) ──
  app.post('/api/upload', authenticateToken, upload.single('file'), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const title = req.file.originalname;
      const fileBuffer = req.file.buffer;
      const ext = path.extname(title).toLowerCase();
      let mimetype = req.file.mimetype;

      // Handle common extensions
      if (ext === '.pdf') mimetype = 'application/pdf';
      else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) mimetype = `image/${ext.replace('.','').replace('jpg','jpeg')}`;

      // Upload to Supabase Storage
      const fileName = `${req.user.id}/${Date.now()}-${title}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('vault')
        .upload(fileName, fileBuffer, { contentType: mimetype, upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl: fileUrl } } = supabase.storage.from('vault').getPublicUrl(fileName);

      let content = '';
      if (mimetype === 'application/pdf') {
        const parser = new PDFParse({ data: fileBuffer });
        const data = await parser.getText();
        content = data.text;
        return res.json({ title, content, type: 'pdf', fileUrl });
      } else if (mimetype.startsWith('image/')) {
        const base64 = fileBuffer.toString('base64');
        const dataUrl = `data:${mimetype};base64,${base64}`;
        content = await transcribeImageBest(dataUrl);
        if (!content || content.includes('failed')) {
           const worker = await createWorker('eng');
           const { data: { text } } = await worker.recognize(fileBuffer);
           content = text.trim();
           await worker.terminate();
        }
        return res.json({ title, content: content || '[Visual Content]', type: 'image', fileUrl });
      } else if (mimetype.includes('word') || ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        content = result.value;
      } else if (mimetype.includes('excel') || ext === '.xlsx') {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        content = workbook.SheetNames.map(s => XLSX.utils.sheet_to_txt(workbook.Sheets[s])).join('\n');
      } else {
        content = fileBuffer.toString('utf-8');
      }

      const finalType = mimetype.startsWith('image/') ? 'image' : (mimetype === 'application/pdf' ? 'pdf' : 'text');
      res.json({ title, content, type: finalType, fileUrl });
    } catch (error: any) {
      console.error('File processing error:', error);
      res.status(500).json({ error: 'Failed to process file' });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT_RUN = Number(process.env.PORT) || 3000;
  app.listen(PORT_RUN, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT_RUN}`);
  });
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

startServer();
