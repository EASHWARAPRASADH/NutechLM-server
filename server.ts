import { config } from 'dotenv';
import { initDb, db, supabase } from './src/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import multer from 'multer';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';
import { transcribeImageBest } from './src/lib/ai';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config(); 

import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'nutech-neural-vault-secret-2026';

let isDbInitialized = false;

async function ensureDb() {
  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error('[CRITICAL] Database Initialization Failed:', err);
      throw err;
    }
  }
}

// --- Lazy Init Middleware ---
app.use(async (req, res, next) => {
  try {
    if (req.path.startsWith('/api')) {
      await ensureDb();
    }
    next();
  } catch (err: any) {
    res.status(500).json({ 
      error: 'Neural Vault Initialization Failed', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      diagnostics: {
        hasDbUrl: !!process.env.SUPABASE_DB_URL,
        dbUrlPreview: process.env.SUPABASE_DB_URL ? process.env.SUPABASE_DB_URL.substring(0, 15) + '...' : 'MISSING'
      }
    });
  }
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CORS & STATIC ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

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

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

// ═══════════════════════════════════════════════════════════
// AUTH API
// ═══════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`[AUTH] Login attempt for: ${email}`);
  try {
    const user = await db.prepare('SELECT * FROM users WHERE email = ?::text').get(email) as any;
    
    if (!user) {
      console.log(`[AUTH] User not found: ${email}`);
      return res.status(401).json({ error: 'Identity not recognized or credential mismatch.' });
    }

    const matches = bcrypt.compareSync(password, user.password);
    if (!matches) {
      console.log(`[AUTH] Password mismatch for: ${email}`);
      return res.status(401).json({ error: 'Identity not recognized or credential mismatch.' });
    }

    console.log(`[AUTH] Login successful: ${email}`);
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
  } catch (error: any) {
    console.error('[AUTH] Login logic error:', error);
    res.status(500).json({ error: 'Login service momentarily unavailable' });
  }
});

app.post('/api/auth/register', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { name, email, password, role } = req.body;
  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'This identity is already registered.' });
  const id = uuidv4();
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password || 'password123', salt);
  const now = Date.now();
  await db.prepare('INSERT INTO users (id, name, email, password, role, needs_password_reset, password_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name || 'New Researcher', email, hashedPassword, role || 'user', 1, now, now);
  res.json({ id, name, email, role: role || 'user' });
});

app.post('/api/auth/reset', authenticateToken, async (req: any, res) => {
  const { newPassword, neverExpire } = req.body;
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(newPassword, salt);
  const now = Date.now();
  await db.prepare('UPDATE users SET password = ?, needs_password_reset = 0, password_never_expires = ?, password_updated_at = ? WHERE id = ?')
    .run(hashedPassword, neverExpire ? 1 : 0, now, req.user.id);
  res.json({ success: true });
});

app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
  const user = await db.prepare('SELECT u.*, p.custom_logo_url FROM users u LEFT JOIN user_preferences p ON u.id = p.user_id WHERE u.id = ?::text').get(req.user.id) as any;
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

// ═══════════════════════════════════════════════════════════
// NOTEBOOKS & CONTENT API
// ═══════════════════════════════════════════════════════════

app.get('/api/notebooks', authenticateToken, async (req: any, res) => {
  const notebooks = req.user.role === 'admin' 
    ? await db.prepare('SELECT * FROM notebooks ORDER BY updated_at DESC').all()
    : await db.prepare('SELECT * FROM notebooks WHERE owner_id = ? ORDER BY updated_at DESC').all(req.user.id);
  
  const enriched = await Promise.all(mapToCamel(notebooks).map(async (n: any) => {
    const s = await db.prepare('SELECT COUNT(*) as count FROM sources WHERE notebook_id = ?').get(n.id) as any;
    const nt = await db.prepare('SELECT COUNT(*) as count FROM notes WHERE notebook_id = ?').get(n.id) as any;
    return { ...n, sourcesCount: s.count, notesCount: nt.count };
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

app.get('/api/notebooks/:id', authenticateToken, async (req: any, res) => {
  const n = await db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id) as any;
  if (!n) return res.sendStatus(404);
  if (n.owner_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
  const sources = await db.prepare('SELECT * FROM sources WHERE notebook_id = ?').all(n.id);
  const notes = await db.prepare('SELECT * FROM notes WHERE notebook_id = ?').all(n.id);
  const chatHistory = await db.prepare('SELECT * FROM chat_messages WHERE notebook_id = ? ORDER BY created_at ASC').all(n.id);
  res.json(mapToCamel({ ...n, sources, notes, chatHistory }));
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

app.post('/api/notebooks/:id/chat', authenticateToken, async (req: any, res) => {
  const { role, content } = req.body;
  const messageId = uuidv4();
  const now = Date.now();
  await db.prepare('INSERT INTO chat_messages (id, notebook_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(messageId, req.params.id, role, content, now);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ id: messageId, role, content, createdAt: now });
});

// ═══════════════════════════════════════════════════════════
// SETTINGS & MASTER CONTENT
// ═══════════════════════════════════════════════════════════

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
  } catch (error) { res.json({}); }
});

app.get('/api/master-sources', authenticateToken, async (req, res) => {
  const sources = await db.prepare('SELECT * FROM master_sources ORDER BY created_at DESC').all();
  res.json(mapToCamel(sources));
});

// ═══════════════════════════════════════════════════════════
// UPLOAD & SCRAPE
// ═══════════════════════════════════════════════════════════

app.post('/api/upload', authenticateToken, upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const title = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const ext = path.extname(title).toLowerCase();
    let mimetype = req.file.mimetype;
    if (ext === '.pdf') mimetype = 'application/pdf';
    
    const fileName = `${req.user.id}/${Date.now()}-${title}`;
    await supabase.storage.from('LM').upload(fileName, fileBuffer, { contentType: mimetype, upsert: true });
    const { data: { publicUrl: fileUrl } } = supabase.storage.from('LM').getPublicUrl(fileName);

    let content = '';
    if (mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: fileBuffer });
      const data = await parser.getText();
      content = data.text;
    } else if (mimetype.startsWith('image/')) {
      content = await transcribeImageBest(`data:${mimetype};base64,${fileBuffer.toString('base64')}`);
      if (!content || content.includes('failed')) {
         const worker = await createWorker('eng');
         const { data: { text } } = await worker.recognize(fileBuffer);
         content = text.trim();
         await worker.terminate();
      }
    } else {
      content = fileBuffer.toString('utf-8');
    }
    res.json({ title, content, type: mimetype.startsWith('image/') ? 'image' : (mimetype === 'application/pdf' ? 'pdf' : 'text'), fileUrl });
  } catch (error: any) {
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// VITE & PRODUCTION SERVING
// ═══════════════════════════════════════════════════════════

const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

if (!isProd) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, 'dist');
  console.log('[PROD] Serving static assets from:', distPath);
  
  // Serve static assets with long-term caching
  app.use(express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    index: false // we handle index.html manually below
  }));
  
  // Handle SPA routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    
    // Set no-cache for index.html to ensure users always get the latest asset hashes
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ═══════════════════════════════════════════════════════════
// DEBUG DIAGNOSTICS (Temporary)
// ═══════════════════════════════════════════════════════════

app.get('/api/debug/db-diag', async (req, res) => {
  try {
    await ensureDb();
    const adminCheck = await db.prepare('SELECT email, role FROM users WHERE role = ?').get('admin') as any;
    const settingsCount = await db.prepare('SELECT COUNT(*) as count FROM platform_settings').get() as any;
    
    res.json({
      status: 'Online',
      database: 'Connected',
      diagnostics: {
        adminExists: !!adminCheck,
        adminEmail: adminCheck?.email || 'None',
        settingsCount: settingsCount?.count || 0,
        nodeEnv: process.env.NODE_ENV,
        hasVercelEnv: !!process.env.VERCEL
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: 'Error', error: err.message, stack: err.stack });
  }
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
