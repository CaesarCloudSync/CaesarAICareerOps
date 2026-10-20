import React, { useState } from 'react';
import { Search, ExternalLink, FileText, CheckCircle2, Trash2, RotateCcw, Loader2 } from 'lucide-react';

export default function ApplicationsTable({ applications = [], onStatusChange, onViewReport, onRefresh }) {
  const [search, setSearch] = useState('');
  const [reEvaluatingId, setReEvaluatingId] = useState(null);
  const [reEvalStatusMessage, setReEvalStatusMessage] = useState('');

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
    setReEvaluatingId(app.id);
    setReEvalStatusMessage(`Re-evaluating ${app.company} — ${app.role} against your current Master CV...`);
    try {
      const jdTarget = app.url || `${app.company} — ${app.role}`;
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_input: jdTarget, engine: 'agy' }),
      });
      if (res.ok) {
        setReEvalStatusMessage(`✓ Successfully re-evaluated ${app.company} with updated fit score & report!`);
        await onRefresh?.();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Re-evaluation failed: ${errData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Re-evaluation error: ${err.message}`);
    } finally {
      setReEvaluatingId(null);
      setTimeout(() => setReEvalStatusMessage(''), 5000);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur">
      {reEvalStatusMessage && (
        <div className="px-4 py-2.5 bg-violet-950/60 border-b border-violet-800/60 text-xs font-mono text-violet-200 flex items-center gap-2 animate-in fade-in">
          {reEvaluatingId ? (
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{reEvalStatusMessage}</span>
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
                      <button
                        onClick={() => handleReEvaluate(app)}
                        disabled={reEvaluatingId === app.id}
                        title="Re-evaluate role against current Master CV & Profile"
                        className="px-2 py-1 rounded bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                      >
                        {reEvaluatingId === app.id ? (
                          <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3 text-violet-400" />
                        )}
                        <span>{reEvaluatingId === app.id ? 'Evaluating...' : 'Re-eval'}</span>
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
