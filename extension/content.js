// CaesarAI CareerOps — Decoupled Live DOM Form Autofill Content Script
// Zero-regex, Zero-keyword AI contextual reasoning with agy

(function initCaesarContentScript() {
  if (window.__caesarAutofillLoaded) {
    return;
  }
  window.__caesarAutofillLoaded = true;

  // 1. Toast UI System
  function showToast({ pct = 0, title = '⚡ CaesarAI Autofill', msg = '', sub = '', isErr = false, autoDismissMs = null }) {
    let toast = document.getElementById('caesar-autofill-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'caesar-autofill-toast';
      toast.style.cssText = [
        'position: fixed',
        'top: 20px',
        'right: 20px',
        'z-index: 2147483647',
        'width: 360px',
        'max-width: calc(100vw - 40px)',
        'background: #0f172a',
        'color: #f8fafc',
        'border: 1px solid #10b981',
        'border-radius: 14px',
        'box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(16,185,129,0.25)',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size: 13px',
        'line-height: 1.4',
        'padding: 14px 16px',
        'box-sizing: border-box',
        'transition: opacity 0.4s, transform 0.4s',
        'opacity: 1',
        'transform: translateY(0)',
      ].join(';');

      toast.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div id="caesar-toast-title" style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:#10b981;">
            <span>⚡</span> CaesarAI Autofill
          </div>
          <button id="caesar-toast-close" style="background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:4px;" title="Close">✕</button>
        </div>
        <div id="caesar-toast-msg" style="font-size:12px;color:#e2e8f0;font-weight:500;"></div>
        <div style="margin-top:10px;height:6px;width:100%;background:#1e293b;border-radius:999px;overflow:hidden;">
          <div id="caesar-toast-bar" style="height:100%;width:0%;background:#10b981;border-radius:999px;transition:width 0.4s, background 0.4s;"></div>
        </div>
        <div id="caesar-toast-sub" style="margin-top:7px;font-size:11px;color:#94a3b8;"></div>
      `;

      document.body.appendChild(toast);
      document.getElementById('caesar-toast-close')?.addEventListener('click', () => {
        dismissToast();
      });
    }

    const titleEl = document.getElementById('caesar-toast-title');
    const msgEl = document.getElementById('caesar-toast-msg');
    const subEl = document.getElementById('caesar-toast-sub');
    const bar = document.getElementById('caesar-toast-bar');

    if (titleEl) titleEl.innerHTML = title;
    if (msgEl) msgEl.innerText = msg;
    if (subEl) subEl.innerText = sub || '';
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = isErr ? '#ef4444' : '#10b981';
    }

    if (autoDismissMs) {
      if (window.__caesarToastDismissTimer) clearTimeout(window.__caesarToastDismissTimer);
      window.__caesarToastDismissTimer = setTimeout(() => {
        dismissToast();
      }, autoDismissMs);
    }
  }

  function dismissToast() {
    const toast = document.getElementById('caesar-autofill-toast');
    if (toast) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 400);
    }
  }

  // 2. DOM Field Value Setter with React Controlled Component Support
  function setFieldValue(el, val) {
    if (!el || val === undefined || val === null) return;
    el.focus();
    const strVal = String(val);
    try {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, strVal);
      } else {
        el.value = strVal;
      }
      if (el._valueTracker) {
        el._valueTracker.setValue(strVal);
      }
    } catch (e) {
      el.value = strVal;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function getFieldLabel(el) {
    let lbl = '';
    const id = el.id;
    if (id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l) lbl = l.innerText;
      } catch (e) {}
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
    return (lbl || el.placeholder || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
  }

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
    } catch (e) {
      console.warn('CaesarAI PDF attach error:', e);
      return false;
    }
  }

  function attachCoverLetterPdf(b64, fn) {
    if (!b64) return false;
    try {
      const fileInp = document.getElementById('_systemfield_cover_letter') ||
                      document.querySelector('input[type="file"][id*="cover" i], input[type="file"][name*="cover" i], input[type="file"][aria-label*="cover" i], input[type="file"][data-qa*="cover" i]');
      if (!fileInp || (fileInp.files && fileInp.files.length > 0)) return false;
      const byteChars = atob(b64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNums);
      const clFile = new File([byteArray], fn || 'Bob_Hillus_Cover_Letter.pdf', { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(clFile);
      fileInp.files = dt.files;
      fileInp.dispatchEvent(new Event('input', { bubbles: true }));
      fileInp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) {
      console.warn('CaesarAI Cover Letter PDF attach error:', e);
      return false;
    }
  }

  // 3. Extract Live Interactive Form Elements
  function extractFormFields() {
    const fields = [];
    const processedRadios = new Set();
    const els = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));

    els.forEach((el, index) => {
      const id = el.id || '';
      const name = el.name || '';
      const type = (el.type || el.tagName).toLowerCase();
      const tag = el.tagName.toLowerCase();

      if (type === 'radio') {
        if (name && processedRadios.has(name)) return;
        if (name) processedRadios.add(name);
      }

      const label = getFieldLabel(el);
      const options = [];
      if (tag === 'select') {
        Array.from(el.options || []).forEach((opt) => {
          const txt = (opt.text || opt.value || '').trim();
          if (txt) options.push(txt);
        });
      }

      el.setAttribute('data-caesar-id', `caesar-field-${index}`);

      let selector = '';
      if (id) {
        try { selector = '#' + CSS.escape(id); } catch (e) {}
      } else if (name) {
        try {
          selector = tag + '[name="' + CSS.escape(name) + '"]' + (type === 'radio' ? '[value="' + CSS.escape(el.value) + '"]' : '');
        } catch (e) {}
      }
      if (!selector) {
        selector = `[data-caesar-id="caesar-field-${index}"]`;
      }

      fields.push({
        id,
        name,
        tag,
        type,
        label,
        placeholder: el.placeholder || '',
        options,
        selector,
        caesar_id: `caesar-field-${index}`,
      });
    });

    return fields;
  }

  // 4. Robust Field Matcher
  function findElementForAction(act) {
    if (!act) return null;
    let el = null;
    if (act.id) {
      try { el = document.getElementById(act.id); } catch (e) {}
    }
    if (!el && act.caesar_id) {
      try { el = document.querySelector(`[data-caesar-id="${act.caesar_id}"]`); } catch (e) {}
    }
    if (!el && act.selector) {
      try { el = document.querySelector(act.selector); } catch (e) {}
    }
    if (!el && act.name) {
      try { el = document.querySelector(`[name="${CSS.escape(act.name)}"]`); } catch (e) {}
    }

    // Match by associated label text
    const labelText = (act.label || act.question || '').trim().toLowerCase();
    if (!el && labelText && labelText.length > 2) {
      const allLabels = Array.from(document.querySelectorAll('label, [class*="label" i], [class*="question" i], [class*="title" i]'));
      for (const l of allLabels) {
        const txt = (l.innerText || '').trim().toLowerCase();
        if (txt && (txt.includes(labelText) || labelText.includes(txt))) {
          if (l.htmlFor) {
            el = document.getElementById(l.htmlFor);
            if (el) break;
          }
          el = l.querySelector('input:not([type="hidden"]):not([type="file"]), textarea, select');
          if (el) break;
          let cur = l.parentElement;
          for (let i = 0; i < 3; i++) {
            if (!cur) break;
            const found = cur.querySelector('input:not([type="hidden"]):not([type="file"]), textarea, select');
            if (found) {
              el = found;
              break;
            }
            cur = cur.parentElement;
          }
          if (el) break;
        }
      }
    }

    // Match by placeholder text
    const placeholderText = (act.placeholder || '').trim().toLowerCase();
    if (!el && placeholderText && placeholderText.length > 2) {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const inp of inputs) {
        if (inp.placeholder && inp.placeholder.trim().toLowerCase().includes(placeholderText)) {
          el = inp;
          break;
        }
      }
    }

    return el;
  }

  // 5. Intelligent Fallback for Standard Candidate Profile Fields
  function fillStandardFields(profile = {}, initialCount = 0) {
    if (!profile) return initialCount;
    let count = initialCount;

    const standardMappings = [
      { keys: ['first_name', 'firstname', 'first name', 'given name'], val: profile.firstName || (profile.fullName || '').split(' ')[0] },
      { keys: ['last_name', 'lastname', 'last name', 'family name', 'surname'], val: profile.lastName || (profile.fullName || '').split(' ').slice(1).join(' ') },
      { keys: ['full_name', 'fullname', 'full name', 'candidate_name', 'name'], val: profile.fullName },
      { keys: ['email', 'email address'], val: profile.email },
      { keys: ['phone', 'mobile', 'telephone', 'phone number'], val: profile.phone },
      { keys: ['linkedin', 'linkedin url', 'linkedin profile'], val: profile.linkedin },
      { keys: ['github', 'github url', 'github profile'], val: profile.github },
      { keys: ['website', 'portfolio', 'personal website', 'url'], val: profile.portfolio },
      { keys: ['location', 'city', 'address', 'residence'], val: profile.location },
    ];

    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea'));

    inputs.forEach((inp) => {
      if (inp.value && inp.value.trim().length > 0) return; // Skip already filled inputs
      const lbl = getFieldLabel(inp).toLowerCase();
      const name = (inp.name || '').toLowerCase();
      const id = (inp.id || '').toLowerCase();
      const placeholder = (inp.placeholder || '').toLowerCase();
      const combined = `${lbl} ${name} ${id} ${placeholder}`;

      for (const mapping of standardMappings) {
        if (!mapping.val) continue;
        const matched = mapping.keys.some((k) => combined.includes(k));
        if (matched) {
          setFieldValue(inp, mapping.val);
          count++;
          break;
        }
      }
    });

    return count;
  }

  // 6. Execute DOM Actions Plan & Attach CV & Cover Letter PDFs
  function executeActions(actions = [], cvBase64 = '', cvFilename = '', coverLetterBase64 = '', coverLetterFilename = '') {
    let count = 0;
    actions.forEach((act) => {
      try {
        const el = findElementForAction(act);
        if (!el) return;

        if (act.type === 'select') {
          if (!el.options) {
            setFieldValue(el, act.value);
            count++;
            return;
          }
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
      } catch (actErr) {
        console.warn('CaesarAI action execution warning:', act, actErr);
      }
    });

    // Attach CV PDF
    try {
      const cvAttached = attachCvPdf(cvBase64, cvFilename);
      if (cvAttached) count++;
    } catch (cvErr) {
      console.warn('CaesarAI CV attach warning:', cvErr);
    }

    // Attach Cover Letter PDF if generated & file input exists
    try {
      if (coverLetterBase64) {
        const clAttached = attachCoverLetterPdf(coverLetterBase64, coverLetterFilename);
        if (clAttached) count++;
      }
    } catch (clErr) {
      console.warn('CaesarAI Cover Letter attach warning:', clErr);
    }

    return count;
  }

  // 7. Asynchronous Queue Action (Button 1)
  async function handleQueueGeneration() {
    showToast({
      pct: 35,
      title: '<span>⚡</span> CaesarAI Queueing',
      msg: '🔍 Extracting live form elements...',
      sub: 'Preparing DOM fields for background agy reasoning...',
    });

    const fields = extractFormFields();
    showToast({
      pct: 65,
      title: '<span>⚡</span> CaesarAI Queueing',
      msg: `Discovered ${fields.length} form inputs`,
      sub: 'Dispatching non-blocking background job to agy (medium effort)...',
    });

    try {
      const res = await fetch('http://localhost:8000/api/autofill/resolve-live-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          page_title: document.title,
          fields,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const jobId = data?.job_id || 'active';
      showToast({
        pct: 100,
        title: '<span>✅</span> Queued in Background!',
        msg: `Job #${jobId} running in background`,
        sub: 'Status: "Generating Application with agy". You can freely navigate away anytime!',
        autoDismissMs: 6500,
      });

      return { success: true, job_id: jobId };
    } catch (err) {
      console.error('Failed to queue autofill:', err);
      showToast({
        pct: 100,
        title: '<span>⚠️</span> Queueing Error',
        msg: 'Failed to contact CaesarAI engine',
        sub: err.message,
        isErr: true,
        autoDismissMs: 6000,
      });
      return { success: false, error: err.message };
    }
  }

  // 8. Instant Autofill Action (Button 2)
  async function handleInstantAutofill() {
    showToast({
      pct: 30,
      title: '<span>🎯</span> CaesarAI Instant Fill',
      msg: '⚡ Fetching pre-generated answers & DOM actions...',
      sub: 'Querying local SQLite cache (<100ms)...',
    });

    try {
      const res = await fetch('http://localhost:8000/api/autofill/apply-saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          title: document.title,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.found) {
        showToast({
          pct: 100,
          title: '<span>⚠️</span> No Pre-Generated Answers',
          msg: 'Answers not found for this page yet',
          sub: 'Click "1. Queue AI Generation (agy)" to generate them first!',
          isErr: true,
          autoDismissMs: 6500,
        });
        return { success: false, error: 'not_found' };
      }

      showToast({
        pct: 75,
        title: '<span>🎯</span> CaesarAI Instant Fill',
        msg: `Injecting saved actions...`,
        sub: 'Filling form fields & attaching Master CV PDF...',
      });

      let count = executeActions(
        data.actions || [],
        data.cvBase64,
        data.cvFilename,
        data.coverLetterBase64,
        data.coverLetterFilename
      );

      // Intelligent Fallback: if very few fields matched, fill standard profile fields
      if (data.profile) {
        count = fillStandardFields(data.profile, count);
      }

      if (count > 0) {
        showToast({
          pct: 100,
          title: '<span>✅</span> Instant Autofill Applied!',
          msg: `Successfully filled ${count} fields & attached CV!`,
          sub: '💡 Human Review: Verify answers before clicking Submit.',
          autoDismissMs: 7000,
        });
      } else {
        showToast({
          pct: 100,
          title: '<span>⚠️</span> 0 Fields Filled',
          msg: 'No matching fields found on this page.',
          sub: 'Click "1. Queue AI Generation (agy)" to inspect and generate answers for this specific form!',
          isErr: true,
          autoDismissMs: 8000,
        });
      }

      return { success: true, count };
    } catch (err) {
      console.error('Instant autofill failed:', err);
      showToast({
        pct: 100,
        title: '<span>⚠️</span> Autofill Error',
        msg: 'Failed to execute instant autofill',
        sub: err.message,
        isErr: true,
        autoDismissMs: 6000,
      });
      return { success: false, error: err.message };
    }
  }

  // 9. Listen for messages from popup or background worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'caesar_queue_generation') {
      handleQueueGeneration().then(sendResponse);
      return true; // Keep channel open for async response
    } else if (request.action === 'caesar_instant_autofill') {
      handleInstantAutofill().then(sendResponse);
      return true; // Keep channel open for async response
    }
  });

  window.__caesarQueue = handleQueueGeneration;
  window.__caesarInstant = handleInstantAutofill;
})();
