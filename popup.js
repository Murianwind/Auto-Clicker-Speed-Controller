const GITHUB_REPO = "Murianwind/Auto-Clicker-Speed-Controller"; // 본인 저장소로 변경

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

  checkUpdate();
});

// ── 업데이트 체크 ─────────────────────────────────────────────
async function checkUpdate() {
  const section = document.getElementById('updateSection');
  const badge = document.getElementById('updateBadge');
  const detail = document.getElementById('updateDetail');
  const versionText = document.getElementById('versionText');
  const downloadBtn = document.getElementById('downloadBtn');

  section.classList.add('visible');

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const release = await res.json();
    const latestTag = release.tag_name;           // e.g. "v3.4"
    const currentVersion = chrome.runtime.getManifest().version; // e.g. "3.3"
    const latestVersion = latestTag.replace(/^v/, "");

    // zip asset 찾기
    const zipAsset = release.assets?.find(a => a.name.endsWith('.zip'));

    if (latestVersion === currentVersion) {
      badge.textContent = `최신 버전 v${currentVersion}`;
      badge.className = "update-badge badge-latest";
    } else {
      badge.textContent = "업데이트 있음";
      badge.className = "update-badge badge-new";
      detail.style.display = "block";
      versionText.textContent = `현재 v${currentVersion} → 최신 ${latestTag}`;

      if (zipAsset) {
        downloadBtn.addEventListener('click', () => {
          downloadBtn.disabled = true;
          downloadBtn.textContent = "다운로드 중...";
          chrome.downloads.download(
            { url: zipAsset.browser_download_url, filename: zipAsset.name },
            (id) => {
              if (chrome.runtime.lastError) {
                downloadBtn.disabled = false;
                downloadBtn.textContent = "zip 다운로드";
                badge.textContent = "다운로드 실패";
                badge.className = "update-badge badge-error";
              } else {
                downloadBtn.textContent = "다운로드 완료";
              }
            }
          );
        });
      } else {
        // zip asset이 없으면 GitHub 릴리스 페이지로 이동
        downloadBtn.textContent = "릴리스 페이지";
        downloadBtn.addEventListener('click', () => {
          chrome.tabs.create({ url: release.html_url });
        });
      }
    }
  } catch (e) {
    badge.textContent = "확인 실패";
    badge.className = "update-badge badge-error";
  }
}

// chrome://extensions 링크 처리
document.getElementById('extensionsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions" });
});

// ── 설정 저장 ─────────────────────────────────────────────────
function saveSettings() {
  const masterSwitch = document.getElementById('masterSwitch').checked;
  const autoResume = document.getElementById('autoResume').checked;
  const keywords = document.getElementById('keywords').value;
  const plexNoSub = document.getElementById('plexNoSub').value;
  const plexYesSub = document.getElementById('plexYesSub').value;
  chrome.storage.sync.set({ masterSwitch, autoResume, keywords, plexNoSub, plexYesSub });
}

document.getElementById('masterSwitch').addEventListener('change', saveSettings);
document.getElementById('autoResume').addEventListener('change', saveSettings);
document.getElementById('keywords').addEventListener('change', saveSettings);
document.getElementById('plexNoSub').addEventListener('change', saveSettings);
document.getElementById('plexYesSub').addEventListener('change', saveSettings);

document.getElementById('addSite').addEventListener('click', () => {
  const input = document.getElementById('siteInput');
  const val = input.value.trim().toLowerCase();
  if (val) {
    chrome.storage.sync.get({ allowedSites: [] }, (items) => {
      const newList = [...items.allowedSites, val];
      chrome.storage.sync.set({ allowedSites: newList }, () => {
        renderSites(newList);
        input.value = '';
        saveSettings();
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
        saveSettings();
      });
    });
  }
});
