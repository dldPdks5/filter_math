// Block 구조 → HTML (미리보기·PDF 출력 공용)
import katex from "katex";
import type { Block, Cell, Inline } from "../hwpx/parse";
import { hwpToLatex } from "../eq/hwp2latex";

export type ImageResolver = (binId: string) => string | undefined; // binId → src(URL/data URI)

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function eqHtml(script: string): string {
  const { latex } = hwpToLatex(script);
  try {
    return katex.renderToString(latex, { throwOnError: true, strict: "ignore", output: "html" });
  } catch {
    return `<span class="eq-fail" title="${esc(script)}">[수식 확인 필요]</span>`;
  }
}

function cellHtml(c: Cell, img: ImageResolver): string {
  const [l, r, t, b] = c.bd.split("");
  const cls = `pb-c${l === "1" ? " bl" : ""}${r === "1" ? " br" : ""}${t === "1" ? " bt" : ""}${b === "1" ? " bb" : ""}`;
  const span = `${c.cs > 1 ? ` colspan="${c.cs}"` : ""}${c.rs > 1 ? ` rowspan="${c.rs}"` : ""}`;
  const short = c.b.length <= 1 && (c.b[0] ?? []).every((i) => i.k === "t") && (c.b[0] ?? []).map((i) => (i.k === "t" ? i.v : "")).join("").trim().length <= 8;
  const w = c.wr ? ` style="width:${(c.wr * 100).toFixed(1)}%${short ? ";white-space:nowrap" : ""}"` : short ? ` style="white-space:nowrap"` : "";
  return `<td class="${cls}"${span}${w}>${blocksHtml(c.b, img)}</td>`;
}

function inlineHtml(i: Inline, img: ImageResolver): string {
  switch (i.k) {
    case "t":
      return esc(i.v).replace(/\n/g, "<br>");
    case "eq":
      return eqHtml(i.v);
    case "img": {
      const src = img(i.v);
      const w = i.wr ? ` style="width:${(i.wr * 100).toFixed(1)}%"` : "";
      return src ? `<img class="pb-fig" src="${src}" alt=""${w}>` : `<span class="eq-fail">[그림 ${esc(i.v)}]</span>`;
    }
    case "tbl": {
      const w = i.wr ? ` style="width:${(i.wr * 100).toFixed(1)}%"` : "";
      return `<table class="pb-tbl"${w}>` + i.rows.map((r) => "<tr>" + r.map((c) => cellHtml(c, img)).join("") + "</tr>").join("") + `</table>`;
    }
  }
}

export function blocksHtml(blocks: Block[], img: ImageResolver): string {
  return blocks
    .map((b) => {
      if (!b.length || b.every((i) => i.k === "t" && !i.v.trim())) return "";
      const blockish = b.some((i) => i.k === "tbl" || i.k === "img");
      return `<div class="pb-p${blockish ? " pb-blk" : ""}">${b.map((i) => inlineHtml(i, img)).join("")}</div>`;
    })
    .join("");
}

/** 문항 HTML에 필요한 공용 CSS (KaTeX CSS는 따로 로드) */
export const PROBLEM_CSS = `
.pb-p{margin:2px 0}
.pb-blk{margin:8px 0}
.pb-tbl{border-collapse:collapse;margin:6px auto;table-layout:fixed;max-width:100%}
.pb-c{padding:3px 8px;vertical-align:top}
.pb-c.bl{border-left:1px solid currentColor}.pb-c.br{border-right:1px solid currentColor}
.pb-c.bt{border-top:1px solid currentColor}.pb-c.bb{border-bottom:1px solid currentColor}
.pb-fig{max-width:100%;height:auto;display:block;margin:6px auto;background:#fff}
.eq-fail{color:#c0392b;font-weight:600}
`;
