// 검색엔진용 정적 페이지를 만든다: 템플릿별 소개 페이지와 sitemap.xml.
// (GitHub Pages 프로젝트 사이트는 도메인 루트가 아니라서 robots.txt는 검색엔진이 읽지 않는다.
//  sitemap은 Google Search Console 등에 주소를 직접 등록해서 쓴다.)
// 앱 화면은 자바스크립트로 그려져서 검색에 잘 잡히지 않으므로, 핵심 내용(구성·비용·장단점)을
// 미리 HTML로 만들어 둔다. 가격이 바뀔 때마다 배포 단계에서 다시 만든다.
// 사용법: node scripts/build-pages.js <출력 폴더>   (예: _site)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { calculateTemplate, formatKrw, formatUsd } from "../js/engine.js";

const outDir = process.argv[2] ?? "_site";
const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const prices = load("prices.json");
const { templates } = load("templates.json");
const settings = load("settings.json");
const site = settings.siteUrl.replace(/\/?$/, "/");
const region = settings.defaultRegion;
const { krwPerUsd, vatRate } = settings.exchangeRate;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(t) {
  const results = t.presets.map((p) => ({ preset: p, ...calculateTemplate(t, p.id, prices, region) }));
  const first = results[0];
  const cheapest = first.options.reduce((a, b) => (b.totalUsd < a.totalUsd ? b : a));
  const regionName = prices.regions[region].name;
  const title = `${t.name} AWS 비용, 한 달에 얼마? | AWS 얼마야?`;
  const description = `AWS에 ${t.name} 올리면 월 ${formatUsd(cheapest.totalUsd)}부터 (${regionName}, ${first.preset.name} 기준). ${t.options
    .map((o) => o.name)
    .join(", ")} 비용 비교와 숨은 비용까지 초보자 눈높이로 정리했어요.`;
  const url = `${site}pages/${t.id}.html`;

  const table = `
    <div class="table-wrap"><table class="price-table">
      <thead><tr><th>구성</th>${results.map((r) => `<th>${esc(r.preset.name)}<br><small>${esc(r.preset.description)}</small></th>`).join("")}</tr></thead>
      <tbody>${t.options
        .map(
          (o, i) => `<tr><th>${esc(o.name)}${o.recommended ? ' <span class="tag tag-blue">처음이라면 추천</span>' : ""}</th>${results
            .map((r) => `<td class="num">${formatUsd(r.options[i].totalUsd)}</td>`)
            .join("")}</tr>`
        )
        .join("")}</tbody>
    </table></div>`;

  const cards = first.options
    .map(
      (o) => `
    <article class="card">
      <div class="option-head">
        <h2 class="option-name">${esc(o.name)}</h2>
        ${o.recommended ? '<span class="tag tag-blue">처음이라면 추천</span>' : ""}
        <span class="tag">난이도 ${esc(o.difficulty)}</span>
      </div>
      <p class="option-summary">${esc(o.summary)}</p>
      <div class="amount num">${formatUsd(o.totalUsd)} <small>/ 월 (${esc(first.preset.name)})</small></div>
      <div class="amount-krw num">${formatKrw(o.totalUsd, krwPerUsd, vatRate)} (부가세 포함)</div>
      <div class="section-label">비용 내역</div>
      <ul class="excluded">${o.lines.map((l) => `<li>${esc(l.label)} — ${formatUsd(l.usd)}</li>`).join("")}</ul>
      ${
        o.warnings.length
          ? `<div class="section-label">숨은 비용 주의</div><ul class="excluded">${o.warnings
              .map((w) => `<li><strong>${esc(w.title)}</strong>: ${esc(w.text)}</li>`)
              .join("")}</ul>`
          : ""
      }
      <div class="section-label">이 금액에 포함 안 된 비용</div>
      <ul class="excluded">${o.excluded.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="pros-cons">
        <div><div class="section-label">장점</div><ul class="pros">${o.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
        <div><div class="section-label">단점</div><ul class="cons">${o.cons.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      </div>
    </article>`
    )
    .join("");

  const others = templates
    .filter((x) => x.id !== t.id)
    .map((x) => `<a href="${x.id}.html">${esc(x.name)} 비용</a>`)
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="AWS 얼마야?">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${site}assets/og.png">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💸</text></svg>">
  <script>try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t; } catch (e) {}</script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="../css/styles.css">
</head>
<body>
  <header class="topbar">
    <div class="container">
      <a href="../" class="logo">💸 AWS 얼마야?</a>
      <nav class="topnav"><a href="../#/">구성 추천</a><a href="../#/calc">직접 계산</a></nav>
    </div>
  </header>
  <main class="container">
    <div class="page-head">
      <p class="step">${t.icon} 구성별 비용 정리</p>
      <h1 class="page-title">${esc(t.name)}, AWS로 한 달에 얼마?</h1>
      <p class="page-sub">${esc(t.summary)}. ${esc(regionName)} 리전 온디맨드 요금 기준으로 구성 ${t.options.length}가지를 비교했어요.</p>
    </div>
    <section class="card">
      <h2 class="card-title">규모별 월 비용 (USD, 부가세 별도)</h2>
      ${table}
      <div class="option-actions"><a class="btn btn-primary btn-block" href="../#/t/${t.id}">내 상황으로 다시 계산하기 ›</a></div>
    </section>
    ${cards}
    <section class="card notes">
      <h2 class="card-title">계산 기준</h2>
      <ul>
        <li>${esc(regionName)} 리전, 한 달 = 730시간, 온디맨드 요금 기준이에요.</li>
        <li>가정: ${first.preset.assumptions.map(esc).join(", ")} (${esc(first.preset.name)})</li>
        <li>프리티어·크레딧은 반영하지 않았어요. 원화는 1달러 = ${krwPerUsd.toLocaleString("ko-KR")}원, 부가세 10% 포함이에요.</li>
        <li>가격 갱신일 ${esc(prices.updatedAt)} (AWS Price List API). 예상치이며 실제 청구액과 다를 수 있어요.</li>
      </ul>
    </section>
  </main>
  <footer class="site-footer container">
    다른 구성도 보기
    <nav aria-label="다른 템플릿">${others}<a href="../#/glossary">용어 사전</a></nav>
  </footer>
</body>
</html>
`;
}

mkdirSync(join(outDir, "pages"), { recursive: true });
for (const t of templates) writeFileSync(join(outDir, "pages", `${t.id}.html`), page(t));

const urls = [site, ...templates.map((t) => `${site}pages/${t.id}.html`)];
writeFileSync(
  join(outDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${prices.updatedAt}</lastmod></url>`).join("\n")}
</urlset>
`
);
console.log(`wrote ${templates.length} pages and sitemap.xml → ${outDir}`);
