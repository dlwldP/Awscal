// MVP 완료 조건 "AWS 공식 Pricing Calculator 대비 ±10%" 검증용 체크리스트를 만든다.
// 모든 템플릿 × 프리셋 × 리전 × 구성안의 우리 계산값과, calculator.aws에 그대로 넣을 입력값을 표로 정리한다.
// 사용법: node scripts/validation-report.js > docs/validation.md
//
// 공식 계산기 금액 칸은 사람이 직접 채운다. 이 스크립트를 다시 돌리면 덮어쓰므로,
// 채운 값은 docs/validation-results.json에 적어두면 표에 합쳐서 차이(%)와 통과 여부를 계산해준다.
import { existsSync, readFileSync } from "node:fs";
import { calculateTemplate, formatUsd, HOURS_PER_MONTH, resolveResource } from "../js/engine.js";

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const prices = load("data/prices.json");
const { templates } = load("data/templates.json");
const resultsPath = new URL("../docs/validation-results.json", import.meta.url);
// { "<템플릿>/<프리셋>/<리전>/<구성안>": 공식 계산기 월 금액(USD) }
const official = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath)) : {};

const n = (v) => v.toLocaleString("en-US");
const hours = (r) => (r.hours === undefined || r.hours === HOURS_PER_MONTH ? "" : `, 월 ${r.hours}시간`);

/** calculator.aws에서 어떤 서비스에 어떤 값을 넣으면 되는지 설명한다. */
function describe(r) {
  switch (r.type) {
    case "ec2": return `EC2: ${r.instance}, Linux, On-Demand, ${r.count}대${hours(r)} (EBS는 0GB로 두고 아래 EBS 줄로 따로)`;
    case "ebs": return `EBS: gp3 ${r.sizeGb}GB × ${r.count}개 (IOPS 3000, 처리량 125MB/s 기본값)`;
    case "publicIpv4": return `VPC → Public IPv4 Address: In-use ${r.count * (r.multiplier ?? 1)}개${hours(r)}`;
    case "alb": return `Elastic Load Balancing → ALB ${r.count}개 (LCU가 ${r.lcu}이 되도록 처리량 입력, 예: 처리 데이터 월 ${n(Math.round(r.lcu * HOURS_PER_MONTH))}GB)`;
    case "natGateway": return `VPC → NAT Gateway ${r.count}개, 처리 ${n(r.gb)}GB`;
    case "rds": return `RDS for MySQL: ${r.instance}, ${r.multiAz ? "Multi-AZ" : "Single-AZ"}, On-Demand, gp3 ${r.storageGb}GB${hours(r)}`;
    case "dataTransferOut": return `Data Transfer: 인터넷으로 아웃바운드 ${n(r.gb)}GB (같은 리전)`;
    case "lightsail": return `Lightsail: Linux ${r.bundle} 번들 × ${r.count ?? 1}`;
    case "s3": return `S3 Standard: 저장 ${r.storageGb}GB, PUT ${n(r.putRequests)}건, GET ${n(r.getRequests)}건`;
    case "cloudfront": return `CloudFront: 전송 ${n(r.gb)}GB, HTTPS 요청 ${n(r.requests)}건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States)`;
    case "amplify": return `Amplify: 빌드 ${r.buildMinutes}분, 저장 ${r.storageGb}GB, 전송 ${n(r.servedGb)}GB`;
    case "lambda": return `Lambda: Arm, 요청 ${n(r.requests)}건, 실행 ${r.durationMs}ms, 메모리 ${r.memoryMb}MB, 임시 스토리지 512MB, 프리티어 미포함`;
    case "apiGatewayHttp": return `API Gateway HTTP API: 요청 ${n(r.requests)}건`;
    case "dynamodb": return `DynamoDB On-Demand: 쓰기 ${n(r.writes)}건, 읽기 ${n(r.reads)}건(Strongly consistent), 저장 ${r.storageGb}GB`;
    case "fargate": return `ECS Fargate: Linux/x86, 태스크 ${r.count}개, ${r.vcpu}vCPU, ${r.memoryGb}GB, 하루 24시간${hours(r)}`;
    default: return r.type;
  }
}

const out = [];
const rows = [];
for (const t of templates)
  for (const p of t.presets)
    for (const region of Object.keys(prices.regions))
      for (const o of calculateTemplate(t, p.id, prices, region).options) {
        const key = `${t.id}/${p.id}/${region}/${o.id}`;
        const resources = o.resources.map((r) => resolveResource(r, p.values)).filter((r) => r.count !== 0);
        rows.push({ key, t, p, region, o, resources, official: official[key] });
      }

const checked = rows.filter((r) => typeof r.official === "number");
const passed = checked.filter((r) => Math.abs(r.o.totalUsd - r.official) / r.official <= 0.1);

out.push(`# 공식 Pricing Calculator 교차 검증

> 자동 생성 문서 — \`node scripts/validation-report.js > docs/validation.md\`
> 가격 데이터 ${prices.updatedAt} 기준

MVP 완료 조건: 모든 결과가 [AWS Pricing Calculator](https://calculator.aws/) 대비 **±10% 이내**.

**진행 상황: ${rows.length}개 중 ${checked.length}개 확인, ${passed.length}개 통과**

## 검증 방법

1. 아래 표에서 한 줄을 골라 [calculator.aws](https://calculator.aws/#/createCalculator)에서 같은 리전으로 '입력값'을 그대로 넣습니다.
2. 나온 월 합계(USD)를 \`docs/validation-results.json\`에 \`"키": 금액\` 형식으로 적습니다.
   \`\`\`json
   { "backend-webapp/personal/ap-northeast-2/ec2-rds": 34.6 }
   \`\`\`
3. \`node scripts/validation-report.js > docs/validation.md\`를 다시 돌리면 차이(%)와 통과 여부가 채워집니다.

## 자동으로 보장되는 것

- **구간 요금 단순화로 인한 오차 = 0**: 모든 프리셋 사용량이 첫 요금 구간 안에 있음을 테스트로 확인합니다 (\`tests/engine.test.js\`의 "첫 요금 구간 안에 있다").
- **단가**: 공식 계산기와 같은 원본(AWS Price List)에서 매주 다시 받습니다. 시간 기준도 공식 계산기와 같은 730시간입니다.

## 차이가 날 수 있는 이유 (알려진 것)

| 원인 | 영향 | 대응 |
|---|---|---|
| 공식 계산기가 일부 프리티어를 자동 적용 (예: DynamoDB 저장 25GB, Lambda 무료 요청) | 서버리스·소규모 구성에서 우리 값이 더 큼 | 공식 계산기의 프리티어 옵션을 끄고 비교. 끌 수 없으면 무료 금액을 더해서 비교 |
| 데이터 전송 월 100GB 무료 (리전 공통) | 공식 계산기에 따라 반영될 수 있음 | 이 서비스는 프리티어 미반영이 원칙 |
| Lightsail 월 정액 (744시간) | 공식 계산기도 월 정액으로 보여줌 | 차이 없음 |
| ALB LCU 환산 | LCU는 연결·처리량 중 큰 값 기준 | 처리 데이터만으로 LCU를 맞춰 입력 |

## 체크리스트
`);

for (const t of templates) {
  out.push(`\n### ${t.icon} ${t.name}\n`);
  out.push("| 키 | 우리 계산 | 공식 계산기 | 차이 | 결과 | 입력값 |");
  out.push("|---|---:|---:|---:|:---:|---|");
  for (const r of rows.filter((x) => x.t === t)) {
    const diff = typeof r.official === "number" ? (r.o.totalUsd - r.official) / r.official : null;
    const result = diff === null ? "☐" : Math.abs(diff) <= 0.1 ? "✅" : "❌";
    out.push(
      `| \`${r.key}\` | ${formatUsd(r.o.totalUsd)} | ${diff === null ? "" : formatUsd(r.official)} | ${
        diff === null ? "" : `${(diff * 100).toFixed(1)}%`
      } | ${result} | ${r.resources.map(describe).join("<br>")} |`
    );
  }
}

console.log(out.join("\n"));
