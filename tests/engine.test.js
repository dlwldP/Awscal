import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateOption,
  calculateTemplate,
  formatKrw,
  formatUsd,
  HOURS_PER_MONTH,
  RESOURCE_TYPES,
  resolveValue,
} from "../js/engine.js";

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const prices = load("prices.json");
const { templates } = load("templates.json");

// 실제 데이터와 무관하게 계산식만 검증하기 위한 고정 단가
const fake = {
  ec2: { "t4g.small": { hourly: 0.02 } },
  ebs: { gp3: { perGbMonth: 0.1 } },
  publicIpv4: { hourly: 0.005 },
  dataTransferOut: { perGb: 0.1 },
  rds: { "db.t4g.micro": { hourly: 0.03, multiAzHourly: 0.06, storagePerGbMonth: 0.2 } },
  lightsail: { "1GB": { hourly: 0.0094, monthly: 7 } },
  lambda: { perRequest: 2e-7, perGbSecondArm: 1e-5 },
};

test("{{preset.x}} 자리표시자를 프리셋 값으로 바꾼다", () => {
  assert.equal(resolveValue("{{preset.count}}", { count: 2 }), 2);
  assert.equal(resolveValue("t4g.small", {}), "t4g.small");
  assert.equal(resolveValue(3, {}), 3);
  assert.throws(() => resolveValue("{{preset.missing}}", {}), /missing/);
});

test("시간 과금 = 시간당 단가 × 730 × 수량", () => {
  const r = calculateOption({ resources: [{ type: "ec2", instance: "t4g.small", count: 2 }] }, {}, fake);
  assert.equal(HOURS_PER_MONTH, 730);
  assert.ok(Math.abs(r.totalUsd - 0.02 * 730 * 2) < 1e-9);
});

test("사용량 과금과 RDS 스토리지를 더한다", () => {
  const r = calculateOption(
    {
      resources: [
        { type: "rds", instance: "db.t4g.micro", storageGb: 20 },
        { type: "dataTransferOut", gb: "{{preset.egress}}" },
      ],
    },
    { egress: 30 },
    fake
  );
  assert.ok(Math.abs(r.totalUsd - (0.03 * 730 + 0.2 * 20 + 0.1 * 30)) < 1e-9);
  assert.equal(r.lines.length, 3);
});

test("Lambda는 요청 수 + GB-초로 계산한다", () => {
  const r = calculateOption(
    { resources: [{ type: "lambda", requests: 1_000_000, memoryMb: 512, durationMs: 200 }] },
    {},
    fake
  );
  const gbSeconds = 1_000_000 * 0.2 * 0.5;
  assert.ok(Math.abs(r.totalUsd - (0.2 + gbSeconds * 1e-5)) < 1e-9);
});

test("Lightsail은 월 정액을 그대로 쓴다", () => {
  const r = calculateOption({ resources: [{ type: "lightsail", bundle: "1GB" }] }, {}, fake);
  assert.equal(r.totalUsd, 7);
});

test("count가 0인 리소스는 내역에서 빠진다", () => {
  const r = calculateOption(
    { resources: [{ type: "publicIpv4", count: "{{preset.n}}" }, { type: "ec2", instance: "t4g.small", count: 1 }] },
    { n: 0 },
    fake
  );
  assert.equal(r.lines.length, 1);
  assert.ok(!r.warnings.some((w) => w.id === "publicIpv4"));
});

test("같은 경고는 한 번만 표시한다", () => {
  const r = calculateOption(
    {
      resources: [
        { type: "publicIpv4", count: 1 },
        { type: "publicIpv4", count: 2 },
      ],
    },
    {},
    fake
  );
  assert.equal(r.warnings.filter((w) => w.id === "publicIpv4").length, 1);
});

test("가격 데이터가 없으면 0원으로 넘어가지 않고 실패한다", () => {
  assert.throws(
    () => calculateOption({ resources: [{ type: "ec2", instance: "t4g.nano", count: 1 }] }, {}, fake),
    /ec2\.t4g\.nano/
  );
});

test("금액 표시 형식", () => {
  assert.equal(formatUsd(12.345), "$12.35");
  assert.equal(formatUsd(0.004), "$0.01 미만");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatKrw(10, 1400), "약 14,000원");
});

// MVP 완료 조건: 모든 템플릿 × 프리셋 × 리전에서 결과가 나온다
for (const t of templates) {
  test(`템플릿 '${t.id}'은 모든 프리셋·리전에서 계산된다`, () => {
    assert.ok(t.options.length >= 1);
    for (const o of t.options) for (const r of o.resources) assert.ok(RESOURCE_TYPES.includes(r.type), r.type);
    for (const p of t.presets) {
      for (const region of Object.keys(prices.regions)) {
        const { options } = calculateTemplate(t, p.id, prices, region, "us-east-1");
        for (const o of options) {
          assert.ok(Number.isFinite(o.totalUsd) && o.totalUsd > 0, `${t.id}/${p.id}/${region}/${o.id}`);
          assert.ok(o.lines.every((l) => Number.isFinite(l.usd) && l.label && l.why));
        }
      }
    }
  });
}

test("규모가 커지면 비용도 커진다", () => {
  for (const t of templates) {
    for (const region of Object.keys(prices.regions)) {
      const totals = t.presets.map((p) => calculateTemplate(t, p.id, prices, region).options.map((o) => o.totalUsd));
      for (let i = 1; i < totals.length; i++) {
        totals[i].forEach((v, j) => assert.ok(v >= totals[i - 1][j], `${t.id} ${region} ${t.options[j].id}`));
      }
    }
  }
});
