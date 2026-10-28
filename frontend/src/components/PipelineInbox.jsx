import React, { useState, useEffect, useRef } from 'react';
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
  CheckSquare,
  Square,
  Play,
  X,
  Check,
  Bookmark,
} from 'lucide-react';
import PipelineProgressCard from './PipelineProgressCard';
import GranularProgressCard from './GranularProgressCard';
import ConfirmModal from './ConfirmModal';
import AutofillModal from './AutofillModal';

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

  // Multi-select & Evaluation Job State (Asynchronous with Job IDs & Live Polling)
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [activeEvalJobId, setActiveEvalJobId] = useState(null);
  const [activeEvalJob, setActiveEvalJob] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Yes, Delete',
    confirmVariant: 'danger',
    onConfirm: () => {},
  });
  const [autofillModalConfig, setAutofillModalConfig] = useState({
    isOpen: false,
    data: {},
  });

  const closeConfirm = () => {
    setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const handleOpenAutofill = (roleOrItem) => {
    let url = '';
    let company = '';
    let roleTitle = '';

    if (typeof roleOrItem === 'string') {
      url = getUrlFromItem(roleOrItem);
      const parts = roleOrItem.split('|').map((p) => p.trim());
      if (parts.length > 1 && parts[1]) company = parts[1];
      if (parts.length > 2 && parts[2]) roleTitle = parts[2];
    } else if (roleOrItem && typeof roleOrItem === 'object') {
      url = roleOrItem.url || getUrlFromItem(roleOrItem.raw_line);
      company = roleOrItem.company || '';
      roleTitle = roleOrItem.title || roleOrItem.role || '';
    }

    if (roleTitle) {
      roleTitle = roleTitle.replace(/\s+evaluation(?:\s+report)?$/i, '').trim();
    }

    if (!company && url) {
      try {
        const p = new URL(url);
        const hostParts = p.hostname.split('.');
        const cand = hostParts.filter(
          (x) => !['com', 'co', 'org', 'net', 'io', 'ai', 'uk', 'jobs', 'careers', 'boards', 'www', 'app'].includes(x.toLowerCase())
        );
        if (cand.length > 0) {
          company = cand[0].charAt(0).toUpperCase() + cand[0].slice(1);
        }
      } catch {}
    }

    setAutofillModalConfig({
      isOpen: true,
      data: {
        url,
        company: company || 'Target Company',
        role: roleTitle || 'Software Engineer',
      },
    });
  };

  const getUrlFromItem = (item) => {
    if (!item) return '';
    const urlMatch = item.match(/https?:\/\/[^\s|]+/);
    return urlMatch ? urlMatch[0] : item;
  };

  const toggleSelect = (url) => {
    if (!url) return;
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allUrls = new Set();
    items.forEach((item) => {
      const u = getUrlFromItem(item);
      if (u) allUrls.add(u);
    });
    if (latestDiscovered.roles) {
      latestDiscovered.roles.forEach((r) => {
        if (r.url) allUrls.add(r.url);
      });
    }
    setSelectedUrls(allUrls);
  };

  const handleClearSelection = () => {
    setSelectedUrls(new Set());
  };

  // 1. Mount Check: Check server for any running evaluation job (survives page refresh!)
  useEffect(() => {
    let isMounted = true;
    const checkActiveEvalJob = async () => {
      try {
        const res = await fetch('/api/evaluate/job/active');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.job && isMounted) {
            setActiveEvalJob(data.job);
            setActiveEvalJobId(data.job.job_id);
            if (data.job.status === 'running') {
              setIsEvaluating(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to check active evaluation job:', err);
      }
    };
    checkActiveEvalJob();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Evaluation Status Polling: Polls live progress every 1000ms
  const lastCompletedCountRef = useRef(0);

  useEffect(() => {
    if (!activeEvalJobId || !isEvaluating) return;

    let isCancelled = false;
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/evaluate/job/${activeEvalJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setIsEvaluating(false);
          }
          return;
        }
        const data = await res.json();
        const job = data.job;
        if (!isCancelled && job) {
          setActiveEvalJob(job);

          // Real-time incremental synchronization: Whenever an individual evaluation completes,
          // refresh tracker/reports immediately and remove finished item from selection.
          if (job.completed_count > (lastCompletedCountRef.current || 0)) {
            lastCompletedCountRef.current = job.completed_count;
            onRefresh?.();
            fetchLatestDiscovered();
            if (job.results && job.results.length > 0) {
              const finishedTargets = new Set();
              job.results.forEach((r) => {
                if (r.target) {
                  finishedTargets.add(r.target);
                  const u = getUrlFromItem(r.target);
                  if (u) finishedTargets.add(u);
                }
              });
              setSelectedUrls((prev) => {
                const next = new Set(prev);
                finishedTargets.forEach((t) => next.delete(t));
                return next;
              });
            }
          }

          if (job.status === 'completed') {
            setIsEvaluating(false);
            setActionMessage(`⚡ ${job.detail || 'Evaluation completed successfully!'}`);
            onRefresh?.();
            setSelectedUrls(new Set());
            setTimeout(() => {
              setActiveEvalJob((prev) => (prev?.status === 'completed' ? null : prev));
            }, 8000);
          } else if (job.status === 'cancelled') {
            setIsEvaluating(false);
            setActionMessage(`⏸️ ${job.detail || 'Evaluation paused.'}`);
            onRefresh?.();
            setTimeout(() => {
              setActiveEvalJob((prev) => (prev?.status === 'cancelled' ? null : prev));
            }, 6000);
          } else if (job.status === 'failed') {
            setIsEvaluating(false);
            setActionMessage(`❌ Evaluation failed: ${job.error || 'Unknown error'}`);
            setTimeout(() => {
              setActiveEvalJob((prev) => (prev?.status === 'failed' ? null : prev));
            }, 8000);
          }
        }
      } catch (err) {
        console.error('Failed to poll evaluation job:', err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [activeEvalJobId, isEvaluating]);

  const runBatchEvaluation = async (urlsToEval) => {
    lastCompletedCountRef.current = 0;
    const rawList = Array.isArray(urlsToEval) ? urlsToEval : Array.from(urlsToEval || []);
    const targetList = rawList.map(getUrlFromItem).filter(Boolean);
    const finalItems = targetList.length > 0 ? targetList : rawList.filter(Boolean);
    if (finalItems.length === 0) return;

    setIsEvaluating(true);
    try {
      const res = await fetch('/api/evaluate/batch-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: finalItems,
          mode: finalItems.length === 1 ? 'single' : 'batch',
          engine: 'agy',
        }),
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.job_id) {
        setActiveEvalJobId(data.job_id);
        setActiveEvalJob(data.job || {
          job_id: data.job_id,
          status: 'running',
          total: finalItems.length,
          current_index: 1,
          current_target: finalItems[0],
          completed_count: 0,
          failed_count: 0,
          elapsed_seconds: 0,
          detail: `Starting evaluation for ${finalItems.length} role(s)...`,
        });
      }
    } catch (err) {
      console.error('Failed to launch evaluation job:', err);
      setIsEvaluating(false);
      setActionMessage(`❌ Failed to start evaluation: ${err.message}`);
    }
  };

  const handleCancelEvalJob = async () => {
    if (!activeEvalJobId) return;
    try {
      await fetch(`/api/evaluate/job/${activeEvalJobId}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to cancel evaluation job:', err);
    }
  };

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

  const [deleting, setDeleting] = useState(false);

  const handleDeleteSelected = () => {
    if (selectedUrls.size === 0) return;
    const count = selectedUrls.size;
    setConfirmConfig({
      isOpen: true,
      title: `Delete ${count} Selected Role${count > 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${count} selected role(s) from your inbox, scan history, and all occurrences? This action cannot be undone.`,
      confirmLabel: 'Yes, Delete Selected',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        setDeleting(true);
        try {
          const res = await fetch('/api/pipeline/delete-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: Array.from(selectedUrls) }),
          });
          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
          const data = await res.json();
          setActionMessage(`🗑️ ${data.message || `Deleted ${count} item(s) from all occurrences.`}`);
          setSelectedUrls(new Set());
          await fetchLatestDiscovered();
          onRefresh?.();
          setTimeout(() => setActionMessage(''), 6000);
        } catch (err) {
          console.error('Failed to delete selected items:', err);
          setActionMessage(`❌ Failed to delete: ${err.message}`);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleDeleteSingle = (target) => {
    if (!target) return;
    const url = getUrlFromItem(target) || target;
    const parts = target.split('|');
    const label = parts.length >= 3 ? `${parts[1].trim()} — ${parts[2].trim()}` : url;

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Role',
      message: `Are you sure you want to delete "${label}" from your inbox, scan history, and all occurrences?`,
      confirmLabel: 'Yes, Delete',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        setDeleting(true);
        try {
          const res = await fetch('/api/pipeline/delete-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [url, target] }),
          });
          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
          const data = await res.json();
          setActionMessage(`🗑️ ${data.message || 'Deleted item from all occurrences.'}`);
          setSelectedUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            next.delete(target);
            return next;
          });
          await fetchLatestDiscovered();
          onRefresh?.();
          setTimeout(() => setActionMessage(''), 5000);
        } catch (err) {
          console.error('Failed to delete item:', err);
          setActionMessage(`❌ Failed to delete: ${err.message}`);
        } finally {
          setDeleting(false);
        }
      },
    });
  };


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
          } else if (job.status === 'cancelled') {
            setDiscovering(false);
            try {
              localStorage.removeItem('active_discovery_job_id');
            } catch {}
            setActionMessage(`⏸️ ${job.detail || 'Discovery cancelled.'}`);
            onRefresh?.();
            setTimeout(() => {
              setActiveJob((prev) => (prev?.status === 'cancelled' ? null : prev));
            }, 6000);
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

  const handleCancelDiscovery = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`/api/settings/discover/cancel/${activeJobId}`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to cancel discovery job:', err);
    }
  };

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

  const handlePurgeForeign = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Purge Non-UK Postings',
      message: 'Are you sure you want to purge non-UK postings from your inbox? Any jobs with foreign locations will be permanently removed.',
      confirmLabel: 'Yes, Purge Non-UK',
      confirmVariant: 'warning',
      onConfirm: async () => {
        closeConfirm();
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
      },
    });
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

  const handleResetPipeline = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Reset Pipeline Inbox',
      message: 'Are you sure you want to reset the pipeline inbox? This will clear all pending items, purge scan history, and remove all generated evaluations. This action cannot be undone.',
      confirmLabel: 'Yes, Reset Pipeline',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeConfirm();
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
      },
    });
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
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* STANDALONE CONTAINER 1: AI NATURAL LANGUAGE SEARCH & DISCOVERY */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-indigo-500/40 rounded-xl p-5 backdrop-blur space-y-4 shadow-xl shadow-indigo-950/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  AI Natural Language Search & Discovery
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Non-Destructive (Appends to Queue)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically resolves employer ATS boards and crawls London & UK engineering roles
              </p>
            </div>
          </div>

          {/* Clean smaller button above the prompt */}
          <button
            type="button"
            onClick={() => handleDiscover(true)}
            disabled={discovering}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shrink-0"
            title="Scan 331+ UK portals using Target Role Titles & Archetypes from your candidate profile"
          >
            {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
            <span>✨ Broad UK Scan (CV & Target Roles)</span>
          </button>
        </div>

        <div className="space-y-2.5">
          <textarea
            rows={3}
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                handleDiscover(false);
              }
            }}
            placeholder="Type your search prompt (e.g. Find 20 Backend Engineer, Forward Deployed Engineer, or Applied AI roles focusing strictly on Python, Java, or C# at high-growth tech scaleups in London)..."
            className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-sans resize-y transition-all leading-relaxed shadow-inner"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Quick Prompt Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-medium">Quick Suggestions:</span>
              {[
                {
                  label: "100 Jobs / 200 Companies",
                  prompt: "Find 100 new jobs from 200 new companies for Junior and Mid Level Backend Engineer in any and all industries (Python, Java, C#) London",
                },
                {
                  label: "100 Jobs / 500 Companies",
                  prompt: "Find 100 new jobs from 500 new companies for Junior and Mid Level Backend Engineer in any and all industries (Python, Java, C#) London",
                },
                {
                  label: "100 Jobs / 1,000 Companies",
                  prompt: "Find 100 new jobs from 1000 new companies for Junior and Mid Level Backend Engineer in any and all industries (Python, Java, C#) London",
                },
                {
                  label: "100 Jobs / 1,500 Companies",
                  prompt: "Find 100 new jobs from 1500 new companies for Junior and Mid Level Backend Engineer in any and all industries (Python, Java, C#) London",
                },
                {
                  label: "100 Jobs / 2,000 Companies",
                  prompt: "Find 100 new jobs from 2000 new companies for Junior and Mid Level Backend Engineer in any and all industries (Python, Java, C#) London",
                },
              ].map((sug, sidx) => (
                <button
                  key={sidx}
                  type="button"
                  onClick={() => setNlQuery(sug.prompt)}
                  title={sug.prompt}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-slate-900/90 hover:bg-slate-800 text-indigo-300 border border-indigo-900/50 hover:border-indigo-500/40 transition-colors"
                >
                  + {sug.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {nlQuery && (
                <button
                  type="button"
                  onClick={() => setNlQuery('')}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => handleDiscover(false)}
                disabled={discovering || !nlQuery.trim()}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md shadow-indigo-600/30 disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                <span>Search & Discover Roles</span>
              </button>
            </div>
          </div>
        </div>

        {/* Real-time Discovery Progress Card */}
        {activeJob && (
          <GranularProgressCard
            job={activeJob}
            onCancel={handleCancelDiscovery}
            cancelLabel="Cancel Discovery"
          />
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* STANDALONE CONTAINER 2: PIPELINE INBOX QUEUE */}
      {/* ──────────────────────────────────────────────────────────── */}
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
            {/* Universal Autofill Bookmarklet button */}
            <button
              type="button"
              onClick={() => setAutofillModalConfig({
                isOpen: true,
                data: {
                  company: 'Universal',
                  role: 'All Job Boards',
                }
              })}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
              title="Setup 1-Click Universal Autofill Bookmarklet (Ashby, Greenhouse, Lever)"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>⚡ Universal Autofill</span>
            </button>

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

            {/* Evaluate All Pending button */}
            <button
              onClick={() => {
                const allUrls = items.map(getUrlFromItem).filter(Boolean);
                runBatchEvaluation(allUrls);
              }}
              disabled={isEvaluating || items.length === 0}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-40"
              title="Batch evaluate all pending roles in the queue asynchronously"
            >
              {isEvaluating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <Zap className="w-3.5 h-3.5 text-indigo-400" />}
              <span>⚡ Evaluate All ({items.length})</span>
            </button>
          </div>
        </div>

        {/* Upper Quick Toolbars (2 Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

          {/* 2. Add Single Link */}
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

            <div className="flex items-center gap-2">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {latestDiscovered.roles.map((role, idx) => {
              const isSelected = selectedUrls.has(role.url);
              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg bg-slate-900/90 border transition-all flex flex-col justify-between gap-2 ${
                    isSelected ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-800 hover:border-indigo-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSelect(role.url)}
                          className="text-slate-400 hover:text-indigo-400 transition-colors"
                          title="Select for batch evaluation"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate max-w-[140px]">
                          {role.company}
                        </span>
                      </div>
                      {role.match_percentage && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          {role.match_percentage}% match
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-slate-200 line-clamp-1 pl-5">{role.title}</div>
                    {role.location && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 pl-5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span className="truncate">{role.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 pl-5">
                    <div className="flex flex-wrap gap-1">
                      {(role.ats_keywords || []).slice(0, 3).map((kw, kidx) => (
                        <span key={kidx} className="text-[9px] font-mono px-1 py-0.5 bg-slate-800 text-slate-400 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() => handleOpenAutofill(role)}
                        className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        title="Auto-Fill Application with agy"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>Autofill</span>
                      </button>
                      <button
                        type="button"
                        disabled={isEvaluating}
                        onClick={() => runBatchEvaluation([role.url])}
                        className="px-2 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-40"
                        title="Evaluate this role in-place"
                      >
                        {isEvaluating && activeEvalJob?.current_target?.includes(role.url) ? (
                          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3 text-indigo-400" />
                        )}
                        <span>Eval</span>
                      </button>
                      <button
                        type="button"
                        disabled={deleting || isEvaluating}
                        onClick={() => handleDeleteSingle(role.url || role.raw_line)}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-all disabled:opacity-40"
                        title="Delete this role from all occurrences including TSV history"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Postings Queue Section */}
      <div className="space-y-3">
        {/* Selection & Batch Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors font-medium text-xs"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>Select All</span>
            </button>
            {selectedUrls.size > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                Clear
              </button>
            )}
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {selectedUrls.size > 0 ? (
                <span className="text-indigo-300 font-semibold">{selectedUrls.size} selected</span>
              ) : (
                <span>{items.length} roles in queue</span>
              )}
            </span>
          </div>

          {selectedUrls.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting || isEvaluating}
                className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 hover:border-rose-400 text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                title="Delete selected roles from pipeline, TSV history, applications, and all occurrences"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                <span>Delete Selected ({selectedUrls.size})</span>
              </button>
              <button
                type="button"
                onClick={() => runBatchEvaluation(selectedUrls)}
                disabled={isEvaluating || deleting}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-violet-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
              >
                {isEvaluating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
                <span>Evaluate Selected ({selectedUrls.size})</span>
              </button>
            </div>
          )}
        </div>

        {/* Postings List */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs space-y-2">
              <div>Inbox is empty. Click <strong>"✨ Discover Jobs (UK Scan)"</strong> or type a query in <strong>"AI Natural Language Search"</strong> above.</div>
              <div className="text-[11px] text-slate-600">All foreign, non-UK, and Chinese postings are blocked automatically.</div>
            </div>
          ) : (
            items.map((item, idx) => {
              const url = getUrlFromItem(item);
              const isSelected = selectedUrls.has(url || item);

              // Extract display title, company, location, and match score if pipe delimited
              const parts = item.split('|').map((p) => p.trim());
              const displayTitle = parts.length > 2 ? `${parts[1]} — ${parts[2]}` : item;

              // Find match score if present in any part (e.g. "93.6% match" or "92%")
              const matchScorePart = parts.find((p) => /\d+(\.\d+)?%\s*match/i.test(p) || /^\d+(\.\d+)?%$/i.test(p));
              const matchScore = matchScorePart ? matchScorePart.replace(/match/i, '').trim() : null;

              // Extract location and posted date (excluding matchScorePart)
              const otherParts = parts.slice(3).filter((p) => p !== matchScorePart);
              const locationPart = otherParts.find((p) => !p.toLowerCase().startsWith('posted:')) || '';
              const postedPart = otherParts.find((p) => p.toLowerCase().startsWith('posted:')) || '';

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isSelected
                      ? 'bg-indigo-950/25 border-indigo-500/50'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2.5 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSelect(url || item)}
                      className="mt-0.5 text-slate-500 hover:text-indigo-400 transition-colors shrink-0"
                      title="Select for batch evaluation"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600" />
                      )}
                    </button>
                    <span className="text-xs font-mono text-slate-500 shrink-0 mt-0.5">#{idx + 1}</span>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-200 break-words">{displayTitle}</span>
                        {matchScore && (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold shrink-0">
                            {matchScore} match
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        {locationPart && (
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span>{locationPart}</span>
                          </div>
                        )}
                        {postedPart && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {postedPart}
                          </span>
                        )}
                      </div>
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
                      type="button"
                      onClick={() => handleOpenAutofill(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      title="Auto-Fill Application with agy"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Autofill</span>
                    </button>
                    <button
                      disabled={isEvaluating}
                      onClick={() => runBatchEvaluation([url || item])}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40"
                      title="Evaluate this role in-place"
                    >
                      {isEvaluating && (activeEvalJob?.current_target?.includes(displayTitle) || activeEvalJob?.current_target?.includes(url)) ? (
                        <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3 text-indigo-400" />
                      )}
                      <span>Evaluate</span>
                    </button>
                    <button
                      type="button"
                      disabled={deleting || isEvaluating}
                      onClick={() => handleDeleteSingle(url || item)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 transition-all disabled:opacity-40"
                      title="Delete this role from all occurrences including TSV history"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        confirmVariant={confirmConfig.confirmVariant}
        onConfirm={confirmConfig.onConfirm}
        onClose={closeConfirm}
      />

      <AutofillModal
        isOpen={autofillModalConfig.isOpen}
        onClose={() => setAutofillModalConfig({ isOpen: false, data: {} })}
        initialData={autofillModalConfig.data}
        onApplicationCreated={onRefresh}
      />
    </div>
  </div>
);
}
