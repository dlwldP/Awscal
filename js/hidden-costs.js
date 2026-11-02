// 놓치기 쉬운 비용: 계산 결과에서 초보자가 자주 놀라는 항목만 골라 금액과 함께 보여준다 (DOM 없음, 테스트 대상).
//   hiddenCostsOf(option)  결과 화면 "놓치기 쉬운 비용" 카드에 쓸 { included, notes }

// 비용 내역(lines)의 service → 카드에 보여줄 이름과 한 줄 설명. 같은 service 줄은 합친다.
// 전송 요금 줄(kind: "transfer")은 서비스가 달라도(EC2·CloudFront·Amplify) 데이터 전송으로 묶는다.
const HIDDEN_LINES = {
  전송: { label: "데이터 전송", tip: "사용자에게 나가는 트래픽이에요. 늘면 가장 먼저 커져요" },
  IPv4: { label: "퍼블릭 IPv4 주소", tip: "켜두기만 해도 나가요" },
  EBS: { label: "디스크 (EBS)", tip: "서버를 중지해도 계속 나가요" },
  NAT: { label: "NAT Gateway", tip: "트래픽이 없어도 켜진 시간만큼 나가요" },
  ALB: { label: "로드밸런서 기본 요금", tip: "요청이 없어도 나가요" },
};

// 위 금액 줄이 이미 설명하는 경고는 "알아둘 점"에서 뺀다.
const COVERED_WARNINGS = { dataTransfer: "전송", publicIpv4: "IPv4", alb: "ALB", natGatewayOn: "NAT" };

// Lightsail은 전송 허용량이 번들 월 요금에 들어 있어서 따로 금액 줄이 없다.
const LIGHTSAIL_TRANSFER = { label: "데이터 전송", tip: "번들 허용량까지는 포함, 넘으면 GB당 추가 과금돼요", usd: null };

/**
 * included: 이 금액에 들어 있는 놓치기 쉬운 항목 [{ label, tip, usd }] (금액 큰 순, usd가 null이면 "번들 포함")
 * notes:    금액 줄로 설명되지 않는 경고 (중지해도 과금, Multi-AZ 등)
 */
export function hiddenCostsOf(option) {
  const sums = new Map();
  for (const line of option.lines) {
    const key = line.kind === "transfer" ? "전송" : line.service;
    if (!HIDDEN_LINES[key] || line.usd <= 0) continue;
    sums.set(key, (sums.get(key) ?? 0) + line.usd);
  }
  const included = [...sums].map(([key, usd]) => ({ ...HIDDEN_LINES[key], usd })).sort((a, b) => b.usd - a.usd);
  if (!sums.has("전송") && option.lines.some((l) => l.service === "Lightsail")) included.push(LIGHTSAIL_TRANSFER);
  const notes = option.warnings.filter((w) => !(COVERED_WARNINGS[w.id] && sums.has(COVERED_WARNINGS[w.id])));
  return { included, notes };
}
