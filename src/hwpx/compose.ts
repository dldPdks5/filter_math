// 선택한 문항들 → 새 HWPX
// 지금은 "같은 원본 파일에서 고른 문항"만 지원. 여러 파일을 섞을 때는 header.xml의
// 스타일·글자모양·테두리 id를 다시 매기는 작업이 추가로 필요하다(다음 단계).
import JSZip from "jszip";
import type { ParsedExam, ParsedProblem } from "./parse";
import { escapeXml } from "./xmlscan";

export interface ComposeOptions {
  includeSolutions: boolean;
  title?: string; // 머리 표의 회차 문구를 바꿀 제목
}

function firstParaFix(pXml: string, shellRuns: string): string {
  // 첫 문단: 단 나누기 해제 + 구역 설정 run을 맨 앞에 삽입 + 레이아웃 캐시 제거
  const openEnd = pXml.indexOf(">") + 1;
  const open = pXml
    .slice(0, openEnd)
    .replace(/columnBreak="1"/, 'columnBreak="0"')
    .replace(/pageBreak="1"/, 'pageBreak="0"');
  let body = pXml.slice(openEnd);
  const close = body.lastIndexOf("</hp:p>");
  const head = body.slice(0, close);
  const tail = body.slice(close);
  // 이 문단의 최상위 linesegarray 제거 (끝부분에 위치)
  const cleaned = head.replace(/<hp:linesegarray>(?:(?!<hp:linesegarray>)[\s\S])*?<\/hp:linesegarray>$/, "");
  return open + shellRuns + cleaned + tail;
}

export async function composeHwpx(
  templateBuf: Buffer | Uint8Array,
  exam: ParsedExam,
  picked: ParsedProblem[],
  opt: ComposeOptions
): Promise<Uint8Array> {
  if (!picked.length) throw new Error("선택된 문항이 없습니다");
  const src = await JSZip.loadAsync(templateBuf);

  let shell = exam.shellRunsXml;
  if (opt.title && exam.headerTitleText) shell = shell.split(escapeXml(exam.headerTitleText)).join(escapeXml(opt.title));

  const bodies = picked.map((p) => (opt.includeSolutions ? p.problemXmlWithSolution : p.problemXml));
  bodies[0] = firstParaFix(bodies[0], shell);
  const section0 = exam.sectionHead + bodies.join("") + exam.sectionTail;

  // 남는 구역(section1, section2…)과 그 바탕쪽은 제외
  let hpf = await src.file("Contents/content.hpf")!.async("string");
  const keepMaster = new Set((exam.shellRunsXml.match(/<hp:masterPage idRef="([^"]+)"/g) ?? []).map((m) => m.match(/"([^"]+)"/)![1]));
  const drop = new Set<string>();
  for (const m of hpf.matchAll(/<opf:item id="([^"]+)" href="([^"]+)"[^>]*\/>/g)) {
    const [, id, href] = m;
    if (/^section\d+$/.test(id) && id !== "section0") drop.add(href);
    if (/^masterpage\d+$/.test(id) && !keepMaster.has(id)) drop.add(href);
  }
  hpf = hpf.replace(/<opf:item id="([^"]+)" href="([^"]+)"[^>]*\/>/g, (w, _id, href) => (drop.has(href) ? "" : w));
  hpf = hpf.replace(/<opf:itemref idref="(section\d+)"[^>]*\/>/g, (w, id) => (id === "section0" ? w : ""));

  let header = await src.file("Contents/header.xml")!.async("string");
  header = header.replace(/secCnt="\d+"/, 'secCnt="1"');

  const prv = picked.map((p, i) => `${i + 1}. (${exam.sourceTitle} ${p.number}번)`).join("\r\n");

  const out = new JSZip();
  for (const f of Object.values(src.files)) {
    if (f.dir || drop.has(f.name)) continue;
    const stored = f.name === "mimetype" || f.name === "version.xml";
    const opts = { compression: stored ? ("STORE" as const) : ("DEFLATE" as const), createFolders: false };
    if (f.name === "Contents/section0.xml") out.file(f.name, section0, opts);
    else if (f.name === "Contents/content.hpf") out.file(f.name, hpf, opts);
    else if (f.name === "Contents/header.xml") out.file(f.name, header, opts);
    else if (f.name === "Preview/PrvText.txt") out.file(f.name, prv, opts);
    else out.file(f.name, await f.async("uint8array"), opts);
  }
  return out.generateAsync({ type: "uint8array", mimeType: "application/hwp+zip" });
}
