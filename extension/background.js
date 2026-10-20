// CaesarAI Background Service Worker
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'run_autofill') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
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

        chrome.tabs.sendMessage(tab.id, { action });
      } catch (err) {
        console.error('Failed to trigger autofill via shortcut:', err);
      }
    }
  }
});
