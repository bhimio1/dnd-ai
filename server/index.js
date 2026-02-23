const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager, GoogleAICacheManager } = require('@google/generative-ai/server');
const pdf = require('pdf-parse');
const fs = require('fs');
const Database = require('better-sqlite3');
const { Document, Packer, Paragraph, TextRun } = require('docx');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
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
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
  );

  CREATE TABLE IF NOT EXISTS global_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    file_path TEXT,
    text_content TEXT,
    file_uri TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

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

  // 1. Idempotency Check: Verify existence
  const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    return res.status(200).json({ success: true, message: 'Campaign already deleted or does not exist.' });
  }

  const deleteTransaction = db.transaction(() => {
    // 2. Fetch associated source files for disk cleanup
    const sources = db.prepare('SELECT file_path FROM source_books WHERE campaign_id = ?').all(campaignId);
    for (const source of sources) {
      if (fs.existsSync(source.file_path)) {
        try {
          fs.unlinkSync(source.file_path);
        } catch (err) {
          console.error(`Failed to delete file ${source.file_path}:`, err);
        }
      }
    }

    // 3. Delete from database in order of dependencies
    db.prepare('DELETE FROM source_books WHERE campaign_id = ?').run(campaignId);
    db.prepare('DELETE FROM document_history WHERE document_id IN (SELECT id FROM documents WHERE campaign_id = ?)').run(campaignId);
    db.prepare('DELETE FROM documents WHERE campaign_id = ?').run(campaignId);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);

    // 4. Audit Logging
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
  
  // Optional: Delete from Gemini File API? 
  // For now, just clean database and local file.
  if (fs.existsSync(source.file_path)) fs.unlinkSync(source.file_path);
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
  
  // Save history
  // Check current history count
  const historyCount = db.prepare('SELECT COUNT(*) FROM document_history WHERE document_id = ?').get(req.params.id);
  if (historyCount['COUNT(*)'] >= 20) {
    // Find and delete the oldest history entry
    const oldestHistory = db.prepare('SELECT id FROM document_history WHERE document_id = ? ORDER BY created_at ASC LIMIT 1').get(req.params.id);
    if (oldestHistory) {
      db.prepare('DELETE FROM document_history WHERE id = ?').run(oldestHistory.id);
    }
  }
  db.prepare('INSERT INTO document_history (document_id, content, version) VALUES (?, ?, ?)').run(req.params.id, current.content, current.version);
  
  // Update document
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
  db.prepare('DELETE FROM document_history WHERE document_id = ?').run(docId); // Delete history first
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

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.post('/api/export-docx', async (req, res) => {
  const { markdown, filename = 'export' } = req.body;

  // Basic Markdown to DOCX conversion
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
        } else if (line.startsWith('**') && line.endsWith('**')) { // Basic bold
            return new Paragraph({
                children: [
                    new TextRun({ text: line.substring(2, line.length - 2), bold: true }),
                ],
            });
        } else if (line.startsWith('*') && line.endsWith('*')) { // Basic italic
            return new Paragraph({
                children: [
                    new TextRun({ text: line.substring(1, line.length - 1), italic: true }),
                ],
            });
        } else if (line.trim() === '') {
          return new Paragraph({ text: '' }); // Empty paragraph for newlines
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

// Global Sources API
app.get('/api/global-sources', (req, res) => {
  const sources = db.prepare('SELECT id, name, created_at FROM global_sources ORDER BY created_at DESC').all();
  res.json(sources);
});

app.post('/api/global-sources/upload', upload.single('pdf'), async (req, res) => {
  const { originalname, path: filePath, mimetype } = req.file;
  const dataBuffer = fs.readFileSync(filePath);
  
  try {
    const data = await pdf(dataBuffer); // Local parse for search/preview
    const uploadResponse = await fileManager.uploadFile(filePath, {
      mimeType: mimetype || 'application/pdf',
      displayName: originalname,
    });
    
    db.prepare('INSERT INTO global_sources (name, file_path, text_content, file_uri) VALUES (?, ?, ?, ?)').run(
      originalname, filePath, data.text, uploadResponse.file.uri
    );
    res.json({ success: true, uri: uploadResponse.file.uri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload global source' });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Clean up temp file
  }
});

app.delete('/api/global-sources/:id', async (req, res) => {
  const source = db.prepare('SELECT file_path, file_uri FROM global_sources WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Global source not found' });
  
  // Optional: Delete from Gemini File API here if file_uri is unique and not used elsewhere
  // For now, just clean database and local file.
  if (fs.existsSync(source.file_path)) fs.unlinkSync(source.file_path);
  db.prepare('DELETE FROM global_sources WHERE id = ?').run(req.params.id);
  // Also remove from campaign source_books if linked
  db.prepare('DELETE FROM source_books WHERE file_uri = ?').run(source.file_uri);
  res.json({ success: true });
});

app.post('/api/campaigns/:campaignId/assign-source/:globalSourceId', (req, res) => {
  const { campaignId, globalSourceId } = req.params;
  const globalSource = db.prepare('SELECT name, file_path, text_content, file_uri FROM global_sources WHERE id = ?').get(globalSourceId);

  if (!globalSource) return res.status(404).json({ error: 'Global source not found' });

  // Check if already assigned
  const existing = db.prepare('SELECT id FROM source_books WHERE campaign_id = ? AND file_uri = ?').get(campaignId, globalSource.file_uri);
  if (existing) return res.status(409).json({ error: 'Source already assigned to this campaign' });

  db.prepare('INSERT INTO source_books (campaign_id, name, file_path, text_content, file_uri) VALUES (?, ?, ?, ?, ?)').run(
    campaignId, globalSource.name, globalSource.file_path, globalSource.text_content, globalSource.file_uri
  );
  res.json({ success: true });
});


app.post('/api/campaigns/:id/upload', upload.single('pdf'), async (req, res) => {
  const { originalname, path: filePath, mimetype } = req.file;
  const dataBuffer = fs.readFileSync(filePath);
  
  try {
    // 1. Parse text locally (for potential search)
    const data = await pdf(dataBuffer);
    
    // 2. Upload to Gemini File API
    const uploadResponse = await fileManager.uploadFile(filePath, {
      mimeType: mimetype || 'application/pdf',
      displayName: originalname,
    });
    
    db.prepare('INSERT INTO source_books (campaign_id, name, file_path, text_content, file_uri) VALUES (?, ?, ?, ?, ?)').run(
      req.params.id, originalname, filePath, data.text, uploadResponse.file.uri
    );
    
    res.json({ success: true, text: data.text, uri: uploadResponse.file.uri });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, campaignId, documentId, documentContent } = req.body;
  
  try {
    const sourceBooks = db.prepare('SELECT file_uri FROM source_books WHERE campaign_id = ?').all(campaignId);
    const cacheKey = `campaign-${campaignId}-${sourceBooks.map(s => s.file_uri).sort().join('-')}`;
    
    // System instruction
    const systemInstruction = `You are a D&D Campaign Assistant.
The document currently being edited:
"""
${documentContent}
"""

Instructions:
1. Brainstorm lore using the attached sources and current document.
2. Maintain consistency.
3. Provide Markdown if asked to "canonize" or "add".`;

    let model;
    
    // Explicit Cache Management
    if (activeCaches.has(cacheKey) && Date.now() > activeCaches.get(cacheKey).expiresAt) {
       try { await cacheManager.delete(activeCaches.get(cacheKey).name); } catch(e) {}
       activeCaches.delete(cacheKey);
    }

    if (sourceBooks.length > 0 && !activeCaches.has(cacheKey)) {
      try {
        console.log('Attempting to create context cache with gemini-2.5-flash-lite...');
        const cache = await cacheManager.create({
          model: 'models/gemini-2.5-flash-lite',
          displayName: `Lore_Context_${campaignId}`,
          contents: [
            {
              role: 'user',
              parts: sourceBooks.map(s => ({
                fileData: { mimeType: 'application/pdf', fileUri: s.file_uri }
              }))
            }
          ],
          ttlSeconds: 3600,
        });
        activeCaches.set(cacheKey, { name: cache.name, expiresAt: Date.now() + 3500 * 1000 });
        console.log('Cache created:', cache.name);
      } catch (e) {
        console.log('Explicit caching skipped:', e.message);
      }
    }

    if (activeCaches.has(cacheKey)) {
      model = genAI.getGenerativeModelFromCachedContent({ 
        name: activeCaches.get(cacheKey).name,
        model: 'models/gemini-2.5-flash-lite'
      });
    } else {
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    }

    const parts = [
      { text: systemInstruction },
      ...(!activeCaches.has(cacheKey) ? sourceBooks.map(s => ({
        fileData: { mimeType: "application/pdf", fileUri: s.file_uri }
      })) : []),
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    
    const prompt = `You are a Professional D&D Book Editor.
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
