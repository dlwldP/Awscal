// 직접 계산기: 서비스를 하나씩 담고 사양·사용량을 입력하면 월 합계를 계산한다.
// 담은 목록은 이 브라우저에만 저장된다 (localStorage, 실패해도 동작에는 지장 없음).
import { calculateOption, formatKrw, formatUsd } from "./engine.js";
import { SERVICES, fieldDef } from "./schema.js";
import { afterLaunchHtml, esc, fieldHtml, fullUrl, keepOpen, linesHtml, readField, regionChipsHtml, shareLink, toast, warningsHtml } from "./ui.js";
import { decodeCalc, encodeCalc } from "./share.js";

const STORAGE_KEY = "aws-eolmaya:calculator";
let state = null; // { region, items: [{ uid, type, values }] }
let nextUid = 1;

const serviceOf = (type) => SERVICES.find((s) => s.type === type);
const defsOf = (service) => service.fields.map(([name, , override]) => fieldDef(name, override));

function load(defaultRegion) {
  if (state) return state;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.items)) {
      state = { region: saved.region, items: saved.items.filter((i) => serviceOf(i.type)) };
    }
  } catch {
    /* 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 빈 상태로 시작 */
  }
  state ??= { region: defaultRegion, items: [] };
  for (const item of state.items) item.uid = nextUid++;
  return state;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ region: state.region, items: state.items.map(({ type, values }) => ({ type, values })) }));
  } catch {
    /* 저장 실패는 무시 */
  }
}

function newItem(type, values = {}) {
  const service = serviceOf(type);
  const defaults = Object.fromEntries(service.fields.map(([name, value]) => [name, value]));
  return { uid: nextUid++, type, values: { ...defaults, ...values } };
}

/** 결과 화면의 구성(값이 채워진 리소스 목록)을 계산기로 가져온다. 기존 목록은 바꾼다. */
export function importResources(resources, region) {
  load(region);
  state.region = region;
  state.items = resources
    .filter((r) => r.count !== 0 && serviceOf(r.type))
    .map((r) => {
      const values = {};
      for (const [name] of serviceOf(r.type).fields) if (r[name] !== undefined) values[name] = r[name];
      if (r.type === "publicIpv4" && r.multiplier) values.count = r.count * r.multiplier;
      return newItem(r.type, values);
    });
  save();
}

/** 항목 하나를 계산한다. 입력값이 잘못됐으면 error를 돌려준다. */
function calcItem(item, regionPrices) {
  if (item.invalid?.size) return { error: "입력값을 확인해주세요" };
  try {
    return calculateOption({ resources: [{ type: item.type, ...item.values }] }, {}, regionPrices);
  } catch (err) {
    return { error: err.message };
  }
}

function itemCostHtml(result) {
  return result.error ? `<span class="item-error">${esc(result.error)}</span>` : `<span class="num">${formatUsd(result.totalUsd)}</span>`;
}

function itemDetailHtml(item, result) {
  if (result.error) return "";
  return `${warningsHtml(result.warnings)}
    <details class="more" data-key="lines-${item.uid}">
      <summary>계산 내역</summary>
      ${linesHtml(result.lines)}
    </details>`;
}

function itemHtml(item, regionPrices) {
  const service = serviceOf(item.type);
  const result = calcItem(item, regionPrices);
  return `
    <article class="card" data-uid="${item.uid}">
      <div class="item-head">
        <span class="ico" aria-hidden="true">${service.icon}</span>
        <span class="txt"><span class="ttl">${esc(service.name)}</span><span class="dsc">${esc(service.desc)}</span></span>
        <span class="item-cost" data-cost>${itemCostHtml(result)}</span>
        <button type="button" class="remove" data-remove aria-label="${esc(service.name)} 빼기">×</button>
      </div>
      <div class="fields">${defsOf(service)
        .map((def) => fieldHtml(def, item.values[def.name], regionPrices, `i${item.uid}`))
        .join("")}</div>
      <div data-detail>${itemDetailHtml(item, result)}</div>
    </article>`;
}

function totalHtml(regionPrices, krwPerUsd, vatRate) {
  const results = state.items.map((i) => calcItem(i, regionPrices));
  const total = results.reduce((sum, r) => sum + (r.error ? 0 : r.totalUsd), 0);
  const errors = results.filter((r) => r.error).length;
  return `
    <span class="label">월 합계${errors ? ` <small class="item-error">(${errors}개 확인 필요)</small>` : ""}</span>
    <span><span class="usd num" style="display:block;text-align:right">${formatUsd(total)}</span>
    <span class="krw num" style="display:block">${formatKrw(total, krwPerUsd, vatRate)} (부가세 포함)</span></span>`;
}

function servicePickerHtml() {
  return `<div class="service-grid">${SERVICES.map(
    (s) => `<button type="button" class="service-btn" data-add="${s.type}">
        <span class="ico" aria-hidden="true">${s.icon}</span><span class="ttl">${esc(s.name)}</span><span class="dsc">${esc(s.desc)}</span>
      </button>`
  ).join("")}</div>`;
}

/** 공유받은 링크(#/calc?s=...)를 연 경우: 목록이 비어 있으면 바로, 아니면 물어보고 바꾼다. */
function applySharedLink(params, data) {
  if (!params?.has("s")) return;
  history.replaceState(null, "", "#/calc"); // 새로고침해도 다시 묻지 않게 주소에서 지운다
  const shared = decodeCalc(params.get("s"), SERVICES.map((x) => x.type));
  if (!shared) {
    toast("공유 링크를 읽지 못했어요");
    return;
  }
  const same = encodeCalc(state.region, state.items) === encodeCalc(shared.region, shared.items);
  if (same) return;
  if (state.items.length && !confirm("받은 구성으로 바꿀까요?\n지금 담아둔 목록은 사라져요.")) return;
  state.region = data.prices.regions[shared.region] ? shared.region : data.settings.defaultRegion;
  state.items = shared.items.map((it) => newItem(it.type, it.values));
  save();
  toast("받은 구성을 불러왔어요");
}

export function renderCalculator(app, data, params) {
  load(data.settings.defaultRegion);
  applySharedLink(params, data);
  if (!data.prices.regions[state.region]) state.region = data.settings.defaultRegion;
  for (const item of state.items) item.invalid = undefined; // 다시 그리면 입력 칸이 저장된(올바른) 값으로 돌아간다
  const regionPrices = data.prices.regions[state.region];
  const { krwPerUsd, vatRate } = data.settings.exchangeRate;
  document.title = "직접 계산하기 · AWS 얼마야?";

  app.innerHTML = `
    <div class="page-head">
      <a class="back" href="#/">‹ 처음으로</a>
      <p class="step">🧮 직접 계산</p>
      <h1 class="page-title">쓸 서비스를 담아보세요</h1>
      <p class="page-sub">사양과 사용량을 입력하면 월 비용을 바로 계산해요.</p>
    </div>
    ${state.items.length ? `<div class="share-row"><button type="button" class="btn btn-soft btn-sm" id="share-calc">🔗 이 계산 공유하기</button></div>` : ""}
    <div class="controls">${regionChipsHtml(data.prices, state.region, [data.settings.defaultRegion, data.settings.compareRegion])}</div>
    <div id="items">${state.items.map((i) => itemHtml(i, regionPrices)).join("")}</div>
    <section class="card">
      ${
        state.items.length
          ? `<h2 class="card-title">서비스 더 담기</h2>`
          : `<div class="empty"><strong>아직 담은 서비스가 없어요</strong>아래에서 쓸 서비스를 골라주세요. 뭘 써야 할지 모르겠다면 <a href="#/">구성 추천</a>부터 해보세요.</div>`
      }
      <div style="margin-top:12px">${servicePickerHtml()}</div>
      ${state.items.length ? `<div style="margin-top:14px;text-align:right"><button type="button" class="btn btn-ghost btn-sm" data-clear>모두 비우기</button></div>` : ""}
    </section>
    ${state.items.length ? afterLaunchHtml() : ""}
    <section class="card notes">
      <h2 class="card-title">계산 기준</h2>
      <ul>
        <li>${esc(data.prices.regions[state.region].name)} 리전 온디맨드 요금, 한 달 = 730시간이에요.</li>
        <li>구간 요금은 첫 구간 단가만 써요. 프리티어·크레딧은 반영하지 않아요.</li>
        <li>가격 갱신일 ${esc(data.prices.updatedAt)} · 1달러 = ${krwPerUsd.toLocaleString("ko-KR")}원 고정 환율</li>
        <li>달러는 부가세 별도, 원화는 부가세 10% 포함이에요 (한국 계정 청구 기준).</li>
      </ul>
    </section>
    <div class="total-bar" id="total">${totalHtml(regionPrices, krwPerUsd, vatRate)}</div>`;

  const rerender = () => renderCalculator(app, data);
  const itemsEl = app.querySelector("#items");
  const updateTotal = () => (app.querySelector("#total").innerHTML = totalHtml(regionPrices, krwPerUsd, vatRate));

  app.querySelectorAll(".chip[data-value]").forEach((b) =>
    b.addEventListener("click", () => {
      state.region = b.dataset.value;
      save();
      keepOpen(app, rerender);
    })
  );

  app.querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", () => {
      state.items.push(newItem(b.dataset.add));
      save();
      keepOpen(app, rerender);
      app.querySelector(`[data-uid="${state.items.at(-1).uid}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    })
  );

  app.querySelector("#share-calc")?.addEventListener("click", () =>
    shareLink(fullUrl(`#/calc?s=${encodeCalc(state.region, state.items)}`), "내 AWS 구성 비용 · AWS 얼마야?")
  );

  app.querySelector("[data-clear]")?.addEventListener("click", () => {
    if (!confirm("담은 서비스를 모두 비울까요?")) return;
    state.items = [];
    save();
    rerender();
  });

  itemsEl.addEventListener("click", (e) => {
    const card = e.target.closest("[data-uid]");
    if (!card || !e.target.closest("[data-remove]")) return;
    state.items = state.items.filter((i) => i.uid !== Number(card.dataset.uid));
    save();
    keepOpen(app, rerender);
  });

  const onField = (e) => {
    const el = e.target.closest("[data-field]");
    const card = e.target.closest("[data-uid]");
    if (!el || !card) return;
    // 숫자 칸은 input에서만, 선택 칸은 change에서만 계산한다. 숫자 칸의 change(포커스 해제)에서 다시 그리면
    // 바로 이어서 누른 버튼 클릭이 사라진다.
    if (e.type !== (el.tagName === "SELECT" ? "change" : "input")) return;
    const item = state.items.find((i) => i.uid === Number(card.dataset.uid));
    const def = defsOf(serviceOf(item.type)).find((d) => d.name === el.dataset.field);
    const { value, valid } = readField(el, def);
    el.closest(".field").classList.toggle("invalid", !valid);
    item.invalid ??= new Set();
    if (valid) {
      item.invalid.delete(def.name);
      item.values[def.name] = value;
      save();
    } else {
      item.invalid.add(def.name);
    }
    const result = calcItem(item, regionPrices);
    card.querySelector("[data-cost]").innerHTML = itemCostHtml(result);
    const detail = card.querySelector("[data-detail]");
    keepOpen(detail, () => (detail.innerHTML = itemDetailHtml(item, result)));
    updateTotal();
  };
  itemsEl.addEventListener("input", onField);
  itemsEl.addEventListener("change", onField);
}
