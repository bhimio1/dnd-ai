# LoreWeaver - AI D&D Campaign Manager

An immersive, AI-powered campaign management tool for Dungeon Masters, featuring a Homebrewery-style Markdown editor, intelligent lore integration, and a cost-efficient context library.

## Features

- **AI Lore Engine:** Powered by `gemini-2.5-flash-lite` with explicit context caching for low-cost rulebook referencing.
- **Homebrewery Editor:** Professional D&D-themed writing experience with live parchment preview.
- **Intelligent Canonization:** Seamlessly weave AI suggestions into your documents by highlighting text.
- **Source Library:** Upload and manage campaign-specific or global PDF rulebooks.
- **Document Versioning:** Automated history tracking for up to 20 versions per document.
- **Tome Export:** Export selected chronicles to PDF (styled), Markdown, HTML, or DOCX.
- **Safety First:** Emergency autosaves and unsaved changes warnings.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A Google Gemini API Key

### Installation

1. Clone the repository.
2. Install root dependencies:
   ```bash
   npm install
   ```
3. Install client dependencies:
   ```bash
   cd client && npm install
   ```
4. Create a `.env` file in the root directory and add your API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   PORT=3001
   ```

### Running the Application

### Development Mode (Local Editing)
Starts both servers with live-reload. Use this for testing changes.
```bash
npm run dev
```
Access at `http://localhost:5173`.

### Production Mode (Home Server)
The preferred way to run on your server. The backend serves the UI.
1. **Build:** `npm run build`
2. **Start:** `PORT=80 npm start` (Use `sudo` if on port 80)
Access at `http://your-server-ip`.

**NOTE:** If you see "localhost:3001" errors in your browser after updating, perform a **Hard Refresh (Ctrl+F5)** to clear old cached files.

## Production Run (Home Server)

To run LoreWeaver in production mode on your home server (serving both API and Frontend from a single port):

1. **Build the Frontend:**
   ```bash
   cd client && npm run build && cd ..
   ```
2. **Start the Unified Server:**
   ```bash
   node server/index.js
   ```
   The entire application will now be available on the port specified in your `.env` (default `3001`).

3. **(Optional) Use a Process Manager (PM2):**
   To keep the server running in the background and auto-restart on reboot:
   ```bash
   # Install PM2 globally if you haven't
   npm install -g pm2
   
   # Start the server
   pm2 start server/index.js --name "loreweaver"
   
   # Ensure it starts on system boot
   pm2 startup
   pm2 save
   ```

## Architecture

- **Backend:** Node.js, Express, SQLite (better-sqlite3)
- **Frontend:** React, Vite, Tailwind CSS v4, Lucide Icons
- **AI:** Google Generative AI (Gemini) SDK
- **Export:** marked (Markdown parsing), docx (Word generation)

## License

ISC
