import React, { useState, useRef, useEffect } from 'react';
import { Play, Sparkles, Terminal, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function JobEvaluator({ onEvaluationComplete, prefillJd, clearPrefill, onOpenAuth }) {
  const [jdInput, setJdInput] = useState('');
  const [engine, setEngine] = useState('agy');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamOutput, setStreamOutput] = useState('');
  const [savedReport, setSavedReport] = useState(null);
  const [lastExitCode, setLastExitCode] = useState(null);
  const [viewMode, setViewMode] = useState('formatted'); // 'formatted' or 'raw'
  const consoleRef = useRef(null);

  useEffect(() => {
    if (prefillJd) {
      setJdInput(prefillJd);
      clearPrefill?.();
    }
  }, [prefillJd]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [streamOutput]);

  const handleEvaluate = async () => {
    if (!jdInput.trim()) {
      alert('Please paste a job description URL or text.');
      return;
    }

    setIsEvaluating(true);
    setElapsed(0);
    setStreamOutput('');
    setSavedReport(null);
    setStatusMessage('Initializing evaluation pipeline...');

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    try {
      const res = await fetch('/api/evaluate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_input: jdInput, engine: engine }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (let part of parts) {
          part = part.trim();
          if (!part || !part.startsWith('data:')) continue;
          const jsonStr = part.replace(/^data:\s*/, '').trim();
          if (!jsonStr) continue;

          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === 'status') {
              setStatusMessage(evt.message);
            } else if (evt.type === 'chunk') {
              setStreamOutput((prev) => prev + evt.text);
            } else if (evt.type === 'done') {
              clearInterval(timer);
              setLastExitCode(evt.exit_code);
              if (evt.report_filename) {
                setSavedReport(evt.report_filename);
                setStatusMessage(`✅ Evaluation complete and saved to reports/${evt.report_filename}`);
              } else if (evt.exit_code === 127) {
                setStatusMessage(`Exit code 127: AGY CLI was not found or OAuth authentication is required.`);
              } else {
                setStatusMessage(`Exit code: ${evt.exit_code}`);
              }
              onEvaluationComplete?.();
            }
          } catch (e) {
            console.error('Error parsing SSE event', e);
          }
        }
      }
    } catch (err) {
      clearInterval(timer);
      setStatusMessage(`❌ Error: ${err.message}`);
    } finally {
      clearInterval(timer);
      setIsEvaluating(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 backdrop-blur">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>AI Job Description Evaluator</span>
          </h2>
          <p className="text-xs text-slate-400">
            Extracts requirements, evaluates fit score against Master CV, generates 7-block analysis
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <textarea
          rows={5}
          value={jdInput}
          onChange={(e) => setJdInput(e.target.value)}
          placeholder="Paste job posting URL (e.g. Ashby, Lever, Greenhouse) or raw JD text..."
          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500/50 resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-medium">Execution Engine:</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="agy">🚀 Antigravity CLI (agy)</option>
              <option value="claude">🤖 Claude Code (claude)</option>
              <option value="codex">🧠 Codex CLI (codex)</option>
              <option value="gemini-api">🔑 Direct Gemini API (gemini-eval.mjs)</option>
            </select>

            {engine === 'agy' && onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 text-xs border border-indigo-500/30 flex items-center gap-1.5 transition-all shadow-sm hover:scale-105"
                title="Log in or verify Google Antigravity OAuth"
              >
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                <span>AGY Login</span>
              </button>
            )}
          </div>

          <button
            onClick={handleEvaluate}
            disabled={isEvaluating}
            className={`px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 shadow-lg transition-all ${
              isEvaluating
                ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
            }`}
          >
            {isEvaluating ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Evaluating ({elapsed}s)...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run 7-Block Evaluation</span>
              </>
            )}
          </button>
        </div>

        {/* Status ticker */}
        {statusMessage && (
          <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-indigo-300 font-mono flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>[{elapsed}s] {statusMessage}</span>
            </span>
            {savedReport && (
              <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved: reports/{savedReport}</span>
              </span>
            )}
          </div>
        )}

        {/* Live Output Stream */}
        {streamOutput && (
          <div className="mt-4 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
            <div className="bg-slate-900/80 px-3 py-1.5 border-b border-slate-800 flex justify-between items-center text-xs">
              <span className="font-mono text-slate-400">Live Evaluation Stream</span>
              <div className="flex gap-1 font-mono text-[11px]">
                <button
                  onClick={() => setViewMode('formatted')}
                  className={`px-2 py-0.5 rounded ${viewMode === 'formatted' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Formatted Markdown
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={`px-2 py-0.5 rounded ${viewMode === 'raw' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Raw Terminal
                </button>
              </div>
            </div>

            <div ref={consoleRef} className="p-4 max-h-[500px] overflow-y-auto font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {viewMode === 'formatted' ? (
                <div className="prose prose-invert prose-xs max-w-none font-sans">
                  <ReactMarkdown>{streamOutput}</ReactMarkdown>
                </div>
              ) : (
                streamOutput
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
