// "얼마일까?" 비용 감각 퀴즈: 기존 템플릿 계산에서 문제를 자동으로 만든다 (DOM 없음, 테스트 대상).
//   makeQuestions(templates, prices, regionId, krw, rng, count)
//   문제 데이터를 따로 관리하지 않아서, 가격이 매주 갱신되면 정답도 같이 바뀐다.
import { calculateTemplate } from "./engine.js";

const MIN_USD = 3; // 너무 싼 구성은 보기 차이가 몇백 원이라 문제로 쓰지 않는다
// 오답 배수: 정답이 가운데 · 가장 쌈 · 가장 비쌈이 골고루 나오게
const DISTRACTORS = [
  [1 / 3, 3],
  [2.5, 6],
  [1 / 2.5, 1 / 6],
];

/** 원화를 앞 두 자리만 남기고 반올림한다 (10,780 → 11,000, 160,302 → 160,000). */
export function roundKrw(krw) {
  if (krw <= 0) return 0;
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(krw)) - 1);
  return Math.round(krw / unit) * unit;
}

/** 배열을 섞는다 (rng: 0 이상 1 미만을 돌려주는 함수, 테스트에서는 고정값을 쓴다). */
function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 문제 count개. 서로 다른 템플릿에서 하나씩 뽑는다.
 * 오답 보기는 정답보다 싸거나 비싼 쪽으로 섞어서, 정답이 늘 가운데 값이 되지 않게 한다.
 * krw: { krwPerUsd, vatRate } — 보기는 부가세 포함 원화로 보여준다.
 */
export function makeQuestions(templates, prices, regionId, krw, rng = Math.random, count = 3) {
  const toKrw = (usd) => usd * krw.krwPerUsd * (1 + krw.vatRate);
  const pool = [];
  for (const t of templates)
    for (const p of t.presets) {
      const { options } = calculateTemplate(t, p.id, prices, regionId);
      for (const o of options) if (o.totalUsd >= MIN_USD) pool.push({ template: t, preset: p, option: o });
    }
  const picked = [];
  for (const c of shuffle(pool, rng)) {
    if (picked.length === count) break;
    if (!picked.some((x) => x.template.id === c.template.id)) picked.push(c);
  }
  return picked.map(({ template, preset, option }) => {
    const answer = roundKrw(toKrw(option.totalUsd));
    const [a, b] = DISTRACTORS[Math.floor(rng() * DISTRACTORS.length)];
    const choices = shuffle([answer, roundKrw(answer * a), roundKrw(answer * b)], rng);
    return { template, preset, option, answer, answerUsd: option.totalUsd, choices };
  });
}
