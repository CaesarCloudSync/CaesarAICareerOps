document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const pageTitle = document.getElementById('pageTitle');
  const btnAutofill = document.getElementById('btnAutofill');

  // 1. Detect current active tab
  let activeTab = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      activeTab = tabs[0];
      pageTitle.innerText = activeTab.title || activeTab.url || 'Active Tab';
    }
  } catch (e) {
    pageTitle.innerText = 'Unable to read tab';
  }

  // 2. Check CaesarAI local server connectivity
  try {
    const res = await fetch('http://localhost:8000/api/health');
    if (res.ok) {
      statusBadge.className = 'status-badge status-online';
      statusDot.className = 'dot dot-online';
      statusText.innerText = 'Engine Online';
      btnAutofill.removeAttribute('disabled');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    statusBadge.className = 'status-badge status-offline';
    statusDot.className = 'dot dot-offline';
    statusText.innerText = 'Server Offline';
    btnAutofill.setAttribute('disabled', 'true');
  }

  // 3. Trigger content script execution on click
  btnAutofill.addEventListener('click', async () => {
    if (!activeTab || !activeTab.id) return;
    btnAutofill.setAttribute('disabled', 'true');
    btnAutofill.innerText = 'Executing agy Autofill...';

    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js'],
      });
      setTimeout(() => {
        window.close();
      }, 500);
    } catch (err) {
      console.error('Failed to inject autofill script:', err);
      alert(`Could not inject autofill script: ${err.message}`);
      btnAutofill.removeAttribute('disabled');
      btnAutofill.innerHTML = '<span>⚡</span> Auto-Fill Application (agy)';
    }
  });
});
