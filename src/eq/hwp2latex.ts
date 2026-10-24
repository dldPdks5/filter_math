// 한글(HWP) 수식 스크립트 → LaTeX (KaTeX 렌더용)
// 한글 수식 문법: 공백·` ·~ 로 토큰 구분, {}로 묶음, over/sqrt/sum from to/LEFT RIGHT/cases/pile 등

type Tok =
  | { t: "lb" }
  | { t: "rb" }
  | { t: "word"; v: string }
  | { t: "num"; v: string }
  | { t: "sym"; v: string }
  | { t: "str"; v: string }
  | { t: "sp"; v: string }
  | { t: "nl" }
  | { t: "amp" }
  | { t: "sup" }
  | { t: "sub" };
type Node = Tok | { t: "grp"; c: Node[] };

export interface ConvertResult {
  latex: string;
  unknown: string[]; // 사전에 없는 단어(검토용)
}

const GREEK_LOWER = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(" ");
const GREEK_UPPER: Record<string, string> = {
  GAMMA: "\\Gamma", DELTA: "\\Delta", THETA: "\\Theta", LAMBDA: "\\Lambda", XI: "\\Xi", PI: "\\Pi",
  SIGMA: "\\Sigma", UPSILON: "\\Upsilon", PHI: "\\Phi", PSI: "\\Psi", OMEGA: "\\Omega",
  ALPHA: "A", BETA: "B", EPSILON: "E", ZETA: "Z", ETA: "H", IOTA: "I", KAPPA: "K", MU: "M", NU: "N", OMICRON: "O", RHO: "P", TAU: "T", CHI: "X",
};
// 대소문자 구분 없는 기호 키워드
const SYMBOLS: Record<string, string> = {
  times: "\\times", div: "\\div", pm: "\\pm", mp: "\\mp", cdot: "\\cdot", cdots: "\\cdots", ldots: "\\ldots", vdots: "\\vdots", ddots: "\\ddots",
  le: "\\le", leq: "\\le", ge: "\\ge", geq: "\\ge", neq: "\\ne", ne: "\\ne", approx: "\\approx", sim: "\\sim", simeq: "\\simeq", equiv: "\\equiv", propto: "\\propto",
  inf: "\\infty", infinity: "\\infty", because: "\\because", therefore: "\\therefore", bot: "\\perp", angle: "\\angle", triangle: "\\triangle", circ: "\\circ", deg: "^\\circ",
  rarrow: "\\rightarrow", larrow: "\\leftarrow", lrarrow: "\\leftrightarrow", "rArrow": "\\Rightarrow", "lArrow": "\\Leftarrow", "lrArrow": "\\Leftrightarrow",
  searrow: "\\searrow", nearrow: "\\nearrow", swarrow: "\\swarrow", nwarrow: "\\nwarrow", uparrow: "\\uparrow", downarrow: "\\downarrow",
  in: "\\in", notin: "\\notin", ni: "\\ni", subset: "\\subset", supset: "\\supset", subseteq: "\\subseteq", supseteq: "\\supseteq", cup: "\\cup", cap: "\\cap",
  emptyset: "\\emptyset", forall: "\\forall", exist: "\\exists", exists: "\\exists", partial: "\\partial", nabla: "\\nabla", prime: "'", smallsum: "\\sum",
  vee: "\\vee", wedge: "\\wedge", oplus: "\\oplus", otimes: "\\otimes", odot: "\\odot", star: "\\star", dagger: "\\dagger", ell: "\\ell", hbar: "\\hbar",
  "lbrace": "\\{", "rbrace": "\\}", "langle": "\\langle", "rangle": "\\rangle", "vert": "|", "dline": "\\|", sharp: "\\#", dsum: "+", parallel: "\\parallel", "LT": "<", "GT": ">",
  cong: "\\cong", diamond: "\\diamond", bullet: "\\bullet", image: "\\fallingdotseq",
};
const FUNCS = new Set("sin cos tan csc sec cot sinh cosh tanh log ln lg exp det gcd min max arcsin arccos arctan Pr mod".split(" "));
const BIGOPS: Record<string, string> = { sum: "\\sum", prod: "\\prod", coprod: "\\coprod", int: "\\int", oint: "\\oint", dint: "\\iint", tint: "\\iiint", lim: "\\lim", union: "\\bigcup", inter: "\\bigcap", bigcup: "\\bigcup", bigcap: "\\bigcap", Lim: "\\lim" };
const ACCENTS: Record<string, string> = { bar: "\\overline", vec: "\\overrightarrow", dyad: "\\overleftrightarrow", hat: "\\widehat", tilde: "\\widetilde", dot: "\\dot", ddot: "\\ddot", acute: "\\acute", grave: "\\grave", check: "\\check", arch: "\\overgroup", under: "\\underline", box: "\\boxed", overline: "\\overline", underline: "\\underline" };
const ENVS = new Set(["cases", "eqalign", "pile", "lpile", "rpile", "matrix", "pmatrix", "bmatrix", "dmatrix"]);
const DELIM: Record<string, string> = { "(": "(", ")": ")", "[": "[", "]": "]", "{": "\\{", "}": "\\}", "|": "|", ".": ".", "<": "\\langle", ">": "\\rangle", lbrace: "\\{", rbrace: "\\}", dline: "\\|", langle: "\\langle", rangle: "\\rangle" };
const CI_KEYWORDS = [
  ...Object.keys(SYMBOLS).map((k) => k.toLowerCase()),
  ...FUNCS_LIST(),
  ...Object.keys(BIGOPS).map((k) => k.toLowerCase()),
  ...Object.keys(ACCENTS),
  ...ENVS,
  "over", "atop", "sqrt", "root", "from", "left", "right", "rm", "it", "bold",
];
const CS_KEYWORDS = [...GREEK_LOWER, ...Object.keys(GREEK_UPPER)];
function FUNCS_LIST() {
  return "sin cos tan csc sec cot sinh cosh tanh log ln lg exp det gcd min max arcsin arccos arctan mod".split(" ");
}
/** 단어 앞부분에서 가장 긴 키워드 길이 (없으면 0). 'to','of'는 일반 단어 앞에서 끊지 않음 */
function prefixKeyword(w: string): number {
  const l = w.toLowerCase();
  let best = 0;
  for (const k of CI_KEYWORDS) if (k.length > best && k.length < w.length && l.startsWith(k)) best = k.length;
  for (const k of CS_KEYWORDS) if (k.length > best && k.length < w.length && w.startsWith(k)) best = k.length;
  return best;
}

function isKeyword(w: string): boolean {
  const l = w.toLowerCase();
  return (
    l in SYMBOLS || w in SYMBOLS || GREEK_LOWER.includes(w) || w in GREEK_UPPER || FUNCS.has(l) || l in BIGOPS || l in ACCENTS || ENVS.has(l) ||
    ["over", "atop", "sqrt", "root", "of", "from", "to", "left", "right", "rm", "it", "bold", "prime"].includes(l)
  );
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "`" || ch === "~") { out.push({ t: "sp", v: ch }); i++; continue; }
    if (ch === "{") { out.push({ t: "lb" }); i++; continue; }
    if (ch === "}") { out.push({ t: "rb" }); i++; continue; }
    if (ch === "#") { out.push({ t: "nl" }); i++; continue; }
    if (ch === "&") { out.push({ t: "amp" }); i++; continue; }
    if (ch === "^") { out.push({ t: "sup" }); i++; continue; }
    if (ch === "_") { out.push({ t: "sub" }); i++; continue; }
    if (ch === '"') {
      const j = s.indexOf('"', i + 1);
      const v = j < 0 ? s.slice(i + 1) : s.slice(i + 1, j);
      out.push({ t: "str", v });
      i = j < 0 ? s.length : j + 1;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["->", "<=", ">=", "!=", "==", "<-", "=>", "<<", ">>", "+-", "-+"].includes(two)) {
      const map: Record<string, string> = { "->": "\\to", "<=": "\\le", ">=": "\\ge", "!=": "\\ne", "==": "\\equiv", "<-": "\\leftarrow", "=>": "\\Rightarrow", "<<": "\\ll", ">>": "\\gg", "+-": "\\pm", "-+": "\\mp" };
      out.push({ t: "sym", v: map[two] });
      i += 2;
      continue;
    }
    let m = /^[0-9]+(?:\.[0-9]+)?/.exec(s.slice(i));
    if (m) { out.push({ t: "num", v: m[0] }); i += m[0].length; continue; }
    m = /^[A-Za-z]+/.exec(s.slice(i));
    if (m) {
      let w = m[0];
      i += w.length;
      // 붙여 쓴 키워드 분리 (한글 수식은 단어 앞부분이 키워드면 끊어 읽음: LEQx → LEQ x, lef → le f, CIRCh → CIRC h)
      for (;;) {
        if (isKeyword(w)) break;
        const p = prefixKeyword(w);
        if (!p) break;
        out.push({ t: "word", v: w.slice(0, p) });
        w = w.slice(p);
      }
      out.push({ t: "word", v: w });
      continue;
    }
    m = /^[ㄱ-힣]+/.exec(s.slice(i)); // 한글
    if (m) { out.push({ t: "str", v: m[0] }); i += m[0].length; continue; }
    out.push({ t: "sym", v: ch });
    i++;
  }
  // LEFT { / RIGHT } 처럼 괄호 기호로 쓰인 중괄호는 묶음이 아니라 기호
  for (let k = 0; k < out.length - 1; k++) {
    const a = out[k];
    if (a.t === "word" && /^(left|right)$/i.test(a.v)) {
      const b = out[k + 1];
      if (b.t === "lb") out[k + 1] = { t: "sym", v: "{" };
      else if (b.t === "rb") out[k + 1] = { t: "sym", v: "}" };
    }
  }
  return out;
}

function group(toks: Tok[]): Node[] {
  const stack: Node[][] = [[]];
  for (const tk of toks) {
    if (tk.t === "lb") stack.push([]);
    else if (tk.t === "rb") {
      if (stack.length === 1) continue; // 짝 없는 } 무시 (한글은 관대함)
      const c = stack.pop()!;
      stack[stack.length - 1].push({ t: "grp", c });
    } else stack[stack.length - 1].push(tk);
  }
  while (stack.length > 1) { // 닫히지 않은 { 자동으로 닫기
    const c = stack.pop()!;
    stack[stack.length - 1].push({ t: "grp", c });
  }
  return stack[0];
}

class Conv {
  unknown = new Set<string>();

  list(nodes: Node[], ctx: { top?: boolean } = {}): string {
    const atoms: string[] = [];
    let roman = false;
    let i = 0;
    const next = (): string => {
      // 다음 피연산자 1개 (공백 건너뜀)
      while (i < nodes.length && nodes[i].t === "sp") i++;
      if (i >= nodes.length) return "{}";
      const n = nodes[i++];
      if (n.t === "grp") return this.list(n.c);
      if (n.t === "word") {
        const r = this.word(n.v, roman, () => next(), () => peekWord());
        return r ?? "";
      }
      return this.simple(n, roman);
    };
    const peekWord = (): string | null => {
      let j = i;
      while (j < nodes.length && nodes[j].t === "sp") j++;
      const n = nodes[j];
      return n && n.t === "word" ? n.v.toLowerCase() : null;
    };
    const takeWord = () => {
      while (i < nodes.length && nodes[i].t === "sp") i++;
      i++;
    };
    const hasTopNl = ctx.top && nodes.some((n) => n.t === "nl");

    while (i < nodes.length) {
      const n = nodes[i++];
      if (n.t === "grp") { atoms.push("{" + this.list(n.c) + "}"); continue; }
      if (n.t === "sup" || n.t === "sub") {
        const arg = next();
        if (!atoms.length) atoms.push("{}");
        let last = atoms[atoms.length - 1];
        // 이미 같은 방향 첨자가 있으면 빈 base로 연결
        if ((n.t === "sup" && /\^\{[^{}]*\}$/.test(last)) || (n.t === "sub" && /_\{[^{}]*\}$/.test(last))) last += "{}";
        atoms[atoms.length - 1] = last + (n.t === "sup" ? "^{" : "_{") + arg + "}";
        continue;
      }
      if (n.t === "sp") { atoms.push(n.v === "~" ? "\\ " : "\\,"); continue; }
      if (n.t === "nl") { atoms.push(hasTopNl ? " \\\\ " : " "); continue; }
      if (n.t === "amp") { if (hasTopNl) atoms.push("&"); continue; }
      if (n.t === "word") {
        const l = n.v.toLowerCase();
        if (l === "rm") { roman = true; continue; }
        if (l === "it") { roman = false; continue; }
        if (l === "bold") continue;
        if (l === "over" || l === "atop") {
          // 앞 원자의 공백 제거 후 분수
          while (atoms.length && /^\\[, ]$/.test(atoms[atoms.length - 1])) atoms.pop();
          const a = atoms.pop() ?? "{}";
          const b = next();
          atoms.push(l === "over" ? `\\frac{${strip(a)}}{${b}}` : `\\genfrac{}{}{0pt}{}{${strip(a)}}{${b}}`);
          continue;
        }
        if (l === "prime") {
          while (atoms.length && /^\\[, ]$/.test(atoms[atoms.length - 1])) atoms.pop();
          if (!atoms.length) atoms.push("{}");
          atoms[atoms.length - 1] += "'";
          continue;
        }
        if (l in BIGOPS) {
          let s = BIGOPS[l];
          if (l === "lim") s += "\\limits";
          if (peekWord() === "from") { takeWord(); s += "_{" + next() + "}"; }
          if (peekWord() === "to") { takeWord(); s += "^{" + next() + "}"; }
          atoms.push(s);
          continue;
        }
        if (l === "left" || l === "right") {
          while (i < nodes.length && nodes[i].t === "sp") i++;
          const d = nodes[i];
          let delim = ".";
          if (d && (d.t === "sym" || d.t === "word")) {
            i++;
            const key = d.t === "word" ? d.v.toLowerCase() : d.v;
            delim = DELIM[key] ?? ".";
          }
          atoms.push((l === "left" ? "\\left" : "\\right") + delim + " ");
          continue;
        }
        const r = this.word(n.v, roman, () => next(), peekWord);
        if (r !== null) atoms.push(r);
        continue;
      }
      if (n.t === "sym" && n.v === "'") {
        while (atoms.length && /^\\[, ]$/.test(atoms[atoms.length - 1])) atoms.pop();
        if (!atoms.length) atoms.push("{}");
        atoms[atoms.length - 1] += "'";
        continue;
      }
      atoms.push(this.simple(n, roman));
    }
    let out = atoms.join(" ").replace(/\s+/g, " ").trim();
    out = balanceLeftRight(out);
    if (hasTopNl) out = `\\begin{aligned}${out.includes("&") ? "" : "&"}${out.replace(/ \\\\ /g, out.includes("&") ? " \\\\ " : " \\\\ &")}\\end{aligned}`;
    return out;
  }

  simple(n: Node, roman: boolean): string {
    if (n.t === "num") return n.v;
    if (n.t === "str") return n.v === "{" || n.v === "}" ? "\\" + n.v : n.v.trim() ? `\\text{${escText(n.v)}}` : "\\ ";
    if (n.t === "sym") {
      const map: Record<string, string> = { "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$", "\\": "\\backslash ", "∵": "\\because", "∴": "\\therefore", "·": "\\cdot" };
      return map[n.v] ?? n.v;
    }
    if (n.t === "grp") return "{" + this.list(n.c) + "}";
    return "";
  }

  word(w: string, roman: boolean, next: () => string, peek: () => string | null): string | null {
    const l = w.toLowerCase();
    if (GREEK_LOWER.includes(w)) return "\\" + w;
    if (w in GREEK_UPPER) return GREEK_UPPER[w];
    if (FUNCS.has(l)) return l === "mod" ? "\\bmod" : "\\" + l;
    if (l === "sqrt" || l === "root") {
      const a = next();
      if (peek() === "of") { next(); /* 'of' 소비 */ const b = next(); return `\\sqrt[${a}]{${b}}`; }
      return `\\sqrt{${a}}`;
    }
    if (l in ACCENTS) {
      const a = next();
      // 한 글자 bar 는 \bar 가 더 자연스러움
      if (l === "bar" && /^[A-Za-z0-9]$/.test(a)) return `\\bar{${a}}`;
      return `${ACCENTS[l]}{${a}}`;
    }
    if (ENVS.has(l)) return this.env(l, next);
    if (w in SYMBOLS) return SYMBOLS[w];
    if (l in SYMBOLS) return SYMBOLS[l];
    if (["from", "to", "of"].includes(l)) return null;
    // 일반 문자(변수)
    if (w.length >= 2 && !roman) this.unknown.add(w);
    return roman ? `\\mathrm{${w}}` : w;
  }

  env(kind: string, next: () => string): string {
    // next()는 이미 변환된 문자열을 주므로, 원본 노드가 필요 → 특수 처리
    // 여기서는 행(#)·열(&) 구분을 위해 sentinel 사용
    const raw = next(); // 변환 결과에 \\\\ 와 & 포함 (list에서 hasTopNl 아님) → 아래 envList로 대체
    return raw;
  }
}

function strip(a: string): string {
  return a.startsWith("{") && a.endsWith("}") && balanced(a.slice(1, -1)) ? a.slice(1, -1) : a;
}
function balanced(s: string): boolean {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === "{") d++;
    else if (s[i] === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
}
function escText(s: string): string {
  return s.replace(/[\\{}$&#^_%~]/g, (c) => "\\" + c);
}
function balanceLeftRight(s: string): string {
  const L = (s.match(/\\left[^a-zA-Z]/g) ?? []).length;
  const R = (s.match(/\\right[^a-zA-Z]/g) ?? []).length;
  if (L > R) s += " \\right.".repeat(L - R);
  else if (R > L) s = "\\left. ".repeat(R - L) + s;
  return s;
}

// 환경(cases, pile, eqalign, matrix)은 원본 노드에서 행/열을 나눠야 하므로 Conv를 확장
class Conv2 extends Conv {
  list(nodes: Node[], ctx: { top?: boolean } = {}): string {
    // 환경 키워드 뒤의 묶음을 미리 변환해 sym 노드로 치환
    const rewritten: Node[] = [];
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      if (n.t === "word" && ENVS.has(n.v.toLowerCase())) {
        let j = k + 1;
        while (j < nodes.length && nodes[j].t === "sp") j++;
        const g = nodes[j];
        if (g && g.t === "grp") {
          rewritten.push({ t: "sym", v: this.envFrom(n.v.toLowerCase(), g.c) });
          k = j;
          continue;
        }
      }
      rewritten.push(n);
    }
    return super.list(rewritten, ctx);
  }
  envFrom(kind: string, c: Node[]): string {
    const rows: Node[][][] = [[[]]];
    for (const n of c) {
      if (n.t === "nl") rows.push([[]]);
      else if (n.t === "amp") rows[rows.length - 1].push([]);
      else rows[rows.length - 1][rows[rows.length - 1].length - 1].push(n);
    }
    // 끝의 빈 행 제거
    while (rows.length > 1 && rows[rows.length - 1].every((cell) => cell.every((x) => x.t === "sp"))) rows.pop();
    const body = rows.map((r) => r.map((cell) => this.list(cell)).join(" & ")).join(" \\\\ ");
    switch (kind) {
      case "cases": return `\\begin{cases} ${body} \\end{cases}`;
      case "eqalign": return `\\begin{aligned} ${body} \\end{aligned}`;
      case "pmatrix": return `\\begin{pmatrix} ${body} \\end{pmatrix}`;
      case "bmatrix": return `\\begin{bmatrix} ${body} \\end{bmatrix}`;
      case "dmatrix": return `\\begin{vmatrix} ${body} \\end{vmatrix}`;
      case "lpile": return `\\begin{array}{l} ${body} \\end{array}`;
      case "rpile": return `\\begin{array}{r} ${body} \\end{array}`;
      default: return `\\begin{matrix} ${body} \\end{matrix}`;
    }
  }
}

export function hwpToLatex(script: string): ConvertResult {
  const c = new Conv2();
  const latex = c.list(group(tokenize(script)), { top: true });
  return { latex, unknown: [...c.unknown] };
}
