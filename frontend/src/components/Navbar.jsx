import React from 'react';
import { Sparkles, Database, ShieldCheck, KeyRound } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, stats, health, onOpenAuth }) {
  const providerName = health?.provider || (health?.database?.includes('postgres') ? 'PostgreSQL' : 'SQLite') || 'PostgreSQL';

  const tabs = [
    { id: 'pipeline', label: `📥 Pipeline Inbox (${stats.pipeline_inbox_count || 0})` },
    { id: 'tracker', label: `📊 Applications (${stats.total_applications || 0})` },
    { id: 'schedules', label: '⏰ Pipeline Schedules' },
    { id: 'evaluator', label: '⚡ Job Evaluator' },
    { id: 'reports', label: `📄 Reports & PDFs (${stats.total_reports || 0})` },
    { id: 'settings', label: '⚙️ Discovery & Profile Settings' },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                CaesarAI CareerOps
              </span>
              <span className="text-xs text-indigo-400 block font-mono">FastAPI • React • AGY Engine</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-mono text-indigo-300 transition-all shadow-sm hover:scale-105 active:scale-95"
              title="Click to check or authenticate Google Antigravity OAuth"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              <span>AGY OAuth</span>
            </button>

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-mono text-slate-300">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Provider: <strong className="text-emerald-400">{providerName}</strong></span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 border-t border-slate-800/60 overflow-x-auto py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
