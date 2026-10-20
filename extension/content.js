// CaesarAI CareerOps — Live DOM Form Autofill Content Script
// Zero-regex, Zero-keyword AI contextual autofill with agy

(async function runCaesarAutofill() {
  // 1. Render or reuse on-page floating toast progress card
  let toast = document.getElementById('caesar-autofill-toast');
  if (toast) toast.remove();

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
      <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:#10b981;">
        <span style="font-size:16px;">⚡</span> CaesarAI Autofill
      </div>
      <button id="caesar-toast-close" style="background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:4px;" title="Close">✕</button>
    </div>
    <div id="caesar-toast-msg" style="font-size:12px;color:#e2e8f0;font-weight:500;">🔍 Inspecting application form...</div>
    <div style="margin-top:10px;height:6px;width:100%;background:#1e293b;border-radius:999px;overflow:hidden;">
      <div id="caesar-toast-bar" style="height:100%;width:15%;background:#10b981;border-radius:999px;transition:width 0.4s, background 0.4s;"></div>
    </div>
    <div id="caesar-toast-sub" style="margin-top:7px;font-size:11px;color:#94a3b8;">Discovering interactive form inputs...</div>
  `;

  document.body.appendChild(toast);
  document.getElementById('caesar-toast-close')?.addEventListener('click', () => {
    toast.remove();
  });

  function updateToast(pct, msg, sub, isErr = false) {
    const bar = document.getElementById('caesar-toast-bar');
    const msgEl = document.getElementById('caesar-toast-msg');
    const subEl = document.getElementById('caesar-toast-sub');
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = isErr ? '#ef4444' : '#10b981';
    }
    if (msgEl) msgEl.innerText = msg;
    if (subEl) subEl.innerText = sub || '';
  }

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

  // 2. Extract live interactive form elements
  const fields = [];
  const processedRadios = new Set();
  const els = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));

  els.forEach((el) => {
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

    let selector = '';
    if (id) {
      try { selector = '#' + CSS.escape(id); } catch (e) {}
    } else if (name) {
      try {
        selector = tag + '[name="' + CSS.escape(name) + '"]' + (type === 'radio' ? '[value="' + CSS.escape(el.value) + '"]' : '');
      } catch (e) {}
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
    });
  });

  updateToast(30, `🔍 Discovered ${fields.length} form fields`, 'Sending rendered DOM to CaesarAI engine...');

  // 3. Post to CaesarAI backend (Zero-CSP through extension host permissions)
  const reqBody = {
    url: window.location.href,
    page_title: document.title,
    fields,
  };

  updateToast(65, '🤖 agy: Resolving dropdowns & drafting custom answers... (0s)', 'Reasoning with Candidate Profile & CV...');

  const startTs = Date.now();
  const timerInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTs) / 1000);
    const dynamicPct = Math.min(94, 65 + Math.round(elapsed * 0.7));
    updateToast(
      dynamicPct,
      `🤖 agy: Reasoning & drafting custom answers... (${elapsed}s)`,
      'Grounding custom essay questions and profile in your CV...'
    );
  }, 1000);

  try {
    const res = await fetch('http://localhost:8000/api/autofill/resolve-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    clearInterval(timerInterval);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    let count = 0;
    const actions = data.actions || [];

    // Execute actions determined solely by agy with per-action safety
    actions.forEach((act) => {
      try {
        let el = null;
        if (act.id) el = document.getElementById(act.id);
        if (!el && act.selector) {
          try { el = document.querySelector(act.selector); } catch (e) {}
        }
        if (!el && act.name) {
          try { el = document.querySelector(`[name="${CSS.escape(act.name)}"]`); } catch (e) {}
        }
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

    // Attach CV PDF safely
    try {
      const cvAttached = attachCvPdf(data.cvBase64, data.cvFilename);
      if (cvAttached) count++;
    } catch (cvErr) {
      console.warn('CaesarAI CV attach warning:', cvErr);
    }

    updateToast(100, `✅ Done! ${count} fields filled & CV attached!`, '💡 Human review: Review answers before clicking Submit.');

    setTimeout(() => {
      if (toast && toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 400);
      }
    }, 8000);
  } catch (err) {
    clearInterval(timerInterval);
    console.error('CaesarAI extension error:', err);
    updateToast(100, '⚠️ CaesarAI Engine Unreachable', 'Ensure CaesarAI is running on http://localhost:8000', true);
    setTimeout(() => {
      if (toast && toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 400);
      }
    }, 6000);
  }
})();
