// 입력 화면 정의: 어떤 값을 어떤 이름·단위로 입력받을지.
// 계산식은 engine.js에 있고, 여기는 화면에 보여줄 정보만 둔다.

/**
 * 입력 칸 정의 (필드 이름 → 표시 정보).
 * type: number | select. select의 source는 가격 데이터의 목록(ec2, rds, lightsail)이고 choices는 고정 목록.
 */
export const FIELDS = {
  // 서버
  instance: { label: "서버 사양", type: "select", source: "ec2", help: "t4g는 ARM(더 저렴), t3는 x86이에요. 숫자가 아니라 nano < micro < small < medium < large 순서로 커져요." },
  count: { label: "대수", type: "number", unit: "대", min: 0, step: 1 },
  hours: { label: "월 켜두는 시간", type: "number", unit: "시간", min: 0, max: 744, step: 1, help: "한 달 내내 = 730시간. 평일 낮(하루 8시간 × 22일)만 쓰면 176시간이에요." },
  ebsGb: { label: "서버 디스크(EBS)", type: "number", unit: "GB", min: 1, step: 1 },
  webInstance: { label: "웹 서버 사양", type: "select", source: "ec2" },
  webCount: { label: "웹 서버 대수", type: "number", unit: "대", min: 1, step: 1 },
  sizeGb: { label: "디스크 용량", type: "number", unit: "GB", min: 1, step: 1 },
  bundle: { label: "번들", type: "select", source: "lightsail", help: "메모리 크기로 나뉘어요. 디스크·IPv4·전송량이 포함된 월 정액이에요." },
  lightsailBundle: { label: "Lightsail 번들", type: "select", source: "lightsail", help: "메모리 크기로 나뉘어요. 디스크·IPv4·전송량이 포함된 월 정액이에요." },
  // DB
  dbInstance: { label: "DB 사양 (RDS)", type: "select", source: "rds" },
  dbStorageGb: { label: "DB 저장 공간", type: "number", unit: "GB", min: 20, step: 1, help: "RDS MySQL gp3는 최소 20GB예요." },
  storageGb: { label: "저장 용량", type: "number", unit: "GB", min: 0, step: 1 },
  multiAz: { label: "Multi-AZ (이중화)", type: "select", choices: [[false, "사용 안 함"], [true, "사용 (약 2배)"]] },
  // 로드밸런서·컨테이너
  albCount: { label: "로드밸런서(ALB)", type: "select", choices: [[0, "사용 안 함"], [1, "사용"]] },
  albLcu: { label: "ALB 평균 사용량", type: "number", unit: "LCU", min: 0, step: 0.1, help: "작은 서비스는 보통 1 LCU 미만이에요." },
  lcu: { label: "평균 사용량", type: "number", unit: "LCU", min: 0, step: 0.1, help: "작은 서비스는 보통 1 LCU 미만이에요." },
  fargateVcpu: { label: "컨테이너 CPU", type: "select", choices: [[0.25, "0.25 vCPU"], [0.5, "0.5 vCPU"], [1, "1 vCPU"], [2, "2 vCPU"], [4, "4 vCPU"]] },
  fargateMemoryGb: { label: "컨테이너 메모리", type: "number", unit: "GB", min: 0.5, step: 0.5, help: "CPU에 따라 고를 수 있는 범위가 있어요 (0.25 vCPU는 0.5~2GB)." },
  fargateCount: { label: "컨테이너 개수", type: "number", unit: "개", min: 0, step: 1 },
  vcpu: { label: "CPU", type: "select", choices: [[0.25, "0.25 vCPU"], [0.5, "0.5 vCPU"], [1, "1 vCPU"], [2, "2 vCPU"], [4, "4 vCPU"]] },
  memoryGb: { label: "메모리", type: "number", unit: "GB", min: 0.5, step: 0.5, help: "CPU에 따라 고를 수 있는 범위가 있어요 (0.25 vCPU는 0.5~2GB)." },
  // 트래픽
  egressGb: { label: "월 데이터 전송량", type: "number", unit: "GB", min: 0, step: 1, help: "사용자에게 내보내는 데이터 양. 페이지 1번 보기가 2MB면 1만 번에 약 20GB예요." },
  gb: { label: "월 전송량", type: "number", unit: "GB", min: 0, step: 1 },
  servedGb: { label: "월 전송량", type: "number", unit: "GB", min: 0, step: 1 },
  requests: { label: "월 요청 수", type: "number", unit: "건", min: 0, step: 1000 },
  s3GetRequests: { label: "S3 직접 조회 수", type: "number", unit: "건", min: 0, step: 1000, help: "CloudFront 캐시에 없어서 S3까지 오는 요청이에요. 보통 전체의 10% 정도." },
  getRequests: { label: "조회 요청 수", type: "number", unit: "건", min: 0, step: 1000 },
  putRequests: { label: "업로드 요청 수", type: "number", unit: "건", min: 0, step: 100 },
  buildMinutes: { label: "월 빌드 시간", type: "number", unit: "분", min: 0, step: 1, help: "배포 1번에 보통 2~5분이에요." },
  reads: { label: "월 DB 읽기", type: "number", unit: "건", min: 0, step: 1000 },
  writes: { label: "월 DB 쓰기", type: "number", unit: "건", min: 0, step: 1000 },
  memoryMb: { label: "Lambda 메모리", type: "select", choices: [[128, "128MB"], [256, "256MB"], [512, "512MB"], [1024, "1GB"], [2048, "2GB"]] },
  durationMs: { label: "평균 실행 시간", type: "number", unit: "ms", min: 1, step: 10 },
  // 도메인 (결과 화면에서는 '도메인' 칩으로 따로 켜고 끈다)
  domain: { label: "도메인 연결", type: "select", choices: [[0, "포함 안 함"], [1, "포함 (.com)"]] },
};

/** 결과 화면 "값 직접 바꿔보기"에 보이지 않는 프리셋 값 (별도 UI로 다룸) */
export const HIDDEN_ADJUST_FIELDS = new Set(["domain"]);

/** 직접 계산기에서 추가할 수 있는 서비스. fields는 [필드 이름, 기본값] 목록. */
export const SERVICES = [
  { type: "ec2", icon: "🖥️", name: "EC2", desc: "가상 서버", fields: [["instance", "t4g.small"], ["count", 1], ["hours", 730]] },
  { type: "ebs", icon: "💽", name: "EBS", desc: "서버 디스크", fields: [["sizeGb", 20], ["count", 1, { label: "개수", unit: "개" }]] },
  { type: "publicIpv4", icon: "🌍", name: "퍼블릭 IPv4", desc: "인터넷 접속용 주소", fields: [["count", 1, { label: "개수", unit: "개" }], ["hours", 730]] },
  { type: "lightsail", icon: "💡", name: "Lightsail", desc: "월 정액 서버", fields: [["bundle", "1GB"], ["count", 1]] },
  { type: "rds", icon: "🗄️", name: "RDS (MySQL)", desc: "관리형 데이터베이스", fields: [["instance", "db.t4g.micro", { label: "DB 사양", source: "rds", help: "" }], ["storageGb", 20, { min: 20, help: "RDS MySQL gp3는 최소 20GB예요." }], ["multiAz", false], ["hours", 730]] },
  { type: "dynamodb", icon: "📇", name: "DynamoDB", desc: "서버리스 NoSQL DB", fields: [["reads", 1000000], ["writes", 200000], ["storageGb", 1]] },
  { type: "s3", icon: "🪣", name: "S3", desc: "파일 저장소", fields: [["storageGb", 5], ["putRequests", 10000], ["getRequests", 100000]] },
  { type: "cloudfront", icon: "⚡", name: "CloudFront", desc: "CDN (콘텐츠 전송)", fields: [["gb", 50], ["requests", 1000000]] },
  { type: "amplify", icon: "🚀", name: "Amplify Hosting", desc: "웹사이트 자동 배포", fields: [["buildMinutes", 60], ["storageGb", 1], ["servedGb", 10]] },
  { type: "lambda", icon: "λ", name: "Lambda", desc: "서버리스 함수", fields: [["requests", 1000000], ["memoryMb", 256], ["durationMs", 100]] },
  { type: "apiGatewayHttp", icon: "🚪", name: "API Gateway", desc: "HTTP API", fields: [["requests", 1000000]] },
  { type: "fargate", icon: "📦", name: "ECS Fargate", desc: "서버 없는 컨테이너", fields: [["vcpu", 0.5], ["memoryGb", 1], ["count", 1], ["hours", 730]] },
  { type: "alb", icon: "⚖️", name: "로드밸런서 (ALB)", desc: "요청 분산", fields: [["count", 1, { label: "개수", unit: "개" }], ["lcu", 0.5]] },
  { type: "natGateway", icon: "🚧", name: "NAT Gateway", desc: "프라이빗 서브넷 인터넷 연결", fields: [["count", 1, { label: "개수", unit: "개" }], ["gb", 10, { label: "월 처리량" }]] },
  { type: "dataTransferOut", icon: "📤", name: "데이터 전송", desc: "인터넷으로 나가는 트래픽", fields: [["gb", 30]] },
  { type: "domain", icon: "🔗", name: "도메인 (Route 53)", desc: ".com 주소 + DNS 연결", fields: [["count", 1, { label: "도메인 개수", unit: "개" }]] },
];

/** 필드 정의 + 서비스별 덮어쓰기를 합친다. */
export function fieldDef(name, override = {}) {
  const base = FIELDS[name];
  if (!base) throw new Error(`필드 정의 없음: ${name}`);
  return { name, ...base, ...override };
}

/** select 필드의 선택지 [[값, 표시], ...]. source가 있으면 가격 데이터에 있는 항목만 보여준다. */
export function choicesFor(def, regionPrices) {
  if (def.choices) return def.choices;
  return Object.keys(regionPrices[def.source]).map((k) => [k, k]);
}
