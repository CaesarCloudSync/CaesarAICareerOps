import React, { useState, useEffect } from 'react';
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
  Clock,
  AlertCircle,
} from 'lucide-react';

const STEP_SUBSTEPS = {
  1: [
    { id: '1.1', title: '1.1 Prompt Intent Extraction' },
    { id: '1.2', title: '1.2 ATS Keywords & Exclusions' },
    { id: '1.3', title: '1.3 Tech Stack & Employer Mapping' },
  ],
  2: [
    { id: '2.1', title: '2.1 UK Geofence Filter Injection' },
    { id: '2.2', title: '2.2 Pre-Flight Atomic Rollback' },
    { id: '2.3', title: '2.3 Probing 50+ Live ATS Feeds' },
  ],
  3: [
    { id: '3.1', title: '3.1 Multi-Board Parallel Crawl' },
    { id: '3.2', title: '3.2 UK Location Verification' },
    { id: '3.3', title: '3.3 Write-Ahead Staging Queue' },
  ],
  4: [
    { id: '4.1', title: '4.1 Concurrent Liveness Sweep' },
    { id: '4.2', title: '4.2 CV Fundamentals Match Scoring' },
    { id: '4.3', title: '4.3 Diversity Cap & Queue Sync' },
  ],
};

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
  const [activeJob, setActiveJob] = useState(null);
  const [activeJobId, setActiveJobId] = useState(() => {
    try {
      return localStorage.getItem('active_discovery_job_id') || null;
    } catch {
      return null;
    }
  });

  const [latestDiscovered, setLatestDiscovered] = useState({
    roles: [],
    count: 0,
    query: '',
    mode: '',
    timestamp: null,
  });
  const [refreshingDiscovered, setRefreshingDiscovered] = useState(false);

  const fetchLatestDiscovered = async () => {
    setRefreshingDiscovered(true);
    try {
      const res = await fetch('/api/pipeline/latest-discovered');
      if (res.ok) {
        const data = await res.json();
        setLatestDiscovered(data);
      }
    } catch (err) {
      console.error('Failed to fetch latest discovered roles', err);
    } finally {
      setRefreshingDiscovered(false);
    }
  };

  useEffect(() => {
    fetchLatestDiscovered();
  }, []);

  // 1. Mount Check: Check server for any running discovery job (survives page refresh!)
  useEffect(() => {
    let isMounted = true;
    const checkActiveJob = async () => {
      try {
        const res = await fetch('/api/settings/discover/active');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.job && isMounted) {
            setActiveJob(data.job);
            setActiveJobId(data.job.job_id);
            try {
              localStorage.setItem('active_discovery_job_id', data.job.job_id);
            } catch {}
            if (data.job.status === 'running') {
              setDiscovering(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to check active discovery job:', err);
      }
    };
    checkActiveJob();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Real Status Polling: Polls live step, detail & elapsed time every 1000ms
  useEffect(() => {
    if (!activeJobId || !discovering) return;

    let timer = null;
    let isCancelled = false;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/settings/discover/status/${activeJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setDiscovering(false);
            try {
              localStorage.removeItem('active_discovery_job_id');
            } catch {}
          }
          return;
        }
        const data = await res.json();
        const job = data.job;
        if (!isCancelled && job) {
          setActiveJob(job);
          if (job.status === 'completed') {
            setDiscovering(false);
            try {
              localStorage.removeItem('active_discovery_job_id');
            } catch {}
            setActionMessage(`✨ ${job.detail || 'Discovery completed successfully!'}`);
            onRefresh?.();
            fetchLatestDiscovered();
            setTimeout(() => {
              setActiveJob(null);
            }, 8000);
          } else if (job.status === 'failed') {
            setDiscovering(false);
            try {
              localStorage.removeItem('active_discovery_job_id');
            } catch {}
            setActionMessage(`❌ ${job.error || job.detail || 'Discovery failed.'}`);
          }
        }
      } catch (err) {
        console.error('Error polling discovery status:', err);
      }
    };

    pollStatus();
    timer = setInterval(pollStatus, 1000);

    return () => {
      isCancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [activeJobId, discovering, onRefresh]);

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
    setActionMessage('');
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
      if (res.ok && data.job_id) {
        setActiveJobId(data.job_id);
        try {
          localStorage.setItem('active_discovery_job_id', data.job_id);
        } catch {}
        if (data.job) {
          setActiveJob(data.job);
        }
      } else {
        setDiscovering(false);
        setActionMessage(`❌ ${data.message || 'Failed to start discovery'}`);
      }
    } catch (err) {
      setDiscovering(false);
      setActionMessage(`❌ Discovery error: ${err.message}`);
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

      {/* Real-time Discovery Progress Card */}
      {activeJob && (
        <div className={`p-4 rounded-xl border transition-all ${
          activeJob.status === 'failed'
            ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
            : activeJob.status === 'completed'
            ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
            : 'bg-indigo-950/40 border-indigo-700/60 text-indigo-100 shadow-lg shadow-indigo-950/50'
        }`}>
          {/* Header row: Step pill, Title, and Elapsed Stopwatch */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-900/50">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-wide border flex items-center gap-1.5 ${
                activeJob.status === 'completed'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : activeJob.status === 'failed'
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
              }`}>
                {activeJob.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />}
                {activeJob.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                {activeJob.status === 'failed' && <AlertCircle className="w-3 h-3 text-rose-400" />}
                <span>
                  {activeJob.status === 'completed'
                    ? 'Completed'
                    : activeJob.status === 'failed'
                    ? 'Failed'
                    : `Step ${activeJob.step || 1} of ${activeJob.total_steps || 4}`}
                </span>
              </span>
              <span className="text-xs font-semibold text-white tracking-wide">
                {activeJob.step_name || 'Autonomous Discovery'}
              </span>
            </div>

            {/* Live Stopwatch */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-300">
              <Clock className="w-3 h-3 text-indigo-400" />
              <span>Elapsed: {activeJob.elapsed_seconds || 0}s</span>
            </div>
          </div>

          {/* Sub-step detail text */}
          <div className="pt-2.5 pb-2 text-xs font-mono text-slate-300 flex items-center gap-2">
            <span className="truncate">{activeJob.detail || 'Processing...'}</span>
          </div>

          {/* 4-Step Visual Progress Track */}
          <div className="grid grid-cols-4 gap-1.5 pt-2">
            {[
              { step: 1, name: '1. AI Criteria' },
              { step: 2, name: '2. Portals Probe' },
              { step: 3, name: '3. ATS Crawl & Stage' },
              { step: 4, name: '4. CV Scoring' },
            ].map((st) => {
              const isDone = activeJob.status === 'completed' || activeJob.step > st.step;
              const isCurrent = activeJob.status === 'running' && activeJob.step === st.step;
              return (
                <div key={st.step} className="space-y-1">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isDone
                        ? 'bg-emerald-400'
                        : isCurrent
                        ? 'bg-indigo-500 animate-pulse'
                        : 'bg-slate-800'
                    }`}
                  />
                  <div className={`text-[10px] truncate ${
                    isDone ? 'text-emerald-400 font-medium' : isCurrent ? 'text-indigo-300 font-semibold' : 'text-slate-600'
                  }`}>
                    {st.name}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sub-step Segmented Lines */}
          <div className="mt-3 pt-2.5 border-t border-indigo-900/40 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Granular Sub-Step:</span>
              <span className="text-indigo-300 font-medium truncate max-w-[70%] text-right">
                {activeJob.substep ? `[${activeJob.substep}] ` : ''}{activeJob.substep_name || 'In progress...'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(STEP_SUBSTEPS[activeJob.step || 1] || []).map((sub) => {
                const currentSubNum = parseFloat(activeJob.substep || '1.1');
                const thisSubNum = parseFloat(sub.id);
                const isDone = activeJob.status === 'completed' || currentSubNum > thisSubNum;
                const isCurrent = activeJob.status === 'running' && activeJob.substep === sub.id;
                return (
                  <div key={sub.id} className="space-y-1">
                    <div
                      className={`h-1 rounded-full transition-all duration-300 ${
                        isDone
                          ? 'bg-emerald-400'
                          : isCurrent
                          ? 'bg-indigo-400 animate-pulse'
                          : 'bg-slate-800'
                      }`}
                    />
                    <div
                      className={`text-[10px] truncate flex items-center gap-1.5 ${
                        isDone
                          ? 'text-emerald-400 font-medium'
                          : isCurrent
                          ? 'text-indigo-300 font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      <span className="font-mono">{isDone ? '✓' : isCurrent ? '◐' : '○'}</span>
                      <span className="truncate">{sub.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fallback simple banner for non-discovery actions (purge, verify, reset) */}
      {!activeJob && actionMessage && (
        <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 font-mono flex items-center gap-2">
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Recently Added / Discovered Jobs Section */}
      {latestDiscovered.roles && latestDiscovered.roles.length > 0 && (
        <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4 space-y-3 shadow-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-white tracking-wide">
                Recently Added / Discovered Postings
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                {latestDiscovered.roles.length} {latestDiscovered.roles.length === 1 ? 'role' : 'roles'}
              </span>
              {latestDiscovered.mode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                  {latestDiscovered.mode}
                </span>
              )}
            </div>

            <button
              onClick={fetchLatestDiscovered}
              disabled={refreshingDiscovered}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
              title="Refresh recently added jobs from the database"
            >
              <RotateCcw className={`w-3 h-3 text-slate-400 ${refreshingDiscovered ? 'animate-spin' : ''}`} />
              <span>Refresh Added Roles</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {latestDiscovered.roles.map((role, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 transition-colors flex flex-col justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate max-w-[140px]">
                      {role.company}
                    </span>
                    {role.match_percentage && (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {role.match_percentage}% match
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-200 line-clamp-1">{role.title}</div>
                  {role.location && (
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span className="truncate">{role.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                  <div className="flex flex-wrap gap-1">
                    {(role.ats_keywords || []).slice(0, 3).map((kw, kidx) => (
                      <span key={kidx} className="text-[9px] font-mono px-1 py-0.5 bg-slate-800 text-slate-400 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                  {role.url && (
                    <a
                      href={role.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0 font-medium"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
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
