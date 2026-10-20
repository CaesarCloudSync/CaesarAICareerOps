import React from 'react';
import { Clock, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export const NEW_JOBS_STEPS = [
  { step: 1, name: '1. AI Criteria' },
  { step: 2, name: '2. Portals Probe' },
  { step: 3, name: '3. ATS Crawl & Stage' },
  { step: 4, name: '4. CV Scoring' },
];

export const NEW_JOBS_SUBSTEPS = {
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

export const BACKLOG_STEPS = [
  { step: 1, name: '1. Portals Refresh' },
  { step: 2, name: '2. Liveness Sweep' },
  { step: 3, name: '3. CV Evaluation' },
];

export const BACKLOG_SUBSTEPS = {
  1: [
    { id: '1.1', title: '1.1 Pre-Flight Portals Validation' },
    { id: '1.2', title: '1.2 Probing ATS Feeds' },
    { id: '1.3', title: '1.3 Multi-Board Parallel Crawl' },
  ],
  2: [
    { id: '2.1', title: '2.1 Queue URL Extraction' },
    { id: '2.2', title: '2.2 Concurrent Liveness Sweep' },
    { id: '2.3', title: '2.3 Purging Inactive Postings' },
  ],
  3: [
    { id: '3.1', title: '3.1 Target Candidate Selection' },
    { id: '3.2', title: '3.2 7-Block AI Evaluation' },
    { id: '3.3', title: '3.3 Sync Applications & Tracker' },
  ],
};

export default function GranularProgressCard({
  job,
  steps,
  stepSubsteps,
  onCancel,
  cancelLabel = 'Cancel Run',
  className = '',
}) {
  if (!job) return null;

  const isBacklog = job.target_area === 'backlog' || job.total_steps === 3;
  const activeSteps = steps || (isBacklog ? BACKLOG_STEPS : NEW_JOBS_STEPS);
  const activeSubstepsMap = stepSubsteps || (isBacklog ? BACKLOG_SUBSTEPS : NEW_JOBS_SUBSTEPS);

  const totalSteps = job.total_steps || activeSteps.length;
  const currentStep = job.step || 1;
  const currentSubstep = job.substep || `${currentStep}.1`;

  const status = job.status || 'running';
  const isRunning = status === 'running';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isFailed
          ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
          : isCompleted
          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
          : isCancelled
          ? 'bg-slate-900 border-slate-700 text-slate-300'
          : 'bg-indigo-950/40 border-indigo-700/60 text-indigo-100 shadow-lg shadow-indigo-950/50'
      } ${className}`}
    >
      {/* Header row: Step pill, Title, and Elapsed Stopwatch */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-900/50">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-wide border flex items-center gap-1.5 ${
              isCompleted
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : isFailed
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : isCancelled
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
            }`}
          >
            {isRunning && <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />}
            {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
            {isFailed && <AlertCircle className="w-3 h-3 text-rose-400" />}
            {isCancelled && <AlertCircle className="w-3 h-3 text-amber-400" />}
            <span>
              {isCompleted
                ? 'Completed'
                : isFailed
                ? 'Failed'
                : isCancelled
                ? 'Cancelled'
                : `Step ${currentStep} of ${totalSteps}`}
            </span>
          </span>
          <span className="text-xs font-semibold text-white tracking-wide">
            {job.step_name || 'Autonomous Pipeline'}
          </span>
        </div>

        {/* Live Stopwatch & Cancel Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-300">
            <Clock className="w-3 h-3 text-indigo-400" />
            <span>Elapsed: {job.elapsed_seconds || 0}s</span>
          </div>
          {isRunning && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{cancelLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-step detail text */}
      <div className="pt-2.5 pb-2 text-xs font-mono text-slate-300 flex items-center gap-2">
        <span className="truncate">{job.detail || 'Processing...'}</span>
      </div>

      {/* Visual Progress Track */}
      <div
        className={`grid gap-1.5 pt-2 ${
          activeSteps.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {activeSteps.map((st) => {
          const isDone = isCompleted || currentStep > st.step;
          const isCurrent = isRunning && currentStep === st.step;
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
              <div
                className={`text-[10px] truncate ${
                  isDone
                    ? 'text-emerald-400 font-medium'
                    : isCurrent
                    ? 'text-indigo-300 font-semibold'
                    : 'text-slate-600'
                }`}
              >
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
            {job.substep ? `[${job.substep}] ` : ''}
            {job.substep_name || 'In progress...'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(activeSubstepsMap[currentStep] || []).map((sub) => {
            const currentSubNum = parseFloat(currentSubstep);
            const thisSubNum = parseFloat(sub.id);
            const isDone = isCompleted || currentSubNum > thisSubNum;
            const isCurrent = isRunning && currentSubstep === sub.id;
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

      {/* Live Activity Feed (stdout stream / crawl activity) */}
      {job.live_feed && job.live_feed.length > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-1.5 font-mono text-[10px]">
          <div className="flex items-center gap-1.5 text-indigo-400 font-semibold pb-1 border-b border-slate-800/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>Live Activity Stream:</span>
          </div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
            {job.live_feed.slice(-5).map((line, lidx) => {
              const isLatest = lidx === job.live_feed.slice(-5).length - 1;
              return (
                <div key={lidx} className="truncate flex items-center gap-1.5">
                  <span className="text-slate-600 shrink-0">›</span>
                  <span
                    className={`truncate ${
                      isLatest ? 'text-indigo-200 font-medium' : 'text-slate-400'
                    }`}
                  >
                    {line}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dedicated Completion Hero Banner */}
      {isCompleted && (
        <div className="mt-3 p-3 rounded-lg bg-emerald-950/70 border border-emerald-600/60 text-emerald-100 flex items-start gap-3 shadow-md shadow-emerald-950/50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white">Pipeline Execution Completed</span>
              {(job.result?.stats?.jobs_collected > 0 || (job.detail && job.detail.match(/\+(\d+)\s*roles/))) && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  +{job.result?.stats?.jobs_collected || job.detail.match(/\+(\d+)\s*roles/)[1]} New Roles Collected
                </span>
              )}
              {job.result?.stats?.companies_probed > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  {job.result.stats.companies_probed} Portals Probed
                </span>
              )}
              {job.result?.stats?.evaluated_count > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {job.result.stats.evaluated_count} Roles Evaluated
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-emerald-200/90 leading-relaxed break-words">
              {job.detail || job.result?.message || 'Workflow finished successfully.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
