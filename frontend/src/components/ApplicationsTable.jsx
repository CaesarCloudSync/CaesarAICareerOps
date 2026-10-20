import React, { useState, useEffect, useRef } from 'react';
import { Search, ExternalLink, FileText, CheckCircle2, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import PipelineProgressCard from './PipelineProgressCard';

export default function ApplicationsTable({ applications = [], onStatusChange, onViewReport, onRefresh }) {
  const [search, setSearch] = useState('');
  const [reEvaluatingId, setReEvaluatingId] = useState(null);
  const [activeEvalJobId, setActiveEvalJobId] = useState(null);
  const [activeEvalJob, setActiveEvalJob] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const lastCompletedCountRef = useRef(0);

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
          }

          if (job.status === 'completed') {
            setIsEvaluating(false);
            setReEvaluatingId(null);
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
  }, [activeEvalJobId, isEvaluating, onRefresh]);

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

  const statusOptions = ['Evaluated', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Archived'];

  const handleDeleteApplication = async (id, company, role) => {
    if (!window.confirm(`Delete application for "${company} - ${role}"? This will also remove its evaluation report.`)) {
      return;
    }
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
  };

  const handleDeleteAllApplications = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL ${applications.length} applications and their evaluation reports? This action cannot be undone.`)) {
      return;
    }
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
          {applications.length > 0 && (
            <button
              onClick={handleDeleteAllApplications}
              title="Delete All Applications"
              className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Clear Tracker</span>
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

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/40 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800/60">
            <tr>
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
                <td colSpan="7" className="py-8 text-center text-slate-500">
                  No applications recorded yet. Run an evaluation to add one!
                </td>
              </tr>
            ) : (
              filtered.map((app) => (
                <tr key={app.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-500">{app.num}</td>
                  <td className="py-3 px-4 font-semibold text-slate-200">{app.company}</td>
                  <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{app.role}</td>
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
                      {(() => {
                        const isThisRowActive =
                          reEvaluatingId === app.id ||
                          (isEvaluating &&
                            activeEvalJob?.status === 'running' &&
                            (activeEvalJob.current_target?.includes(app.company) ||
                              (app.url && activeEvalJob.current_target?.includes(app.url))));

                        return (
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
                        );
                      })()}

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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
