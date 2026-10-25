// 인쇄용 학습지 (A3 세로, 2단) — 브라우저 인쇄 → 'PDF로 저장'
import { getRepo } from "@/repo";
import { blocksHtml } from "@/render/html";
import type { AnswerMode } from "@/repo/types";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function PrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const repo = await getRepo();
  let ids: string[] = [];
  let title = sp.title ?? "학습지";
  let answers: AnswerMode = sp.answers === "key" || sp.answers === "solutions" ? sp.answers : "none";
  let showSource = sp.src === "1";
  if (sp.ws) {
    const w = await repo.getWorksheet(sp.ws);
    if (w) { ids = w.problemIds; title = w.title; answers = w.options.answers; showSource = w.options.showSource; }
  } else if (sp.ids) ids = sp.ids.split(",").filter(Boolean);

  const problems = await repo.getProblems(ids);
  const img = (examId: string) => (bin: string) => `/api/images/${examId}/${encodeURIComponent(bin)}`;

  return (
    <div className="print-root">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="print-bar">
        <strong>{title}</strong>
        <span>{problems.length}문제 / A3 세로 2단</span>
        <PrintButton />
        <p>인쇄 창에서 대상을 <b>PDF로 저장</b>, 용지 <b>A3</b>, 배율 <b>기본(100%)</b>, 여백 <b>기본</b>으로 고르세요.</p>
      </div>

      <div className="sheet-a3">
        <header className="ws-head">
          <h1>{title}</h1>
          <div className="ws-name">이름 <span /></div>
        </header>
        <div className="cols">
          {problems.map((p, i) => (
            <section className="q" key={p.id}>
              <div className="q-no">{i + 1}.</div>
              <div className="q-body" dangerouslySetInnerHTML={{ __html: blocksHtml(p.problemBlocks, img(p.examId)) }} />
              {showSource && <div className="q-src">[{p.examTitle} {p.number}번]</div>}
            </section>
          ))}
        </div>

        {answers !== "none" && (
          <section className="key">
            <h2>빠른 정답</h2>
            <table>
              <tbody>
                {chunk(problems, 10).map((row, r) => (
                  <tr key={r}>
                    {row.map((p, j) => (
                      <td key={p.id}><b>{r * 10 + j + 1}</b> {p.answer || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {answers === "solutions" && (
          <section className="sols">
            <h2>해설</h2>
            <div className="cols">
              {problems.map((p, i) => (
                <section className="s" key={p.id}>
                  <div className="q-no">{i + 1}. <span className="s-ans">정답 {p.answer || "-"}</span></div>
                  <div dangerouslySetInnerHTML={{ __html: blocksHtml(p.solutionBlocks.slice(1), img(p.examId)) }} />
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

// A3(297×420mm) 세로, 여백 18/16mm → 본문 폭 265mm, 2단(단 간격 11mm) → 단 폭 약 127mm
const PRINT_CSS = `
.topbar{display:none}
body{background:#e9ecef}
.print-root{color:#111}
.print-bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 20px;background:#fff;border-bottom:1px solid #d7dde4;font:14px var(--ui)}
.print-bar p{flex-basis:100%;margin:0;color:#4a5566;font-size:13px}
.sheet-a3{width:297mm;min-height:420mm;margin:20px auto;background:#fff;padding:18mm 16mm;box-shadow:0 2px 16px rgba(0,0,0,.12);font:10.5pt/1.8 var(--serif)}
.ws-head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1.2pt solid #111;padding-bottom:3mm;margin-bottom:6mm}
.ws-head h1{font:700 18pt/1.2 var(--ui);margin:0;letter-spacing:-.02em}
.ws-name{font:11pt var(--ui)}
.ws-name span{display:inline-block;width:40mm;border-bottom:.6pt solid #111;margin-left:3mm}
.cols{column-count:2;column-gap:11mm;column-rule:.4pt solid #999}
.q{break-inside:avoid;padding-bottom:26mm}
.q-no{font:700 13pt var(--ui);margin-bottom:1.5mm}
.q-src{font:8.5pt var(--ui);color:#555;margin-top:2mm}
.q .katex,.s .katex{font-size:1.02em}
.key{break-before:page;margin-top:8mm}
.key h2,.sols h2{font:700 14pt var(--ui);border-bottom:1pt solid #111;padding-bottom:2mm}
.key table{border-collapse:collapse;width:100%;font:11pt var(--ui)}
.key td{border:.5pt solid #999;padding:2.5mm 3mm;width:10%}
.key td b{color:#1f4fa3;margin-right:2mm}
.sols{break-before:page}
.s{break-inside:avoid;padding-bottom:8mm;font-size:9.5pt}
.s-ans{font:500 10pt var(--ui);color:#555;margin-left:2mm}
@page{size:A3 portrait;margin:0}
@media print{
  body{background:#fff}
  .print-bar{display:none}
  .sheet-a3{margin:0;box-shadow:none;width:auto;min-height:0}
}
`;
