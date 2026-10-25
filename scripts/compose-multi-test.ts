// 여러 회차 섞기 테스트: 같은 파일을 서로 다른 회차인 것처럼 두 번 넣고(재매핑 강제) 결과를 점검
// 사용법: npx tsx scripts/compose-multi-test.ts <원본.hwpx> <출력폴더>
import fs from "node:fs";
import path from "node:path";
import { parseHwpx } from "../src/hwpx/parse";
import { composeWorksheet, auditHwpx, type ComposeExam, type ComposeItem } from "../src/hwpx/compose";

const [, , input, outDir] = process.argv;
const buf = new Uint8Array(fs.readFileSync(input));
const ex = await parseHwpx(buf);
const mk = (key: string): ComposeExam => ({ key, file: buf, sectionHead: ex.sectionHead, sectionTail: ex.sectionTail, shellRunsXml: ex.shellRunsXml, headerTitleText: ex.headerTitleText, problemStyleId: ex.problemStyleId });
const item = (key: string, n: number, label: string): ComposeItem => {
  const p = ex.problems[n - 1];
  return { examKey: key, number: n, answer: p.answer, problemXml: p.problemXml, problemXmlWithSolution: p.problemXmlWithSolution, label: `${label} ${n}번` };
};
const items = [item("a", 2, "A회차"), item("b", 8, "B회차"), item("a", 5, "A회차"), item("b", 10, "B회차")];
fs.mkdirSync(outDir, { recursive: true });
for (const [name, opt] of [
  ["섞기_해설포함_출처.hwpx", { answers: "solutions", showSource: true, forceRemap: true, title: "섞기 테스트" }],
  ["섞기_빠른정답.hwpx", { answers: "key", showSource: false, forceRemap: true, title: "섞기 테스트" }],
  ["섞기_문제만_같은양식.hwpx", { answers: "none", showSource: false, title: "섞기 테스트" }],
] as const) {
  const out = await composeWorksheet([mk("a"), mk("b")], items, opt as any);
  fs.writeFileSync(path.join(outDir, name), out);
  const issues = await auditHwpx(out);
  console.log(name, (out.length / 1024).toFixed(0) + "KB", issues.length ? issues.slice(0, 10) : "참조 점검 통과");
}
