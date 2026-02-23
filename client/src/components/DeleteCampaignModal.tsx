import { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 as LoaderIcon } from 'lucide-react';

interface Props {
  campaignId: number;
  campaignName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteCampaignModal({ campaignId, campaignName, onClose, onSuccess }: Props) {
  const [confirmationName, setConfirmationName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmationName !== campaignName) return;

    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:3001/api/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (res.ok) {
        onSuccess();
      } else {
        setError(data.error || 'Failed to delete campaign');
      }
    } catch (err) {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-red-900/30 rounded-[2rem] w-full max-w-md shadow-[0_0_50px_rgba(142,17,17,0.2)] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-red-900/5">
          <div className="flex items-center gap-3">
            <div className="bg-red-900/20 p-2 rounded-xl text-red-500">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-cinzel font-black text-white leading-tight uppercase tracking-tighter">Danger Zone</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white p-2 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-neutral-300 font-solway">
              This will permanently delete the campaign <span className="font-bold text-white">"{campaignName}"</span>, all its lore documents, version history, and associated source files.
            </p>
            <p className="text-xs text-red-500 font-bold uppercase tracking-widest">This action is irreversible.</p>
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em]">
              Type the name of the campaign to confirm
            </label>
            <input
              type="text"
              value={confirmationName}
              onChange={(e) => setConfirmationName(e.target.value)}
              placeholder={campaignName}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-sm text-white focus:border-red-900 outline-none transition-all"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/30 rounded-lg text-xs text-red-400 font-solway italic text-center">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-800 bg-neutral-950/50 flex flex-col gap-3">
          <button 
            onClick={handleDelete}
            disabled={confirmationName !== campaignName || isDeleting}
            className="w-full bg-red-700 hover:bg-red-600 text-white py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all transform active:scale-95 disabled:opacity-10 disabled:grayscale flex items-center justify-center gap-3"
          >
            {isDeleting ? (
              <>
                <LoaderIcon className="animate-spin" size={18} />
                <span>Burning the Scrolls...</span>
              </>
            ) : (
              <>
                <Trash2 size={18} />
                <span>Delete This Chronicle</span>
              </>
            )}
          </button>
          <button 
            onClick={onClose}
            className="w-full text-neutral-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Cancel and Return
          </button>
        </div>
      </div>
    </div>
  );
}
