let config = { keywords: [], masterSwitch: true, plexNoSub: null, plexYesSub: null };
let lastVideoSrc = "";
let isProcessing = false;

// 사용자가 설정한 배속을 세션 내내 기억하기 위한 변수
let userTargetRate = null;      
let hasUserChangedSpeed = false; 

let enforceInterval = null;
let sessionCheckTimeout = null;

// [FIX] 넷플릭스 isProcessing 고착 방지용 타이머
let netflixProcessingTimer = null;

// [FIX] video 엘리먼트 레퍼런스 추적 (리스너 누수 방지)
let trackedVideo = null;

const NETFLIX_NEXT_PATH = "M22 3h-2v18h2zm-17.71.62C3.29 3 2 3.72 2 4.89v14.22a1.5 1.5 0 0 0 2.29 1.27l11.54-7.1a1.5 1.5 0 0 0 0-2.56zM4 18.2V5.79L14.1 12z";

function init() {
  chrome.storage.sync.get(['masterSwitch', 'allowedSites', 'keywords', 'plexNoSub', 'plexYesSub'], (items) => {
    if (items.masterSwitch === false) return;
    const currentUrl = window.location.href.toLowerCase();
    const isMatched = (items.allowedSites || []).some(site => site && currentUrl.includes(site.toLowerCase()));
    if (isMatched) {
      config.keywords = (items.keywords || "").split(',').map(s => s.trim());
      config.plexNoSub = items.plexNoSub ? parseFloat(items.plexNoSub) : null;
      config.plexYesSub = items.plexYesSub ? parseFloat(items.plexYesSub) : null;
      setupInteractionListener();
      startObserver();
    }
  });
}

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

function startObserver() {
  const observer = new MutationObserver(() => {
    if (document.body.innerText.includes("NSES-UHX")) { window.history.back(); return; }
    const video = document.querySelector('video');
    if (video) {
      if (sessionCheckTimeout) { clearTimeout(sessionCheckTimeout); sessionCheckTimeout = null; }
      if (video.src !== lastVideoSrc) {
        lastVideoSrc = video.src;
        isProcessing = false;
        window.netflixCreditFound = false;

        // [FIX] 이전 video 엘리먼트의 리스너를 명시적으로 제거 후 새 엘리먼트에 등록
        if (trackedVideo) {
          trackedVideo.removeEventListener('timeupdate', timeUpdateHandler);
        }
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

function timeUpdateHandler(e) {
  const video = e.target;

  // [FIX] isProcessing 고착 방지: 넷플릭스 처리 타이머가 없는데 isProcessing이 true면 강제 해제
  if (isProcessing) return;

  const creditFound = window.netflixCreditFound || false;
  let remainingTrigger = false;

  // [FIX] Infinity/NaN 체크 추가
  if (video.duration > 0 && isFinite(video.duration) && !isNaN(video.duration)) {
    const remaining = video.duration - video.currentTime;
    if (remaining > 0 && remaining <= 10) remainingTrigger = true;
  }

  if (!creditFound && !remainingTrigger) return;

  const p = document.querySelector(`path[d="${NETFLIX_NEXT_PATH}"]`);
  const btn = p?.closest('button') || p?.closest('[role="button"]');

  if (btn && btn.offsetParent !== null) {
    isProcessing = true;
    // [FIX] 넷플릭스용 isProcessing 자동 해제 타이머 추가
    if (netflixProcessingTimer) clearTimeout(netflixProcessingTimer);
    netflixProcessingTimer = setTimeout(() => {
      isProcessing = false;
      netflixProcessingTimer = null;
    }, 5000);
    physicalClick(btn);
  }
}

function handleGenericButtons() {
  if (isProcessing) return;
  const buttons = document.querySelectorAll('button, [role="button"], a.button');
  for (const btn of buttons) {
    const text = (btn.innerText || btn.textContent || "").trim();
    if (config.keywords.some(k => k && text.includes(k)) && btn.offsetParent !== null) {
      if (window.location.hostname.includes('netflix') && text.includes('크레딧')) window.netflixCreditFound = true;
      if (window.location.hostname.includes('plex') && text.includes('크레딧')) {
        const nextBtn = document.querySelector('[data-testid="nextButton"]');
        if (nextBtn) { isProcessing = true; physicalClick(nextBtn); setTimeout(() => { isProcessing = false; }, 3000); return; }
      } else { btn.click(); }
    }
  }
}

function physicalClick(element) {
  const rect = element.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  ['mousedown', 'mouseup', 'click'].forEach(t => element.dispatchEvent(new MouseEvent(t, opts)));
}

function startEnforceLoop(video) {
  if (enforceInterval) clearInterval(enforceInterval);
  if (!window.location.hostname.includes('plex')) return;

  // [FIX] 500ms → 1500ms로 완화 (기능 동일, CPU 부하 감소)
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

function resetUserSession(reason) {
  userTargetRate = null;
  hasUserChangedSpeed = false;
  lastVideoSrc = "";
  trackedVideo = null;
  if (enforceInterval) clearInterval(enforceInterval);
  // [FIX] 세션 리셋 시 넷플릭스 타이머도 함께 정리
  if (netflixProcessingTimer) { clearTimeout(netflixProcessingTimer); netflixProcessingTimer = null; }
  isProcessing = false;
}

function syncPlexUI(rate) {
  const speedText = rate === 1 ? "보통" : `${rate}x`;
  document.querySelectorAll('button[class*="DisclosureArrowButton-disclosureArrowButton"]').forEach(btn => {
    const textNode = Array.from(btn.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode && (textNode.textContent.trim() === "보통" || /^(\d+)?(\.\d+)?x$/.test(textNode.textContent.trim()))) {
      if (textNode.textContent.trim() !== speedText) textNode.textContent = speedText;
    }
  });
}

// [FIX] 팝업에서 설정 변경 시 탭 리로드 없이 실시간 반영
chrome.storage.onChanged.addListener((changes) => {
  if (changes.keywords) config.keywords = changes.keywords.newValue.split(',').map(s => s.trim());
  if (changes.plexNoSub) config.plexNoSub = parseFloat(changes.plexNoSub.newValue);
  if (changes.plexYesSub) config.plexYesSub = parseFloat(changes.plexYesSub.newValue);
  if (changes.masterSwitch && changes.masterSwitch.newValue === false) {
    if (enforceInterval) clearInterval(enforceInterval);
    resetUserSession("마스터 스위치 OFF");
  }
});

window.addEventListener('popstate', () => resetUserSession("페이지 이동"));
init();
