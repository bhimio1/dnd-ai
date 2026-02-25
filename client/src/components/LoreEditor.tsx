import { DEFAULT_LORE_MARKDOWN } from '../constants/defaultLore';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkHomebrewery from '../plugins/remarkHomebrewery';
import '../styles/homebrewery.css';
import { 
  Plus, Save, ArrowLeft, Send, Sparkles, 
  Settings, Trash, List, FileText, 
  Wand2, Shield, Download,
  Library, Loader2 as LoaderIcon, History, Pencil
} from 'lucide-react';
import type { Campaign } from '../App';
import { SourceManager, type Source } from './SourceManager';
import { DocumentHistory } from './DocumentHistory';
import { DocumentExporter } from './DocumentExporter';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';


function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const preprocessHomebrewery = (markdown: string) => {
  if (!markdown) return '';
  return markdown.replace(
    /\{\{([a-zA-Z0-9_-]+)(?:,([^\n]*?))?\n([\s\S]*?)\n\}\}/gm,
    (_match, type, args, content) => {
      const attributes = args ? ` {args="${args}"}` : '';
      return `:::${type}${attributes}\n${content}\n:::`;
    }
  );
};

interface Document {
  id: number;
  title: string;
  content: string;
  version: number;
}

interface Props {
  campaign: Campaign;
  onBack: () => void;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export function LoreEditor({ campaign, onBack }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [markdown, setMarkdown] = useState(DEFAULT_LORE_MARKDOWN);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [viewMode, setViewMode] = useState<'split' | 'preview' | 'editor'>('split');
  const [showSourceManager, setShowSourceManager] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isRenamingDoc, setIsRenamingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  // State for Canonize Selection button

  // State for Canonize Selection button
  const [showCanonizeButton, setShowCanonizeButton] = useState(false);
  const [canonizeButtonPosition, setCanonizeButtonPosition] = useState({ x: 0, y: 0 });
  const [selectedTextForCanonize, setSelectedTextForCanonize] = useState('');
  const [fullAiResponseForCanonize, setFullAiResponseForCanonize] = useState('');
  const chatMessageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const fetchDocs = async () => {
    const res = await fetch(`/api/campaigns/${campaign.id}/documents`);
    const data = await res.json();
    setDocuments(data);
    // If no active doc and we have documents, select the first one (Overview)
    if (!activeDoc && data.length > 0) {
      selectDoc(data[0]);
    }
  };

  const fetchSources = async () => {
    const res = await fetch(`/api/campaigns/${campaign.id}/sources`);
    const data = await res.json();
    setSources(data);
  };

  useEffect(() => {
    fetchDocs();
    fetchSources();

    const handleClickOutside = (_event: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) { // No text selected
        setShowCanonizeButton(false);
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = ''; // Standard way to trigger the browser's confirmation dialog
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]); // Dependency added to re-run effect if hasUnsavedChanges changes

  // Track unsaved changes
  useEffect(() => {
    if (markdown !== activeDoc?.content && activeDoc) { // Only track if markdown differs from saved content
      setHasUnsavedChanges(true);
      // Emergency Autosave to localStorage
      localStorage.setItem(`autosave_doc_${activeDoc.id}`, markdown);
    } else {
      setHasUnsavedChanges(false);
      localStorage.removeItem(`autosave_doc_${activeDoc?.id}`); // Clear autosave if content matches
    }
  }, [markdown, activeDoc]);

  // Prompt to restore autosave on document load
  useEffect(() => {
    if (activeDoc) {
      const autosavedContent = localStorage.getItem(`autosave_doc_${activeDoc.id}`);
      if (autosavedContent && autosavedContent !== activeDoc.content) {
        if (window.confirm(
            `You have unsaved changes for "${activeDoc.title}" from a previous session. ` +
            `Would you like to restore them? Clicking "Cancel" will discard these changes.`
        )) {
          setMarkdown(autosavedContent);
          setHasUnsavedChanges(true); // Mark as unsaved as it's from autosave
        } else {
          localStorage.removeItem(`autosave_doc_${activeDoc.id}`);
          setHasUnsavedChanges(false);
        }
      } else {
        setHasUnsavedChanges(false); // No autosave or matches current content
      }
    }
    // Clear chat on doc change
    setChat([]);
  }, [activeDoc]); // Only re-run when activeDoc changes

  const selectDoc = async (doc: Document) => {
    if (activeDoc && hasUnsavedChanges) {
      const confirmation = window.confirm(
        `You have unsaved changes in "${activeDoc.title}". Do you want to save them before switching documents?`
      );
      if (confirmation) {
        await saveDoc(); // Save current document
      } else {
        setHasUnsavedChanges(false); // Discard changes
        localStorage.removeItem(`autosave_doc_${activeDoc.id}`);
      }
    }
    setActiveDoc(doc);
    setMarkdown(doc.content);
  };

  const saveDoc = async () => {
    if (!activeDoc) return;
    await fetch(`/api/documents/${activeDoc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: markdown }),
    });
    setHasUnsavedChanges(false); // Changes are now saved
    localStorage.removeItem(`autosave_doc_${activeDoc.id}`);
    fetchDocs();
  };

  const createDoc = async () => {
    const title = window.prompt('Enter a title for your new chronicle document:', 'New Document');
    if (title === null) return; // User cancelled

    const res = await fetch(`/api/campaigns/${campaign.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'New Document', content: `# ${title || 'New Lore Entry'}\n\nStart your chronicle here...` }),
    });
    const data = await res.json();
    fetchDocs();
    selectDoc({ id: data.id, title: title || 'New Document', content: `# ${title || 'New Lore Entry'}\n\nStart your chronicle here...`, version: 1 });
  };

  const handleChat = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setChat([...chat, { role: 'user', text: userMsg }]);
    setInput('');
    setIsAiLoading(true);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMsg,
        campaignId: campaign.id,
        documentId: activeDoc?.id,
        documentContent: markdown
      }),
    });
    const data = await res.json();
    setChat(prev => [...prev, { role: 'ai', text: data.response }]);
    setIsAiLoading(false);
  };

    const canonize = async (selectedText: string, fullResponse: string) => {
      if (!selectedText || selectedText.trim().length < 5) {
        alert('No valid lore selected to canonize. Please highlight the specific lore first, or use "Canonize All".');
        return;
      }
  
      setIsAiLoading(true);
      setShowCanonizeButton(false); // Hide the button immediately
      
      try {
        const res = await fetch('/api/canonize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selection: selectedText,
            fullResponse: fullResponse,
            documentContent: markdown,
            campaignId: campaign.id
          }),
        });
        
        const data = await res.json();
        if (data.updatedContent) {
          setMarkdown(data.updatedContent);
          // Automatically save the "canonized" version
          if (activeDoc) {
            await fetch(`/api/documents/${activeDoc.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: data.updatedContent }),
            });
            fetchDocs();
          }
        }
      } catch (err) {
        alert('Failed to intelligently integrate lore. Try again!');
      } finally {
        setIsAiLoading(false);
      }
    };
  
  const handleRenameDoc = async () => {
    if (!activeDoc || !newDocTitle.trim()) return;
    await fetch(`/api/documents/${activeDoc.id}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newDocTitle }),
    });
    setActiveDoc({ ...activeDoc, title: newDocTitle });
    fetchDocs();
    setIsRenamingDoc(false);
  };
    
        const handleDeleteDoc = async () => {
          if (!activeDoc || !window.confirm(`Are you sure you want to delete "${activeDoc.title}"? This cannot be undone.`)) return;
          await fetch(`/api/documents/${activeDoc.id}`, {
            method: 'DELETE',
          });
          setMarkdown(DEFAULT_LORE_MARKDOWN);
          setActiveDoc(null);
          fetchDocs();
          setHasUnsavedChanges(false); // No active doc, no unsaved changes
        };
      
        const handleRestoreVersion = async (historyId: number) => {
          const res = await fetch(`/api/document_history/${historyId}`);
          const data = await res.json();
          setMarkdown(data.content);
          setHasUnsavedChanges(true); // Restored version counts as unsaved until explicitly saved
          setShowHistoryModal(false);
        };
      
        return (
    <div className="flex h-full w-full bg-neutral-950">
      {/* Sidebar */}
      <div className={cn("bg-neutral-900 border-r border-neutral-800 flex flex-col transition-all duration-300 shadow-2xl z-20", showSidebar ? "w-72" : "w-0 overflow-hidden")}>
        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900">
          <div className="flex items-center gap-3">
            <Shield className="text-dnd-red" size={24} />
            <span className="font-cinzel font-black text-white text-lg truncate tracking-tighter">{campaign.name}</span>
          </div>
          <button onClick={onBack} className="text-neutral-500 hover:text-white transition p-2 rounded-lg hover:bg-neutral-800"><ArrowLeft size={18} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h4 className="px-2 text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-4">Chronicles</h4>
            <button 
              onClick={createDoc}
              className="w-full flex items-center gap-3 p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 hover:text-white mb-6 border border-neutral-700 transition shadow-md"
            >
              <Plus size={20} className="text-dnd-red" /> New Lore Document
            </button>
            
            <div className="space-y-1">
              {documents.map(doc => (
                <button 
                  key={doc.id}
                  onClick={() => selectDoc(doc)}
                  className={cn("w-full text-left p-3 rounded-xl text-sm transition-all flex items-center gap-3 border", activeDoc?.id === doc.id ? "bg-dnd-red/10 border-dnd-red/50 text-dnd-red font-bold" : "hover:bg-neutral-800 border-transparent text-neutral-400")}
                >
                  <FileText size={18} className={activeDoc?.id === doc.id ? "text-dnd-red" : "text-neutral-600"} /> <span className="truncate">{doc.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="px-2 text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-4">World Knowledge</h4>
            <button 
              onClick={() => setShowSourceManager(true)}
              className="w-full flex items-center gap-3 p-3 bg-neutral-800/40 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition border border-dashed border-neutral-700"
            >
              <Library size={20} /> Manage Source Library
            </button>
          </div>
        </div>
        
        <div className="p-4 border-t border-neutral-800 text-[10px] text-neutral-600 font-mono flex justify-between uppercase">
          <span>{campaign.setting || 'No Setting'}</span>
          <span>v1.0.4</span>
        </div>
      </div>

      {showSourceManager && (
        <SourceManager 
          campaignId={campaign.id} 
          onClose={() => setShowSourceManager(false)} 
          onUpdate={fetchSources}
        />
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col bg-neutral-900 overflow-hidden relative">
        <header className="h-16 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md flex items-center px-6 justify-between z-10 shadow-sm">
          <div className="flex items-center gap-6">
            <button onClick={() => setShowSidebar(!showSidebar)} className="text-neutral-500 hover:text-white transition p-2 rounded-lg hover:bg-neutral-800">
              <List size={22} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-dnd-red uppercase tracking-widest leading-none mb-1">Editing Lore</span>
              {isRenamingDoc ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameDoc();
                      if (e.key === 'Escape') setIsRenamingDoc(false);
                    }}
                    className="bg-neutral-800 border border-neutral-700 rounded-md p-1 text-white text-lg font-solway outline-none focus:border-dnd-red transition"
                  />
                  <button onClick={handleRenameDoc} className="text-green-500 hover:text-green-400 p-1"><Save size={18} /></button>
                  <button onClick={() => setIsRenamingDoc(false)} className="text-neutral-500 hover:text-white p-1">✕</button>
                </div>
              ) : (
                <div 
                  className="group flex items-center gap-2 cursor-pointer hover:text-dnd-red transition"
                  onClick={() => {
                    if (activeDoc) {
                      setNewDocTitle(activeDoc.title);
                      setIsRenamingDoc(true);
                    }
                  }}
                >
                  <span className="font-solway font-bold text-white text-lg tracking-tight">
                    {activeDoc?.title || 'LoreWeaver Syntax Guide'}
                  </span>
                  <Pencil size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-neutral-800 p-1 rounded-xl border border-neutral-700 mr-4">
              <button 
                onClick={() => setViewMode('editor')}
                className={cn("p-2 px-4 rounded-lg text-xs font-bold transition", viewMode === 'editor' ? "bg-neutral-700 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300")}
              >
                Scribe
              </button>
              <button 
                onClick={() => setViewMode('split')}
                className={cn("p-2 px-4 rounded-lg text-xs font-bold transition", viewMode === 'split' ? "bg-neutral-700 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300")}
              >
                Split
              </button>
              <button 
                onClick={() => setViewMode('preview')}
                className={cn("p-2 px-4 rounded-lg text-xs font-bold transition", viewMode === 'preview' ? "bg-neutral-700 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300")}
              >
                Tome
              </button>
            </div>
            <button onClick={saveDoc} className="bg-dnd-red hover:bg-red-800 px-6 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold text-white transition shadow-lg transform active:scale-95">
              <Save size={18} /> Scribe Lore
            </button>
            {activeDoc && (
              <>
                <button onClick={handleDeleteDoc} className="bg-neutral-700 hover:bg-red-700 px-3 py-2.5 rounded-xl flex items-center gap-2 text-sm text-white transition shadow-lg transform active:scale-95">
                  <Trash size={18} />
                </button>
                <button 
                  onClick={() => setShowHistoryModal(true)} 
                  className="bg-neutral-700 hover:bg-neutral-600 px-3 py-2.5 rounded-xl flex items-center gap-2 text-sm text-white transition shadow-lg transform active:scale-95"
                >
                  <History size={18} />
                </button>
                <button 
                  onClick={() => setShowExportModal(true)} 
                  className="bg-neutral-700 hover:bg-neutral-600 px-3 py-2.5 rounded-xl flex items-center gap-2 text-sm text-white transition shadow-lg transform active:scale-95"
                >
                  <Download size={18} />
                </button>
              </>
            )}
          </div>
        </header>

        {showHistoryModal && activeDoc && (
          <DocumentHistory
            documentId={activeDoc.id}
            onClose={() => setShowHistoryModal(false)}
            onRestore={handleRestoreVersion}
          />
        )}

        <div className={cn("flex-1 flex overflow-hidden", viewMode === 'preview' && "tome-container")}>
          {/* Markdown Editor */}
          {(viewMode === 'split' || viewMode === 'editor') && (
            <div className="flex-1 flex flex-col border-r border-neutral-800 bg-neutral-900 relative">
              <textarea 
                value={markdown}
                onChange={e => setMarkdown(e.target.value)}
                className="flex-1 p-8 font-mono text-neutral-400 bg-neutral-950 resize-none outline-none leading-relaxed text-sm selection:bg-dnd-red/20 border-0"
                placeholder="Once upon a time in the Forgotten Realms..."
              />
              <div className="absolute bottom-4 left-6 text-[10px] font-mono text-neutral-600 uppercase tracking-widest flex gap-4">
                <span>Characters: {markdown.length}</span>
                <span>Lines: {markdown.split('\n').length}</span>
              </div>
            </div>
          )}

          {/* Live Preview (Homebrewery style) */}
          {(viewMode === 'split' || viewMode === 'preview') && (
            <div className={cn("flex-1 overflow-y-auto flex justify-center custom-scrollbar", viewMode === 'split' && "tome-container")}>
              <div className="homebrewery-preview">
                <ReactMarkdown 
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus as any}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {preprocessHomebrewery(markdown)}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* AI Chat Drawer */}
          <div className={cn("border-l border-neutral-800 bg-neutral-900 flex flex-col shadow-2xl z-10", viewMode === 'split' ? 'w-96' : 'w-[500px]')}>
            <div className="p-5 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-dnd-red/20 p-2 rounded-lg">
                  <Sparkles size={20} className="text-dnd-red" />
                </div>
                <div>
                  <h4 className="font-cinzel font-black text-white text-sm uppercase tracking-wider">Lore Assistant</h4>
                  <p className="text-[9px] text-neutral-500 font-mono">Gemini 1.5 Flash Connected</p>
                </div>
              </div>
              <button className="text-neutral-600 hover:text-white transition"><Settings size={18} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-neutral-950/50">
              {chat.map((msg, i) => (
                <div 
                  key={i} 
                  className={cn("flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300", msg.role === 'user' ? "items-end" : "items-start")}
                  ref={el => { if (msg.role === 'ai') chatMessageRefs.current[i] = el; }}
                  onMouseUp={(_e) => {
                    if (msg.role === 'ai') {
                      const selection = window.getSelection();
                      if (!selection) {
                        setShowCanonizeButton(false);
                        return;
                      }
                      const selectedText = selection.toString().trim();
                      if (selectedText && selectedText.length > 5 && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        
                        const buttonWidth = 200; // Approximate width of the button
                        const buttonHeight = 40; // Approximate height of the button (adjust as needed)
                        const padding = 10; // Padding from window edges

                        let x = rect.left; // Start at the left of the selection
                        let y = rect.bottom + window.scrollY + padding; // Below the selection, plus padding

                        // Adjust X if button goes off-screen to the right
                        if (x + buttonWidth > window.innerWidth - padding) {
                          x = window.innerWidth - buttonWidth - padding;
                        }
                        // Adjust X if button goes off-screen to the left (unlikely if starting at rect.left but for safety)
                        if (x < padding) {
                          x = padding;
                        }

                        // Adjust Y if button goes off-screen below
                        if (y + buttonHeight > window.innerHeight - padding + window.scrollY) {
                          y = rect.top + window.scrollY - buttonHeight - padding; // Position above the selection
                          if (y < padding + window.scrollY) { // If it also goes off-screen above
                            y = padding + window.scrollY; // Just stick to the top
                          }
                        }
                        // Ensure it doesn't go off-screen above when initially placing below
                        if (y < padding + window.scrollY) {
                          y = padding + window.scrollY;
                        }

                        setCanonizeButtonPosition({ x, y });
                        setSelectedTextForCanonize(selectedText);
                        setFullAiResponseForCanonize(msg.text);
                        setShowCanonizeButton(true);
                        return;
                      }
                    }
                    setShowCanonizeButton(false); // Hide if no valid selection or selection outside AI message
                  }}
                >
                  <div className={cn(
                    "max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed shadow-xl relative",
                    msg.role === 'user' ? "bg-neutral-800 text-white rounded-br-none" : "bg-neutral-900 text-neutral-300 rounded-bl-none border border-neutral-800"
                  )}>
                    {msg.role === 'ai' && (
                      <>
                        <div className="absolute -top-3 left-3 bg-dnd-red/20 text-dnd-red border border-dnd-red/30 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                          Lore Engine
                        </div>
                        <div className="whitespace-pre-wrap font-solway"><ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkHomebrewery]}>{preprocessHomebrewery(msg.text)}</ReactMarkdown></div>
                        <div className="flex gap-2 mt-3 items-start">
                          <button 
                            onClick={() => canonize(msg.text, msg.text)} // Pass full message for selection and response
                            disabled={isAiLoading}
                            className="text-white hover:text-white font-black flex items-center gap-2 text-[10px] uppercase tracking-widest px-3 py-1.5 bg-dnd-red/20 hover:bg-dnd-red border border-dnd-red/30 rounded-lg transition-all shadow-md group disabled:opacity-50"
                          >
                            <Wand2 size={14} className="group-hover:rotate-12 transition-transform" /> 
                            Canonize Output
                          </button>
                        </div>
                      </>
                    )}
                    {msg.role === 'user' && (
                      <div className="whitespace-pre-wrap font-solway">{msg.text}</div>
                    )}
                  </div>

                </div>
              ))}
              {isAiLoading && (
                <div className="flex flex-col items-start animate-pulse">
                  <div className="max-w-[80%] p-6 bg-neutral-900 rounded-2xl border border-neutral-800 rounded-bl-none">
                    <div className="flex items-center gap-2 mb-3 text-dnd-red">
                      <LoaderIcon className="animate-spin" size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Consulting Archives</span>
                    </div>
                    <div className="space-y-3">
                      <div className="h-2 bg-neutral-800 rounded w-48"></div>
                      <div className="h-2 bg-neutral-800 rounded w-32"></div>
                    </div>
                  </div>
                </div>
              )}
              {chat.length === 0 && (
                <div className="text-center py-20 px-8 border-2 border-dashed border-neutral-800 rounded-3xl opacity-40">
                  <Wand2 size={48} className="mx-auto mb-6 text-neutral-700" />
                  <p className="text-sm italic text-neutral-600 font-solway">The spirits are silent. Ask a question about your world to begin brainstorming.</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
              <div className="relative group">
                <textarea 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChat();
                    }
                  }}
                  placeholder="Ask the archives..."
                  rows={1}
                  className="w-full bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 pr-16 text-sm outline-none focus:border-dnd-red/50 focus:ring-1 focus:ring-dnd-red/20 transition-all shadow-inner text-neutral-200 placeholder:text-neutral-700 resize-none min-h-[56px] max-h-32 font-solway"
                />
                <button 
                  onClick={handleChat}
                  disabled={isAiLoading || !input.trim()}
                  className="absolute right-2 bottom-2 bg-dnd-red hover:bg-red-800 disabled:bg-neutral-800 disabled:text-neutral-600 text-white p-2.5 rounded-xl transition-all shadow-xl active:scale-95 group"
                >
                  <Send size={20} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              </div>
              <div className="flex justify-between items-center mt-3 px-1">
                <span className="text-[8px] text-neutral-600 font-black uppercase tracking-[0.2em]">Gemini AI Engine</span>
                <span className="text-[8px] text-neutral-700 font-mono italic">Context: {documents.length} docs + {sources.length} sources</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showCanonizeButton && selectedTextForCanonize && (
        <button
          className="fixed z-50 bg-dnd-red hover:bg-red-800 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-bold transition-all transform -translate-y-full whitespace-nowrap"
          style={{ left: canonizeButtonPosition.x, top: canonizeButtonPosition.y }}
          onClick={() => canonize(selectedTextForCanonize, fullAiResponseForCanonize)}
        >
          <Wand2 size={16} /> Canonize Selection
        </button>
      )}

      {showExportModal && (
        <DocumentExporter
          campaignId={campaign.id}
          documents={documents}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
