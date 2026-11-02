import React from 'react';
import {
  Sparkles,
  Database,
  KeyRound,
  Inbox,
  Briefcase,
  Clock,
  Zap,
  FileText,
  Settings,
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, stats, health, onOpenAuth }) {
  const providerName =
    health?.provider ||
    (health?.database?.includes('postgres') ? 'PostgreSQL' : 'SQLite') ||
    'PostgreSQL';

  const tabs = [
    {
      id: 'pipeline',
      label: 'Pipeline Inbox',
      shortLabel: 'Inbox',
      count: stats.pipeline_inbox_count || 0,
      icon: Inbox,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    },
    {
      id: 'tracker',
      label: 'Applications',
      shortLabel: 'Apps',
      count: stats.total_applications || 0,
      icon: Briefcase,
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    },
    {
      id: 'schedules',
      label: 'Schedules',
      shortLabel: 'Crons',
      icon: Clock,
    },
    {
      id: 'evaluator',
      label: 'Job Evaluator',
      shortLabel: 'Evaluator',
      icon: Zap,
    },
    {
      id: 'reports',
      label: 'Reports & PDFs',
      shortLabel: 'Reports',
      count: stats.total_reports || 0,
      icon: FileText,
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    {
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-base sm:text-lg bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent truncate block">
                CaesarAI CareerOps
              </span>
              <span className="text-[10px] sm:text-xs text-indigo-400 block font-mono truncate">
                FastAPI • React • AGY Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-[11px] sm:text-xs font-mono text-indigo-300 transition-all shadow-sm hover:scale-105 active:scale-95"
              title="Click to check or authenticate Google Antigravity OAuth"
            >
              <KeyRound className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400" />
              <span>AGY OAuth</span>
            </button>

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-mono text-slate-300">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Provider: <strong className="text-emerald-400">{providerName}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Responsive Tab Navigation */}
        <nav className="flex space-x-1.5 border-t border-slate-800/60 overflow-x-auto py-2 no-scrollbar scroll-smooth">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 min-h-[36px] sm:min-h-[40px] select-none ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600/30 to-violet-600/30 text-white border border-indigo-500/50 shadow-md shadow-indigo-950/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                    isActive ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>

                {typeof tab.count === 'number' && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                      tab.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
