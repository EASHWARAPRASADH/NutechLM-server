import { pipeline, env } from '@xenova/transformers';
import { GoogleGenerativeAI } from '@google/generative-ai';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ═══════════════════════════════════════════════════════════════════════
// Technosprint Intelligence Engine — Cloud Native (Gemini 1.5 Flash)
// ═══════════════════════════════════════════════════════════════════════

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process as any).env?.GEMINI_API_KEY || (process as any).env?.VITE_GEMINI_API_KEY : null);
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// ═══════════════════════════════════════════════════════════════════════
// NEURAL VOICE CORE
// ═══════════════════════════════════════════════════════════════════════

let ttsPipeline: any = null;
let ttsPipelineTamil: any = null;

function encodeWAV(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (v: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) v.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buffer);
}

export async function generateSpeech(
  text: string, 
  voice: 'male1' | 'female1' | 'male2' | 'female2' | 'specialist' = 'male1'
): Promise<string | null> {
  try {
    const isTamil = /[\u0B80-\u0BFF]/.test(text);
    if (isTamil) {
      if (!ttsPipelineTamil) {
        ttsPipelineTamil = await pipeline('text-to-speech', 'Xenova/mms-tts-tam', { quantized: true });
      }
      const result = await ttsPipelineTamil(text.replace(/[*#_|~`]/g, ''), { speed: 0.85 });
      const wavBytes = encodeWAV(result.audio, result.sampling_rate);
      let binary = '';
      for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
      return btoa(binary);
    }
    if (!ttsPipeline) {
      ttsPipeline = await pipeline('text-to-speech', 'Xenova/vits-eng-vctk', { quantized: true });
    }
    const speakerMap: Record<string, number> = { male1: 4, female1: 10, male2: 11, female2: 16, specialist: 0 };
    const speakerId = speakerMap[voice] || 4;
    const cleanText = text.replace(/\[\d+\]/g, '').replace(/[*#_|~`]/g, '').replace(/\s{2,}/g, ' ').trim();
    const result = await ttsPipeline(cleanText, { speaker_id: speakerId, speed: 0.85 });
    const wavBytes = encodeWAV(result.audio, result.sampling_rate);
    let binary = '';
    for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
    return btoa(binary);
  } catch (e) {
    console.error('Neural Voice transition failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SEMANTIC CORE (RAG)
// ═══════════════════════════════════════════════════════════════════════

let embeddingPipeline: any = null;
const embeddingCache = new Map<string, { chunk: string, embedding: number[] }[]>();

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  }
  return embeddingPipeline;
}

function chunkText(text: string, maxTokens: number = 300): string[] {
  const words = text.split(/\s+/);
  const chunks = [];
  let currentChunk = [];
  for (const word of words) {
    currentChunk.push(word);
    if (currentChunk.length >= maxTokens) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
  return chunks;
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getSemanticChunks(sources: any[], query: string, topK: number = 15) {
  if (sources.length === 0) return [];
  const extractor = await getEmbeddingPipeline();
  const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbed = Array.from(queryOut.data) as number[];

  const allChunks = [];
  for (const source of sources) {
    const sourceId = source.id || source.title; 
    if (!embeddingCache.has(sourceId)) {
      const chunks = chunkText(source.content);
      const cachedData = [];
      for (const chunk of chunks) {
         try {
           const out = await extractor(chunk, { pooling: 'mean', normalize: true });
           cachedData.push({ chunk, embedding: Array.from(out.data) as number[] });
         } catch(e) { }
      }
      embeddingCache.set(sourceId, cachedData);
    }
    const cached = embeddingCache.get(sourceId) || [];
    for (const c of cached) {
       allChunks.push({ source, chunk: c.chunk, score: cosineSimilarity(queryEmbed, c.embedding) });
    }
  }
  return allChunks.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ═══════════════════════════════════════════════════════════════════════
// GENERATIVE INTERFACE (Cloud-Only)
// ═══════════════════════════════════════════════════════════════════════

const COMMON_PERSONA = `You are Technosprint Intelligence — a proprietary deep research engine developed by Technosprint Info Solutions.
IDENTITY RULE: You identify strictly as a product of Technosprint Info Solutions. NEVER mention Google, Gemini, Ollama, or OpenAI. If asked about your model, state you are a proprietary Technosprint neural network.`;

export async function generateChatResponse(
  prompt: string,
  sources: { id?: string; title: string; content: string; type: string }[],
  history: { role: 'user' | 'model'; content: string }[],
  onToken?: (token: string) => void,
  useHighThinking: boolean = false,
  masterSources: { title: string; content: string; type: string }[] = [],
  abortSignal?: AbortSignal
): Promise<string> {
  if (!genAI) throw new Error("Technosprint Engine Error: Cloud credentials (GEMINI_API_KEY) missing.");

  const allSources = [...sources, ...masterSources];
  const topChunks = await getSemanticChunks(allSources, prompt, 15);
  
  let sourceContext = "";
  topChunks.forEach((tc, i) => {
    sourceContext += `SOURCE [${i+1}]: ${tc.source.title}\nCONTENT: ${tc.chunk}\n\n`;
  });

  const systemInstruction = `${COMMON_PERSONA}
You are in MAXIMUM INTELLIGENCE mode. Cite sources using [1], [2] inline.
DO NOT STOP EARLY. Provide 8-12 paragraphs of dense technical analysis.

SOURCES:
${sourceContext}`;

  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", systemInstruction });
  // ── Gemini History Guard ──
  // Rule: MUST start with 'user' role and MUST alternate (implicitly handled by SDK if start is valid)
  let validHistory = history
    .slice(-10)
    .filter(h => h.content && h.content.trim() !== ''); // Skip empty messages
  
  while (validHistory.length > 0 && validHistory[0].role !== 'user') {
    validHistory.shift();
  }

  const chat = model.startChat({
    history: validHistory.map(h => ({ role: h.role, parts: [{ text: h.content }] }))
  });

  const result = await chat.sendMessageStream(prompt);
  let fullText = '';
  for await (const chunk of result.stream) {
    if (abortSignal?.aborted) break;
    const chunkText = chunk.text();
    fullText += chunkText;
    if (onToken) onToken(chunkText);
  }
  return fullText;
}

export async function transcribeImageBest(dataUrl: string): Promise<string> {
  if (!genAI) throw new Error("Vision Engine requires GEMINI_API_KEY.");
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const result = await model.generateContent([
    `${COMMON_PERSONA}\nAnalyze this document. Transcribe tables in Markdown. Describe diagrams and technical data exactly.`,
    { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
  ]);
  return result.response.text().trim();
}

export async function generateNoteTitle(content: string): Promise<string> {
  if (!genAI) return "Research Note";
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const result = await model.generateContent(`Summarize the following into a 3-5 word title. Return ONLY the title text.\n\n${content.substring(0, 1000)}`);
  return result.response.text().trim().replace(/[*"']/g, '');
}

export async function generateNotesSummary(notes: { title: string; content: string }[]): Promise<string> {
  if (!genAI) throw new Error("Summary Engine unavailable.");
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const text = notes.map(n => `TITLE: ${n.title}\nCONTENT: ${n.content}`).join('\n\n');
  const result = await model.generateContent(`${COMMON_PERSONA}\nSummarize these research notes into a detailed unified report.\n\n${text}`);
  return result.response.text();
}

export async function generateSourceSummary(title: string, content: string): Promise<string> {
  if (!genAI) throw new Error("Source Analysis unavailable.");
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const result = await model.generateContent(`${COMMON_PERSONA}\n# Source Guide: ${title}\nProvide an executive summary and key takeaways for this document.\n\nCONTENT: ${content.substring(0, 15000)}`);
  return result.response.text();
}

export async function generateChatSummary(chatHistory: any[], sources: any[]): Promise<string> {
  if (!genAI) return "Summary Unavailable";
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const chatText = chatHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const result = await model.generateContent(`${COMMON_PERSONA}\nCreate a comprehensive research summary of this conversation.\n\n${chatText}`);
  return result.response.text();
}

export async function generateConsolidatedSummary(sources: any[], onToken?: (t: string) => void): Promise<string> {
  if (!genAI) throw new Error("Consolidation Engine unavailable.");
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const text = sources.map(s => `DOC: ${s.title}\n${s.content.substring(0, 10000)}`).join('\n\n');
  const result = await model.sendMessageStream(`${COMMON_PERSONA}\nCreate a "Consolidated Intelligence Report" merging all these documents.\n\n${text}`);
  let fullText = '';
  for await (const chunk of result.stream) {
    const t = chunk.text();
    fullText += t;
    if (onToken) onToken(t);
  }
  return fullText;
}

export async function generateFollowUpQuestions(chatHistory: any[]): Promise<string[]> {
  if (!genAI) return [];
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  const history = chatHistory.slice(-2).map(m => m.content).join('\n\n');
  const result = await model.generateContent(`Generate 3 follow-up questions for this topic. Return ONLY a JSON array of strings ["Q1", "Q2", "Q3"].\n\nCONTEXT: ${history}`);
  try {
    const text = result.response.text();
    const match = text.match(/\[.*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    }
    return [];
  } catch (e) {
    console.warn('Failed to parse follow-ups:', e);
    return [];
  }
}

export async function processSource(title: string, content: string): Promise<{ title: string; content: string }> {
  return { title, content };
}

export type { }; // Ensure file is treated as a module
