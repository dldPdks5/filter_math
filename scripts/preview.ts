// 분리 결과 미리보기 HTML 생성
// 사용법: npx tsx scripts/preview.ts <원본.hwpx> <tags.json> <taxonomy.json> <출력.html>
import fs from "node:fs";
import JSZip from "jszip";
import { parseHwpx } from "../src/hwpx/parse";
import { blocksHtml, PROBLEM_CSS } from "../src/render/html";

const [, , input, tagsPath, taxPath, outHtml] = process.argv;
const buf = fs.readFileSync(input);
const exam = await parseHwpx(buf);
const zip = await JSZip.loadAsync(buf);
const tags = JSON.parse(fs.readFileSync(tagsPath, "utf8"));
const tax = JSON.parse(fs.readFileSync(taxPath, "utf8"));
const unitName: Record<string, string> = Object.fromEntries(tax.units.map((u: any) => [u.key, u.name]));

const imgs: Record<string, string> = {};
for (const [id, b] of Object.entries(exam.binData)) {
  const f = zip.file(b.path);
  if (!f) continue;
  const ext = b.path.split(".").pop()!.toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "bmp" ? "image/bmp" : `image/${ext}`;
  imgs[id] = `data:${mime};base64,${(await f.async("nodebuffer")).toString("base64")}`;
}
const res = (id: string) => imgs[id];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const cards = exam.problems
  .map((p) => {
    const t = tags.problems.find((x: any) => x.number === p.number);
    const chips = (t?.tags ?? [])
      .map((s: string) => {
        const [u, sec, tag] = s.split("|");
        const cross = u !== t.mainUnit;
        return `<span class="chip${cross ? " cross" : ""}" title="${esc(unitName[u])} › ${esc(sec)}">${esc(tag)}</span>`;
      })
      .join("");
    return `<article class="card">
  <header>
    <span class="no">${p.number}</span>
    <span class="src">${esc(exam.sourceTitle)} ${p.number}번</span>
    <span class="unit">${esc(unitName[t?.mainUnit] ?? "미분류")}</span>
    <span class="ans">정답 ${esc(p.answer)}</span>
  </header>
  <div class="body">${blocksHtml(p.problemBlocks, res)}</div>
  <div class="chips">${chips}</div>
  <details><summary>해설 보기</summary><div class="sol">${blocksHtml(p.solutionBlocks.slice(1), res)}</div></details>
</article>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>문항 분리 미리보기</title>
<style>${fs.readFileSync(new URL("../src/render/katex-inline.css", import.meta.url), "utf8")}</style>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e1dc;--accent:#2f5d8a;--cross:#8a5a2f;--chip:#eef3f8;--chipx:#f8f1ea}
@media (prefers-color-scheme:dark){:root{--bg:#18181a;--card:#222225;--ink:#ececee;--muted:#a0a0a6;--line:#38383c;--accent:#8fb6dd;--cross:#e0b48a;--chip:#26313c;--chipx:#3a2f24}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.75 "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:20px;margin:0 0 4px}
.meta{color:var(--muted);font-size:13px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;min-width:0}
.card header{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:10px;font-size:13px}
.no{font-weight:700;font-size:18px;color:var(--accent)}
.src{color:var(--muted)}
.unit{font-weight:600}
.ans{margin-left:auto;color:var(--muted)}
.body{overflow-x:auto;max-width:440px}
${PROBLEM_CSS}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chip{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--accent)}
.chip.cross{background:var(--chipx);color:var(--cross)}
details{margin-top:10px;font-size:14px}
summary{cursor:pointer;color:var(--muted)}
.sol{padding-top:6px;overflow-x:auto;max-width:440px}
.eq-fail{color:#c0392b;font-weight:600}
.legend{font-size:12px;color:var(--muted);margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap}
</style></head><body><div class="wrap">
<h1>${esc(exam.sourceTitle)} — 문항 분리 결과</h1>
<div class="meta">원문 머리표: ${esc(exam.sourceRaw)} · ${exam.problems.length}문항 · 태그는 초안(검토 전)</div>
<div class="legend"><span><span class="chip">개념</span> 주 단원의 개념</span><span><span class="chip cross">개념</span> 다른 단원·공통 도구 개념</span></div>
<div class="grid">
${cards}
</div></div></body></html>`;
fs.writeFileSync(outHtml, html);
console.log("저장:", outHtml, (html.length / 1024).toFixed(0) + "KB");
