let config = { keywords: [], masterSwitch: true, plexNoSub: null, plexYesSub: null };
let lastVideoSrc = "";
let isProcessing = false;

// [데이터 저장] 배속 및 세션 유지 관련
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
      
      console.log(">> [Stream Master] 가동 시작.");
      setupInteractionListener();
      startObserver();
    }
  });
}

function setupInteractionListener() {
  document.addEventListener('click', (e) => {
    // [수정] Plex 배속 변경 버튼 및 메뉴 아이템 클릭 감지
    // data-testid="dropdownItem" 또는 메뉴 텍스트를 포함하는 요소 감지
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
      console.log(`>> [사용자 개입] 배속 변경 감지: ${selected}x`);
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
    if (document.body.innerText.includes("NSES-UHX")) {
      window.history.back();
      return;
    }

    const video = document.querySelector('video');
    
    if (video) {
      if (sessionCheckTimeout) {
        clearTimeout(sessionCheckTimeout);
        sessionCheckTimeout = null;
      }
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
    } else {
      if (lastVideoSrc !== "") {
        lastVideoSrc = ""; 
        if (!sessionCheckTimeout) {
          sessionCheckTimeout = setTimeout(() => {
            if (!document.querySelector('video')) resetUserSession("재생창 이탈");
            sessionCheckTimeout = null;
          }, 10000); 
        }
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
      if (window.location.hostname.includes('netflix') && text.includes('크레딧')) {
        window.netflixCreditFound = true;
      }

      if (window.location.hostname.includes('plex') && text.includes('크레딧')) {
        const nextBtn = document.querySelector('[data-testid="nextButton"]');
        if (nextBtn) {
          isProcessing = true;
          physicalClick(nextBtn);
          setTimeout(() => { isProcessing = false; }, 3000);
          return;
        }
      } else {
        btn.click();
      }
    }
  }
}

function physicalClick(element) {
  const rect = element.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  ['mousedown', 'mouseup', 'click'].forEach(t => element.dispatchEvent(new MouseEvent(t, opts)));
}

// [핵심 변경] 사용자가 개입(hasUserChangedSpeed)하지 않는 한 영상 끝까지 유지
function startEnforceLoop(video) {
  if (enforceInterval) clearInterval(enforceInterval);
  
  enforceInterval = setInterval(() => {
    // 비디오가 사라지면 인터벌 종료
    if (!video) { 
      clearInterval(enforceInterval);
      return; 
    }

    let finalRate;
    if (hasUserChangedSpeed && userTargetRate !== null) {
      // [수정] 사용자가 개입했으므로 이 루프는 종료됨 (사용자 선택 존중)
      clearInterval(enforceInterval);
      return;
    } else {
      // 감시 모드: 자막 유무에 따른 배속 설정
      const subElement = document.querySelector('[data-testid="subtitlesStream"]');
      const hasSub = subElement ? !subElement.innerText.includes('없음') : false;
      finalRate = hasSub ? config.plexYesSub : config.plexNoSub;
    }

    if (finalRate !== null && !isNaN(finalRate)) {
      if (Math.abs(video.playbackRate - finalRate) > 0.01) {
        video.playbackRate = finalRate;
      }
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
    if (textNode) {
      const currentBtnTxt = textNode.textContent.trim();
      if (currentBtnTxt !== speedText && (currentBtnTxt === "보통" || /^(\d+)?(\.\d+)?x$/.test(currentBtnTxt))) {
        textNode.textContent = speedText;
      }
    }
  });
}

window.addEventListener('popstate', () => resetUserSession("페이지 이동"));
init();