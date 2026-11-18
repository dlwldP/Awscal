// 방문 분석: GoatCounter(화면·이벤트, 쿠키 없음).
// data/settings.json의 analytics.goatcounterCode가 있을 때만 켠다 (비어 있으면 아무것도 불러오지 않는다).
//   initAnalytics(cfg)      스크립트 불러오기
//   trackPage()             해시 화면(#/t/...)이 바뀔 때마다 한 번 (직접 바꾼 값 같은 ?쿼리는 빼고 센다)
//   trackEvent(name, title) 템플릿 선택·규모/리전 변경·계산기 사용·공유 같은 이벤트
let enabled = false;
const queue = []; // GoatCounter 스크립트가 아직 안 불러와졌을 때 쌓아 둔다

function send(vars) {
  if (!enabled) return;
  if (window.goatcounter?.count) window.goatcounter.count(vars);
  else queue.push(vars);
}

function addScript(src, attrs) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
  return s;
}

export function initAnalytics(cfg = {}) {
  if (cfg.goatcounterCode) {
    enabled = true;
    // no_onload: 첫 화면도 trackPage()가 해시 경로로 직접 센다 (해시 라우팅이라 자동 집계로는 화면을 구분할 수 없다)
    const s = addScript("https://gc.zgo.at/count.js", {
      "data-goatcounter": `https://${cfg.goatcounterCode}.goatcounter.com/count`,
      "data-goatcounter-settings": JSON.stringify({ no_onload: true }),
    });
    s.addEventListener("load", () => queue.splice(0).forEach((v) => window.goatcounter.count(v)));
  }
}

/** 해시 화면 이름: "#/t/wordpress/personal/ap-northeast-2?ebsGb=30" → "/t/wordpress/personal/ap-northeast-2" */
export function screenPath(hash = location.hash) {
  return "/" + hash.replace(/^#\/?/, "").split("?")[0];
}

let firstView = true;

export function trackPage() {
  // 유입 경로: 첫 화면만 ?utm_source=(공유 링크 등) 또는 document.referrer(Velog·검색 등)로 기록한다.
  // 그 뒤 화면 이동은 사이트 안 이동이라 같은 사이트 주소를 넘겨 유입으로 세지 않게 한다.
  const src = typeof location !== "undefined" ? new URLSearchParams(location.search).get("utm_source") : null;
  const referrer = firstView ? (src ? `utm:${src}` : document.referrer) : `${location.origin}${location.pathname}`;
  firstView = false;
  send({ path: screenPath(), title: document.title, referrer });
}

export function trackEvent(name, title = name) {
  send({ path: name, title, event: true });
}
