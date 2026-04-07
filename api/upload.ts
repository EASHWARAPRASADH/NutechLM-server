import { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false, // Disabling bodyParser is necessary for formidable to work
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ multiples: false });

  try {
    const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const title = file.originalFilename || 'Untitled File';
    const buffer = fs.readFileSync(file.filepath);

    let content = '';
    if (file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      content = data.text;
    } else {
      content = buffer.toString('utf-8');
    }

    res.status(200).json({ title, content });
  } catch (error) {
    console.error('File processing error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
}
