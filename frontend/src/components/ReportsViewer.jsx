import React, { useState } from 'react';
import { FileText, Download, Play, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ReportsViewer({ reports, pdfs, onRefresh }) {
  const [selectedReport, setSelectedReport] = useState(reports[0] || null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

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
    setScanStatus(`Running ATS portal scanner ${verify ? 'with Playwright verification' : ''}...`);
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

  return (
    <div className="space-y-6">
      {/* Scanner Control Strip */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 backdrop-blur">
        <div>
          <h3 className="text-sm font-semibold text-white">ATS Company Feeds Scanner</h3>
          <p className="text-xs text-slate-400">Scan configured ATS feeds (Ashby, Lever, Greenhouse) for target openings</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRunScan(false)}
            disabled={scanning}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            <span>Run Scanner Pass</span>
          </button>
          <button
            onClick={() => handleRunScan(true)}
            disabled={scanning}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-xs font-medium text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Verify Liveness (--verify)</span>
          </button>
        </div>
        {scanStatus && (
          <div className="w-full text-xs font-mono text-indigo-300 bg-slate-950 p-2 rounded border border-slate-800">
            {scanStatus}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports & PDFs list */}
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 backdrop-blur">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Evaluation Reports ({reports.length})
              </h3>
              <button onClick={onRefresh} className="text-slate-400 hover:text-slate-200">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {reports.length === 0 ? (
                <div className="text-xs text-slate-500">No reports generated yet</div>
              ) : (
                reports.map((r) => (
                  <button
                    key={r.filename}
                    onClick={() => setSelectedReport(r)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                      selectedReport?.filename === r.filename
                        ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-mono truncate">{r.filename}</span>
                    <FileText className="w-3.5 h-3.5 shrink-0 ml-2 text-indigo-400" />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 backdrop-blur">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono mb-3">
              Tailored PDFs ({pdfs.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pdfs.length === 0 ? (
                <div className="text-xs text-slate-500">No PDFs generated yet</div>
              ) : (
                pdfs.map((p) => (
                  <div key={p.filename} className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <div className="font-mono text-slate-200 truncate">{p.filename}</div>
                      <div className="text-[10px] text-slate-500">{p.size_kb} KB</div>
                    </div>
                    <a
                      href={p.path}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-400"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Selected Report Viewer */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur flex flex-col">
          {selectedReport ? (
            <>
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800/80 mb-4 gap-2">
                <div>
                  <h2 className="text-base font-semibold text-white">{selectedReport.title}</h2>
                  <span className="text-xs font-mono text-slate-500">{selectedReport.filename}</span>
                </div>
                <button
                  onClick={() => handleGeneratePdf(selectedReport.filename)}
                  disabled={generatingPdf}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{generatingPdf ? 'Rendering PDF...' : 'Generate Tailored PDF'}</span>
                </button>
              </div>

              {pdfStatus && (
                <div className="mb-4 p-2.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-indigo-300">
                  {pdfStatus}
                </div>
              )}

              <div className="prose prose-invert prose-xs max-w-none overflow-y-auto max-h-[600px] pr-2">
                <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-500 text-xs">
              Select a report from the left to view its 7-block analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
