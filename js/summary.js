// 견적 요약 글: 슬랙·노션·카카오톡에 링크와 같이 붙여 넣을 짧은 텍스트 (DOM 없음, 테스트 대상).
import { formatKrw, formatUsd } from "./engine.js";

const won = (usd, krw) => formatKrw(usd, krw.krwPerUsd, krw.vatRate);

/**
 * 구성 추천 결과 요약.
 * main: 맨 위 구성 { name, totalUsd }, others: 나머지 구성, hidden: 놓치기 쉬운 비용 이름 목록
 */
export function resultSummary({ name, templateName, presetName, regionName, main, others = [], hidden = [], krw, url }) {
  const head = [name, templateName, presetName, regionName].filter(Boolean).join(" · ");
  return [
    `[AWS 얼마야?] ${head}`,
    `추천: ${main.name} 월 ${won(main.totalUsd, krw)} (부가세 포함, ${formatUsd(main.totalUsd)})`,
    others.length ? `다른 구성: ${others.map((o) => `${o.name} ${won(o.totalUsd, krw)}`).join(" / ")}` : "",
    hidden.length ? `놓치기 쉬운 비용: ${hidden.join(", ")}` : "",
    `자세히 보기: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 직접 계산 요약. items: [{ name, usd }] (계산 못 한 항목은 usd가 null) */
export function calcSummary({ name, regionName, items, totalUsd, freeUsd = 0, krw, url }) {
  return [
    `[AWS 얼마야?] ${[name || "직접 계산 견적", regionName].join(" · ")}`,
    ...items.map((it) => `- ${it.name}: ${it.usd === null ? "입력값 확인 필요" : formatUsd(it.usd)}`),
    freeUsd < 0 ? `- 항상 무료(프리티어): ${formatUsd(freeUsd)}` : "",
    `합계: 월 ${won(totalUsd, krw)} (부가세 포함, ${formatUsd(totalUsd)})`,
    `자세히 보기: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}
