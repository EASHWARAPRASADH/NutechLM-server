import { db } from './src/lib/db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = process.env.VITE_GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY) : null;

async function test() {
  try {
    const notebookId = '242d4415-a4a1-4de6-a52a-2d6140023a00';
    console.log('Fetching notebook:', notebookId);
    
    const sources = await db.prepare('SELECT title, content FROM sources WHERE notebook_id = $1 LIMIT 3').all(notebookId) as any[];
    const lastSummary = await db.prepare('SELECT content FROM chat_messages WHERE notebook_id = $1 AND role = $2 ORDER BY created_at DESC LIMIT 1').get(notebookId, 'model') as any;
    
    let context = sources.map(s => `SOURCE: ${s.title}\nCONTENT: ${s.content.substring(0, 500)}`).join('\n\n');
    if (lastSummary) {
      context += `\n\nLATEST SUMMARY: ${lastSummary.content.substring(0, 1000)}`;
    }
    
    const model = genAI!.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const prompt = `Generate a concise, professional 3-5 word research title for this notebook. 
Use the provided source titles and especially the LATEST SUMMARY for context.
Return ONLY the title text.

CONTEXT:
${context}`;
    
    console.log('Sending prompt to AI...');
    const result = await model.generateContent(prompt);
    const newTitle = result.response.text().trim().replace(/[*"']/g, '');
    
    console.log('AI generated title:', newTitle);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
