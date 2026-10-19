// 여러 화면에서 같이 쓰는 HTML 조각과 입력 처리.
import { formatUsd } from "./engine.js";
import { choicesFor } from "./schema.js";
import { glossarize } from "./glossary.js";

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** 입력 칸 하나. select 값은 숫자·불리언도 있어서 JSON으로 넣고 읽는다. */
export function fieldHtml(def, value, regionPrices, idPrefix) {
  const id = `${idPrefix}-${def.name}`;
  let control;
  if (def.type === "select") {
    const options = choicesFor(def, regionPrices)
      .map(([v, label]) => `<option value="${esc(JSON.stringify(v))}" ${v === value ? "selected" : ""}>${esc(label)}</option>`)
      .join("");
    control = `<select id="${id}" data-field="${def.name}">${options}</select>`;
  } else {
    const attrs = [
      def.min !== undefined && `min="${def.min}"`,
      def.max !== undefined && `max="${def.max}"`,
      def.step !== undefined && `step="${def.step}"`,
    ]
      .filter(Boolean)
      .join(" ");
    control = `<div class="input-wrap">
        <input id="${id}" type="number" inputmode="decimal" data-field="${def.name}" value="${esc(value)}" ${attrs} class="num ${def.unit ? "has-unit" : ""}">
        ${def.unit ? `<span class="unit">${esc(def.unit)}</span>` : ""}
      </div>`;
  }
  return `<div class="field">
      <label for="${id}">${esc(def.label)}</label>
      ${control}
      ${def.help ? `<p class="help">${glossarize(esc(def.help))}</p>` : ""}
    </div>`;
}

/** 입력 칸 값을 읽는다. 숫자 칸이 비었거나 범위를 벗어나면 valid: false. */
export function readField(el, def) {
  if (el.tagName === "SELECT") return { value: JSON.parse(el.value), valid: true };
  if (el.value.trim() === "") return { value: null, valid: false };
  const value = Number(el.value);
  const valid =
    Number.isFinite(value) && (def.min === undefined || value >= def.min) && (def.max === undefined || value <= def.max);
  return { value, valid };
}

export function linesHtml(lines) {
  return `<ul class="lines">${lines
    .map(
      (l) => `
      <li><details>
        <summary><span class="lbl">${esc(l.label)}</span><span class="usd num">${formatUsd(l.usd)}</span></summary>
        <div class="why">${glossarize(esc(l.why))}<span class="formula">${esc(l.detail)}</span></div>
      </details></li>`
    )
    .join("")}</ul>`;
}

// 경고는 돈이 많이 새는 순서로 보여준다. 처음엔 앞의 몇 개만 보이고 나머지는 접어둔다.
const WARNING_PRIORITY = [
  "natGateway", "natGatewayOn", "publicIpv4", "alb", "lightsailStop", "dataTransfer",
  "alwaysOn", "trafficSpike", "rdsMultiAz", "tierExceeded",
];

export function warningsHtml(warnings, limit = 2) {
  if (!warnings.length) return "";
  const rank = (w) => (WARNING_PRIORITY.includes(w.id) ? WARNING_PRIORITY.indexOf(w.id) : 99);
  const sorted = [...warnings].sort((a, b) => rank(a) - rank(b));
  const chip = (w) => `<details class="warn"><summary>${esc(w.title)}</summary><p>${glossarize(esc(w.text))}</p></details>`;
  const rest = sorted.slice(limit);
  return `<div class="warn-chips">${sorted.slice(0, limit).map(chip).join("")}${
    rest.length ? `<span class="warn-extra" hidden>${rest.map(chip).join("")}</span><button type="button" class="chip-more" data-expand>+${rest.length}개 더</button>` : ""
  }</div>`;
}

export function chipsHtml(label, items, current) {
  return `<div class="chips" role="group" aria-label="${esc(label)}">
      <span class="chips-label">${esc(label)}</span>
      ${items
        .map((it) => `<button type="button" class="chip" data-value="${esc(it.id)}" aria-pressed="${it.id === current}">${esc(it.name)}</button>`)
        .join("")}
    </div>`;
}

/** 다시 그려도 펼쳐 둔 <details>가 닫히지 않도록 data-key로 열림 상태를 기억했다가 되살린다. */
export function keepOpen(container, render) {
  const open = new Set([...container.querySelectorAll("details[data-key][open]")].map((d) => d.dataset.key));
  render();
  container.querySelectorAll("details[data-key]").forEach((d) => {
    if (open.has(d.dataset.key)) d.open = true;
  });
}

export function regionList(prices) {
  return Object.entries(prices.regions).map(([id, r]) => ({ id, name: r.name }));
}

/**
 * 리전 칩: 자주 쓰는 리전(primary)만 보이고 나머지는 "다른 리전"으로 접는다.
 * 지금 고른 리전은 항상 보인다. 펼치기는 installExpandHandlers()가 처리한다.
 */
export function regionChipsHtml(prices, current, primary) {
  const items = regionList(prices);
  const extra = items.filter((it) => !primary.includes(it.id) && it.id !== current);
  const chip = (it, hidden) =>
    `<button type="button" class="chip" data-value="${esc(it.id)}" aria-pressed="${it.id === current}" ${hidden ? "hidden" : ""}>${esc(it.name)}</button>`;
  return `<div class="chips" role="group" aria-label="리전">
      <span class="chips-label">리전</span>
      ${items.map((it) => chip(it, extra.includes(it))).join("")}
      ${extra.length ? `<button type="button" class="chip chip-more" data-expand>다른 리전 ${extra.length}곳 ▾</button>` : ""}
    </div>`;
}

/** data-expand 버튼: 같은 묶음 안에 숨겨둔 항목([hidden])을 펼치고 버튼은 사라진다. 페이지에 한 번만 건다. */
export function installExpandHandlers() {
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-expand]");
    if (!btn) return;
    btn.parentElement.querySelectorAll(":scope > [hidden]").forEach((el) => (el.hidden = false));
    btn.remove();
  });
}

// ---- 공유 ----

/** 화면 아래에 잠깐 떴다 사라지는 알림. */
export function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

/** 현재 페이지 기준 전체 주소 (#/... 해시 포함). */
export function fullUrl(hash) {
  return `${location.origin}${location.pathname}${hash}`;
}

/** 휴대폰은 공유창(카카오톡 등), 그 외에는 링크 복사. */
export async function shareLink(url, title) {
  const mobile = matchMedia("(pointer: coarse)").matches;
  if (mobile && navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // 사용자가 공유창을 닫음
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("링크를 복사했어요");
  } catch {
    window.prompt("아래 링크를 복사하세요", url); // 클립보드를 못 쓰는 환경
  }
}

// ---- 만든 다음 꼭 할 일 ----
const AFTER_LAUNCH = [
  ["예산 알림부터 켜기", "결제 대시보드의 AWS Budgets에서 '월 예상 금액보다 조금 높은 금액'을 넘으면 메일이 오도록 해두세요."],
  ["안 쓰면 '중지'보다 '삭제'", "Lightsail·NAT Gateway·로드밸런서는 중지해도, 켜두기만 해도 요금이 나가요. EC2는 중지해도 디스크(EBS) 요금이 나가요."],
  ["다 쓴 뒤 남은 것 정리", "서버를 지워도 퍼블릭 IPv4 주소, 스냅샷, EBS 디스크가 남아서 계속 과금되는 경우가 많아요."],
  ["첫 달 청구서 확인", "결제 대시보드의 서비스별 요금에서 이 계산과 크게 다른 항목이 없는지 한 번 봐주세요."],
];

export function afterLaunchHtml() {
  return `<section class="card after-launch">
      <h2 class="card-title">만든 다음 꼭 할 일</h2>
      <p class="card-sub">요금 폭탄은 대부분 이 네 가지를 놓쳐서 생겨요</p>
      <ol>${AFTER_LAUNCH.map(([title, text]) => `<li><strong>${esc(title)}</strong><span>${glossarize(esc(text))}</span></li>`).join("")}</ol>
    </section>`;
}
