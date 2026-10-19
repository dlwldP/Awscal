// 구성 다이어그램: 사용자 → 입구 → 서버 → 데이터 흐름을 상자와 화살표로 그린다.
// 구성안의 리소스 목록만 보고 그리므로 템플릿을 추가해도 따로 그림을 만들 필요가 없다.
import { calculateResource, formatUsd } from "./engine.js";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 리소스 타입 → 어느 칸(column)에 놓을지, 상자 모양
const NODES = {
  cloudfront: { col: "entry", icon: "⚡", title: () => "CloudFront", sub: "CDN" },
  amplify: { col: "entry", icon: "🚀", title: () => "Amplify", sub: "빌드·배포·CDN" },
  apiGatewayHttp: { col: "entry", icon: "🚪", title: () => "API Gateway", sub: "HTTP API" },
  alb: { col: "entry", icon: "⚖️", title: () => "로드밸런서", sub: "ALB" },
  ec2: { col: "compute", icon: "🖥️", title: (r) => `EC2 × ${r.count}`, sub: (r) => r.instance },
  lightsail: { col: "compute", icon: "💡", title: () => "Lightsail", sub: (r) => `${r.bundle} 번들` },
  fargate: { col: "compute", icon: "📦", title: (r) => `Fargate × ${r.count}`, sub: (r) => `${r.vcpu}vCPU · ${r.memoryGb}GB` },
  lambda: { col: "compute", icon: "λ", title: () => "Lambda", sub: (r) => `${r.memoryMb}MB` },
  rds: { col: "data", icon: "🗄️", title: () => "RDS MySQL", sub: (r) => r.instance },
  dynamodb: { col: "data", icon: "📇", title: () => "DynamoDB", sub: "온디맨드" },
  s3: { col: "data", icon: "🪣", title: () => "S3", sub: "파일 저장" },
};

const COLUMNS = ["user", "entry", "compute", "data"];

/**
 * 다이어그램 모델: 칸 목록 [{ id, nodes: [{ icon, title, sub, usd, notes: [{ text, usd, warn }] }] }].
 * resources는 값이 채워진(resolve된) 리소스 목록이다. count가 0인 리소스는 빠진다.
 */
export function diagramModel(resources, regionPrices) {
  const cols = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  const user = { icon: "👤", title: "사용자", sub: "인터넷", usd: null, notes: [] };
  cols.user.push(user);
  const cost = (r) => calculateResource(r, regionPrices).lines.reduce((s, l) => s + l.usd, 0);
  const active = resources.filter((r) => r.count !== 0);

  // 1) 상자 만들기
  const byType = {};
  for (const r of active) {
    const spec = NODES[r.type];
    if (!spec) continue;
    const pick = (v) => (typeof v === "function" ? v(r) : v);
    const node = { type: r.type, icon: spec.icon, title: pick(spec.title), sub: pick(spec.sub), usd: cost(r), notes: [] };
    cols[spec.col].push(node);
    byType[r.type] = node;
  }
  const compute = cols.compute[0];

  // 2) 상자에 붙는 비용 (꼬리표)
  for (const r of active) {
    if (NODES[r.type]) continue;
    const usd = cost(r);
    if (r.type === "ebs") (byType.ec2 ?? compute ?? user).notes.push({ text: `디스크 ${r.sizeGb}GB`, usd, warn: false });
    else if (r.type === "publicIpv4") {
      const target = r.attachedTo === "ALB" ? byType.alb : compute;
      (target ?? user).notes.push({ text: `퍼블릭 IPv4 × ${r.count * (r.multiplier ?? 1)}`, usd, warn: true });
    } else if (r.type === "natGateway") (compute ?? user).notes.push({ text: "NAT Gateway", usd, warn: true });
    else if (r.type === "dataTransferOut") user.notes.push({ text: `받는 데이터 ${r.gb}GB`, usd, warn: false });
    else if (r.type === "domain") user.notes.push({ text: "도메인 (Route 53)", usd, warn: false });
  }
  return COLUMNS.map((id) => ({ id, nodes: cols[id] })).filter((c) => c.nodes.length);
}

function nodeHtml(n) {
  return `<div class="dg-node">
      <div class="dg-head"><span class="dg-ico" aria-hidden="true">${n.icon}</span>
        <span><strong>${esc(n.title)}</strong>${n.sub ? `<small>${esc(n.sub)}</small>` : ""}</span></div>
      ${n.usd !== null ? `<div class="dg-usd num">${formatUsd(n.usd)}</div>` : ""}
      ${
        n.notes.length
          ? `<ul class="dg-notes">${n.notes
              .map((x) => `<li class="${x.warn ? "warn-note" : ""}">${esc(x.text)} <span class="num">${formatUsd(x.usd)}</span></li>`)
              .join("")}</ul>`
          : ""
      }
    </div>`;
}

export function diagramHtml(resources, regionPrices) {
  const cols = diagramModel(resources, regionPrices);
  const label = cols.map((c) => c.nodes.map((n) => n.title).join("·")).join(" → ");
  return `<div class="diagram" role="img" aria-label="구성도: ${esc(label)}">
      ${cols.map((c) => `<div class="dg-col">${c.nodes.map(nodeHtml).join("")}</div>`).join('<div class="dg-arrow" aria-hidden="true"></div>')}
    </div>`;
}
