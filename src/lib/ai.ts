import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// ═══════════════════════════════════════════════════════════════════════
// Nutech Research Engine — Bridge Mode
// ═══════════════════════════════════════════════════════════════════════

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
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buffer);
}

let ttsPipeline: any = null;

export async function generateSpeech(
  text: string, 
  voice: 'male1' | 'female1' | 'male2' | 'female2' | 'specialist' = 'male1'
): Promise<string | null> {
  try {
    if (!ttsPipeline) {
      ttsPipeline = await pipeline('text-to-speech', 'Xenova/vits-eng-vctk', { quantized: true });
    }
    const speakerMap: Record<string, number> = { male1: 4, female1: 10, male2: 11, female2: 16, specialist: 0 };
    const speakerId = speakerMap[voice] || 4;
    const result = await ttsPipeline(text.replace(/[*#_|~`]/g, '').trim(), { speaker_id: speakerId, speed: 0.85 });
    const wavBytes = encodeWAV(result.audio, result.sampling_rate);
    let binary = '';
    for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
    return btoa(binary);
  } catch (e) {
    console.error('TTS failed:', e);
    return null;
  }
}

/**
 * generateChatResponse
 * Calls the secure backend proxy to handle AI generation.
 * This keeps the API key hidden and ensures Render runtime compatibility.
 */
export async function generateChatResponse(
  prompt: string,
  sources: { id?: string; title: string; content: string; type: string }[],
  history: { role: 'user' | 'model'; content: string }[],
  onToken?: (token: string) => void,
  useHighThinking: boolean = false,
  masterSources: { title: string; content: string; type: string }[] = [],
  abortSignal?: AbortSignal
): Promise<string> {
  const token = localStorage.getItem('nutech-vault-token');
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ prompt, sources, history, masterSources, useHighThinking }),
    signal: abortSignal
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "AI Engine Failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Connection failed");

  let fullText = '';
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    fullText += chunk;
    if (onToken) onToken(chunk);
  }

  return fullText;
}

/**
 * generateNoteTitle
 * Proxies to backend for title generation.
 */
export async function generateNoteTitle(content: string): Promise<string> {
  const token = localStorage.getItem('nutech-vault-token');
  try {
    const res = await fetch('/api/ai/title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    return data.title || "Research Note";
  } catch (e) {
    return "Research Note";
  }
}

// Keep local logic for things that don't require the Cloud Engine
export async function processSource(title: string, content: string): Promise<{ title: string; content: string }> {
  return { title, content };
}

// Fallback stubs for other AI functions (can be expanded as needed)
export async function generateFollowUpQuestions(chatHistory: any[]): Promise<string[]> {
  const prompt = `Based on the following research conversation, generate 3-4 diverse, high-value follow-up questions that a researcher might ask to delve deeper into the topic. 
Return ONLY a JSON array of strings. Do not include any other text.

HISTORY:
${JSON.stringify(chatHistory.slice(-10))}

FOLLOW-UP QUESTIONS:`;

  try {
    const response = await generateChatResponse(prompt, [], []);
    // Try to parse JSON from the response
    const match = response.match(/\[.*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    }
    // Fallback if not JSON
    return response.split('\n').filter(q => q.trim().length > 5).slice(0, 3);
  } catch (e) {
    return ["What are the key technical implications?", "How does this compare to existing standards?", "Can you elaborate on the source data?"];
  }
}

export async function generateSourceSummary(title: string, content: string): Promise<string> {
  const prompt = `Provide a short, punchy, and highly precise executive summary of this document: "${title}". 
Limit the response to exactly 3-4 high-impact bullet points covering only the most essential information. 
Avoid introductory filler. Respond ONLY with the bullet points.

DOCUMENT CONTENT:
${content.substring(0, 10000)}`;
  
  return generateChatResponse(prompt, [], []);
}

export async function generateConsolidatedSummary(sources: any[], onToken?: any): Promise<string> {
  let context = "";
  sources.forEach((s, i) => {
    context += `DOC [${i+1}]: ${s.title}\nCONTENT: ${s.content.substring(0, 3000)}\n\n`;
  });

  const prompt = `Generate a precise Research Briefing consolidating these documents. 
Keep it short, professional, and devoid of fluff.

DOCUMENTS:
${context}

Structure:
# Precise Intelligence Briefing
## Synthesis (2-3 sentences max)
## Critical Findings (Top 5 bullet points across all docs)
## Actionable Insight (One key takeaway)`;

  return generateChatResponse(prompt, [], [], onToken);
}

export async function generateChatSummary(chatHistory: any[], sources: any[]): Promise<string> {
  const prompt = `Please summarize the key points discussed in this chat session. 
Focus on the technical insights and research findings derived from the sources.

HISTORY:
${JSON.stringify(chatHistory.slice(-20))}

SOURCES ANALYZED:
${sources.map(s => s.title).join(', ')}`;

  return generateChatResponse(prompt, sources, []);
}

export async function generateNotesSummary(notes: any[]): Promise<string> {
  const prompt = `Synthesize a high-level briefing note from these scattered research notes.
Connect the ideas and provide a cohesive outlook.

NOTES:
${notes.map(n => `TITLE: ${n.title}\nCONTENT: ${n.content}`).join('\n\n')}`;

  return generateChatResponse(prompt, [], []);
}

export async function transcribeImageBest(dataUrl: string): Promise<string> { return "Vision is currently disabled in Bridge Mode."; }

export type { };
