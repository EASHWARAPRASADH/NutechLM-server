import { useStore } from '../store';
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ═══════════════════════════════════════════════════════════════════════
// NutechLM Neural Intelligence Engine — Production Grade
// NotebookLM Competitor • Pure Local • No Cloud • No API Keys
// 
// MODELS USED:
//   Chat/Reasoning: qwen2.5:14b  (auto-downloaded if missing)
//   Vision/OCR:     qwen2.5vl:7b (auto-downloaded if missing)
//
// These are the BEST local models for an M4 Pro Mac.
// No model switching. No options. Always the best.
// ═══════════════════════════════════════════════════════════════════════

const OLLAMA_URL = 'http://localhost:11434';

// ── THE BEST Models — Period ──
const CHAT_MODEL = 'qwen2.5:14b';
const VISION_MODEL = 'qwen2.5vl:7b';

// ── Fallbacks ONLY if best model fails to load ──
const CHAT_FALLBACKS = ['qwen2.5:7b', 'mistral:7b', 'llama3.1:8b', 'llama3:8b'];
const VISION_FALLBACKS = ['qwen2.5vl', 'llava:13b', 'llava:7b', 'llava'];

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
  const preferred = mode === '14b' ? CHAT_MODEL : 'qwen2.5:7b';
  
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
// CHAT ENGINE — NotebookLM-Quality Responses with Source Citations
// ═══════════════════════════════════════════════════════════════════════

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

  // OPTIMIZATION: Truncate source blocks if they exceed safety limits (~65,000 characters for Deep Research)
  const rawSourceBlocks = allSources.map((s, i) => {
    const num = i + 1;
    const content = s.content.length > 25000 ? s.content.substring(0, 25000) + '... [TRUNCATED]' : s.content;
    const origin = (s as any).origin;
    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE [${num}]: (${origin}) "${s.title}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }).join('\n\n');

  // Hard limit for global context stability
  const sourceBlocks = rawSourceBlocks.length > 65000 ? rawSourceBlocks.substring(0, 65000) + '\n\n[Additional source content truncated for system stability]' : rawSourceBlocks;

  const systemPrompt = useHighThinking
? `You are NutechLM Deep Research Engine — a world-class scientific analyst in MAXIMUM INTELLIGENCE mode.

## SOURCE PRIORITY PROTOCOL (CRITICAL)
- **Priority 1: General/Technical Standards** — If the question is about general engineering, standards (IEC, DIN, ISO), or theoretical concepts, prioritize **GLOBAL INTELLIGENCE ASSETS**.
- **Priority 2: Specific Context** — If the user asks about their own findings, notes, or specific documents they uploaded, prioritize **USER UPLOADED RESEARCH**.
- **Synthesis**: Combine both when explaining how a general standard applies to the user's specific context.

## CITATION RULES (HIGHEST PRIORITY)
- You MUST cite EVERY fact, number, specification, date, and claim from sources.
- Citation format: place the source number in square brackets [1], [2].
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

## REFERENCE SOURCES:
${sourceBlocks || 'No sources loaded yet. Answer using general knowledge and clearly state this.'}

You are in DEEP THINKING mode. Begin now.`

: `You are NutechLM, a world-class Pedagogical Specialist and Research Teacher.

## SOURCE PRIORITY PROTOCOL
- **Global Assets**: Use for baseline knowledge and industrial standards.
- **User Research**: Use for specific user context, uploaded files, and personal notes.
- **Teaching Goal**: Explain how global knowledge applies to the user's specific research.

## TEACHING STYLE
- EXPLAIN everything as if the user is a complete beginner.
- Be detailed: 5-7 comprehensive paragraphs.
- Use **bold** for key terms.
- EVERY fact MUST have an inline citation: [1], [2], [3]

## FORMATTING
- **Bold** key terms. \`Inline code\` for technical values. ### Headers for sections.
- | Tables | For | Data |

## REFERENCE SOURCES:
${sourceBlocks || 'No sources loaded yet. Answer using general knowledge and clearly state this.'}

Begin your response now.`;

  const finalSystemPrompt = systemPrompt;

  // When Deep Thinking is active, wrap the user's question with length enforcement
  const finalPrompt = useHighThinking 
    ? `${prompt}

---
REMINDER: You are in DEEP THINKING mode. Write at least 1000 words. Include tables, glossary, and heavy citations after every technical fact. Do not stop early.`
    : prompt;

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
          stream: true, // ENABLE STREAMING
          options: {
            temperature: useHighThinking ? 0.3 : 0.4,
            num_predict: useHighThinking ? 16384 : 4096,
            num_ctx: 16384, 
            top_k: 40,
            top_p: 0.9,
            repeat_penalty: useHighThinking ? 1.2 : 1.25,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

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
            // Incomplete JSON chunk, skip or handle partially
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

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `${systemPrompt}\n\nCONTENT:\n${content.substring(0, 20000)}` }],
      stream: false,
      options: { temperature: 0.2, num_predict: 2000, num_ctx: 32768 }
    })
  });
  
  if (!res.ok) return `Failed to summarize: ${title}`;
  const data = await res.json();
  return data.message?.content || `No summary available for ${title}`;
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
