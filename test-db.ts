import { db } from './src/lib/db.js';

async function test() {
  try {
    const notebookId = '242d4415-a4a1-4de6-a52a-2d6140023a00';
    console.log('Fetching notebook:', notebookId);
    
    const notebook = await db.prepare('SELECT title FROM notebooks WHERE id = $1').get(notebookId);
    console.log('Current notebook:', notebook);
    
    const sources = await db.prepare('SELECT title, content FROM sources WHERE notebook_id = $1 LIMIT 3').all(notebookId);
    console.log('Sources count:', sources.length);
    if (sources.length > 0) {
      console.log('First source title:', sources[0].title);
    }

    const lastSummary = await db.prepare('SELECT content FROM chat_messages WHERE notebook_id = $1 AND role = $2 ORDER BY created_at DESC LIMIT 1').get(notebookId, 'model');
    console.log('Last summary found:', !!lastSummary);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
