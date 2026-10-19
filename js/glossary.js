// 용어 사전: 설명 문장 속 어려운 용어를 눌러서 뜻을 볼 수 있게 한다.
//   glossarize(html)  이미 이스케이프된 문장에서 용어를 찾아 버튼으로 감싼다
//   renderGlossary()  #/glossary 전체 용어 사전 화면
let entries = []; // [{ term, aliases, category, desc }]
let pattern = null;
const byWord = new Map(); // 용어·별칭 → 항목

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function setGlossary(terms) {
  entries = terms;
  byWord.clear();
  for (const e of terms) for (const w of [e.term, ...(e.aliases ?? [])]) byWord.set(w, e);
  // 긴 단어부터 찾아야 'Route 53'이 'Route'보다 먼저 잡힌다.
  const words = [...byWord.keys()].sort((a, b) => b.length - a.length).map(escRe);
  pattern = words.length ? new RegExp(words.join("|"), "g") : null;
}

/** 이스케이프된 문장에서 용어를 찾아 버튼으로 감싼다. 같은 용어는 문장마다 처음 한 번만. */
export function glossarize(html) {
  if (!pattern) return html;
  const seen = new Set();
  return html.replace(pattern, (word) => {
    const e = byWord.get(word);
    if (seen.has(e.term)) return word;
    seen.add(e.term);
    return `<button type="button" class="term" data-term="${escHtml(e.term)}">${word}</button>`;
  });
}

// ---- 뜻 보기 시트 (화면 아래에서 올라오는 작은 창) ----
let sheet = null;

function openSheet(term) {
  const e = entries.find((x) => x.term === term);
  if (!e) return;
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.className = "term-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "false");
    document.body.appendChild(sheet);
  }
  sheet.innerHTML = `
    <div class="term-sheet-inner">
      <div class="term-sheet-head">
        <strong>${escHtml(e.term)}</strong>
        <button type="button" class="remove" data-close aria-label="닫기">×</button>
      </div>
      <p>${escHtml(e.desc)}</p>
      <a href="#/glossary" data-close>용어 사전 전체 보기 ›</a>
    </div>`;
  sheet.hidden = false;
  sheet.querySelector("[data-close]").focus();
}

function closeSheet() {
  if (sheet) sheet.hidden = true;
}

/** 페이지 전체에 한 번만 건다. */
export function installGlossaryHandlers() {
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".term");
    if (btn) {
      ev.preventDefault();
      ev.stopPropagation(); // <summary> 안에 있어도 접기/펼치기가 같이 일어나지 않게
      openSheet(btn.dataset.term);
      return;
    }
    if (ev.target.closest("[data-close]") || (sheet && !sheet.hidden && !ev.target.closest(".term-sheet"))) closeSheet();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeSheet();
  });
  window.addEventListener("hashchange", closeSheet);
}

// ---- 용어 사전 화면 ----
export function renderGlossary(app) {
  document.title = "용어 사전 · AWS 얼마야?";
  const categories = [...new Set(entries.map((e) => e.category))];
  const list = (q) => {
    const query = q.trim().toLowerCase();
    const hit = (e) => !query || [e.term, ...(e.aliases ?? []), e.desc].some((s) => s.toLowerCase().includes(query));
    const html = categories
      .map((c) => {
        const items = entries.filter((e) => e.category === c && hit(e));
        if (!items.length) return "";
        return `<section class="card">
            <h2 class="card-title">${escHtml(c)}</h2>
            <div class="glossary">${items
              .map(
                // 처음엔 용어 이름만 보이고 누르면 뜻이 펼쳐진다. 검색 중이면 찾은 용어를 펼쳐서 보여준다.
                (e) => `<details class="glossary-item" id="term-${escHtml(e.term)}" ${query ? "open" : ""}>
                  <summary><span>${escHtml(e.term)}${e.aliases?.length ? ` <span class="alias">${e.aliases.map(escHtml).join(" · ")}</span>` : ""}</span></summary>
                  <p>${escHtml(e.desc)}</p>
                </details>`
              )
              .join("")}</div>
          </section>`;
      })
      .join("");
    return html || `<section class="card"><div class="empty"><strong>찾는 용어가 없어요</strong>다른 단어로 검색해보세요.</div></section>`;
  };
  app.innerHTML = `
    <div class="page-head">
      <a class="back" href="#/">‹ 처음으로</a>
      <p class="step">📖 용어 사전</p>
      <h1 class="page-title">AWS 용어, 쉽게 풀어봤어요</h1>
      <p class="page-sub">용어를 누르면 뜻이 펼쳐져요. 설명 속 <span class="term-sample">밑줄 친 단어</span>도 누르면 어디서든 뜻을 볼 수 있어요.</p>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label for="glossary-q" class="sr-only">용어 검색</label>
      <input id="glossary-q" type="search" placeholder="용어 검색 (예: NAT, 리전)" autocomplete="off">
    </div>
    <div id="glossary-list">${list("")}</div>`;
  const listEl = app.querySelector("#glossary-list");
  app.querySelector("#glossary-q").addEventListener("input", (e) => (listEl.innerHTML = list(e.target.value)));
}
