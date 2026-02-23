import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Settings, Map, Swords, ScrollText, Trash2 } from 'lucide-react';
import type { Campaign } from '../App';
import { DeleteCampaignModal } from './DeleteCampaignModal';

interface Props {
  onSelectCampaign: (campaign: Campaign) => void;
}

export function CampaignList({ onSelectCampaign }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newCampaign, setNewCampaign] = useState({ name: '', setting: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);
  const [currentEditCampaign, setCurrentEditCampaign] = useState<Campaign | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/campaigns')
      .then(r => r.json())
      .then(setCampaigns);
  }, []);

  const addCampaign = async () => {
    if (!newCampaign.name) return;
    const res = await fetch('http://localhost:3001/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCampaign),
    });
    const data = await res.json();
    const campaignId = data.id;

    // Automatically create an "Overview" document for the new campaign
    await fetch(`http://localhost:3001/api/campaigns/${campaignId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Overview', content: '# Campaign Overview\n\nWelcome to your new chronicle. Start by defining the world, the stakes, and the heroes.' }),
    });

    setCampaigns([...campaigns, { ...newCampaign, id: campaignId, sourceCount: 0 }]);
    setShowAdd(false);
    setNewCampaign({ name: '', setting: '' });
  };

  const handleEditCampaign = async () => {
    if (!currentEditCampaign) return;
    await fetch(`http://localhost:3001/api/campaigns/${currentEditCampaign.id}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: currentEditCampaign.name, setting: currentEditCampaign.setting }),
    });
    fetch('http://localhost:3001/api/campaigns') // Re-fetch all campaigns to update
      .then(r => r.json())
      .then(setCampaigns);
    setIsEditingCampaign(false);
    setCurrentEditCampaign(null);
  };

  const handleDeleteCampaignSuccess = () => {
    fetch('http://localhost:3001/api/campaigns') // Re-fetch all campaigns to update
      .then(r => r.json())
      .then(setCampaigns);
    setCampaignToDelete(null);
    setIsEditingCampaign(false);
    setCurrentEditCampaign(null);
  };

  const handleDeleteCampaignClick = (id: number, name: string) => {
    setCampaignToDelete({ id, name, setting: '', sourceCount: 0 });
  };

  return (
    <div className="flex-1 p-10 max-w-6xl mx-auto overflow-y-auto min-h-screen bg-neutral-900 text-neutral-200">
      <header className="flex flex-col md:flex-row justify-between items-center mb-12 border-b border-neutral-800 pb-8 gap-6">
        <div className="text-center md:text-left">
          <h1 className="text-6xl font-cinzel font-black text-dnd-red tracking-tighter shadow-sm mb-2">LoreWeaver</h1>
          <p className="text-neutral-500 font-solway italic text-lg">AI-Powered Campaign Management for Dungeon Masters</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-3 bg-dnd-red text-white px-8 py-4 rounded-lg hover:bg-red-800 transition-all font-bold shadow-lg transform hover:scale-105 active:scale-95"
        >
          <Plus size={24} /> Create New Campaign
        </button>
      </header>

      {showAdd && (
        <div className="bg-neutral-800 p-8 rounded-2xl mb-12 border-2 border-dnd-red/30 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-cinzel font-bold text-white flex items-center gap-2">
              <ScrollText className="text-dnd-red" /> Begin a New Chronicle
            </h2>
            <button onClick={() => setShowAdd(false)} className="text-neutral-500 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-neutral-400 mb-2 uppercase tracking-widest">Campaign Name</label>
              <input 
                placeholder="e.g., The Shadow of the Dragon Queen" 
                className="bg-neutral-900 p-4 rounded-xl border border-neutral-700 w-full focus:border-dnd-red focus:ring-1 focus:ring-dnd-red outline-none transition"
                value={newCampaign.name}
                onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-neutral-400 mb-2 uppercase tracking-widest">World / Setting</label>
              <input 
                placeholder="e.g., Dragonlance, Krynn" 
                className="bg-neutral-900 p-4 rounded-xl border border-neutral-700 w-full focus:border-dnd-red focus:ring-1 focus:ring-dnd-red outline-none transition"
                value={newCampaign.setting}
                onChange={e => setNewCampaign({...newCampaign, setting: e.target.value})}
              />
            </div>
          </div>
          <button 
            onClick={addCampaign}
            className="w-full mt-8 bg-green-700 text-white p-4 rounded-xl hover:bg-green-800 font-bold text-lg shadow-md transition-colors"
          >
            Scribe the First Page
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {campaigns.map(c => (
          <div 
            key={c.id} 
            className="group relative bg-neutral-800/50 rounded-2xl border border-neutral-700 hover:border-dnd-red transition-all duration-300 overflow-hidden shadow-xl hover:shadow-dnd-red/10"
          >
            {/* Context Menu */}
            <div className="absolute top-4 right-4 z-10">
              <div className="relative">
                <button 
                  onClick={(e) => { e.stopPropagation(); setCurrentEditCampaign(c); setIsEditingCampaign(true); }}
                  className="p-2 text-neutral-500 hover:text-white bg-neutral-900/50 rounded-full border border-neutral-700 hover:border-dnd-red transition"
                >
                  <Settings size={18} />
                </button>
              </div>
            </div>

            <div 
              onClick={() => onSelectCampaign(c)}
              className="group cursor-pointer p-8 relative z-0 flex flex-col h-full"
            >
              {/* Visual Flair */}
              <div className="absolute top-0 right-0 p-4 text-neutral-700 group-hover:text-dnd-red/40 transition-colors">
                <Map size={80} strokeWidth={1} />
              </div>

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="bg-neutral-900 p-3 rounded-xl border border-neutral-700 group-hover:border-dnd-red group-hover:bg-dnd-red transition-all">
                    <Swords size={28} className="text-neutral-400 group-hover:text-white" />
                  </div>
                </div>
                
                <h3 className="text-2xl font-cinzel font-black group-hover:text-white mb-2 leading-tight">{c.name}</h3>
                <p className="text-neutral-500 font-solway italic mb-6">{c.setting || 'Unnamed Realm'}</p>
                
                <div className="mt-auto flex justify-between items-center text-xs font-bold text-neutral-600 uppercase tracking-tighter">
                  <span>Lore Documents: 0</span> {/* Placeholder, should fetch actual document count */}
                  <span>Sources: {c.sourceCount}</span>
                  <span className="text-dnd-red group-hover:translate-x-1 transition-transform">Explore →</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {campaigns.length === 0 && !showAdd && (
          <div className="col-span-full text-center py-24 bg-neutral-800/30 rounded-3xl border-2 border-dashed border-neutral-700">
            <ScrollText size={64} className="mx-auto text-neutral-700 mb-6" />
            <h3 className="text-2xl font-cinzel text-neutral-500 mb-2">No Chronicles Found</h3>
            <p className="font-solway text-neutral-600">The library is empty. Click "New Campaign" to begin.</p>
          </div>
        )}
      </div>

      {isEditingCampaign && currentEditCampaign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col">
            <header className="p-8 border-b border-neutral-800 flex justify-between items-center">
              <h2 className="text-2xl font-cinzel font-black text-white flex items-center gap-3">
                <Settings className="text-dnd-red" size={24} /> Edit Campaign
              </h2>
              <button onClick={() => setIsEditingCampaign(false)} className="text-neutral-500 hover:text-white text-xl">✕</button>
            </header>
            <div className="p-8 grid gap-6">
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2 uppercase tracking-widest">Campaign Name</label>
                <input 
                  value={currentEditCampaign.name}
                  onChange={e => setCurrentEditCampaign({...currentEditCampaign, name: e.target.value})}
                  className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 w-full focus:border-dnd-red focus:ring-1 focus:ring-dnd-red outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2 uppercase tracking-widest">World / Setting</label>
                <input 
                  value={currentEditCampaign.setting}
                  onChange={e => setCurrentEditCampaign({...currentEditCampaign, setting: e.target.value})}
                  className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 w-full focus:border-dnd-red focus:ring-1 focus:ring-dnd-red outline-none transition"
                />
              </div>
            </div>
            <footer className="p-8 border-t border-neutral-800 bg-neutral-900/50 flex justify-end gap-4">
              <button 
                onClick={() => handleDeleteCampaignClick(currentEditCampaign.id, currentEditCampaign.name)}
                className="bg-red-700 text-white px-6 py-3 rounded-xl hover:bg-red-800 font-bold shadow-md transition-colors flex items-center gap-2"
              >
                <Trash2 size={20} /> Delete Campaign
              </button>
              <button 
                onClick={handleEditCampaign}
                className="bg-dnd-red text-white px-6 py-3 rounded-xl hover:bg-red-800 font-bold shadow-md transition-colors"
              >
                Save Changes
              </button>
            </footer>
          </div>
        </div>
      )}

      {campaignToDelete && (
        <DeleteCampaignModal 
          campaignId={campaignToDelete.id}
          campaignName={campaignToDelete.name}
          onClose={() => setCampaignToDelete(null)}
          onSuccess={handleDeleteCampaignSuccess}
        />
      )}
    </div>
  );
}
