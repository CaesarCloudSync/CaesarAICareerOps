import React from 'react';
import { Briefcase, Target, Send, Users, Award, Inbox, Sparkles } from 'lucide-react';

export default function StatsOverview({ stats, onSelectTab }) {
  const cards = [
    { label: 'Total Tracked', value: stats.total_applications || 0, icon: Briefcase, color: 'text-indigo-400', border: 'border-indigo-500/20', tab: 'tracker' },
    { label: 'Evaluations', value: stats.total_reports || 0, icon: Sparkles, color: 'text-blue-400', border: 'border-blue-500/20', tab: 'reports' },
    { label: 'High Fit Matches (≥4.0)', value: stats.high_score_roles || 0, icon: Target, color: 'text-emerald-400', border: 'border-emerald-500/20', tab: 'tracker' },
    { label: 'Applied', value: stats.applied || 0, icon: Send, color: 'text-cyan-400', border: 'border-cyan-500/20', tab: 'tracker' },
    { label: 'Interviews', value: stats.interviews || 0, icon: Users, color: 'text-amber-400', border: 'border-amber-500/20', tab: 'tracker' },
    { label: 'Offers', value: stats.offers || 0, icon: Award, color: 'text-purple-400', border: 'border-purple-500/20', tab: 'tracker' },
    { label: 'Inbox Queue', value: stats.pipeline_inbox_count || 0, icon: Inbox, color: 'text-rose-400', border: 'border-rose-500/20', tab: 'pipeline' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const isClickable = Boolean(onSelectTab && c.tab);
        return (
          <div
            key={i}
            onClick={() => isClickable && onSelectTab(c.tab)}
            className={`bg-slate-900/60 p-3.5 rounded-xl border ${c.border} flex flex-col justify-between backdrop-blur transition-all ${
              isClickable ? 'cursor-pointer hover:border-slate-600 hover:scale-[1.02] active:scale-[0.98]' : ''
            }`}
            title={isClickable ? `Click to view ${c.label}` : undefined}
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium truncate">{c.label}</span>
              <Icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className={`text-2xl font-bold font-mono ${c.color}`}>
              {c.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
