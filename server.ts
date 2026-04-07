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
import { initDb } from './src/lib/db';
import db from './src/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

config(); // Load environment variables

const JWT_SECRET = process.env.JWT_SECRET || 'nutech-neural-vault-secret-2026';

async function startServer() {
  // Initialize Database
  initDb();

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // --- FILE UPLOAD SETUP ---
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
    }
  });
  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit per file
  });
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    
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

  app.post('/api/auth/register', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    const { email, password, role } = req.body;
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'This identity is already registered in the vault.' });
    
    const id = uuidv4();
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password || 'password123', salt);
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO users (id, email, password, role, needs_password_reset, password_updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, hashedPassword, role || 'user', 1, now, now);
    
    res.json({ id, email, role: role || 'user' });
  });

  app.post('/api/auth/reset', authenticateToken, (req: any, res) => {
    const { newPassword, neverExpire } = req.body;
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    const now = Date.now();
    const neverExpireFlag = neverExpire ? 1 : 0;
    
    db.prepare('UPDATE users SET password = ?, needs_password_reset = 0, password_never_expires = ?, password_updated_at = ? WHERE id = ?')
      .run(hashedPassword, neverExpireFlag, now, req.user.id);
    
    res.json({ success: true });
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    const user = db.prepare(`
      SELECT u.*, p.custom_logo_url 
      FROM users u 
      LEFT JOIN user_preferences p ON u.id = p.user_id 
      WHERE u.id = ?
    `).get(req.user.id) as any;
    if (!user) return res.sendStatus(404);
    
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      needsPasswordReset: user.needs_password_reset === 1,
      passwordNeverExpires: user.password_never_expires === 1,
      passwordUpdatedAt: user.password_updated_at,
      customLogoUrl: user.custom_logo_url
    });
  });

  app.get('/api/users', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const users = db.prepare(`
      SELECT 
        u.id, 
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

  app.delete('/api/users/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (req.params.id === 'admin-id') return res.status(400).json({ error: 'Primary admin removal prohibited.' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/users/:id/reset', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('password123', salt);
    db.prepare('UPDATE users SET password = ?, needs_password_reset = 1 WHERE id = ?').run(hashedPassword, req.params.id);
    res.json({ success: true });
  });

  // --- DATA API ---

  app.get('/api/notebooks', authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    // Admins see everything, users see their own
    const notebooks = req.user.role === 'admin' 
      ? db.prepare('SELECT * FROM notebooks ORDER BY updated_at DESC').all()
      : db.prepare('SELECT * FROM notebooks WHERE owner_id = ? ORDER BY updated_at DESC').all(userId);
    
    // For each notebook, attach count of sources and notes for summary
    const mappedNotebooks = mapToCamel(notebooks);
    const enriched = mappedNotebooks.map((n: any) => {
      const sourcesCount = db.prepare('SELECT COUNT(*) as count FROM sources WHERE notebook_id = ?').get(n.id) as any;
      const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE notebook_id = ?').get(n.id) as any;
      return {
        ...n,
        sourcesCount: sourcesCount.count,
        notesCount: notesCount.count
      };
    });
    
    res.json(enriched);
  });

  app.post('/api/notebooks', authenticateToken, (req: any, res) => {
    const { title, description } = req.body;
    const id = uuidv4();
    const now = Date.now();
    db.prepare('INSERT INTO notebooks (id, owner_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, title, description || '', now, now);
    res.json({ id, title, description, createdAt: now, updatedAt: now });
  });

  app.delete('/api/notebooks/:id', authenticateToken, (req: any, res) => {
    const n = db.prepare('SELECT owner_id FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!n) return res.sendStatus(404);
    if (n.owner_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
    
    db.prepare('DELETE FROM notebooks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/notebooks/:id', authenticateToken, (req: any, res) => {
    const { title } = req.body;
    db.prepare('UPDATE notebooks SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), req.params.id);
    res.json({ success: true });
  });

  app.get('/api/notebooks/:id', authenticateToken, (req: any, res) => {
    const n = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!n) return res.sendStatus(404);
    if (n.owner_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
    
    const sources = db.prepare('SELECT * FROM sources WHERE notebook_id = ?').all(n.id);
    const notes = db.prepare('SELECT * FROM notes WHERE notebook_id = ?').all(n.id);
    const chatHistory = db.prepare('SELECT * FROM chat_messages WHERE notebook_id = ? ORDER BY created_at ASC').all(n.id);
    
    res.json(mapToCamel({
      ...n,
      sources,
      notes,
      chatHistory
    }));
  });

  app.post('/api/notebooks/:id/sources', authenticateToken, (req: any, res) => {
    const { title, content, type, fileUrl } = req.body;
    const sourceId = uuidv4();
    const now = Date.now();
    db.prepare('INSERT INTO sources (id, notebook_id, title, content, type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(sourceId, req.params.id, title, content, type, fileUrl || null, now);
    db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ id: sourceId, title, content, type, fileUrl, createdAt: now });
  });

  app.patch('/api/notebooks/:id/sources/:sourceId', authenticateToken, (req: any, res) => {
    const { title } = req.body;
    db.prepare('UPDATE sources SET title = ? WHERE id = ? AND notebook_id = ?').run(title, req.params.sourceId, req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notebooks/:id/notes', authenticateToken, (req: any, res) => {
    const { title, content } = req.body;
    const noteId = uuidv4();
    const now = Date.now();
    db.prepare('INSERT INTO notes (id, notebook_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(noteId, req.params.id, title, content, now);
    db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ id: noteId, title, content, createdAt: now });
  });

  app.patch('/api/notebooks/:id/notes/:noteId', authenticateToken, (req: any, res) => {
    const { title, content } = req.body;
    const now = Date.now();
    if (title !== undefined && content !== undefined) {
      db.prepare('UPDATE notes SET title = ?, content = ? WHERE id = ? AND notebook_id = ?').run(title, content, req.params.noteId, req.params.id);
    } else if (title !== undefined) {
      db.prepare('UPDATE notes SET title = ? WHERE id = ? AND notebook_id = ?').run(title, req.params.noteId, req.params.id);
    } else if (content !== undefined) {
      db.prepare('UPDATE notes SET content = ? WHERE id = ? AND notebook_id = ?').run(content, req.params.noteId, req.params.id);
    }
    db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/notebooks/:id/notes/:noteId', authenticateToken, (req: any, res) => {
    db.prepare('DELETE FROM notes WHERE id = ? AND notebook_id = ?').run(req.params.noteId, req.params.id);
    db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/notebooks/:id/sources/:sourceId', authenticateToken, (req: any, res) => {
    db.prepare('DELETE FROM sources WHERE id = ? AND notebook_id = ?').run(req.params.sourceId, req.params.id);
    db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notebooks/:id/chat', authenticateToken, (req: any, res) => {
    const { role, content } = req.body;
    const messageId = uuidv4();
    const now = Date.now();
    db.prepare('INSERT INTO chat_messages (id, notebook_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(messageId, req.params.id, role, content, now);
    db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
    res.json({ id: messageId, role, content, createdAt: now });
  });

  app.delete('/api/notebooks/:id/chat', authenticateToken, (req: any, res) => {
    db.prepare('DELETE FROM chat_messages WHERE notebook_id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/notebooks/:id/chat/:messageId/feedback', authenticateToken, (req: any, res) => {
    const { feedbackType, feedbackText } = req.body;
    try {
      db.prepare('UPDATE chat_messages SET feedback_type = ?, feedback_text = ? WHERE id = ? AND notebook_id = ?')
        .run(feedbackType, feedbackText, req.params.messageId, req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error('Feedback save failed:', e);
      res.status(500).json({ error: 'Database update failed' });
    }
  });

  app.get('/api/admin/feedback', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const feedbackList = db.prepare(`
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

  // GET all platform settings (public — used by login/landing pages)
  app.get('/api/settings', (req, res) => {
    try {
      const rows = db.prepare('SELECT key, value FROM platform_settings').all() as any[];
      const settings: Record<string, any> = {};
      for (const row of rows) {
        // Convert string values to proper types
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

  // PUT update platform settings (admin only)
  app.put('/api/settings', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const updates = req.body;
    const now = Date.now();
    const upsert = db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?');
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = camelToSnake(key);
      const dbValue = String(value);
      upsert.run(dbKey, dbValue, now, dbValue, now);
    }
    res.json({ success: true });
  });

  // POST upload platform logo (admin only)
  app.post('/api/settings/logo', authenticateToken, upload.single('logo'), (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const logoUrl = `/uploads/${req.file.filename}`;
    const now = Date.now();
    db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?')
      .run('logo_url', logoUrl, now, logoUrl, now);
    
    res.json({ logoUrl });
  });

  // POST upload platform chat background (admin only)
  app.post('/api/settings/background', authenticateToken, upload.single('background'), (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const chatBackgroundUrl = `/uploads/${req.file.filename}`;
    const now = Date.now();
    db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?')
      .run('chat_background_url', chatBackgroundUrl, now, chatBackgroundUrl, now);
    
    res.json({ chatBackgroundUrl });
  });

  // ═══════════════════════════════════════════════════════════
  // MASTER SOURCES API (Intelligence Assets)
  // ═══════════════════════════════════════════════════════════

  // GET all master sources (Global Assets)
  app.get('/api/master-sources', authenticateToken, (req, res) => {
    const sources = db.prepare('SELECT * FROM master_sources ORDER BY created_at DESC').all();
    res.json(mapToCamel(sources));
  });

  // POST upload master source (admin only)
  app.post('/api/admin/master-sources', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, content, type, fileUrl } = req.body;
    const id = uuidv4();
    const now = Date.now();
    
    db.prepare('INSERT INTO master_sources (id, title, content, type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, title, content, type, fileUrl || null, now);
    
    res.json({ id, title, content, type, fileUrl, createdAt: now });
  });

  // PATCH master source (admin only)
  app.patch('/api/admin/master-sources/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title } = req.body;
    db.prepare('UPDATE master_sources SET title = ? WHERE id = ?').run(title, req.params.id);
    res.json({ success: true });
  });

  // DELETE master source (admin only)
  app.delete('/api/admin/master-sources/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.prepare('DELETE FROM master_sources WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════
  // USER PREFERENCES API
  // ═══════════════════════════════════════════════════════════

  app.get('/api/users/:id/preferences', authenticateToken, (req: any, res) => {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') return res.sendStatus(403);
    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.params.id) as any;
    if (!prefs) return res.json({ userId: req.params.id });
    res.json({
      userId: prefs.user_id,
      displayName: prefs.display_name,
      customLogoUrl: prefs.custom_logo_url,
      theme: prefs.theme,
    });
  });

  app.put('/api/users/:id/preferences', authenticateToken, (req: any, res) => {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') return res.sendStatus(403);
    const { displayName, customLogoUrl, theme } = req.body;
    const now = Date.now();
    db.prepare(`INSERT INTO user_preferences (user_id, display_name, custom_logo_url, theme, created_at) 
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name = ?, custom_logo_url = ?, theme = ?`)
      .run(req.params.id, displayName || null, customLogoUrl || null, theme || 'system', now, displayName || null, customLogoUrl || null, theme || 'system');
    res.json({ success: true });
  });

  // Upload per-user custom logo (admin only)
  app.post('/api/users/:id/logo', authenticateToken, upload.single('logo'), (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const logoUrl = `/uploads/${req.file.filename}`;
    const now = Date.now();
    db.prepare(`INSERT INTO user_preferences (user_id, custom_logo_url, created_at) 
      VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET custom_logo_url = ?`)
      .run(req.params.id, logoUrl, now, logoUrl);
    
    res.json({ logoUrl });
  });

  // ═══════════════════════════════════════════════════════════
  // ADMIN NOTEBOOK CONTROLS
  // ═══════════════════════════════════════════════════════════

  // Admin force-delete any notebook
  app.delete('/api/admin/notebooks/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.prepare('DELETE FROM notebooks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Admin edit any notebook title/description
  app.put('/api/admin/notebooks/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, description } = req.body;
    const now = Date.now();
    if (title) db.prepare('UPDATE notebooks SET title = ?, updated_at = ? WHERE id = ?').run(title, now, req.params.id);
    if (description !== undefined) db.prepare('UPDATE notebooks SET description = ?, updated_at = ? WHERE id = ?').run(description, now, req.params.id);
    res.json({ success: true });
  });

  // --- UTILITY HELPERS ---
  function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }
  function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  }


  // URL Scraping Route
  app.post('/api/scrape', authenticateToken, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      
      // Remove script and style elements
      $('script, style').remove();
      
      const title = $('title').text() || 'Untitled Source';
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim();

      res.json({ title, content });
    } catch (error) {
      console.error('Scraping error:', error);
      res.status(500).json({ error: 'Failed to scrape URL' });
    }
  });

  // File Upload Route

  app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      let content = '';
      const title = req.file.originalname;
      let mimetype = req.file.mimetype;
      const fileUrl = `/uploads/${req.file.filename}`;
      const fileBuffer = fs.readFileSync(req.file.path);
      const ext = path.extname(title).toLowerCase();

      // Primary Detection: Filename Extension (High Confidence)
      if (ext === '.pdf') mimetype = 'application/pdf';
      else if (ext === '.docx') mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === '.xlsx') mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (ext === '.xls') mimetype = 'application/vnd.ms-excel';
      else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) {
        mimetype = `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`;
      } else if (ext === '.txt') mimetype = 'text/plain';

      // Secondary Detection: Magic Number / Signature (Fallback if extension is generic)
      const header = fileBuffer.slice(0, 10).toString('hex').toLowerCase();
      const headerText = fileBuffer.slice(0, 10).toString('utf-8');

      if (header.startsWith('89504e47')) mimetype = 'image/png';
      else if (header.startsWith('ffd8')) mimetype = 'image/jpeg';
      else if (headerText.startsWith('%PDF')) mimetype = 'application/pdf';
      else if (header.startsWith('504b0304') && (!mimetype || mimetype.includes('octet-stream'))) {
        if (ext === '.docx') mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === '.xlsx') mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      console.log(`[Upload] Processing: "${title}" (Extension: ${ext}, Final MIME: ${mimetype})`);

      if (mimetype === 'application/pdf') {
        const parser = new PDFParse({ data: fileBuffer });
        const data = await parser.getText();
        content = data.text;
        
        // Return as PDF type for native preview
        console.log(`[Upload] Success (PDF): "${title}"`);
        return res.json({ title, content, type: 'pdf', fileUrl });
      } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Word .docx
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        content = result.value;
      } else if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimetype === 'application/vnd.ms-excel') {
        // Excel .xlsx or .xls
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        let excelText = "";
        workbook.SheetNames.forEach(sheetName => {
          excelText += `\n--- Sheet: ${sheetName} ---\n`;
          const sheet = workbook.Sheets[sheetName];
          excelText += XLSX.utils.sheet_to_txt(sheet);
        });
        content = excelText;
      } else if (mimetype.startsWith('image/')) {
        // Automatically orchestrate the Best Available OCR (Local AI -> Cloud AI -> Tesseract)
        const base64 = fileBuffer.toString('base64');
        const dataUrl = `data:${mimetype};base64,${base64}`;

        try {
          console.log(`[Upload] Attempting Automated Transcription for: "${title}"`);
          content = await transcribeImageBest(dataUrl);
          
          // Fallback to Tesseract if Advanced/Cloud failed or returned empty
          if (!content || content === '[Transcription failed.]' || content === '') {
             console.log(`[Upload] AI engines unavailable, falling back to Fast OCR for: "${title}"`);
             const worker = await createWorker('eng');
             const { data: { text } } = await worker.recognize(fileBuffer);
             content = text.trim();
             await worker.terminate();
          }
        } catch (ocrError) {
          console.error('[Upload] Automated OCR pipeline failed, using last resort:', ocrError);
          const worker = await createWorker('eng');
          const { data: { text } } = await worker.recognize(fileBuffer);
          content = text.trim();
          await worker.terminate();
        }
        
        console.log(`[Upload] OCR Success: "${title}" (${content.length} chars)`);
        return res.json({ title, content: content || '[Visual Content]', type: 'image', fileUrl, dataUrl });
      } else if (mimetype === 'text/plain') {
        content = fileBuffer.toString('utf-8');
      } else {
        // Standard classification backup for return
        const checkExt = path.extname(title).toLowerCase();
        const isVisual = mimetype.startsWith('image/') || mimetype === 'application/pdf' || ['.jpg', '.jpeg', '.png', '.pdf'].includes(checkExt);
        
        // Fallback for unknown types - ensure we aren't sending binary junk
        const text = fileBuffer.toString('utf-8');
        // Simple heuristic: If it looks like binary or starts with specific signatures like 'JFIF', don't use it.
        if (text.includes('\u0000') || text.startsWith('\ufffd') || text.startsWith('JFIF') || isVisual) {
          content = isVisual ? `[NutechLM Note: This document is processed as a visual source. Use the Preview Modal to view its content.]` : 
                                `[NutechLM Note: This file type ("${mimetype}") could not be transcribed. Converting to PDF/Image for full view support.]`;
        } else {
          content = text;
        }
      }

      const finalExt = path.extname(title).toLowerCase();
      const finalType = (mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(finalExt)) ? 'image' : 
                        (mimetype === 'application/pdf' || finalExt === '.pdf') ? 'pdf' : 'text';

      // CRITICAL: NEVER return raw binary junk in the content field.
      if (finalType === 'image' || finalType === 'pdf') {
        if (content.match(/[^\x20-\x7E\s]/) || content.includes('JFIF') || content.includes('Exif')) {
           // We keep OCR if it looks like actual text, but if it has binary chars, we clear it and let the user see the visual original.
           if (content.length < 50 || content.includes('JFIF')) content = '[Visual Content]';
        }
      }

      res.json({ title, content, type: finalType, fileUrl });
    } catch (error) {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
