import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ExternalLink,
  FileText,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Loader2,
  CheckSquare,
  Square,
  Zap,
  Sparkles,
  Bookmark,
} from 'lucide-react';
import PipelineProgressCard from './PipelineProgressCard';
import ConfirmModal from './ConfirmModal';
import AutofillModal from './AutofillModal';

export default function ApplicationsTable({ applications = [], onStatusChange, onViewReport, onRefresh }) {
  const [search, setSearch] = useState('');
  const [reEvaluatingId, setReEvaluatingId] = useState(null);
  const [activeEvalJobId, setActiveEvalJobId] = useState(null);
  const [activeEvalJob, setActiveEvalJob] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState(new Set());
  const [autofillModalConfig, setAutofillModalConfig] = useState({
    isOpen: false,
    data: {},
  });
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Yes, Delete',
    confirmVariant: 'danger',
    onConfirm: () => {},
  });
  const lastCompletedCountRef = useRef(0);

  const closeConfirm = () => {
    setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const cleanRole = (role) => (role || '').replace(/\s+evaluation$/i, '').trim();

  // 1. Refresh resilience: Check if an evaluation job is already running on mount
  useEffect(() => {
    let isMounted = true;
    const checkActiveJob = async () => {
      try {
        const res = await fetch('/api/evaluate/job/active');
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.job && isMounted) {
            setActiveEvalJob(data.job);
            setActiveEvalJobId(data.job.job_id);
            setIsEvaluating(true);
          }
        }
      } catch (err) {
        console.error('Failed to check active evaluation job:', err);
      }
    };
    checkActiveJob();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Evaluation Status Polling: Polls live progress, elapsed seconds & target every 1000ms
  useEffect(() => {
    if (!activeEvalJobId || !isEvaluating) return;

    let isCancelled = false;
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/evaluate/job/${activeEvalJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setIsEvaluating(false);
            setReEvaluatingId(null);
          }
          return;
        }
        const data = await res.json();
        const job = data.job;
        if (!isCancelled && job) {
          setActiveEvalJob(job);

          // Real-time synchronization when individual evaluation completes
          if (job.completed_count > (lastCompletedCountRef.current || 0)) {
            lastCompletedCountRef.current = job.completed_count;
            onRefresh?.();

            if (job.results && job.results.length > 0) {
              const finishedTargets = new Set();
              job.results.forEach((r) => {
                if (r.target) finishedTargets.add(r.target);
              });
              setSelectedAppIds((prev) => {
                const next = new Set(prev);
                applications.forEach((app) => {
                  const t = app.url || `${app.company} — ${app.role}`;
                  if (finishedTargets.has(t)) {
                    next.delete(app.id);
                  }
                });
                return next;
              });
            }
          }

          if (job.status === 'completed') {
            setIsEvaluating(false);
            setReEvaluatingId(null);
            setSelectedAppIds(new Set());
            onRefresh?.();
            setTimeout(() => {
              setActiveEvalJob((prev) => (prev?.status === 'completed' ? null : prev));
            }, 8000);
          } else if (job.status === 'cancelled') {
            setIsEvaluating(false);
            setReEvaluatingId(null);
            onRefresh?.();
            setTimeout(() => {
              setActiveEvalJob((prev) => (prev?.status === 'cancelled' ? null : prev));
            }, 6000);
          } else if (job.status === 'failed') {
            setIsEvaluating(false);
            setReEvaluatingId(null);
            setTimeout(() => {
              setActiveEvalJob((prev) => (prev?.status === 'failed' ? null : prev));
            }, 8000);
          }
        }
      } catch (err) {
        console.error('Failed to poll evaluation job in tracker:', err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [activeEvalJobId, isEvaluating, onRefresh, applications]);

  const handleCancelEvalJob = async () => {
    if (!activeEvalJobId) return;
    try {
      await fetch(`/api/evaluate/job/${activeEvalJobId}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to cancel evaluation job:', err);
    }
  };

  const filtered = applications.filter((app) =>
    (app.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (app.role || '').toLowerCase().includes(search.toLowerCase()) ||
    (app.status || '').toLowerCase().includes(search.toLowerCase())
  );

  const getScoreBadge = (score) => {
    if (score >= 4.0) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (score >= 3.0) return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (score >= 2.0) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const statusOptions = ['Application in progress', 'Evaluated', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Archived'];

  const handleDeleteApplication = (id, company, role) => {
    const roleClean = cleanRole(role);
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Application',
      message: `Are you sure you want to delete the application for "${company} — ${roleClean}"? This will also remove its evaluation report.`,
      confirmLabel: 'Yes, Delete',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          const res = await fetch(`/api/applications/${id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            onRefresh?.();
          } else {
            alert('Failed to delete application.');
          }
        } catch (err) {
          alert(`Error deleting application: ${err.message}`);
        }
      },
    });
  };

  const handleDeleteAllApplications = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete All Applications',
      message: `Are you sure you want to delete ALL ${applications.length} application(s) and their evaluation reports? This action cannot be undone.`,
      confirmLabel: 'Yes, Delete All',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          const res = await fetch('/api/applications', {
            method: 'DELETE',
          });
          if (res.ok) {
            onRefresh?.();
          } else {
            alert('Failed to delete applications.');
          }
        } catch (err) {
          alert(`Error deleting applications: ${err.message}`);
        }
      },
    });
  };

  const handleReEvaluate = async (app) => {
    lastCompletedCountRef.current = 0;
    setReEvaluatingId(app.id);
    const jdTarget = app.url || `${app.company} — ${app.role}`;
    try {
      const res = await fetch('/api/evaluate/batch-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: [jdTarget],
          mode: 'single',
          engine: 'agy',
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.job_id) {
        setActiveEvalJobId(data.job_id);
        setActiveEvalJob(data.job || {
          job_id: data.job_id,
          status: 'running',
          total: 1,
          current_index: 1,
          current_target: `${app.company} — ${app.role}`,
          completed_count: 0,
          failed_count: 0,
          elapsed_seconds: 0,
          detail: `Re-evaluating ${app.company} — ${app.role} against your Master CV...`,
        });
        setIsEvaluating(true);
      }
    } catch (err) {
      alert(`Re-evaluation failed: ${err.message}`);
      setReEvaluatingId(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const visibleIds = filtered.map((app) => app.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedAppIds.has(id));
    if (allSelected) {
      setSelectedAppIds(new Set());
    } else {
      setSelectedAppIds(new Set(visibleIds));
    }
  };

  const handleClearSelection = () => {
    setSelectedAppIds(new Set());
  };

  const handleReEvaluateSelected = async () => {
    if (selectedAppIds.size === 0) return;
    const selectedApps = applications.filter((app) => selectedAppIds.has(app.id));
    if (selectedApps.length === 0) return;

    const targets = selectedApps.map((app) => app.url || `${app.company} — ${app.role}`);
    lastCompletedCountRef.current = 0;
    try {
      const res = await fetch('/api/evaluate/batch-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets,
          mode: 'batch',
          engine: 'agy',
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.job_id) {
        setActiveEvalJobId(data.job_id);
        setActiveEvalJob(data.job || {
          job_id: data.job_id,
          status: 'running',
          total: targets.length,
          current_index: 1,
          current_target: targets[0],
          completed_count: 0,
          failed_count: 0,
          elapsed_seconds: 0,
          detail: `Re-evaluating 1 of ${targets.length}: ${targets[0]} against your Master CV...`,
        });
        setIsEvaluating(true);
      }
    } catch (err) {
      alert(`Batch re-evaluation failed: ${err.message}`);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedAppIds.size === 0) return;
    const count = selectedAppIds.size;
    setConfirmConfig({
      isOpen: true,
      title: `Delete ${count} Selected Application${count > 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${count} selected application(s) and their reports? This action cannot be undone.`,
      confirmLabel: 'Yes, Delete Selected',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeConfirm();
        try {
          const ids = Array.from(selectedAppIds);
          for (const id of ids) {
            await fetch(`/api/applications/${id}`, { method: 'DELETE' });
          }
          setSelectedAppIds(new Set());
          onRefresh?.();
        } catch (err) {
          alert(`Failed to delete selected applications: ${err.message}`);
        }
      },
    });
  };

  const isAllSelected = filtered.length > 0 && filtered.every((app) => selectedAppIds.has(app.id));

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur">
      {/* Active Evaluation Progress Card (Matching Scheduler & Inbox with zero duplication) */}
      {activeEvalJob && (
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/40">
          <PipelineProgressCard
            title={
              activeEvalJob.status === 'completed'
                ? 'Re-evaluation Complete'
                : activeEvalJob.status === 'cancelled'
                ? 'Re-evaluation Cancelled'
                : activeEvalJob.status === 'failed'
                ? 'Re-evaluation Failed'
                : activeEvalJob.total === 1
                ? 'Re-evaluating Application Role...'
                : `Batch Evaluating Role ${activeEvalJob.current_index || 1} of ${activeEvalJob.total}`
            }
            status={activeEvalJob.status}
            elapsedSeconds={activeEvalJob.elapsed_seconds || 0}
            percent={
              activeEvalJob.status === 'completed'
                ? 100
                : activeEvalJob.total === 1
                ? Math.min(95, Math.max(15, (activeEvalJob.elapsed_seconds || 1) * 5))
                : Math.round(((activeEvalJob.current_index || 0) / (activeEvalJob.total || 1)) * 100)
            }
            badge="Master CV Re-eval"
            tag={activeEvalJob.job_id ? `Job: ${activeEvalJob.job_id}` : undefined}
            currentTarget={activeEvalJob.current_target}
            detail={activeEvalJob.detail || 'Re-evaluating against your updated Master CV...'}
            onCancel={handleCancelEvalJob}
          />
        </div>
      )}
      <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Application Pipeline Tracker</h2>
          <p className="text-xs text-slate-400">Track stages, fit scores, and generated reports</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setAutofillModalConfig({
              isOpen: true,
              data: {
                company: 'Universal',
                role: 'All Job Boards',
              }
            })}
            title="Setup 1-Click Universal Autofill Bookmarklet"
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>⚡ Universal Autofill</span>
          </button>

          {applications.length > 0 && (
            <button
              onClick={handleDeleteAllApplications}
              title="Delete Applications"
              className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Applications</span>
            </button>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search company or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>
      </div>

      {/* Multi-Selection Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors font-medium text-xs"
          >
            <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
          </button>
          {selectedAppIds.size > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              Clear
            </button>
          )}
          <span className="text-slate-700">|</span>
          <span className="text-slate-400 font-mono text-[11px]">
            {selectedAppIds.size > 0 ? (
              <span className="text-indigo-300 font-semibold">{selectedAppIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} applications tracked</span>
            )}
          </span>
        </div>

        {selectedAppIds.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={isEvaluating}
              className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-medium text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
              title="Delete selected applications"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete Selected ({selectedAppIds.size})</span>
            </button>
            <button
              type="button"
              onClick={handleReEvaluateSelected}
              disabled={isEvaluating}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-violet-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
              title="Re-evaluate selected roles against current Master CV & Profile"
            >
              {isEvaluating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>Re-evaluate Selected ({selectedAppIds.size})</span>
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/40 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800/60">
            <tr>
              <th className="py-3 px-3 w-9 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/30 cursor-pointer"
                  title="Select / Deselect All Visible"
                />
              </th>
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Score</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-8 text-center text-slate-500">
                  No applications recorded yet. Run an evaluation to add one!
                </td>
              </tr>
            ) : (
              filtered.map((app) => {
                const isSelected = selectedAppIds.has(app.id);
                const isThisRowActive =
                  reEvaluatingId === app.id ||
                  (isEvaluating &&
                    activeEvalJob?.status === 'running' &&
                    (activeEvalJob.current_target?.includes(app.company) ||
                      (app.url && activeEvalJob.current_target?.includes(app.url))));

                return (
                  <tr
                    key={app.id}
                    className={`hover:bg-slate-800/30 transition-colors ${
                      isSelected ? 'bg-indigo-950/25' : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(app.id)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/30 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{app.num}</td>
                    <td className="py-3 px-4 font-semibold text-slate-200">{app.company}</td>
                    <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{cleanRole(app.role)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${getScoreBadge(app.score)}`}>
                        {app.score}/5.0
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={app.status}
                        onChange={(e) => onStatusChange(app.company, app.role, e.target.value)}
                        className="bg-slate-950 border border-slate-700/60 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                      >
                        {statusOptions.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">{app.date_applied || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAutofillModalConfig({
                            isOpen: true,
                            data: {
                              url: app.url,
                              company: app.company,
                              role: cleanRole(app.role),
                            }
                          })}
                          title="Auto-Fill Application with agy"
                          className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 hover:text-white text-xs flex items-center gap-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          <span>Autofill</span>
                        </button>

                        <button
                          onClick={() => handleReEvaluate(app)}
                          disabled={isEvaluating}
                          title="Re-evaluate role against current Master CV & Profile"
                          className="px-2 py-1 rounded bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          {isThisRowActive ? (
                            <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3 text-violet-400" />
                          )}
                          <span>{isThisRowActive ? 'Evaluating...' : 'Re-eval'}</span>
                        </button>

                        {app.report_path && (
                          <button
                            onClick={() => onViewReport(app.report_path.replace('reports/', ''))}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-indigo-400" />
                            <span>Report</span>
                          </button>
                        )}
                        {app.url && (
                          <a
                            href={app.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteApplication(app.id, app.company, app.role)}
                          title="Delete Application"
                          className="p-1 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
      />
    </div>
  );
}
