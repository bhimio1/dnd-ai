import { useState, useEffect } from 'react';
import { Download, X, Loader2 as LoaderIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { marked } from 'marked';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Document {
  id: number;
  title: string;
  content: string;
  version: number;
}

interface Props {
  campaignId: number;
  documents: Document[];
  onClose: () => void;
}

export function DocumentExporter({ documents: allCampaignDocuments, onClose }: Props) {
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const [exportTitles, setExportTitles] = useState<Record<number, string>>({});
  const [exportFormat, setExportFormat] = useState<'pdf' | 'md' | 'html' | 'docx'>('pdf');
  const [filename, setFilename] = useState('LoreWeaver_Chronicle');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const titles: Record<number, string> = {};
    allCampaignDocuments.forEach(doc => {
      titles[doc.id] = doc.title;
    });
    setExportTitles(titles);
  }, [allCampaignDocuments]);

  const handleCheckboxChange = (docId: number) => {
    setSelectedDocumentIds(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const handleTitleChange = (docId: number, newTitle: string) => {
    setExportTitles(prev => ({ ...prev, [docId]: newTitle }));
  };

  const handleDownloadExport = async () => {
    if (selectedDocumentIds.length === 0) {
      alert('Please select at least one document to export.');
      return;
    }

    setIsGenerating(true);
    let markdownToExport = '';

    for (const docId of selectedDocumentIds) {
      const res = await fetch(`/api/documents/${docId}`);
      const fullDoc = await res.json();
      const customTitle = exportTitles[docId] || fullDoc.title;
      markdownToExport += `# ${customTitle}\n\n${fullDoc.content}\n\n---\n\n`;
    }

    if (exportFormat === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const htmlContent = marked.parse(markdownToExport);
        const htmlDoc = `
          <html>
            <head>
              <title>${filename}</title>
              <link rel="preconnect" href="https://fonts.googleapis.com">
              <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
              <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Solway:wght@300;400;700&display=swap" rel="stylesheet">
              <style>
                @page { 
                  size: A4; 
                  margin: 0;
                }
                body { 
                  margin: 0;
                  padding: 0;
                  background-color: #f4e7d3;
                  background-image: url('https://www.transparenttextures.com/patterns/parchment.png');
                  background-repeat: repeat;
                  -webkit-print-color-adjust: exact;
                  color-adjust: exact;
                }
                .page {
                  padding: 1in;
                  font-family: 'Solway', serif;
                  color: #1e1e1e;
                  line-height: 1.6;
                  min-height: 100vh;
                }
                h1 { 
                  font-family: 'Cinzel', serif; 
                  font-size: 3.5rem;
                  font-weight: 900;
                  margin-bottom: 1.5rem;
                  padding-bottom: 0.5rem;
                  border-bottom: 4px solid #8e1111;
                  text-transform: uppercase;
                  color: #1e1e1e;
                  page-break-after: avoid;
                }
                h2 { 
                  font-family: 'Cinzel', serif; 
                  font-size: 2rem;
                  font-weight: 700;
                  margin-top: 2rem;
                  margin-bottom: 1rem;
                  border-bottom: 2px solid rgba(142, 17, 17, 0.4);
                  color: #1e1e1e;
                  page-break-after: avoid;
                }
                h3 {
                  font-family: 'Cinzel', serif;
                  font-size: 1.5rem;
                  font-weight: 700;
                  margin-top: 1.5rem;
                  margin-bottom: 0.75rem;
                  color: #8e1111;
                }
                blockquote { 
                  background-color: rgba(224, 229, 193, 0.4);
                  border-left: 10px solid #8e1111;
                  padding: 1.5rem;
                  margin: 1.5rem 0;
                  font-style: italic;
                  box-shadow: inset 0 0 10px rgba(0,0,0,0.05);
                  page-break-inside: avoid;
                }
                p {
                  margin-bottom: 1rem;
                }
                table {
                  width: 100%;
                  margin: 1.5rem 0;
                  border-collapse: collapse;
                  page-break-inside: avoid;
                }
                th {
                  background-color: #8e1111;
                  color: white;
                  padding: 0.75rem;
                  text-align: left;
                  font-family: 'Cinzel', serif;
                  text-transform: uppercase;
                }
                td {
                  padding: 0.75rem;
                  border-bottom: 1px solid rgba(142, 17, 17, 0.1);
                }
                hr { 
                  border: 0; 
                  border-top: 1px solid rgba(0,0,0,0.1);
                  margin: 3em 0; 
                  page-break-after: always;
                }
                pre, code {
                  background: rgba(0,0,0,0.05);
                  padding: 0.2em 0.4em;
                  border-radius: 3px;
                  font-family: monospace;
                }
              </style>
            </head>
            <body>
              <div class="page">${htmlContent}</div>
            </body>
          </html>
        `;
        printWindow.document.write(htmlDoc);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 750);
      }
    } else if (exportFormat === 'md') {
      const blob = new Blob([markdownToExport], { type: 'text/markdown' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.md`;
      link.click();
    } else if (exportFormat === 'html') {
        const blob = new Blob([markdownToExport], { type: 'text/html' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.html`;
        link.click();
    } else if (exportFormat === 'docx') {
      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: markdownToExport, filename }),
      });
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.docx`;
      link.click();
    }

    setIsGenerating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-neutral-800 rounded-[1.5rem] w-full max-w-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[85vh] overflow-hidden">
        
        <div className="p-5 border-b border-neutral-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-dnd-red/20 p-2 rounded-xl">
              <Download className="text-dnd-red" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-cinzel font-black text-white leading-tight">Document Exporter</h2>
              <p className="text-neutral-500 font-solway text-xs italic">Compile your chronicles</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white p-2 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em]">Final Filename</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm text-white focus:border-dnd-red outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em]">Output Format</label>
                <div className="flex gap-1.5">
                  {(['pdf', 'docx', 'md', 'html'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setExportFormat(f)}
                      className={cn(
                        "flex-1 py-2 rounded-lg border font-black uppercase text-[9px] transition-all",
                        exportFormat === f ? "bg-dnd-red border-dnd-red text-white" : "bg-neutral-950 border-neutral-800 text-neutral-600"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em]">Select & Name Chronicles</label>
              <div className="grid gap-2">
                {allCampaignDocuments.map(doc => (
                  <div key={doc.id} className={cn(
                    "p-3 rounded-xl border transition-all flex gap-3 items-center",
                    selectedDocumentIds.includes(doc.id) ? "bg-neutral-800/50 border-dnd-red/40" : "bg-neutral-950 border-neutral-800"
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.includes(doc.id)}
                      onChange={() => handleCheckboxChange(doc.id)}
                      className="w-5 h-5 rounded text-dnd-red"
                    />
                    <div className="flex-1 min-w-0">
                      <input 
                        type="text"
                        disabled={!selectedDocumentIds.includes(doc.id)}
                        value={exportTitles[doc.id] || ''}
                        onChange={(e) => handleTitleChange(doc.id, e.target.value)}
                        className="w-full bg-transparent border-b border-neutral-800 text-xs text-neutral-200 py-0.5 outline-none focus:border-dnd-red"
                      />
                      <p className="text-[8px] text-neutral-600 font-mono mt-0.5 uppercase truncate">Doc: {doc.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 pb-10">
              <button 
                onClick={handleDownloadExport}
                disabled={selectedDocumentIds.length === 0 || isGenerating}
                className="w-full bg-dnd-red hover:bg-red-800 text-white py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all transform active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3"
              >
                {isGenerating ? (
                  <>
                    <LoaderIcon className="animate-spin" size={18} />
                    <span>Scribing...</span>
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    <span>Download {exportFormat.toUpperCase()}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
