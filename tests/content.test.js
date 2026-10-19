// 템플릿 내용, 용어 사전, 정적 HTML이 서로 맞는지 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateOption, calculateTemplate, formatKrw } from "../js/engine.js";
import { glossarize, setGlossary } from "../js/glossary.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const load = (p) => JSON.parse(read(p));
const prices = load("data/prices.json");
const settings = load("data/settings.json");
const { templates } = load("data/templates.json");
const { terms } = load("data/glossary.json");

test("원화는 부가세를 더해 표시한다", () => {
  assert.equal(formatKrw(10, 1400, 0.1), "약 15,400원");
  assert.equal(formatKrw(10, 1400), "약 14,000원");
  assert.equal(settings.exchangeRate.vatRate, 0.1);
});

test("도메인은 등록비(연 ÷ 12) + 호스팅 영역으로 계산한다", () => {
  const p = prices.regions[settings.defaultRegion];
  const r = calculateOption({ resources: [{ type: "domain", count: 1 }] }, {}, p);
  assert.ok(Math.abs(r.totalUsd - (p.route53.comDomainYearly / 12 + p.route53.hostedZoneMonthly)) < 1e-9);
});

test("도메인을 켜면 모든 구성안 비용이 같은 만큼 늘어난다", () => {
  const region = settings.defaultRegion;
  const p = prices.regions[region];
  const domainUsd = p.route53.comDomainYearly / 12 + p.route53.hostedZoneMonthly;
  for (const t of templates) {
    const off = calculateTemplate(t, t.presets[0].id, prices, region);
    const on = calculateTemplate(t, t.presets[0].id, prices, region, undefined, { domain: 1 });
    off.options.forEach((o, i) => assert.ok(Math.abs(on.options[i].totalUsd - o.totalUsd - domainUsd) < 1e-9, `${t.id}/${o.id}`));
  }
});

test("구성안마다 난이도·포함 안 된 비용이 있고, 추천은 템플릿당 최대 1개다", () => {
  for (const t of templates) {
    assert.ok(t.options.filter((o) => o.recommended).length <= 1, t.id);
    for (const o of t.options) {
      assert.ok(["쉬움", "보통", "어려움"].includes(o.difficulty), `${t.id}/${o.id}`);
      assert.ok(Array.isArray(o.excluded) && o.excluded.length > 0, `${t.id}/${o.id}`);
      assert.ok(o.resources.some((r) => r.type === "domain"), `${t.id}/${o.id}: 도메인 리소스`);
    }
  }
});

test("설정의 기본·비교 리전이 가격 데이터에 있다", () => {
  assert.ok(prices.regions[settings.defaultRegion]);
  assert.ok(prices.regions[settings.compareRegion]);
  assert.ok(Object.keys(prices.regions).length >= 6);
});

test("용어 사전: 용어와 별칭이 겹치지 않고 설명이 있다", () => {
  const words = terms.flatMap((t) => [t.term, ...(t.aliases ?? [])]);
  assert.equal(new Set(words).size, words.length, "중복된 용어/별칭");
  for (const t of terms) assert.ok(t.desc.length > 10 && t.category, t.term);
});

test("용어는 문장마다 처음 한 번만 버튼으로 감싼다", () => {
  setGlossary(terms);
  const html = glossarize("NAT Gateway는 비싸요. NAT Gateway를 조심하세요.");
  assert.equal(html.match(/class="term"/g).length, 1);
  assert.match(html, /data-term="NAT Gateway"/);
  assert.equal(glossarize("관련 없는 문장"), "관련 없는 문장");
});

test("메인 페이지 바닥글에 모든 템플릿 소개 페이지 링크가 있다 (검색엔진용)", () => {
  const html = read("index.html");
  for (const t of templates) assert.ok(html.includes(`href="pages/${t.id}.html"`), t.id);
  assert.ok(html.includes('property="og:image"'));
});
