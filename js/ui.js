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

export function warningsHtml(warnings) {
  if (!warnings.length) return "";
  return `<div class="warn-chips">${warnings
    .map((w) => `<details class="warn"><summary>${esc(w.title)}</summary><p>${glossarize(esc(w.text))}</p></details>`)
    .join("")}</div>`;
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
