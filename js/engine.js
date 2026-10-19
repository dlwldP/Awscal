// 계산 엔진: 리소스 목록 + 가격 데이터 → 월 비용.
// DOM을 쓰지 않는 순수 함수만 두어 브라우저와 Node 테스트에서 같이 쓴다.

export const HOURS_PER_MONTH = 730;

const PLACEHOLDER = /^\{\{preset\.([A-Za-z0-9_]+)\}\}$/;

/** "{{preset.x}}" 문자열을 프리셋 값으로 바꾼다. 그 외 값은 그대로 둔다. */
export function resolveValue(value, presetValues) {
  if (typeof value !== "string") return value;
  const m = value.match(PLACEHOLDER);
  if (!m) return value;
  if (!(m[1] in presetValues)) throw new Error(`프리셋에 '${m[1]}' 값이 없습니다`);
  return presetValues[m[1]];
}

export function resolveResource(resource, presetValues) {
  return Object.fromEntries(Object.entries(resource).map(([k, v]) => [k, resolveValue(v, presetValues)]));
}

/** 가격 데이터에서 값을 꺼낸다. 없으면 바로 실패해서 잘못된 0원 결과를 막는다. */
function price(regionPrices, ...path) {
  let node = regionPrices;
  for (const key of path) {
    node = node?.[key];
    if (node === undefined) throw new Error(`가격 데이터 없음: ${path.join(".")}`);
  }
  return node;
}

// ---- 표시용 포맷 ----

export function formatUsd(usd) {
  if (usd > 0 && usd < 0.01) return "$0.01 미만";
  return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 원화 표시. vatRate를 주면 부가세를 더한다 (한국 계정은 AWS 청구액에 부가세 10%가 붙는다). */
export function formatKrw(usd, krwPerUsd, vatRate = 0) {
  const krw = usd * krwPerUsd * (1 + vatRate);
  if (krw > 0 && krw < 10) return "10원 미만";
  return "약 " + Math.round(krw).toLocaleString("ko-KR") + "원";
}

const num = (n) => n.toLocaleString("ko-KR");
/** 단가 표시: 아주 작은 단가는 '100만 건당'처럼 바꿔 보여준다. */
const unitPrice = (p, unit) => `$${+p.toPrecision(4)}/${unit}`;
const perMillion = (p) => `$${+(p * 1e6).toPrecision(4)}/100만 건`;
const per10k = (p) => `$${+(p * 1e4).toPrecision(4)}/1만 건`;
const per1k = (p) => `$${+(p * 1e3).toPrecision(4)}/1천 건`;
const H = HOURS_PER_MONTH;
/** 사용 시간: 값이 없으면 한 달 내내(730시간) 켜둔 것으로 본다. */
const hoursOf = (r) => (r.hours === undefined ? H : r.hours);

// ---- 숨은 비용 경고 ----

const WARNINGS = {
  alwaysOn: () => ({
    title: "켜두면 계속 과금",
    text: "켜져 있는 동안 시간 단위로 계속 과금돼요. 안 쓸 땐 중지해야 과금이 멈춰요 (EBS 디스크는 중지해도 과금).",
  }),
  publicIpv4: (p) => ({
    title: "퍼블릭 IPv4 요금",
    text: `퍼블릭 IPv4 주소는 사용 중이면 시간당 요금이 붙어요 (1개당 월 약 ${formatUsd(price(p, "publicIpv4", "hourly") * H)}).`,
  }),
  dataTransfer: (p) => ({
    title: "데이터 전송 요금",
    text: `인터넷으로 나가는 데이터는 GB당 $${price(p, "dataTransferOut", "perGb")}이에요. 트래픽이 늘면 가장 먼저 커지는 비용이에요.`,
  }),
  alb: (p) => ({
    title: "로드밸런서 기본 요금",
    text: `ALB는 요청이 하나도 없어도 월 약 ${formatUsd(price(p, "alb", "hourly") * H)}의 기본 요금이 나가요.`,
  }),
  natGateway: (p) => ({
    title: "NAT Gateway 주의",
    text: `컨테이너를 프라이빗 서브넷에 두고 인터넷에 연결하려면 NAT Gateway가 필요해요. 켜두기만 해도 월 약 ${formatUsd(
      price(p, "natGateway", "hourly") * H
    )} (+ 처리 GB당 $${price(p, "natGateway", "perGb")})이에요. 그렇게 구성한다면 NAT Gateway 비용을 따로 더해야 해요.`,
  }),
  natGatewayOn: () => ({
    title: "NAT Gateway 기본 요금",
    text: "NAT Gateway는 트래픽이 없어도 켜져 있는 시간만큼 과금돼요. 안 쓰면 꼭 삭제하세요 (중지 기능이 없어요).",
  }),
  rdsMultiAz: (p, r) => ({
    title: "Multi-AZ는 약 2배",
    text: `Multi-AZ를 켜면 가용성은 올라가지만 DB 비용이 약 2배예요 (이 구성 기준 월 +${formatUsd(
      (price(p, "rds", r.instance, "multiAzHourly") - price(p, "rds", r.instance, "hourly")) * hoursOf(r) +
        price(p, "rds", r.instance, "storagePerGbMonth") * r.storageGb
    )}). 이 계산은 Single-AZ 기준이에요.`,
  }),
  lightsailStop: () => ({
    title: "중지해도 과금",
    text: "Lightsail은 인스턴스를 중지해도 요금이 나가요. 과금을 멈추려면 삭제해야 해요 (스냅샷은 별도 과금).",
  }),
  trafficSpike: () => ({
    title: "트래픽 급증 주의",
    text: "요청 수만큼 과금되므로 봇이나 무한 호출이 생기면 비용도 같이 늘어요. AWS Budgets 예산 알림을 꼭 켜두세요.",
  }),
  tierExceeded: () => ({
    title: "첫 요금 구간 초과",
    text: "사용량이 첫 요금 구간을 넘었어요. 이 계산기는 첫 구간 단가만 쓰기 때문에, 실제로는 넘는 부분에 더 싼 단가가 적용돼 조금 덜 나와요.",
  }),
};

// ---- 리소스 타입별 계산기 ----
// 각 계산기는 { lines, warnings }를 돌려준다.
//   lines: [{ service, label, usd, detail, why, tier? }]
//   tier: 구간 요금 항목이면 { path: [서비스, 단가 키], qty } — 첫 구간 한도를 넘는지 확인할 때 쓴다.

const CALCULATORS = {
  ec2(r, p) {
    const hourly = price(p, "ec2", r.instance, "hourly");
    const hours = hoursOf(r);
    return {
      lines: [{
        service: "EC2",
        label: `EC2 ${r.instance} × ${r.count}대${hours !== H ? ` (월 ${num(hours)}시간)` : ""}`,
        usd: hourly * hours * r.count,
        detail: `${unitPrice(hourly, "시간")} × ${num(hours)}시간 × ${r.count}대`,
        why: "EC2는 가상 서버예요. 켜져 있는 시간만큼 과금되고, 한 달 내내 켜두면 730시간이에요.",
      }],
      warnings: ["alwaysOn"],
    };
  },

  ebs(r, p) {
    const perGb = price(p, "ebs", "gp3", "perGbMonth");
    return {
      lines: [{
        service: "EBS",
        label: `EBS gp3 ${num(r.sizeGb)}GB × ${r.count}개`,
        usd: perGb * r.sizeGb * r.count,
        detail: `${unitPrice(perGb, "GB-월")} × ${num(r.sizeGb)}GB × ${r.count}개`,
        why: "EBS는 서버에 붙는 디스크예요. 서버를 중지해도 디스크 용량만큼 계속 과금돼요.",
      }],
      warnings: [],
    };
  },

  publicIpv4(r, p) {
    const hourly = price(p, "publicIpv4", "hourly");
    const hours = hoursOf(r);
    const count = r.count * (r.multiplier ?? 1);
    return {
      lines: [{
        service: "IPv4",
        label: `퍼블릭 IPv4 × ${count}개${r.attachedTo ? ` (${r.attachedTo})` : ""}`,
        usd: hourly * hours * count,
        detail: `${unitPrice(hourly, "시간")} × ${num(hours)}시간 × ${count}개`,
        why: "인터넷에서 접속하려면 퍼블릭 IPv4 주소가 필요해요. 2024년부터 AWS는 사용 중인 IPv4 주소에도 시간당 요금을 받아요.",
      }],
      warnings: ["publicIpv4"],
    };
  },

  alb(r, p) {
    const hourly = price(p, "alb", "hourly");
    const lcuHourly = price(p, "alb", "lcuHourly");
    return {
      lines: [{
        service: "ALB",
        label: `Application Load Balancer × ${r.count}`,
        usd: (hourly + lcuHourly * r.lcu) * H * r.count,
        detail: `(${unitPrice(hourly, "시간")} + ${unitPrice(lcuHourly, "LCU-시간")} × ${r.lcu} LCU) × ${H}시간 × ${r.count}`,
        why: "로드밸런서는 여러 서버로 요청을 나눠줘요. 시간당 기본 요금에 사용량(LCU: 연결 수·처리량 단위) 요금이 더해져요.",
      }],
      warnings: ["alb"],
    };
  },

  natGateway(r, p) {
    const hourly = price(p, "natGateway", "hourly");
    const perGb = price(p, "natGateway", "perGb");
    return {
      lines: [{
        service: "NAT",
        label: `NAT Gateway × ${r.count} (처리 ${num(r.gb)}GB)`,
        usd: hourly * H * r.count + perGb * r.gb,
        detail: `${unitPrice(hourly, "시간")} × ${H}시간 × ${r.count} + ${unitPrice(perGb, "GB")} × ${num(r.gb)}GB`,
        why: "프라이빗 서브넷의 서버가 인터넷에 나갈 때 거치는 관문이에요. 켜둔 시간 + 지나간 데이터 양만큼 과금돼요.",
      }],
      warnings: ["natGatewayOn"],
    };
  },

  rds(r, p) {
    const multi = Boolean(r.multiAz);
    const hourly = price(p, "rds", r.instance, multi ? "multiAzHourly" : "hourly");
    // Multi-AZ는 대기 DB에도 같은 용량을 잡으므로 스토리지도 2배로 계산한다.
    const perGb = price(p, "rds", r.instance, "storagePerGbMonth") * (multi ? 2 : 1);
    const hours = hoursOf(r);
    return {
      lines: [
        {
          service: "RDS",
          label: `RDS ${r.instance} (MySQL, ${multi ? "Multi-AZ" : "Single-AZ"})${hours !== H ? ` (월 ${num(hours)}시간)` : ""}`,
          usd: hourly * hours,
          detail: `${unitPrice(hourly, "시간")} × ${num(hours)}시간`,
          why: "RDS는 AWS가 백업·패치를 관리해주는 데이터베이스예요. 켜져 있는 시간만큼 과금돼요.",
        },
        {
          service: "RDS",
          label: `RDS 스토리지 gp3 ${num(r.storageGb)}GB${multi ? " (Multi-AZ)" : ""}`,
          usd: perGb * r.storageGb,
          detail: `${unitPrice(perGb, "GB-월")} × ${num(r.storageGb)}GB`,
          why: "DB 데이터가 저장되는 디스크예요. 실제 사용량이 아니라 잡아둔(프로비저닝한) 용량만큼 과금돼요.",
        },
      ],
      warnings: multi ? ["alwaysOn"] : ["alwaysOn", "rdsMultiAz"],
    };
  },

  dataTransferOut(r, p) {
    const perGb = price(p, "dataTransferOut", "perGb");
    return {
      lines: [{
        service: "전송",
        label: `데이터 전송(아웃바운드) ${num(r.gb)}GB`,
        usd: perGb * r.gb,
        detail: `${unitPrice(perGb, "GB")} × ${num(r.gb)}GB`,
        why: "AWS에서 인터넷으로 나가는 데이터(사용자에게 보내는 응답, 이미지 등)에 GB당 요금이 붙어요. 들어오는 데이터는 무료예요.",
        tier: { path: ["dataTransferOut", "perGb"], qty: r.gb },
      }],
      warnings: ["dataTransfer"],
    };
  },

  lightsail(r, p) {
    const bundle = price(p, "lightsail", r.bundle);
    const count = r.count ?? 1;
    return {
      lines: [{
        service: "Lightsail",
        label: `Lightsail ${r.bundle} 번들${count !== 1 ? ` × ${count}대` : ""}`,
        usd: bundle.monthly * count,
        detail: `월 정액 ${formatUsd(bundle.monthly)}${count !== 1 ? ` × ${count}대` : ""} (시간당 $${bundle.hourly}, 월 최대 744시간)`,
        why: "서버·SSD 디스크·퍼블릭 IPv4·데이터 전송 허용량이 한 요금에 포함돼요. 허용량을 넘는 전송량만 추가로 과금돼요.",
      }],
      warnings: ["lightsailStop"],
    };
  },

  s3(r, p) {
    const perGb = price(p, "s3", "storagePerGbMonth");
    const put = price(p, "s3", "putPerRequest");
    const get = price(p, "s3", "getPerRequest");
    return {
      lines: [
        {
          service: "S3",
          label: `S3 저장 ${num(r.storageGb)}GB`,
          usd: perGb * r.storageGb,
          detail: `${unitPrice(perGb, "GB-월")} × ${num(r.storageGb)}GB`,
          why: "S3는 파일 저장소예요. 저장한 용량만큼 매달 과금돼요.",
          tier: { path: ["s3", "storagePerGbMonth"], qty: r.storageGb },
        },
        {
          service: "S3",
          label: `S3 요청 (업로드 ${num(r.putRequests)}건, 조회 ${num(r.getRequests)}건)`,
          usd: put * r.putRequests + get * r.getRequests,
          detail: `업로드 ${per1k(put)}, 조회 ${per10k(get)}`,
          why: "파일 업로드·조회 요청 수에 따라 과금돼요. CloudFront를 앞에 두면 캐시 덕분에 S3까지 오는 조회는 일부뿐이에요.",
        },
      ],
      warnings: [],
    };
  },

  cloudfront(r, p) {
    const perGb = price(p, "cloudfront", "perGb");
    const perReq = price(p, "cloudfront", "httpsPerRequest");
    return {
      lines: [
        {
          service: "CloudFront",
          label: `CloudFront 전송 ${num(r.gb)}GB`,
          usd: perGb * r.gb,
          detail: `${unitPrice(perGb, "GB")} × ${num(r.gb)}GB`,
          why: "CloudFront는 전 세계 엣지에서 사이트를 전달하는 CDN이에요. S3 → CloudFront 전송은 무료이고, 사용자에게 나가는 전송량만 과금돼요 (리전 근처 사용자 기준 단가).",
          tier: { path: ["cloudfront", "perGb"], qty: r.gb },
        },
        {
          service: "CloudFront",
          label: `CloudFront HTTPS 요청 ${num(r.requests)}건`,
          usd: perReq * r.requests,
          detail: per10k(perReq),
          why: "사용자가 페이지·이미지를 요청할 때마다 아주 작은 요금이 붙어요.",
        },
      ],
      warnings: [],
    };
  },

  amplify(r, p) {
    const build = price(p, "amplify", "buildPerMinute");
    const perGb = price(p, "amplify", "storagePerGbMonth");
    const served = price(p, "amplify", "servedPerGb");
    return {
      lines: [
        {
          service: "Amplify",
          label: `Amplify 빌드 ${num(r.buildMinutes)}분`,
          usd: build * r.buildMinutes,
          detail: `${unitPrice(build, "분")} × ${num(r.buildMinutes)}분`,
          why: "Git에 푸시할 때마다 Amplify가 사이트를 빌드하는데, 빌드한 시간만큼 과금돼요.",
        },
        {
          service: "Amplify",
          label: `Amplify 저장 ${num(r.storageGb)}GB`,
          usd: perGb * r.storageGb,
          detail: `${unitPrice(perGb, "GB-월")} × ${num(r.storageGb)}GB`,
          why: "배포된 사이트 파일을 보관하는 용량 요금이에요.",
        },
        {
          service: "Amplify",
          label: `Amplify 전송 ${num(r.servedGb)}GB`,
          usd: served * r.servedGb,
          detail: `${unitPrice(served, "GB")} × ${num(r.servedGb)}GB`,
          why: "사용자에게 사이트를 전달한 데이터 양만큼 과금돼요. CDN·HTTPS 요금이 포함된 단가예요.",
        },
      ],
      warnings: [],
    };
  },

  lambda(r, p) {
    const perReq = price(p, "lambda", "perRequest");
    const perGbSec = price(p, "lambda", "perGbSecondArm");
    const gbSeconds = r.requests * (r.durationMs / 1000) * (r.memoryMb / 1024);
    return {
      lines: [
        {
          service: "Lambda",
          label: `Lambda 호출 ${num(r.requests)}건`,
          usd: perReq * r.requests,
          detail: perMillion(perReq),
          why: "Lambda는 요청이 올 때만 코드를 실행해요. 실행 횟수만큼 과금돼요.",
        },
        {
          service: "Lambda",
          label: `Lambda 실행 시간 ${num(Math.round(gbSeconds))} GB-초`,
          usd: perGbSec * gbSeconds,
          detail: `${num(r.requests)}건 × ${num(r.durationMs)}ms × ${num(r.memoryMb)}MB, ${unitPrice(perGbSec, "GB-초")} (ARM)`,
          why: "실행 시간 × 메모리 크기(GB-초)만큼 과금돼요. 메모리를 크게 잡거나 코드가 느리면 비용이 올라가요.",
          tier: { path: ["lambda", "perGbSecondArm"], qty: gbSeconds },
        },
      ],
      warnings: [],
    };
  },

  apiGatewayHttp(r, p) {
    const perReq = price(p, "apiGatewayHttp", "perRequest");
    return {
      lines: [{
        service: "API Gateway",
        label: `API Gateway HTTP API ${num(r.requests)}건`,
        usd: perReq * r.requests,
        detail: perMillion(perReq),
        why: "API 주소로 들어오는 요청을 받아 Lambda로 넘겨줘요. 요청 수만큼 과금돼요.",
        tier: { path: ["apiGatewayHttp", "perRequest"], qty: r.requests },
      }],
      warnings: ["trafficSpike"],
    };
  },

  dynamodb(r, p) {
    const read = price(p, "dynamodb", "perReadUnit");
    const write = price(p, "dynamodb", "perWriteUnit");
    const perGb = price(p, "dynamodb", "storagePerGbMonth");
    return {
      lines: [
        {
          service: "DynamoDB",
          label: `DynamoDB 읽기 ${num(r.reads)}건 · 쓰기 ${num(r.writes)}건`,
          usd: read * r.reads + write * r.writes,
          detail: `읽기 ${perMillion(read)}, 쓰기 ${perMillion(write)} (온디맨드)`,
          why: "온디맨드 모드는 읽기·쓰기 요청 수만큼만 과금돼요 (항목 4KB 이하 읽기, 1KB 이하 쓰기 기준).",
        },
        {
          service: "DynamoDB",
          label: `DynamoDB 저장 ${num(r.storageGb)}GB`,
          usd: perGb * r.storageGb,
          detail: `${unitPrice(perGb, "GB-월")} × ${num(r.storageGb)}GB`,
          why: "테이블에 저장된 데이터 용량 요금이에요.",
        },
      ],
      warnings: [],
    };
  },

  domain(r, p) {
    const zone = price(p, "route53", "hostedZoneMonthly");
    const yearly = price(p, "route53", "comDomainYearly");
    return {
      lines: [
        {
          service: "도메인",
          label: `도메인 등록 (.com) × ${r.count}`,
          usd: (yearly / 12) * r.count,
          detail: `연 ${formatUsd(yearly)} ÷ 12개월 × ${r.count}`,
          why: "example.com 같은 주소를 1년 단위로 사는 비용이에요. 한 달 요금으로 나눠서 보여줘요 (.com 기준, 도메인 종류마다 달라요).",
        },
        {
          service: "도메인",
          label: `Route 53 호스팅 영역 × ${r.count}`,
          usd: zone * r.count,
          detail: `${unitPrice(zone, "월")} × ${r.count}`,
          why: "도메인을 서버·CloudFront 주소에 연결해주는 DNS 설정 묶음이에요. 도메인 하나당 하나씩 필요해요.",
        },
      ],
      warnings: [],
    };
  },

  fargate(r, p) {
    const vcpu = price(p, "fargate", "perVcpuHour");
    const mem = price(p, "fargate", "perGbHour");
    const hours = hoursOf(r);
    return {
      lines: [{
        service: "Fargate",
        label: `Fargate ${r.vcpu}vCPU · ${r.memoryGb}GB × ${r.count}개${hours !== H ? ` (월 ${num(hours)}시간)` : ""}`,
        usd: (vcpu * r.vcpu + mem * r.memoryGb) * hours * r.count,
        detail: `(${unitPrice(vcpu, "vCPU-시간")} × ${r.vcpu} + ${unitPrice(mem, "GB-시간")} × ${r.memoryGb}) × ${num(hours)}시간 × ${r.count}개`,
        why: "Fargate는 서버 없이 컨테이너를 실행해요. 컨테이너에 잡은 CPU·메모리 크기 × 실행 시간만큼 과금돼요 (Linux/x86 기준).",
      }],
      warnings: ["alwaysOn", "natGateway"],
    };
  },
};

export const RESOURCE_TYPES = Object.keys(CALCULATORS);

/** 리소스 하나를 계산한다. 숫자 입력이 이상하면(음수, NaN) 바로 실패한다. */
export function calculateResource(raw, regionPrices, presetValues = {}) {
  const r = resolveResource(raw, presetValues);
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number" && !(Number.isFinite(v) && v >= 0)) throw new Error(`'${k}' 값이 올바르지 않아요: ${v}`);
  }
  const calc = CALCULATORS[r.type];
  if (!calc) throw new Error(`알 수 없는 리소스 타입: ${r.type}`);
  if (r.count === 0) return { resource: r, lines: [], warnings: [] };
  return { resource: r, ...calc(r, regionPrices) };
}

/** 리소스 목록의 월 비용을 계산한다. count가 0인 리소스는 건너뛴다. */
export function calculateOption(option, presetValues, regionPrices) {
  const lines = [];
  const warnings = new Map();
  const addWarning = (id, r) => {
    if (!warnings.has(id)) warnings.set(id, { id, ...WARNINGS[id](regionPrices, r) });
  };
  for (const raw of option.resources) {
    const out = calculateResource(raw, regionPrices, presetValues);
    lines.push(...out.lines);
    for (const id of out.warnings) addWarning(id, out.resource);
  }
  for (const line of lines) {
    if (!line.tier) continue;
    const [service, key] = line.tier.path;
    const limit = regionPrices[service]?.[`${key}UpTo`];
    if (limit !== undefined && line.tier.qty > limit) addWarning("tierExceeded");
  }
  const totalUsd = lines.reduce((sum, l) => sum + l.usd, 0);
  return { id: option.id, name: option.name, totalUsd, lines, warnings: [...warnings.values()] };
}

/**
 * 템플릿의 모든 구성안을 계산한다.
 * overrides로 프리셋 값 일부를 바꿀 수 있다 (직접 조정). compareRegionId를 주면 그 리전 합계도 같이 돌려준다.
 */
export function calculateTemplate(template, presetId, prices, regionId, compareRegionId, overrides = {}) {
  const preset = template.presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`프리셋 없음: ${presetId}`);
  const regionPrices = prices.regions[regionId];
  if (!regionPrices) throw new Error(`리전 없음: ${regionId}`);
  const values = { ...preset.values, ...overrides };
  const options = template.options.map((option) => {
    const result = calculateOption(option, values, regionPrices);
    if (compareRegionId && compareRegionId !== regionId) {
      result.compareTotalUsd = calculateOption(option, values, prices.regions[compareRegionId]).totalUsd;
    }
    return { ...option, ...result };
  });
  const cheapest = Math.min(...options.map((o) => o.totalUsd));
  for (const o of options) o.isCheapest = options.length > 1 && o.totalUsd === cheapest;
  return { preset, values, options };
}
