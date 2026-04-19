let config = { keywords: [], masterSwitch: true, plexNoSub: null, plexYesSub: null, netflixSkipSeconds: 10 };
let lastVideoSrc = "";
let isProcessing = false;

let userTargetRate = null;      
let hasUserChangedSpeed = false; 

let enforceInterval = null;
let sessionCheckTimeout = null;
let netflixProcessingTimer = null;
let trackedVideo = null;

const NETFLIX_NEXT_PATH = "M22 3h-2v18h2zm-17.71.62C3.29 3 2 3.72 2 4.89v14.22a1.5 1.5 0 0 0 2.29 1.27l11.54-7.1a1.5 1.5 0 0 0 0-2.56zM4 18.2V5.79L14.1 12z";
const MAX_LOG = 100;

// ── 로그 ─────────────────────────────────────────────────────
function addLog(type, message) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ampm = now.getHours() < 12 ? '오전' : '오후';
  const h = now.getHours() % 12 || 12;
  const timestamp = `[${now.getFullYear()}. ${now.getMonth()+1}. ${now.getDate()}. ${ampm} ${h}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
  const line = `${timestamp} [${type}] ${message} | URL: ${window.location.href}`;
  chrome.storage.local.get({ debugLogs: [] }, (items) => {
    const log = items.debugLogs;
    log.push(line);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    chrome.storage.local.set({ debugLogs: log });
  });
}

// ── 초기화 ────────────────────────────────────────────────────
function init() {
  chrome.storage.sync.get(['masterSwitch', 'allowedSites', 'keywords', 'plexNoSub', 'plexYesSub', 'netflixSkipSeconds'], (items) => {
    if (items.masterSwitch === false) return;
    const currentUrl = window.location.href.toLowerCase();
    const isMatched = (items.allowedSites || []).some(site => site && currentUrl.includes(site.toLowerCase()));
    if (isMatched) {
      config.keywords = (items.keywords || "").split(',').map(s => s.trim());
      config.plexNoSub = items.plexNoSub ? parseFloat(items.plexNoSub) : null;
      config.plexYesSub = items.plexYesSub ? parseFloat(items.plexYesSub) : null;
      config.netflixSkipSeconds = items.netflixSkipSeconds ? parseInt(items.netflixSkipSeconds) : 10;
      setupInteractionListener();
      startObserver();
    }
  });
}

// ── Plex 배속 수동 변경 감지 ──────────────────────────────────
function setupInteractionListener() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, [role="menuitem"], .SelectedMenuItem-menuItemContainer-PNDPtO'); 
    if (!target) return;
    const text = (target.innerText || target.textContent || "").trim();
    let selected = null;
    if (text === "보통" || text === "Normal" || text === "Reset") {
      selected = 1.0;
    } else if (/^(\d+)?(\.\d+)?x$/.test(text)) { 
      selected = parseFloat(text.replace('x', ''));
    }
    if (selected !== null && !isNaN(selected)) {
      userTargetRate = selected;
      hasUserChangedSpeed = true;
      const video = document.querySelector('video');
      if (video) {
        video.playbackRate = selected;
        syncPlexUI(selected);
      }
    }
  }, true);
}

// ── DOM 변경 감시 ─────────────────────────────────────────────
function startObserver() {
  const observer = new MutationObserver(() => {
    if (document.body.innerText.includes("NSES-UHX")) { window.history.back(); return; }

    // 마지막 화 이후 크레딧 화면("다음 화" 버튼)이 나타나면 뒤로가기
    if (window.location.hostname.includes('netflix')) {
      const seamlessBtn = document.querySelector('[data-uia="next-episode-seamless-button"]');
      if (seamlessBtn) {
        addLog('자동이동', '마지막 화 크레딧 화면 감지 - 뒤로가기');
        window.history.back();
        return;
      }
    }

    const video = document.querySelector('video');
    if (video) {
      if (sessionCheckTimeout) { clearTimeout(sessionCheckTimeout); sessionCheckTimeout = null; }
      if (video.src !== lastVideoSrc) {
        lastVideoSrc = video.src;
        isProcessing = false;
        window.netflixCreditFound = false;
        if (trackedVideo) trackedVideo.removeEventListener('timeupdate', timeUpdateHandler);
        trackedVideo = video;
        startEnforceLoop(video);
        if (window.location.hostname.includes('netflix')) {
          video.addEventListener('timeupdate', timeUpdateHandler);
        }
      }
    } else if (lastVideoSrc !== "") {
      lastVideoSrc = "";
      if (!sessionCheckTimeout) {
        sessionCheckTimeout = setTimeout(() => {
          if (!document.querySelector('video')) resetUserSession("재생창 이탈");
          sessionCheckTimeout = null;
        }, 30000);
      }
    }
    if (!isProcessing) handleGenericButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Netflix: 네이티브 pause/play 콤보로 OSD 활성화 후 다음화 클릭 ──
function triggerNativePausePlay(video) {
  try {
    // 1. 네이티브 video.pause() - CSP 우회 가능
    video.pause();

    // 2. 50ms 후 재생 재개 → 넷플릭스 UI가 OSD를 렌더링
    setTimeout(() => {
      video.play().catch(e => {});

      // 3. OSD 렌더링 대기 후 다음화 버튼 탐색 (SVG 경로 기준)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const p = document.querySelector(`path[d="${NETFLIX_NEXT_PATH}"]`);
        const btn = p?.closest('button') || p?.closest('[role="button"]');

        if (btn) {
          clearInterval(interval);
          addLog('자동클릭', `다음화 버튼 클릭 (OSD 활성화 후 ${attempts}회 탐색)`);
          physicalClick(btn);
        } else if (attempts >= 50) {
          clearInterval(interval);
          addLog('오류', 'OSD 활성화 후 다음화 버튼을 찾을 수 없음');
          isProcessing = false;
          if (netflixProcessingTimer) { clearTimeout(netflixProcessingTimer); netflixProcessingTimer = null; }
        }
      }, 200);
    }, 50);

  } catch(e) {
    addLog('오류', `넷플릭스 pause/play 오류: ${e.message}`);
    isProcessing = false;
  }
}

// ── Netflix 다음화: timeupdate 기반 (잔여 10초) ───────────────
function timeUpdateHandler(e) {
  const video = e.target;
  if (isProcessing) return;

  const creditFound = window.netflixCreditFound || false;
  let remainingTrigger = false;
  if (video.duration > 0 && isFinite(video.duration) && !isNaN(video.duration)) {
    const remaining = video.duration - video.currentTime;
    if (remaining > 0 && remaining <= config.netflixSkipSeconds) remainingTrigger = true;
  }

  if (!creditFound && !remainingTrigger) return;

  isProcessing = true;
  if (netflixProcessingTimer) clearTimeout(netflixProcessingTimer);
  netflixProcessingTimer = setTimeout(() => {
    isProcessing = false;
    netflixProcessingTimer = null;
  }, 12000);

  addLog('자동넘기기', '종료 10초 전 감지 - 네이티브 pause/play 콤보 실행');
  triggerNativePausePlay(video);
}

// ── 키워드 버튼 자동클릭 ─────────────────────────────────────
function handleGenericButtons() {
  if (isProcessing) return;

  // MutationObserver에서도 OSD 다음화 버튼 감지 (잔여 10초 이하)
  if (window.location.hostname.includes('netflix')) {
    const video = document.querySelector('video');
    const remaining = (video && isFinite(video.duration) && video.duration > 0)
      ? video.duration - video.currentTime : Infinity;
    if (remaining <= config.netflixSkipSeconds) {
      const p = document.querySelector(`path[d="${NETFLIX_NEXT_PATH}"]`);
      const btn = p?.closest('button') || p?.closest('[role="button"]');
      if (btn) {
        isProcessing = true;
        if (netflixProcessingTimer) clearTimeout(netflixProcessingTimer);
        netflixProcessingTimer = setTimeout(() => {
          isProcessing = false;
          netflixProcessingTimer = null;
        }, 5000);
        addLog('자동클릭', '다음화 버튼 (MutationObserver 감지)');
        physicalClick(btn);
        return;
      }
    }
  }

  const buttons = document.querySelectorAll('button, [role="button"], a.button');
  for (const btn of buttons) {
    const text = (btn.innerText || btn.textContent || "").trim();
    if (config.keywords.some(k => k && text.includes(k)) && btn.offsetParent !== null) {
      const matchedKeyword = config.keywords.find(k => k && text.includes(k));
      if (window.location.hostname.includes('netflix') && text.includes('크레딧')) {
        window.netflixCreditFound = true;
      }
      if (window.location.hostname.includes('plex') && text.includes('크레딧')) {
        const nextBtn = document.querySelector('[data-testid="nextButton"]');
        if (nextBtn) {
          isProcessing = true;
          addLog('자동클릭', `키워드: "${matchedKeyword}" | 내용: "${text}"`);
          physicalClick(nextBtn);
          setTimeout(() => { isProcessing = false; }, 3000);
          return;
        }
      } else {
        addLog('자동클릭', `키워드: "${matchedKeyword}" | 내용: "${text}"`);
        btn.click();
      }
    }
  }
}

// ── 물리 클릭 ─────────────────────────────────────────────────
function physicalClick(element) {
  const rect = element.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  ['mousedown', 'mouseup', 'click'].forEach(t => element.dispatchEvent(new MouseEvent(t, opts)));
}

// ── Plex 배속 강제 루프 ───────────────────────────────────────
function startEnforceLoop(video) {
  if (enforceInterval) clearInterval(enforceInterval);
  if (!window.location.hostname.includes('plex')) return;
  enforceInterval = setInterval(() => {
    if (!video) { clearInterval(enforceInterval); return; }
    let finalRate;
    if (hasUserChangedSpeed && userTargetRate !== null) {
      finalRate = userTargetRate;
    } else {
      const subElement = document.querySelector('[data-testid="subtitlesStream"]');
      const hasSub = subElement ? !subElement.innerText.includes('없음') : false;
      finalRate = hasSub ? config.plexYesSub : config.plexNoSub;
    }
    if (finalRate !== null && !isNaN(finalRate)) {
      if (Math.abs(video.playbackRate - finalRate) > 0.01) video.playbackRate = finalRate;
      syncPlexUI(finalRate);
    }
  }, 1500);
}

// ── 세션 리셋 ─────────────────────────────────────────────────
function resetUserSession(reason) {
  userTargetRate = null;
  hasUserChangedSpeed = false;
  lastVideoSrc = "";
  trackedVideo = null;
  if (enforceInterval) clearInterval(enforceInterval);
  if (netflixProcessingTimer) { clearTimeout(netflixProcessingTimer); netflixProcessingTimer = null; }
  isProcessing = false;
}

// ── Plex UI 배속 텍스트 동기화 ───────────────────────────────
function syncPlexUI(rate) {
  const speedText = rate === 1 ? "보통" : `${rate}x`;
  document.querySelectorAll('button[class*="DisclosureArrowButton-disclosureArrowButton"]').forEach(btn => {
    const textNode = Array.from(btn.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode && (textNode.textContent.trim() === "보통" || /^(\d+)?(\.\d+)?x$/.test(textNode.textContent.trim()))) {
      if (textNode.textContent.trim() !== speedText) textNode.textContent = speedText;
    }
  });
}

// ── 설정 실시간 반영 ──────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.keywords) config.keywords = changes.keywords.newValue.split(',').map(s => s.trim());
  if (changes.plexNoSub) config.plexNoSub = parseFloat(changes.plexNoSub.newValue);
  if (changes.plexYesSub) config.plexYesSub = parseFloat(changes.plexYesSub.newValue);
  if (changes.netflixSkipSeconds) config.netflixSkipSeconds = parseInt(changes.netflixSkipSeconds.newValue) || 10;
  if (changes.masterSwitch && changes.masterSwitch.newValue === false) {
    if (enforceInterval) clearInterval(enforceInterval);
    resetUserSession("마스터 스위치 OFF");
  }
});

window.addEventListener('popstate', () => resetUserSession("페이지 이동"));
init();
