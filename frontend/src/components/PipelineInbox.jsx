import React, { useState } from 'react';
import { Plus, Zap, ExternalLink, Inbox } from 'lucide-react';

export default function PipelineInbox({ items, onSendToEvaluator, onRefresh }) {
  const [newInput, setNewInput] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newInput.trim()) return;

    setAdding(true);
    try {
      const res = await fetch('/api/pipeline/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_data: newInput.trim() }),
      });
      if (res.ok) {
        setNewInput('');
        onRefresh?.();
      }
    } catch (err) {
      console.error('Error adding to pipeline', err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Inbox className="w-4 h-4 text-rose-400" />
            <span>Pipeline Inbox Queue</span>
          </h2>
          <p className="text-xs text-slate-400">
            Pending job postings and ATS discovery items waiting for evaluation
          </p>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={newInput}
            onChange={(e) => setNewInput(e.target.value)}
            placeholder="Paste job URL or listing..."
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
          />
          <button
            type="submit"
            disabled={adding}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            Inbox is empty. Paste a job link above or run the ATS portal scanner.
          </div>
        ) : (
          items.map((item, idx) => {
            const urlMatch = item.match(/https?:\/\/[^\s|]+/);
            const url = urlMatch ? urlMatch[0] : '';

            return (
              <div
                key={idx}
                className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start gap-2.5 overflow-hidden">
                  <span className="text-xs font-mono text-slate-500 shrink-0 mt-0.5">#{idx + 1}</span>
                  <div className="text-xs text-slate-200 break-all">{item}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => onSendToEvaluator(url || item)}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3 text-indigo-400" />
                    <span>Evaluate</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
