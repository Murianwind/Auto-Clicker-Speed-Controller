/**
 * Auto Clicker & Speed Controller - 기능 테스트
 * 실행: Node.js 환경에서 `node content.test.js`
 *
 * Chrome API(chrome.storage, chrome.runtime 등)를 Mock으로 대체하여
 * 브라우저 없이 핵심 로직을 검증합니다.
 */

// ─────────────────────────────────────────────
// 0. 테스트 프레임워크 (의존성 없음)
// ─────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ ok: true, name });
    passed++;
  } catch (e) {
    results.push({ ok: false, name, error: e.message });
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertNull(v, msg) {
  if (v !== null) throw new Error(msg || `Expected null, got ${JSON.stringify(v)}`);
}

// ─────────────────────────────────────────────
// 1. Chrome API Mock
// ─────────────────────────────────────────────
const storageData = {};
const storageListeners = [];

global.chrome = {
  storage: {
    sync: {
      get: (keys, cb) => {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : (typeof keys === 'object' ? Object.keys(keys) : [keys]);
        keyList.forEach(k => { result[k] = storageData[k] ?? (typeof keys === 'object' && !Array.isArray(keys) ? keys[k] : undefined); });
        cb(result);
      },
      set: (items, cb) => {
        const changes = {};
        Object.entries(items).forEach(([k, v]) => {
          changes[k] = { oldValue: storageData[k], newValue: v };
          storageData[k] = v;
        });
        storageListeners.forEach(fn => fn(changes));
        if (cb) cb();
      },
    },
    onChanged: {
      addListener: (fn) => storageListeners.push(fn),
    },
  },
  runtime: { onStartup: { addListener: () => {} } },
};

// ─────────────────────────────────────────────
// 2. DOM Mock (JSDOM 없이 최소 구현)
// ─────────────────────────────────────────────
class MockElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = [];
    this.childNodes = [];
    this.style = {};
    this.dataset = attrs.dataset || {};
    this.offsetParent = {}; // null이면 숨김 처리
    this._listeners = {};
    this.innerText = attrs.innerText || "";
    this.textContent = attrs.textContent || attrs.innerText || "";
    this.playbackRate = 1;
    this.duration = attrs.duration ?? 0;
    this.currentTime = attrs.currentTime ?? 0;
    this.src = attrs.src || "";
  }
  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter(f => f !== fn);
    }
  }
  dispatchEvent(e) {
    (this._listeners[e.type] || []).forEach(fn => fn(e));
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
  closest(selector) {
    // button 또는 [role="button"] 셀렉터에 대해 자기 자신 반환
    if (selector.includes('button') && (this.tagName === 'BUTTON' || this.attrs.role === 'button')) return this;
    if (selector.includes('[role="menuitem"]') && this.attrs.role === 'menuitem') return this;
    return null;
  }
  querySelector(sel) {
    return this.children.find(c => c._matchSelector(sel)) || null;
  }
  querySelectorAll(sel) {
    return this.children.filter(c => c._matchSelector(sel));
  }
  _matchSelector(sel) {
    if (sel.includes('button') && this.tagName === 'BUTTON') return true;
    if (sel.includes('[role="button"]') && this.attrs.role === 'button') return true;
    if (sel.includes('[data-testid="nextButton"]') && this.dataset.testid === 'nextButton') return true;
    if (sel.includes('[data-testid="subtitlesStream"]') && this.dataset.testid === 'subtitlesStream') return true;
    if (sel.includes('path[d=') && this.tagName === 'PATH') {
      const match = sel.match(/path\[d="([^"]+)"\]/);
      return match && this.attrs.d === match[1];
    }
    return false;
  }
  includes(str) { return this.innerText.includes(str); }
}

// document / window Mock
const bodyElement = new MockElement('body');
bodyElement.innerText = "";
global.document = {
  body: bodyElement,
  _video: null,
  querySelector: (sel) => {
    if (sel === 'video') return global.document._video;
    return bodyElement.querySelector(sel);
  },
  querySelectorAll: (sel) => bodyElement.querySelectorAll(sel),
  addEventListener: () => {},
};

global.window = {
  location: { href: "https://www.netflix.com/watch/123", hostname: "www.netflix.com" },
  history: { back: () => { global.window._wentBack = true; } },
  netflixCreditFound: false,
  _wentBack: false,
  addEventListener: () => {},
};

global.Node = { TEXT_NODE: 3 };

class MockMouseEvent {
  constructor(type, opts) { this.type = type; Object.assign(this, opts); }
}
global.MouseEvent = MockMouseEvent;

// ─────────────────────────────────────────────
// 3. content.js 핵심 로직 인라인 (테스트 대상)
// ─────────────────────────────────────────────
// content.js에서 테스트 가능한 순수 함수들을 직접 재현합니다.
// (실제 배포 파일을 require할 경우 MutationObserver 등 브라우저 API가 필요하므로
//  핵심 로직 단위로 분리하여 검증합니다.)

const NETFLIX_NEXT_PATH = "M22 3h-2v18h2zm-17.71.62C3.29 3 2 3.72 2 4.89v14.22a1.5 1.5 0 0 0 2.29 1.27l11.54-7.1a1.5 1.5 0 0 0 0-2.56zM4 18.2V5.79L14.1 12z";

// --- background.js 로직 ---
function backgroundOnStartup(storageGet, storageSet) {
  storageGet(['autoResume'], (items) => {
    if (items.autoResume !== false) storageSet({ masterSwitch: true });
  });
}

// --- 배속 선택 파싱 로직 ---
function parseSpeedFromText(text) {
  if (text === "보통" || text === "Normal" || text === "Reset") return 1.0;
  if (/^(\d+)?(\.\d+)?x$/.test(text)) return parseFloat(text.replace('x', ''));
  return null;
}

// --- 넷플릭스 남은시간 트리거 ---
function shouldTriggerNext(video, netflixCreditFound) {
  if (netflixCreditFound) return true;
  if (!video || !isFinite(video.duration) || isNaN(video.duration) || video.duration <= 0) return false;
  const remaining = video.duration - video.currentTime;
  return remaining > 0 && remaining <= 10;
}

// --- 허용 사이트 매칭 ---
function isSiteMatched(currentUrl, allowedSites) {
  return (allowedSites || []).some(site => site && currentUrl.toLowerCase().includes(site.toLowerCase()));
}

// --- keywords 파싱 ---
function parseKeywords(str) {
  return (str || "").split(',').map(s => s.trim()).filter(Boolean);
}

// --- Plex 배속 결정 ---
function resolvePlexRate(hasSub, config, userTargetRate, hasUserChangedSpeed) {
  if (hasUserChangedSpeed && userTargetRate !== null) return userTargetRate;
  return hasSub ? config.plexYesSub : config.plexNoSub;
}

// --- syncPlexUI 텍스트 계산 ---
function speedToLabel(rate) {
  return rate === 1 ? "보통" : `${rate}x`;
}

// --- storage.onChanged 핸들러 ---
function applyStorageChanges(changes, config) {
  const updated = { ...config };
  if (changes.keywords) updated.keywords = parseKeywords(changes.keywords.newValue);
  if (changes.plexNoSub) updated.plexNoSub = parseFloat(changes.plexNoSub.newValue);
  if (changes.plexYesSub) updated.plexYesSub = parseFloat(changes.plexYesSub.newValue);
  return updated;
}

// ─────────────────────────────────────────────
// 4. 테스트 케이스
// ─────────────────────────────────────────────

// ── background.js ──────────────────────────────
test("[background] autoResume=true이면 masterSwitch를 true로 설정한다", () => {
  let set = null;
  backgroundOnStartup(
    (keys, cb) => cb({ autoResume: true }),
    (items) => { set = items; }
  );
  assertEqual(set?.masterSwitch, true);
});

test("[background] autoResume=false이면 masterSwitch를 설정하지 않는다", () => {
  let set = null;
  backgroundOnStartup(
    (keys, cb) => cb({ autoResume: false }),
    (items) => { set = items; }
  );
  assertNull(set, "autoResume=false일 때 set이 호출되면 안 됨");
});

test("[background] autoResume 값이 없으면(undefined) masterSwitch를 true로 설정한다", () => {
  let set = null;
  backgroundOnStartup(
    (keys, cb) => cb({}),
    (items) => { set = items; }
  );
  assertEqual(set?.masterSwitch, true);
});

// ── 배속 파싱 ──────────────────────────────────
test("[speed] '보통' → 1.0", () => assertEqual(parseSpeedFromText("보통"), 1.0));
test("[speed] 'Normal' → 1.0", () => assertEqual(parseSpeedFromText("Normal"), 1.0));
test("[speed] 'Reset' → 1.0", () => assertEqual(parseSpeedFromText("Reset"), 1.0));
test("[speed] '1.5x' → 1.5", () => assertEqual(parseSpeedFromText("1.5x"), 1.5));
test("[speed] '2x' → 2.0", () => assertEqual(parseSpeedFromText("2x"), 2.0));
test("[speed] '0.75x' → 0.75", () => assertEqual(parseSpeedFromText("0.75x"), 0.75));
test("[speed] '.5x' → 0.5", () => assertEqual(parseSpeedFromText(".5x"), 0.5));
test("[speed] 관계없는 텍스트 → null", () => assertNull(parseSpeedFromText("다음화"), "다음화는 배속이 아님"));
test("[speed] 빈 문자열 → null", () => assertNull(parseSpeedFromText("")));

// ── 사이트 매칭 ────────────────────────────────
test("[site] 허용된 사이트 포함 → true", () => {
  assert(isSiteMatched("https://www.netflix.com/watch/123", ["netflix"]));
});
test("[site] 허용된 사이트 대소문자 무관 → true", () => {
  assert(isSiteMatched("https://www.Netflix.com/watch/123", ["netflix"]));
});
test("[site] 허용되지 않은 사이트 → false", () => {
  assert(!isSiteMatched("https://www.youtube.com", ["netflix", "plex"]));
});
test("[site] 빈 allowedSites → false", () => {
  assert(!isSiteMatched("https://www.netflix.com", []));
});
test("[site] allowedSites에 빈 문자열 포함 → 무시됨", () => {
  assert(!isSiteMatched("https://www.netflix.com", [""]));
});

// ── keywords 파싱 ──────────────────────────────
test("[keywords] 쉼표 구분 파싱", () => {
  const kw = parseKeywords("오프닝,줄거리,크레딧");
  assertEqual(kw.length, 3);
  assertEqual(kw[0], "오프닝");
  assertEqual(kw[2], "크레딧");
});
test("[keywords] 공백 제거", () => {
  const kw = parseKeywords("오프닝, 줄거리 , 크레딧");
  assertEqual(kw[1], "줄거리");
});
test("[keywords] 빈 문자열 → 빈 배열", () => {
  assertEqual(parseKeywords("").length, 0);
});
test("[keywords] 빈 항목 필터링", () => {
  const kw = parseKeywords("오프닝,,크레딧");
  assertEqual(kw.length, 2);
});

// ── 넷플릭스 다음화 트리거 ──────────────────────
test("[netflix] creditFound=true이면 즉시 트리거", () => {
  const video = new MockElement('video', { duration: 3600, currentTime: 3590 });
  assert(shouldTriggerNext(video, true));
});
test("[netflix] 잔여 10초 이하 → 트리거", () => {
  const video = new MockElement('video', { duration: 3600, currentTime: 3591 });
  assert(shouldTriggerNext(video, false));
});
test("[netflix] 잔여 10초 초과 → 트리거 안 함", () => {
  const video = new MockElement('video', { duration: 3600, currentTime: 3589 });
  assert(!shouldTriggerNext(video, false));
});
test("[netflix] duration=Infinity → 트리거 안 함", () => {
  const video = new MockElement('video', { duration: Infinity, currentTime: 100 });
  assert(!shouldTriggerNext(video, false));
});
test("[netflix] duration=NaN → 트리거 안 함", () => {
  const video = new MockElement('video', { duration: NaN, currentTime: 0 });
  assert(!shouldTriggerNext(video, false));
});
test("[netflix] duration=0 → 트리거 안 함", () => {
  const video = new MockElement('video', { duration: 0, currentTime: 0 });
  assert(!shouldTriggerNext(video, false));
});
test("[netflix] currentTime >= duration (영상 종료) → 트리거 안 함 (remaining=0)", () => {
  const video = new MockElement('video', { duration: 100, currentTime: 100 });
  assert(!shouldTriggerNext(video, false));
});
test("[netflix] video=null → 트리거 안 함", () => {
  assert(!shouldTriggerNext(null, false));
});

// ── Plex 배속 결정 ─────────────────────────────
test("[plex] 사용자 변경 배속 최우선 적용", () => {
  const rate = resolvePlexRate(true, { plexYesSub: 1.0, plexNoSub: 1.5 }, 2.0, true);
  assertEqual(rate, 2.0);
});
test("[plex] 사용자 미변경 + 자막 있음 → plexYesSub", () => {
  const rate = resolvePlexRate(true, { plexYesSub: 1.25, plexNoSub: 1.5 }, null, false);
  assertEqual(rate, 1.25);
});
test("[plex] 사용자 미변경 + 자막 없음 → plexNoSub", () => {
  const rate = resolvePlexRate(false, { plexYesSub: 1.25, plexNoSub: 1.5 }, null, false);
  assertEqual(rate, 1.5);
});
test("[plex] hasUserChangedSpeed=true이지만 userTargetRate=null → plexNoSub로 fallback", () => {
  // userTargetRate가 null이면 hasUserChangedSpeed와 무관하게 자막 상태 기준으로 결정됨
  const rate = resolvePlexRate(false, { plexYesSub: 1.25, plexNoSub: 1.5 }, null, true);
  assertEqual(rate, 1.5);
});

// ── syncPlexUI 텍스트 ──────────────────────────
test("[plexUI] rate=1 → '보통'", () => assertEqual(speedToLabel(1), "보통"));
test("[plexUI] rate=1.5 → '1.5x'", () => assertEqual(speedToLabel(1.5), "1.5x"));
test("[plexUI] rate=2 → '2x'", () => assertEqual(speedToLabel(2), "2x"));
test("[plexUI] rate=0.75 → '0.75x'", () => assertEqual(speedToLabel(0.75), "0.75x"));

// ── storage.onChanged 반영 ──────────────────────
test("[storage] keywords 변경 → config 업데이트", () => {
  const config = { keywords: ["오프닝"], plexNoSub: 1.0, plexYesSub: 1.0 };
  const updated = applyStorageChanges({ keywords: { newValue: "오프닝,크레딧" } }, config);
  assertEqual(updated.keywords.length, 2);
  assertEqual(updated.keywords[1], "크레딧");
});
test("[storage] plexNoSub 변경 → config 업데이트", () => {
  const config = { keywords: [], plexNoSub: 1.0, plexYesSub: 1.0 };
  const updated = applyStorageChanges({ plexNoSub: { newValue: "1.5" } }, config);
  assertEqual(updated.plexNoSub, 1.5);
});
test("[storage] plexYesSub 변경 → config 업데이트", () => {
  const config = { keywords: [], plexNoSub: 1.0, plexYesSub: 1.0 };
  const updated = applyStorageChanges({ plexYesSub: { newValue: "0.75" } }, config);
  assertEqual(updated.plexYesSub, 0.75);
});
test("[storage] 관계없는 키 변경 → config 유지", () => {
  const config = { keywords: ["오프닝"], plexNoSub: 1.0, plexYesSub: 1.0 };
  const updated = applyStorageChanges({ someOtherKey: { newValue: "foo" } }, config);
  assertEqual(updated.keywords[0], "오프닝");
  assertEqual(updated.plexNoSub, 1.0);
});

// ─────────────────────────────────────────────
// 5. 결과 출력
// ─────────────────────────────────────────────
console.log("\n=== 테스트 결과 ===\n");
results.forEach(r => {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.ok ? "" : `\n     → ${r.error}`}`);
});
console.log(`\n총 ${passed + failed}개 | 통과 ${passed}개 | 실패 ${failed}개`);
if (failed > 0) process.exit(1);
