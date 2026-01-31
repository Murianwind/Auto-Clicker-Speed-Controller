chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['autoResume'], (items) => {
    if (items.autoResume !== false) {
      chrome.storage.sync.set({ masterSwitch: true });
    }
  });
});