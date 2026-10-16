import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RESOURCE_TYPES, calculateOption } from "../js/engine.js";
import { FIELDS, SERVICES, choicesFor, fieldDef } from "../js/schema.js";

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const prices = load("prices.json");
const { templates } = load("templates.json");

test("직접 계산기의 서비스는 모두 엔진이 계산할 수 있다", () => {
  for (const s of SERVICES) {
    assert.ok(RESOURCE_TYPES.includes(s.type), s.type);
    for (const region of Object.values(prices.regions)) {
      const resource = { type: s.type, ...Object.fromEntries(s.fields.map(([k, v]) => [k, v])) };
      const r = calculateOption({ resources: [resource] }, {}, region);
      assert.ok(Number.isFinite(r.totalUsd) && r.totalUsd > 0, s.type);
    }
  }
});

test("엔진의 모든 리소스 타입을 직접 계산기에서 고를 수 있다", () => {
  for (const type of RESOURCE_TYPES) assert.ok(SERVICES.some((s) => s.type === type), type);
});

test("선택 칸의 기본값은 선택지 안에 있다", () => {
  for (const s of SERVICES)
    for (const [name, value, override] of s.fields) {
      const def = fieldDef(name, override);
      if (def.type !== "select") continue;
      for (const region of Object.values(prices.regions))
        assert.ok(choicesFor(def, region).some(([v]) => v === value), `${s.type}.${name}=${value}`);
    }
});

test("템플릿 프리셋 값도 직접 조정 칸의 선택지·범위 안에 있다", () => {
  for (const t of templates)
    for (const p of t.presets)
      for (const [name, value] of Object.entries(p.values)) {
        const def = FIELDS[name] && fieldDef(name);
        assert.ok(def, `${t.id}: '${name}' 입력 칸 정의가 없어요`);
        if (def.type === "select") {
          for (const region of Object.values(prices.regions))
            assert.ok(choicesFor(def, region).some(([v]) => v === value), `${t.id}/${p.id}.${name}=${value}`);
        } else {
          assert.ok(value >= (def.min ?? 0) && value <= (def.max ?? Infinity), `${t.id}/${p.id}.${name}=${value}`);
        }
      }
});
