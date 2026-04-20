// ═══════════════════════════════════════════════════════════════════════
// Technosprint Intelligence Engine — Bridge Mode
// ═══════════════════════════════════════════════════════════════════════

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
  return ["What are the key technical implications?", "How does this compare to existing standards?", "Can you elaborate on the source data?"];
}

export async function generateNotesSummary(notes: any[]): Promise<string> { return "Summary logic migrated to backend."; }
export async function generateSourceSummary(title: string, content: string): Promise<string> { return "Source Guide: " + title; }
export async function generateChatSummary(chatHistory: any[], sources: any[]): Promise<string> { return "Chat summary migrated."; }
export async function generateConsolidatedSummary(sources: any[], onToken?: any): Promise<string> { return "Consolidated Report."; }
export async function transcribeImageBest(dataUrl: string): Promise<string> { return "Vision is currently disabled in Bridge Mode."; }

export type { };
