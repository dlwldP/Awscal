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

// ---- 공유 링크 ----
import { decodeCalc, encodeCalc, parseDomain, parseOverrides, resultHash } from "../js/share.js";

test("결과 공유 주소는 바꾼 값만 담고, 다시 읽으면 같은 값이 나온다", () => {
  const t = templates.find((x) => x.id === "backend-webapp");
  const preset = t.presets[0];
  const overrides = { instance: "t4g.medium", egressGb: 100 };
  const hash = resultHash(t, preset.id, "ap-northeast-2", overrides, true);
  assert.equal(hash, "#/t/backend-webapp/personal/ap-northeast-2?instance=t4g.medium&egressGb=100&domain=1");
  const params = new URLSearchParams(hash.split("?")[1]);
  assert.deepEqual(parseOverrides(preset, prices.regions["ap-northeast-2"], params), overrides);
  assert.equal(parseDomain(params), true);
  assert.equal(resultHash(t, preset.id, "us-east-1"), "#/t/backend-webapp/personal/us-east-1");
  const freeHash = resultHash(t, preset.id, "us-east-1", {}, false, true);
  assert.match(freeHash, /free=1/);
  assert.deepEqual(parseOverrides(preset, prices.regions["us-east-1"], new URLSearchParams(freeHash.split("?")[1])), {});
});

test("이상한 공유 주소 값은 버린다", () => {
  const t = templates.find((x) => x.id === "backend-webapp");
  const params = new URLSearchParams("instance=m9.huge&egressGb=-3&count=abc&hacker=1&dbStorageGb=5&ebsGb=30");
  assert.deepEqual(parseOverrides(t.presets[0], prices.regions["ap-northeast-2"], params), { ebsGb: 30 });
  assert.equal(parseDomain(new URLSearchParams("")), undefined);
});

test("직접 계산 공유: 인코딩 → 디코딩하면 같은 목록, 깨진 값은 null", () => {
  const items = [
    { type: "ec2", values: { instance: "t4g.small", count: 2, hours: 176 } },
    { type: "rds", values: { instance: "db.t4g.micro", storageGb: 20, multiAz: true, hours: 730 } },
  ];
  const s = encodeCalc("ap-northeast-1", items);
  assert.match(s, /^[A-Za-z0-9_-]+$/, "주소에 그대로 넣을 수 있는 문자만");
  assert.deepEqual(decodeCalc(s, ["ec2", "rds"]), { region: "ap-northeast-1", items, freeTier: false });
  assert.equal(decodeCalc(encodeCalc("ap-northeast-1", items, true), ["ec2"]).freeTier, true, "프리티어 적용 여부도 담는다");
  assert.deepEqual(decodeCalc(s, ["ec2"]).items.length, 1, "모르는 서비스는 버림");
  assert.equal(decodeCalc("not-base64!!", ["ec2"]), null);
  assert.equal(decodeCalc(encodeCalc("x", [{ type: "evil", values: {} }]), ["ec2"]), null);
});

// ---- 구성 다이어그램 ----
import { diagramModel } from "../js/diagram.js";
import { resolveResource } from "../js/engine.js";

test("다이어그램: 모든 구성안에서 사용자부터 그려지고, 꼬리표·상자 비용 합이 구성안 합계와 같다", () => {
  const region = settings.defaultRegion;
  for (const t of templates)
    for (const p of t.presets) {
      const values = { ...p.values, domain: 1 };
      const { options } = calculateTemplate(t, p.id, prices, region, undefined, { domain: 1 });
      for (const o of options) {
        const cols = diagramModel(o.resources.map((r) => resolveResource(r, values)), prices.regions[region]);
        assert.equal(cols[0].id, "user", `${t.id}/${o.id}`);
        assert.ok(cols.length >= 2, `${t.id}/${o.id}: 사용자 말고도 상자가 있어야`);
        const sum = cols.flatMap((c) => c.nodes).reduce((s, n) => s + (n.usd ?? 0) + n.notes.reduce((a, x) => a + x.usd, 0), 0);
        assert.ok(Math.abs(sum - o.totalUsd) < 1e-9, `${t.id}/${p.id}/${o.id}: 그림 ${sum} ≠ 합계 ${o.totalUsd}`);
      }
    }
});

test("다이어그램: 퍼블릭 IPv4는 주의 꼬리표, ALB에 붙은 IPv4는 ALB 상자에", () => {
  const t = templates.find((x) => x.id === "backend-webapp");
  const p = t.presets.find((x) => x.id === "medium");
  const o = t.options.find((x) => x.id === "ec2-rds");
  const cols = diagramModel(o.resources.map((r) => resolveResource(r, p.values)), prices.regions[settings.defaultRegion]);
  const alb = cols.flatMap((c) => c.nodes).find((n) => n.type === "alb");
  assert.ok(alb.notes.some((x) => x.warn && x.text.includes("× 2")));
});

test("놓치기 쉬운 비용: 금액 줄을 서비스별로 합치고, 금액으로 설명된 경고는 알아둘 점에서 뺀다", async () => {
  const { hiddenCostsOf } = await import("../js/hidden-costs.js");
  const region = settings.defaultRegion;
  const t = templates.find((x) => x.id === "backend-webapp");
  const { options } = calculateTemplate(t, t.presets[0].id, prices, region);
  const ec2 = hiddenCostsOf(options.find((o) => o.id === "ec2-rds"));
  const labels = ec2.included.map((h) => h.label);
  for (const want of ["데이터 전송", "퍼블릭 IPv4", "디스크 (EBS)"]) assert.ok(labels.some((l) => l.includes(want)), want);
  const ebsSum = options.find((o) => o.id === "ec2-rds").lines.filter((l) => l.service === "EBS").reduce((s, l) => s + l.usd, 0);
  assert.ok(Math.abs(ec2.included.find((h) => h.label.includes("EBS")).usd - ebsSum) < 1e-9);
  assert.ok(!ec2.notes.some((w) => w.id === "dataTransfer" || w.id === "publicIpv4"));
  assert.ok(ec2.notes.some((w) => w.id === "alwaysOn"));
  const lightsail = hiddenCostsOf(options.find((o) => o.id === "lightsail"));
  assert.ok(lightsail.notes.some((w) => w.id === "lightsailStop"));
  assert.ok(lightsail.included.some((h) => h.label.includes("데이터 전송") && h.usd === null), "Lightsail은 번들 포함으로 표시");
  assert.ok(!lightsail.excluded.some((x) => x.includes("전송 허용량")), "번들 포함 줄과 같은 말은 '안 들어 있어요'에서 뺀다");
  assert.equal(lightsail.excluded.length, t.options.find((o) => o.id === "lightsail").excluded.length - 1);
  // CloudFront·Amplify 전송도 데이터 전송으로 묶는다
  const st = templates.find((x) => x.id === "static-website");
  for (const o of calculateTemplate(st, st.presets[0].id, prices, region).options) {
    const transfer = o.lines.filter((l) => l.kind === "transfer").reduce((s, l) => s + l.usd, 0);
    assert.ok(Math.abs(hiddenCostsOf(o).included.find((h) => h.label.includes("데이터 전송")).usd - transfer) < 1e-9, o.id);
  }
});

test("놓치기 쉬운 비용 안내: 모든 항목이 채워져 있고 {값}이 모든 리전 가격으로 바뀐다", async () => {
  const { fillGuideText, guideHtml } = await import("../js/hidden-costs.js");
  const { items } = load("data/hidden-costs.json");
  assert.ok(items.length >= 5);
  for (const it of items) for (const k of ["icon", "title", "cost", "why", "avoid"]) assert.ok(it[k], `${it.title}.${k}`);
  for (const [id, p] of Object.entries(prices.regions)) {
    for (const it of items) assert.doesNotMatch(fillGuideText(it.cost, p), /[{}]|NaN|undefined/, `${id}: ${it.title}`);
    assert.equal((guideHtml(items, p).match(/class="card guide-item"/g) ?? []).length, items.length);
  }
});

test("이 구성 만들기: 템플릿마다 맨 위 구성(추천, 없으면 최저가)에 가이드가 있고 내용이 채워져 있다", () => {
  const { common, guides } = load("data/build-guides.json");
  assert.ok(common.before.length >= 1);
  const region = settings.defaultRegion;
  for (const t of templates) {
    const { options } = calculateTemplate(t, t.presets[0].id, prices, region);
    const main = options.find((o) => o.recommended) ?? options.find((o) => o.isCheapest) ?? options[0];
    assert.ok(guides[`${t.id}/${main.id}`], `${t.id}/${main.id} 가이드 없음`);
  }
  for (const [key, g] of Object.entries(guides)) {
    const [tid, oid] = key.split("/");
    assert.ok(templates.find((t) => t.id === tid)?.options.some((o) => o.id === oid), `${key}: 없는 구성안`);
    for (const k of ["title", "time", "summary"]) assert.ok(g[k], `${key}.${k}`);
    assert.ok(g.steps.length >= 3 && g.steps.every((s) => s.title && s.text), `${key}.steps`);
    assert.ok(g.cleanup.length >= 1, `${key}.cleanup`);
    assert.ok(g.docs.length >= 1 && g.docs.every((d) => d.label && d.url.startsWith("https://")), `${key}.docs`);
  }
});

test("항상 무료: 무료 사용량만큼 '항상 무료' 줄(음수)을 붙이고, 같은 한도는 여러 줄이 나눠 쓴다", async () => {
  const { formatUsd } = await import("../js/engine.js");
  const freeTier = load("data/free-tier.json");
  const p = prices.regions[settings.defaultRegion];
  assert.equal(formatUsd(-0.5), "-$0.50");
  // 데이터 전송 80GB + 80GB → 100GB만 무료
  const two = calculateOption({ resources: [{ type: "dataTransferOut", gb: 80 }, { type: "dataTransferOut", gb: 80 }] }, {}, p, freeTier);
  const free = two.lines.filter((l) => l.kind === "free");
  assert.equal(free.length, 1);
  assert.ok(Math.abs(free[0].usd + 100 * p.dataTransferOut.perGb) < 1e-9);
  assert.ok(Math.abs(two.totalUsd - 60 * p.dataTransferOut.perGb) < 1e-9);
  // 무료 한도보다 적게 쓰면 그 서비스 비용은 0 (음수가 되지 않는다)
  const small = calculateOption({ resources: [{ type: "lambda", requests: 100000, durationMs: 100, memoryMb: 128 }] }, {}, p, freeTier);
  assert.ok(Math.abs(small.totalUsd) < 1e-9);
  // 모든 템플릿·규모·구성안: 적용하면 같거나 싸지고, 0 아래로 내려가지 않는다
  for (const t of templates)
    for (const pr of t.presets) {
      const off = calculateTemplate(t, pr.id, prices, settings.defaultRegion);
      const on = calculateTemplate(t, pr.id, prices, settings.defaultRegion, undefined, {}, freeTier);
      on.options.forEach((o, i) => {
        assert.ok(o.totalUsd <= off.options[i].totalUsd + 1e-9 && o.totalUsd >= -1e-9, `${t.id}/${pr.id}/${o.id}`);
      });
    }
  // 놓치기 쉬운 비용 카드도 항상 무료를 뺀 전송 금액을 보여준다
  const { hiddenCostsOf } = await import("../js/hidden-costs.js");
  const st = templates.find((x) => x.id === "static-website");
  const s3cf = calculateTemplate(st, "personal", prices, settings.defaultRegion, undefined, {}, freeTier).options.find((o) => o.id === "s3-cloudfront");
  const tr = hiddenCostsOf(s3cf).included.find((h) => h.label === "데이터 전송");
  assert.ok(tr.free && tr.usd === 0, "1TB 무료 안이면 무료 범위");
  // 서버리스 개인용은 항상 무료가 크게 적용된다
  const sv = templates.find((x) => x.id === "serverless-api");
  const svOn = calculateTemplate(sv, "personal", prices, settings.defaultRegion, undefined, {}, freeTier).options[0];
  assert.ok(svOn.lines.some((l) => l.label.includes("Lambda 호출")));
  for (const a of freeTier.allowances) assert.ok(a.key && a.label && a.qty > 0 && a.unit, a.key);
});

test("얼마일까? 퀴즈: 서로 다른 템플릿 3문제, 보기 3개는 서로 다르고 정답이 들어 있다", async () => {
  const { makeQuestions, roundKrw } = await import("../js/quiz.js");
  assert.equal(roundKrw(10780), 11000);
  assert.equal(roundKrw(160302), 160000);
  assert.equal(roundKrw(1234), 1200);
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const positions = new Set();
  for (let n = 0; n < 20; n++) {
    const qs = makeQuestions(templates, prices, settings.defaultRegion, settings.exchangeRate, rng);
    assert.equal(qs.length, 3);
    assert.equal(new Set(qs.map((q) => q.template.id)).size, 3, "템플릿은 겹치지 않는다");
    for (const q of qs) {
      assert.equal(q.choices.length, 3);
      assert.equal(new Set(q.choices).size, 3, `보기가 겹침: ${q.choices}`);
      assert.ok(q.choices.includes(q.answer));
      assert.ok(q.answerUsd >= 3);
      const krw = q.answerUsd * settings.exchangeRate.krwPerUsd * (1 + settings.exchangeRate.vatRate);
      assert.ok(Math.abs(q.answer - krw) / krw < 0.06, "정답은 실제 금액을 반올림한 값");
      positions.add([...q.choices].sort((x, y) => x - y).indexOf(q.answer));
    }
  }
  assert.equal(positions.size, 3, "정답이 가장 쌈·가운데·가장 비쌈 모두 나온다");
});

test("Bedrock: 하루 대화 수 × 30일 × 대화당 토큰 × 100만 토큰당 단가, 리전에 없는 모델은 선택지에서 빠진다", async () => {
  const { choicesFor, fieldDef } = await import("../js/schema.js");
  const p = prices.regions["ap-northeast-2"];
  const r = calculateOption({ resources: [{ type: "bedrock", model: "claude-haiku-5.5", dailyChats: 50, inputTokens: 1000, outputTokens: 300 }] }, {}, p);
  const m = p.bedrock["claude-haiku-5.5"];
  assert.ok(Math.abs(r.totalUsd - ((1500 * 1000) / 1e6) * m.inputPerMTok - ((1500 * 300) / 1e6) * m.outputPerMTok) < 1e-12);
  assert.ok(r.warnings.some((w) => w.id === "tokenCost"));
  for (const [id, rp] of Object.entries(prices.regions)) {
    for (const [k, v] of Object.entries(rp.bedrock)) assert.ok(v.name && v.inputPerMTok > 0 && v.outputPerMTok > v.inputPerMTok, `${id}/${k}`);
    assert.ok(rp.bedrock["claude-haiku-5.5"] && rp.bedrock["nova-micro"], `${id}: 기본 모델은 모든 리전에 있어야 함`);
  }
  const labels = choicesFor(fieldDef("model"), p).map(([, label]) => label);
  assert.ok(labels.includes("Claude Haiku 5.5") && labels.includes("Amazon Nova Micro"));
});
