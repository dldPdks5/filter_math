// 저장된 문항 XML(해설 미주 포함본) 고치기 — 글자·수식 수정, 문항 나누기·합치기
//
// 원칙
//  · XML이 원본이고, 화면용 Block은 고친 XML에서 다시 만든다 (둘이 어긋나지 않게)
//  · 글자는 <hp:t> 안의 글자 조각, 수식은 <hp:script> 내용만 바꾼다 → 글자모양·그림·표·문단 구조는 그대로
//  · 글자를 고친 문단은 줄 배치 정보(<hp:linesegarray>)를 지워서 한글이 다시 계산하게 한다
import { children, inner, findAll, unescapeXml, escapeXml, type Span } from "./xmlscan";
import { toBlocks, stripTypedNumber, type Block, type Ctx } from "./parse";

/** 고칠 수 있는 조각 하나 (글자 또는 수식) */
export interface Piece {
  i: number; // 조각 번호 (문서 순서)
  k: "t" | "eq";
  part: "p" | "s"; // 문제(p) / 해설(s)
  para: number; // 속한 문단 번호 (같은 문단 조각끼리 묶어 보여 주는 용도)
  inTable: boolean;
  v: string;
}
interface Loc extends Piece {
  a: number; // wrap 문자열 기준 내용 시작
  z: number; // 내용 끝
  paraSpan: Span;
}

/** 문항 나누기용 문단 목록 (문제 부분의 최상위 문단) */
export interface ParaInfo {
  index: number;
  preview: string;
  hasSolution: boolean; // 해설 미주가 들어 있는 문단
}

const wrapOf = (xml: string) => `<w>${xml}</w>`;
const unwrap = (w: string) => w.slice(3, -4);
const rootOf = (w: string) => children(w, 0, w.length)[0];

/** 내용이 바뀌었는지 확인하는 짧은 지문 (동시에 두 곳에서 고칠 때 덮어쓰기 방지) */
export function fingerprint(xml: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < xml.length; i++) {
    h ^= xml.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + xml.length.toString(16);
}

const within = (s: Span, a: number) => s.start <= a && a < s.end;

function locate(w: string): Loc[] {
  const root = rootOf(w);
  const paras = findAll(w, "hp:p", root.openEnd, root.closeStart).sort((x, y) => x.start - y.start);
  const notes = findAll(w, "hp:endNote", root.openEnd, root.closeStart);
  const tables = findAll(w, "hp:tbl", root.openEnd, root.closeStart);
  const innermost = (a: number) => {
    let best = -1;
    paras.forEach((p, i) => { if (within(p, a) && (best < 0 || p.start > paras[best].start)) best = i; });
    return best;
  };
  const out: Loc[] = [];
  const push = (k: "t" | "eq", a: number, z: number) => {
    const raw = w.slice(a, z);
    if (!raw.trim()) return;
    const para = innermost(a);
    if (para < 0) return;
    out.push({
      i: 0, k, a, z, para, paraSpan: paras[para],
      part: notes.some((n) => within(n, a)) ? "s" : "p",
      inTable: tables.some((t) => within(t, a)),
      v: unescapeXml(raw),
    });
  };
  for (const t of findAll(w, "hp:t", root.openEnd, root.closeStart)) {
    if (t.openEnd >= t.closeStart) continue;
    // <hp:t> 안의 탭·줄바꿈 같은 요소 사이 글자 조각
    const body = w.slice(t.openEnd, t.closeStart);
    const re = /<[^>]+>/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      push("t", t.openEnd + last, t.openEnd + m.index);
      last = m.index + m[0].length;
    }
    push("t", t.openEnd + last, t.closeStart);
  }
  for (const sc of findAll(w, "hp:script", root.openEnd, root.closeStart)) push("eq", sc.openEnd, sc.closeStart);
  out.sort((x, y) => x.a - y.a).forEach((l, i) => (l.i = i));
  return out;
}

export function listPieces(xml: string): Piece[] {
  return locate(wrapOf(xml)).map(({ a: _a, z: _z, paraSpan: _p, ...p }) => p);
}

/** 문제 부분 최상위 문단 (나누기 위치 고르기용) */
export function listParas(xml: string): ParaInfo[] {
  const w = wrapOf(xml);
  const root = rootOf(w);
  const locs = locate(w).filter((l) => l.part === "p");
  return inner(w, root)
    .filter((s) => s.name === "hp:p")
    .map((p, index) => {
      const text = locs
        .filter((l) => within(p, l.a))
        .map((l) => (l.k === "eq" ? `[수식]` : l.v))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      const hasPic = findAll(w, "hp:pic", p.start, p.end).length > 0;
      const hasTbl = findAll(w, "hp:tbl", p.start, p.end).length > 0;
      const preview = (text || (hasTbl ? "[표]" : hasPic ? "[그림]" : "(빈 문단)")).slice(0, 60);
      return { index, preview, hasSolution: findAll(w, "hp:endNote", p.start, p.end).length > 0 };
    });
}

/** 줄 배치 정보 지우기 범위 (문단의 직계 자식 <hp:linesegarray>) */
function lineSegOf(w: string, p: Span): Span | undefined {
  return inner(w, p).find((x) => x.name === "hp:linesegarray");
}

function applyRanges(w: string, edits: { a: number; z: number; v: string }[]): string {
  let out = w;
  for (const e of [...edits].sort((x, y) => y.a - x.a)) out = out.slice(0, e.a) + e.v + out.slice(e.z);
  return out;
}

/** 조각 번호 → 새 내용. 바뀐 조각이 있는 문단은 줄 배치 정보를 지움 */
export function applyEdits(xml: string, edits: Record<number, string>): { xml: string; changed: number } {
  const w = wrapOf(xml);
  const locs = locate(w);
  const ranges: { a: number; z: number; v: string }[] = [];
  const touched = new Map<number, Span>();
  for (const l of locs) {
    if (!(l.i in edits)) continue;
    let v = String(edits[l.i]);
    if (l.k === "t") v = v.replace(/[\r\n]+/g, " ");
    if (v === l.v) continue;
    if (l.k === "eq" && !v.trim()) throw new Error("수식을 비울 수는 없습니다. 수식을 지우려면 한글에서 원본을 고쳐 주세요.");
    ranges.push({ a: l.a, z: l.z, v: escapeXml(v) });
    touched.set(l.paraSpan.start, l.paraSpan);
  }
  for (const p of touched.values()) {
    const ls = lineSegOf(w, p);
    if (ls) ranges.push({ a: ls.start, z: ls.end, v: "" });
  }
  return { xml: ranges.length ? unwrap(applyRanges(w, ranges)) : xml, changed: touched.size };
}

export interface Derived {
  problemBlocks: Block[];
  solutionBlocks: Block[];
  images: string[];
  solutionImages: string[];
}

/** 해설 미주 포함 문항 XML → 화면용 Block·그림 목록 (업로드 때와 같은 규칙) */
export function derive(fullXml: string, ctx: Ctx, typedNumber: boolean): Derived {
  const w = wrapOf(fullXml);
  const root = rootOf(w);
  const ctrl = findAll(w, "hp:ctrl", root.openEnd, root.closeStart).find((c) => findAll(w, "hp:endNote", c.start, c.end).length > 0);
  let solutionBlocks: Block[] = [];
  let solutionImages: string[] = [];
  let joined = unwrap(w);
  if (ctrl) {
    const en = findAll(w, "hp:endNote", ctrl.start, ctrl.end)[0];
    const sub = findAll(w, "hp:subList", en.start, en.end)[0];
    const sps = sub ? inner(w, sub).filter((x) => x.name === "hp:p") : [];
    solutionBlocks = toBlocks(w, sps, ctx);
    solutionImages = sps.flatMap((p) => findAll(w, "hc:img", p.start, p.end).map((i) => i.attrs.binaryItemIDRef));
    joined = w.slice(root.openEnd, ctrl.start) + w.slice(ctrl.end, root.closeStart);
  }
  const pw = wrapOf(joined);
  const pr = rootOf(pw);
  const problemBlocks = toBlocks(pw, inner(pw, pr).filter((x) => x.name === "hp:p"), ctx);
  if (typedNumber) stripTypedNumber(problemBlocks);
  return {
    problemBlocks,
    solutionBlocks,
    images: findAll(pw, "hc:img", pr.openEnd, pr.closeStart).map((i) => i.attrs.binaryItemIDRef),
    solutionImages,
  };
}

/** 해설 첫 줄(정답 줄)에서 정답 읽기 — 업로드 때와 같은 규칙 */
export function answerFromSolution(b: Block[]): string {
  if (!b.length) return "";
  return b[0].map((i) => (i.k === "t" ? i.v : i.k === "eq" ? i.v : "")).join("").trim();
}

function setAttr(open: string, name: string, value: string): string {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  return re.test(open) ? open.replace(re, ` ${name}="${value}"`) : open.replace(/>$/, ` ${name}="${value}">`);
}

/** 문단의 여는 태그 바꾸기 + 줄 배치 정보 지우기 */
function restyle(w: string, p: Span, attrs: Record<string, string>): { a: number; z: number; v: string }[] {
  let open = w.slice(p.start, p.openEnd);
  for (const [k, v] of Object.entries(attrs)) open = setAttr(open, k, v);
  open = open.replace(/\spageBreak="1"/, ' pageBreak="0"').replace(/\scolumnBreak="1"/, ' columnBreak="0"');
  const out = [{ a: p.start, z: p.openEnd, v: open }];
  const ls = lineSegOf(w, p);
  if (ls) out.push({ a: ls.start, z: ls.end, v: "" });
  return out;
}

export interface FormatInfo {
  problemStyleId: string; // 형식 A의 '문제' 스타일 id, 형식 B면 ""
  plain: { style: string; paraPr: string }; // 바탕글 (합칠 때 문제 스타일을 풀 대체 모양)
}

/**
 * 문제 부분 index번째 문단부터를 새 문항으로 떼어 냄 → [앞 문항 XML, 새 문항 XML]
 * 해설 미주는 그 미주가 들어 있는 문단을 따라간다.
 */
export function splitProblem(xml: string, index: number, fmt: FormatInfo, newNumber: number): [string, string] {
  const w = wrapOf(xml);
  const root = rootOf(w);
  const ps = inner(w, root).filter((s) => s.name === "hp:p");
  if (index < 1 || index >= ps.length) throw new Error("나눌 위치가 올바르지 않습니다. 둘째 문단부터 고를 수 있습니다.");
  const first = ps[0];
  const b0 = ps[index];
  const head = w.slice(root.openEnd, b0.start);
  let tail = w.slice(b0.start, root.closeStart);

  const tw = wrapOf(tail);
  const tRoot = rootOf(tw);
  const tFirst = inner(tw, tRoot).find((s) => s.name === "hp:p")!;
  if (fmt.problemStyleId) {
    // 형식 A: 새 문항 첫 문단을 '문제' 스타일로 (원래 문항 첫 문단과 같은 문단모양) → 자동 번호
    const paraPr = first.attrs.paraPrIDRef ?? "0";
    tail = unwrap(applyRanges(tw, restyle(tw, tFirst, { styleIDRef: fmt.problemStyleId, paraPrIDRef: paraPr })));
  } else {
    // 형식 B: 맨 앞에 "N. " 직접 입력 번호를 넣음 (출력할 때 새 번호로 바뀜)
    const run = inner(tw, tFirst).find((x) => x.name === "hp:run");
    const charPr = run?.attrs.charPrIDRef ?? first.attrs.charPrIDRef ?? "0";
    const ins = `<hp:run charPrIDRef="${charPr}"><hp:t>${newNumber}. </hp:t></hp:run>`;
    const ranges = restyle(tw, tFirst, {});
    ranges.push({ a: tFirst.openEnd, z: tFirst.openEnd, v: ins });
    tail = unwrap(applyRanges(tw, ranges));
  }
  return [head, tail];
}

/** 형식 B 문항 맨 앞 직접 입력 번호("3. ") 지우기 */
function dropTypedNumber(xml: string): string {
  let done = false;
  return xml.replace(/<hp:t>([^<]*)/g, (m, text: string) => {
    if (done || !text.trim()) return m;
    done = true;
    const n = text.match(/^(\s*)(\d{1,2})\s*\.\s*/);
    return n ? `<hp:t>${n[1]}${text.slice(n[0].length)}` : m;
  });
}

/**
 * 뒤 문항(b)을 앞 문항(a) 뒤에 붙임.
 * · 뒤 문항 첫 문단의 '문제' 스타일(자동 번호)을 풀어 일반 문단으로
 * · 해설이 둘 다 있으면 뒤 문항 해설 문단을 앞 문항 해설 끝에 이어 붙이고 뒤 문항 미주는 없앰
 */
export function mergeProblems(a: string, b: string, fmt: FormatInfo): string {
  // 1) 뒤 문항 첫 문단 모양
  let bx = b;
  {
    const w = wrapOf(bx);
    const root = rootOf(w);
    const ps = inner(w, root).filter((s) => s.name === "hp:p");
    if (fmt.problemStyleId) {
      // 일반 문단 모양: 앞 문항의 둘째 문단 이후 → 뒤 문항의 둘째 문단 이후 → 바탕글
      const aw = wrapOf(a);
      const aps = inner(aw, rootOf(aw)).filter((s) => s.name === "hp:p");
      const body = [...aps.slice(1), ...ps.slice(1)].find((p) => p.attrs.styleIDRef !== fmt.problemStyleId);
      const style = body?.attrs.styleIDRef ?? fmt.plain.style;
      const paraPr = body?.attrs.paraPrIDRef ?? fmt.plain.paraPr;
      bx = unwrap(applyRanges(w, restyle(w, ps[0], { styleIDRef: style, paraPrIDRef: paraPr })));
    } else {
      bx = dropTypedNumber(bx);
    }
  }
  // 2) 해설 합치기
  const noteCtrl = (w: string) => {
    const root = rootOf(w);
    return findAll(w, "hp:ctrl", root.openEnd, root.closeStart).find((c) => findAll(w, "hp:endNote", c.start, c.end).length > 0);
  };
  const aw = wrapOf(a);
  const bw = wrapOf(bx);
  const ca = noteCtrl(aw);
  const cb = noteCtrl(bw);
  if (ca && cb) {
    const subA = findAll(aw, "hp:subList", ca.start, ca.end)[0];
    const subB = findAll(bw, "hp:subList", cb.start, cb.end)[0];
    const moved = subB ? inner(bw, subB).filter((x) => x.name === "hp:p").map((p) => bw.slice(p.start, p.end)).join("") : "";
    const a2 = subA ? unwrap(applyRanges(aw, [{ a: subA.closeStart, z: subA.closeStart, v: moved }])) : a;
    const b2 = unwrap(applyRanges(bw, [{ a: cb.start, z: cb.end, v: "" }]));
    return a2 + b2;
  }
  return a + bx;
}
