import React, { useState, useEffect } from 'react';
import { LoreEditor } from './components/LoreEditor';
import { CampaignList } from './components/CampaignList';

export interface Campaign {
  id: number;
  name: string;
  setting: string;
  sourceCount: number;
}

function App() {
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  return (
    <div className="flex h-screen w-screen bg-neutral-900 overflow-hidden text-neutral-200 antialiased selection:bg-dnd-red/30 selection:text-white">
      {!activeCampaign ? (
        <CampaignList onSelectCampaign={setActiveCampaign} />
      ) : (
        <LoreEditor 
          campaign={activeCampaign} 
          onBack={() => setActiveCampaign(null)} 
        />
      )}
    </div>
  );
}

export default App;
