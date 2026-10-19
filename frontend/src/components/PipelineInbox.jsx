import React, { useState } from 'react';
import {
  Plus,
  Zap,
  ExternalLink,
  Inbox,
  Sparkles,
  Trash2,
  ShieldCheck,
  Compass,
  Loader2,
  RotateCcw,
  Activity,
  Building2,
  CheckCircle2,
} from 'lucide-react';

export default function PipelineInbox({ items, onSendToEvaluator, onRefresh }) {
  const [newInput, setNewInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [nlQuery, setNlQuery] = useState('');
  const [sectorQuery, setSectorQuery] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [purging, setPurging] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

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

  const handlePurgeForeign = async () => {
    setPurging(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/settings/purge-foreign', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`🧹 ${data.message}`);
        onRefresh?.();
      } else {
        setActionMessage('❌ Failed to purge items.');
      }
    } catch (err) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setPurging(false);
      setTimeout(() => setActionMessage(''), 5000);
    }
  };

  const handleVerifyInboxLiveness = async () => {
    setVerifying(true);
    setActionMessage('🩺 Running zero-browser API liveness sweep across inbox URLs...');
    try {
      const res = await fetch('/api/settings/verify-inbox-liveness', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`🩺 ${data.message}`);
        onRefresh?.();
      } else {
        setActionMessage('❌ Liveness sweep failed.');
      }
    } catch (err) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setVerifying(false);
      setTimeout(() => setActionMessage(''), 6000);
    }
  };

  const handleResetPipeline = async () => {
    if (!window.confirm('Are you sure you want to reset the pipeline inbox? This will clear all pending items.')) {
      return;
    }
    setResetting(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/settings/reset-pipeline', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`🔄 ${data.message}`);
        onRefresh?.();
      } else {
        setActionMessage('❌ Failed to reset pipeline.');
      }
    } catch (err) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setResetting(false);
      setTimeout(() => setActionMessage(''), 5000);
    }
  };

  const handleDiscover = async (useCV = true) => {
    setDiscovering(true);
    setActionMessage('Scanning registered UK portals tailored to your target roles...');
    try {
      const res = await fetch('/api/settings/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          natural_language_query: nlQuery || null,
          use_cv: useCV,
          uk_only: true,
          verify: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`✅ Scan complete! Added fresh UK postings to inbox.`);
        onRefresh?.();
      } else {
        setActionMessage('❌ Discovery failed.');
      }
    } catch (err) {
      setActionMessage(`❌ Discovery error: ${err.message}`);
    } finally {
      setDiscovering(false);
      setTimeout(() => setActionMessage(''), 6000);
    }
  };

  const handleExpandCompanies = async () => {
    if (!sectorQuery.trim()) return;
    setExpanding(true);
    setActionMessage(`🏢 Resolving UK employer ATS feeds for "${sectorQuery.trim()}"...`);
    try {
      const res = await fetch('/api/settings/expand-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_or_sector: sectorQuery.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`✨ ${data.message}`);
        setSectorQuery('');
        onRefresh?.();
      } else {
        setActionMessage('❌ Failed to expand companies.');
      }
    } catch (err) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setExpanding(false);
      setTimeout(() => setActionMessage(''), 7000);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-semibold text-white">Pipeline Inbox Queue</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>UK / London Only ({items.length})</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Official employer ATS feeds filtered strictly to London & UK locations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Reset button */}
          <button
            onClick={handleResetPipeline}
            disabled={resetting || items.length === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-40"
            title="Empty the pipeline queue to start completely clean"
          >
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 text-slate-400" />}
            <span>Reset Inbox</span>
          </button>

          {/* Purge non-UK button */}
          <button
            onClick={handlePurgeForeign}
            disabled={purging}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Clean all non-UK and foreign postings from inbox"
          >
            {purging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            <span>Purge Non-UK</span>
          </button>

          {/* Verify Liveness API button */}
          <button
            onClick={handleVerifyInboxLiveness}
            disabled={verifying || items.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-40"
            title="Run fast zero-browser API check to discard expired/404 postings"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-emerald-400" />}
            <span>🩺 Verify Active (API Check)</span>
          </button>

          {/* Discover Jobs button */}
          <button
            onClick={() => handleDiscover(true)}
            disabled={discovering}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
            <span>✨ Discover Jobs (UK Scan)</span>
          </button>
        </div>
      </div>

      {/* Discovery Toolbars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 1. Expand UK Companies & Portals with AI */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Expand UK Companies & Portals</span>
          </label>
          <p className="text-[11px] text-slate-400">
            Probes employer ATS feeds (Greenhouse/Ashby/Lever) and adds live London roles
          </p>
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={sectorQuery}
              onChange={(e) => setSectorQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExpandCompanies()}
              placeholder="e.g. Clean energy, engineering, or companies like Octopus Energy, Dyson..."
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full"
            />
            <button
              onClick={handleExpandCompanies}
              disabled={expanding || !sectorQuery.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 disabled:opacity-40 transition-colors"
            >
              {expanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
              <span>Expand</span>
            </button>
          </div>
        </div>

        {/* 2. Natural Language Query */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Natural Language Search</span>
          </label>
          <p className="text-[11px] text-slate-400">
            Prompt AI to find roles (e.g. 50 junior/mid backend roles with Python, Go, Java)
          </p>
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDiscover(false)}
              placeholder="e.g. 50 open backend software engineering roles in Python, Go, Java..."
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full"
            />
            <button
              onClick={() => handleDiscover(false)}
              disabled={discovering || !nlQuery.trim()}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 disabled:opacity-40 transition-colors shadow-sm"
            >
              {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
              <span>Discover</span>
            </button>
          </div>
        </div>

        {/* 3. Add Single Link */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
          <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Add Single Posting / URL</span>
          </label>
          <p className="text-[11px] text-slate-400">
            Paste an employer posting link directly into your queue
          </p>
          <form onSubmit={handleAdd} className="flex gap-2 pt-1">
            <input
              type="text"
              value={newInput}
              onChange={(e) => setNewInput(e.target.value)}
              placeholder="Paste job URL or listing snippet..."
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full"
            />
            <button
              type="submit"
              disabled={adding || !newInput.trim()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>
        </div>
      </div>

      {actionMessage && (
        <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 font-mono flex items-center gap-2">
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Postings List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs space-y-2">
            <div>Inbox is empty. Click <strong>"✨ Discover Jobs (UK Scan)"</strong> or type a sector in <strong>"Expand UK Companies"</strong> above.</div>
            <div className="text-[11px] text-slate-600">All foreign, non-UK, and Chinese postings are blocked automatically.</div>
          </div>
        ) : (
          items.map((item, idx) => {
            const urlMatch = item.match(/https?:\/\/[^\s|]+/);
            const url = urlMatch ? urlMatch[0] : '';

            // Extract display title & company if pipe delimited
            const parts = item.split('|').map((p) => p.trim());
            const displayTitle = parts.length > 2 ? `${parts[1]} — ${parts[2]}` : item;
            const locationPart = parts.length > 3 ? parts[3] : '';

            return (
              <div
                key={idx}
                className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start gap-2.5 overflow-hidden">
                  <span className="text-xs font-mono text-slate-500 shrink-0 mt-0.5">#{idx + 1}</span>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-200 break-words">{displayTitle}</div>
                    {locationPart && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>{locationPart}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Open job posting"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => onSendToEvaluator(url || item)}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1 transition-all"
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
