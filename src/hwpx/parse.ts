// HWPX 모의고사 파일 → 문항 단위 데이터
import JSZip from "jszip";
import { Span, children, inner, findAll, slice, unescapeXml } from "./xmlscan";

/** 미리보기/PDF용 단순 구조 */
export interface Cell {
  b: Block[]; // 칸 내용
  cs: number; // colSpan
  rs: number; // rowSpan
  wr: number; // 표 전체 너비 대비 칸 너비 비율
  bd: string; // 테두리 유무 "LRTB" 순서, 예: "1101"
}
export type Inline =
  | { k: "t"; v: string }
  | { k: "eq"; v: string } // 한글 수식 스크립트 원문
  | { k: "img"; v: string; wr?: number } // binaryItemIDRef, 단 너비 대비 그림 너비 비율
  | { k: "tbl"; rows: Cell[][]; wr?: number }; // 단 너비 대비 표 너비 비율
export type Block = Inline[];

export interface ParsedProblem {
  number: number; // 원본에서의 문항 번호(문단 자동번호 순서)
  answer: string;
  problemXml: string; // 해설(미주) 제외한 문항 원본 문단들
  problemXmlWithSolution: string; // 해설 미주 포함 원본 문단들
  solutionXml: string; // 미주 안의 해설 문단들
  endNoteCtrlXml: string; // 미주 컨트롤 원본
  problemBlocks: Block[];
  solutionBlocks: Block[]; // 첫 문단은 정답 줄
  images: string[]; // 문항에 쓰인 이미지 id
  solutionImages: string[];
  equationCount: number;
  points: number | null; // 배점 ([2점] 등), 없으면 null
}

export interface ParsedExam {
  sourceTitle: string; // 예: "PinPoint Light 2회"
  sourceRaw: string; // 머리 표 원문
  headerTitleText: string; // 학습지 제목으로 바꿀 원문 글자들 (여러 개면 \u0001로 구분)
  problemStyleId: string; // 형식 A의 '문제' 스타일 id, 형식 B(번호 직접 입력)는 ""
  sectionHead: string; // section0.xml 의 <hs:sec ...> 여는 부분 + 첫 문항 앞 머리 문단
  sectionTail: string; // </hs:sec> 이후
  shellRunsXml: string; // 구역 설정(secPr)·단 설정·머리 장식 run들
  columnWidth: number; // 단 너비(HWPUNIT)
  problems: ParsedProblem[];
  binData: Record<string, { path: string; mediaType: string }>;
}

interface Ctx {
  borders: Record<string, string>; // borderFill id → "LRTB"
  colW: number;
}

function runChildHasContent(xml: string, c: Span): boolean {
  if (c.name === "hp:equation") return true;
  if (c.name === "hp:t") return textOf(xml, c).trim().length > 0;
  if (c.name === "hp:ctrl") return findAll(xml, "hp:endNote", c.start, c.end).length > 0;
  return false;
}

/** hp:t 요소의 글자 (탭·줄바꿈 처리) */
function textOf(xml: string, t: Span): string {
  const raw = xml.slice(t.openEnd, t.closeStart);
  return unescapeXml(
    raw
      .replace(/<hp:tab\b[^>]*\/>|<hp:tab\b[^>]*>[\s\S]*?<\/hp:tab>/g, " ")
      .replace(/<hp:lineBreak\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function firstAttr(xml: string, name: string, s: Span): Record<string, string> {
  return findAll(xml, name, s.start, s.end)[0]?.attrs ?? {};
}

/** 문단 범위 → Block 목록 */
function toBlocks(xml: string, paras: Span[], ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  const doPara = (p: Span) => {
    const b: Block = [];
    const walk = (a: number, z: number) => {
      for (const c of children(xml, a, z)) {
        switch (c.name) {
          case "hp:t": {
            const s = textOf(xml, c);
            if (s) b.push({ k: "t", v: s });
            break;
          }
          case "hp:equation": {
            const sc = findAll(xml, "hp:script", c.start, c.end)[0];
            b.push({ k: "eq", v: sc ? unescapeXml(xml.slice(sc.openEnd, sc.closeStart)) : "" });
            break;
          }
          case "hp:pic": {
            const img = findAll(xml, "hc:img", c.start, c.end)[0];
            const w = +(firstAttr(xml, "hp:sz", c).width ?? 0);
            if (img) b.push({ k: "img", v: img.attrs.binaryItemIDRef, wr: w && ctx.colW ? Math.min(1, w / ctx.colW) : undefined });
            break;
          }
          case "hp:tbl": {
            // 표 자신의 sz는 첫 번째 hp:sz (셀 안 개체보다 앞) — 직계 자식에서 찾음
            const tblSz = inner(xml, c).find((x) => x.name === "hp:sz");
            const tblW = +(tblSz?.attrs.width ?? 0);
            const rows: Cell[][] = inner(xml, c)
              .filter((x) => x.name === "hp:tr")
              .map((tr) =>
                inner(xml, tr)
                  .filter((tc) => tc.name === "hp:tc")
                  .map((tc) => {
                    const kids = inner(xml, tc);
                    const sub = kids.find((x) => x.name === "hp:subList");
                    const span = kids.find((x) => x.name === "hp:cellSpan")?.attrs ?? {};
                    const sz = kids.find((x) => x.name === "hp:cellSz")?.attrs ?? {};
                    const w = +(sz.width ?? 0);
                    return {
                      b: sub ? toBlocks(xml, inner(xml, sub).filter((x) => x.name === "hp:p"), ctx) : [],
                      cs: +(span.colSpan ?? 1),
                      rs: +(span.rowSpan ?? 1),
                      wr: tblW ? w / tblW : 0,
                      bd: ctx.borders[tc.attrs.borderFillIDRef] ?? "1111",
                    };
                  })
              );
            b.push({ k: "tbl", rows, wr: tblW && ctx.colW ? Math.min(1, tblW / ctx.colW) : undefined });
            break;
          }
          case "hp:ctrl": // 미주·머리말 등은 본문에 넣지 않음
          case "hp:linesegarray":
          case "hp:secPr":
          case "hp:rect":
          case "hp:polygon":
            break;
          default:
            if (c.openEnd < c.closeStart) walk(c.openEnd, c.closeStart);
        }
      }
    };
    walk(p.openEnd, p.closeStart);
    blocks.push(b);
  };
  paras.forEach(doPara);
  // 앞뒤 빈 문단 정리
  const empty = (b: Block) => b.every((i) => i.k === "t" && !i.v.trim());
  while (blocks.length && empty(blocks[blocks.length - 1])) blocks.pop();
  while (blocks.length && empty(blocks[0])) blocks.shift();
  return blocks;
}

/** 첫 글자 조각의 "3. " 같은 직접 입력 번호 제거 (형식 B 화면용) */
function stripTypedNumber(blocks: Block[]) {
  for (const b of blocks) {
    const i = b.findIndex((x) => x.k !== "t" || x.v.trim());
    if (i < 0) continue;
    const it = b[i];
    if (it.k === "t") it.v = it.v.replace(/^\s*\d{1,2}\s*\.\s*/, "");
    return;
  }
}

export function blockText(b: Block): string {
  return b.map((i) => (i.k === "t" ? i.v : i.k === "eq" ? `$${i.v}$` : "")).join("");
}

function isEmptyPara(xml: string, p: Span): boolean {
  if (findAll(xml, "hp:equation", p.start, p.end).length) return false;
  if (findAll(xml, "hp:pic", p.start, p.end).length) return false;
  if (findAll(xml, "hp:tbl", p.start, p.end).length) return false;
  if (findAll(xml, "hp:ctrl", p.start, p.end).length) return false;
  return findAll(xml, "hp:t", p.start, p.end).every((t) => !textOf(xml, t).trim());
}

/** 첫 문항 문단에서 구역 설정·머리 장식(shell)과 문항 내용을 분리 */
function splitShell(xml: string, p: Span): { shellRuns: string; pXml: string } {
  const runs = inner(xml, p);
  let seenContent = false;
  const shell: string[] = [];
  const rest: string[] = [];
  for (const r of runs) {
    if (r.name !== "hp:run") {
      if (r.name === "hp:linesegarray") continue; // 레이아웃 캐시는 버림(한글이 다시 계산)
      rest.push(slice(xml, r));
      continue;
    }
    const openTag = xml.slice(r.start, r.openEnd);
    const kids = inner(xml, r);
    const s: string[] = [];
    const c2: string[] = [];
    for (const k of kids) {
      if (!seenContent && runChildHasContent(xml, k)) seenContent = true;
      (seenContent ? c2 : s).push(slice(xml, k));
    }
    if (s.length) shell.push(openTag + s.join("") + "</hp:run>");
    if (c2.length) rest.push(openTag + c2.join("") + "</hp:run>");
  }
  const pOpen = xml.slice(p.start, p.openEnd);
  return { shellRuns: shell.join(""), pXml: pOpen + rest.join("") + "</hp:p>" };
}

function parseBorders(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of header.matchAll(/<hh:borderFill id="(\d+)"[^>]*>([\s\S]*?)<\/hh:borderFill>/g)) {
    const side = (n: string) => {
      const s = m[2].match(new RegExp(`<hh:${n}Border type="([A-Z_]+)"`));
      return s && s[1] !== "NONE" ? "1" : "0";
    };
    out[m[1]] = side("left") + side("right") + side("top") + side("bottom");
  }
  return out;
}

function columnWidthOf(shell: string): number {
  const pp = shell.match(/<hp:pagePr [^>]*width="(\d+)"[^>]*>[\s\S]*?<hp:margin [^>]*left="(\d+)" right="(\d+)"/);
  const cols = [...shell.matchAll(/<hp:colPr [^>]*colCount="(\d+)"[^>]*sameGap="(\d+)"/g)];
  const col = cols[cols.length - 1];
  if (!pp) return 32000;
  const landscape = /landscape="NARROWLY"/.test(shell); // NARROWLY=가로, WIDELY=세로
  const pageW = +pp[1];
  const text = pageW - +pp[2] - +pp[3];
  const n = col ? +col[1] : 1;
  const gap = col ? +col[2] : 0;
  void landscape;
  return Math.round((text - gap * (n - 1)) / n);
}

export async function parseHwpx(buf: Buffer | Uint8Array | ArrayBuffer): Promise<ParsedExam> {
  const zip = await JSZip.loadAsync(buf);
  const header = await zip.file("Contents/header.xml")!.async("string");
  const hpf = await zip.file("Contents/content.hpf")!.async("string");
  const sec = zip.file("Contents/section0.xml");
  if (!sec) throw new Error("section0.xml이 없습니다. HWPX 파일이 맞는지 확인해 주세요.");
  const xml = await sec.async("string");

  const root = children(xml, 0, xml.length).find((s) => s.name === "hs:sec")!;
  const paras = inner(xml, root).filter((s) => s.name === "hp:p");
  const paraText = (p: Span) =>
    findAll(xml, "hp:t", p.start, p.end).map((t) => textOf(xml, t)).join("").replace(/\s+/g, " ").trim();

  // ── 형식 판별
  // 형식 A: '문제' 문단 스타일(자동 번호) + 미주 해설
  // 형식 B: 문단 맨 앞에 "1." "2." … 를 직접 입력, 맨 끝 [정답] 목록
  const styleM = header.match(/<hh:style id="(\d+)" type="PARA" name="문제"/);
  let problemStyleId = styleM?.[1] ?? "";
  let starts = problemStyleId ? paras.map((p, i) => (p.attrs.styleIDRef === problemStyleId ? i : -1)).filter((i) => i >= 0) : [];
  let endIdx = paras.length; // 마지막 문항이 끝나는 문단(정답 목록 시작)
  const keyAnswers = new Map<number, string>();
  if (!starts.length) {
    problemStyleId = "";
    let expect = 1;
    for (let i = 0; i < paras.length; i++) {
      const t = paraText(paras[i]);
      if (/^\[?\s*정\s*답\s*\]?(\s|$)/.test(t) && starts.length) { endIdx = i; break; }
      const m = t.match(/^(\d{1,2})\s*\.\s*\S/);
      if (m && +m[1] === expect) { starts.push(i); expect++; }
    }
    // [정답] 목록: "1 ③", "16  6", "3) ②" 등
    for (let i = endIdx; i < paras.length; i++) {
      const t = paraText(paras[i]);
      for (const m of t.matchAll(/(\d{1,2})\s*[).]?\s+([①-⑤]|-?\d+(?:\.\d+)?|[ㄱ-ㅎ](?:\s*,\s*[ㄱ-ㅎ])*)/g)) keyAnswers.set(+m[1], m[2]);
    }
  }
  if (!starts.length)
    throw new Error(
      "문항을 찾지 못했습니다. 다음 둘 중 하나의 형식이어야 합니다.\n" +
        "· 문항마다 '문제' 문단 스타일이 걸린 파일 (해설은 미주)\n" +
        "· 문단 맨 앞에 1. 2. 3. … 번호를 직접 입력한 파일 (정답은 맨 끝 [정답] 목록)"
    );

  // ── 머리 문단(첫 문항 앞) → 문서 양식으로 보관
  const firstP = paras[starts[0]];
  const preamble = paras.slice(0, starts[0]).map((p) => slice(xml, p)).join("");
  const hasSecPrInFirst = findAll(xml, "hp:secPr", firstP.start, firstP.end).length > 0;
  const { shellRuns, pXml: firstPXml } = hasSecPrInFirst ? splitShell(xml, firstP) : { shellRuns: "", pXml: slice(xml, firstP) };

  // ── 출처
  let sourceRaw = "";
  let sourceTitle = "";
  let headerTitleText = "";
  const tbl = findAll(xml, "hp:tbl", firstP.start, firstP.end)[0];
  if (problemStyleId && tbl) {
    sourceRaw = findAll(xml, "hp:t", tbl.start, tbl.end).map((t) => textOf(xml, t)).join(" ").replace(/\s+/g, " ").trim();
    const sm = sourceRaw.match(/([A-Za-z][A-Za-z0-9 ]*?)\s*:\s*(\d+)\s*회/);
    sourceTitle = sm ? `${sm[1].trim()} ${sm[2]}회` : sourceRaw;
    headerTitleText = sm ? sm[0] : "";
  } else {
    // 머리 문단(본문·머리말 포함)에서 "… N회"가 들어간 글자
    const pre = paras.slice(0, starts[0]);
    const texts = pre.flatMap((p) => findAll(xml, "hp:t", p.start, p.end).map((t) => textOf(xml, t))).filter((t) => t.trim());
    sourceRaw = texts[0]?.replace(/\s+/g, " ").trim() ?? "";
    const sm = sourceRaw.match(/^(.*?\d+\s*회)/);
    sourceTitle = sm ? sm[1].trim() : sourceRaw;
    if (sourceTitle) headerTitleText = [...new Set(texts.filter((t) => t.replace(/\s+/g, " ").includes(sourceTitle)))].join("\u0001");
  }

  const ctx: Ctx = { borders: parseBorders(header), colW: columnWidthOf(xml.slice(0, firstP.start) + shellRuns) };

  const problems: ParsedProblem[] = [];
  for (let n = 0; n < starts.length; n++) {
    const a = starts[n];
    const z = n + 1 < starts.length ? starts[n + 1] : endIdx;
    let group = paras.slice(a, z);
    if (n + 1 === starts.length) while (group.length > 1 && isEmptyPara(xml, group[group.length - 1])) group = group.slice(0, -1);

    const pStrings = group.map((p, i) => (n === 0 && i === 0 ? firstPXml : slice(xml, p)));
    let joined = pStrings.join("");

    const wrap = `<w>${joined}</w>`;
    const wRoot = children(wrap, 0, wrap.length)[0];
    const ctrls = findAll(wrap, "hp:ctrl", wRoot.openEnd, wRoot.closeStart).filter(
      (c) => findAll(wrap, "hp:endNote", c.start, c.end).length > 0
    );
    let solutionXml = "";
    let endNoteCtrlXml = "";
    let answer = "";
    let solutionBlocks: Block[] = [];
    let solutionImages: string[] = [];
    let fullXml = joined;
    if (ctrls.length) {
      const ctrl = ctrls[0];
      const en = findAll(wrap, "hp:endNote", ctrl.start, ctrl.end)[0];
      const sub = findAll(wrap, "hp:subList", en.start, en.end)[0];
      let sps = inner(wrap, sub).filter((x) => x.name === "hp:p");
      const titleIdx = sps.findIndex((p) => /정답\s*및\s*해설/.test(findAll(wrap, "hp:t", p.start, p.end).map((t) => textOf(wrap, t)).join("")));
      let ctrlXml = slice(wrap, ctrl);
      if (titleIdx >= 0) {
        let cut = titleIdx + 1;
        while (cut < sps.length && isEmptyPara(wrap, sps[cut])) cut++;
        ctrlXml = wrap.slice(ctrl.start, sps[titleIdx].start) + wrap.slice(sps[cut - 1].end, ctrl.end);
        sps = sps.slice(cut);
      }
      endNoteCtrlXml = ctrlXml;
      solutionXml = sps.map((p) => slice(wrap, p)).join("");
      solutionBlocks = toBlocks(wrap, sps, ctx);
      answer = solutionBlocks.length ? blockText(solutionBlocks[0]).replace(/\$/g, "").trim() : "";
      solutionImages = sps.flatMap((p) => findAll(wrap, "hc:img", p.start, p.end).map((i) => i.attrs.binaryItemIDRef));
      fullXml = wrap.slice(wRoot.openEnd, ctrl.start) + ctrlXml + wrap.slice(ctrl.end, wRoot.closeStart);
      joined = wrap.slice(wRoot.openEnd, ctrl.start) + wrap.slice(ctrl.end, wRoot.closeStart);
    }

    if (!answer && keyAnswers.has(n + 1)) answer = keyAnswers.get(n + 1)!;

    const pw = `<w>${joined}</w>`;
    const pr = children(pw, 0, pw.length)[0];
    const pps = inner(pw, pr).filter((x) => x.name === "hp:p");
    const problemBlocks = toBlocks(pw, pps, ctx);
    if (!problemStyleId) stripTypedNumber(problemBlocks); // 화면용: 직접 입력 번호("3. ")는 빼고 번호는 화면이 붙임
    const allText = problemBlocks.map(blockText).join(" ");
    const pm = [...allText.matchAll(/\[\s*(\d)\s*점\s*\]/g)].pop();
    problems.push({
      number: n + 1,
      answer,
      problemXml: joined,
      problemXmlWithSolution: fullXml,
      solutionXml,
      endNoteCtrlXml,
      problemBlocks,
      solutionBlocks,
      points: pm ? +pm[1] : null,
      images: findAll(pw, "hc:img", pr.openEnd, pr.closeStart).map((i) => i.attrs.binaryItemIDRef),
      solutionImages,
      equationCount: findAll(pw, "hp:equation", pr.openEnd, pr.closeStart).length,
    });
  }

  const binData: ParsedExam["binData"] = {};
  for (const m of hpf.matchAll(/<opf:item id="([^"]+)" href="(BinData\/[^"]+)" media-type="([^"]+)"/g)) {
    binData[m[1]] = { path: m[2], mediaType: m[3] };
  }

  return {
    sourceTitle,
    sourceRaw,
    headerTitleText,
    problemStyleId,
    sectionHead: xml.slice(0, root.openEnd) + preamble,
    sectionTail: xml.slice(root.closeStart),
    shellRunsXml: shellRuns,
    columnWidth: ctx.colW,
    problems,
    binData,
  };
}
