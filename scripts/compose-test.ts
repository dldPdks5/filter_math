// 사용법: npx tsx scripts/compose-test.ts <원본.hwpx> <출력폴더> 2,5,8,10
import fs from "node:fs";
import path from "node:path";
import { parseHwpx } from "../src/hwpx/parse";
import { composeHwpx } from "../src/hwpx/compose";

const [, , input, outDir, list] = process.argv;
const buf = fs.readFileSync(input);
const exam = await parseHwpx(buf);
const nums = list.split(",").map(Number);
const picked = nums.map((n) => exam.problems.find((p) => p.number === n)!);
fs.mkdirSync(outDir, { recursive: true });
const title = `테스트 학습지 (${nums.join("·")}번)`;
fs.writeFileSync(path.join(outDir, "학습지_해설포함.hwpx"), await composeHwpx(buf, exam, picked, { includeSolutions: true, title }));
fs.writeFileSync(path.join(outDir, "학습지_문제만.hwpx"), await composeHwpx(buf, exam, picked, { includeSolutions: false, title }));
console.log("완료:", nums);
