// 화면 렌더링. 주소(#/...)로 화면을 나눠서 뒤로 가기와 링크 공유가 그대로 동작한다.
//   #/                              메인 (템플릿 선택)
//   #/t/<템플릿>                    설정 (규모, 리전)
//   #/t/<템플릿>/<프리셋>/<리전>     결과
import { calculateTemplate, formatKrw, formatUsd, HOURS_PER_MONTH } from "./engine.js";

const app = document.getElementById("app");
let data; // { prices, templates, settings }

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} 불러오기 실패 (${res.status})`);
  return res.json();
}

function regionName(id) {
  return data.prices.regions[id]?.name ?? id;
}

// ---- 메인 ----
function renderHome() {
  document.title = "AWS 얼마야?";
  app.innerHTML = `
    <h1>무엇을 만들고 싶나요?</h1>
    <p class="lead">하고 싶은 것을 고르면 필요한 AWS 구성과 예상 월 비용을 비교해드려요. AWS 계정은 필요 없어요.</p>
    <div class="grid">
      ${data.templates
        .map(
          (t) => `
        <a class="card template-card" href="#/t/${t.id}">
          <div class="icon" aria-hidden="true">${t.icon}</div>
          <h3>${esc(t.name)}</h3>
          <p>${esc(t.summary)}</p>
          <div class="options-hint">${t.options.map((o) => esc(o.name)).join(" · ")}</div>
        </a>`
        )
        .join("")}
    </div>`;
}

// ---- 설정 ----
function renderSetup(template) {
  document.title = `${template.name} · AWS 얼마야?`;
  const regions = Object.keys(data.prices.regions);
  app.innerHTML = `
    <a class="back" href="#/">← 처음으로</a>
    <h1>${template.icon} ${esc(template.name)}</h1>
    <p class="lead">규모와 리전을 고르면 바로 계산해드려요.</p>
    <form id="setup">
      <h2>얼마나 쓰나요?</h2>
      <fieldset class="choice-group">
        ${template.presets
          .map(
            (p, i) => `
          <label class="choice">
            <input type="radio" name="preset" value="${p.id}" ${i === 0 ? "checked" : ""}>
            <strong>${esc(p.name)}</strong>
            <span>${esc(p.description)}</span>
          </label>`
          )
          .join("")}
      </fieldset>
      <h2>어느 리전에 만드나요?</h2>
      <fieldset class="choice-group">
        ${regions
          .map(
            (r) => `
          <label class="choice">
            <input type="radio" name="region" value="${r}" ${r === data.settings.defaultRegion ? "checked" : ""}>
            <strong>${esc(regionName(r))}</strong>
            <span>${r}</span>
          </label>`
          )
          .join("")}
      </fieldset>
      <div class="actions"><button class="btn-primary" type="submit">결과 보기</button></div>
    </form>`;
  app.querySelector("#setup").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    location.hash = `#/t/${template.id}/${f.get("preset")}/${f.get("region")}`;
  });
}

// ---- 결과 ----
function segmented(label, items, current, hrefFor) {
  return `
    <div>
      <span class="control-label">${label}</span>
      <span class="segmented">
        ${items
          .map(
            (it) =>
              `<button type="button" data-href="${hrefFor(it.id)}" aria-pressed="${it.id === current}">${esc(it.name)}</button>`
          )
          .join("")}
      </span>
    </div>`;
}

function renderOptionCard(o, regionId, compareRegionId) {
  const rate = data.settings.exchangeRate.krwPerUsd;
  const compare =
    o.compareTotalUsd !== undefined
      ? `<div class="region-compare">${esc(regionName(compareRegionId))}(${compareRegionId})라면 ${formatUsd(o.compareTotalUsd)}</div>`
      : "";
  return `
    <article class="card option-card">
      <h3>${esc(o.name)} ${o.isCheapest ? '<span class="tag-cheapest">가장 저렴</span>' : ""}</h3>
      <p class="summary">${esc(o.summary)}</p>
      <div class="total">
        <span class="usd">${formatUsd(o.totalUsd)}</span><span class="per"> / 월</span>
        <div class="krw">${formatKrw(o.totalUsd, rate)}</div>
        ${compare}
      </div>

      <div class="section-title">항목별 내역 <small>(눌러서 이유 보기)</small></div>
      <ul class="lines">
        ${o.lines
          .map(
            (l) => `
          <li><details>
            <summary><span class="line-label">${esc(l.label)}</span><span class="line-usd">${formatUsd(l.usd)}</span></summary>
            <div class="why">${esc(l.why)}<span class="formula">${esc(l.detail)}</span></div>
          </details></li>`
          )
          .join("")}
      </ul>

      <div class="pros-cons">
        <div><div class="section-title">장점</div><ul class="pros">${o.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
        <div><div class="section-title">단점</div><ul class="cons">${o.cons.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      </div>

      ${
        o.warnings.length
          ? `<div class="section-title">숨은 비용 주의</div>
             <div class="badges">${o.warnings
               .map((w) => `<details class="badge"><summary>${esc(w.title)}</summary><p>${esc(w.text)}</p></details>`)
               .join("")}</div>`
          : ""
      }
    </article>`;
}

function renderResult(template, presetId, regionId) {
  const compareRegionId = Object.keys(data.prices.regions).find((r) => r !== regionId);
  const { preset, options } = calculateTemplate(template, presetId, data.prices, regionId, compareRegionId);
  const max = Math.max(...options.map((o) => o.totalUsd), 0.01);
  const ex = data.settings.exchangeRate;
  const regions = Object.keys(data.prices.regions).map((id) => ({ id, name: regionName(id) }));
  document.title = `${template.name} 비용 · AWS 얼마야?`;

  app.innerHTML = `
    <a class="back" href="#/t/${template.id}">← 설정으로</a>
    <h1>${template.icon} ${esc(template.name)} 예상 월 비용</h1>
    <div class="result-controls">
      ${segmented("규모", template.presets, presetId, (id) => `#/t/${template.id}/${id}/${regionId}`)}
      ${segmented("리전", regions, regionId, (id) => `#/t/${template.id}/${presetId}/${id}`)}
    </div>

    ${
      options.length > 1
        ? `<div class="card compare-bars" aria-label="구성안별 월 비용 비교">
            ${options
              .map(
                (o) => `
              <div class="bar-row ${o.isCheapest ? "cheapest" : ""}">
                <span>${esc(o.name)}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(o.totalUsd / max) * 100}%"></div></div>
                <span class="bar-value">${formatUsd(o.totalUsd)}</span>
              </div>`
              )
              .join("")}
          </div>`
        : ""
    }

    <div class="option-grid">
      ${options.map((o) => renderOptionCard(o, regionId, compareRegionId)).join("")}
    </div>

    <section class="card notes">
      <strong>이런 가정으로 계산했어요 (${esc(preset.name)} · ${esc(regionName(regionId))})</strong>
      <ul>${preset.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <ul>
        <li>한 달 = ${HOURS_PER_MONTH}시간, 온디맨드 요금 기준이에요.</li>
        <li>구간별로 단가가 달라지는 요금(전송량, S3 등)은 첫 구간 단가만 적용했어요.</li>
        <li>프리티어·크레딧은 반영하지 않았어요. 신규 계정이라면 실제로는 더 적게 나올 수 있어요 → <a href="https://aws.amazon.com/free/" target="_blank" rel="noopener">AWS 프리티어 안내</a></li>
        <li>가격 갱신일: ${esc(data.prices.updatedAt)} (${esc(data.prices.source)})</li>
        <li>원화는 고정 환율 1달러 = ${ex.krwPerUsd.toLocaleString("ko-KR")}원 기준이에요 (환율 기준일 ${esc(ex.updatedAt)}).</li>
        <li>예상치이며 실제 청구액과 다를 수 있어요. 정확한 견적은 <a href="https://calculator.aws/" target="_blank" rel="noopener">AWS Pricing Calculator</a>에서 확인하세요.</li>
      </ul>
    </section>`;

  app.querySelectorAll("[data-href]").forEach((b) => b.addEventListener("click", () => (location.hash = b.dataset.href)));
}

// ---- 라우팅 ----
function route() {
  const [section, templateId, presetId, regionId] = location.hash.replace(/^#\/?/, "").split("/");
  const template = section === "t" && data.templates.find((x) => x.id === templateId);
  const validResult = template && template.presets.some((p) => p.id === presetId) && data.prices.regions[regionId];
  if (validResult) renderResult(template, presetId, regionId);
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
