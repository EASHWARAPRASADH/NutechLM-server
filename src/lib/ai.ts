import { useStore } from '../store';
import { pipeline, env } from '@xenova/transformers';
import { GoogleGenerativeAI } from '@google/generative-ai';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ═══════════════════════════════════════════════════════════════════════
// NutechLM Neural Intelligence Engine — Production Grade
// Supports Local (Ollama) and Cloud (Gemini 1.5 Flash)
// ═══════════════════════════════════════════════════════════════════════

const OLLAMA_URL = '/api/ollama';

// ── THE BEST Models — Period ──
const CHAT_MODEL = 'llama3.1:latest';
const VISION_MODEL = 'qwen2.5vl:7b';

// Gemini Cloud Configuration
const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// ── Fallbacks ONLY if best model fails to load ──
const CHAT_FALLBACKS = ['llama3.1:latest', 'llama3:8b', 'llama3.2:latest', 'mistral:7b'];
const VISION_FALLBACKS = ['qwen2.5vl:7b', 'llava:latest', 'llava:13b', 'llava:7b'];

let resolvedChatModel: string | null = null;
let resolvedVisionModel: string | null = null;

/**
 * Ensure the best model is available. Auto-pulls if missing.
 */
async function ensureModel(preferred: string, fallbacks: string[]): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error('Ollama not running');
    const data = await res.json();
    const installed = (data.models || []).map((m: any) => m.name?.split(':')[0] + ':' + (m.name?.split(':')[1] || 'latest'));
    
    // Check if preferred is installed
    const preferredBase = preferred.split(':')[0];
    const match = (data.models || []).find((m: any) => 
      m.name === preferred || m.name?.startsWith(preferredBase)
    );
    if (match) {
      console.log(`[NutechLM] ✓ Using model: ${match.name}`);
      return match.name;
    }

    // Check fallbacks
    for (const fb of fallbacks) {
      const fbBase = fb.split(':')[0];
      const fbMatch = (data.models || []).find((m: any) => 
        m.name === fb || m.name?.startsWith(fbBase)
      );
      if (fbMatch) {
        console.log(`[NutechLM] Using fallback model: ${fbMatch.name} (preferred: ${preferred})`);
        return fbMatch.name;
      }
    }

    // Nothing installed — attempt pull of preferred
    console.log(`[NutechLM] No suitable model found. Pulling: ${preferred} ...`);
    await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: preferred, stream: false })
    });
    return preferred;
  } catch (err) {
    console.warn(`[NutechLM] Model resolution failed:`, err);
    return preferred; // Try anyway
  }
}

async function getChatModel(): Promise<string> {
  const mode = useStore.getState().platformSettings.aiModelMode || '14b';
  const preferred = mode === '14b' ? CHAT_MODEL : 'llama3:8b';
  
  if (!resolvedChatModel || !resolvedChatModel.includes(mode)) {
    resolvedChatModel = await ensureModel(preferred, CHAT_FALLBACKS);
  }
  return resolvedChatModel;
}

async function getVisionModel(): Promise<string> {
  if (!resolvedVisionModel) resolvedVisionModel = await ensureModel(VISION_MODEL, VISION_FALLBACKS);
  return resolvedVisionModel;
}

// ═══════════════════════════════════════════════════════════════════════
// CHAT ENGINE — High-Fidelity Neural Responses with Source Citations
// ═══════════════════════════════════════════════════════════════════════

let embeddingPipeline: any = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('[NutechLM] Initializing Neural Semantic Engine (RAG)...');
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
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// In-memory embedding cache: Map<SourceId, { chunk: string, embedding: number[] }[]>
const embeddingCache = new Map<string, { chunk: string, embedding: number[] }[]>();

async function getSemanticChunks(sources: any[], query: string, topK: number = 15) {
  if (sources.length === 0) return [];
  const extractor = await getEmbeddingPipeline();
  
  // 1. Embed Query
  const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbed = Array.from(queryOut.data) as number[];

  const allChunks = [];
  
  // 2. Embed Sources (cached)
  for (const source of sources) {
    const sourceId = source.id || source.title; 
    if (!embeddingCache.has(sourceId)) {
      const chunks = chunkText(source.content);
      const cachedData = [];
      for (const chunk of chunks) {
         try {
           const out = await extractor(chunk, { pooling: 'mean', normalize: true });
           cachedData.push({ chunk, embedding: Array.from(out.data) as number[] });
         } catch(e) { console.warn("Embed err", e); }
      }
      embeddingCache.set(sourceId, cachedData);
    }
    
    // Evaluate similarity
    const cached = embeddingCache.get(sourceId) || [];
    for (const c of cached) {
       const score = cosineSimilarity(queryEmbed, c.embedding);
       allChunks.push({ source, chunk: c.chunk, score });
    }
  }
  
  // 3. Sort and pick top K
  return allChunks.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function generateChatResponse(
  prompt: string,
  sources: { id?: string; title: string; content: string; type: string }[],
  history: { role: 'user' | 'model'; content: string }[],
  onToken?: (token: string) => void,
  useHighThinking: boolean = false,
  masterSources: { title: string; content: string; type: string }[] = [],
  abortSignal?: AbortSignal
): Promise<string> {
  const model = await getChatModel();
  const notebookSources = sources.map(s => ({ ...s, origin: 'USER UPLOADED RESEARCH' }));
  const globalSources = masterSources.map(s => ({ ...s, origin: 'GLOBAL INTELLIGENCE ASSET' }));
  const allSources = [...notebookSources, ...globalSources];

  // Perform Semantic RAG (NotebookLM style memory)
  const topChunks = await getSemanticChunks(allSources, prompt, 15);
  
  // Group by source to format citations mapped correctly
  const chunksBySourceId = new Map<string, { source: any, text: string[] }>();
  for (const tc of topChunks) {
     const id = tc.source.id || tc.source.title;
     if (!chunksBySourceId.has(id)) chunksBySourceId.set(id, { source: tc.source, text: [] });
     chunksBySourceId.get(id)!.text.push(tc.chunk);
  }

  // Build the raw source blocks using the original sources array indexes
  let rawSourceBlocks = "";
  for (let i = 0; i < allSources.length; i++) {
     const s = allSources[i] as any;
     const id = s.id || s.title;
     if (chunksBySourceId.has(id)) {
        const data = chunksBySourceId.get(id)!;
        const combinedText = data.text.join('\n\n[...] ');
        rawSourceBlocks += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE [${i + 1}]: (${s.origin}) "${s.title}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${combinedText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
     }
  }

  const finalSystemPrompt = `You are NutechLM Deep Research Engine — a world-class scientific analyst in MAXIMUM INTELLIGENCE mode.

## SOURCE PRIORITY PROTOCOL (CRITICAL)
- **Priority 1: General/Technical Standards** — If the question is about general engineering, standards (IEC, DIN, ISO), or theoretical concepts, prioritize **GLOBAL INTELLIGENCE ASSETS**.
- **Priority 2: Specific Context** — If the user asks about their own findings, notes, or specific documents they uploaded, prioritize **USER UPLOADED RESEARCH**.
- **Synthesis**: Combine both when explaining how a general standard applies to the user's specific context.

## CITATION RULES (HIGHEST PRIORITY)
- You MUST cite EVERY fact, number, specification, date, and claim from sources.
- Citation format: place the source number INLINE in square brackets [1], [2].
- DO NOT generate a "References", "Bibliography", or "Works Cited" section at the end of your response.
- NEVER write "According to source 1". Just state the fact and cite.
- If information is NOT in any source, say: "This is not covered in the provided sources."
- Every paragraph MUST contain at least 2-3 citations.

## DEEP REASONING PROTOCOL
- You are in HIGH-INTELLIGENCE mode. DO NOT summarize. DO NOT shorten.
- Your response MUST be 8–12 dense paragraphs MINIMUM.
- Think step-by-step. Break complex topics into layers.

## MANDATORY RESPONSE STRUCTURE
1. **Executive Summary**: 2-3 sentences answering directly, with citations.
2. **Comprehensive Analysis**: 4-6 paragraphs of deep analysis. Define technical terms.
3. **Technical Data Table(s)**: Include at least ONE markdown table for specs.
4. **Key Terminology Glossary**: List 5-10 technical terms from sources.
5. **Critical Findings & Conclusions**: Synthesis of takeaways.

## TECHNICAL DOCUMENT EXPERTISE
- Extract ALL part numbers, model codes, measurements, and pinouts.
- Include all dimensions and tolerances with units (e.g., \`0.34mm²\`, \`24V DC\`).
- Cite all standards: IEC, DIN, EN, ISO.

## RELEVANT RETRIEVED SOURCES (SEMANTIC MATCHES):
${rawSourceBlocks || 'No sources loaded yet. State that you require documents to be uploaded.'}

## STRICT ANTI-HALLUCINATION PROTOCOL (CRITICAL)
- You MUST ONLY base your answer on the content provided in the sources above.
- If the required information is NOT present in the provided sources, you MUST explicitly state: "Based on the provided documents, there is no information regarding this topic."
- If the provided source text contains its own "References", "Bibliography", or citation list, you MUST IGNORE IT. Do NOT copy, list, or output the document's own bibliography.
- Do NOT use external knowledge. Do NOT invent data. Focus purely on extracting and analyzing the functional content of the uploaded documents.

You are in DEEP THINKING mode. Begin now.`;

  const finalPrompt = `${prompt}

---
REMINDER: You are in DEEP THINKING mode. Write at least 1000 words. Include tables, glossary, and heavy inline citations after every technical fact. DO NOT generate a References or Bibliography list. Do not stop early.`;

  // ── CLOUD MODE: Gemini 1.5 Flash ──
  if (genAI) {
    try {
      const geminiModel = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: finalSystemPrompt
      });

      const chat = geminiModel.startChat({
        history: history.slice(-12).map(msg => ({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }))
      });

      const result = await chat.sendMessageStream(finalPrompt);
      let fullText = '';
      
      for await (const chunk of result.stream) {
        if (abortSignal?.aborted) break;
        const chunkText = chunk.text();
        fullText += chunkText;
        if (onToken) onToken(chunkText);
      }

      return fullText || 'Thinking...';
    } catch (err: any) {
      console.warn('[NutechLM] Gemini Engine failed, falling back to local Ollama:', err.message);
      // Fall through to Ollama
    }
  }

  // ── LOCAL MODE: Ollama ──
  const messages = [
    { role: 'system', content: finalSystemPrompt },
    ...history.slice(-12).map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.content
    })),
    { role: 'user', content: finalPrompt }
  ];

    let fullText = '';
    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: {
            temperature: 0.3,
            num_predict: 16384,
            num_ctx: 32768, 
            top_k: 40,
            top_p: 0.9,
            repeat_penalty: 1.2,
            num_gpu: -1,
            low_vram: true
          }
        }),
        signal: abortSignal
      });

      if (!response.ok) {
        throw new Error(`Model Core error: ${response.status} ${await response.text()}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let lineBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              const token = json.message.content;
              fullText += token;
              if (onToken) onToken(token);
            }
          } catch (e) {
            console.warn("Failed to parse partial line:", line);
          }
        }
      }

      return fullText || 'Thinking...';
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[NutechLM] Stream aborted by user.');
        return fullText || 'Interrupted.';
      }
      console.error('[NutechLM] Inference Core failed:', err);
      throw err;
    }
  }

// ═══════════════════════════════════════════════════════════════════════
// VISION ENGINE — Advanced Document/Table/Handwriting Analysis
// ═══════════════════════════════════════════════════════════════════════

/**
 * Transcribe any document image: PDFs, scanned forms, handwritten notes,
 * technical drawings, tables, invoices — anything.
 */
export async function transcribeImageBest(dataUrl: string): Promise<string> {
  try {
    return await transcribeWithVision(dataUrl);
  } catch (e) {
    console.warn('[NutechLM] Vision transcription failed:', e);
    return '';
  }
}

async function transcribeWithVision(base64Image: string): Promise<string> {
  const model = await getVisionModel();
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `You are an expert document analyst with perfect accuracy. Analyze this document image completely.

RULES:
1. Transcribe EVERY piece of text visible in the document
2. For TABLES: Use markdown table format with | pipes | preserving all rows and columns exactly
3. For HANDWRITING: Transcribe carefully. Mark uncertain words with [?]
4. For FORMS: Include both field labels AND their values
5. For DIAGRAMS: Describe the structure and any labels/annotations
6. For TECHNICAL DRAWINGS: List all dimensions, part numbers, notes, and callouts
7. Preserve exact numbers, codes, abbreviations — do NOT interpret or simplify
8. Maintain document structure: headers, sections, paragraphs, lists

FORMAT:
[Document Type: ___]

[Full transcription with markdown formatting]`;

  // ── CLOUD MODE: Gemini 1.5 Flash ──
  if (genAI) {
    try {
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await geminiModel.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg" // Multer handles varied types, but Gemini works best with standard hints
          }
        }
      ]);
      return result.response.text().trim() || '';
    } catch (err) {
      console.warn('[NutechLM] Gemini Vision failed, falling back to local vision:', err);
      // Fall through to Ollama
    }
  }

  // ── LOCAL MODE: Ollama ──
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt, images: [base64Data] }],
      stream: false,
      options: { 
        temperature: 0.0, 
        num_predict: 3000,
        num_ctx: 8192
      }
    })
  });

  if (!response.ok) throw new Error(`Vision model error: ${response.status}`);
  const data = await response.json();
  return data.message?.content?.trim() || '';
}

// For backward compatibility — cloud is disabled
export async function transcribeImageLocal(base64Image: string): Promise<string> {
  return transcribeWithVision(base64Image);
}

export async function transcribeImageCloud(): Promise<string> {
  throw new Error('Cloud disabled. Local models only.');
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES — Notes, Summaries, Titles, Speech
// ═══════════════════════════════════════════════════════════════════════

let ttsPipeline: any = null;

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

let ttsPipelineTamil: any = null;

export async function generateSpeech(
  text: string, 
  voice: 'male1' | 'female1' | 'male2' | 'female2' | 'specialist' = 'male1'
): Promise<string | null> {
  try {
    const isTamil = /[\u0B80-\u0BFF]/.test(text);

    if (isTamil) {
      if (!ttsPipelineTamil) {
        console.log('[NutechLM] Initializing Regional Neural Engine (MMS-TAM)...');
        ttsPipelineTamil = await pipeline('text-to-speech', 'Xenova/mms-tts-tam', { quantized: true });
      }
      
      // Adjusted speed to 0.85 for a 'Slow and Steady' delivery
      const result = await ttsPipelineTamil(text.replace(/[*#_|~`]/g, ''), { speed: 0.85 });
      const wavBytes = encodeWAV(result.audio, result.sampling_rate);
      let binary = '';
      for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
      return btoa(binary);
    }

    if (!ttsPipeline) {
      console.log('[NutechLM] Initializing Neural Voice Engine (VITS - Natural Speaker)...');
      ttsPipeline = await pipeline('text-to-speech', 'Xenova/vits-eng-vctk', { quantized: true });
    }
    
    // VCTK SPEAKER IDs
    const speakerMap: Record<string, number> = {
      male1: 4, female1: 10, male2: 11, female2: 16, specialist: 0
    };
    const speakerId = speakerMap[voice] || 4;
    const cleanText = text.replace(/\[\d+\]/g, '').replace(/[*#_|~`]/g, '').replace(/\s{2,}/g, ' ').trim();
    
    // Adjusted speed to 1.0 -> 0.85 for 'Slow and Steady' natural speech
    const result = await ttsPipeline(cleanText, { speaker_id: speakerId, speed: 0.85 });
    const wavBytes = encodeWAV(result.audio, result.sampling_rate);
    let binary = '';
    for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
    return btoa(binary);
  } catch (e) {
    console.error('Neural Engine failed transition:', e);
    return null;
  }
}

export async function generateNoteTitle(content: string): Promise<string> {
  const model = await getChatModel();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: `Write a 3-6 word title for this text. Return ONLY the title.\n\n${content.substring(0, 400)}` }],
        stream: false,
        options: { temperature: 0.1, num_predict: 20 }
      })
    });
    if (!res.ok) return 'Research Note';
    const data = await res.json();
    return (data.message?.content || 'Research Note').trim().replace(/^["']|["']$/g, '').substring(0, 60);
  } catch { return 'Research Note'; }
}

export async function generateNotesSummary(notes: { title: string; content: string }[]): Promise<string> {
  const model = await getChatModel();
  const text = notes.map((n, i) => `── Note ${i+1}: "${n.title}" ──\n${n.content}`).join('\n\n');
  
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `Synthesize these research notes into a comprehensive summary with **bold** key terms, ### section headers, bullet points, and specific details from each note.\n\n${text}` }],
      stream: false,
      options: { temperature: 0.2, num_predict: 3000, num_ctx: 32768 }
    })
  });
  if (!res.ok) throw new Error('Summary failed');
  const data = await res.json();
  return data.message?.content || 'Summary failed.';
}

export async function generateSourceSummary(title: string, content: string): Promise<string> {
  const model = await getChatModel();
  
  const systemPrompt = `You are NutechLM's Source Analysis Engine. Your goal is to create a "Source Guide" for a single research resource.
  
  Structure the output exactly like this:
  
  # Source Guide: ${title}
  
  ## Executive Summary
  (Provide a concise 2-paragraph summary of the main arguments, background, and findings)
  
  ## Key Takeaways
  - (Crucial takeaway 1)
  - (Crucial takeaway 2)
  - (Crucial takeaway 3)
  
  ## Suggested Research Questions
  1. (Question about specific data or numbers)
  2. (Question about methodology or reasoning)
  3. (Question about broader implications or future context)
  4. (Question about comparisons to industry standards)
  5. (Deep-dive technical or niche question)
  
  Use **bold** for key terms and maintain a professional, academic tone. Cite the document as [1] for specific info.`;

  try {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `${systemPrompt}\n\nCONTENT:\n${content.substring(0, 20000)}` }],
      stream: false,
      options: { temperature: 0.2, num_predict: 2000, num_ctx: 32768 }
    })
  });
  
  if (!response.ok) {
     throw new Error(`Source Synthesis Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.message?.content || `No summary available for ${title}`;
} catch (err: any) {
  console.error(err);
  return `Summary failed for ${title}: ${err.message || 'Connection error'}`;
}
}

export async function generateChatSummary(
  chatHistory: { role: 'user' | 'model'; content: string }[],
  sources: { title: string; content: string }[]
): Promise<string> {
  const model = await getChatModel();
  const chatText = chatHistory.map(m => `${m.role === 'user' ? 'RESEARCHER' : 'AI'}: ${m.content}`).join('\n\n---\n\n');
  const srcList = sources.map((s, i) => `[${i+1}] ${s.title}`).join('\n');

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `Create a comprehensive research summary of this conversation.

Include:
## Key Findings
- bullet points of every major finding

## Detailed Analysis
3-4 paragraphs with specific details discussed

## Sources Referenced  
${srcList || 'None'}

## Questions Explored
List each question asked with a one-line answer

## Next Steps
Any follow-up actions

CONVERSATION:
${chatText}` }],
      stream: false,
      options: { temperature: 0.15, num_predict: 3000, num_ctx: 32768 }
    })
  });
  if (!res.ok) throw new Error('Chat summary failed');
  const data = await res.json();
  return data.message?.content || 'Summary failed.';
}

export async function processSource(title: string, content: string): Promise<{ title: string; content: string }> {
  return { title, content };
}

export async function generateConsolidatedSummary(sources: { title: string; content: string }[], onToken?: (t: string) => void): Promise<string> {
  const model = await getChatModel();
  const text = sources.map((s, i) => `── Document ${i+1}: "${s.title}" ──\n${s.content.substring(0, 12000)}`).join('\n\n');
  
  const systemPrompt = `You are NutechLM, responsible for creating a "Consolidated Source Guide" matching NotebookLM's Audio Overview style.
Analyze these newly uploaded documents and write a highly detailed, unified synthesis of ALL of them combined.

# Consolidated Intelligence Report
## Executive Synthesis
(A powerful, 3-4 paragraph opening that merges all documents into a single cohesive narrative. Analyze the patterns, connections, and overarching purpose of the entire document set.)

## Primary Research Pillars
(Identify the 3-5 core technical or thematic pillars discovered across the documents. Focus on merged data, cross-referenced specifications, and technical patterns rather than listing per document.)

## Technical Specifications & Standards
(Extract and merge all critical technical data, part numbers, and standards into a unified analysis.)

## Critical Insights & Takeaways
(A final synthesis of what these documents mean when taken as a whole.)

Use **bold** for key terms. Avoid listing findings document-by-document; instead, merge all intelligence into a singular, high-level technical report.`;

  try {
     const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Please consolidate:\n\n${text}` }],
          stream: true,
          options: { temperature: 0.2, num_predict: 4096, num_ctx: 32768, top_k: 40, top_p: 0.9, repeat_penalty: 1.15 }
        })
     });
     
      if (!response.ok) {
        throw new Error(`Intelligence Synthesis Error: ${response.status} ${response.statusText}`);
      }
      
      if (!response.body) throw new Error('No intelligence stream received');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let lineBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.error) {
               fullText += `(Neural Interface Error: ${json.error}) `;
            }
            if (json.message?.content) {
              fullText += json.message.content;
              if (onToken) onToken(json.message.content);
            }
          } catch(e) {}
        }
      }
      return fullText || 'Summary Generation Complete (Note: AI returned an empty response).';
  } catch (err: any) {
      console.error(err);
      return `Synthesis failed: ${err.message || 'Check local model connection'}`;
  }
}

export async function generateFollowUpQuestions(
  chatHistory: { role: 'user' | 'model'; content: string }[]
): Promise<string[]> {
  const model = await getChatModel();
  const recentTexts = chatHistory.slice(-2).map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 1000)}`).join('\n\n');
  
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user', 
          content: `Based on this recent conversation, generate exactly 3 short, thought-provoking follow-up questions the user might want to ask next to dive deeper.
Return ONLY a valid JSON array of 3 strings. Example: ["How does X work?", "What is the cost of Y?", "Can you explain Z?"]

CONVERSATION:
${recentTexts}

OUTPUT (JSON ARRAY ONLY):`
        }],
        stream: false,
        options: { temperature: 0.4, num_predict: 150 }
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    const content = data.message?.content || "";
    const match = content.match(/\[(.*?)\]/s);
    if (match) {
       const arrayStr = '[' + match[1] + ']';
       const arr = JSON.parse(arrayStr);
       if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, 3);
    }
    return [];
  } catch(e) {
    return [];
  }
}
