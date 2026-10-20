document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const pageTitle = document.getElementById('pageTitle');
  const appStatusBadge = document.getElementById('appStatusBadge');
  const statusDetail = document.getElementById('statusDetail');
  const btnQueue = document.getElementById('btnQueue');
  const btnInstant = document.getElementById('btnInstant');
  const btnInstantSub = document.getElementById('btnInstantSub');

  let activeTab = null;
  let statusPollInterval = null;

  // 1. Detect current active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      activeTab = tabs[0];
      pageTitle.innerText = activeTab.title || activeTab.url || 'Active Tab';
    }
  } catch (e) {
    pageTitle.innerText = 'Unable to read active tab';
  }

  // Helper to ensure content script is injected across all frames (including cross-origin iframes)
  async function ensureContentScriptInjected(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content.js'],
      });
    } catch (err) {
      console.warn('Could not inject content script:', err);
    }
  }

  // Helper to dispatch actions to all frames simultaneously (handles embedded ATS iframes like Greenhouse inside Elastic)
  async function dispatchActionToTab(tabId, actionName) {
    await ensureContentScriptInjected(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (act) => {
          if (act === 'caesar_queue_generation') {
            if (typeof window.__caesarQueue === 'function') {
              window.__caesarQueue();
            }
          } else if (act === 'caesar_instant_autofill') {
            if (typeof window.__caesarInstant === 'function') {
              window.__caesarInstant();
            }
          }
        },
        args: [actionName],
      });
    } catch (e) {
      console.warn('executeScript dispatch fallback:', e);
    }

    try {
      chrome.tabs.sendMessage(tabId, { action: actionName }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (e) {}
  }

  // 2. Check CaesarAI server health & tab application status
  async function refreshStatus() {
    try {
      const healthRes = await fetch('http://localhost:8000/api/health');
      if (!healthRes.ok) throw new Error('Offline');

      statusBadge.className = 'status-badge status-online';
      statusDot.className = 'dot dot-online';
      statusText.innerText = 'Engine Online';

      if (!activeTab || !activeTab.url) return;

      const checkUrl = `http://localhost:8000/api/autofill/check-status?url=${encodeURIComponent(activeTab.url)}&title=${encodeURIComponent(activeTab.title || '')}`;
      const statusRes = await fetch(checkUrl);
      if (!statusRes.ok) return;

      const info = await statusRes.json();

      if (info.status === 'Application Generated' || info.has_generated) {
        appStatusBadge.className = 'app-status-tag app-status-generated';
        appStatusBadge.innerText = 'Application Generated';
        statusDetail.innerText = `Ready: ${info.actions_count || 'Tailored'} actions & answers generated`;
        
        btnQueue.removeAttribute('disabled');
        btnQueue.querySelector('.btn-main').innerHTML = '<span>⚡</span> 1. Re-Queue AI Generation';
        btnQueue.querySelector('.btn-sub').innerText = 'Re-scrape & regenerate if form changed';

        btnInstant.removeAttribute('disabled');
        btnInstant.classList.add('highlight');
        btnInstantSub.innerText = '⚡ 0s instant fill: fields + CV attached';

        if (statusPollInterval) clearInterval(statusPollInterval);
      } else if (info.status === 'Generating Application with agy' || info.status === 'Application in progress') {
        appStatusBadge.className = 'app-status-tag app-status-progress';
        appStatusBadge.innerText = 'Generating (agy)';
        statusDetail.innerText = 'AI reasoning running in background (medium effort). Track on dashboard.';

        btnQueue.removeAttribute('disabled');
        btnQueue.querySelector('.btn-main').innerHTML = '<span>⏳</span> AI Generating in Background...';
        btnQueue.querySelector('.btn-sub').innerText = 'Background job running; navigate away anytime';

        btnInstant.setAttribute('disabled', 'true');
        btnInstant.classList.remove('highlight');
        btnInstantSub.innerText = 'Waiting for generation to finish...';
      } else if (info.status === 'Applied') {
        appStatusBadge.className = 'app-status-tag app-status-applied';
        appStatusBadge.innerText = 'Applied';
        statusDetail.innerText = 'Application previously marked as Applied';

        btnQueue.removeAttribute('disabled');
        btnInstant.removeAttribute('disabled');
      } else {
        // Not queued yet
        appStatusBadge.className = 'app-status-tag app-status-ready';
        appStatusBadge.innerText = 'Ready to Queue';
        statusDetail.innerText = 'Scrape DOM and dispatch background agy job';

        btnQueue.removeAttribute('disabled');
        btnQueue.querySelector('.btn-main').innerHTML = '<span>⚡</span> 1. Queue AI Generation (agy)';
        btnQueue.querySelector('.btn-sub').innerText = 'Scrapes live form & runs reasoning in background';

        btnInstant.setAttribute('disabled', 'true');
        btnInstant.classList.remove('highlight');
        btnInstantSub.innerText = 'Queue AI generation first';
      }
    } catch (err) {
      statusBadge.className = 'status-badge status-offline';
      statusDot.className = 'dot dot-offline';
      statusText.innerText = 'Server Offline';
      statusDetail.innerText = 'Ensure CaesarAI is running at http://localhost:8000';
      btnQueue.setAttribute('disabled', 'true');
      btnInstant.setAttribute('disabled', 'true');
    }
  }

  await refreshStatus();
  statusPollInterval = setInterval(refreshStatus, 2500);

  // 3. Button 1: Queue AI Generation
  btnQueue.addEventListener('click', async () => {
    if (!activeTab || !activeTab.id) return;
    btnQueue.setAttribute('disabled', 'true');
    btnQueue.querySelector('.btn-main').innerHTML = '<span>⏳</span> Sending DOM to agy...';

    try {
      await dispatchActionToTab(activeTab.id, 'caesar_queue_generation');
      btnQueue.querySelector('.btn-main').innerHTML = '<span>✅</span> Queued in Background!';
      btnQueue.querySelector('.btn-sub').innerText = 'Reasoning in progress. Check dashboard.';
      appStatusBadge.className = 'app-status-tag app-status-progress';
      appStatusBadge.innerText = 'In Progress (agy)';
      statusDetail.innerText = 'Background job running! You can navigate away.';
      setTimeout(() => {
        window.close();
      }, 1200);
    } catch (err) {
      console.error('Failed to queue generation:', err);
      alert(`Error queueing autofill: ${err.message}`);
      btnQueue.removeAttribute('disabled');
    }
  });

  // 4. Button 2: Instant Autofill Application
  btnInstant.addEventListener('click', async () => {
    if (!activeTab || !activeTab.id) return;
    btnInstant.setAttribute('disabled', 'true');
    btnInstant.querySelector('.btn-main').innerHTML = '<span>🎯</span> Injecting into Form...';

    try {
      await dispatchActionToTab(activeTab.id, 'caesar_instant_autofill');
      btnInstant.querySelector('.btn-main').innerHTML = '<span>✅</span> Injected Successfully!';
      btnInstantSub.innerText = 'Fields filled & CV PDF attached';
      setTimeout(() => {
        window.close();
      }, 800);
    } catch (err) {
      console.error('Failed to execute instant autofill:', err);
      alert(`Error applying saved autofill: ${err.message}`);
      btnInstant.removeAttribute('disabled');
    }
  });
});
