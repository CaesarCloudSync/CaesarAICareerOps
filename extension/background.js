// CaesarAI Background Service Worker
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'run_autofill') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content.js'],
        });

        // Check if answers already exist
        let action = 'caesar_queue_generation';
        try {
          const checkUrl = `http://localhost:8000/api/autofill/check-status?url=${encodeURIComponent(tab.url || '')}&title=${encodeURIComponent(tab.title || '')}`;
          const res = await fetch(checkUrl);
          if (res.ok) {
            const data = await res.json();
            if (data.has_generated || data.status === 'Application Generated') {
              action = 'caesar_instant_autofill';
            }
          }
        } catch (e) {
          console.warn('Status check failed, defaulting to queue:', e);
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: (act) => {
            if (act === 'caesar_queue_generation' && typeof window.__caesarQueue === 'function') {
              window.__caesarQueue();
            } else if (act === 'caesar_instant_autofill' && typeof window.__caesarInstant === 'function') {
              window.__caesarInstant();
            }
          },
          args: [action],
        });

        chrome.tabs.sendMessage(tab.id, { action });
      } catch (err) {
        console.error('Failed to trigger autofill via shortcut:', err);
      }
    }
  }
});
