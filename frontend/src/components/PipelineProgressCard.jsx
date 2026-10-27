import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock, X } from 'lucide-react';

export default function PipelineProgressCard({
  title,
  status = 'running', // 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'
  elapsedSeconds = 0,
  percent = 0,
  badge,
  tag,
  currentTarget,
  detail,
  onCancel,
  className = '',
}) {
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';
  const isFailed = status === 'failed';
  const isRunning = status === 'running';
  const isQueued = status === 'queued';

  const containerColorClass = isCompleted
    ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100 shadow-emerald-950/30'
    : isCancelled
    ? 'bg-slate-900 border-slate-700 text-slate-300'
    : isFailed
    ? 'bg-rose-950/40 border-rose-600/70 text-rose-100'
    : isQueued
    ? 'bg-amber-950/30 border-amber-500/50 text-amber-100 shadow-amber-950/30'
    : 'bg-violet-950/50 border-violet-600/70 text-violet-100 shadow-violet-950/40';

  const barColorClass = isCompleted
    ? 'bg-emerald-400'
    : isCancelled
    ? 'bg-amber-400'
    : isFailed
    ? 'bg-rose-500'
    : isQueued
    ? 'bg-amber-400/60'
    : 'bg-gradient-to-r from-violet-500 to-indigo-500';

  const clampedPercent = Math.max(0, Math.min(100, isQueued ? 5 : percent));

  return (
    <div className={`p-4 rounded-xl border transition-all shadow-xl space-y-3 ${containerColorClass} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
          {isQueued && <Clock className="w-4 h-4 text-amber-400 animate-pulse" />}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {isCancelled && <AlertCircle className="w-4 h-4 text-amber-400" />}
          {isFailed && <AlertCircle className="w-4 h-4 text-rose-400" />}

          <span className="text-xs font-semibold text-white">
            {title}
          </span>

          {badge && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
              {badge}
            </span>
          )}

          {tag && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900/80 text-slate-400 border border-slate-700/60">
              {tag}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <Clock className="w-3 h-3 text-indigo-400" />
            <span>{isQueued ? 'Queued' : `${elapsedSeconds || 0}s`}</span>
          </div>
          {(isRunning || isQueued) && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${barColorClass}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>

      {(currentTarget || detail) && (
        <div className="text-[11px] font-mono text-slate-300 flex items-center justify-between gap-2">
          <div className="truncate">
            {currentTarget && (
              <>
                Target: <span className="text-white font-medium">{currentTarget}</span>
              </>
            )}
          </div>
          {detail && (
            <div className="text-slate-400 shrink-0 text-[10px]">
              {detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
