import { useState, useEffect } from 'react';
import { History, FileText, Loader2 as LoaderIcon, ScrollText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface HistoryEntry {
  id: number;
  version: number;
  created_at: string;
}

interface Props {
  documentId: number;
  onClose: () => void;
  onRestore: (historyId: number) => void;
}

export function DocumentHistory({ documentId, onClose, onRestore }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchHistory = async () => {
    setIsLoading(true);
    const res = await fetch(`http://localhost:3001/api/documents/${documentId}/history`);
    const data = await res.json();
    setHistory(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [documentId]);

  const fetchPreview = async (historyId: number) => {
    setLoadingPreview(true);
    setPreviewContent(null);
    const res = await fetch(`http://localhost:3001/api/document_history/${historyId}`);
    const data = await res.json();
    setPreviewContent(data.content);
    setLoadingPreview(false);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <header className="p-8 border-b border-neutral-800 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-cinzel font-black text-white flex items-center gap-3">
              <History className="text-dnd-red" size={28} /> Document History
            </h2>
            <p className="text-neutral-500 font-solway italic mt-1 text-sm">Reviewing the chronicle of changes</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* History List */}
          <div className="w-1/3 border-r border-neutral-800 p-6 overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <LoaderIcon className="animate-spin text-dnd-red mb-4" size={32} />
                <p className="text-neutral-500 italic">Fetching history...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map(entry => (
                  <div 
                    key={entry.id} 
                    className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700 hover:border-dnd-red/50 transition-all flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-neutral-200">Version {entry.version}</span>
                      <button 
                        onClick={() => fetchPreview(entry.id)}
                        className="bg-neutral-700 hover:bg-neutral-600 text-white text-xs px-3 py-1 rounded-lg flex items-center gap-1 transition"
                      >
                        <FileText size={14} /> View
                      </button>
                    </div>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest">{formatTimestamp(entry.created_at)}</p>
                    <button 
                      onClick={() => onRestore(entry.id)} 
                      className="bg-dnd-red/10 hover:bg-dnd-red/20 text-dnd-red text-xs px-3 py-1 rounded-lg flex items-center gap-1 transition mt-2"
                    >
                      <History size={14} /> Restore
                    </button>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-neutral-800 rounded-3xl">
                    <History className="mx-auto text-neutral-700 mb-4" size={48} />
                    <p className="text-neutral-500 italic font-solway">No history found for this document.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-neutral-950">
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center h-full">
                <LoaderIcon className="animate-spin text-dnd-red mb-4" size={32} />
                <p className="text-neutral-500 italic">Loading preview...</p>
              </div>
            ) : previewContent ? (
              <div className="homebrewery-preview homebrewery-preview-small">
                <ReactMarkdown>{previewContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-600 italic">
                <ScrollText size={48} className="mb-4" />
                <p>Select a version to preview its content.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
