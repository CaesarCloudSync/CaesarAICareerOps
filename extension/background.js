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
      } catch (err) {
        console.error('Failed to trigger autofill via shortcut:', err);
      }
    }
  }
});
