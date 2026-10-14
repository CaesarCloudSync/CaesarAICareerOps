import React, { useState } from 'react';
import { Search, ExternalLink, FileText, CheckCircle2 } from 'lucide-react';

export default function ApplicationsTable({ applications, onStatusChange, onViewReport }) {
  const [search, setSearch] = useState('');

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

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur">
      <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Application Pipeline Tracker</h2>
          <p className="text-xs text-slate-400">Track stages, fit scores, and generated reports</p>
        </div>
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
                    <div className="flex justify-end gap-2">
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
