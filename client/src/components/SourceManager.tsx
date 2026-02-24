import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Plus, ShieldCheck, AlertCircle, Loader2 as LoaderIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Source {
  id: number;
  name: string;
  file_uri: string;
}

interface Props {
  campaignId: number;
  onClose: () => void;
  onUpdate?: () => void;
}

export function SourceManager({ campaignId, onClose, onUpdate }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [globalSources, setGlobalSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaign' | 'global'>('campaign');

  const fetchSources = async () => {
    setIsLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/sources`);
    const data = await res.json();
    setSources(data);
    setIsLoading(false);
  };

  const fetchGlobalSources = async () => {
    const res = await fetch(`/api/global-sources`);
    const data = await res.json();
    setGlobalSources(data);
  };

  useEffect(() => {
    fetchSources();
    fetchGlobalSources(); // Fetch global sources as well
  }, [campaignId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, uploadToGlobal: boolean) => {
    if (!e.target.files?.[0]) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('pdf', e.target.files[0]);
    
    try {
      const endpoint = uploadToGlobal ? '/api/global-sources/upload' : `/api/campaigns/${campaignId}/upload`;
      await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      if (uploadToGlobal) {
        fetchGlobalSources();
      } else {
        fetchSources();
        onUpdate?.(); // Notify parent of campaign source update
      }
    } catch (err) {
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSource = async (id: number) => {
    if (!confirm('Are you sure you want to remove this source from your campaign context?')) return;
    await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    fetchSources();
    onUpdate?.();
  };

  const handleDeleteGlobalSource = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}" from the global library? This will also unassign it from any campaigns.`)) return;
    await fetch(`/api/global-sources/${id}`, { method: 'DELETE' });
    fetchGlobalSources();
    fetchSources(); // Re-fetch campaign sources in case any were linked
    onUpdate?.(); // Notify parent of potential campaign source update
  };

  const handleAssignGlobalSource = async (globalSourceId: number, name: string) => {
    if (!confirm(`Assign "${name}" to this campaign?`)) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/assign-source/${globalSourceId}`, { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to assign source');
      }
      fetchSources();
      onUpdate?.(); // Notify parent
      alert(`"${name}" assigned to campaign.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <header className="p-8 border-b border-neutral-800 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-cinzel font-black text-white flex items-center gap-3">
              <ShieldCheck className="text-dnd-red" size={28} /> Source Library
            </h2>
            <p className="text-neutral-500 font-solway italic mt-1 text-sm">Managing the archives of your world</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </header>

        <div className="flex bg-neutral-800 border-b border-neutral-700">
          <button 
            onClick={() => setActiveTab('campaign')}
            className={cn(
              "flex-1 p-4 text-center font-bold transition-all",
              activeTab === 'campaign' ? "text-dnd-red border-b-2 border-dnd-red" : "text-neutral-500 hover:text-white"
            )}
          >
            Campaign Sources
          </button>
          <button 
            onClick={() => setActiveTab('global')}
            className={cn(
              "flex-1 p-4 text-center font-bold transition-all",
              activeTab === 'global' ? "text-dnd-red border-b-2 border-dnd-red" : "text-neutral-500 hover:text-white"
            )}
          >
            Global Library
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="mb-8 p-4 bg-dnd-red/10 border border-dnd-red/20 rounded-2xl flex gap-4 items-start">
            <AlertCircle className="text-dnd-red shrink-0 mt-1" size={20} />
            <p className="text-xs text-neutral-400 font-solway leading-relaxed">
              Sources uploaded here are processed and integrated into your AI's context. Large documents (like core rulebooks) are efficiently handled via the Gemini File API to maintain lore consistency without high token costs.
            </p>
          </div>

          {activeTab === 'campaign' && (
            <div className="grid gap-4">
              {sources.map(s => (
                <div key={s.id} className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="bg-neutral-900 p-2 rounded-lg">
                      <FileText className="text-neutral-500" size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-200 text-sm truncate max-w-[300px]">{s.name}</h4>
                      <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-widest mt-0.5">Gemini File Integrated</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteSource(s.id)}
                    className="text-neutral-600 hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}

              {sources.length === 0 && !isLoading && (
                <div className="text-center py-12 border-2 border-dashed border-neutral-800 rounded-3xl">
                  <FileText className="mx-auto text-neutral-700 mb-4" size={48} />
                  <p className="text-neutral-500 italic font-solway">No campaign-specific sources yet.</p>
                </div>
              )}

              {isLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <LoaderIcon className="animate-spin text-dnd-red mb-4" size={32} />
                  <p className="text-neutral-500 italic">Consulting the archives...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'global' && (
            <div className="grid gap-4">
              {globalSources.map(s => (
                <div key={s.id} className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="bg-neutral-900 p-2 rounded-lg">
                      <FileText className="text-neutral-500" size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-200 text-sm truncate max-w-[300px]">{s.name}</h4>
                      <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-widest mt-0.5">Global Gemini File</p>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    {!sources.some(cs => cs.file_uri === s.file_uri) && ( // Check if already assigned
                      <button 
                        onClick={() => handleAssignGlobalSource(s.id, s.name)}
                        className="text-neutral-600 hover:text-green-500 p-2 rounded-lg hover:bg-green-500/10 transition-all"
                      >
                        <Plus size={20} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteGlobalSource(s.id, s.name)}
                      className="text-neutral-600 hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}

              {globalSources.length === 0 && !isLoading && (
                <div className="text-center py-12 border-2 border-dashed border-neutral-800 rounded-3xl">
                  <FileText className="mx-auto text-neutral-700 mb-4" size={48} />
                  <p className="text-neutral-500 italic font-solway">No global sources yet.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="p-8 border-t border-neutral-800 bg-neutral-900/50">
          <label className={cn(
            "w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer font-bold",
            isUploading ? "bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed" : "bg-dnd-red/10 border-dnd-red/30 text-dnd-red hover:bg-dnd-red/20 hover:border-dnd-red/50"
          )}>
            {isUploading ? (
              <>
                <LoaderIcon className="animate-spin" size={24} />
                <span>Scribing into Gemini...</span>
              </>
            ) : (
              <>
                <Plus size={24} />
                <span>Upload to {activeTab === 'campaign' ? 'Campaign' : 'Global Library'}</span>
              </>
            )}
            <input 
              type="file" 
              className="hidden" 
              accept=".pdf" 
              onChange={(e) => handleUpload(e, activeTab === 'global')} 
              disabled={isUploading} 
            />
          </label>
        </footer>
      </div>
    </div>
  );
}
