// 형식 A(PinPoint) + 형식 B(OMEGA) 섞기 테스트
// 사용법: npx tsx scripts/compose-mixed-test.ts <형식A.hwpx> <형식B.hwpx> <출력폴더>
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseHwpx } from "../src/hwpx/parse";
import { composeWorksheet, auditHwpx, type ComposeExam, type ComposeItem } from "../src/hwpx/compose";

const [, , aPath, bPath, outDir] = process.argv;
const load = async (key: string, f: string) => {
  const buf = new Uint8Array(fs.readFileSync(f));
  const ex = await parseHwpx(buf);
  const exam: ComposeExam = { key, file: buf, sectionHead: ex.sectionHead, sectionTail: ex.sectionTail, shellRunsXml: ex.shellRunsXml, headerTitleText: ex.headerTitleText, problemStyleId: ex.problemStyleId };
  const item = (n: number): ComposeItem => {
    const p = ex.problems[n - 1];
    return { examKey: key, number: n, answer: p.answer, problemXml: p.problemXml, problemXmlWithSolution: p.problemXmlWithSolution, label: `${ex.sourceTitle} ${n}번` };
  };
  return { exam, item };
};
const A = await load("A", aPath);
const B = await load("B", bPath);
fs.mkdirSync(outDir, { recursive: true });

const cases: [string, ComposeItem[]][] = [
  ["섞기_바탕PinPoint.hwpx", [A.item(8), B.item(3), A.item(2), B.item(14)]],
  ["섞기_바탕OMEGA.hwpx", [B.item(3), A.item(8), B.item(14), A.item(2)]],
  ["OMEGA만_순서바꿈.hwpx", [B.item(20), B.item(1), B.item(12)]],
];
for (const [name, items] of cases) {
  const out = await composeWorksheet([A.exam, B.exam], items, { title: "형식 섞기 테스트", answers: "key", showSource: true });
  fs.writeFileSync(path.join(outDir, name), out);
  const issues = await auditHwpx(out);
  const z = await JSZip.loadAsync(out);
  const sec = await z.file("Contents/section0.xml")!.async("string");
  const nums = [...sec.matchAll(/<hp:t>\s*(\d{1,2})\. /g)].map((m) => m[1]);
  const titles = [...sec.matchAll(/<hp:t>([^<]*(?:형식 섞기|OMEGA|PinPoint Light :)[^<]*)<\/hp:t>/g)].map((m) => m[1]);
  console.log(name, issues.length ? issues.slice(0, 8) : "참조 점검 통과", "| 직접 번호:", nums.join(","), "| 제목·출처 글자:", titles);
}
