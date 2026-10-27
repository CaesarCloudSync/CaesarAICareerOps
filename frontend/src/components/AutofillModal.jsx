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
  Zap,
} from 'lucide-react';
import PipelineProgressCard from './PipelineProgressCard';

export const EXTRACT_BOOKMARKLET_RAW = `(function() {
  try {
    const container = document.querySelector('form') || document.querySelector('main, [role="main"], #app, #root') || document.body;
    const clone = container.cloneNode(true);
    clone.querySelectorAll('script, style, svg, noscript, iframe, link, meta, img, .iti__country-list').forEach(el => el.remove());
    let cleanHtml = clone.innerHTML.trim();

    const payload = JSON.stringify({
      __CAESAR_HTML_DUMP__: true,
      url: window.location.href,
      title: document.title,
      html: cleanHtml
    });

    function showToast(title, msg) {
      const old = document.getElementById('caesar-extract-toast');
      if (old) old.remove();
      const toast = document.createElement('div');
      toast.id = 'caesar-extract-toast';
      toast.style.cssText = 'position:fixed!important;top:24px!important;right:24px!important;z-index:2147483647!important;background:#0f172a!important;color:#f8fafc!important;border:2px solid #10b981!important;border-radius:12px!important;padding:14px 18px!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;font-size:13px!important;box-shadow:0 20px 40px rgba(0,0,0,0.6)!important;display:flex!important;flex-direction:column!important;gap:6px!important;max-width:350px!important;box-sizing:border-box!important;line-height:1.4!important;';
      toast.innerHTML = '<div style="font-weight:700!important;color:#10b981!important;font-size:14px!important;display:block!important;margin:0!important;padding:0!important;line-height:1.3!important;">' + title + '</div><div style="color:#cbd5e1!important;font-size:12px!important;display:block!important;margin:0!important;padding:0!important;line-height:1.4!important;">' + msg + '</div>';
      document.body.appendChild(toast);
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(() => {
        showToast('📋 1️⃣ Form Questions Copied!', 'Switch to CaesarAI & click <b>"✨ Prepare Answers"</b>.');
      }).catch(() => fallbackCopy(payload));
    } else {
      fallbackCopy(payload);
    }

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('📋 1️⃣ Form Questions Copied!', 'Switch to CaesarAI & click <b>"✨ Prepare Answers"</b>.');
    }
  } catch(err) {
    alert('CaesarAI Extract Error: ' + err.message);
  }
})();`;

export const EXTRACT_BOOKMARKLET_HREF = 'javascript:' + encodeURIComponent(EXTRACT_BOOKMARKLET_RAW);

export const FILL_BOOKMARKLET_RAW = `(async function() {
  try {
    let clip = '';
    try {
      clip = (await navigator.clipboard.readText()) || '';
    } catch(e) {
      if (e && e.name === 'NotAllowedError') {
        const manual = prompt('⚡ CaesarAI: Clipboard read permission was blocked.\\n\\nPaste the prepared data here (Ctrl+V):');
        if (manual) clip = manual;
      }
    }

    if (!clip || !clip.trim()) {
      alert('⚠️ CaesarAI: Clipboard is empty! In CaesarAI, click "Prepare Answers" or "Copy to Clipboard" first, then click ⚡ 2️⃣ CaesarAI Fill.');
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(clip);
    } catch(e) {
      alert('⚠️ CaesarAI: Clipboard does not contain valid CaesarAI data. Click "Copy to Clipboard" in CaesarAI first.');
      return;
    }

    if (!payload) return;

    function setVal(el, val) {
      if (!el || val === undefined || val === null) return;
      try {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const type = (el.type || '').toLowerCase();
        if (tag === 'input' && (type === 'file' || type === 'submit' || type === 'button' || type === 'image' || type === 'reset')) return;
        el.focus();
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) { setter.call(el, val); } else { el.value = val; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      } catch(e) {
        console.warn('Field fill warning:', e);
      }
    }

    let filledCount = 0;
    const profile = payload.profile || {};
    const answers = payload.answers || [];
    const coverLetter = payload.cover_letter || payload.coverLetter || '';
    const cv = payload.cv || {};
    const fields = payload.fields || payload.actions || [];

    // 1. Fill exact fields if specified in payload
    if (Array.isArray(fields) && fields.length > 0) {
      fields.forEach(f => {
        if (!f) return;
        try {
          let el = null;
          if (f.selector) {
            try { el = document.querySelector(f.selector); } catch(e) {}
          }
          if (!el && f.id) el = document.getElementById(f.id);
          if (!el && f.id) {
            try { el = document.querySelector('[data-ui="' + CSS.escape(f.id) + '"]'); } catch(e) {}
          }
          if (!el && f.name) {
            try { el = document.querySelector('[name="' + CSS.escape(f.name) + '"]'); } catch(e) {}
          }
          if (!el && f.id) {
            try { el = document.querySelector('[aria-labelledby*="' + CSS.escape(f.id) + '"]'); } catch(e) {}
          }

          if (!el) return;
          const elType = (el.type || '').toLowerCase();
          const role = (el.getAttribute?.('role') || '').toLowerCase();
          const tag = (el.tagName || '').toLowerCase();

          if (elType === 'file') return;

          // Radio handling
          if (f.type === 'radio' || elType === 'radio' || role === 'radio' || role === 'radiogroup' || tag === 'fieldset') {
            let targetRadio = el;
            if (role === 'radiogroup' || tag === 'fieldset' || el.children.length > 0) {
              const valStr = String(f.value || '').toLowerCase();
              const subRadios = el.querySelectorAll('input[type="radio"], [role="radio"]');
              subRadios.forEach(r => {
                const rVal = String(r.value || r.getAttribute('value') || '').toLowerCase();
                const rText = (r.closest('label, div')?.textContent || '').toLowerCase().trim();
                if (rVal === valStr || rText === valStr || (valStr === 'false' && rText.includes('no')) || (valStr === 'true' && rText.includes('yes'))) {
                  targetRadio = r;
                }
              });
            }
            if (targetRadio.tagName === 'INPUT' && targetRadio.type === 'radio') {
              targetRadio.checked = true;
              targetRadio.dispatchEvent(new Event('input', { bubbles: true }));
              targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
            }
            targetRadio.click();
            const rWrap = targetRadio.closest('label, [role="radio"]');
            if (rWrap && rWrap !== targetRadio) rWrap.click();
            filledCount++;
          }
          // Checkbox handling
          else if (f.type === 'checkbox' || elType === 'checkbox' || role === 'checkbox') {
            const shouldCheck = f.value === undefined || f.value === true || String(f.value).toLowerCase() === 'true' || String(f.value).toLowerCase() === 'yes';
            if (el.tagName === 'INPUT' && el.type === 'checkbox') {
              el.checked = shouldCheck;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            el.click();
            const chkWrap = el.closest('label, [role="checkbox"]');
            if (chkWrap && chkWrap !== el) chkWrap.click();
            filledCount++;
          }
          // Dropdown / Combobox handling
          else if (f.type === 'select' || tag === 'select' || role === 'combobox') {
            if (tag === 'select') {
              const valStr = String(f.value || '').toLowerCase();
              for (let i = 0; i < el.options.length; i++) {
                const opt = el.options[i];
                if (opt.value.toLowerCase() === valStr || opt.text.trim().toLowerCase() === valStr) {
                  el.selectedIndex = i;
                  opt.selected = true;
                  break;
                }
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              setVal(el, f.value);
              const hidden = (f.name ? document.querySelector('input[type="hidden"][name="' + CSS.escape(f.name) + '"], input.styles--3eBMS[name="' + CSS.escape(f.name) + '"]') : null) ||
                             (f.id ? document.querySelector('input[type="hidden"][name*="' + CSS.escape(f.id) + '"]') : null);
              if (hidden) setVal(hidden, f.value);
            }
            filledCount++;
          }
          // Standard text / textarea
          else if (f.value !== undefined) {
            setVal(el, f.value);
            filledCount++;
          }
        } catch(e) {}
      });
    }

    // 2. Fill standard profile fields
    document.querySelectorAll('input, textarea').forEach(el => {
      const type = (el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') return;
      const key = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();

      if (key.includes('first') && key.includes('name') && profile.firstName) {
        setVal(el, profile.firstName); filledCount++;
      } else if (key.includes('last') && key.includes('name') && profile.lastName) {
        setVal(el, profile.lastName); filledCount++;
      } else if ((key.includes('full') && key.includes('name') || key === 'name' || key.includes('candidate_name')) && profile.fullName) {
        setVal(el, profile.fullName); filledCount++;
      } else if (key.includes('email') && profile.email) {
        setVal(el, profile.email); filledCount++;
      } else if ((key.includes('phone') || key.includes('mobile')) && profile.phone) {
        setVal(el, profile.phone); filledCount++;
      } else if (key.includes('linkedin') && profile.linkedin) {
        setVal(el, profile.linkedin); filledCount++;
      } else if (key.includes('github') && profile.github) {
        setVal(el, profile.github); filledCount++;
      } else if ((key.includes('portfolio') || key.includes('website')) && profile.portfolio) {
        setVal(el, profile.portfolio); filledCount++;
      } else if ((key.includes('location') || key.includes('city') || key.includes('address')) && profile.location) {
        setVal(el, profile.location); filledCount++;
      } else if (key.includes('cover') && key.includes('letter') && coverLetter) {
        setVal(el, coverLetter); filledCount++;
      }
    });

    // 3. Fill custom essay / screening questions
    if (Array.isArray(answers)) {
      answers.forEach(item => {
        if (!item || !item.answer) return;
        let target = null;
        if (item.selector) {
          try { target = document.querySelector(item.selector); } catch(e) {}
        }
        if (!target && item.field_id) target = document.getElementById(item.field_id);
        if (!target && item.field_id) {
          try { target = document.querySelector('[data-ui="' + CSS.escape(item.field_id) + '"]'); } catch(e) {}
        }
        if (!target && item.field_name) {
          try { target = document.querySelector('[name="' + CSS.escape(item.field_name) + '"]'); } catch(e) {}
        }
        if (!target && item.question) {
          const qText = item.question.toLowerCase().slice(0, 35);
          // Query leaf labels, headings, legends, spans with IDs ending in _label
          document.querySelectorAll('span[id*="label"], [role="heading"], label, legend, strong, p, h1, h2, h3, h4').forEach(lbl => {
            if (target) return;
            const txt = (lbl.textContent || '').toLowerCase();
            if (txt && txt.includes(qText)) {
              // Workable pattern: <span id="FIELDID_label"> links to element with id="FIELDID" or aria-labelledby="FIELDID_label"
              if (lbl.id && lbl.id.endsWith('_label')) {
                const pureId = lbl.id.replace(/_label$/, '');
                target = document.getElementById(pureId) || 
                         document.querySelector('[data-ui="' + CSS.escape(pureId) + '"]') ||
                         document.querySelector('[aria-labelledby="' + CSS.escape(lbl.id) + '"]');
              }
              if (!target) {
                const forId = lbl.getAttribute('for');
                if (forId) target = document.getElementById(forId);
              }
              if (!target) {
                const container = lbl.closest('.styles--3IYUq, [data-ui], fieldset, label, .field, .form-group, li');
                if (container) {
                  // Check if container has radio buttons matching answer
                  const radios = container.querySelectorAll('input[type="radio"], [role="radio"]');
                  if (radios.length > 0) {
                    const ansLower = String(item.answer).toLowerCase();
                    radios.forEach(r => {
                      if (target) return;
                      const rVal = String(r.value || r.getAttribute('value') || '').toLowerCase();
                      const rTxt = (r.closest('label, div')?.textContent || '').toLowerCase().trim();
                      if (rVal === ansLower || rTxt === ansLower || (ansLower.includes('no') && (rVal === 'false' || rTxt.includes('no'))) || (ansLower.includes('yes') && (rVal === 'true' || rTxt.includes('yes')))) {
                        target = r;
                      }
                    });
                  }
                  if (!target) {
                    target = container.querySelector('textarea, input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="image"])');
                  }
                }
              }
            }
          });
        }
        if (target) {
          const tType = (target.type || '').toLowerCase();
          const tRole = (target.getAttribute?.('role') || '').toLowerCase();
          if (tType === 'radio' || tRole === 'radio') {
            if (target.tagName === 'INPUT') {
              target.checked = true;
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
            target.click();
            const rW = target.closest('label, [role="radio"]');
            if (rW && rW !== target) rW.click();
            filledCount++;
          } else if (tType !== 'file') {
            setVal(target, item.answer);
            filledCount++;
          }
        }
      });
    }

    // 4. Attach CV PDF (Zero-CSP native File creation)
    if (cv && cv.base64) {
      try {
        const fileInp = document.querySelector('input[type="file"][data-ui="resume"], input[type="file"][accept*="pdf"], input[type="file"][id*="resume" i], input[type="file"][name*="resume" i], input[type="file"]:not([data-ui="avatar"]):not([accept*="image"])') || document.querySelector('input[type="file"]');
        if (fileInp) {
          const bytes = Uint8Array.from(atob(cv.base64), c => c.charCodeAt(0));
          const file = new File([bytes], cv.filename || 'Bob_Hillus_CV.pdf', { type: 'application/pdf' });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInp.files = dt.files;
          fileInp.dispatchEvent(new Event('input', { bubbles: true }));
          fileInp.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      } catch(e) {
        console.warn('PDF attach notice:', e);
      }
    }

    // 5. Floating Toast Notification on Page
    const oldToast = document.getElementById('caesar-fill-toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.id = 'caesar-fill-toast';
    toast.style.cssText = 'position:fixed!important;top:24px!important;right:24px!important;z-index:2147483647!important;background:#0f172a!important;color:#f8fafc!important;border:2px solid #10b981!important;border-radius:12px!important;padding:14px 18px!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;font-size:13px!important;box-shadow:0 20px 40px rgba(0,0,0,0.7)!important;display:flex!important;flex-direction:column!important;gap:6px!important;max-width:360px!important;box-sizing:border-box!important;line-height:1.4!important;';
    toast.innerHTML = '<div style="font-weight:700!important;color:#10b981!important;font-size:14px!important;line-height:1.3!important;margin:0!important;display:block!important;">⚡ CaesarAI: Autofill Complete!</div><div style="color:#cbd5e1!important;font-size:12px!important;line-height:1.4!important;margin:0!important;display:block!important;">Filled ' + filledCount + ' fields & attached CV.<br><b style="color:#94a3b8;">Review your answers before clicking submit.</b></div>';
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
  } catch(err) {
    alert('CaesarAI Fill Error: ' + err.message);
  }
})();`;

export const FILL_BOOKMARKLET_HREF = 'javascript:' + encodeURIComponent(FILL_BOOKMARKLET_RAW);

export default function AutofillModal({
  isOpen,
  onClose,
  initialData = {},
  onApplicationCreated,
  onProgressUpdate,
}) {
  const [loading, setLoading] = useState(false);
  const [singleJobProgress, setSingleJobProgress] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [savedAnswersSuccess, setSavedAnswersSuccess] = useState(false);
  const [profile, setProfile] = useState({});
  const [actions, setActions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [coverLetter, setCoverLetter] = useState('');
  const [hasCoverLetter, setHasCoverLetter] = useState(false);
  const [copiedCoverLetter, setCopiedCoverLetter] = useState(false);
  const [cvData, setCvData] = useState({ filename: 'Bob_Hillus_CV.pdf', base64: '' });
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [copiedExtractCode, setCopiedExtractCode] = useState(false);
  const [copiedFillCode, setCopiedFillCode] = useState(false);
  const [compilingHtml, setCompilingHtml] = useState(false);
  const [compileSuccess, setCompileSuccess] = useState(null);
  const [compileError, setCompileError] = useState(null);
  const [manualHtml, setManualHtml] = useState('');
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');
  const [isCompiled, setIsCompiled] = useState(false);
  const [storedHtml, setStoredHtml] = useState('');
  const [showStoredHtml, setShowStoredHtml] = useState(false);
  const [activeTab, setActiveTab] = useState('bookmarklets'); // 'bookmarklets' | 'profile' | 'answers'
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingAgy, setClearingAgy] = useState(false);

  const company = initialData.company || '';
  const role = initialData.role || initialData.title || '';
  const url = initialData.url || '';

  // Initialize modal state on open:
  useEffect(() => {
    // 1. Reset all job-specific state immediately on open or job switch
    setIsCompiled(false);
    setGeneratedScript('');
    setActions([]);
    setAnswers([]);
    setCoverLetter('');
    setHasCoverLetter(false);
    setStoredHtml('');
    setShowStoredHtml(false);
    setManualHtml('');
    setShowManualPaste(false);
    setSingleJobProgress(null);
    setActiveJobId(null);
    setCompileError(null);
    setCompileSuccess(null);
    setLoading(false);
    setCompilingHtml(false);

    if (!isOpen) return;

    let isSubscribed = true;

    // Fetch candidate CV base64 for reliable zero-CSP upload
    fetch('/api/autofill/cv-base64')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isSubscribed && data && data.base64) {
          setCvData(data);
        }
      })
      .catch((err) => console.error('Failed to load CV base64:', err));

    // If initialData already has answers or cover letter, parse and use them
    let preAnswers = initialData.answers;
    let preActions = initialData.actions;
    let preScript = initialData.script;
    let preCoverLetter = initialData.cover_letter;

    if (typeof preAnswers === 'string') {
      try {
        const parsed = JSON.parse(preAnswers);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed)) {
            preAnswers = parsed;
          } else {
            preAnswers = parsed.answers || [];
            preActions = preActions || parsed.actions || parsed.fields || [];
            preScript = preScript || parsed.script || '';
            preCoverLetter = preCoverLetter || parsed.cover_letter || '';
          }
        }
      } catch (e) {}
    }

    if (preCoverLetter) {
      setCoverLetter(preCoverLetter);
      setHasCoverLetter(true);
    }
    if (preScript) {
      setGeneratedScript(preScript);
      setIsCompiled(true);
    }
    if (preActions && preActions.length > 0) {
      setActions(preActions);
    }

    if (preAnswers && Array.isArray(preAnswers) && preAnswers.length > 0) {
      setAnswers(preAnswers);
      setProfile(initialData.profile || {});
      setIsCompiled(true);
    }

    // Check for previously saved answers, script, and raw HTML snapshot in database for this specific job
    fetch(
      `/api/autofill/saved-answers?company=${encodeURIComponent(company)}&role=${encodeURIComponent(
        role
      )}&url=${encodeURIComponent(url)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isSubscribed) return;
        if (data && data.found) {
          if (data.actions && data.actions.length > 0) {
            setActions(data.actions);
          }
          if (data.answers && data.answers.length > 0) {
            setAnswers(data.answers);
            setIsCompiled(true);
          }
          if (data.cover_letter) {
            setCoverLetter(data.cover_letter);
            setHasCoverLetter(true);
          }
          if (data.script) {
            setGeneratedScript(data.script);
            setIsCompiled(true);
          }
          if (data.raw_html) {
            setStoredHtml(data.raw_html);
          }
        }
      })
      .catch(() => {});

    // Check candidate profile immediately
    if (initialData.profile && Object.keys(initialData.profile).length > 0) {
      setProfile(initialData.profile);
    } else {
      fetch('/api/autofill/candidate')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isSubscribed && data?.profile) setProfile(data.profile);
        })
        .catch((err) => console.error('Failed to load candidate profile:', err));
    }

    // Check if there is already an active or queued compilation job for this specific company / role
    fetch('/api/autofill/jobs/active')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isSubscribed || !data || !data.jobs) return;
        const comp = (company || '').toLowerCase();
        const matchingJob = data.jobs.find((j) => {
          if (j.status !== 'running' && j.status !== 'queued') return false;
          const target = (j.current_target || j.target || '').toLowerCase();
          return comp && target.includes(comp);
        });
        if (matchingJob) {
          setActiveJobId(matchingJob.job_id);
          setSingleJobProgress(matchingJob);
        }
      })
      .catch(() => {});

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, initialData, company, role, url]);

  // Poll live progress of async autofill / compilation job
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
            if (!isCancelled) {
              setIsCompiled(true);
              onApplicationCreated?.();
            }

            // Immediately extract results directly from the completed job
            const completedResult = job.results && job.results.length > 0 ? job.results[job.results.length - 1] : null;
            const targetCompany = completedResult?.company || company;
            const targetRole = completedResult?.role || role;
            const targetUrl = completedResult?.url || url;
            const resolvedActions = completedResult?.actions || [];
            const resolvedAnswers = completedResult?.answers || [];
            const resolvedCoverLetter = completedResult?.cover_letter || '';
            const resolvedScript = completedResult?.script || '';
            const resolvedHtml = completedResult?.raw_html || '';

            if (resolvedActions.length > 0) setActions(resolvedActions);
            if (resolvedAnswers.length > 0) setAnswers(resolvedAnswers);
            if (resolvedCoverLetter) {
              setCoverLetter(resolvedCoverLetter);
              setHasCoverLetter(true);
            }
            if (resolvedScript) setGeneratedScript(resolvedScript);
            if (resolvedHtml) setStoredHtml(resolvedHtml);

            // Automatically put static data payload onto clipboard (Zero-CSP)
            const payloadToCopy = completedResult?.payload || {
              __CAESAR_AUTOFILL_PAYLOAD__: true,
              company: targetCompany,
              role: targetRole,
              profile: profile || {},
              actions: resolvedActions,
              fields: resolvedActions,
              answers: resolvedAnswers,
              cover_letter: resolvedCoverLetter,
              cv: {
                filename: cvData?.filename || 'Bob_Hillus_CV.pdf',
                base64: cvData?.base64 || '',
              },
            };

            try {
              navigator.clipboard.writeText(JSON.stringify(payloadToCopy));
              setCopiedScript(true);
              setTimeout(() => setCopiedScript(false), 3000);
            } catch (e) {}

            // Also refresh saved-answers in background using the detected company/role/url
            fetch(`/api/autofill/saved-answers?company=${encodeURIComponent(targetCompany)}&role=${encodeURIComponent(targetRole)}&url=${encodeURIComponent(targetUrl)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((saved) => {
                if (isCancelled || !saved || !saved.found) return;
                if (saved.actions && saved.actions.length > 0) setActions(saved.actions);
                if (saved.answers && saved.answers.length > 0) setAnswers(saved.answers);
                if (saved.cover_letter) {
                  setCoverLetter(saved.cover_letter);
                  setHasCoverLetter(true);
                }
                if (saved.script) setGeneratedScript(saved.script);
                if (saved.raw_html) setStoredHtml(saved.raw_html);
              })
              .catch(() => {});

            if (!isCancelled) {
              setCompileSuccess(
                `✅ Application prepared! Answers copied to clipboard — switch to the job tab and click ⚡ 2️⃣ CaesarAI Fill!`
              );
            }

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

  // Launch async autofill job
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

  // Compile Form HTML from Clipboard via agy (Asynchronous FIFO Queue)
  const handleCompileFromClipboard = async (customHtml = null) => {
    setCompilingHtml(true);
    setCompileError(null);
    setCompileSuccess(null);
    try {
      let htmlText = customHtml || manualHtml;
      let postUrl = url;
      let postCompany = company;
      let postRole = role;
      let postTitle = '';

      if (!htmlText) {
        try {
          const clip = await navigator.clipboard.readText();
          if (clip) {
            try {
              const parsed = JSON.parse(clip);
              if (parsed.__CAESAR_HTML_DUMP__) {
                htmlText = parsed.html || '';
                postUrl = parsed.url || postUrl;
                postTitle = parsed.title || '';
              } else {
                htmlText = clip;
              }
            } catch (e) {
              htmlText = clip;
            }
          }
        } catch (e) {
          console.warn('Clipboard read error:', e);
        }
      }

      if (!htmlText || !htmlText.trim()) {
        setShowManualPaste(true);
        throw new Error(
          'Clipboard is empty or does not contain HTML. On the job page, click "📋 1️⃣ CaesarAI Extract" first, or paste the form HTML into the box below.'
        );
      }

      setStoredHtml(htmlText);

      // Submit to background compilation queue
      const res = await fetch('/api/autofill/compile-html-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: htmlText,
          url: postUrl || url,
          company: postCompany || company,
          role: postRole || role,
          page_title: postTitle,
          app_id: initialData?.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.job_id) {
        setActiveJobId(data.job_id);
        const initialJob = data.job || {
          job_id: data.job_id,
          status: data.status || 'running',
          total: 1,
          current_index: 1,
          current_target: `${company || 'Target Company'} — ${role || 'Role'}`,
          elapsed_seconds: 0,
          detail: data.status === 'queued'
            ? 'Queued: Waiting for previous compilation to complete...'
            : 'Analyzing HTML snapshot & drafting tailored answers with agy...',
        };
        setSingleJobProgress(initialJob);
        onProgressUpdate?.(initialJob);

        if (data.status === 'queued') {
          setCompileSuccess(
            `⏳ Added to queue! It will automatically start compiling as soon as the previous job finishes. You can move freely around the app.`
          );
        } else {
          setCompileSuccess(
            `🚀 Compilation started with agy! You can move freely around the app — progress is tracked at the top of the dashboard.`
          );
        }
      }
    } catch (err) {
      setCompileError(err.message);
    } finally {
      setCompilingHtml(false);
    }
  };

  // 1-Click Load compiled static payload into clipboard for ⚡ 2️⃣ CaesarAI Fill
  const handleLoadPayloadToClipboard = () => {
    let payloadActions = actions;
    let payloadAnswers = answers;
    let payloadCoverLetter = coverLetter;

    // Fallback to initialData if state hasn't updated yet
    if ((!payloadActions || payloadActions.length === 0) && initialData.answers) {
      try {
        const d = typeof initialData.answers === 'string' ? JSON.parse(initialData.answers) : initialData.answers;
        if (d && typeof d === 'object') {
          payloadActions = d.actions || d.fields || payloadActions;
          payloadAnswers = d.answers || payloadAnswers;
          payloadCoverLetter = d.cover_letter || payloadCoverLetter;
        }
      } catch (e) {}
    }

    const payload = JSON.stringify({
      __CAESAR_AUTOFILL_PAYLOAD__: true,
      company: company || '',
      role: role || '',
      profile: profile || {},
      actions: payloadActions || [],
      fields: payloadActions || [],
      answers: payloadAnswers || [],
      cover_letter: payloadCoverLetter || '',
      cv: {
        filename: cvData?.filename || 'Bob_Hillus_CV.pdf',
        base64: cvData?.base64 || '',
      },
    });
    navigator.clipboard.writeText(payload);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
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
      setGeneratedScript('');
      setIsCompiled(false);
      setStoredHtml('');
      setActiveTab('bookmarklets');
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

  // Build executable self-contained autofill script (Zero-CSP)
  const buildAutofillCode = () => {
    if (generatedScript) return generatedScript;

    return `(function(){
  try {
    function setVal(el, val) {
      if (!el || val === undefined || val === null) return;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) { setter.call(el, val); } else { el.value = val; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    const profile = ${JSON.stringify(profile)};
    const answers = ${JSON.stringify(answers || [])};
    const coverLetter = ${JSON.stringify(coverLetter || '')};
    const cvBase64 = ${JSON.stringify(cvData.base64 || '')};
    const cvFilename = ${JSON.stringify(cvData.filename || 'Bob_Hillus_CV.pdf')};

    let filledCount = 0;

    // 1. Fill Profile Fields
    document.querySelectorAll('input, textarea').forEach(el => {
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'file') return;

      const key = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();

      if (key.includes('first') && key.includes('name') && profile.firstName) {
        setVal(el, profile.firstName); filledCount++;
      } else if (key.includes('last') && key.includes('name') && profile.lastName) {
        setVal(el, profile.lastName); filledCount++;
      } else if ((key.includes('full') && key.includes('name') || key === 'name' || key.includes('candidate_name')) && profile.fullName) {
        setVal(el, profile.fullName); filledCount++;
      } else if (key.includes('email') && profile.email) {
        setVal(el, profile.email); filledCount++;
      } else if ((key.includes('phone') || key.includes('mobile')) && profile.phone) {
        setVal(el, profile.phone); filledCount++;
      } else if (key.includes('linkedin') && profile.linkedin) {
        setVal(el, profile.linkedin); filledCount++;
      } else if (key.includes('github') && profile.github) {
        setVal(el, profile.github); filledCount++;
      } else if ((key.includes('portfolio') || key.includes('website')) && profile.portfolio) {
        setVal(el, profile.portfolio); filledCount++;
      } else if ((key.includes('location') || key.includes('city') || key.includes('address')) && profile.location) {
        setVal(el, profile.location); filledCount++;
      } else if ((key.includes('cover') && key.includes('letter')) && coverLetter) {
        setVal(el, coverLetter); filledCount++;
      }
    });

    // 2. Fill AI Answers
    answers.forEach(item => {
      if (!item.answer) return;
      let target = null;
      if (item.field_id) target = document.getElementById(item.field_id);
      if (!target && item.field_name) {
        try { target = document.querySelector('[name="' + CSS.escape(item.field_name) + '"]'); } catch(e) {}
      }
      if (!target && item.question) {
        const qText = item.question.toLowerCase().slice(0, 30);
        document.querySelectorAll('label, [class*="label" i], [class*="legend" i], [class*="title" i]').forEach(lbl => {
          if (target) return;
          if (lbl.innerText && lbl.innerText.toLowerCase().includes(qText)) {
            const forId = lbl.getAttribute('for');
            if (forId) target = document.getElementById(forId);
            if (!target) target = lbl.querySelector('input, textarea') || (lbl.parentElement && lbl.parentElement.querySelector('input, textarea'));
          }
        });
      }
      if (target) {
        setVal(target, item.answer);
        filledCount++;
      }
    });

    // 3. Attach CV PDF
    if (cvBase64) {
      try {
        const fileInp = document.querySelector('input[type="file"][data-ui="resume"], input[type="file"][accept*="pdf"], input[type="file"][id*="resume" i], input[type="file"][name*="resume" i], input[type="file"]:not([data-ui="avatar"]):not([accept*="image"])') || document.querySelector('input[type="file"]');
        if (fileInp && (!fileInp.files || fileInp.files.length === 0)) {
          const byteChars = atob(cvBase64);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
          const byteArray = new Uint8Array(byteNums);
          const file = new File([byteArray], cvFilename, { type: 'application/pdf' });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInp.files = dt.files;
          fileInp.dispatchEvent(new Event('input', { bubbles: true }));
          fileInp.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      } catch(e) {
        console.warn('PDF attach error:', e);
      }
    }

    // 4. Show Floating Toast on Page
    const oldToast = document.getElementById('caesar-fill-toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.id = 'caesar-fill-toast';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;background:#0f172a;color:#f8fafc;border:2px solid #10b981;border-radius:12px;padding:14px 18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;box-shadow:0 20px 40px rgba(0,0,0,0.6);line-height:1.4;max-width:350px;';
    toast.innerHTML = '<div style="font-weight:700;color:#10b981;font-size:14px;margin-bottom:4px;">⚡ CaesarAI: Autofill Complete!</div><div style="color:#cbd5e1;font-size:12px;">Populated ' + filledCount + ' fields & attached CV.<br><b style="color:#94a3b8;">Human-in-the-loop: Review answers before submitting.</b></div>';
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
  } catch(err) {
    alert('CaesarAI Error: ' + err.message);
  }
})();`;
  };

  const handleCopyExtractCode = () => {
    navigator.clipboard.writeText(EXTRACT_BOOKMARKLET_HREF);
    setCopiedExtractCode(true);
    setTimeout(() => setCopiedExtractCode(false), 2500);
  };

  const handleCopyFillCode = () => {
    navigator.clipboard.writeText(FILL_BOOKMARKLET_HREF);
    setCopiedFillCode(true);
    setTimeout(() => setCopiedFillCode(false), 2500);
  };

  const handleCopyScript = () => {
    handleLoadPayloadToClipboard();
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
      handleLoadPayloadToClipboard();
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
                  <span>Job Application Assistant</span>
                  {singleJobProgress?.status === 'queued' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1 animate-pulse">
                      <Clock className="w-3 h-3 text-amber-400" />
                      Queued
                    </span>
                  ) : singleJobProgress?.status === 'running' || compilingHtml ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold flex items-center gap-1 animate-pulse">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      Preparing Answers...
                    </span>
                  ) : isCompiled || (answers && answers.length > 0) || hasCoverLetter ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      Ready to Fill
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 border border-slate-700 text-slate-400 font-semibold">
                      Setup Ready
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

        {/* Active Single Job Autofill / Compilation Progress Card */}
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
                  : singleJobProgress.status === 'queued'
                  ? 'Queued Behind Active Compilation...'
                  : 'Compiling Form HTML & Drafting Answers with agy...'
              }
              status={singleJobProgress.status}
              elapsedSeconds={singleJobProgress.elapsed_seconds ?? singleJobProgress.elapsedSeconds ?? 0}
              percent={
                singleJobProgress.status === 'completed'
                  ? 100
                  : singleJobProgress.status === 'cancelled' || singleJobProgress.status === 'failed'
                  ? 100
                  : singleJobProgress.status === 'queued'
                  ? 5
                  : Math.min(95, Math.max(15, Math.round((singleJobProgress.elapsed_seconds || 1) * 6)))
              }
              badge="AI Compiler (agy)"
              tag={singleJobProgress.job_id ? `Job: ${singleJobProgress.job_id}` : 'Compile Job'}
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
            onClick={() => setActiveTab('bookmarklets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'bookmarklets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>⚡ Fill Guide</span>
          </button>

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
            <span>👤 Your Profile</span>
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
                ? 'Prepare the form to see your tailored answers'
                : 'View your tailored answers'
            }
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>✍️ Tailored Answers</span>
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
          ) : activeTab === 'bookmarklets' ? (
            <div className="space-y-4 p-1">
              {/* If Already Prepared: Clean 1-Click Fill Card */}
              {(isCompiled || generatedScript) && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/70 via-indigo-950/60 to-slate-900 border-2 border-emerald-500/60 shadow-xl shadow-emerald-950/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">✓</span>
                      <span className="font-bold text-white text-sm">Application Ready to Fill!</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {answers.length > 0 ? `${answers.length} custom answers ready` : 'Form prepared'}
                    </span>
                  </div>

                  <p className="text-slate-300 text-xs leading-relaxed">
                    Caesar has drafted answers tailored to your CV and prepared your form. To fill the application:
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handleLoadPayloadToClipboard}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all hover:scale-105 active:scale-95"
                    >
                      {copiedScript ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4 text-slate-950" />}
                      <span>{copiedScript ? '✓ Copied to Clipboard!' : '1. 📋 Copy Answers to Clipboard'}</span>
                    </button>

                    {url && (
                      <button
                        type="button"
                        onClick={handleLaunchJob}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md"
                      >
                        <span>2. 🌐 Open Job Page</span>
                        <ExternalLink className="w-3.5 h-3.5 text-indigo-200" />
                      </button>
                    )}

                    {answers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('answers')}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs transition-colors"
                      >
                        <span>Review Answers ({answers.length}) →</span>
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] text-emerald-300/90 pt-1 flex items-center gap-1.5">
                    <span>👉</span>
                    <span><strong>Final Step:</strong> On the job page, click <strong className="text-white underline">⚡ 2️⃣ CaesarAI Fill</strong> in your browser bookmarks bar!</span>
                  </div>

                  {/* Collapsible Stored HTML Inspector */}
                  {storedHtml && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setShowStoredHtml(!showStoredHtml)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                      >
                        <span>{showStoredHtml ? '▼ Hide saved form details' : '▶ View saved form details (Optional)'}</span>
                      </button>
                      {showStoredHtml && (
                        <div className="mt-2 space-y-1.5 animate-in fade-in">
                          <div className="flex justify-between items-center text-[10px] text-slate-500">
                            <span>Form structure saved for this job:</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(storedHtml);
                                alert('Form HTML copied to clipboard');
                              }}
                              className="text-indigo-400 hover:text-indigo-300"
                            >
                              Copy HTML
                            </button>
                          </div>
                          <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-[10px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap select-all">
                            {storedHtml}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Primary: Two Companion Bookmarklets */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-sm flex items-center gap-2">
                    <span className="text-amber-400 text-base">📌</span>
                    <span>Browser Setup (Do This Once)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    No Extension Needed
                  </span>
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">
                  Drag these two buttons up into your browser's <strong className="text-white">Bookmarks Bar</strong>. You will use them to read and fill any job application.
                </p>

                {/* The Two Draggable Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Button 1: Extract */}
                  <div className="p-3.5 bg-slate-900/90 border border-emerald-500/30 rounded-xl space-y-2.5 flex flex-col justify-between shadow-inner">
                    <div className="space-y-1">
                      <div className="text-[12px] font-bold text-emerald-400 flex items-center gap-1.5">
                        <span>📋 1️⃣ Read Job Form</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Click on any job page so CaesarAI can see the questions.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={EXTRACT_BOOKMARKLET_HREF}
                        draggable="true"
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', EXTRACT_BOOKMARKLET_HREF);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          handleCopyExtractCode();
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-950/50 cursor-grab active:cursor-grabbing border border-emerald-400/40 transition-all hover:scale-[1.02] select-none"
                        title="Drag this button to your Bookmarks Bar (or click to copy code)"
                      >
                        <Copy className="w-3.5 h-3.5 text-white" />
                        <span>📋 1️⃣ CaesarAI Extract</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleCopyExtractCode}
                        className="px-2.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-semibold transition-colors shrink-0"
                        title="Copy Extract Bookmarklet code"
                      >
                        {copiedExtractCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Button 2: Fill */}
                  <div className="p-3.5 bg-slate-900/90 border border-indigo-500/30 rounded-xl space-y-2.5 flex flex-col justify-between shadow-inner">
                    <div className="space-y-1">
                      <div className="text-[12px] font-bold text-indigo-400 flex items-center gap-1.5">
                        <span>⚡ 2️⃣ Fill Form & Attach CV</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Click on the job page to fill in the boxes and attach your CV PDF.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={FILL_BOOKMARKLET_HREF}
                        draggable="true"
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', FILL_BOOKMARKLET_HREF);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          handleCopyFillCode();
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-950/50 cursor-grab active:cursor-grabbing border border-indigo-400/40 transition-all hover:scale-[1.02] select-none"
                        title="Drag this button to your Bookmarks Bar (or click to copy code)"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                        <span>⚡ 2️⃣ CaesarAI Fill</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleCopyFillCode}
                        className="px-2.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-semibold transition-colors shrink-0"
                        title="Copy Fill Bookmarklet code"
                      >
                        {copiedFillCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 text-center pt-0.5">
                  💡 Don't see your bookmarks bar? Press <kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">Ctrl+Shift+B</kbd> (or <kbd className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">Cmd+Shift+B</kbd> on Mac).
                </div>

                {/* 3-Step Simple Instructions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1">
                      <span>1️⃣</span> <span>Read Form</span>
                    </div>
                    <p className="text-slate-400 leading-normal">
                      On the job page, click <strong className="text-slate-200">📋 1️⃣ CaesarAI Extract</strong> in your browser bar.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                    <div className="font-bold text-indigo-400 flex items-center gap-1">
                      <span>2️⃣</span> <span>Prepare Answers</span>
                    </div>
                    <p className="text-slate-400 leading-normal">
                      Click <strong className="text-slate-200">Prepare Answers</strong> below. CaesarAI drafts answers from your CV.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                    <div className="font-bold text-amber-400 flex items-center gap-1">
                      <span>3️⃣</span> <span>Fill & Submit</span>
                    </div>
                    <p className="text-slate-400 leading-normal">
                      Return to the job page and click <strong className="text-slate-200">⚡ 2️⃣ CaesarAI Fill</strong>. All fields are filled!
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Panel: Prepare Answers */}
              <div className="p-4 bg-slate-950/70 border border-indigo-500/30 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>{isCompiled ? 'Refresh Answers from Job Form' : 'Step 2: Prepare Answers for this Job'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Reads the form questions you extracted and writes tailored answers matching your real CV experience.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCompileFromClipboard()}
                    disabled={compilingHtml || singleJobProgress?.status === 'running' || singleJobProgress?.status === 'queued'}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-950/60 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                  >
                    {compilingHtml || singleJobProgress?.status === 'running' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-amber-300" />
                    )}
                    <span>
                      {singleJobProgress?.status === 'queued'
                        ? 'Queued in Background...'
                        : compilingHtml || singleJobProgress?.status === 'running'
                        ? 'Preparing Answers in Background...'
                        : isCompiled
                        ? '🔄 Re-write Answers'
                        : '✨ Prepare Answers & Form'}
                    </span>
                  </button>
                </div>

                {/* Compilation Status Notification */}
                {compileSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <div>{compileSuccess}</div>
                      {isCompiled && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveTab('answers')}
                            className="px-2.5 py-1 rounded bg-emerald-800/60 hover:bg-emerald-700/80 text-emerald-100 text-[11px] font-semibold transition-colors"
                          >
                            Review Your Answers →
                          </button>
                          <button
                            type="button"
                            onClick={handleLoadPayloadToClipboard}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                          >
                            {copiedScript ? 'Copied!' : 'Copy to Clipboard Again'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Compilation Error Notification */}
                {compileError && (
                  <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <div className="font-semibold text-rose-300">Notice:</div>
                      <div>{compileError}</div>
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowManualPaste(!showManualPaste)}
                          className="text-xs text-indigo-300 underline hover:text-indigo-200"
                        >
                          {showManualPaste ? 'Hide manual paste box' : 'Need to paste questions manually?'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual HTML Paste Option (Fallback) */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowManualPaste(!showManualPaste)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <span>{showManualPaste ? '▼ Hide manual paste' : '▶ Need to paste the form questions manually?'}</span>
                  </button>

                  {showManualPaste && (
                    <div className="mt-2.5 space-y-2 p-3 bg-slate-900 border border-slate-800 rounded-lg animate-in fade-in">
                      <div className="text-[11px] text-slate-400">
                        Paste the form HTML snippet copied from your browser:
                      </div>
                      <textarea
                        rows={4}
                        value={manualHtml}
                        onChange={(e) => setManualHtml(e.target.value)}
                        placeholder="<form>...</form>"
                        className="w-full p-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleCompileFromClipboard(manualHtml)}
                          disabled={compilingHtml || !manualHtml.trim()}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs disabled:opacity-50 transition-colors"
                        >
                          Prepare Pasted Form
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'answers' ? (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-950/50 to-slate-900 border border-indigo-500/30 text-slate-300 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <span>💡 Tailored Answers</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    You can edit any answer below. Click <strong>Save Answers</strong> when you're done.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    disabled={answers.length === 0 && !coverLetter}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-medium text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
                    title="Reset saved answers for this job"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Reset Answers</span>
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
                    <span>{savedAnswersSuccess ? 'Saved!' : 'Save Answers'}</span>
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
                        Tailored Cover Letter
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
          ) : (
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
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>🔒 You're always in control: Caesar fills the form for you, but you review and click Submit.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Copy Autofill Script */}
            <button
              type="button"
              onClick={handleLoadPayloadToClipboard}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Copy the prepared answers and CV to your clipboard"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedScript ? 'Copied to Clipboard!' : '📋 Copy to Clipboard'}</span>
            </button>

            {/* Launch Application Page */}
            {url && (
              <button
                type="button"
                onClick={handleLaunchJob}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>🌐 Open Job Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Clear Answers Confirmation Dialog Overlay */}
        {showClearConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm rounded-2xl animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 text-center ring-1 ring-rose-500/20">
              <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">Reset Form Answers?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This will remove the drafted answers and cover letter for{' '}
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
                  <span>{clearingAgy ? 'Resetting...' : 'Yes, Reset Answers'}</span>
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
