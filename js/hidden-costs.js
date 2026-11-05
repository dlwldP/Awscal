// 놓치기 쉬운 비용: 계산 결과에서 초보자가 자주 놀라는 항목만 골라 금액과 함께 보여준다 (DOM 없음, 테스트 대상).
//   hiddenCostsOf(option)          결과 화면 "놓치기 쉬운 비용" 카드에 쓸 { included, notes }
//   guideHtml(items, regionPrices) 안내 페이지 본문 (앱 #/hidden-costs와 정적 pages/hidden-costs.html이 같이 쓴다)
import { formatUsd, HOURS_PER_MONTH } from "./engine.js";
import { icon } from "./icons.js";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 비용 내역(lines)의 service → 카드에 보여줄 이름과 한 줄 설명. 같은 service 줄은 합친다.
// 전송 요금 줄(kind: "transfer")은 서비스가 달라도(EC2·CloudFront·Amplify) 데이터 전송으로 묶는다.
const HIDDEN_LINES = {
  전송: { label: "데이터 전송", tip: "사용자에게 나가는 트래픽이에요. 늘면 가장 먼저 커져요" },
  IPv4: { label: "퍼블릭 IPv4 주소", tip: "켜두기만 해도 나가요" },
  EBS: { label: "디스크 (EBS)", tip: "서버를 중지해도 계속 나가요" },
  NAT: { label: "NAT Gateway", tip: "트래픽이 없어도 켜진 시간만큼 나가요" },
  ALB: { label: "로드밸런서 기본 요금", tip: "요청이 없어도 나가요" },
};

// 항상 무료 줄(kind: "free")이 깎아주는 금액도 같은 항목에서 빼서 실제로 나가는 금액을 보여준다.
const FREE_KEY_TO_LINE = { transferGb: "전송", cloudfrontGb: "전송" };

// 위 금액 줄이 이미 설명하는 경고는 "알아둘 점"에서 뺀다.
const COVERED_WARNINGS = { dataTransfer: "전송", publicIpv4: "IPv4", alb: "ALB", natGatewayOn: "NAT" };

// Lightsail은 전송 허용량이 번들 월 요금에 들어 있어서 따로 금액 줄이 없다.
// 같은 내용을 말하는 "포함 안 된 비용" 항목(전송 허용량 초과)은 카드에서 한 번만 보이게 뺀다(covers).
const LIGHTSAIL_TRANSFER = { label: "데이터 전송", tip: "번들 허용량까지는 포함, 넘으면 GB당 추가 과금돼요", usd: null, covers: "전송 허용량" };

/**
 * included: 이 금액에 들어 있는 놓치기 쉬운 항목 [{ label, tip, usd, free? }] (금액 큰 순, usd가 null이면 "번들 포함",
 *           free가 true면 항상 무료 사용량 안이라 지금은 0원)
 * notes:    금액 줄로 설명되지 않는 경고 (중지해도 과금, Multi-AZ 등)
 * excluded: 이 금액에 안 들어 있는 항목 (included가 이미 설명한 항목은 뺀다)
 */
export function hiddenCostsOf(option, excluded = option.excluded ?? []) {
  const sums = new Map();
  const freed = new Map();
  for (const line of option.lines) {
    if (line.kind === "free") {
      const key = FREE_KEY_TO_LINE[line.freeKey];
      if (key) freed.set(key, (freed.get(key) ?? 0) + line.usd);
      continue;
    }
    const key = line.kind === "transfer" ? "전송" : line.service;
    if (!HIDDEN_LINES[key] || line.usd <= 0) continue;
    sums.set(key, (sums.get(key) ?? 0) + line.usd);
  }
  const included = [...sums]
    .map(([key, gross]) => {
      const usd = Math.max(0, gross + (freed.get(key) ?? 0));
      return usd < 0.005 && freed.has(key)
        ? { ...HIDDEN_LINES[key], usd: 0, free: true, tip: "매달 무료 사용량 안이라 지금은 0원이에요. 넘으면 GB당 과금돼요" }
        : { ...HIDDEN_LINES[key], usd };
    })
    .sort((a, b) => b.usd - a.usd);
  if (!sums.has("전송") && option.lines.some((l) => l.service === "Lightsail")) included.push(LIGHTSAIL_TRANSFER);
  const notes = option.warnings.filter((w) => !(COVERED_WARNINGS[w.id] && sums.has(COVERED_WARNINGS[w.id])));
  const covered = included.map((h) => h.covers).filter(Boolean);
  return { included, notes, excluded: excluded.filter((x) => !covered.some((c) => x.includes(c))) };
}

// ---- 안내 페이지 ----
// data/hidden-costs.json 문장 속 {이름}을 그 리전 가격으로 바꾼다.
const GUIDE_VALUES = {
  dataTransferPerGb: (p) => `$${p.dataTransferOut.perGb}`,
  ipv4Monthly: (p) => formatUsd(p.publicIpv4.hourly * HOURS_PER_MONTH),
  natMonthly: (p) => formatUsd(p.natGateway.hourly * HOURS_PER_MONTH),
  natPerGb: (p) => `$${p.natGateway.perGb}`,
  albMonthly: (p) => formatUsd(p.alb.hourly * HOURS_PER_MONTH),
  ebsPerGb: (p) => `$${p.ebs.gp3.perGbMonth}`,
};

export function fillGuideText(text, regionPrices) {
  return text.replace(/\{(\w+)\}/g, (all, name) => {
    if (!GUIDE_VALUES[name]) throw new Error(`hidden-costs.json: 알 수 없는 값 {${name}}`);
    return GUIDE_VALUES[name](regionPrices);
  });
}

export function guideHtml(items, regionPrices) {
  return items
    .map(
      (it, i) => `
    <section class="card guide-item">
      <h2 class="card-title with-ico">${icon(it.icon, 20)}${i + 1}. ${esc(it.title)}</h2>
      <p class="guide-cost">${esc(fillGuideText(it.cost, regionPrices))}</p>
      <p>${esc(it.why)}</p>
      <p class="guide-avoid"><strong>이렇게 피해요</strong> ${esc(it.avoid)}</p>
    </section>`
    )
    .join("");
}
