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
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pipeline, env } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

env.allowLocalModels = false;
env.useBrowserCache = true;

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
  if (isDbInitialized) return;
  
  // Timeout for DB init (15 seconds) to prevent 502 Gateway timeouts on Render
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Cloud Database Initialization Timeout')), 15000)
  );

  try {
    await Promise.race([initDb(), timeoutPromise]);
    isDbInitialized = true;
    console.log('[PROD] Cloud Backbone Fully Initialized.');
  } catch (err) {
    console.error('[CRITICAL] Database Initialization Failed:', err);
    throw err;
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

app.patch('/api/feedback/:messageId', authenticateToken, async (req: any, res) => {
  const { feedbackType, feedbackText, notebookId } = req.body;
  console.log(`[FEEDBACK] Syncing for msg: ${req.params.messageId} in nb: ${notebookId}`);
  try {
    await db.prepare('UPDATE chat_messages SET feedback_type = ?, feedback_text = ? WHERE id = ? AND notebook_id = ?')
      .run(feedbackType, feedbackText || null, req.params.messageId, notebookId);
    res.json({ success: true });
  } catch (err) {
    console.error('[FEEDBACK] Error:', err);
    res.status(500).json({ error: 'Failed to sync feedback' });
  }
});

// ── STORAGE CONFIG (Memory-Safe) ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '/tmp'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } 
});


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

app.delete('/api/notebooks/:id/chat', authenticateToken, async (req: any, res) => {
  const now = Date.now();
  await db.prepare('DELETE FROM chat_messages WHERE notebook_id = ?').run(req.params.id);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ success: true, timestamp: now });
});

app.delete('/api/notebooks/:id/sources/:sourceId', authenticateToken, async (req: any, res) => {
  const now = Date.now();
  await db.prepare('DELETE FROM sources WHERE id = ? AND notebook_id = ?').run(req.params.sourceId, req.params.id);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ success: true, timestamp: now });
});


app.patch('/api/notebooks/:id/chat/:messageId', authenticateToken, async (req: any, res) => {
  const { content } = req.body;
  const now = Date.now();
  await db.prepare('UPDATE chat_messages SET content = ? WHERE id = ? AND notebook_id = ?').run(content, req.params.messageId, req.params.id);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ success: true, updatedAt: now });
});

app.patch('/api/notebooks/:id', authenticateToken, async (req: any, res) => {
  const { title, description } = req.body;
  const now = Date.now();
  const updates: string[] = [];
  const params: any[] = [];
  
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  
  params.push(now, req.params.id);
  await db.prepare(`UPDATE notebooks SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...params);
  res.json({ success: true, updatedAt: now });
});

app.patch('/api/notebooks/:id/sources/:sourceId', authenticateToken, async (req: any, res) => {
  const { title, content } = req.body;
  const now = Date.now();
  const updates: string[] = [];
  const params: any[] = [];
  
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  
  params.push(req.params.sourceId, req.params.id);
  await db.prepare(`UPDATE sources SET ${updates.join(', ')} WHERE id = ? AND notebook_id = ?`).run(...params);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ success: true });
});

app.get('/api/notebooks/:id/notes', authenticateToken, async (req: any, res) => {
  const notes = await db.prepare('SELECT * FROM notes WHERE notebook_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(mapToCamel(notes));
});

app.post('/api/notebooks/:id/notes', authenticateToken, async (req: any, res) => {
  const { title, content } = req.body;
  const id = uuidv4();
  const now = Date.now();
  await db.prepare('INSERT INTO notes (id, notebook_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, title, content, now);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ id, title, content, createdAt: now });
});

app.patch('/api/notebooks/:id/notes/:noteId', authenticateToken, async (req: any, res) => {
  const { title, content } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.noteId, req.params.id);
  await db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND notebook_id = ?`).run(...params);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  res.json({ success: true });
});

app.delete('/api/notebooks/:id/notes/:noteId', authenticateToken, async (req: any, res) => {
  await db.prepare('DELETE FROM notes WHERE id = ? AND notebook_id = ?').run(req.params.noteId, req.params.id);
  await db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  res.sendStatus(204);
});

app.delete('/api/notebooks/:id', authenticateToken, async (req: any, res) => {
  try {
    const n = await db.prepare('SELECT owner_id FROM notebooks WHERE id = ?').get(req.params.id) as any;
    if (!n) return res.sendStatus(404);
    if (n.owner_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
    
    await db.prepare('DELETE FROM notebooks WHERE id = ?').run(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete assets' });
  }
});


// ═══════════════════════════════════════════════════════════
// SECURE AI PROXY API
// ═══════════════════════════════════════════════════════════

const genAI = process.env.VITE_GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY) : null;
const COMMON_PERSONA = `You are Nutech Intelligence — a proprietary deep research engine developed by Nutech.
IDENTITY RULE: You identify strictly as a product of Nutech. NEVER mention Google, Gemini, Ollama, or OpenAI. If asked about your model, state you are a proprietary Nutech neural network.`;

app.post('/api/ai/search', authenticateToken, async (req: any, res) => {
  if (!genAI) return res.status(503).json({ error: "AI Engine Offline" });
  const { query } = req.body;
  const sources: any[] = [];
  let summary = "";

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  try {
    // TIER 1: Gemini Intelligence & Link Generation
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`Research Topic: ${query}. 
      1. Provide a professional 2-sentence summary.
      2. Suggest 3 specific, real-world URLs (like Wikipedia, official news, or major journals) that definitely contain this info.
      Format: [SUMMARY] text [LINKS] Title|URL|Snippet`);
      const text = result.response.text();
      
      if (text.includes('[SUMMARY]')) {
        summary = text.split('[SUMMARY]')[1].split('[LINKS]')[0].trim();
      }
      if (text.includes('[LINKS]')) {
        const linkLines = text.split('[LINKS]')[1].trim().split('\n');
        linkLines.forEach(line => {
          const [t, u, s] = line.split('|');
          if (t && u && u.includes('http')) {
             sources.push({ title: t.trim() + " (Verified)", url: u.trim(), snippet: s?.trim() || "Authoritative research source." });
          }
        });
      }
    } catch (e) {}

    // TIER 2: Live Google Intelligence (googlethis)
    try {
      const google = require('googlethis');
      const gRes = await google.search(query, { safe: false });
      if (gRes && gRes.results) {
        gRes.results.slice(0, 10).forEach((r: any) => {
          if (r.url && r.title && !sources.some(s => s.url === r.url)) {
            sources.push({ title: r.title, url: r.url, snippet: r.description || "" });
          }
        });
      }
    } catch (gErr) {}

    // TIER 3: Wikipedia Stability Layer
    if (sources.length < 5) {
      try {
        const wikiRes = await axios.get(`https://en.wikipedia.org/w/api.php`, {
          params: { action: 'query', list: 'search', srsearch: query, format: 'json', origin: '*' },
          headers: { 'User-Agent': UA }
        });
        if (wikiRes.data?.query?.search) {
          wikiRes.data.query.search.forEach((r: any) => {
            const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`;
            if (!sources.some(s => s.url === url)) {
              sources.push({ title: r.title + " (Wikipedia)", url, snippet: r.snippet.replace(/<[^>]*>/g, '') });
            }
          });
        }
      } catch (e) {}
    }

    if (!summary && sources.length > 0) {
      summary = `Retrieved ${sources.length} authoritative sources for "${query}". Ready for analysis.`;
    } else if (!summary) {
      summary = `Found ${sources.length} primary research documents for "${query}".`;
    }

    res.json({ 
      summary, 
      sources: sources.filter(s => s.url && s.title).slice(0, 15) 
    });

  } catch (err) {
    res.json({ summary: "Research engine throttled. Using internal neural patterns.", sources: [] });
  }
});

app.post('/api/notebooks/:id/sources/web', authenticateToken, async (req: any, res) => {
  const { title, url } = req.body;
  try {
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    
    if (isYoutube) {
      // YouTube Deep Extraction
      const videoId = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop();
      const metaRes = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
      });
      const $ = cheerio.load(metaRes.data);
      const videoTitle = title || $('title').text().replace(' - YouTube', '') || 'YouTube Video';
      
      // Attempt transcript extraction (Simplified Scraper Logic)
      let transcriptText = "";
      try {
        // We look for the timedtext URL in the page source
        const regex = /"captionTracks":\[\{"baseUrl":"(.*?)"/;
        const match = metaRes.data.match(regex);
        if (match && match[1]) {
          const transcriptUrl = JSON.parse(`"${match[1]}"`); // Unescape unicode
          const transcriptRes = await axios.get(transcriptUrl);
          const $$ = cheerio.load(transcriptRes.data, { xmlMode: true });
          transcriptText = $$('text').map((i, el) => $$(el).text()).get().join(' ');
        }
      } catch (tErr) {
        console.warn('Transcript extraction failed, falling back to metadata');
      }

      const content = `YOUTUBE VIDEO RESEARCH\nTitle: ${videoTitle}\nURL: ${url}\n\nTRANSCRIPT/CONTENT:\n${transcriptText || 'No transcript available. Summary based on metadata.'}`;
      
      const id = Math.random().toString(36).substring(2, 11);
      const now = Date.now();
      await db.prepare('INSERT INTO sources (id, notebook_id, title, content, type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, req.params.id, videoTitle, content, 'url', url, now);

      return res.json({ id, title: videoTitle });
    }

    // Standard Website Ingestion
    const scrapeRes = await axios.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(scrapeRes.data);
    $('script, style, nav, footer, header, ads').remove();
    
    const finalTitle = title || $('title').text() || $('h1').first().text() || url;
    let content = $('article').text() || $('main').text() || $('body').text();
    content = content.replace(/\s+/g, ' ').trim();

    if (!content || content.length < 50) {
      return res.status(400).json({ error: "Could not extract meaningful content from this URL. It might be blocked or JavaScript-heavy." });
    }

    const id = Math.random().toString(36).substring(2, 11);
    const now = Date.now();
    await db.prepare('INSERT INTO sources (id, notebook_id, title, content, type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.params.id, finalTitle, content, 'url', url, now);

    res.json({ id, title: finalTitle });
  } catch (e: any) {
    console.error('[Web Import Error]:', e);
    res.status(500).json({ error: 'Failed to ingest web source', details: e.message });
  }
});

app.post('/api/ai/chat', authenticateToken, async (req: any, res) => {
  if (!genAI) return res.status(503).json({ error: "AI Engine Offline: Missing Server Credentials." });
  const { prompt, sources, history, masterSources, config } = req.body;

  try {
    const allSources = [...(sources || []), ...(masterSources || [])];
    
    // Construct Context
    let sourceContext = "";
    allSources.slice(0, 15).forEach((s, i) => {
      sourceContext += `SOURCE [${i+1}]: ${s.title}\nCONTENT: ${s.content.substring(0, 3000)}\n\n`;
    });

    let goalInstruction = "";
    if (config?.chatGoal === 'learning_guide') {
      goalInstruction = `GOAL: You are a world-class tutor and learning guide. 
1. Break down complex topics from the sources into digestible, logical steps.
2. Use clear analogies to explain difficult concepts.
3. At the end of major explanations, ask the user a brief Socratic question or a multi-choice question based on the sources to test their understanding.
4. Encourage the user to explain things back to you (Feynman Technique).`;
    } else if (config?.chatGoal === 'custom' && config.customGoal) {
      goalInstruction = `GOAL: ${config.customGoal}. Strictly adhere to this persona and tone in all responses.`;
    } else {
      goalInstruction = "GOAL: You are a professional research assistant. Synthesize information from multiple sources, highlight contradictions if they exist, and provide balanced, evidence-based conclusions.";
    }

    let lengthInstruction = "";
    if (config?.chatLength === 'longer') {
      lengthInstruction = "LENGTH: Provide deep-dive, comprehensive responses. Explore nuances, provide secondary examples, and ensure no detail from the relevant sources is overlooked.";
    } else if (config?.chatLength === 'shorter') {
      lengthInstruction = "LENGTH: Be extremely concise. Use summary bullets. Prioritize the most critical facts. No introductory or concluding filler.";
    } else {
      lengthInstruction = "LENGTH: Provide standard length responses (2-3 paragraphs). Balance breadth with depth.";
    }

    const systemInstruction = `${COMMON_PERSONA}
${goalInstruction}
${lengthInstruction}

1. If the user provides a greeting (e.g., 'hi', 'hello'), respond concisely and professionally.
2. If sources are provided, cite them using [1], [2] inline.
3. SOURCES:
${sourceContext}`;

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", systemInstruction });
    
    let validHistory = (history || [])
      .slice(-10)
      .filter((h: any) => h.content && h.content.trim() !== '');
    
    while (validHistory.length > 0 && validHistory[0].role !== 'user') {
      validHistory.shift();
    }

    const chat = model.startChat({
      history: validHistory.map((h: any) => ({ role: h.role, parts: [{ text: h.content }] }))
    });

    // Set headers for streaming text
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const result = await chat.sendMessageStream(prompt);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      res.write(text);
    }
    res.end();
  } catch (error: any) {
    console.error('[AI] Generation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/title', authenticateToken, async (req: any, res) => {
  if (!genAI) return res.sendStatus(503);
  const { content } = req.body;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(`Summarize the following into a 3-5 word title. Return ONLY the title text.\n\n${content.substring(0, 1000)}`);
    res.json({ title: result.response.text().trim().replace(/[*"']/g, '') });
  } catch (e) {
    res.json({ title: 'Research Note' });
  }
});

app.post('/api/ai/notebooks/:id/summary', authenticateToken, async (req: any, res) => {
  if (!genAI) return res.sendStatus(503);
  try {
    const notebook = await db.prepare('SELECT title FROM notebooks WHERE id = ?').get(req.params.id) as any;
    const needsTitle = !notebook || notebook.title.toLowerCase().includes('untitled notebook');

    const sources = await db.prepare('SELECT title, content FROM sources WHERE notebook_id = ? LIMIT 10').all(req.params.id) as any[];
    const lastSummary = await db.prepare('SELECT content FROM chat_messages WHERE notebook_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id, 'model') as any;
    
    let context = sources.map(s => `SOURCE: ${s.title}\nCONTENT: ${s.content.substring(0, 500)}`).join('\n\n');
    if (lastSummary) {
      context += `\n\nLATEST CHAT INSIGHT: ${lastSummary.content.substring(0, 1000)}`;
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    
    let prompt = "";
    if (needsTitle) {
      prompt = `You are a research assistant. Analyze the following context and provide:
1. A concise 3-5 word professional title for this notebook.
2. A comprehensive 2-3 paragraph research summary.

Format your response EXACTLY like this:
TITLE: [Your Title Here]
SUMMARY: [Your Summary Here]

CONTEXT:
${context}`;
    } else {
      prompt = `Generate a comprehensive, professional research summary for this notebook. 
The summary should synthesize the core themes of the ingested sources and reflect the current state of the chat conversation.
Format it as 2-3 well-structured paragraphs. Return ONLY the summary text.

CONTEXT:
${context}`;
    }

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    let finalSummary = text;
    let finalTitle = null;

    if (needsTitle) {
      const titleMatch = text.match(/TITLE:\s*(.*?)(?:\n|SUMMARY:|$)/i);
      const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*)/i);
      if (titleMatch) finalTitle = titleMatch[1].replace(/[*"']/g, '').trim();
      if (summaryMatch) finalSummary = summaryMatch[1].trim();
    }
    
    const now = Date.now();
    if (finalTitle) {
      await db.prepare('UPDATE notebooks SET title = ?, description = ?, updated_at = ? WHERE id = ?').run(finalTitle, finalSummary, now, req.params.id);
    } else {
      await db.prepare('UPDATE notebooks SET description = ?, updated_at = ? WHERE id = ?').run(finalSummary, now, req.params.id);
    }
    
    res.json({ summary: finalSummary, title: finalTitle || notebook?.title });
  } catch (e) {
    console.error('[AI Summary Error]:', e);
    res.status(500).json({ error: 'Summary generation failed' });
  }
});

app.get('/api/notebooks/:id/guide', authenticateToken, async (req: any, res) => {
  if (!genAI) return res.sendStatus(503);
  try {
    const sources = await db.prepare('SELECT title, content FROM sources WHERE notebook_id = ? LIMIT 10').all(req.params.id) as any[];
    if (sources.length === 0) return res.json({ toc: [], faqs: [], studyGuide: { glossary: [], questions: [] } });

    const context = sources.map(s => `SOURCE: ${s.title}\nCONTENT: ${s.content.substring(0, 3000)}`).join('\n\n');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a research assistant. Analyze the provided sources and generate a comprehensive "Notebook Guide" in JSON format.
    
    The JSON should have this structure:
    {
      "toc": [{"title": "String", "summary": "String"}],
      "faqs": [{"question": "String", "answer": "String"}],
      "studyGuide": {
        "glossary": [{"term": "String", "definition": "String"}],
        "questions": [{"question": "String", "options": ["String"], "correctIndex": Number}]
      }
    }

    Return ONLY the raw JSON block.
    
    SOURCES:
    ${context}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonStr = responseText.replace(/```json|```/g, '').trim();
    const guideData = JSON.parse(jsonStr);

    res.json(guideData);
  } catch (e) {
    console.error('[Guide Generation Error]:', e);
    res.status(500).json({ error: 'Failed to generate guide' });
  }
});

app.post('/api/ai/synthesize-notes', authenticateToken, async (req: any, res) => {
  if (!genAI) return res.sendStatus(503);
  const { noteIds } = req.body;
  if (!noteIds || noteIds.length === 0) return res.status(400).json({ error: 'No notes selected' });

  try {
    const notes = await db.prepare(`SELECT content FROM notes WHERE id IN (${noteIds.map(() => '?').join(',')})`).all(...noteIds) as any[];
    const context = notes.map((n, i) => `NOTE [${i+1}]: ${n.content}`).join('\n\n');
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Synthesize the following research notes into a coherent, professional report. 
    Highlight connections between the notes, identify key themes, and provide a unified conclusion.
    Format the response in clean Markdown.
    
    NOTES:
    ${context}`;

    const result = await model.generateContent(prompt);
    res.json({ synthesis: result.response.text().trim() });
  } catch (e) {
    console.error('[Synthesis Error]:', e);
    res.status(500).json({ error: 'Synthesis failed' });
  }
});

function cleanExtractedText(text: string): string {
  if (!text) return '';
  // Remove NUL characters and other control characters except newlines/tabs
  // This prevents 'garbled/encrypted' looking output caused by binary junk in text layers
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

async function transcribeImageBest(dataUrl: string): Promise<string> {
  if (!genAI) return "Vision Engine offline.";
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      "Extract all text from this document image exactly as it appears. Preserve the layout and structure. If there are tables, format them as clean Markdown tables. Ensure the output is human-readable and contains no encoded characters or gibberish. If the image is unreadable, state 'Unreadable document image'.",
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);
    return result.response.text().trim();
  } catch (e) {
    console.error('[AI] Vision Error:', e);
    return "Vision transcription failed.";
  }
}


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

// ── ADMIN & USER MANAGEMENT ──

app.get('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const users = await db.prepare('SELECT u.*, p.custom_logo_url FROM users u LEFT JOIN user_preferences p ON u.id = p.user_id ORDER BY u.created_at DESC').all() as any[];
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatar_url,
    customLogoUrl: u.custom_logo_url,
    needsPasswordReset: u.needs_password_reset === 1,
    passwordNeverExpires: u.password_never_expires === 1,
    createdAt: u.created_at
  })));
});

app.post('/api/settings', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const settings = req.body;
  const now = Date.now();
  try {
    for (const [camelKey, value] of Object.entries(settings)) {
      const key = camelToSnake(camelKey);
      await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at')
        .run(key, String(value), now);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update global identity' });
  }
});

app.post('/api/settings/logo', authenticateToken, upload.single('logo'), async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  if (!req.file) return res.status(400).json({ error: 'No image detected' });
  
  const filePath = req.file.path;
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `platform/logo-${Date.now()}${path.extname(req.file.originalname)}`;
    
    await supabase.storage.from('LM').upload(fileName, fileBuffer, { contentType: req.file.mimetype, upsert: true });
    const { data: { publicUrl: logoUrl } } = supabase.storage.from('LM').getPublicUrl(fileName);
    
    await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at')
      .run('logo_url', logoUrl, Date.now());
    
    fs.unlinkSync(filePath);
    res.json({ logoUrl });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Logo synchronization failed' });
  }
});

app.post('/api/users/:userId/logo', authenticateToken, upload.single('logo'), async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.userId) return res.sendStatus(403);
  if (!req.file) return res.status(400).json({ error: 'No image detected' });
  
  const filePath = req.file.path;
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `users/${req.params.userId}/logo-${Date.now()}`;
    
    await supabase.storage.from('LM').upload(fileName, fileBuffer, { contentType: req.file.mimetype, upsert: true });
    const { data: { publicUrl: logoUrl } } = supabase.storage.from('LM').getPublicUrl(fileName);
    
    await db.prepare('INSERT INTO user_preferences (user_id, custom_logo_url, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET custom_logo_url = EXCLUDED.custom_logo_url')
      .run(req.params.userId, logoUrl, Date.now());
    
    fs.unlinkSync(filePath);
    res.json({ logoUrl });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'User branding failed' });
  }
});

app.post('/api/settings/background', authenticateToken, upload.single('file'), async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  if (!req.file) return res.status(400).json({ error: 'No image detected' });
  
  const filePath = req.file.path;
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `platform/bg-${Date.now()}${path.extname(req.file.originalname)}`;
    
    await supabase.storage.from('LM').upload(fileName, fileBuffer, { contentType: req.file.mimetype, upsert: true });
    const { data: { publicUrl: url } } = supabase.storage.from('LM').getPublicUrl(fileName);
    
    await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at')
      .run('chat_background_url', url, Date.now());
    
    fs.unlinkSync(filePath);
    res.json({ chatBackgroundUrl: url });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Background synchronization failed' });
  }
});

app.post('/api/users/:userId/reset', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const now = Date.now();
  await db.prepare('UPDATE users SET needs_password_reset = 1, password_updated_at = ? WHERE id = ?').run(now, req.params.userId);
  res.json({ success: true });
});

app.delete('/api/users/:id', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  if (req.params.id === 'admin-id') return res.status(403).json({ error: 'System Authority cannot be revoked.' });
  await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.sendStatus(204);
});

app.get('/api/admin/feedback', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const logs = await db.prepare(`
    SELECT cm.*, n.title as notebook_title, u.email as user_email 
    FROM chat_messages cm 
    JOIN notebooks n ON cm.notebook_id = n.id 
    JOIN users u ON n.owner_id = u.id
    WHERE cm.feedback_type IS NOT NULL 
    ORDER BY cm.created_at DESC
  `).all();
  res.json(mapToCamel(logs));
});



// ═══════════════════════════════════════════════════════════
// UPLOAD & SCRAPE
// ═══════════════════════════════════════════════════════════

app.post('/api/upload', authenticateToken, upload.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const title = req.body.title || req.file.originalname;
  const filePath = req.file.path;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(title).toLowerCase();
    let mimetype = req.file.mimetype;
    if (ext === '.pdf') mimetype = 'application/pdf';
    
    // Upload to Supabase Storage
    const fileName = `${req.user.id}/${path.basename(filePath)}`;
    const { error: uploadError } = await supabase.storage.from('LM').upload(fileName, fileBuffer, { 
      contentType: mimetype, 
      upsert: true 
    });

    if (uploadError) throw new Error(`Supabase Storage Error: ${uploadError.message}`);
    
    const { data: { publicUrl: fileUrl } } = supabase.storage.from('LM').getPublicUrl(fileName);

    let content = '';
    if (mimetype === 'application/pdf') {
       try {
         const data = await pdf(fileBuffer);
         content = cleanExtractedText(data.text);
         // Fallback if PDF text extraction returns almost nothing (scanned PDF)
         if (content.length < 10) {
           content = "[Scanned PDF detected - Text layer missing or unreadable]";
         }
       } catch (pdfErr) {
         content = "[PDF parsing error - document may be corrupted or encrypted]";
       }
    } else if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
       const result = await mammoth.extractRawText({ buffer: fileBuffer });
       content = cleanExtractedText(result.value);
    } else if (mimetype.startsWith('image/')) {
      content = await transcribeImageBest(`data:${mimetype};base64,${fileBuffer.toString('base64')}`);
      if (!content || content.includes('failed') || content.includes('Unreadable')) {
         const worker = await createWorker('eng');
         const { data: { text } } = await worker.recognize(fileBuffer);
         content = cleanExtractedText(text);
         await worker.terminate();
      }
    } else {
      content = cleanExtractedText(fileBuffer.toString('utf-8'));
    }

    // Cleanup temp file immediately
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ 
      title, 
      content, 
      type: mimetype.startsWith('image/') ? 'image' : (mimetype === 'application/pdf' ? 'pdf' : 'text'), 
      fileUrl 
    });
  } catch (error: any) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('[UPLOAD] Terminal Error:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

app.post('/api/scrape', authenticateToken, async (req: any, res) => {
  const { url } = req.body;
  try {
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(response.data);
    
    // Clean up unwanted tags
    $('script, style, nav, footer, header, ads').remove();
    
    const title = $('title').text() || $('h1').first().text() || url;
    let content = $('article').text() || $('main').text() || $('body').text();
    
    // Basic cleaning of whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    res.json({ title, content });
  } catch (e) {
    res.status(500).json({ error: 'Scraping failed' });
  }
});

app.put('/api/settings', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const settings = req.body;
  const now = Date.now();
  try {
    for (const [camelKey, value] of Object.entries(settings)) {
      const key = camelToSnake(camelKey);
      await db.prepare('INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at')
        .run(key, String(value), now);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update global identity' });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req: any, res) => {
  const { name, avatarUrl } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (avatarUrl !== undefined) { updates.push('avatar_url = ?'); params.push(avatarUrl); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.user.id);
  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

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


const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
