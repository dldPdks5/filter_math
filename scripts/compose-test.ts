// 사용법: npx tsx scripts/compose-test.ts <원본.hwpx> <출력폴더> 2,5,8,10
// 한 회차에서 고른 문항으로 HWPX 두 종류(해설 포함 / 문제만)를 만듦
import fs from "node:fs";
import path from "node:path";
import { parseHwpx } from "../src/hwpx/parse";
import { composeWorksheet, auditHwpx } from "../src/hwpx/compose";

const [, , input, outDir, list] = process.argv;
const buf = new Uint8Array(fs.readFileSync(input));
const ex = await parseHwpx(buf);
const nums = list.split(",").map(Number);
const exam = { key: "a", file: buf, sectionHead: ex.sectionHead, sectionTail: ex.sectionTail, shellRunsXml: ex.shellRunsXml, headerTitleText: ex.headerTitleText, problemStyleId: ex.problemStyleId };
const items = nums.map((n) => {
  const p = ex.problems[n - 1];
  return { examKey: "a", number: n, answer: p.answer, problemXml: p.problemXml, problemXmlWithSolution: p.problemXmlWithSolution, label: `${ex.sourceTitle} ${n}번` };
});
fs.mkdirSync(outDir, { recursive: true });
const title = `테스트 학습지 (${nums.join("·")}번)`;
for (const [name, answers] of [["학습지_해설포함.hwpx", "solutions"], ["학습지_문제만.hwpx", "none"]] as const) {
  const out = await composeWorksheet([exam], items, { answers, showSource: false, title });
  fs.writeFileSync(path.join(outDir, name), out);
  console.log(name, (await auditHwpx(out)).length ? "점검 문제 있음" : "점검 통과");
}
