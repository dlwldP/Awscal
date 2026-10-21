// 화면 렌더링과 라우팅. 주소(#/...)로 화면을 나눠서 뒤로 가기와 링크 공유가 그대로 동작한다.
//   #/                              메인 (무엇을 만들까요?)
//   #/t/<템플릿>                    설정 (규모, 리전)
//   #/t/<템플릿>/<프리셋>/<리전>     결과 (+ 값 직접 조정)
//   #/calc                          직접 계산기
//   #/glossary                      용어 사전
//   #/prices                        가격 변동 내역
import { calculateTemplate, formatKrw, formatUsd, HOURS_PER_MONTH, resolveResource } from "./engine.js";
import { FIELDS, HIDDEN_ADJUST_FIELDS, fieldDef } from "./schema.js";
import {
  afterLaunchHtml, chipsHtml, esc, fieldHtml, fullUrl, installExpandHandlers, keepOpen, linesHtml, readField, regionChipsHtml, regionList, shareLink,
  warningsHtml,
} from "./ui.js";
import { parseDomain, parseOverrides, resultHash } from "./share.js";
import { importResources, renderCalculator } from "./calculator.js";
import { diagramHtml } from "./diagram.js";
import { installGlossaryHandlers, renderGlossary, setGlossary } from "./glossary.js";

const app = document.getElementById("app");
let data; // { prices, templates, settings, priceChanges }

// 결과 화면에서 직접 바꾼 값. 주소(?키=값)에 담겨서 링크로 그대로 공유된다.
const adjust = { overrides: {} };
// 템플릿별 도메인 포함 여부. 주소에 domain=0/1이 있으면 그 값을 쓰고, 없으면 마지막 선택 또는 템플릿 기본값.
const domainState = {};
let domainOn = false;

async function loadJson(path, optional = false) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`${path} 불러오기 실패 (${res.status})`);
  }
  return res.json();
}

const regionName = (id) => data.prices.regions[id]?.name ?? id;
const ex = () => data.settings.exchangeRate;
/** 원화는 항상 부가세 포함으로 보여준다. */
const krw = (usd) => `${formatKrw(usd, ex().krwPerUsd, ex().vatRate)} <small class="vat">(부가세 포함)</small>`;
/** 비교 리전: 기본 리전(서울)을 보고 있으면 버지니아, 그 외에는 서울과 비교한다. */
const compareRegionOf = (regionId) =>
  regionId === data.settings.defaultRegion ? data.settings.compareRegion : data.settings.defaultRegion;

/** 처음부터 보여줄 리전 (나머지는 "다른 리전"으로 접는다) */
const primaryRegions = () => [data.settings.defaultRegion, data.settings.compareRegion];

const REGION_HINTS = {
  "ap-northeast-2": "한국 사용자 대상이라면 여기",
  "ap-northeast-1": "한국·일본 사용자를 같이 받을 때",
  "ap-southeast-1": "동남아 사용자 대상",
  "us-east-1": "가장 저렴한 리전 중 하나",
  "us-west-2": "버지니아만큼 저렴한 미국 서부",
  "eu-central-1": "유럽 사용자 대상",
};

function feedbackUrl() {
  const body = "## 어떤 점이 좋았나요 / 불편했나요?\n\n\n## 있었으면 하는 템플릿이나 서비스\n\n";
  return `${data.settings.feedback.githubIssueUrl}?title=${encodeURIComponent("[피드백] ")}&body=${encodeURIComponent(body)}`;
}

// ---- 메인 ----
function renderHome() {
  document.title = "AWS 얼마야? · 초보자용 AWS 비용 계산기";
  const form = data.settings.feedback.googleFormUrl;
  const changes = data.priceChanges;
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">AWS 비용 계산기</p>
      <h1>AWS, 한 달에<br>얼마 나올까요?</h1>
      <p class="sub">만들고 싶은 걸 고르면 필요한 구성과 비용을 쉽게 알려드려요.</p>
    </section>

    <section class="card">
      <h2 class="card-title">무엇을 만들고 싶나요?</h2>
      <p class="card-sub">고르면 구성 2~3가지를 비교해드려요</p>
      <ul class="list">
        ${data.templates
          .map(
            (t) => `
          <li><a class="row" href="#/t/${t.id}">
            <span class="ico" aria-hidden="true">${t.icon}</span>
            <span class="txt"><span class="ttl">${esc(t.name)}</span><span class="dsc">${esc(t.summary)}</span></span>
            <span class="chev" aria-hidden="true">›</span>
          </a></li>`
          )
          .join("")}
      </ul>
    </section>

    <section class="card">
      <h2 class="card-title">더 알아보기</h2>
      <ul class="list">
        <li><a class="row" href="#/calc">
          <span class="ico" aria-hidden="true">🧮</span>
          <span class="txt"><span class="ttl">직접 계산하기</span><span class="dsc">쓸 서비스를 알고 있다면 직접 담아서 계산해요</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </a></li>
        <li><a class="row" href="#/glossary">
          <span class="ico" aria-hidden="true">📖</span>
          <span class="txt"><span class="ttl">용어 사전</span><span class="dsc">vCPU, LCU, NAT Gateway… 어려운 말 쉽게 풀기</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </a></li>
      </ul>
    </section>

    <section class="card">
      <h2 class="card-title">의견 보내기</h2>
      <p class="card-sub">있었으면 하는 템플릿이나 불편한 점을 알려주세요</p>
      <ul class="list">
        ${
          form
            ? `<li><a class="row" href="${esc(form)}" target="_blank" rel="noopener">
          <span class="ico" aria-hidden="true">📝</span>
          <span class="txt"><span class="ttl">설문으로 보내기</span><span class="dsc">계정 없이 바로 작성할 수 있어요</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </a></li>`
            : ""
        }
        <li><a class="row" href="${esc(feedbackUrl())}" target="_blank" rel="noopener">
          <span class="ico" aria-hidden="true">💬</span>
          <span class="txt"><span class="ttl">GitHub 이슈로 보내기</span><span class="dsc">GitHub 계정이 있다면</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </a></li>
      </ul>
    </section>

    <div class="trust">
      <span>AWS 계정 없이 무료</span>
      <span>가격 매주 자동 갱신 (${esc(data.prices.updatedAt)}) · <a href="#/prices">변동 내역${
        changes ? ` ${changes.changes.length}건` : ""
      }</a></span>
      <span>숨은 비용까지 알려드려요</span>
    </div>`;
}

// ---- 설정 ----
function renderSetup(template) {
  document.title = `${template.name} · AWS 얼마야?`;
  const choice = (name, value, title, desc, checked) => `
    <label class="choice">
      <input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}>
      <span class="txt"><span class="ttl">${esc(title)}</span><span class="dsc">${esc(desc)}</span></span>
      <span class="check" aria-hidden="true">✓</span>
    </label>`;
  app.innerHTML = `
    <div class="page-head">
      <a class="back" href="#/">‹ 처음으로</a>
      <p class="step">${template.icon} ${esc(template.name)}</p>
      <h1 class="page-title">얼마나 많이 쓰나요?</h1>
    </div>
    <form id="setup">
      <section class="card">
        <fieldset class="choice-list">
          <legend class="card-title" style="margin-bottom:12px">사용 규모</legend>
          ${template.presets.map((p, i) => choice("preset", p.id, p.name, p.description, i === 0)).join("")}
        </fieldset>
      </section>
      <section class="card">
        <fieldset class="choice-list">
          <legend class="card-title" style="margin-bottom:12px">어디에 만들까요?</legend>
          ${regionList(data.prices)
            .map((r) => {
              const html = choice("region", r.id, r.name, REGION_HINTS[r.id] ?? "", r.id === data.settings.defaultRegion);
              return primaryRegions().includes(r.id) ? html : html.replace('<label class="choice">', '<label class="choice" hidden>');
            })
            .join("")}
          <button type="button" class="btn btn-ghost btn-sm" data-expand>다른 리전 보기 ▾</button>
        </fieldset>
      </section>
      <div class="bottom-cta"><button class="btn btn-primary btn-block" type="submit">비용 확인하기</button></div>
    </form>`;
  app.querySelector("#setup").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    location.hash = `#/t/${template.id}/${f.get("preset")}/${f.get("region")}`;
  });
}

// ---- 결과 ----
/** 처음 보여줄 구성: 추천이 있으면 추천, 없으면 가장 저렴한 것. 나머지는 "다른 방법"으로 접는다. */
const mainOptionOf = (options) => options.find((o) => o.recommended) ?? options.find((o) => o.isCheapest) ?? options[0];

function optionsHtml(options, compareRegionId, values, regionPrices) {
  const main = mainOptionOf(options);
  const cheapest = options.find((o) => o.isCheapest);
  const others = options.filter((o) => o !== main);
  const card = (o) => optionHtml(o, compareRegionId, values, regionPrices, o === main ? { cheapest } : null);
  return `${card(main)}${
    others.length
      ? `<details class="others" data-key="others">
          <summary>다른 방법 ${others.length}가지도 보기</summary>
          <section class="card">
            <h2 class="card-title">구성별 비교</h2>
            ${barsHtml(options)}
          </section>
          ${others.map(card).join("")}
        </details>`
      : ""
  }`;
}

/** 위쪽 한 줄 요약: "개인용 · 서울 · 도메인 없음" */
function settingsText(preset, regionId) {
  return `${esc(preset.name)} · ${esc(regionName(regionId))} · 도메인 ${domainOn ? "포함" : "없음"}`;
}

function barsHtml(options) {
  const max = Math.max(...options.map((o) => o.totalUsd), 0.01);
  return `
    <div class="bars" aria-label="구성안별 월 비용 비교">
      ${options
        .map(
          (o) => `
        <div class="bar ${o.isCheapest ? "cheapest" : ""}">
          <div class="bar-head"><span class="name">${esc(o.name)}</span><span class="val num">${formatUsd(o.totalUsd)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${(o.totalUsd / max) * 100}%"></div></div>
        </div>`
        )
        .join("")}
    </div>`;
}

const DIFFICULTY_CLASS = { 쉬움: "tag-easy", 보통: "tag-mid", 어려움: "tag-hard" };

/** main이 있으면 맨 위에 크게 보여주는 구성이다 ({ cheapest }: 더 싼 방법이 따로 있으면 알려준다).
 * 난이도 배지는 "처음이라면 이걸로"와 겹쳐서 접힌 "다른 방법" 카드에서만 보여준다. */
function optionHtml(o, compareRegionId, values, regionPrices, main = null) {
  const excluded = domainOn ? o.excluded : [...o.excluded, "도메인 주소 (위 '바꾸기'에서 도메인을 켜면 포함돼요)"];
  return `
    <article class="card ${main ? "option-main" : ""}">
      ${main ? `<p class="pick-label">${o.recommended ? "처음이라면 이걸로" : "이렇게 만들면"}</p>` : ""}
      <div class="option-head">
        <h3 class="option-name">${esc(o.name)}</h3>
        ${o.recommended && !main ? '<span class="tag tag-blue">처음이라면 추천</span>' : ""}
        ${o.isCheapest ? '<span class="tag tag-green">가장 저렴</span>' : ""}
        ${o.difficulty && !main ? `<span class="tag ${DIFFICULTY_CLASS[o.difficulty] ?? ""}">난이도 ${esc(o.difficulty)}</span>` : ""}
      </div>
      <p class="option-summary">${esc(o.summary)}</p>
      <div class="amount num">${formatUsd(o.totalUsd)} <small>/ 월</small></div>
      <div class="amount-krw num">${krw(o.totalUsd)}</div>
      ${
        o.compareTotalUsd !== undefined
          ? `<div class="amount-compare num">${esc(regionName(compareRegionId))}에 만들면 ${formatUsd(o.compareTotalUsd)}</div>`
          : ""
      }
      ${main && o.recommended ? `<p class="recommend-why">💡 ${esc(o.recommended)}</p>` : ""}
      ${
        main?.cheapest && main.cheapest !== o
          ? `<p class="cheaper-hint">더 저렴한 방법도 있어요: <strong>${esc(main.cheapest.name)}</strong> 월 ${formatUsd(main.cheapest.totalUsd)} · 아래 '다른 방법'에서 비교해보세요</p>`
          : ""
      }
      ${diagramHtml(o.resources.map((r) => resolveResource(r, values)), regionPrices, o.id)}
      ${warningsHtml(o.warnings)}
      <details class="more" data-key="more-${o.id}">
        <summary>비용 내역 · 장단점</summary>
        <div class="section-label">항목별 내역 <span style="font-weight:500">(누르면 이유가 보여요)</span></div>
        ${linesHtml(o.lines)}
        <div class="section-label">이 금액에 포함 안 된 비용</div>
        <ul class="excluded">${excluded.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <div class="pros-cons">
          <div><div class="section-label">장점</div><ul class="pros">${o.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
          <div><div class="section-label">단점</div><ul class="cons">${o.cons.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
        </div>
        <div class="option-actions">
          <button type="button" class="btn btn-soft btn-sm" data-to-calc="${o.id}">이 구성을 직접 계산기로 가져가기 ›</button>
        </div>
      </details>
    </article>`;
}

function adjustHtml(template, preset, values, regionPrices) {
  const keys = Object.keys(preset.values).filter((k) => FIELDS[k] && !HIDDEN_ADJUST_FIELDS.has(k));
  // 같은 화면에 비슷한 칸이 여럿이면 템플릿이 이름을 따로 붙인다 (예: "서버 사양 (EC2 단독)")
  const def = (k) => fieldDef(k, template.fieldLabels?.[k] ? { label: template.fieldLabels[k] } : {});
  const changed = Object.keys(adjust.overrides).length;
  // 처음엔 핵심 칸(mainFields)만 보이고 나머지는 "더 보기"로 접는다. 숨은 칸을 바꿔둔 상태면 펼쳐서 보여준다.
  const main = keys.filter((k) => (template.mainFields ?? keys).includes(k));
  const more = keys.filter((k) => !main.includes(k));
  const moreOpen = more.some((k) => k in adjust.overrides);
  const fields = (list) => list.map((k) => fieldHtml(def(k), values[k], regionPrices, "adj")).join("");
  return `
    <details class="card adjust" data-key="adjust" ${changed ? "open" : ""}>
      <summary>
        <span><span class="card-title" style="display:block">값 직접 바꿔보기</span>
        <span class="card-sub" style="display:block;margin:0">서버 사양, 트래픽 같은 값을 바꾸면 바로 다시 계산해요</span></span>
      </summary>
      <div class="fields">${fields(main)}</div>
      ${
        more.length
          ? `<details class="adjust-more" data-key="adjust-more" ${moreOpen ? "open" : ""}>
              <summary>값 ${more.length}개 더 보기</summary>
              <div class="fields">${fields(more)}</div>
            </details>`
          : ""
      }
      <div class="adjust-foot">
        <span id="adjust-status">${adjustStatus(preset)}</span>
        <button type="button" class="btn btn-ghost btn-sm" id="adjust-reset" ${changed ? "" : "hidden"}>기본값으로</button>
      </div>
    </details>`;
}

function adjustStatus(preset) {
  const changed = Object.keys(adjust.overrides).length;
  return changed ? `<span class="modified">${changed}개 값을 바꿨어요</span>` : `'${esc(preset.name)}' 기본값이에요`;
}

function notesHtml(preset, regionId) {
  const changed = Object.keys(adjust.overrides).length;
  return `
    <section class="card notes">
      <h2 class="card-title">이런 가정으로 계산했어요</h2>
      <p class="card-sub" style="margin:0">${esc(preset.name)} · ${esc(regionName(regionId))}${changed ? " · 직접 바꾼 값은 위 입력 칸 기준" : ""}</p>
      <ul>
        <li>${esc(preset.name)} 규모 (${esc(preset.description)}) 기준이에요.</li>
        <li>프리티어·크레딧은 반영하지 않았어요. 신규 계정이라면 실제로는 더 적게 나올 수 있어요 → <a href="https://aws.amazon.com/free/" target="_blank" rel="noopener">AWS 프리티어 안내</a></li>
        <li>예상치이며 실제 청구액과 다를 수 있어요. 정확한 견적은 <a href="https://calculator.aws/" target="_blank" rel="noopener">AWS Pricing Calculator</a>에서 확인하세요.</li>
      </ul>
      <details class="more" data-key="notes-more">
        <summary>계산 기준 더 보기</summary>
        <ul>
          ${preset.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}
          <li>한 달 = ${HOURS_PER_MONTH}시간, 온디맨드 요금 기준이에요.</li>
          <li>구간별로 단가가 달라지는 요금(전송량, S3 등)은 첫 구간 단가만 적용했어요.</li>
          <li>달러 금액은 AWS 표시 가격(부가세 별도)이에요. 한국 계정은 청구 시 부가세 10%가 더해져서, 원화는 부가세를 포함해 보여줘요.</li>
          <li>원화는 고정 환율 1달러 = ${ex().krwPerUsd.toLocaleString("ko-KR")}원 기준이에요 (${esc(ex().updatedAt)}). 카드사 해외 결제 수수료는 포함하지 않았어요.</li>
          <li>가격 갱신일 ${esc(data.prices.updatedAt)} (${esc(data.prices.source)}) · <a href="#/prices">변동 내역</a></li>
        </ul>
      </details>
    </section>`;
}

function renderResult(template, presetId, regionId, params = new URLSearchParams()) {
  const compareRegionId = compareRegionOf(regionId);
  const regionPrices = data.prices.regions[regionId];
  adjust.overrides = parseOverrides(template.presets.find((p) => p.id === presetId), regionPrices, params);
  domainOn = parseDomain(params) ?? domainState[template.id] ?? Boolean(template.defaultDomain);
  domainState[template.id] = domainOn;
  const hashFor = (p, r, ov) => resultHash(template, p, r, ov, domainOn);
  // 값을 바꿀 때마다 주소도 바꿔둔다 (주소창을 그대로 복사해도 공유되게). 기록은 남기지 않는다.
  const syncUrl = () => history.replaceState(null, "", hashFor(presetId, regionId, adjust.overrides));
  syncUrl();
  const overrides = () => ({ ...adjust.overrides, domain: domainOn ? 1 : 0 });
  const calc = () => calculateTemplate(template, presetId, data.prices, regionId, compareRegionId, overrides());
  const { preset, values, options } = calc();
  document.title = `${template.name} 비용 · AWS 얼마야?`;
  const domainChoices = [
    { id: "off", name: "없음" },
    { id: "on", name: "포함 (.com)" },
  ];

  app.innerHTML = `
    <div class="page-head">
      <a class="back" href="#/t/${template.id}">‹ 다시 고르기</a>
      <p class="step">${template.icon} ${esc(template.name)}</p>
      <h1 class="page-title">예상 월 비용이에요</h1>
    </div>
    <details class="card settings-line" data-key="settings">
      <summary>
        <span><span class="settings-label">계산 조건</span><span id="settings-text">${settingsText(preset, regionId)}</span></span>
        <span class="settings-btn" aria-hidden="true"></span>
      </summary>
      <div class="controls">
        ${chipsHtml("규모", template.presets, presetId).replace(/data-value/g, "data-preset")}
        ${regionChipsHtml(data.prices, regionId, primaryRegions()).replace(/data-value/g, "data-region")}
        ${chipsHtml("도메인 (example.com 같은 주소)", domainChoices, domainOn ? "on" : "off").replace(/data-value/g, "data-domain")}
      </div>
    </details>
    <div id="options">${optionsHtml(options, compareRegionId, values, regionPrices)}</div>
    <div class="share-row"><button type="button" class="btn btn-soft btn-sm" id="share">🔗 이 결과 공유하기</button></div>
    ${adjustHtml(template, preset, values, regionPrices)}
    ${afterLaunchHtml()}
    ${notesHtml(preset, regionId)}`;

  app.querySelectorAll("[data-preset]").forEach((b) =>
    // 규모를 바꾸면 직접 바꾼 값은 비우고(새 프리셋 기준), 도메인 선택은 유지한다.
    b.addEventListener("click", () => (location.hash = hashFor(b.dataset.preset, regionId, {})))
  );
  app.querySelectorAll("[data-region]").forEach((b) =>
    b.addEventListener("click", () => (location.hash = hashFor(presetId, b.dataset.region, adjust.overrides)))
  );

  const optionsEl = app.querySelector("#options");
  const refresh = () => {
    const result = calc();
    app.querySelector("#settings-text").innerHTML = settingsText(preset, regionId);
    keepOpen(optionsEl, () => (optionsEl.innerHTML = optionsHtml(result.options, compareRegionId, result.values, regionPrices)));
    app.querySelector("#adjust-status").innerHTML = adjustStatus(preset);
    app.querySelector("#adjust-reset").hidden = !Object.keys(adjust.overrides).length;
  };

  app.querySelectorAll("[data-domain]").forEach((b) =>
    b.addEventListener("click", () => {
      domainOn = b.dataset.domain === "on";
      domainState[template.id] = domainOn;
      app.querySelectorAll("[data-domain]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      syncUrl();
      refresh();
    })
  );

  const onField = (e) => {
    const el = e.target.closest("[data-field]");
    if (!el) return;
    // 숫자 칸은 input에서만, 선택 칸은 change에서만 계산한다. 숫자 칸의 change(포커스 해제)에서 다시 그리면
    // 바로 이어서 누른 버튼 클릭이 사라진다.
    if (e.type !== (el.tagName === "SELECT" ? "change" : "input")) return;
    const name = el.dataset.field;
    const { value, valid } = readField(el, fieldDef(name));
    el.closest(".field").classList.toggle("invalid", !valid);
    if (!valid) return;
    if (value === preset.values[name]) delete adjust.overrides[name];
    else adjust.overrides[name] = value;
    syncUrl();
    refresh();
  };
  const adjustEl = app.querySelector(".adjust");
  adjustEl.addEventListener("input", onField);
  adjustEl.addEventListener("change", onField);
  app.querySelector("#adjust-reset").addEventListener("click", () => (location.hash = hashFor(presetId, regionId, {})));

  app.querySelector("#share").addEventListener("click", () =>
    shareLink(fullUrl(hashFor(presetId, regionId, adjust.overrides)), `${template.name} AWS 비용 · AWS 얼마야?`)
  );

  optionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-to-calc]");
    if (!btn) return;
    const option = template.options.find((o) => o.id === btn.dataset.toCalc);
    const current = { ...preset.values, ...overrides() };
    importResources(option.resources.map((r) => resolveResource(r, current)), regionId);
    location.hash = "#/calc";
  });
}

// ---- 가격 변동 내역 ----
const SERVICE_NAMES = {
  ec2: "EC2", ebs: "EBS", alb: "ALB", natGateway: "NAT Gateway", publicIpv4: "퍼블릭 IPv4", dataTransferOut: "데이터 전송",
  rds: "RDS", lightsail: "Lightsail", s3: "S3", cloudfront: "CloudFront", amplify: "Amplify", lambda: "Lambda",
  apiGatewayHttp: "API Gateway", dynamodb: "DynamoDB", fargate: "Fargate", route53: "Route 53",
};
const UNIT_NAMES = {
  hourly: "시간당", multiAzHourly: "Multi-AZ 시간당", storagePerGbMonth: "저장 GB-월", perGbMonth: "GB-월", perGb: "GB당",
  lcuHourly: "LCU-시간", perRequest: "요청당", putPerRequest: "업로드 요청당", getPerRequest: "조회 요청당",
  httpsPerRequest: "HTTPS 요청당", buildPerMinute: "빌드 분당", servedPerGb: "전송 GB당", perGbSecondArm: "GB-초 (ARM)",
  perReadUnit: "읽기당", perWriteUnit: "쓰기당", perVcpuHour: "vCPU-시간", perGbHour: "GB-시간", monthly: "월 정액",
  hostedZoneMonthly: "호스팅 영역 월", comDomainYearly: ".com 도메인 연",
};

function changeLabel(item) {
  const parts = item.split("/");
  const service = SERVICE_NAMES[parts[0]] ?? parts[0];
  const unit = UNIT_NAMES[parts.at(-1)] ?? parts.at(-1);
  return [service, ...parts.slice(1, -1), unit].join(" · ");
}

function renderPriceChanges() {
  document.title = "가격 변동 내역 · AWS 얼마야?";
  const c = data.priceChanges;
  const price = (v) => `$${+v.toPrecision(4)}`;
  const rows = c?.changes ?? [];
  app.innerHTML = `
    <div class="page-head">
      <a class="back" href="#/">‹ 처음으로</a>
      <p class="step">📈 가격 변동</p>
      <h1 class="page-title">지난 갱신 대비 바뀐 가격</h1>
      <p class="page-sub">매주 월요일 AWS 공개 가격표를 다시 받아서 비교해요.</p>
    </div>
    <section class="card">
      ${
        c
          ? `<p class="card-sub" style="margin:0 0 12px">${esc(c.previousUpdatedAt ?? "-")} → ${esc(c.updatedAt)} · 바뀐 단가 ${rows.length}건${
              c.addedItems ? ` · 새로 추가된 항목 ${c.addedItems}개` : ""
            }${c.removedItems ? ` · 없어진 항목 ${c.removedItems}개` : ""}</p>`
          : ""
      }
      ${
        rows.length
          ? `<ul class="lines changes">${rows
              .map((r) => {
                const pct = ((r.new - r.old) / r.old) * 100;
                return `<li><div class="change-row">
                  <span><strong>${esc(regionName(r.region))}</strong> · ${esc(changeLabel(r.item))}</span>
                  <span class="num">${price(r.old)} → ${price(r.new)} <span class="${pct > 0 ? "up" : "down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%</span></span>
                </div></li>`;
              })
              .join("")}</ul>`
          : `<div class="empty"><strong>바뀐 가격이 없어요</strong>지난 갱신과 단가가 모두 같아요.</div>`
      }
    </section>`;
}

// ---- 테마 (다크 모드) ----
function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function installThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const sync = () => {
    const dark = effectiveTheme() === "dark";
    btn.textContent = dark ? "☀️" : "🌙";
    btn.setAttribute("aria-label", dark ? "밝은 화면으로" : "어두운 화면으로");
  };
  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* 저장 실패는 무시 (이번 방문에만 적용) */
    }
    sync();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
  sync();
}

// ---- 라우팅 ----
function route() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const [section, templateId, presetId, regionId] = path.split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = (section === "calc" ? "calc" : "home") === a.dataset.nav;
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const template = section === "t" && data.templates.find((x) => x.id === templateId);
  const validResult = template && template.presets.some((p) => p.id === presetId) && data.prices.regions[regionId];
  if (section === "calc") renderCalculator(app, data, params);
  else if (section === "glossary") renderGlossary(app);
  else if (section === "prices") renderPriceChanges();
  else if (validResult) renderResult(template, presetId, regionId, params);
  else if (template) renderSetup(template);
  else renderHome();
  window.scrollTo(0, 0);
}

async function main() {
  installThemeToggle();
  installExpandHandlers();
  try {
    const [prices, templates, settings, glossary, priceChanges] = await Promise.all([
      loadJson("data/prices.json"),
      loadJson("data/templates.json"),
      loadJson("data/settings.json"),
      loadJson("data/glossary.json"),
      loadJson("data/price-changes.json", true),
    ]);
    data = { prices, templates: templates.templates, settings, priceChanges };
    setGlossary(glossary.terms);
    installGlossaryHandlers();
    window.addEventListener("hashchange", route);
    route();
  } catch (err) {
    app.innerHTML = `<p class="error">데이터를 불러오지 못했어요: ${esc(err.message)}</p>`;
    console.error(err);
  }
}

main();
