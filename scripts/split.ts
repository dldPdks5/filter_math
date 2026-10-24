// 사용법: npx tsx scripts/split.ts <입력.hwpx> <출력폴더>
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseHwpx, blockText } from "../src/hwpx/parse";

const [, , input, outDir] = process.argv;
fs.mkdirSync(path.join(outDir, "images"), { recursive: true });
const buf = fs.readFileSync(input);
const exam = await parseHwpx(buf);

// 이미지 복사
const zip = await JSZip.loadAsync(buf);
for (const [id, b] of Object.entries(exam.binData)) {
  const f = zip.file(b.path);
  if (f) fs.writeFileSync(path.join(outDir, "images", path.basename(b.path)), await f.async("nodebuffer"));
}

fs.writeFileSync(path.join(outDir, "exam.json"), JSON.stringify(exam, null, 1));
console.log("출처:", exam.sourceTitle, "| 원문:", exam.sourceRaw);
for (const p of exam.problems) {
  console.log(
    `${String(p.number).padStart(2)}번 정답=${p.answer.padEnd(3)} 수식 ${String(p.equationCount).padStart(3)}개 그림[${p.images}] 해설그림[${p.solutionImages}] 해설문단 ${p.solutionBlocks.length}`
  );
  console.log("     ", p.problemBlocks.map(blockText).join(" / ").slice(0, 110));
}
