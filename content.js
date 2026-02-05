let config = { keywords: [], masterSwitch: true, plexNoSub: null, plexYesSub: null };
let lastVideoSrc = "";
let isProcessing = false;

// 사용자가 설정한 배속을 세션 내내 기억하기 위한 변수
let userTargetRate = null;      
let hasUserChangedSpeed = false; 

let enforceInterval = null;
let sessionCheckTimeout = null; 

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
      hasUserChangedSpeed = true; // 사용자가 개입했음을 마킹
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
        startEnforceLoop(video);
        if (window.location.hostname.includes('netflix')) {
          video.removeEventListener('timeupdate', timeUpdateHandler);
          video.addEventListener('timeupdate', timeUpdateHandler);
        }
      }
    } else if (lastVideoSrc !== "") {
      lastVideoSrc = ""; 
      if (!sessionCheckTimeout) {
        sessionCheckTimeout = setTimeout(() => {
          if (!document.querySelector('video')) resetUserSession("재생창 이탈");
          sessionCheckTimeout = null;
        }, 30000); // 자동 재생 로딩을 고려해 30초 대기
      }
    }
    if (!isProcessing) handleGenericButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function timeUpdateHandler(e) {
  const video = e.target;
  let triggerNext = window.netflixCreditFound || false;
  if (video.duration > 0 && !isNaN(video.duration)) {
    const remaining = video.duration - video.currentTime;
    if (remaining > 0 && remaining <= 10) triggerNext = true;
  }
  if (triggerNext && !isProcessing) {
    const p = document.querySelector(`path[d="${NETFLIX_NEXT_PATH}"]`);
    const btn = p?.closest('button') || p?.closest('[role="button"]');
    if (btn && btn.offsetParent !== null) {
      isProcessing = true;
      physicalClick(btn);
    }
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
  if (!window.location.hostname.includes('plex')) return; // Plex 외 타 사이트 배속 강제 금지

  enforceInterval = setInterval(() => {
    if (!video) { clearInterval(enforceInterval); return; }
    let finalRate;
    // 사용자가 설정한 값이 있으면 그것을 최우선으로 사용 (자동 재생 후에도 유지)
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
  }, 500);
}

function resetUserSession(reason) {
  userTargetRate = null;
  hasUserChangedSpeed = false;
  lastVideoSrc = "";
  if (enforceInterval) clearInterval(enforceInterval);
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

window.addEventListener('popstate', () => resetUserSession("페이지 이동"));
init();
