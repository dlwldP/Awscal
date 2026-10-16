// 화면 렌더링과 라우팅. 주소(#/...)로 화면을 나눠서 뒤로 가기와 링크 공유가 그대로 동작한다.
//   #/                              메인 (무엇을 만들까요?)
//   #/t/<템플릿>                    설정 (규모, 리전)
//   #/t/<템플릿>/<프리셋>/<리전>     결과 (+ 값 직접 조정)
//   #/calc                          직접 계산기
import { calculateTemplate, formatKrw, formatUsd, HOURS_PER_MONTH, resolveResource } from "./engine.js";
import { FIELDS, fieldDef } from "./schema.js";
import { chipsHtml, esc, fieldHtml, keepOpen, linesHtml, readField, regionList, warningsHtml } from "./ui.js";
import { importResources, renderCalculator } from "./calculator.js";

const app = document.getElementById("app");
let data; // { prices, templates, settings }

// 결과 화면에서 직접 바꾼 값. 템플릿·프리셋이 바뀌면 비운다.
const adjust = { key: "", overrides: {} };

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} 불러오기 실패 (${res.status})`);
  return res.json();
}

const regionName = (id) => data.prices.regions[id]?.name ?? id;
const krw = (usd) => formatKrw(usd, data.settings.exchangeRate.krwPerUsd);

// ---- 메인 ----
function renderHome() {
  document.title = "AWS 얼마야? · 초보자용 AWS 비용 계산기";
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
      <h2 class="card-title">쓸 서비스를 이미 알고 있다면</h2>
      <p class="card-sub">EC2, RDS, S3 같은 서비스를 직접 담아서 계산해요</p>
      <ul class="list">
        <li><a class="row" href="#/calc">
          <span class="ico" aria-hidden="true">🧮</span>
          <span class="txt"><span class="ttl">직접 계산하기</span><span class="dsc">서비스 15종 · 사양과 사용량을 내 마음대로</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </a></li>
      </ul>
    </section>

    <div class="trust">
      <span>AWS 계정 없이 무료</span>
      <span>가격 매주 자동 갱신 (${esc(data.prices.updatedAt)})</span>
      <span>숨은 비용까지 알려드려요</span>
    </div>`;
}

// ---- 설정 ----
function renderSetup(template) {
  document.title = `${template.name} · AWS 얼마야?`;
  const regionHints = { "ap-northeast-2": "한국 사용자 대상이라면 여기", "us-east-1": "가장 저렴한 리전 중 하나" };
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
            .map((r) => choice("region", r.id, `${r.name} (${r.id})`, regionHints[r.id] ?? "", r.id === data.settings.defaultRegion))
            .join("")}
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
function summaryHtml(options) {
  const best = options.find((o) => o.isCheapest) ?? options[0];
  const lead = options.length > 1 ? `가장 저렴한 건 <strong>${esc(best.name)}</strong>예요` : `${esc(best.name)}로 만들면`;
  return `
    <p class="card-sub" style="margin:0 0 4px">${lead}</p>
    <div class="summary-amount num">월 ${formatUsd(best.totalUsd)}</div>
    <div class="summary-krw num">${krw(best.totalUsd)}</div>`;
}

function barsHtml(options) {
  if (options.length < 2) return "";
  const max = Math.max(...options.map((o) => o.totalUsd), 0.01);
  return `
    <div class="section-label" style="margin-top:20px">구성별 비교</div>
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

function optionHtml(o, compareRegionId) {
  return `
    <article class="card">
      <div class="option-head">
        <h3 class="option-name">${esc(o.name)}</h3>
        ${o.isCheapest ? '<span class="tag tag-blue">가장 저렴</span>' : ""}
      </div>
      <p class="option-summary">${esc(o.summary)}</p>
      <div class="amount num">${formatUsd(o.totalUsd)} <small>/ 월</small></div>
      <div class="amount-krw num">${krw(o.totalUsd)}</div>
      ${
        o.compareTotalUsd !== undefined
          ? `<div class="amount-compare num">${esc(regionName(compareRegionId))}에 만들면 ${formatUsd(o.compareTotalUsd)}</div>`
          : ""
      }
      ${warningsHtml(o.warnings)}
      <details class="more" data-key="more-${o.id}">
        <summary>비용 내역 · 장단점</summary>
        <div class="section-label">항목별 내역 <span style="font-weight:500">(누르면 이유가 보여요)</span></div>
        ${linesHtml(o.lines)}
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
  const keys = Object.keys(preset.values).filter((k) => FIELDS[k]);
  const changed = Object.keys(adjust.overrides).length;
  return `
    <details class="card adjust" data-key="adjust" ${changed ? "open" : ""}>
      <summary>
        <span><span class="card-title" style="display:block">값 직접 바꿔보기</span>
        <span class="card-sub" style="display:block;margin:0">서버 사양, 트래픽 같은 값을 바꾸면 바로 다시 계산해요</span></span>
      </summary>
      <div class="fields">${keys.map((k) => fieldHtml(fieldDef(k), values[k], regionPrices, "adj")).join("")}</div>
      <div class="adjust-foot">
        <span id="adjust-status">${changed ? `<span class="modified">${changed}개 값을 바꿨어요</span>` : `'${esc(preset.name)}' 기본값이에요`}</span>
        <button type="button" class="btn btn-ghost btn-sm" id="adjust-reset" ${changed ? "" : "hidden"}>기본값으로</button>
      </div>
    </details>`;
}

function notesHtml(preset, regionId) {
  const ex = data.settings.exchangeRate;
  const changed = Object.keys(adjust.overrides).length;
  return `
    <section class="card notes">
      <h2 class="card-title">이런 가정으로 계산했어요</h2>
      <p class="card-sub" style="margin:0">${esc(preset.name)} · ${esc(regionName(regionId))}${changed ? " · 직접 바꾼 값은 위 입력 칸 기준" : ""}</p>
      <ul>${preset.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <ul>
        <li>한 달 = ${HOURS_PER_MONTH}시간, 온디맨드 요금 기준이에요.</li>
        <li>구간별로 단가가 달라지는 요금(전송량, S3 등)은 첫 구간 단가만 적용했어요.</li>
        <li>프리티어·크레딧은 반영하지 않았어요. 신규 계정이라면 실제로는 더 적게 나올 수 있어요 → <a href="https://aws.amazon.com/free/" target="_blank" rel="noopener">AWS 프리티어 안내</a></li>
        <li>가격 갱신일 ${esc(data.prices.updatedAt)} (${esc(data.prices.source)})</li>
        <li>원화는 고정 환율 1달러 = ${ex.krwPerUsd.toLocaleString("ko-KR")}원 기준이에요 (${esc(ex.updatedAt)}).</li>
        <li>예상치이며 실제 청구액과 다를 수 있어요. 정확한 견적은 <a href="https://calculator.aws/" target="_blank" rel="noopener">AWS Pricing Calculator</a>에서 확인하세요.</li>
      </ul>
    </section>`;
}

function renderResult(template, presetId, regionId) {
  const key = `${template.id}/${presetId}`;
  if (adjust.key !== key) Object.assign(adjust, { key, overrides: {} });
  const compareRegionId = Object.keys(data.prices.regions).find((r) => r !== regionId);
  const regionPrices = data.prices.regions[regionId];
  const calc = () => calculateTemplate(template, presetId, data.prices, regionId, compareRegionId, adjust.overrides);
  const { preset, values, options } = calc();
  document.title = `${template.name} 비용 · AWS 얼마야?`;

  app.innerHTML = `
    <div class="page-head">
      <a class="back" href="#/t/${template.id}">‹ 다시 고르기</a>
      <p class="step">${template.icon} ${esc(template.name)}</p>
      <h1 class="page-title">예상 월 비용이에요</h1>
    </div>
    <div class="controls">
      ${chipsHtml("규모", template.presets, presetId).replace(/data-value/g, "data-preset")}
      ${chipsHtml("리전", regionList(data.prices), regionId).replace(/data-value/g, "data-region")}
    </div>
    <section class="card" id="summary">${summaryHtml(options)}${barsHtml(options)}</section>
    ${adjustHtml(template, preset, values, regionPrices)}
    <div id="options">${options.map((o) => optionHtml(o, compareRegionId)).join("")}</div>
    ${notesHtml(preset, regionId)}`;

  app.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => (location.hash = `#/t/${template.id}/${b.dataset.preset}/${regionId}`))
  );
  app.querySelectorAll("[data-region]").forEach((b) =>
    b.addEventListener("click", () => (location.hash = `#/t/${template.id}/${presetId}/${b.dataset.region}`))
  );

  const optionsEl = app.querySelector("#options");
  const refresh = () => {
    const result = calc();
    app.querySelector("#summary").innerHTML = summaryHtml(result.options) + barsHtml(result.options);
    keepOpen(optionsEl, () => (optionsEl.innerHTML = result.options.map((o) => optionHtml(o, compareRegionId)).join("")));
    const changed = Object.keys(adjust.overrides).length;
    app.querySelector("#adjust-status").innerHTML = changed
      ? `<span class="modified">${changed}개 값을 바꿨어요</span>`
      : `'${esc(preset.name)}' 기본값이에요`;
    app.querySelector("#adjust-reset").hidden = !changed;
  };

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
    refresh();
  };
  const adjustEl = app.querySelector(".adjust");
  adjustEl.addEventListener("input", onField);
  adjustEl.addEventListener("change", onField);
  app.querySelector("#adjust-reset").addEventListener("click", () => {
    adjust.overrides = {};
    renderResult(template, presetId, regionId);
  });

  optionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-to-calc]");
    if (!btn) return;
    const option = template.options.find((o) => o.id === btn.dataset.toCalc);
    const current = { ...preset.values, ...adjust.overrides };
    importResources(option.resources.map((r) => resolveResource(r, current)), regionId);
    location.hash = "#/calc";
  });
}

// ---- 라우팅 ----
function route() {
  const [section, templateId, presetId, regionId] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = (section === "calc" ? "calc" : "home") === a.dataset.nav;
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const template = section === "t" && data.templates.find((x) => x.id === templateId);
  const validResult = template && template.presets.some((p) => p.id === presetId) && data.prices.regions[regionId];
  if (section === "calc") renderCalculator(app, data);
  else if (validResult) renderResult(template, presetId, regionId);
  else if (template) renderSetup(template);
  else renderHome();
  window.scrollTo(0, 0);
}

async function main() {
  try {
    const [prices, templates, settings] = await Promise.all([
      loadJson("data/prices.json"),
      loadJson("data/templates.json"),
      loadJson("data/settings.json"),
    ]);
    data = { prices, templates: templates.templates, settings };
    window.addEventListener("hashchange", route);
    route();
  } catch (err) {
    app.innerHTML = `<p class="error">데이터를 불러오지 못했어요: ${esc(err.message)}</p>`;
    console.error(err);
  }
}

main();
