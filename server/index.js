const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager, GoogleAICacheManager } = require('@google/generative-ai/server');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const TurndownService = require('turndown');
const fs = require('fs');
const Database = require('better-sqlite3');
const { Document, Packer, Paragraph, TextRun } = require('docx');
require('dotenv').config();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const EMBEDDING_MODEL = 'text-embedding-004';

const app = express();
const port = process.env.PORT || 3001;

// Ensure required directories exist
const dirs = ['./data', './uploads'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const db = new Database('./data/dnd-ai.db');

// In-memory store for active context caches to reduce costs
const activeCaches = new Map();

// Database Setup
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    setting TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    title TEXT NOT NULL,
    content TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
  );

  CREATE TABLE IF NOT EXISTS document_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    content TEXT,
    version INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents (id)
  );

  CREATE TABLE IF NOT EXISTS source_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    name TEXT,
    file_path TEXT,
    text_content TEXT,
    file_uri TEXT,
    mime_type TEXT DEFAULT 'application/pdf',
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
  );

  CREATE TABLE IF NOT EXISTS global_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    file_path TEXT,
    text_content TEXT,
    file_uri TEXT,
    mime_type TEXT DEFAULT 'application/pdf',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER,
    content TEXT,
    embedding TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES source_books (id)
  );
`);

// Migration for existing tables if mime_type is missing
try {
  const tableInfo = db.prepare('PRAGMA table_info(source_books)').all();
  if (!tableInfo.some(col => col.name === 'mime_type')) {
    db.prepare('ALTER TABLE source_books ADD COLUMN mime_type TEXT DEFAULT "application/pdf"').run();
  }
  const globalTableInfo = db.prepare('PRAGMA table_info(global_sources)').all();
  if (!globalTableInfo.some(col => col.name === 'mime_type')) {
    db.prepare('ALTER TABLE global_sources ADD COLUMN mime_type TEXT DEFAULT "application/pdf"').run();
  }
} catch (e) {
  console.log('Migration check skipped or failed:', e.message);
}

// Middleware
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

// Serve static files from the React app in production
app.use(express.static(path.join(__dirname, '../client/dist')));

// Gemini Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const cacheManager = new GoogleAICacheManager(process.env.GEMINI_API_KEY);
const turndownService = new TurndownService();

// --- RAG Helper Functions ---

function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  if (!text) return chunks;

  let startIndex = 0;
  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    chunks.push(text.slice(startIndex, endIndex));

    if (endIndex === text.length) break;
    startIndex += chunkSize - overlap;
  }
  return chunks;
}

async function getEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    console.error("Embedding error:", err.message);
    return null;
  }
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

async function createSourceEmbeddings(sourceId, text) {
  console.log(`Generating embeddings for source ${sourceId}...`);
  const chunks = chunkText(text);
  const insertStmt = db.prepare('INSERT INTO embeddings (source_id, content, embedding) VALUES (?, ?, ?)');

  let count = 0;
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk);
    if (embedding) {
      insertStmt.run(sourceId, chunk, JSON.stringify(embedding));
      count++;
    }
    // Rate limit helper: sleep a bit to avoid hitting API limits aggressively
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`Created ${count} embeddings for source ${sourceId}.`);
}

// --- Startup Migration: Backfill Embeddings ---
(async () => {
  try {
    const sources = db.prepare(`
      SELECT s.id, s.text_content
      FROM source_books s
      LEFT JOIN embeddings e ON s.id = e.source_id
      WHERE e.id IS NULL
    `).all();

    if (sources.length > 0) {
      console.log(`Found ${sources.length} sources missing embeddings. Starting backfill...`);
      for (const source of sources) {
        if (source.text_content) {
          await createSourceEmbeddings(source.id, source.text_content);
        } else {
            console.warn(`Source ${source.id} has no text content, skipping.`);
        }
      }
      console.log('Backfill complete.');
    }
  } catch (err) {
    console.error('Migration failed:', err);
  }
})();


// Helper: Process Uploaded File
async function processUploadedFile(file) {
  const { mimetype, path: filePath, originalname } = file;
  let text = '';
  let finalUri = '';
  let finalMimeType = mimetype;
  let tempFilePath = null;

  console.log(`Processing file: ${originalname} (${mimetype})`);

  try {
    if (mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      text = data.text;

      // REMOVED: fileManager.uploadFile call as we are moving to RAG
      finalUri = `local://${filePath}`; // Use a local URI scheme placeholder

    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname.toLowerCase().endsWith('.docx')
    ) {
      // Parse DOCX to HTML then Markdown
      const result = await mammoth.convertToHtml({ path: filePath });
      text = turndownService.turndown(result.value);

      // Create temp MD file for upload
      tempFilePath = filePath + '.md';
      fs.writeFileSync(tempFilePath, text);

      finalMimeType = 'text/markdown';
       // REMOVED: fileManager.uploadFile call as we are moving to RAG
      finalUri = `local://${tempFilePath}`;

    } else if (
      mimetype === 'text/markdown' ||
      mimetype === 'text/x-markdown' ||
      originalname.toLowerCase().endsWith('.md')
    ) {
      text = fs.readFileSync(filePath, 'utf8');
      finalMimeType = 'text/markdown';

       // REMOVED: fileManager.uploadFile call as we are moving to RAG
      finalUri = `local://${filePath}`;

    } else if (
      mimetype === 'text/plain' ||
      originalname.toLowerCase().endsWith('.txt') ||
      mimetype === 'application/json' ||
      originalname.toLowerCase().endsWith('.json')
    ) {
      text = fs.readFileSync(filePath, 'utf8');
      finalMimeType = 'text/plain'; // Treat JSON as plain text for Gemini context

       // REMOVED: fileManager.uploadFile call as we are moving to RAG
      finalUri = `local://${filePath}`;

    } else {
      throw new Error(`Unsupported file type: ${mimetype}`);
    }
  } finally {
    // Cleanup generated temp file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch(e) { console.error('Failed to clean temp file:', e); }
    }
  }

  return { text, uri: finalUri, mimeType: finalMimeType };
}

// Routes
app.get('/api/campaigns', (req, res) => {
  const campaigns = db.prepare(`
    SELECT 
      c.*, 
      COUNT(s.id) AS sourceCount 
    FROM campaigns c
    LEFT JOIN source_books s ON c.id = s.campaign_id
    GROUP BY c.id
  `).all();
  res.json(campaigns);
});

app.post('/api/campaigns', (req, res) => {
  const { name, setting } = req.body;
  const result = db.prepare('INSERT INTO campaigns (name, setting) VALUES (?, ?)').run(name, setting);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/campaigns/:id/rename', (req, res) => {
  const { name, setting } = req.body;
  db.prepare('UPDATE campaigns SET name = ?, setting = ? WHERE id = ?').run(name, setting, req.params.id);
  res.json({ success: true });
});

app.delete('/api/campaigns/:id', (req, res) => {
  const campaignId = req.params.id;

  // 1. Idempotency Check
  const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    return res.status(200).json({ success: true, message: 'Campaign already deleted or does not exist.' });
  }

  const deleteTransaction = db.transaction(() => {
    // 2. Cleanup files
    const sources = db.prepare('SELECT file_path FROM source_books WHERE campaign_id = ?').all(campaignId);
    for (const source of sources) {
      if (fs.existsSync(source.file_path)) {
        try { fs.unlinkSync(source.file_path); } catch (err) { console.error(err); }
      }
    }

    // 3. Delete DB records
    // Clean up embeddings first (explicitly, though FK cascade might handle it if enabled)
    db.prepare('DELETE FROM embeddings WHERE source_id IN (SELECT id FROM source_books WHERE campaign_id = ?)').run(campaignId);

    db.prepare('DELETE FROM source_books WHERE campaign_id = ?').run(campaignId);
    db.prepare('DELETE FROM document_history WHERE document_id IN (SELECT id FROM documents WHERE campaign_id = ?)').run(campaignId);
    db.prepare('DELETE FROM documents WHERE campaign_id = ?').run(campaignId);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);

    // 4. Audit
    db.prepare('INSERT INTO audit_logs (action, details) VALUES (?, ?)').run(
      'DELETE_CAMPAIGN', 
      `Campaign "${campaign.name}" (ID: ${campaignId}) was deleted.`
    );
  });

  try {
    deleteTransaction();
    res.json({ success: true, message: `Campaign "${campaign.name}" has been permanently removed.` });
  } catch (err) {
    console.error('Robust Deletion Failed:', err);
    res.status(500).json({ error: 'Failed to complete campaign deletion safely.', details: err.message });
  }
});

app.get('/api/campaigns/:id/documents', (req, res) => {
  const documents = db.prepare('SELECT * FROM documents WHERE campaign_id = ?').all(req.params.id);
  res.json(documents);
});

app.get('/api/campaigns/:id/sources', (req, res) => {
  const sources = db.prepare('SELECT * FROM source_books WHERE campaign_id = ?').all(req.params.id);
  res.json(sources);
});

app.delete('/api/sources/:id', async (req, res) => {
  const source = db.prepare('SELECT * FROM source_books WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  
  if (fs.existsSync(source.file_path)) fs.unlinkSync(source.file_path);

  // Cleanup embeddings
  db.prepare('DELETE FROM embeddings WHERE source_id = ?').run(req.params.id);

  db.prepare('DELETE FROM source_books WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json(doc);
});

app.post('/api/campaigns/:id/documents', (req, res) => {
  const { title, content } = req.body;
  const result = db.prepare('INSERT INTO documents (campaign_id, title, content) VALUES (?, ?, ?)').run(req.params.id, title, content);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/documents/:id', (req, res) => {
  const { content } = req.body;
  const current = db.prepare('SELECT content, version FROM documents WHERE id = ?').get(req.params.id);
  
  const historyCount = db.prepare('SELECT COUNT(*) FROM document_history WHERE document_id = ?').get(req.params.id);
  if (historyCount['COUNT(*)'] >= 20) {
    const oldestHistory = db.prepare('SELECT id FROM document_history WHERE document_id = ? ORDER BY created_at ASC LIMIT 1').get(req.params.id);
    if (oldestHistory) {
      db.prepare('DELETE FROM document_history WHERE id = ?').run(oldestHistory.id);
    }
  }
  db.prepare('INSERT INTO document_history (document_id, content, version) VALUES (?, ?, ?)').run(req.params.id, current.content, current.version);
  
  db.prepare('UPDATE documents SET content = ?, version = version + 1 WHERE id = ?').run(content, req.params.id);
  res.json({ success: true });
});

app.put('/api/documents/:id/rename', (req, res) => {
  const { title } = req.body;
  db.prepare('UPDATE documents SET title = ? WHERE id = ?').run(title, req.params.id);
  res.json({ success: true });
});

app.delete('/api/documents/:id', (req, res) => {
  const docId = req.params.id;
  db.prepare('DELETE FROM document_history WHERE document_id = ?').run(docId);
  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
  res.json({ success: true });
});

app.get('/api/documents/:id/history', (req, res) => {
  const docId = req.params.id;
  const history = db.prepare('SELECT id, version, created_at FROM document_history WHERE document_id = ? ORDER BY created_at DESC').all(docId);
  res.json(history);
});

app.get('/api/document_history/:id', (req, res) => {
  const historyId = req.params.id;
  const historyEntry = db.prepare('SELECT content FROM document_history WHERE id = ?').get(historyId);
  if (!historyEntry) return res.status(404).json({ error: 'History entry not found' });
  res.json(historyEntry);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
  } else {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});

app.post('/api/export-docx', async (req, res) => {
  const { markdown, filename = 'export' } = req.body;

  const doc = new Document({
    sections: [{
      children: markdown.split('\n').map(line => {
        if (line.startsWith('### ')) {
          return new Paragraph({ text: line.substring(4), heading: 'Heading3' });
        } else if (line.startsWith('## ')) {
          return new Paragraph({ text: line.substring(3), heading: 'Heading2' });
        } else if (line.startsWith('# ')) {
          return new Paragraph({ text: line.substring(2), heading: 'Heading1' });
        } else if (line.startsWith('---')) {
            return new Paragraph({ text: '', thematicBreak: true });
        } else if (line.startsWith('**') && line.endsWith('**')) {
            return new Paragraph({
                children: [
                    new TextRun({ text: line.substring(2, line.length - 2), bold: true }),
                ],
            });
        } else if (line.startsWith('*') && line.endsWith('*')) {
            return new Paragraph({
                children: [
                    new TextRun({ text: line.substring(1, line.length - 1), italic: true }),
                ],
            });
        } else if (line.trim() === '') {
          return new Paragraph({ text: '' });
        }
        return new Paragraph({ text: line });
      }),
    }],
  });

  try {
    const b64string = await Packer.toBase64String(doc);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.docx"`);
    res.send(Buffer.from(b64string, 'base64'));
  } catch (error) {
    console.error('Error generating DOCX:', error);
    res.status(500).json({ error: 'Failed to generate DOCX', details: error.message });
  }
});

app.get('/api/global-sources', (req, res) => {
  const sources = db.prepare('SELECT id, name, created_at FROM global_sources ORDER BY created_at DESC').all();
  res.json(sources);
});

app.post('/api/global-sources/upload', upload.single('pdf'), async (req, res) => {
  const { originalname, path: filePath } = req.file;
  
  try {
    const { text, uri, mimeType } = await processUploadedFile(req.file);
    
    db.prepare('INSERT INTO global_sources (name, file_path, text_content, file_uri, mime_type) VALUES (?, ?, ?, ?, ?)').run(
      originalname, filePath, text, uri, mimeType
    );
    res.json({ success: true, uri: uri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload global source', details: err.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch(e) { console.error('Failed to clean upload:', e); }
    }
  }
});

app.delete('/api/global-sources/:id', async (req, res) => {
  const source = db.prepare('SELECT file_path, file_uri FROM global_sources WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Global source not found' });
  
  if (fs.existsSync(source.file_path)) fs.unlinkSync(source.file_path);
  db.prepare('DELETE FROM global_sources WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM source_books WHERE file_uri = ?').run(source.file_uri);
  res.json({ success: true });
});

app.post('/api/campaigns/:campaignId/assign-source/:globalSourceId', async (req, res) => {
  const { campaignId, globalSourceId } = req.params;
  const globalSource = db.prepare('SELECT name, file_path, text_content, file_uri, mime_type FROM global_sources WHERE id = ?').get(globalSourceId);

  if (!globalSource) return res.status(404).json({ error: 'Global source not found' });

  const existing = db.prepare('SELECT id FROM source_books WHERE campaign_id = ? AND file_uri = ?').get(campaignId, globalSource.file_uri);
  if (existing) return res.status(409).json({ error: 'Source already assigned to this campaign' });

  const result = db.prepare('INSERT INTO source_books (campaign_id, name, file_path, text_content, file_uri, mime_type) VALUES (?, ?, ?, ?, ?, ?)').run(
    campaignId, globalSource.name, globalSource.file_path, globalSource.text_content, globalSource.file_uri, globalSource.mime_type
  );

  // Create embeddings for the newly assigned source
  // We use the text_content already in the global source
  createSourceEmbeddings(result.lastInsertRowid, globalSource.text_content).catch(err => {
      console.error('Background embedding generation failed for assigned source:', err);
  });

  res.json({ success: true });
});


app.post('/api/campaigns/:id/upload', upload.single('pdf'), async (req, res) => {
  const { originalname, path: filePath } = req.file;
  
  try {
    const { text, uri, mimeType } = await processUploadedFile(req.file);
    
    const result = db.prepare('INSERT INTO source_books (campaign_id, name, file_path, text_content, file_uri, mime_type) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.params.id, originalname, filePath, text, uri, mimeType
    );

    // Create embeddings for the new source
    createSourceEmbeddings(result.lastInsertRowid, text).catch(err => {
      console.error('Background embedding generation failed for uploaded source:', err);
    });
    
    res.json({ success: true, text: text, uri: uri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process file', details: err.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch(e) { console.error('Failed to clean upload:', e); }
    }
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, campaignId, documentId, documentContent } = req.body;
  
  try {
    const systemInstruction = `You are a D&D Campaign Assistant.
You have access to custom Homebrewery-style markdown blocks for formatting D&D content.
Use the following syntax:
- Monster/NPC Stat Block: {{monster,frame ... }}
- Note Box (Green): {{note ... }}
- Descriptive Box (Fancy): {{descriptive ... }}
- Tables: Use standard Markdown tables.

The document currently being edited:
"""
${documentContent}
"""

Instructions:
1. Brainstorm lore using the attached sources and current document.
2. Maintain consistency.
3. Provide Markdown if asked to "canonize" or "add".
4. Use the provided context chunks to answer the user's request.`;

    // 1. Generate embedding for user query
    const userEmbedding = await getEmbedding(message);
    
    // 2. Retrieve relevant chunks (RAG)
    let contextChunks = [];
    if (userEmbedding) {
      // Get all embeddings for this campaign's sources
      const rows = db.prepare(`
        SELECT e.content, e.embedding
        FROM embeddings e
        JOIN source_books s ON e.source_id = s.id
        WHERE s.campaign_id = ?
      `).all(campaignId);

      // Rank by similarity
      const ranked = rows.map(row => ({
        content: row.content,
        similarity: cosineSimilarity(userEmbedding, JSON.parse(row.embedding))
      })).sort((a, b) => b.similarity - a.similarity);

      // Select top K chunks (e.g., Top 5)
      contextChunks = ranked.slice(0, 5).map(r => r.content);
      console.log(`RAG: Retrieved ${contextChunks.length} chunks for query.`);
    }

    // 3. Construct Prompt
    const contextText = contextChunks.length > 0
      ? `--- RELEVANT SOURCE MATERIAL ---\n${contextChunks.join('\n\n')}\n----------------------------------\n`
      : '';

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const parts = [
      { text: systemInstruction },
      { text: contextText },
      { text: `User says: ${message}` }
    ];

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }]
    });
    const response = await result.response;
    res.json({ response: response.text() });
  } catch (err) {
    console.error('--- GEMINI ERROR ---');
    console.error(err);
    res.status(500).json({ error: 'AI processing failed', details: err.message });
  }
});

app.post('/api/canonize', async (req, res) => {
  const { selection, fullResponse, documentContent, campaignId } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    
    const prompt = `You are a Professional D&D Book Editor.
You have access to custom Homebrewery-style markdown blocks for formatting D&D content.
Use the following syntax:
- Monster/NPC Stat Block: {{monster,frame ... }}
- Note Box (Green): {{note ... }}
- Descriptive Box (Fancy): {{descriptive ... }}
- Tables: Use standard Markdown tables.

Your task is to seamlessly integrate a specific "Lore Selection" into an existing D&D document.

--- EXISTING DOCUMENT ---
${documentContent}

--- LORE SELECTION TO INTEGRATE ---
${selection}

--- CONTEXT (Full AI Brainstorming Response) ---
${fullResponse}

INSTRUCTIONS:
1. Integrate the Lore Selection into the Existing Document.
2. You may APPEND it to the end OR SPLICE it into a relevant section if one exists.
3. Ensure the transition is natural and reads like a professional D&D sourcebook (Homebrewery/GMBinder style).
4. Remove redundant headers or introductory phrases.
5. DO NOT change the existing lore, only add the new selection and fix the flow.
6. Return ONLY the full, updated Markdown content of the document. No explanations.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ updatedContent: response.text().replace(/^```markdown\n|```$/g, '') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Canonization failed' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
