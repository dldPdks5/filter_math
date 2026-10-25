// 양식 파일 + 따로 저장한 그림으로 출력해도 원본으로 출력한 것과 같은지 점검
// 사용법: npx tsx scripts/template-test.ts <형식A.hwpx> <형식B.hwpx> <출력폴더>
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseHwpx } from "../src/hwpx/parse";
import { composeWorksheet, auditHwpx, makeTemplate, stripEndNotes, type ComposeExam, type ComposeItem } from "../src/hwpx/compose";

const [, , aPath, bPath, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const load = async (key: string, f: string) => {
  const buf = new Uint8Array(fs.readFileSync(f));
  const ex = await parseHwpx(buf);
  const zip = await JSZip.loadAsync(buf);
  const tpl = await makeTemplate(buf);
  console.log(`${key}: 원본 ${(buf.length / 1024).toFixed(0)}KB → 양식 ${(tpl.length / 1024).toFixed(0)}KB`);
  // 미주 제거 결과가 파서의 '해설 없는 XML'과 같은지
  const same = ex.problems.every((p) => stripEndNotes(p.problemXmlWithSolution) === p.problemXml);
  console.log(`  미주 빼기 = 파서 결과: ${same ? "일치" : "불일치"}`);
  const exam: ComposeExam = {
    key, file: tpl, sectionHead: ex.sectionHead, sectionTail: ex.sectionTail, shellRunsXml: ex.shellRunsXml, headerTitleText: ex.headerTitleText, problemStyleId: ex.problemStyleId,
    getBin: async (id) => { const b = ex.binData[id]; const f = b && zip.file(b.path); return f ? f.async("uint8array") : null; },
  };
  const item = (n: number): ComposeItem => {
    const p = ex.problems[n - 1];
    return { examKey: key, number: n, answer: p.answer, problemXml: "", problemXmlWithSolution: p.problemXmlWithSolution, label: `${ex.sourceTitle} ${n}번` };
  };
  return { exam, item };
};
const A = await load("A", aPath);
const B = await load("B", bPath);
for (const [name, items, answers] of [
  ["양식_PinPoint_해설.hwpx", [A.item(8), A.item(5), A.item(10)], "solutions"],
  ["양식_섞기_문제만.hwpx", [A.item(8), B.item(3), A.item(5), B.item(20)], "none"],
  ["양식_섞기_바탕OMEGA.hwpx", [B.item(3), A.item(8)], "key"],
] as const) {
  const out = await composeWorksheet([A.exam, B.exam], items as any, { title: "양식 테스트", answers, showSource: true });
  fs.writeFileSync(path.join(outDir, name), out);
  const z = await JSZip.loadAsync(out);
  const bins = Object.keys(z.files).filter((f) => f.startsWith("BinData/"));
  const sec = await z.file("Contents/section0.xml")!.async("string");
  console.log(name, (await auditHwpx(out)).join(",") || "참조 점검 통과", "| 그림", bins.length, "| 미주", (sec.match(/<hp:endNote /g) ?? []).length);
}
