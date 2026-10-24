// 원본 파일의 모든 수식을 LaTeX로 바꿔 KaTeX로 렌더해 보고 결과를 기록
import fs from "node:fs";
import JSZip from "jszip";
import katex from "katex";
import { hwpToLatex } from "../src/eq/hwp2latex";
import { unescapeXml } from "../src/hwpx/xmlscan";

const [, , input, outJson] = process.argv;
const zip = await JSZip.loadAsync(fs.readFileSync(input));
const xml = await zip.file("Contents/section0.xml")!.async("string");
const scripts = [...xml.matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map((m) => unescapeXml(m[1]));

const results = scripts.map((s, i) => {
  const { latex, unknown } = hwpToLatex(s);
  let ok = true, err = "";
  try {
    katex.renderToString(latex, { throwOnError: true, strict: "ignore", displayMode: false });
  } catch (e: any) {
    ok = false;
    err = String(e.message).slice(0, 160);
  }
  return { i, hwp: s, latex, ok, err, unknown };
});
const fail = results.filter((r) => !r.ok);
const unk = new Map<string, number>();
results.forEach((r) => r.unknown.forEach((u) => unk.set(u, (unk.get(u) ?? 0) + 1)));
console.log(`전체 ${results.length}개 | KaTeX 렌더 성공 ${results.length - fail.length}개 | 실패 ${fail.length}개`);
fail.forEach((r) => console.log(`#${r.i}\n  HWP: ${r.hwp}\n  TeX: ${r.latex}\n  ERR: ${r.err}`));
console.log("사전에 없는 단어:", [...unk.entries()].sort((a, b) => b[1] - a[1]).map(([w, c]) => `${w}(${c})`).join(" "));
fs.writeFileSync(outJson, JSON.stringify(results, null, 1));
