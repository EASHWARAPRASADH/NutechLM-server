import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { Notebook } from '../types';

/**
 * Export a notebook's full content to a PDF (.pdf) file.
 */
export function exportToPdf(notebook: Notebook) {
  const doc = new jsPDF('p', 'mm', 'a4');
  let y = 30;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const wrapWidth = pageWidth - (margin * 2);

  const addWrappedText = (text: string, fontSize: number, style: string = 'normal', color: [number, number, number] = [0, 0, 0]) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', style);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, wrapWidth);
    for (const line of lines) {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += (fontSize * 0.5);
    }
    y += 5;
  };

  // Cover
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('NUTECHLM RESEARCH REPORT', margin, y);
  y += 15;
  doc.setFontSize(16);
  doc.setTextColor(37, 99, 235);
  doc.text(notebook.title.toUpperCase(), margin, y);
  y += 10;
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 20;

  // Sources
  addWrappedText(`SOURCES (${notebook.sources.length})`, 12, 'bold', [50, 50, 50]);
  for (const s of notebook.sources) {
    addWrappedText(s.title, 10, 'bold', [0, 0, 0]);
    addWrappedText(s.content.substring(0, 300) + '...', 8, 'normal', [100, 100, 100]);
    y += 2;
  }
  y += 10;

  // Notes
  addWrappedText(`NOTES (${notebook.notes.length})`, 12, 'bold', [50, 50, 50]);
  for (const n of notebook.notes) {
    addWrappedText(n.title, 10, 'bold', [0, 0, 0]);
    addWrappedText(n.content, 8, 'normal', [60, 60, 60]);
    y += 2;
  }
  y += 10;

  // Chat
  addWrappedText(`CHAT HISTORY`, 12, 'bold', [50, 50, 50]);
  for (const c of notebook.chatHistory) {
    const role = c.role === 'user' ? 'RESEARCHER' : 'AI ASSISTANT';
    addWrappedText(role, 8, 'bold', c.role === 'user' ? [100, 100, 100] : [37, 99, 235]);
    addWrappedText(c.content, 9, 'normal', [30, 30, 30]);
  }

  const fileName = `${notebook.title.replace(/[^a-zA-Z0-9]/g, '_')}_research.pdf`;
  doc.save(fileName);
}

/**
 * Export a notebook's full content to an Excel (.xlsx) file.
 * Includes separate sheets for Sources, Notes, and Chat History.
 */
export function exportToExcel(notebook: Notebook) {
  const wb = XLSX.utils.book_new();

  // Sources sheet
  const sourcesData = notebook.sources.map(s => ({
    'Title': s.title,
    'Type': s.type.toUpperCase(),
    'Content Preview': s.content.substring(0, 500),
    'Created': new Date(s.createdAt).toLocaleString()
  }));
  if (sourcesData.length > 0) {
    const ws1 = XLSX.utils.json_to_sheet(sourcesData);
    ws1['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 80 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Sources');
  }

  // Notes sheet
  const notesData = notebook.notes.map(n => ({
    'Title': n.title,
    'Content': n.content,
    'Created': new Date(n.createdAt).toLocaleString()
  }));
  if (notesData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(notesData);
    ws2['!cols'] = [{ wch: 30 }, { wch: 100 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Notes');
  }

  // Chat History sheet
  const chatData = notebook.chatHistory.map(c => ({
    'Role': c.role === 'user' ? 'Researcher' : 'AI Assistant',
    'Message': c.content,
    'Timestamp': new Date(c.createdAt).toLocaleString()
  }));
  if (chatData.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(chatData);
    ws3['!cols'] = [{ wch: 15 }, { wch: 100 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Chat History');
  }

  // If all empty, add a summary sheet
  if (sourcesData.length === 0 && notesData.length === 0 && chatData.length === 0) {
    const ws = XLSX.utils.json_to_sheet([{ 'Info': 'This notebook has no content to export.' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  const fileName = `${notebook.title.replace(/[^a-zA-Z0-9]/g, '_')}_export.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Export a notebook's full content to a Word (.docx) document.
 * Uses HTML-to-Blob approach for simple, dependency-free .docx generation.
 */
export function exportToWord(notebook: Notebook) {
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${notebook.title}</title>
      <style>
        body { font-family: 'Calibri', sans-serif; color: #1a1a1a; line-height: 1.6; padding: 40px; }
        h1 { font-size: 28px; color: #111; border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin-bottom: 24px; }
        h2 { font-size: 20px; color: #333; margin-top: 32px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
        h3 { font-size: 16px; color: #555; margin-top: 16px; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th { background: #f5f5f5; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #ddd; }
        td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .badge-user { background: #f0f0f0; color: #333; }
        .badge-ai { background: #eff6ff; color: #2563eb; }
        .meta { font-size: 11px; color: #999; }
        .note-content { white-space: pre-wrap; font-size: 13px; }
        p.empty { color: #999; font-style: italic; }
      </style>
    </head>
    <body>
      <h1>${notebook.title}</h1>
      <p class="meta">Exported on ${new Date().toLocaleString()} | Owner: ${notebook.ownerId}</p>
  `;

  // Sources Section
  html += `<h2>Research Sources (${notebook.sources.length})</h2>`;
  if (notebook.sources.length > 0) {
    html += `<table><tr><th>Title</th><th>Type</th><th>Content Preview</th></tr>`;
    for (const s of notebook.sources) {
      html += `<tr>
        <td><strong>${escapeHtml(s.title)}</strong></td>
        <td>${s.type.toUpperCase()}</td>
        <td>${escapeHtml(s.content.substring(0, 300))}${s.content.length > 300 ? '...' : ''}</td>
      </tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="empty">No sources in this notebook.</p>`;
  }

  // Notes Section
  html += `<h2>Research Notes (${notebook.notes.length})</h2>`;
  for (const n of notebook.notes) {
    html += `<h3>${escapeHtml(n.title)}</h3>`;
    html += `<p class="meta">${new Date(n.createdAt).toLocaleString()}</p>`;
    html += `<div class="note-content">${escapeHtml(n.content)}</div>`;
  }
  if (notebook.notes.length === 0) {
    html += `<p class="empty">No notes in this notebook.</p>`;
  }

  // Chat History Section
  html += `<h2>Intelligence Chat (${notebook.chatHistory.length} messages)</h2>`;
  if (notebook.chatHistory.length > 0) {
    html += `<table><tr><th>Role</th><th>Message</th><th>Time</th></tr>`;
    for (const c of notebook.chatHistory) {
      const role = c.role === 'user' ? 'Researcher' : 'AI Assistant';
      const badgeClass = c.role === 'user' ? 'badge-user' : 'badge-ai';
      html += `<tr>
        <td><span class="badge ${badgeClass}">${role}</span></td>
        <td>${escapeHtml(c.content).substring(0, 500)}</td>
        <td class="meta">${new Date(c.createdAt).toLocaleString()}</td>
      </tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="empty">No chat history.</p>`;
  }

  html += `</body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${notebook.title.replace(/[^a-zA-Z0-9]/g, '_')}_export.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}
