const GITHUB_REPO = "Murianwind/Auto-Clicker-Speed-Controller";

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
    const latestTag = release.tag_name;
    const currentVersion = chrome.runtime.getManifest().version;
    const latestVersion = latestTag.replace(/^[vV]/, "");
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
            () => {
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

document.getElementById('extensionsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions" });
});

// ── 버그 제보 ─────────────────────────────────────────────────
document.getElementById('bugReportBtn').addEventListener('click', async () => {
  chrome.storage.local.get({ debugLogs: [] }, async (result) => {
    // 1. 기존 디버그 로그 다운로드 버튼과 동일한 방식으로 저장
    if (result.debugLogs.length === 0) {
      alert("기록된 로그가 없습니다.\n로그가 쌓인 후 다시 시도해 주세요.");
      return;
    }
    const blob = new Blob([result.debugLogs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream_master_log_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    // 2. 이슈 본문에 환경정보 + 설정값 미리 채우기
    const manifest = chrome.runtime.getManifest();
    const chromeVersion = navigator.userAgent.match(/Chrome\/([\.\d]+)/)?.[1] || "(알 수 없음)";
    const os = navigator.userAgent.includes("Win") ? "Windows"
              : navigator.userAgent.includes("Mac") ? "macOS"
              : navigator.userAgent.includes("Linux") ? "Linux" : "(알 수 없음)";
    const syncItems = await new Promise(resolve => chrome.storage.sync.get(defaults, resolve));

    const body = [
      `### 환경 정보`,
      `- 확장 프로그램 버전: v${manifest.version}`,
      `- 크롬 버전: ${chromeVersion}`,
      `- OS: ${os}`,
      ``,
      `### 현재 설정`,
      `- 전체 기능 활성화: ${syncItems.masterSwitch}`,
      `- 브라우저 시작 시 자동 켜기: ${syncItems.autoResume}`,
      `- 대상 사이트: ${(syncItems.allowedSites || []).join(", ") || "(없음)"}`,
      `- 자동 클릭 키워드: ${syncItems.keywords}`,
      `- Plex 배속 (자막 無): ${syncItems.plexNoSub}x`,
      `- Plex 배속 (자막 有): ${syncItems.plexYesSub}x`,
      ``,
      `### 로그 파일`,
      `(다운로드된 txt 파일을 여기에 첨부해 주세요)`,
      ``,
      `### 문제 설명`,
      `(여기에 문제 상황을 설명해 주세요)`,
    ].join('\n');

    const title = encodeURIComponent('[버그] ');
    const encodedBody = encodeURIComponent(body);

    // 3. 이슈 페이지 열기
    chrome.tabs.create({
      url: `https://github.com/${GITHUB_REPO}/issues/new?title=${title}&body=${encodedBody}`
    });


  });
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

// ── 디버그 로그 다운로드 / 삭제 ───────────────────────────────
document.getElementById('downloadLog').addEventListener('click', () => {
  chrome.storage.local.get({ debugLogs: [] }, (result) => {
    if (result.debugLogs.length === 0) {
      alert("기록된 로그가 없습니다.");
      return;
    }
    const blob = new Blob([result.debugLogs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream_master_log_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById('clearLog').addEventListener('click', () => {
  if (confirm("모든 로그를 삭제하시겠습니까?")) {
    chrome.storage.local.set({ debugLogs: [] }, () => alert("삭제되었습니다."));
  }
});
