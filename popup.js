const defaults = {
  masterSwitch: true,
  autoResume: true,
  keywords: "오프닝,줄거리,크레딧",
  allowedSites: [],
  plexNoSub: "1", 
  plexYesSub: "1"
};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(defaults, (items) => {
    document.getElementById('masterSwitch').checked = items.masterSwitch;
    document.getElementById('autoResume').checked = items.autoResume;
    document.getElementById('keywords').value = items.keywords;

    const speeds = ["0.5", "0.75", "1", "1.25", "1.5", "1.75", "2"];
    const noSubSelect = document.getElementById('plexNoSub');
    const yesSubSelect = document.getElementById('plexYesSub');
    
    speeds.forEach(s => {
      const label = s === "1" ? "보통" : `${s}x`;
      noSubSelect.add(new Option(label, s));
      yesSubSelect.add(new Option(label, s));
    });
    
    noSubSelect.value = items.plexNoSub;
    yesSubSelect.value = items.plexYesSub;
    renderSites(items.allowedSites);
  });
});

function saveAndRefresh() {
  const masterSwitch = document.getElementById('masterSwitch').checked;
  const autoResume = document.getElementById('autoResume').checked;
  const keywords = document.getElementById('keywords').value;
  const plexNoSub = document.getElementById('plexNoSub').value;
  const plexYesSub = document.getElementById('plexYesSub').value;

  chrome.storage.sync.set({ masterSwitch, autoResume, keywords, plexNoSub, plexYesSub }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    });
  });
}

document.getElementById('masterSwitch').addEventListener('change', saveAndRefresh);
document.getElementById('autoResume').addEventListener('change', saveAndRefresh);
document.getElementById('keywords').addEventListener('change', saveAndRefresh);
document.getElementById('plexNoSub').addEventListener('change', saveAndRefresh);
document.getElementById('plexYesSub').addEventListener('change', saveAndRefresh);

document.getElementById('addSite').addEventListener('click', () => {
  const input = document.getElementById('siteInput');
  const val = input.value.trim().toLowerCase();
  if (val) {
    chrome.storage.sync.get({ allowedSites: [] }, (items) => {
      const newList = [...items.allowedSites, val];
      chrome.storage.sync.set({ allowedSites: newList }, () => {
        renderSites(newList);
        input.value = '';
        saveAndRefresh();
      });
    });
  }
});

function renderSites(sites) {
  const list = document.getElementById('siteList');
  list.innerHTML = '';
  sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<span>${site}</span><button class="btn del-btn" data-index="${index}">삭제</button>`;
    list.appendChild(item);
  });
}

document.getElementById('siteList').addEventListener('click', (e) => {
  if (e.target.classList.contains('del-btn')) {
    const index = e.target.dataset.index;
    chrome.storage.sync.get({ allowedSites: [] }, (items) => {
      const newList = items.allowedSites.filter((_, i) => i != index);
      chrome.storage.sync.set({ allowedSites: newList }, () => {
        renderSites(newList);
        saveAndRefresh();
      });
    });
  }
});