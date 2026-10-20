import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  X,
  Loader2,
  Bookmark,
  RefreshCw,
  Send,
  FileText,
  User,
  ArrowRight,
  Clock,
} from 'lucide-react';

export default function AutofillModal({
  isOpen,
  onClose,
  initialData = {},
  onApplicationCreated,
}) {
  const [loading, setLoading] = useState(false);
  const [markingInProgress, setMarkingInProgress] = useState(false);
  const [markedInProgress, setMarkedInProgress] = useState(false);
  const [profile, setProfile] = useState({});
  const [answers, setAnswers] = useState([]);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'bookmarklet' | 'answers'

  const company = initialData.company || '';
  const role = initialData.role || initialData.title || '';
  const url = initialData.url || '';

  // Initialize modal state on open: do NOT auto-generate, fetch candidate profile if needed
  useEffect(() => {
    if (!isOpen) return;

    setMarkedInProgress(initialData.status === 'Application in progress');

    // If initialData already has answers, use them
    if (initialData.answers && initialData.answers.length > 0) {
      setAnswers(initialData.answers);
      setProfile(initialData.profile || {});
      setActiveTab('answers');
      return;
    }

    setAnswers([]);
    setActiveTab('profile');

    // Fetch candidate profile immediately so Profile & Bookmarklet tabs work instantly
    if (initialData.profile && Object.keys(initialData.profile).length > 0) {
      setProfile(initialData.profile);
    } else {
      fetch('/api/autofill/candidate')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.profile) setProfile(data.profile);
        })
        .catch((err) => console.error('Failed to load candidate profile:', err));
    }
  }, [isOpen, initialData]);

  // Manually generate answers with agy CLI
  const handleGenerateAnswers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/autofill/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          company,
          role,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) setProfile(data.profile);
        if (data.answers && data.answers.length > 0) {
          setAnswers(data.answers);
          setActiveTab('answers');
        }
      }
    } catch (err) {
      console.error('Failed to generate autofill answers with agy:', err);
    } finally {
      setLoading(false);
    }
  };

  // Manually set application status to "Application in progress"
  const handleSetInProgress = async () => {
    setMarkingInProgress(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company || 'Target Company',
          role: role || 'Target Role',
          status: 'Application in progress',
          url: url || '',
          date_applied: new Date().toISOString().split('T')[0],
        }),
      });
      if (res.ok) {
        setMarkedInProgress(true);
        onApplicationCreated?.();
      }
    } catch (err) {
      console.error('Failed to set application in progress:', err);
    } finally {
      setMarkingInProgress(false);
    }
  };

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  // Build executable universal bookmarklet and console script
  const buildAutofillCode = () => {
    const payload = {
      profile,
      answers,
    };

    return `(function(){
  try {
    const data = ${JSON.stringify(payload)};
    function fill(el, val) {
      if (!el || !val) return;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) { setter.call(el, val); } else { el.value = val; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    const p = data.profile || {};
    let count = 0;

    function getFieldInfo(inp) {
      let label = '';
      if (inp.id) {
        const l = document.querySelector('label[for="' + inp.id + '"]');
        if (l) label = l.innerText;
      }
      if (!label) {
        const l = inp.closest('label');
        if (l) label = l.innerText;
      }
      if (!label) {
        let cur = inp.parentElement;
        for (let s = 0; s < 4; s++) {
          if (!cur) break;
          const l = cur.querySelector('label, [class*="label"], [class*="Label"], [class*="title"]');
          if (l && l.innerText) { label = l.innerText; break; }
          cur = cur.parentElement;
        }
      }
      const name = inp.name || '';
      const id = inp.id || '';
      const placeholder = inp.placeholder || '';
      const aria = inp.getAttribute('aria-label') || '';
      const sig = (name + ' ' + id + ' ' + placeholder + ' ' + aria + ' ' + label).toLowerCase();
      return { label: label.toLowerCase(), sig };
    }

    /* 1. Fill standard contact fields */
    document.querySelectorAll('input, textarea').forEach(function(inp) {
      if (inp.type === 'file' || inp.type === 'radio' || inp.type === 'checkbox') return;
      const info = getFieldInfo(inp);
      const label = info.label;
      const sig = info.sig;

      if ((sig.includes('first_name') || sig.includes('firstname') || sig.includes('given name') || label.includes('first name')) && p.firstName && !inp.value) {
        fill(inp, p.firstName); count++;
      } else if ((sig.includes('last_name') || sig.includes('lastname') || sig.includes('family name') || sig.includes('surname') || label.includes('last name')) && p.lastName && !inp.value) {
        fill(inp, p.lastName); count++;
      } else if ((sig.includes('_systemfield_name') || sig.includes('full_name') || sig.includes('fullname') || label.trim() === 'name' || label.includes('full name') || sig.includes('your name') || inp.id === 'name' || inp.name === 'name') && p.fullName && !inp.value && !sig.includes('first') && !sig.includes('last')) {
        fill(inp, p.fullName); count++;
      } else if ((sig.includes('email') || label.includes('email')) && p.email && !inp.value) {
        fill(inp, p.email); count++;
      } else if ((sig.includes('phone') || sig.includes('mobile') || label.includes('phone') || label.includes('mobile')) && p.phone && !inp.value) {
        fill(inp, p.phone); count++;
      } else if ((sig.includes('github') || label.includes('github')) && p.github && !inp.value) {
        fill(inp, p.github); count++;
      } else if ((sig.includes('linkedin') || label.includes('linkedin')) && p.linkedin && !inp.value) {
        fill(inp, p.linkedin); count++;
      } else if ((sig.includes('portfolio') || sig.includes('website') || label.includes('portfolio') || label.includes('website')) && p.portfolio && !inp.value) {
        fill(inp, p.portfolio); count++;
      } else if ((sig.includes('location') || sig.includes('city') || label.includes('location')) && !inp.value) {
        fill(inp, p.location || 'London, United Kingdom'); count++;
      }
    });

    /* 2. Select radio buttons (e.g. How did you hear) */
    document.querySelectorAll('input[type="radio"]').forEach(function(radio) {
      let label = '';
      if (radio.id) {
        const l = document.querySelector('label[for="' + radio.id + '"]');
        if (l) label = l.innerText;
      }
      if (!label) {
        const parent = radio.closest('label') || radio.parentElement;
        if (parent) label = parent.innerText;
      }
      const text = (label || radio.value || '').toLowerCase();
      if (text.includes('job board') || text.includes('linkedin') || text.includes('user') || text.includes('social media')) {
        if (!radio.checked) {
          radio.click();
          count++;
        }
      }
    });

    /* 3. Fill tailored essay questions */
    function fillAnswersList(ansList) {
      if (!ansList || !ansList.length) return 0;
      let filled = 0;
      ansList.forEach(function(ans) {
        const qLower = (ans.question || '').toLowerCase();
        const qClean = qLower.replace(/[^a-z0-9]/g, ' ').replace(/\\s+/g, ' ').trim();
        const qWords = qClean.split(' ').filter(function(w) { return w.length > 3; });

        document.querySelectorAll('textarea, input[type="text"]').forEach(function(inp) {
          if (inp.value && inp.value.length > 20) return;
          const info = getFieldInfo(inp);
          const labelClean = info.label.replace(/[^a-z0-9]/g, ' ').replace(/\\s+/g, ' ').trim();
          
          let matches = 0;
          for (let i = 0; i < qWords.length; i++) {
            if (labelClean.includes(qWords[i])) matches++;
          }
          if (matches >= 2 || (qWords.length <= 2 && matches >= 1) || (qClean.length > 10 && labelClean.includes(qClean.slice(0, 20)))) {
            fill(inp, ans.answer);
            count++;
            filled++;
          }
        });
      });
      return filled;
    }

    fillAnswersList(data.answers || []);

    /* Also auto-read from clipboard if fresh answers were copied */
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function(text) {
        if (text && text.includes('__caesar__')) {
          try {
            const clipData = JSON.parse(text);
            if (clipData && clipData.answers) {
              const extra = fillAnswersList(clipData.answers);
              if (extra > 0) {
                showBanner(count);
              }
            }
          } catch(e) {}
        }
      }).catch(function(){});
    }

    /* 4. Auto-attach CV PDF via local endpoint if accessible */
    const fileInp = document.querySelector('input[type="file"]:not(#_systemfield_resume), input[id="_systemfield_resume"], input[type="file"]');
    if (fileInp && !fileInp.files?.length) {
      try {
        fetch('http://localhost:8000/api/autofill/cv.pdf')
          .then(function(res) { return res.ok ? res.blob() : null; })
          .then(function(blob) {
            if (blob) {
              const candName = (p.firstName && p.lastName ? (p.firstName + '_' + p.lastName) : (p.fullName || 'Candidate')).trim().replace(/\\s+/g, '_');
              const cvFilename = candName + '_CV.pdf';
              const cvFile = new File([blob], cvFilename, { type: 'application/pdf' });
              const dt = new DataTransfer();
              dt.items.add(cvFile);
              fileInp.files = dt.files;
              fileInp.dispatchEvent(new Event('input', { bubbles: true }));
              fileInp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }).catch(function(){});
      } catch (e) {}
    }

    /* 5. Floating banner visual feedback */
    function showBanner(cnt) {
      const existing = document.getElementById('caesar-autofill-banner');
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.id = 'caesar-autofill-banner';
      banner.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999999;background:#0f172a;color:#fff;padding:12px 18px;border-radius:12px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #10b981;display:flex;align-items:center;gap:10px;';
      banner.innerHTML = '<span style="font-size:18px">⚡</span> <strong>CaesarAI:</strong> Auto-filled ' + cnt + ' fields & profile! Review answers before submitting.';
      document.body.appendChild(banner);
      setTimeout(function() { banner.remove(); }, 6000);
    }
    showBanner(count);
  } catch(err) {
    alert('CaesarAI Autofill Error: ' + err.message);
  }
})();`;
  };

  const getBookmarkletHref = () => {
    return 'javascript:' + encodeURIComponent(buildAutofillCode());
  };

  const handleCopyScript = () => {
    const script = getBookmarkletHref();
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleCopySingle = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAnswerChange = (index, newText) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], answer: newText };
      return next;
    });
  };

  const handleLaunchJob = () => {
    if (answers && answers.length > 0) {
      try {
        navigator.clipboard.writeText(
          JSON.stringify({
            __caesar__: true,
            company,
            role,
            answers,
          })
        );
      } catch (e) {}
    }
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl max-w-3xl w-full p-4 sm:p-6 my-auto text-slate-200 ring-1 ring-white/10 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                  <span>Application Auto-Fill & Tailoring</span>
                  {markedInProgress ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3 text-amber-400" />
                      Application in progress
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400 font-semibold">
                      Drafting
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400">
                  {company ? <strong className="text-slate-200">{company}</strong> : 'Target Role'} · {role || 'Job Posting'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile & Links</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bookmarklet')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'bookmarklet'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>⚡ 1-Click Bookmarklet</span>
          </button>

          <button
            type="button"
            disabled={answers.length === 0 && !loading}
            onClick={() => (answers.length > 0 || loading) && setActiveTab('answers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'answers'
                ? 'bg-indigo-600 text-white shadow-sm'
                : answers.length === 0 && !loading
                ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed border border-slate-800/50'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
            title={
              answers.length === 0
                ? 'Click "Generate with agy" below to unlock tailored answers'
                : 'View AI written fields'
            }
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Written Fields (agy)</span>
            {answers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/30 text-indigo-200 ml-0.5">
                {answers.length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 mt-2 text-xs">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <div className="text-sm font-semibold text-slate-200">
                Drafting tailored application answers with <strong className="text-indigo-400">agy</strong>...
              </div>
              <div className="text-xs text-slate-500 max-w-sm mx-auto">
                Grounded in your real Master CV achievements and metrics. No fake numbers or hallucinated skills.
              </div>
            </div>
          ) : activeTab === 'answers' ? (
            <div className="space-y-3.5">
              <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-slate-300 flex items-center justify-between gap-2">
                <span className="text-[11px]">
                  💡 <strong>Edit any field below!</strong> Your edits will be automatically baked into the 1-click Auto-Fill script.
                </span>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/30 shrink-0">
                  Engine: agy
                </span>
              </div>

              {answers.map((ans, idx) => (
                <div key={idx} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white tracking-wide text-xs">
                      {idx + 1}. {ans.question}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopySingle(ans.answer, `ans-${idx}`)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[11px] shrink-0"
                      title="Copy this answer"
                    >
                      {copiedField === `ans-${idx}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={ans.answer}
                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 text-xs font-sans leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Type or edit your answer..."
                  />
                </div>
              ))}
            </div>
          ) : activeTab === 'profile' ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { label: 'Full Name', value: profile.fullName, key: 'fullName' },
                  { label: 'Email', value: profile.email, key: 'email' },
                  { label: 'Phone', value: profile.phone, key: 'phone' },
                  { label: 'Location / Country', value: profile.location, key: 'location' },
                  { label: 'LinkedIn', value: profile.linkedin, key: 'linkedin' },
                  { label: 'GitHub', value: profile.github, key: 'github' },
                  { label: 'Portfolio / Website', value: profile.portfolio, key: 'portfolio' },
                ].map((field, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
                    <div className="text-[10px] uppercase font-mono text-slate-500 flex justify-between">
                      <span>{field.label}</span>
                      <button
                        type="button"
                        onClick={() => handleCopySingle(field.value, `prof-${idx}`)}
                        className="text-slate-400 hover:text-white"
                        title="Copy"
                      >
                        {copiedField === `prof-${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {field.value || <span className="text-slate-600 font-normal italic">Not set in profile</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-2">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/40 to-slate-900 border border-indigo-500/30 space-y-2">
                <div className="font-bold text-white text-xs flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-indigo-400" />
                  <span>One-Time Setup: Universal Bookmarklet</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-xs">
                  Drag the button below directly into your browser's Bookmarks Bar. When you are on any job application (Ashby, Greenhouse, Lever, Workable), click it once to autofill your answers and profile in 1 second!
                </p>
                <div className="pt-2">
                  <a
                    href={getBookmarkletHref()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 cursor-grab active:cursor-grabbing text-sm transition-transform hover:scale-[1.02]"
                    title="Drag this button to your browser Bookmarks Bar"
                  >
                    <span>⚡ CaesarAI Autofill</span>
                  </a>
                  <p className="text-[11px] text-slate-400 mt-2">
                    👆 <strong>Drag the button once</strong> directly onto your browser's Bookmarks Bar. It will save as <strong>"⚡ CaesarAI Autofill"</strong>.
                  </p>
                  <p className="text-[11px] text-indigo-300/90 mt-1 bg-indigo-950/40 p-2 rounded-lg border border-indigo-500/20">
                    💡 <strong>No re-dragging for new jobs!</strong> When you click <em>"Launch Application Page"</em>, your latest tailored answers automatically copy to your clipboard, allowing this one bookmark to fill new jobs every time.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Alternative: Direct Console Run
                </div>
                <p className="text-[11px] text-slate-400">
                  If you prefer not using bookmarks, click <strong>"Copy Autofill Script"</strong> below, open DevTools on the application page (<kbd className="bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">F12</kbd> or <kbd className="bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">Ctrl+Shift+J</kbd>), and press <kbd className="bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">Enter</kbd>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Human-in-the-loop: You always review and click Submit yourself.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Set as In Progress button (to the left of generate) */}
            {markedInProgress ? (
              <button
                type="button"
                disabled
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-default shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-amber-400" />
                <span>In Progress</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSetInProgress}
                disabled={markingInProgress}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-950/40 transition-all hover:scale-[1.02] disabled:opacity-60"
                title="Mark application as 'Application in progress' in tracker"
              >
                {markingInProgress ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-amber-200" />
                )}
                <span>{markingInProgress ? 'Updating...' : 'Set as In Progress'}</span>
              </button>
            )}

            {/* Manual Generate with agy button */}
            <button
              type="button"
              onClick={handleGenerateAnswers}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-950/40 transition-all hover:scale-[1.02] disabled:opacity-60"
              title="Generate tailored application answers using agy CLI"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>
                {loading
                  ? 'Generating with agy...'
                  : answers.length > 0
                  ? '🔄 Re-generate with agy'
                  : '✨ Generate with agy'}
              </span>
            </button>

            {/* Copy Autofill Script */}
            <button
              type="button"
              onClick={handleCopyScript}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Copy the complete autofill script with your edits"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedScript ? 'Script Copied!' : 'Copy Script'}</span>
            </button>

            {/* Launch Application Page */}
            {url && (
              <button
                type="button"
                onClick={handleLaunchJob}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Launch Application Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
