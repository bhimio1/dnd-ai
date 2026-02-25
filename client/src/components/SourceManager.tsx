import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Plus, ShieldCheck, AlertCircle, Loader2 as LoaderIcon, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Source {
  id: number;
  name: string;
  file_uri: string;
  mime_type?: string;
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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-neutral-800 rounded-[1.5rem] w-full max-w-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[85vh] overflow-hidden">

        <div className="p-5 border-b border-neutral-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-dnd-red/20 p-2 rounded-xl">
              <ShieldCheck className="text-dnd-red" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-cinzel font-black text-white leading-tight">Source Library</h2>
              <p className="text-neutral-500 font-solway text-xs italic">Managing the archives of your world</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white p-2 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

            <div className="flex gap-1.5 mb-6">
              <button
                onClick={() => setActiveTab('campaign')}
                className={cn(
                  "flex-1 py-2 rounded-lg border font-black uppercase text-[9px] transition-all",
                  activeTab === 'campaign' ? "bg-dnd-red border-dnd-red text-white" : "bg-neutral-950 border-neutral-800 text-neutral-600"
                )}
              >
                Campaign Sources
              </button>
              <button
                onClick={() => setActiveTab('global')}
                className={cn(
                  "flex-1 py-2 rounded-lg border font-black uppercase text-[9px] transition-all",
                  activeTab === 'global' ? "bg-dnd-red border-dnd-red text-white" : "bg-neutral-950 border-neutral-800 text-neutral-600"
                )}
              >
                Global Library
              </button>
            </div>

          <div className="mb-6 p-3 bg-dnd-red/5 border border-dnd-red/10 rounded-xl flex gap-3 items-start">
            <AlertCircle className="text-dnd-red shrink-0 mt-0.5" size={16} />
            <p className="text-[10px] text-neutral-400 font-solway leading-relaxed">
              Sources uploaded here are integrated into your AI's context via Gemini. Supports PDF, DOCX, Markdown, Text, and JSON.
            </p>
          </div>

          {activeTab === 'campaign' && (
            <div className="grid gap-2">
              {sources.map(s => (
                <div key={s.id} className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-center justify-between group hover:border-dnd-red/30 transition-all">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-neutral-900 p-2 rounded-lg shrink-0">
                      <FileText className="text-neutral-500" size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-neutral-200 text-xs truncate max-w-[250px]">{s.name}</h4>
                      <p className="text-[8px] text-neutral-600 font-mono uppercase tracking-widest mt-0.5">
                        {s.mime_type ? s.mime_type.split('/')[1].toUpperCase() : 'PDF'} • INTEGRATED
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteSource(s.id)}
                    className="text-neutral-600 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {sources.length === 0 && !isLoading && (
                <div className="text-center py-8 border-2 border-dashed border-neutral-800 rounded-xl">
                  <FileText className="mx-auto text-neutral-700 mb-2" size={32} />
                  <p className="text-neutral-500 italic font-solway text-xs">No campaign-specific sources yet.</p>
                </div>
              )}

              {isLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <LoaderIcon className="animate-spin text-dnd-red mb-2" size={24} />
                  <p className="text-neutral-500 text-xs italic">Consulting the archives...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'global' && (
            <div className="grid gap-2">
              {globalSources.map(s => (
                <div key={s.id} className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 flex items-center justify-between group hover:border-dnd-red/30 transition-all">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-neutral-900 p-2 rounded-lg shrink-0">
                      <FileText className="text-neutral-500" size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-neutral-200 text-xs truncate max-w-[250px]">{s.name}</h4>
                      <p className="text-[8px] text-neutral-600 font-mono uppercase tracking-widest mt-0.5">Global Archive</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {!sources.some(cs => cs.file_uri === s.file_uri) && ( // Check if already assigned
                      <button 
                        onClick={() => handleAssignGlobalSource(s.id, s.name)}
                        className="text-neutral-600 hover:text-green-500 p-1.5 rounded-lg hover:bg-green-500/10 transition-all"
                        title="Assign to Campaign"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteGlobalSource(s.id, s.name)}
                      className="text-neutral-600 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                      title="Delete from Global"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {globalSources.length === 0 && !isLoading && (
                <div className="text-center py-8 border-2 border-dashed border-neutral-800 rounded-xl">
                  <FileText className="mx-auto text-neutral-700 mb-2" size={32} />
                  <p className="text-neutral-500 italic font-solway text-xs">No global sources yet.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-900/50">
          <label className={cn(
            "w-full flex items-center justify-center gap-3 py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all transform active:scale-95 cursor-pointer",
            isUploading
              ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              : "bg-dnd-red hover:bg-red-800 text-white"
          )}>
            {isUploading ? (
              <>
                <LoaderIcon className="animate-spin" size={18} />
                <span>Scribing into Gemini...</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>Upload to {activeTab === 'campaign' ? 'Campaign' : 'Global Library'}</span>
              </>
            )}
            <input 
              type="file" 
              className="hidden" 
              accept=".pdf,.docx,.md,.txt,.json"
              onChange={(e) => handleUpload(e, activeTab === 'global')} 
              disabled={isUploading} 
            />
          </label>
        </div>
      </div>
    </div>
  );
}
