// 공유 링크: 화면 상태 ↔ 주소. DOM을 쓰지 않아서 Node 테스트에서도 쓴다.
//   결과 화면  #/t/<템플릿>/<프리셋>/<리전>?egressGb=100&domain=1   (사람이 읽을 수 있게 바꾼 값만)
//   직접 계산  #/calc?s=<담은 목록을 JSON → base64url로 줄인 문자열>
import { FIELDS, HIDDEN_ADJUST_FIELDS, choicesFor, fieldDef } from "./schema.js";

/** 결과 화면 주소. 프리셋 기본값과 다른 값, 템플릿 기본과 다른 도메인 설정만 담는다. */
export function resultHash(template, presetId, regionId, overrides = {}, domainOn = Boolean(template.defaultDomain)) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(overrides)) q.set(k, String(v));
  if (domainOn !== Boolean(template.defaultDomain)) q.set("domain", domainOn ? "1" : "0");
  const query = q.toString();
  return `#/t/${template.id}/${presetId}/${regionId}${query ? `?${query}` : ""}`;
}

/**
 * 주소의 ?키=값을 직접 조정 값으로 되돌린다. 모르는 키, 선택지에 없는 값, 범위를 벗어난 숫자는 버린다
 * (오래된 링크나 손으로 고친 링크도 안전하게 열리도록).
 */
export function parseOverrides(preset, regionPrices, params) {
  const out = {};
  for (const [key, raw] of params) {
    if (key === "domain" || !(key in preset.values) || !FIELDS[key] || HIDDEN_ADJUST_FIELDS.has(key)) continue;
    const def = fieldDef(key);
    let value;
    if (def.type === "select") {
      const hit = choicesFor(def, regionPrices).find(([choice]) => String(choice) === raw);
      if (!hit) continue;
      value = hit[0];
    } else {
      value = Number(raw);
      const inRange = (def.min === undefined || value >= def.min) && (def.max === undefined || value <= def.max);
      if (raw.trim() === "" || !Number.isFinite(value) || !inRange) continue;
    }
    if (value !== preset.values[key]) out[key] = value;
  }
  return out;
}

/** 주소의 domain=0/1. 없으면 undefined. */
export function parseDomain(params) {
  if (!params.has("domain")) return undefined;
  return params.get("domain") === "1";
}

// ---- 직접 계산 ----

const toBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** 직접 계산 상태 → 주소에 넣을 문자열. */
export function encodeCalc(region, items) {
  return toBase64Url(JSON.stringify({ r: region, i: items.map((it) => [it.type, it.values]) }));
}

/**
 * 주소 문자열 → { region, items }. 깨졌거나 모르는 서비스만 있으면 null.
 * validTypes에 없는 서비스와 숫자·문자·불리언이 아닌 값은 버린다.
 */
export function decodeCalc(s, validTypes) {
  try {
    const data = JSON.parse(fromBase64Url(s));
    if (!data || !Array.isArray(data.i)) return null;
    const items = data.i
      .filter((x) => Array.isArray(x) && validTypes.includes(x[0]) && x[1] && typeof x[1] === "object")
      .map(([type, values]) => ({
        type,
        values: Object.fromEntries(
          Object.entries(values).filter(([, v]) => ["number", "string", "boolean"].includes(typeof v))
        ),
      }));
    if (!items.length) return null;
    return { region: typeof data.r === "string" ? data.r : undefined, items };
  } catch {
    return null;
  }
}
