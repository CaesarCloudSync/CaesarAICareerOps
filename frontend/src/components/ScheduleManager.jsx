import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  CheckSquare,
  Square,
  Sparkles,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Archive,
  Info,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import PipelineProgressCard from './PipelineProgressCard';

const SUGGESTIONS = [
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
    label: "50 FinTech & Banking",
    prompt: "Find 50 new jobs from 150 companies for Junior and Mid Level Backend Engineer in FinTech and Banking (Python, Java, Go) London",
  },
  {
    label: "50 AI & DevTools",
    prompt: "Find 50 new jobs from 150 companies for Backend Engineer in AI and Developer Tooling Scaleups (Python, Java, C#) London",
  },
  {
    label: "50 HealthTech & BioTech",
    prompt: "Find 50 new jobs from 150 companies for Junior and Mid Level Backend Engineer in HealthTech and BioTech (Python, Java) London",
  },
  {
    label: "20 Fast Discovery",
    prompt: "Find 20 Backend Engineer (Python, Java, C#) London",
  },
];

export default function ScheduleManager() {
  const [activeArea, setActiveArea] = useState('all'); // 'all' | 'new_jobs' | 'backlog'
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [runningScheduleId, setRunningScheduleId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    target_area: 'new_jobs',
    enable_scan: true,
    enable_liveness: true,
    enable_evaluation: false,
    prompt: '',
    liveness_purge_dead: true,
    eval_min_score: 75,
    eval_batch_size: 10,
    eval_scope: 'unevaluated',
    eval_order: 'highest_match',
    frequency_type: 'daily',
    interval_hours: 12,
    time_of_day: '09:00',
    days_of_week: '1,2,3,4,5',
    is_active: true,
  });

  const loadSchedules = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch (err) {
      console.error('Failed to load schedules', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules(true);
    const interval = setInterval(() => {
      loadSchedules(false);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const openCreateModal = (area) => {
    const targetArea = (area === 'all' || !area) ? 'new_jobs' : area;
    setEditingSchedule(null);
    setFormData({
      name: targetArea === 'new_jobs' ? 'Daily London Backend Inflow' : 'Backlog Health & Evaluation Sweep',
      target_area: targetArea,
      enable_scan: true,
      enable_liveness: true,
      enable_evaluation: targetArea === 'new_jobs' ? false : true,
      prompt: targetArea === 'new_jobs'
        ? 'Find 100 new jobs from 200 new companies for Junior and Mid Level Backend Engineer in any and all industries (Python, Java, C#) London'
        : '',
      liveness_purge_dead: true,
      eval_min_score: 75,
      eval_batch_size: 10,
      eval_scope: 'unevaluated',
      eval_order: 'highest_match',
      frequency_type: 'daily',
      interval_hours: 12,
      time_of_day: '09:00',
      days_of_week: '1,2,3,4,5',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (sch) => {
    setEditingSchedule(sch);
    setFormData({
      name: sch.name,
      target_area: sch.target_area,
      enable_scan: sch.enable_scan,
      enable_liveness: sch.enable_liveness,
      enable_evaluation: sch.enable_evaluation,
      prompt: sch.prompt || '',
      liveness_purge_dead: sch.liveness_purge_dead,
      eval_min_score: sch.eval_min_score || 75,
      eval_batch_size: sch.eval_batch_size || 10,
      eval_scope: sch.eval_scope || 'unevaluated',
      eval_order: sch.eval_order || 'highest_match',
      frequency_type: sch.frequency_type || 'daily',
      interval_hours: sch.interval_hours || 12,
      time_of_day: sch.time_of_day || '09:00',
      days_of_week: sch.days_of_week || '1,2,3,4,5',
      is_active: sch.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingSchedule) {
        const res = await fetch(`/api/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setIsModalOpen(false);
          await loadSchedules(false);
        }
      } else {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setIsModalOpen(false);
          if (activeArea !== 'all' && activeArea !== formData.target_area) {
            setActiveArea(formData.target_area);
          }
          await loadSchedules(false);
        }
      }
    } catch (err) {
      console.error('Failed to save schedule', err);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await fetch(`/api/schedules/${id}/toggle`, { method: 'POST' });
      if (res.ok) loadSchedules();
    } catch (err) {
      console.error('Failed to toggle schedule', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) return;
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) loadSchedules();
    } catch (err) {
      console.error('Failed to delete schedule', err);
    }
  };

  const handleRunNow = async (id) => {
    setRunningScheduleId(id);
    try {
      const res = await fetch(`/api/schedules/${id}/run`, { method: 'POST' });
      if (res.ok) {
        setTimeout(loadSchedules, 2000);
      }
    } catch (err) {
      console.error('Failed to trigger schedule run', err);
    } finally {
      setTimeout(() => setRunningScheduleId(null), 3000);
    }
  };

  const getWorkflowBadge = (sch) => {
    const { enable_scan, enable_liveness, enable_evaluation } = sch;
    if (enable_scan && enable_liveness && enable_evaluation) {
      return { text: 'Full Hands-Free Pipeline', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
    }
    if (enable_scan && enable_liveness) {
      return { text: 'Harvest & Verify Live', color: 'bg-sky-950/80 text-sky-300 border-sky-800' };
    }
    if (enable_liveness && enable_evaluation) {
      return { text: 'Clean Queue & Evaluate', color: 'bg-indigo-950/80 text-indigo-300 border-indigo-800' };
    }
    if (enable_scan) {
      return { text: 'Scan Only', color: 'bg-blue-950/80 text-blue-300 border-blue-800' };
    }
    if (enable_liveness) {
      return { text: 'Liveness Cleaner Only', color: 'bg-amber-950/80 text-amber-300 border-amber-800' };
    }
    if (enable_evaluation) {
      return { text: 'Batch Evaluation Only', color: 'bg-violet-950/80 text-violet-300 border-violet-800' };
    }
    return { text: 'Custom Workflow', color: 'bg-slate-900 text-slate-300 border-slate-700' };
  };

  const filteredSchedules = activeArea === 'all'
    ? schedules
    : schedules.filter(s => s.target_area === activeArea);

  return (
    <div className="space-y-6">
      {/* Header & Area Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <span>Pipeline Workflow Scheduler</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Automate multi-stage pipelines with custom prompts, tick-box stages (Scan, Liveness, Evaluation), and quality gates.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadSchedules(true)}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Refresh schedules"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={() => openCreateModal(activeArea)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              <span>New {activeArea === 'backlog' ? 'Backlog' : 'Pipeline'} Schedule</span>
            </button>
          </div>
        </div>

        {/* All / New Jobs / Backlog Tabs */}
        <div className="flex space-x-2 mt-6 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveArea('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeArea === 'all'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Layers className="w-4 h-4 text-violet-400" />
            <span>All Workflows</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {schedules.length}
            </span>
          </button>

          <button
            onClick={() => setActiveArea('new_jobs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeArea === 'new_jobs'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>✦ New Jobs Pipelines</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {schedules.filter(s => s.target_area === 'new_jobs').length}
            </span>
          </button>

          <button
            onClick={() => setActiveArea('backlog')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeArea === 'backlog'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Archive className="w-4 h-4 text-sky-400" />
            <span>📦 Backlog Pipelines</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {schedules.filter(s => s.target_area === 'backlog').length}
            </span>
          </button>
        </div>
      </div>

      {/* Schedules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredSchedules.map((sch) => {
          const badge = getWorkflowBadge(sch);
          const isRunning = runningScheduleId === sch.id || sch.last_status === 'running';

          return (
            <div
              key={sch.id}
              className={`bg-slate-900/70 border rounded-xl p-5 backdrop-blur transition-all flex flex-col justify-between ${
                sch.is_active ? 'border-slate-800 hover:border-slate-700 shadow-sm' : 'border-slate-800/50 opacity-60'
              }`}
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sch.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    <h3 className="font-semibold text-sm text-slate-100">{sch.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                      sch.target_area === 'new_jobs'
                        ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                        : 'bg-sky-950/40 text-sky-300 border-sky-800/60'
                    }`}>
                      {sch.target_area === 'new_jobs' ? '✦ New Jobs' : '📦 Backlog'}
                    </span>
                  </div>

                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${badge.color}`}>
                    {badge.text}
                  </span>
                </div>

                {/* Timing badge */}
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 font-mono">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {sch.frequency_type === 'hourly' && 'Runs every hour'}
                    {sch.frequency_type === 'every_hours' && `Runs every ${sch.interval_hours} hours`}
                    {sch.frequency_type === 'daily' && `Daily at ${sch.time_of_day}`}
                    {sch.frequency_type === 'weekdays' && `Weekdays at ${sch.time_of_day}`}
                  </span>
                </div>

                {/* Active Progress Card (matching main page evaluation progress card with zero duplication) */}
                {(isRunning || sch.progress?.status === 'running') && (
                  <PipelineProgressCard
                    className="mt-3.5"
                    title={sch.progress?.stage || 'Executing Workflow Pipeline...'}
                    status={sch.progress?.status || (isRunning ? 'running' : 'idle')}
                    elapsedSeconds={sch.progress?.elapsed_seconds || 0}
                    percent={sch.progress?.percent || (isRunning ? 25 : 0)}
                    badge={
                      sch.progress?.total > 0
                        ? `${sch.progress.completed_count || 0} / ${sch.progress.total}`
                        : undefined
                    }
                    tag={`Schedule #${sch.id}`}
                    currentTarget={sch.progress?.current_target || sch.name}
                    detail={sch.progress?.detail || 'Processing stages...'}
                  />
                )}

                {/* Stages Tick Box Visualizer */}
                <div className="mt-4 p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Workflow Stages:</span>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className={`flex items-center gap-1.5 ${sch.enable_scan ? 'text-emerald-300 font-medium' : 'text-slate-600 line-through'}`}>
                      {sch.enable_scan ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4 text-slate-600" />}
                      <span>1. Scan</span>
                    </div>

                    <div className={`flex items-center gap-1.5 ${sch.enable_liveness ? 'text-sky-300 font-medium' : 'text-slate-600 line-through'}`}>
                      {sch.enable_liveness ? <CheckSquare className="w-4 h-4 text-sky-400" /> : <Square className="w-4 h-4 text-slate-600" />}
                      <span>2. Liveness</span>
                      {sch.enable_liveness && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                          sch.liveness_purge_dead !== false
                            ? 'text-sky-300 border-sky-800/80 bg-sky-950/60'
                            : 'text-amber-300 border-amber-800/80 bg-amber-950/60'
                        }`}>
                          {sch.liveness_purge_dead !== false ? 'Auto-Prune' : 'Audit Only'}
                        </span>
                      )}
                    </div>

                    <div className={`flex items-center gap-1.5 ${sch.enable_evaluation ? 'text-violet-300 font-medium' : 'text-slate-600 line-through'}`}>
                      {sch.enable_evaluation ? <CheckSquare className="w-4 h-4 text-violet-400" /> : <Square className="w-4 h-4 text-slate-600" />}
                      <span>3. Evaluation</span>
                    </div>
                  </div>
                </div>

                {/* Prompt Preview (for New Jobs) or Scope (for Backlog) */}
                {sch.target_area === 'new_jobs' && sch.prompt && (
                  <div className="mt-3 p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/60 text-xs text-slate-300 font-mono line-clamp-2 leading-relaxed">
                    <span className="text-slate-500 font-sans block text-[10px] font-bold">Search Prompt:</span>
                    {sch.prompt}
                  </div>
                )}

                {/* Last Result & Next Run */}
                <div className="mt-4 pt-3 border-t border-slate-800/70 space-y-1.5 text-xs text-slate-400">
                  {sch.last_result_summary && (
                    <div className="flex items-start gap-1.5 text-[11px] text-slate-300 bg-slate-950/50 p-2 rounded border border-slate-800">
                      <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{sch.last_result_summary}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span>Last run: <strong className="text-slate-300">{sch.last_run_at ? new Date(sch.last_run_at).toLocaleString() : 'Never'}</strong></span>
                    <span>Next run: <strong className="text-indigo-300">{sch.is_active && sch.next_run_at ? new Date(sch.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Paused'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(sch.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                      sch.is_active
                        ? 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-800/50'
                        : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/50'
                    }`}
                  >
                    {sch.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{sch.is_active ? 'Pause' : 'Activate'}</span>
                  </button>

                  <button
                    onClick={() => openEditModal(sch)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                  >
                    Edit
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunNow(sch.id)}
                    disabled={isRunning}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isRunning ? 'Running...' : 'Run Now'}</span>
                  </button>

                  <button
                    onClick={() => handleDelete(sch.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete schedule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredSchedules.length === 0 && (
          <div className="col-span-full p-10 bg-slate-900/40 border border-slate-800 border-dashed rounded-xl text-center space-y-3">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-300">No {activeArea === 'new_jobs' ? 'New Jobs' : 'Backlog'} Schedules Yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create your first automated workflow schedule to continuously harvest, verify liveness, and evaluate roles hands-free.
            </p>
            <button
              onClick={() => openCreateModal(activeArea)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Schedule</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal for Create / Edit Schedule */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <span>{editingSchedule ? 'Edit Schedule' : `New ${formData.target_area === 'new_jobs' ? 'New Jobs' : 'Backlog'} Schedule`}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Daily London Backend Inflow"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Area Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Area</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      target_area: 'new_jobs',
                      name: formData.name === 'Backlog Health & Evaluation Sweep' ? 'Daily London Backend Inflow' : formData.name,
                      enable_liveness: formData.enable_scan ? formData.enable_liveness : false
                    })}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      formData.target_area === 'new_jobs'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="block font-bold">✦ New Jobs Pipeline</span>
                    <span className="text-[11px] opacity-80 block mt-0.5">Discovers, crawls, verifies live, and adds new jobs into inbox</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      target_area: 'backlog',
                      name: formData.name === 'Daily London Backend Inflow' ? 'Backlog Health & Evaluation Sweep' : formData.name,
                    })}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      formData.target_area === 'backlog'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="block font-bold">📦 Backlog Pipeline</span>
                    <span className="text-[11px] opacity-80 block mt-0.5">Refreshes portals, purges dead links, and batch evaluates backlog</span>
                  </button>
                </div>
              </div>

              {/* 3 TICK BOX STAGES */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Select Workflow Stages (Tick Boxes)</span>
                  </label>
                  <span className="text-[11px] text-indigo-300 font-mono">
                    {getWorkflowBadge(formData).text}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  {/* Stage 1: Scan */}
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    formData.enable_scan ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-200' : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.enable_scan}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (formData.target_area === 'new_jobs') {
                          // In New Jobs: checking Scan enables Liveness by default; unchecking Scan forces Liveness OFF
                          setFormData({
                            ...formData,
                            enable_scan: checked,
                            enable_liveness: checked ? true : false,
                          });
                        } else {
                          setFormData({ ...formData, enable_scan: checked });
                        }
                      }}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-0"
                    />
                    <div className="text-xs">
                      <span className="font-bold block">Stage 1: Scan</span>
                      <span className="text-[10px] opacity-80 block mt-0.5">
                        {formData.target_area === 'new_jobs' ? 'Crawl & expand portals' : 'Refresh tracked portals'}
                      </span>
                    </div>
                  </label>

                  {/* Stage 2: Liveness */}
                  {(() => {
                    const isLivenessBlocked = formData.target_area === 'new_jobs' && !formData.enable_scan;
                    return (
                      <label className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                        isLivenessBlocked
                          ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600'
                          : formData.enable_liveness
                            ? 'cursor-pointer bg-sky-950/30 border-sky-800/80 text-sky-200'
                            : 'cursor-pointer bg-slate-900 border-slate-800 text-slate-500'
                      }`}>
                        <input
                          type="checkbox"
                          disabled={isLivenessBlocked}
                          checked={!isLivenessBlocked && formData.enable_liveness}
                          onChange={(e) => {
                            if (isLivenessBlocked) return;
                            setFormData({ ...formData, enable_liveness: e.target.checked });
                          }}
                          className="mt-0.5 rounded text-sky-600 focus:ring-0 disabled:opacity-30"
                        />
                        <div className="text-xs">
                          <span className="font-bold block">Stage 2: Liveness</span>
                          <span className="text-[10px] opacity-80 block mt-0.5">
                            {isLivenessBlocked
                              ? '⚠️ Requires Stage 1: Scan for New Jobs'
                              : 'Zero-browser HTTP health test; purge 404/dead links'}
                          </span>
                        </div>
                      </label>
                    );
                  })()}

                  {/* Stage 3: Evaluation */}
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    formData.enable_evaluation ? 'bg-violet-950/30 border-violet-800/80 text-violet-200' : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.enable_evaluation}
                      onChange={(e) => setFormData({ ...formData, enable_evaluation: e.target.checked })}
                      className="mt-0.5 rounded text-violet-600 focus:ring-0"
                    />
                    <div className="text-xs">
                      <span className="font-bold block">Stage 3: Evaluation</span>
                      <span className="text-[10px] opacity-80 block mt-0.5">
                        AI CV score, breakdown & tailored bullets
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Search Prompt (With Quick Suggestion Pills) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Search Prompt {formData.target_area === 'backlog' && '(Optional for Backlog)'}
                </label>
                <textarea
                  rows={3}
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder="e.g. Find 100 new jobs from 200 new companies for Junior and Mid Level Backend Engineer in London..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
                />

                {/* Quick Suggestion Pills */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 font-semibold">Quick Suggestions:</span>
                  {SUGGESTIONS.map((sug, sidx) => (
                    <button
                      key={sidx}
                      type="button"
                      onClick={() => setFormData({ ...formData, prompt: sug.prompt })}
                      className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-900/60 transition-colors"
                      title={sug.prompt}
                    >
                      + {sug.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Liveness Parameters (If Liveness is checked) */}
              {formData.enable_liveness && (
                <div className="p-3.5 bg-slate-950/50 border border-sky-900/40 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-sky-300 block flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-sky-400" />
                    <span>Stage 2: Liveness Verification Options</span>
                  </span>

                  <label className="flex items-center justify-between p-3 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-semibold text-slate-200 block">
                        Automatically Purge Dead / 404 Links
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {formData.target_area === 'new_jobs'
                          ? 'When enabled, dead or unreachable URLs are immediately discarded before entering inbox.'
                          : 'When enabled, links returning 404/410/unreachable are permanently deleted from database and pipeline.md.'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.liveness_purge_dead}
                      onChange={(e) => setFormData({ ...formData, liveness_purge_dead: e.target.checked })}
                      className="w-4 h-4 rounded text-sky-600 focus:ring-0 cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              )}

              {/* Evaluation Parameters (If Evaluation is checked) */}
              {formData.enable_evaluation && (
                <div className="p-3.5 bg-slate-950/50 border border-violet-900/40 rounded-xl space-y-3">
                  <span className="text-xs font-bold text-violet-300 block flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-violet-400" />
                    <span>Evaluation Settings</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Min Match Score to Evaluate ({formData.eval_min_score}%)</label>
                      <input
                        type="range"
                        min="50"
                        max="90"
                        step="5"
                        value={formData.eval_min_score}
                        onChange={(e) => setFormData({ ...formData, eval_min_score: parseInt(e.target.value) })}
                        className="w-full accent-violet-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Batch Limit per Run</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={formData.eval_batch_size}
                        onChange={(e) => setFormData({ ...formData, eval_batch_size: parseInt(e.target.value) || 10 })}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Timing & Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Frequency</label>
                  <select
                    value={formData.frequency_type}
                    onChange={(e) => setFormData({ ...formData, frequency_type: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays Only (Mon–Fri)</option>
                    <option value="every_hours">Every N Hours</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>

                {formData.frequency_type === 'every_hours' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Interval (Hours)</label>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      value={formData.interval_hours}
                      onChange={(e) => setFormData({ ...formData, interval_hours: parseInt(e.target.value) || 12 })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Time of Day</label>
                    <input
                      type="time"
                      value={formData.time_of_day}
                      onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30"
                >
                  {editingSchedule ? 'Save Changes' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
