import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Play,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Search,
  Award,
  Briefcase,
  Target,
  TrendingUp,
  Coins,
  FileEdit,
  MessageSquare,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Cpu,
  Eye,
  MapPin,
  Calendar,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function parseReportMetadata(content, defaultTitle = '') {
  const meta = {
    title: defaultTitle || 'Evaluation Report',
    company: '',
    role: '',
    date: '',
    url: '',
    archetype: '',
    score: null,
    scoreMax: 5.0,
    legitimacy: '',
    workAuth: '',
  };
  if (!content) return meta;

  const titleMatch = content.match(/^#\s*Evaluation:\s*(.+)$/m);
  if (titleMatch) {
    meta.title = titleMatch[1].trim();
    const parts = meta.title.split(/\s*[-—–]\s*/);
    if (parts.length >= 2) {
      meta.company = parts[0].trim();
      meta.role = parts.slice(1).join(' — ').trim();
    } else {
      meta.company = meta.title;
    }
  }

  const scoreMatch = content.match(/\*\*Score:\*\*\s*([0-9.]+)(?:\s*\/\s*([0-9.]+))?/i);
  if (scoreMatch) {
    meta.score = parseFloat(scoreMatch[1]);
    if (scoreMatch[2]) meta.scoreMax = parseFloat(scoreMatch[2]);
  }

  const dateMatch = content.match(/\*\*Date:\*\*\s*([^\n\r*]+)/i);
  if (dateMatch) meta.date = dateMatch[1].trim();

  const urlMatch = content.match(/\*\*URL:\*\*\s*(\S+)/i);
  if (urlMatch) meta.url = urlMatch[1].trim();

  const archMatch = content.match(/\*\*Archetype:\*\*\s*([^\n\r*]+)/i);
  if (archMatch) meta.archetype = archMatch[1].trim();

  const legitMatch = content.match(/\*\*Legitimacy:\*\*\s*([^\n\r*]+)/i);
  if (legitMatch) meta.legitimacy = legitMatch[1].trim();

  const authMatch = content.match(/\*\*Work Auth:\*\*\s*([^\n\r*]+)/i);
  if (authMatch) meta.workAuth = authMatch[1].trim();

  return meta;
}

function getScoreTheme(score) {
  if (score === null || score === undefined) {
    return {
      color: 'text-slate-400',
      bg: 'bg-slate-800/60',
      border: 'border-slate-700/60',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
      label: 'Unscored',
    };
  }
  if (score >= 4.0) {
    return {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      label: 'Strong Target Fit',
    };
  }
  if (score >= 3.0) {
    return {
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/30',
      badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      label: 'Competitive Match',
    };
  }
  if (score >= 2.0) {
    return {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      label: 'Moderate Gaps',
    };
  }
  return {
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    label: 'High Gap / Non-Target',
  };
}

function renderDecoratedCell(children) {
  if (!children) return null;
  // If children is a string, check for common evaluation tags
  if (typeof children === 'string') {
    const text = children.trim();
    if (text.includes('✅ Strong') || text === 'Strong') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          ✅ Strong
        </span>
      );
    }
    if (text.includes('⚠️ Partial') || text === 'Partial') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
          ⚠️ Partial
        </span>
      );
    }
    if (text.includes('❌ Missing') || text === 'Missing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
          ❌ Missing
        </span>
      );
    }
    if (text.toLowerCase() === 'critical' || text.toLowerCase().startsWith('critical')) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
          {text}
        </span>
      );
    }
    if (text.toLowerCase() === 'high' || text.toLowerCase().startsWith('high')) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {text}
        </span>
      );
    }
    if (text.toLowerCase() === 'meaningful') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
          {text}
        </span>
      );
    }
  }
  return children;
}

export default function ReportsViewer({ reports = [], pdfs = [], onRefresh }) {
  const [selectedReport, setSelectedReport] = useState(reports[0] || null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState('enhanced'); // 'enhanced' | 'brief' | 'raw'
  const [copied, setCopied] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [reportListFilter, setReportListFilter] = useState('');

  useEffect(() => {
    if (selectedReport && !reports.some((r) => r.filename === selectedReport.filename)) {
      setSelectedReport(reports[0] || null);
    } else if (!selectedReport && reports.length > 0) {
      setSelectedReport(reports[0]);
    }
  }, [reports]);

  const meta = useMemo(() => {
    if (!selectedReport) return null;
    return parseReportMetadata(selectedReport.content, selectedReport.title);
  }, [selectedReport]);

  const scoreTheme = useMemo(() => {
    return getScoreTheme(meta?.score);
  }, [meta?.score]);

  const filteredReportsList = useMemo(() => {
    if (!reportListFilter.trim()) return reports;
    const q = reportListFilter.toLowerCase();
    return reports.filter(
      (r) =>
        r.filename.toLowerCase().includes(q) ||
        (r.title && r.title.toLowerCase().includes(q))
    );
  }, [reports, reportListFilter]);

  const handleCopyMarkdown = () => {
    if (!selectedReport?.content) return;
    navigator.clipboard.writeText(selectedReport.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteReport = async (filename) => {
    if (!window.confirm(`Delete evaluation report "${filename}"?`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh?.();
      } else {
        alert('Failed to delete report.');
      }
    } catch (err) {
      alert(`Error deleting report: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllReports = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete ALL ${reports.length} evaluation reports and generated PDFs? This action cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelectedReport(null);
        onRefresh?.();
      } else {
        alert('Failed to delete all reports.');
      }
    } catch (err) {
      alert(`Error deleting reports: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleGeneratePdf = async (filename) => {
    setGeneratingPdf(true);
    setPdfStatus(`Generating tailored PDF for ${filename}...`);
    try {
      const res = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_filename: filename }),
      });
      const data = await res.json();
      if (data.exit_code === 0) {
        setPdfStatus(`✅ PDF generated successfully!`);
        onRefresh?.();
      } else {
        setPdfStatus(`❌ Error: ${data.stderr || data.stdout}`);
      }
    } catch (err) {
      setPdfStatus(`❌ Error: ${err.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleRunScan = async (verify = false) => {
    setScanning(true);
    setScanStatus(
      `Running ATS portal scanner ${verify ? 'with Playwright verification' : ''}...`
    );
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify }),
      });
      const data = await res.json();
      setScanStatus(`Scan pass completed (Exit ${data.exit_code}). Inbox refreshed.`);
      onRefresh?.();
    } catch (err) {
      setScanStatus(`❌ Scanner error: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  // Content for brief executive view
  const briefContent = useMemo(() => {
    if (!selectedReport?.content) return '';
    const content = selectedReport.content;
    const sections = [];

    // Extract Role Summary, Match with CV & Gaps, Interview Plan
    const roleSummary = content.match(/## A\) Role Summary[\s\S]*?(?=## B\)|$)/i);
    if (roleSummary) sections.push(roleSummary[0].trim());

    const cvMatch = content.match(/## B\) Match with CV[\s\S]*?(?=## C\)|$)/i);
    if (cvMatch) sections.push(cvMatch[0].trim());

    const interviewPlan = content.match(/## F\) Interview Plan[\s\S]*?(?=## G\)|## Block G|$)/i);
    if (interviewPlan) sections.push(interviewPlan[0].trim());

    return sections.length > 0 ? sections.join('\n\n---\n\n') : content;
  }, [selectedReport]);

  const activeContent = viewMode === 'brief' ? briefContent : selectedReport?.content || '';

  // Custom Markdown Components for Enhanced Viewer
  const markdownComponents = useMemo(() => {
    return {
      h1: ({ node, children, ...props }) => (
        <h1
          className="text-lg font-bold text-white pb-2 mb-4 border-b border-slate-800 tracking-tight"
          {...props}
        >
          {children}
        </h1>
      ),
      h2: ({ node, children, ...props }) => {
        const text = String(children);
        let icon = <FileText className="w-4 h-4 text-indigo-400" />;
        let accentBorder = 'border-slate-800';
        if (/Role Summary/i.test(text)) {
          icon = <Briefcase className="w-4 h-4 text-indigo-400" />;
          accentBorder = 'border-indigo-500/30';
        } else if (/Match with CV/i.test(text)) {
          icon = <Target className="w-4 h-4 text-emerald-400" />;
          accentBorder = 'border-emerald-500/30';
        } else if (/Gaps/i.test(text)) {
          icon = <AlertTriangle className="w-4 h-4 text-rose-400" />;
          accentBorder = 'border-rose-500/30';
        } else if (/Level and Strategy/i.test(text)) {
          icon = <TrendingUp className="w-4 h-4 text-sky-400" />;
          accentBorder = 'border-sky-500/30';
        } else if (/Comp and Demand/i.test(text)) {
          icon = <Coins className="w-4 h-4 text-amber-400" />;
          accentBorder = 'border-amber-500/30';
        } else if (/Customization Plan/i.test(text)) {
          icon = <FileEdit className="w-4 h-4 text-violet-400" />;
          accentBorder = 'border-violet-500/30';
        } else if (/Interview Plan/i.test(text)) {
          icon = <MessageSquare className="w-4 h-4 text-teal-400" />;
          accentBorder = 'border-teal-500/30';
        } else if (/Legitimacy|Risk/i.test(text)) {
          icon = <ShieldCheck className="w-4 h-4 text-emerald-400" />;
          accentBorder = 'border-emerald-500/30';
        } else if (/Machine Summary/i.test(text)) {
          icon = <Cpu className="w-4 h-4 text-slate-400" />;
          accentBorder = 'border-slate-700';
        }

        return (
          <div className={`mt-8 mb-3 pt-3 border-t ${accentBorder} flex items-center gap-2.5`}>
            <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 shrink-0">
              {icon}
            </div>
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase font-mono" {...props}>
              {children}
            </h2>
          </div>
        );
      },
      h3: ({ node, children, ...props }) => (
        <h3 className="text-xs font-semibold text-slate-200 mt-4 mb-2 uppercase font-mono tracking-wider flex items-center gap-1.5" {...props}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          {children}
        </h3>
      ),
      table: ({ node, ...props }) => (
        <div className="overflow-x-auto my-4 rounded-xl border border-slate-800/80 bg-slate-950/70 shadow-lg">
          <table className="w-full text-left text-xs border-collapse" {...props} />
        </div>
      ),
      thead: ({ node, ...props }) => (
        <thead className="bg-slate-900/95 text-slate-200 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider" {...props} />
      ),
      tbody: ({ node, ...props }) => (
        <tbody className="divide-y divide-slate-800/60" {...props} />
      ),
      tr: ({ node, ...props }) => (
        <tr className="hover:bg-slate-800/30 transition-colors" {...props} />
      ),
      th: ({ node, ...props }) => (
        <th className="px-3.5 py-2.5 text-slate-300 font-medium whitespace-nowrap" {...props} />
      ),
      td: ({ node, children, ...props }) => (
        <td className="px-3.5 py-2.5 text-slate-300 align-top leading-relaxed" {...props}>
          {renderDecoratedCell(children)}
        </td>
      ),
      blockquote: ({ node, children, ...props }) => (
        <blockquote className="my-3 border-l-4 border-indigo-500/80 bg-indigo-950/20 px-4 py-2.5 rounded-r-lg text-slate-300 text-xs italic leading-relaxed" {...props}>
          {children}
        </blockquote>
      ),
      code: ({ node, inline, className, children, ...props }) => {
        if (inline) {
          return (
            <code className="px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-300 font-mono text-[11px] border border-slate-700/60" {...props}>
              {children}
            </code>
          );
        }
        return (
          <div className="my-3 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400">
              <span>Code / Payload</span>
            </div>
            <pre className="p-3 overflow-x-auto text-slate-300 leading-relaxed font-mono">
              <code>{children}</code>
            </pre>
          </div>
        );
      },
      a: ({ node, href, children, ...props }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 inline-flex items-center gap-1 font-medium transition-colors"
          {...props}
        >
          {children}
          <ExternalLink className="w-3 h-3 inline-block shrink-0" />
        </a>
      ),
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Scanner Control Strip */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 backdrop-blur">
        <div>
          <h3 className="text-sm font-semibold text-white">ATS Company Feeds Scanner</h3>
          <p className="text-xs text-slate-400">
            Scan configured ATS feeds (Ashby, Lever, Greenhouse) for target openings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRunScan(false)}
            disabled={scanning}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            <span>Run Scanner Pass</span>
          </button>
          <button
            onClick={() => handleRunScan(true)}
            disabled={scanning}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-xs font-medium text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Verify Liveness (--verify)</span>
          </button>
        </div>
        {scanStatus && (
          <div className="w-full text-xs font-mono text-indigo-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            {scanStatus}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Reports List & PDFs List */}
        <div className="space-y-4">
          {/* Evaluation Reports */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 backdrop-blur">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Evaluation Reports ({reports.length})
              </h3>
              <div className="flex items-center gap-1.5">
                {reports.length > 0 && (
                  <button
                    onClick={handleDeleteAllReports}
                    disabled={deleting}
                    title="Delete All Evaluation Reports"
                    className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onRefresh}
                  title="Refresh"
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Filter Search */}
            {reports.length > 5 && (
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter reports..."
                  value={reportListFilter}
                  onChange={(e) => setReportListFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {filteredReportsList.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 text-center">
                  {reports.length === 0 ? 'No reports generated yet' : 'No matching reports'}
                </div>
              ) : (
                filteredReportsList.map((r) => {
                  const isSelected = selectedReport?.filename === r.filename;
                  // Quick parse score from content or title
                  const scoreMatch = r.content?.match(/\*\*Score:\*\*\s*([0-9.]+)/i);
                  const rScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;
                  const itemTheme = getScoreTheme(rScore);

                  return (
                    <div
                      key={r.filename}
                      onClick={() => setSelectedReport(r)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer group ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-100 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FileText
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-indigo-400' : 'text-slate-500'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-200 truncate leading-snug">
                            {r.title || r.filename}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {r.filename}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {rScore !== null && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${itemTheme.badge}`}
                          >
                            {rScore.toFixed(1)}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteReport(r.filename);
                          }}
                          title="Delete Report"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tailored PDFs */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 backdrop-blur">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono mb-3">
              Tailored PDFs ({pdfs.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {pdfs.length === 0 ? (
                <div className="text-xs text-slate-500 py-3 text-center">No PDFs generated yet</div>
              ) : (
                pdfs.map((p) => (
                  <div
                    key={p.filename}
                    className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-mono text-slate-200 truncate">{p.filename}</div>
                      <div className="text-[10px] text-slate-500">{p.size_kb} KB</div>
                    </div>
                    <a
                      href={p.path}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 transition-colors shrink-0"
                      title="Download PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Report Viewer */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur flex flex-col">
          {selectedReport ? (
            <>
              {/* Executive Scorecard Hero Card */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4 mb-4 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-indigo-400 font-mono mb-1">
                      <Award className="w-3.5 h-3.5" />
                      <span>7-BLOCK EVALUATION REPORT</span>
                      {meta?.date && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {meta.date}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-tight leading-snug">
                      {meta?.role || meta?.title || selectedReport.title}
                    </h2>
                    {meta?.company && (
                      <div className="text-xs font-semibold text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>Company:</span>
                        <span className="text-indigo-300 font-mono">{meta.company}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions: Generate PDF & Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    {meta?.url && (
                      <a
                        href={meta.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                        title="Open original job posting"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                        <span>View JD</span>
                      </a>
                    )}
                    <button
                      onClick={handleCopyMarkdown}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                      title="Copy full markdown content"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy MD</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleGeneratePdf(selectedReport.filename)}
                      disabled={generatingPdf}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{generatingPdf ? 'Rendering PDF...' : 'Generate Tailored PDF'}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteReport(selectedReport.filename)}
                      disabled={deleting}
                      title="Delete Evaluation"
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* KPI Metrics Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-1">
                  {/* Score KPI */}
                  <div
                    className={`p-2.5 rounded-lg border ${scoreTheme.bg} ${scoreTheme.border} flex flex-col justify-between`}
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Overall Fit Score
                    </div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-xl font-bold font-mono ${scoreTheme.color}`}>
                        {meta?.score !== null ? meta?.score?.toFixed(1) : '—'}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">/ 5.0</span>
                    </div>
                    <div className="text-[10px] text-slate-300 mt-1 truncate">
                      {scoreTheme.label}
                    </div>
                  </div>

                  {/* Archetype KPI */}
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Target Archetype
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-1 line-clamp-2">
                      {meta?.archetype || 'General SWE'}
                    </div>
                    <div className="text-[10px] text-indigo-400 mt-1">
                      {meta?.archetype?.includes('Not a target') ? '⚠️ Non-Target' : '🎯 Target Track'}
                    </div>
                  </div>

                  {/* Work Auth KPI */}
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Work Auth / Geo
                    </div>
                    <div className="text-xs font-semibold text-slate-200 mt-1 truncate">
                      {meta?.workAuth || 'Checked'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span>Location screen</span>
                    </div>
                  </div>

                  {/* Legitimacy KPI */}
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Posting Legitimacy
                    </div>
                    <div className="text-xs font-semibold text-emerald-400 mt-1 truncate">
                      {meta?.legitimacy || 'High Confidence'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      <span>Verified feed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* View Mode Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setViewMode('enhanced')}
                    className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      viewMode === 'enhanced'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Formatted Reader</span>
                  </button>
                  <button
                    onClick={() => setViewMode('brief')}
                    className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      viewMode === 'brief'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Executive Brief</span>
                  </button>
                  <button
                    onClick={() => setViewMode('raw')}
                    className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      viewMode === 'raw'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Raw Markdown</span>
                  </button>
                </div>

                <span className="text-[11px] font-mono text-slate-500 truncate">
                  {selectedReport.filename}
                </span>
              </div>

              {pdfStatus && (
                <div className="mb-4 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-indigo-300">
                  {pdfStatus}
                </div>
              )}

              {/* Report Body */}
              <div className="overflow-y-auto max-h-[640px] pr-2 custom-scrollbar">
                {viewMode === 'raw' ? (
                  <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed select-text">
                    {selectedReport.content}
                  </pre>
                ) : (
                  <div className="prose prose-invert prose-xs max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {activeContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-24 text-slate-500 text-xs flex flex-col items-center justify-center">
              <FileText className="w-8 h-8 text-slate-600 mb-2" />
              <p>Select a report from the list to view its 7-block analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
