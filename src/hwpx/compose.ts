// 선택한 문항들 → 새 HWPX (여러 회차 섞기 지원)
//
// 방식
//  · 첫 문항이 속한 회차의 원본 HWPX를 '바탕 문서'로 사용 (쪽 설정·2단·머리 장식·바탕쪽)
//  · 다른 회차 문항을 넣을 때는 그 회차 header.xml의 목록(글꼴·테두리·글자모양·탭·번호·문단모양·스타일)을
//    바탕 문서 뒤에 이어 붙이고, 문항 XML 안의 참조 번호를 새 번호로 바꿈
//  · 그림(BinData)은 겹치지 않게 이름을 새로 붙여 복사
//  · '문제' 스타일 문단은 바탕 문서의 '문제' 스타일로 바꿔서 문항 번호가 1, 2, 3 … 으로 이어지게 함
//  · header.xml이 바탕 문서와 똑같은 회차(같은 양식)는 번호 재매핑 없이 그림만 처리
import JSZip from "jszip";
import { children, inner, findAll, escapeXml } from "./xmlscan";

export interface ComposeExam {
  key: string; // 회차 id
  file: Uint8Array; // 원본 HWPX
  sectionHead: string;
  sectionTail: string;
  shellRunsXml: string;
  headerTitleText: string;
  problemStyleId: string;
}
export interface ComposeItem {
  examKey: string;
  number: number;
  answer: string;
  problemXml: string;
  problemXmlWithSolution: string;
  label: string; // 출처 표기, 예: "PinPoint Light 2회 8번"
}
export type AnswerMode = "none" | "key" | "solutions";
export interface ComposeOptions {
  title?: string;
  answers: AnswerMode; // none: 문제만 / key: 문제 + 빠른 정답 / solutions: 문제 + 해설(미주) + 빠른 정답
  showSource: boolean;
  forceRemap?: boolean; // 테스트용: 같은 양식이어도 재매핑 경로 사용
}

// header.xml 목록 정의: 목록 태그, 항목 태그
const LISTS = [
  { list: "hh:borderFills", item: "hh:borderFill", key: "borderFill" },
  { list: "hh:charProperties", item: "hh:charPr", key: "charPr" },
  { list: "hh:tabProperties", item: "hh:tabPr", key: "tabPr" },
  { list: "hh:numberings", item: "hh:numbering", key: "numbering" },
  { list: "hh:bullets", item: "hh:bullet", key: "bullet" },
  { list: "hh:paraProperties", item: "hh:paraPr", key: "paraPr" },
  { list: "hh:styles", item: "hh:style", key: "style" },
] as const;
type ListKey = (typeof LISTS)[number]["key"] | `font:${string}`;
const LANG_ATTR: Record<string, string> = { HANGUL: "hangul", LATIN: "latin", HANJA: "hanja", JAPANESE: "japanese", OTHER: "other", SYMBOL: "symbol", USER: "user" };

type IdMap = Map<string, string>;
interface Remap { maps: Partial<Record<ListKey, IdMap>>; bin: IdMap; problemStyle: string; problemParaPr: string }

/** 목록 항목 id 수집 */
function ids(xml: string, itemTag: string, from: number, to: number): string[] {
  return children(xml, from, to).filter((s) => s.name === itemTag).map((s) => s.attrs.id);
}

function listSpan(xml: string, tag: string) {
  return findAll(xml, tag)[0];
}

/** 속성값 치환 (맵에 있는 값만) */
function remapAttr(s: string, attr: string, map: IdMap | undefined): string {
  if (!map || !map.size) return s;
  return s.replace(new RegExp(`(\\s${attr}=")([^"]*)(")`, "g"), (w, a, v, z) => (map.has(v) ? a + map.get(v) + z : w));
}

/** header 항목 하나 안의 참조를 새 번호로 */
function remapHeaderItem(xml: string, key: ListKey, r: Remap): string {
  let s = xml;
  const m = r.maps;
  // 자기 id
  s = s.replace(/^(<[^>]*?\sid=")([^"]*)(")/, (w, a, v, z) => {
    const map = m[key];
    return map?.has(v) ? a + map.get(v) + z : w;
  });
  s = remapAttr(s, "borderFillIDRef", m.borderFill);
  s = remapAttr(s, "charPrIDRef", m.charPr);
  s = remapAttr(s, "tabPrIDRef", m.tabPr);
  s = remapAttr(s, "paraPrIDRef", m.paraPr);
  s = remapAttr(s, "nextStyleIDRef", m.style);
  s = remapAttr(s, "binaryItemIDRef", r.bin);
  // 문단모양의 번호 머리 (NUMBER·OUTLINE → numbering, BULLET → bullet)
  s = s.replace(/<hh:heading type="(\w+)" idRef="(\d+)"/g, (w, type, v) => {
    const map = type === "BULLET" ? m.bullet : type === "NONE" ? undefined : m.numbering;
    return map?.has(v) ? `<hh:heading type="${type}" idRef="${map.get(v)}"` : w;
  });
  // 글자모양의 글꼴 참조
  s = s.replace(/<hh:fontRef ([^>]*)\/>/g, (w, attrs: string) => {
    let a = attrs;
    for (const [lang, at] of Object.entries(LANG_ATTR)) a = remapAttr(" " + a, at, m[`font:${lang}`]).slice(1);
    return `<hh:fontRef ${a}/>`;
  });
  return s;
}

/** 문항 XML 안의 참조를 새 번호로 */
function remapSection(xml: string, r: Remap, srcProblemStyle: string): string {
  // '문제' 스타일 문단 → 바탕 문서의 문제 스타일·문단모양 (번호 연속)
  let s = xml.replace(/<hp:p ([^>]*)>/g, (w, attrs: string) => {
    if (!new RegExp(`\\sstyleIDRef="${srcProblemStyle}"`).test(" " + attrs)) return w;
    const a = (" " + attrs)
      .replace(/\sstyleIDRef="[^"]*"/, ` styleIDRef="§S${r.problemStyle}"`)
      .replace(/\sparaPrIDRef="[^"]*"/, ` paraPrIDRef="§P${r.problemParaPr}"`)
      .slice(1);
    return `<hp:p ${a}>`;
  });
  s = remapAttr(s, "paraPrIDRef", r.maps.paraPr);
  s = remapAttr(s, "charPrIDRef", r.maps.charPr);
  s = remapAttr(s, "styleIDRef", r.maps.style);
  s = remapAttr(s, "borderFillIDRef", r.maps.borderFill);
  s = remapAttr(s, "binaryItemIDRef", r.bin);
  return s.replace(/="§[SP](\d+)"/g, '="$1"');
}

interface Doc {
  header: string;
  hpf: string;
  zip: JSZip;
  binCount: number;
}

/** 다른 회차의 header 목록을 바탕 문서에 이어 붙이고 Remap 반환 */
function mergeHeader(base: Doc, srcHeader: string, srcHpf: string, srcZip: JSZip, srcProblemStyle: string, baseProblemStyle: string, out: Map<string, Uint8Array | Promise<Uint8Array>>, sameTemplate: boolean, usedBins: Set<string>): Remap {
  const r: Remap = { maps: {}, bin: new Map(), problemStyle: baseProblemStyle, problemParaPr: "" };
  const baseStyle = base.header.match(new RegExp(`<hh:style id="${baseProblemStyle}"[^>]*paraPrIDRef="(\\d+)"`));
  r.problemParaPr = baseStyle?.[1] ?? "0";

  // 그림: 항상 새 이름으로 복사
  for (const m of srcHpf.matchAll(/<opf:item id="([^"]+)" href="(BinData\/[^"]+)" media-type="([^"]+)"[^>]*\/>/g)) {
    const [, id, href, mt] = m;
    if (!usedBins.has(id)) continue; // 실제로 쓰는 그림만 복사
    const ext = href.split(".").pop();
    base.binCount += 1;
    let nid = `image${base.binCount}`;
    while (base.hpf.includes(`id="${nid}"`)) nid = `image${++base.binCount}`;
    r.bin.set(id, nid);
    const f = srcZip.file(href);
    if (f) out.set(`BinData/${nid}.${ext}`, f.async("uint8array"));
    base.hpf = base.hpf.replace("</opf:manifest>", `<opf:item id="${nid}" href="BinData/${nid}.${ext}" media-type="${mt}" isEmbeded="1"/></opf:manifest>`);
  }
  if (sameTemplate) return r; // 같은 양식: 번호 그대로

  // 1) 글꼴 (언어별)
  const ff = listSpan(srcHeader, "hh:fontfaces");
  const bff = listSpan(base.header, "hh:fontfaces");
  if (ff && bff) {
    const pending: { lang: string; items: string[] }[] = [];
    for (const face of inner(srcHeader, ff).filter((s) => s.name === "hh:fontface")) {
      const lang = face.attrs.lang;
      const bface = inner(base.header, bff).find((s) => s.name === "hh:fontface" && s.attrs.lang === lang);
      if (!bface) continue;
      const bIds = ids(base.header, "hh:font", bface.openEnd, bface.closeStart).map(Number);
      const sItems = inner(srcHeader, face).filter((s) => s.name === "hh:font");
      const map: IdMap = new Map();
      let next = bIds.length ? Math.max(...bIds) + 1 : 0;
      for (const it of sItems) map.set(it.attrs.id, String(next++));
      r.maps[`font:${lang}`] = map;
      pending.push({ lang, items: sItems.map((it) => srcHeader.slice(it.start, it.end).replace(/^(<hh:font [^>]*?\bid=")([^"]*)(")/, (w, a, v, z) => a + map.get(v) + z)) });
    }
    for (const p of pending) {
      const re = new RegExp(`(<hh:fontface lang="${p.lang}" fontCnt=")(\\d+)("[^>]*>)([\\s\\S]*?)(</hh:fontface>)`);
      base.header = base.header.replace(re, (w, a, cnt, b, body, close) => `${a}${+cnt + p.items.length}${b}${body}${p.items.join("")}${close}`);
    }
  }

  // 2) 나머지 목록: 번호표 먼저 전부 만든 뒤 항목 내용 치환
  const srcItems: Partial<Record<ListKey, string[]>> = {};
  for (const L of LISTS) {
    const sl = listSpan(srcHeader, L.list);
    if (!sl) continue;
    const sItems = inner(srcHeader, sl).filter((s) => s.name === L.item);
    const bl = listSpan(base.header, L.list);
    const bIds = bl ? ids(base.header, L.item, bl.openEnd, bl.closeStart).map(Number) : [];
    let next = bIds.length ? Math.max(...bIds) + 1 : 0;
    const map: IdMap = new Map();
    for (const it of sItems.sort((a, b) => +a.attrs.id - +b.attrs.id)) map.set(it.attrs.id, String(next++));
    r.maps[L.key] = map;
    srcItems[L.key] = sItems.map((it) => srcHeader.slice(it.start, it.end));
  }
  for (const L of LISTS) {
    const items = srcItems[L.key];
    if (!items?.length) continue;
    const remapped = items.map((x) => remapHeaderItem(x, L.key, r));
    const re = new RegExp(`(<${L.list} itemCnt=")(\\d+)("[^>]*>)([\\s\\S]*?)(</${L.list}>)`);
    if (re.test(base.header)) {
      base.header = base.header.replace(re, (w, a, cnt, b, body, close) => `${a}${+cnt + items.length}${b}${body}${remapped.join("")}${close}`);
    } else {
      // 바탕 문서에 이 목록이 없으면 refList 끝에 새로 만듦
      base.header = base.header.replace("</hh:refList>", `<${L.list} itemCnt="${items.length}">${remapped.join("")}</${L.list}></hh:refList>`);
    }
  }
  // refList의 fontfaces itemCnt는 언어 수라 그대로
  void srcProblemStyle;
  return r;
}

function firstParaFix(pXml: string, shellRuns: string): string {
  const openEnd = pXml.indexOf(">") + 1;
  const open = pXml.slice(0, openEnd).replace(/columnBreak="1"/, 'columnBreak="0"').replace(/pageBreak="1"/, 'pageBreak="0"');
  const body = pXml.slice(openEnd);
  const close = body.lastIndexOf("</hp:p>");
  const head = body.slice(0, close).replace(/<hp:linesegarray>(?:(?!<hp:linesegarray>)[\s\S])*?<\/hp:linesegarray>$/, "");
  return open + shellRuns + head + body.slice(close);
}

/** 바탕글 문단 하나 (출처·정답표용) */
function plainPara(text: string, opt: { pageBreak?: boolean; charPr: string; paraPr: string; style: string }): string {
  return `<hp:p id="0" paraPrIDRef="${opt.paraPr}" styleIDRef="${opt.style}" pageBreak="${opt.pageBreak ? 1 : 0}" columnBreak="0" merged="0"><hp:run charPrIDRef="${opt.charPr}"><hp:t>${escapeXml(text)}</hp:t></hp:run></hp:p>`;
}

/** 문항 XML의 마지막 내용 문단 뒤(뒤따르는 빈 문단 앞)에 문단 삽입 */
function insertAfterContent(xml: string, para: string): string {
  const wrap = `<w>${xml}</w>`;
  const root = children(wrap, 0, wrap.length)[0];
  const ps = inner(wrap, root).filter((s) => s.name === "hp:p");
  const isEmpty = (s: string) => !/<hp:t>[^<]*\S|<hp:equation|<hp:pic|<hp:tbl|<hp:ctrl/.test(s);
  let k = ps.length - 1;
  while (k > 0 && isEmpty(wrap.slice(ps[k].start, ps[k].end))) k--;
  const at = ps[k].end;
  return wrap.slice(root.openEnd, at) + para + wrap.slice(at, root.closeStart);
}

export async function composeWorksheet(exams: ComposeExam[], items: ComposeItem[], opt: ComposeOptions): Promise<Uint8Array> {
  if (!items.length) throw new Error("선택된 문항이 없습니다");
  const byKey = new Map(exams.map((e) => [e.key, e]));
  const baseExam = byKey.get(items[0].examKey)!;
  const baseZip = await JSZip.loadAsync(baseExam.file);
  const base: Doc = {
    header: await baseZip.file("Contents/header.xml")!.async("string"),
    hpf: await baseZip.file("Contents/content.hpf")!.async("string"),
    zip: baseZip,
    binCount: 0,
  };
  base.binCount = Math.max(0, ...[...base.hpf.matchAll(/id="image(\d+)"/g)].map((m) => +m[1]));
  const baseHeaderOriginal = base.header;
  const extraFiles = new Map<string, Uint8Array | Promise<Uint8Array>>();

  // 회차별 Remap (바탕 회차는 그대로)
  const remaps = new Map<string, Remap | null>([[baseExam.key, null]]);
  for (const it of items) {
    if (remaps.has(it.examKey)) continue;
    const ex = byKey.get(it.examKey)!;
    const z = await JSZip.loadAsync(ex.file);
    const h = await z.file("Contents/header.xml")!.async("string");
    const hpf = await z.file("Contents/content.hpf")!.async("string");
    const same = !opt.forceRemap && h === baseHeaderOriginal;
    const usedBins = new Set<string>();
    const xmls = items.filter((x) => x.examKey === it.examKey).map((x) => (opt.answers === "solutions" ? x.problemXmlWithSolution : x.problemXml));
    for (const src of [...xmls, h]) for (const m of src.matchAll(/binaryItemIDRef="([^"]+)"/g)) usedBins.add(m[1]);
    remaps.set(it.examKey, mergeHeader(base, h, hpf, z, ex.problemStyleId, baseExam.problemStyleId, extraFiles, same, usedBins));
  }

  // 바탕글 모양(출처·정답표용): 바탕 문서의 스타일 0
  const s0 = base.header.match(/<hh:style id="0"[^>]*paraPrIDRef="(\d+)"[^>]*charPrIDRef="(\d+)"/);
  const plain = { style: "0", paraPr: s0?.[1] ?? "0", charPr: s0?.[2] ?? "0" };

  const bodies = items.map((it) => {
    let x = opt.answers === "solutions" ? it.problemXmlWithSolution : it.problemXml;
    const r = remaps.get(it.examKey);
    if (r) x = remapSection(x, r, byKey.get(it.examKey)!.problemStyleId);
    if (opt.showSource) x = insertAfterContent(x, plainPara(`[${it.label}]`, plain));
    return x;
  });

  let shell = baseExam.shellRunsXml;
  if (opt.title && baseExam.headerTitleText) shell = shell.split(escapeXml(baseExam.headerTitleText)).join(escapeXml(opt.title));
  bodies[0] = firstParaFix(bodies[0], shell);

  if (opt.answers !== "none") {
    const key: string[] = [];
    items.forEach((it, i) => key.push(`${i + 1}) ${it.answer || "-"}`));
    const lines: string[] = [];
    for (let i = 0; i < key.length; i += 5) lines.push(key.slice(i, i + 5).join("     "));
    bodies.push(plainPara("빠른 정답", { ...plain, pageBreak: true }), ...lines.map((l) => plainPara(l, plain)));
  }

  const section0 = baseExam.sectionHead + bodies.join("") + baseExam.sectionTail;

  // 남는 구역·바탕쪽 정리
  let hpf = base.hpf;
  const keepMaster = new Set([...baseExam.shellRunsXml.matchAll(/<hp:masterPage idRef="([^"]+)"/g)].map((m) => m[1]));
  const drop = new Set<string>();
  for (const m of hpf.matchAll(/<opf:item id="([^"]+)" href="([^"]+)"[^>]*\/>/g)) {
    const [, id, href] = m;
    if (/^section\d+$/.test(id) && id !== "section0") drop.add(href);
    if (/^masterpage\d+$/.test(id) && !keepMaster.has(id)) drop.add(href);
  }
  hpf = hpf.replace(/<opf:item id="([^"]+)" href="([^"]+)"[^>]*\/>/g, (w, _id, href) => (drop.has(href) ? "" : w));
  hpf = hpf.replace(/<opf:itemref idref="(section\d+)"[^>]*\/>/g, (w, id) => (id === "section0" ? w : ""));
  if (opt.title) hpf = hpf.replace(/<opf:title>[\s\S]*?<\/opf:title>/, `<opf:title>${escapeXml(opt.title)}</opf:title>`);
  const header = base.header.replace(/secCnt="\d+"/, 'secCnt="1"');
  const prv = items.map((it, i) => `${i + 1}. ${it.label}`).join("\r\n");

  const out = new JSZip();
  for (const f of Object.values(baseZip.files)) {
    if (f.dir || drop.has(f.name)) continue;
    const stored = f.name === "mimetype" || f.name === "version.xml";
    const o = { compression: stored ? ("STORE" as const) : ("DEFLATE" as const), createFolders: false };
    if (f.name === "Contents/section0.xml") out.file(f.name, section0, o);
    else if (f.name === "Contents/content.hpf") out.file(f.name, hpf, o);
    else if (f.name === "Contents/header.xml") out.file(f.name, header, o);
    else if (f.name === "Preview/PrvText.txt") out.file(f.name, prv, o);
    else out.file(f.name, await f.async("uint8array"), o);
  }
  for (const [name, data] of extraFiles) out.file(name, await data, { compression: "DEFLATE", createFolders: false });
  return out.generateAsync({ type: "uint8array", mimeType: "application/hwp+zip" });
}

/** 결과 HWPX 자체 점검: 모든 참조가 header에 실제로 있는지 (테스트용) */
export async function auditHwpx(buf: Uint8Array): Promise<string[]> {
  const z = await JSZip.loadAsync(buf);
  const header = await z.file("Contents/header.xml")!.async("string");
  const sec = await z.file("Contents/section0.xml")!.async("string");
  const hpf = await z.file("Contents/content.hpf")!.async("string");
  const problems: string[] = [];
  const idset = (tag: string) => new Set([...header.matchAll(new RegExp(`<${tag} id="(\\d+)"`, "g"))].map((m) => m[1]));
  const sets: Record<string, Set<string>> = {
    paraPrIDRef: idset("hh:paraPr"), charPrIDRef: idset("hh:charPr"), styleIDRef: idset("hh:style"), borderFillIDRef: idset("hh:borderFill"),
  };
  for (const [attr, set] of Object.entries(sets)) {
    for (const m of sec.matchAll(new RegExp(`\\s${attr}="(\\d+)"`, "g"))) if (!set.has(m[1])) problems.push(`본문 ${attr}=${m[1]} 없음`);
    for (const m of header.matchAll(new RegExp(`\\s${attr}="(\\d+)"`, "g"))) if (!set.has(m[1]) && m[1] !== "4294967295") problems.push(`header ${attr}=${m[1]} 없음`);
  }
  const bins = new Set([...hpf.matchAll(/<opf:item id="([^"]+)" href="(BinData\/[^"]+)"/g)].map((m) => m[1]));
  for (const m of hpf.matchAll(/<opf:item id="[^"]+" href="(BinData\/[^"]+)"/g)) if (!z.file(m[1])) problems.push(`그림 파일 없음 ${m[1]}`);
  for (const m of (sec + header).matchAll(/binaryItemIDRef="([^"]+)"/g)) if (!bins.has(m[1])) problems.push(`그림 참조 ${m[1]} 없음`);
  for (const [lang, at] of Object.entries(LANG_ATTR)) {
    const face = header.match(new RegExp(`<hh:fontface lang="${lang}" fontCnt="(\\d+)"[^>]*>([\\s\\S]*?)</hh:fontface>`));
    if (!face) continue;
    const fids = new Set([...face[2].matchAll(/<hh:font id="(\d+)"/g)].map((m) => m[1]));
    if (+face[1] !== fids.size) problems.push(`${lang} fontCnt ${face[1]} ≠ ${fids.size}`);
    for (const m of header.matchAll(new RegExp(`<hh:fontRef [^>]*\\b${at}="(\\d+)"`, "g"))) if (!fids.has(m[1])) problems.push(`글꼴 ${lang} ${m[1]} 없음`);
  }
  for (const L of LISTS) {
    const m = header.match(new RegExp(`<${L.list} itemCnt="(\\d+)"[^>]*>([\\s\\S]*?)</${L.list}>`));
    if (!m) continue;
    const n = [...m[2].matchAll(new RegExp(`<${L.item} id="`, "g"))].length;
    if (+m[1] !== n) problems.push(`${L.list} itemCnt ${m[1]} ≠ ${n}`);
  }
  return [...new Set(problems)];
}
