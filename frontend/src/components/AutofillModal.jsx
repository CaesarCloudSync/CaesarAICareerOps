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
  Save,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Download,
  Folder,
  Zap,
} from 'lucide-react';
import PipelineProgressCard from './PipelineProgressCard';

export default function AutofillModal({
  isOpen,
  onClose,
  initialData = {},
  onApplicationCreated,
  onProgressUpdate,
}) {
  const [loading, setLoading] = useState(false);
  const [singleJobProgress, setSingleJobProgress] = useState(null);
  const [markedInProgress, setMarkedInProgress] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [savedAnswersSuccess, setSavedAnswersSuccess] = useState(false);
  const [profile, setProfile] = useState({});
  const [answers, setAnswers] = useState([]);
  const [coverLetter, setCoverLetter] = useState('');
  const [hasCoverLetter, setHasCoverLetter] = useState(false);
  const [copiedCoverLetter, setCopiedCoverLetter] = useState(false);
  const [cvData, setCvData] = useState({ filename: 'Bob_Hillus_CV.pdf', base64: '' });
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [copiedExtensionPath, setCopiedExtensionPath] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'extension' | 'bookmarklet' | 'answers'
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingAgy, setClearingAgy] = useState(false);

  const company = initialData.company || '';
  const role = initialData.role || initialData.title || '';
  const url = initialData.url || '';

  // Initialize modal state on open:
  // 1. Automatically update application to "Application in progress"
  // 2. Fetch CV base64, candidate profile, and saved answers/cover letter
  useEffect(() => {
    if (!isOpen) return;

    // Automatically set application as "Application in progress" in the background
    if (company || role || url) {
      fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company || 'Target Company',
          role: role || 'Target Role',
          status: 'Application in progress',
          url: url || '',
          date_applied: new Date().toISOString().split('T')[0],
        }),
      })
        .then((res) => {
          if (res.ok) {
            setMarkedInProgress(true);
            onApplicationCreated?.();
          }
        })
        .catch((err) => console.error('Failed to auto-set application in progress:', err));
    }

    // Fetch candidate CV base64 for reliable zero-CSP upload
    fetch('/api/autofill/cv-base64')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.base64) {
          setCvData(data);
        }
      })
      .catch((err) => console.error('Failed to load CV base64:', err));

    // If initialData already has answers or cover letter, use them
    if (initialData.cover_letter) {
      setCoverLetter(initialData.cover_letter);
      setHasCoverLetter(true);
    }

    if (initialData.answers && initialData.answers.length > 0) {
      setAnswers(initialData.answers);
      setProfile(initialData.profile || {});
      setActiveTab('answers');
    } else {
      // Check for previously saved answers and cover letter in SQLite for this job
      fetch(
        `/api/autofill/saved-answers?company=${encodeURIComponent(company)}&role=${encodeURIComponent(
          role
        )}&url=${encodeURIComponent(url)}`
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.found) {
            if (data.answers && data.answers.length > 0) {
              setAnswers(data.answers);
            }
            if (data.cover_letter) {
              setCoverLetter(data.cover_letter);
              setHasCoverLetter(true);
            }
            if ((data.answers && data.answers.length > 0) || data.cover_letter) {
              setActiveTab('answers');
            } else {
              setAnswers([]);
              setActiveTab('profile');
            }
          } else {
            setAnswers([]);
            setActiveTab('profile');
          }
        })
        .catch(() => {
          setAnswers([]);
          setActiveTab('profile');
        });
    }

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
  }, [isOpen, initialData, company, role, url]);

  const [activeJobId, setActiveJobId] = useState(null);

  // Poll live progress of async autofill job (emulating evaluation tracking)
  useEffect(() => {
    if (!activeJobId) return;
    let isCancelled = false;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/autofill/job/${activeJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setActiveJobId(null);
            setLoading(false);
          }
          return;
        }
        const job = await res.json();
        if (!isCancelled && job) {
          setSingleJobProgress(job);
          onProgressUpdate?.(job);

          if (job.status === 'completed') {
            setActiveJobId(null);
            setLoading(false);
            onApplicationCreated?.();

            // Fetch saved answers from SQLite
            fetch(`/api/autofill/saved-answers?company=${encodeURIComponent(company)}&role=${encodeURIComponent(role)}&url=${encodeURIComponent(url)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((saved) => {
                if (saved && saved.found) {
                  if (saved.answers && saved.answers.length > 0) setAnswers(saved.answers);
                  if (saved.cover_letter) {
                    setCoverLetter(saved.cover_letter);
                    setHasCoverLetter(true);
                  }
                  setActiveTab('answers');
                }
              })
              .catch(() => {});

            setTimeout(() => {
              setSingleJobProgress((prev) => (prev?.status === 'completed' ? null : prev));
              onProgressUpdate?.(null);
            }, 6000);
          } else if (job.status === 'cancelled' || job.status === 'failed') {
            setActiveJobId(null);
            setLoading(false);
            setTimeout(() => {
              setSingleJobProgress(null);
              onProgressUpdate?.(null);
            }, 6000);
          }
        }
      } catch (err) {
        console.error('Error polling autofill job:', err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [activeJobId, company, role, url, onApplicationCreated, onProgressUpdate]);

  // Cancel currently running autofill job
  const handleCancelJob = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`/api/autofill/job/${activeJobId}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to cancel autofill job:', err);
    }
  };

  // Launch async autofill job tracked by real backend job_id
  const handleGenerateAnswers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/autofill/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: initialData?.id,
          url,
          company,
          role,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.job_id) {
        setActiveJobId(data.job_id);
        const initialJob = data.job || {
          job_id: data.job_id,
          status: 'running',
          total: 1,
          current_index: 1,
          current_target: `${company || 'Target Company'} — ${role || 'Role'}`,
          elapsed_seconds: 0,
          detail: 'Inspecting application form HTML and drafting tailored answers with agy...',
        };
        setSingleJobProgress(initialJob);
        onProgressUpdate?.(initialJob);
      }
    } catch (err) {
      console.error('Failed to start async autofill job:', err);
      setLoading(false);
      alert(`Autofill generation failed: ${err.message}`);
    }
  };

  // Persist customized/edited answers and cover letter to database
  const handleSaveAnswers = async () => {
    setSavingAnswers(true);
    try {
      const res = await fetch('/api/autofill/save-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          role,
          url,
          answers,
          cover_letter: coverLetter,
        }),
      });
      if (res.ok) {
        setSavedAnswersSuccess(true);
        setTimeout(() => setSavedAnswersSuccess(false), 2500);
        onApplicationCreated?.();
      }
    } catch (err) {
      console.error('Failed to save answers:', err);
    } finally {
      setSavingAnswers(false);
    }
  };

  // Permanently clear agy generation for this job application
  const handleConfirmClearAgy = async () => {
    setClearingAgy(true);
    try {
      await fetch('/api/autofill/clear-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, role, url }),
      });
      setAnswers([]);
      setCoverLetter('');
      setHasCoverLetter(false);
      setActiveTab('profile');
      setShowClearConfirm(false);
      onApplicationCreated?.();
    } catch (err) {
      console.error('Failed to clear agy answers:', err);
    } finally {
      setClearingAgy(false);
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
      company: company || '',
      role: role || '',
      url: url || '',
      profile,
      answers,
      coverLetter: coverLetter || '',
      cvBase64: cvData.base64 || '',
      cvFilename: cvData.filename || 'Bob_Hillus_CV.pdf',
    };

    return `(function(){
  try {
    const payloadData = ${JSON.stringify(payload)};

    // 1. Create or reset Floating Progress Toast
    const oldToast = document.getElementById('caesar-autofill-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'caesar-autofill-toast';
    toast.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px', 'z-index:2147483647',
      'width:340px', 'max-width:calc(100vw - 40px)',
      'background:#0f172a', 'color:#f8fafc',
      'border:1px solid #10b981', 'border-radius:14px',
      'box-shadow:0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(16,185,129,0.2)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:13px', 'line-height:1.4', 'padding:14px 16px', 'box-sizing:border-box',
      'transition:opacity 0.4s ease, transform 0.4s ease',
      'opacity:1', 'transform:translateY(0)'
    ].join(';');

    toast.innerHTML = \`
      <div style="display:flex;align-items:center;justify-content:between;gap:8px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:#10b981;flex:1;">
          <span style="font-size:16px;">⚡</span> CaesarAI Autofill
        </div>
        <button id="caesar-toast-close" style="background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:4px;" title="Close">✕</button>
      </div>
      <div id="caesar-toast-msg" style="font-size:12px;color:#e2e8f0;font-weight:500;">🔍 Scanning form fields...</div>
      <div style="margin-top:10px;height:6px;width:100%;background:#1e293b;border-radius:999px;overflow:hidden;">
        <div id="caesar-toast-bar" style="height:100%;width:25%;background:#10b981;border-radius:999px;transition:width 0.4s ease, background 0.4s ease;"></div>
      </div>
      <div id="caesar-toast-sub" style="margin-top:7px;font-size:11px;color:#94a3b8;">Discovering live DOM elements</div>
    \`;

    document.body.appendChild(toast);

    const closeBtn = document.getElementById('caesar-toast-close');
    if (closeBtn) {
      closeBtn.onclick = function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(function() { toast.remove(); }, 400);
      };
    }

    function updateToast(pct, msg, sub, isError) {
      const bar = document.getElementById('caesar-toast-bar');
      const msgEl = document.getElementById('caesar-toast-msg');
      const subEl = document.getElementById('caesar-toast-sub');
      if (bar) {
        bar.style.width = pct + '%';
        if (isError) bar.style.background = '#ef4444';
      }
      if (msgEl) msgEl.innerText = msg;
      if (subEl) subEl.innerText = sub;
    }

    // Helper to dispatch React/Angular compatible input events
    function setFieldValue(el, val) {
      if (!el || val === undefined || val === null) return;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) { setter.call(el, val); } else { el.value = val; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // Helper to find label text
    function getElementLabel(el) {
      let lbl = '';
      if (el.id) {
        try {
          const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (l) lbl = l.innerText;
        } catch(e) {}
      }
      if (!lbl) {
        const p = el.closest('label');
        if (p) lbl = p.innerText;
      }
      if (!lbl) {
        let cur = el.parentElement;
        for (let i = 0; i < 4; i++) {
          if (!cur) break;
          const found = cur.querySelector('label, [class*="label" i], [class*="legend" i], [class*="question" i], [class*="title" i]');
          if (found && found.innerText && found.innerText.length < 300) {
            lbl = found.innerText;
            break;
          }
          cur = cur.parentElement;
        }
      }
      return (lbl || el.placeholder || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
    }

    // Helper to attach CV PDF
    function attachCvPdf(b64, fn) {
      if (!b64) return false;
      try {
        const fileInp = document.getElementById('_systemfield_resume') ||
                        document.querySelector('input[type="file"][id*="resume" i], input[type="file"][name*="resume" i], input[type="file"][id*="cv" i], input[type="file"][name*="cv" i], input[type="file"]');
        if (!fileInp || (fileInp.files && fileInp.files.length > 0)) return false;
        const byteChars = atob(b64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNums[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNums);
        const cvFile = new File([byteArray], fn || 'Bob_Hillus_CV.pdf', { type: 'application/pdf' });
        const dt = new DataTransfer();
        dt.items.add(cvFile);
        fileInp.files = dt.files;
        fileInp.dispatchEvent(new Event('input', { bubbles: true }));
        fileInp.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch(e) {
        console.warn('CaesarAI PDF attach error:', e);
        return false;
      }
    }

    // 2. Extract live interactive form elements from page
    const fields = [];
    const seen = new Set();

    document.querySelectorAll('input, textarea, select').forEach(function(el) {
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return;

      const id = el.id || '';
      const name = el.name || '';
      const key = (id || name || (tag + '_' + type + '_' + el.placeholder)).toLowerCase();
      if (key && seen.has(key) && type !== 'radio') return;
      if (key) seen.add(key);

      const label = getElementLabel(el);
      const options = [];

      if (tag === 'select') {
        Array.from(el.options || []).forEach(function(opt) {
          if (opt.text && opt.text.trim()) options.push(opt.text.trim());
        });
      } else if (type === 'radio' && name) {
        try {
          document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]').forEach(function(r) {
            const rlbl = getElementLabel(r) || r.value;
            if (rlbl) options.push(rlbl);
          });
        } catch(e) {}
      }

      let selector = '';
      if (id) {
        try { selector = '#' + CSS.escape(id); } catch(e) { selector = '#' + id; }
      } else if (name) {
        try {
          selector = tag + '[name="' + CSS.escape(name) + '"]' + (type === 'radio' ? '[value="' + CSS.escape(el.value) + '"]' : '');
        } catch(e) {}
      }

      fields.push({
        id: id,
        name: name,
        tag: tag,
        type: type,
        label: label,
        placeholder: el.placeholder || '',
        options: options,
        selector: selector
      });
    });

    updateToast(25, '🔍 Discovered ' + fields.length + ' form fields', 'Sending rendered DOM to CaesarAI engine...');

    // 3. Post to CaesarAI Backend for AI Resolution
    const reqBody = {
      url: window.location.href,
      page_title: document.title,
      company: payloadData.company || '',
      role: payloadData.role || '',
      fields: fields
    };

    updateToast(65, '🤖 agy: Resolving dropdowns & drafting custom answers...', 'Reasoning with Candidate Profile & CV...');

    fetch('http://localhost:8000/api/autofill/resolve-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      let count = 0;
      const actions = data.actions || [];

      // Execute each action from agy action plan
      actions.forEach(function(act) {
        let el = null;
        if (act.id) el = document.getElementById(act.id);
        if (!el && act.selector) {
          try { el = document.querySelector(act.selector); } catch(e) {}
        }
        if (!el) return;

        if (act.type === 'select') {
          const targetVal = (act.value || '').trim().toLowerCase();
          for (let i = 0; i < el.options.length; i++) {
            const opt = el.options[i];
            const optText = (opt.text || '').trim().toLowerCase();
            const optVal = (opt.value || '').trim().toLowerCase();
            if (optText === targetVal || optVal === targetVal) {
              el.selectedIndex = i;
              el.value = opt.value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              count++;
              break;
            }
          }
        } else if (act.type === 'radio') {
          if (!el.checked) {
            el.click();
            el.dispatchEvent(new Event('change', { bubbles: true }));
            count++;
          }
        } else {
          // fill text or textarea
          setFieldValue(el, act.value);
          count++;
        }
      });

      // Attach CV PDF
      const cvAttached = attachCvPdf(data.cvBase64 || payloadData.cvBase64, data.cvFilename || payloadData.cvFilename);
      if (cvAttached) count++;

      updateToast(100, '✅ Done! ' + count + ' fields filled & CV attached!', '💡 Human review: Review answers before clicking Submit.');

      setTimeout(function() {
        if (toast && toast.parentElement) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(-10px)';
          setTimeout(function() { toast.remove(); }, 400);
        }
      }, 8000);
    })
    .catch(function(err) {
      console.warn('CaesarAI backend error:', err);
      updateToast(100, '⚠️ CaesarAI unreachable on localhost:8000', 'Start local server to resolve live fields with agy.', true);
      setTimeout(function() {
        if (toast && toast.parentElement) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(-10px)';
          setTimeout(function() { toast.remove(); }, 400);
        }
      }, 7000);
    });

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
    try {
      navigator.clipboard.writeText(
        JSON.stringify({
          __caesar__: true,
          company,
          role,
          answers,
          coverLetter: coverLetter || '',
          cvBase64: cvData.base64,
          cvFilename: cvData.filename,
        })
      );
    } catch (e) {}
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

        {/* Active Single Job Autofill Progress Card */}
        {singleJobProgress && (
          <div className="pt-3 pb-1 shrink-0">
            <PipelineProgressCard
              title={
                singleJobProgress.status === 'completed'
                  ? 'AI Autofill Complete'
                  : singleJobProgress.status === 'cancelled'
                  ? 'AI Autofill Cancelled'
                  : singleJobProgress.status === 'failed'
                  ? 'AI Autofill Failed'
                  : 'Generating Tailored Answers with agy...'
              }
              status={singleJobProgress.status}
              elapsedSeconds={singleJobProgress.elapsed_seconds ?? singleJobProgress.elapsedSeconds ?? 0}
              percent={
                singleJobProgress.status === 'completed'
                  ? 100
                  : singleJobProgress.status === 'cancelled' || singleJobProgress.status === 'failed'
                  ? 100
                  : Math.min(95, Math.max(15, Math.round((singleJobProgress.elapsed_seconds || 1) * 6)))
              }
              badge="AI Autofill (agy)"
              tag={singleJobProgress.job_id ? `Job: ${singleJobProgress.job_id}` : 'Single Job'}
              currentTarget={singleJobProgress.current_target || singleJobProgress.currentTarget}
              detail={singleJobProgress.detail || 'Inspecting form HTML and drafting tailored answers with agy...'}
              onCancel={handleCancelJob}
            />
          </div>
        )}

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
            onClick={() => setActiveTab('extension')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'extension' || activeTab === 'bookmarklet'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>⚡ Chrome Extension & Autofill</span>
          </button>

          <button
            type="button"
            disabled={answers.length === 0 && !coverLetter && !loading}
            onClick={() => (answers.length > 0 || coverLetter || loading) && setActiveTab('answers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'answers'
                ? 'bg-indigo-600 text-white shadow-sm'
                : answers.length === 0 && !coverLetter && !loading
                ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed border border-slate-800/50'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
            title={
              answers.length === 0 && !coverLetter
                ? 'Click "Generate with agy" below to inspect form and unlock tailored answers'
                : 'View AI written fields'
            }
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Written Fields (agy)</span>
            {(answers.length > 0 || coverLetter) && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/30 text-indigo-200 ml-0.5">
                {answers.length + (coverLetter ? 1 : 0)}
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
                Inspecting form fields and grounding answers in your real Master CV achievements.
              </div>
            </div>
          ) : activeTab === 'answers' ? (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-950/50 to-slate-900 border border-indigo-500/30 text-slate-300 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <span>💡 Tailored Form Responses</span>
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/30">
                      Engine: agy
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Edit any answer below. Click <strong>Save Answers</strong> to persist changes to this job application.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    disabled={answers.length === 0 && !coverLetter}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-medium text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
                    title="Clear agy generation for this job with confirmation"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Clear AGY</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAnswers}
                    disabled={savingAnswers || (answers.length === 0 && !coverLetter)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all hover:scale-[1.02] disabled:opacity-50"
                    title="Save your changes to this job application"
                  >
                    {savingAnswers ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : savedAnswersSuccess ? (
                      <Check className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Save className="w-3.5 h-3.5 text-white" />
                    )}
                    <span>{savedAnswersSuccess ? 'Saved to Tracker!' : 'Save Answers'}</span>
                  </button>
                </div>
              </div>

              {/* Cover Letter Section (if field exists or generated) */}
              {(hasCoverLetter || coverLetter) && (
                <div className="p-3 bg-slate-950/70 border border-indigo-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-semibold text-white tracking-wide text-xs">
                        Tailored Cover Letter (agy)
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                        Form Field Detected
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(coverLetter || '');
                        setCopiedCoverLetter(true);
                        setTimeout(() => setCopiedCoverLetter(false), 2000);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[11px] shrink-0"
                      title="Copy cover letter"
                    >
                      {copiedCoverLetter ? (
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
                    rows={7}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-200 text-xs font-sans leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Type or edit your cover letter..."
                  />
                </div>
              )}

              {/* Dynamic Free-Text Questions */}
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

              {/* Empty state when form has no custom essay questions */}
              {answers.length === 0 && !coverLetter && (
                <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl space-y-2 bg-slate-950/40">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="text-xs font-semibold text-white">No Custom Essay Questions Found</div>
                  <div className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    This job application does not require essay questions or a cover letter. Candidate profile contact fields and Master CV PDF are ready for 1-click autofill.
                  </div>
                </div>
              )}
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
              {/* Primary: CaesarAI Chrome Extension (Zero-CSP) */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-indigo-950/30 to-slate-900 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-sm flex items-center gap-2">
                    <span className="text-emerald-400 text-base">⚡</span>
                    <span>CaesarAI Chrome Extension (Zero-CSP Guaranteed)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Recommended
                  </span>
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">
                  Bypasses 100% of Content Security Policy (CSP) and Mixed-Content restrictions on Greenhouse, Ashby, Lever, and Workday. Once loaded into Chrome, click the toolbar icon or press <kbd className="bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono text-[10px] border border-slate-700">Alt+Shift+C</kbd> on any application page to trigger live AI form resolution.
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <a
                    href="/api/autofill/extension.zip"
                    download="caesarai-autofill-extension.zip"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-950/40 text-xs transition-all hover:scale-[1.02]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Extension .ZIP</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('/home/amari/Desktop/CaesarAICareerOps/extension');
                      setCopiedExtensionPath(true);
                      setTimeout(() => setCopiedExtensionPath(false), 2500);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 text-xs transition-colors"
                  >
                    <Folder className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{copiedExtensionPath ? 'Path Copied!' : 'Copy Extension Folder Path'}</span>
                  </button>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1.5 text-[11px] text-slate-300">
                  <div className="font-semibold text-white text-xs">🚀 30-Second Chrome Installation:</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Open <code className="text-emerald-300 select-all">chrome://extensions</code> in a new tab.</li>
                    <li>Toggle <strong className="text-slate-200">Developer mode</strong> (switch in top-right corner) to ON.</li>
                    <li>Click <strong className="text-slate-200">Load unpacked</strong> and select the <code className="text-indigo-300 select-all">extension</code> folder.</li>
                  </ol>
                </div>
              </div>

              {/* Secondary: Bookmarklet Accordion */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                    <span>Alternative: Universal Bookmarklet</span>
                  </span>
                  <a
                    href={getBookmarkletHref()}
                    className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 font-semibold rounded-lg border border-indigo-500/30 text-[11px] cursor-grab active:cursor-grabbing"
                    title="Drag to Bookmarks Bar"
                  >
                    <span>⚡ Drag Bookmarklet</span>
                  </a>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Drag the button to your Bookmarks Bar. Note: Some strict job boards (e.g. Greenhouse) block bookmarklet network calls via CSP. Use the Chrome Extension above for guaranteed zero-block execution.
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
            {/* Automatic status indicator */}
            <div
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              title="Application status automatically set to 'Application in progress'"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Application in progress</span>
            </div>

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

        {/* Clear AGY Confirmation Dialog Overlay */}
        {showClearConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm rounded-2xl animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 text-center ring-1 ring-rose-500/20">
              <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">Clear AGY Generation?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This will permanently delete all AI-generated form answers and the tailored cover letter for{' '}
                  <strong className="text-white">{company || 'this role'}</strong> from your local database.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={clearingAgy}
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={clearingAgy}
                  onClick={handleConfirmClearAgy}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950/60 transition-all hover:scale-[1.02] disabled:opacity-50"
                >
                  {clearingAgy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{clearingAgy ? 'Clearing...' : 'Yes, Clear AGY'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
