// 원본 XML 문자열을 그대로 보존하면서 요소 범위(start~end)를 찾는 경량 스캐너.
// HWPX 재출력 시 바이트 단위로 원본 조각을 잘라 붙이기 위해 DOM 대신 사용한다.

export interface Span {
  name: string; // 예: "hp:p"
  start: number; // '<' 위치
  end: number; // 닫는 태그 '>' 다음 위치
  openEnd: number; // 여는 태그 '>' 다음 위치
  closeStart: number; // 닫는 태그 '<' 위치 (self-closing이면 end와 같음)
  attrs: Record<string, string>;
}

const TAG_RE = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>\/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g;
const ATTR_RE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) out[m[1]] = m[2] ?? m[3] ?? "";
  return out;
}

/** xml[from, to) 범위 안에서 깊이 0인 자식 요소들의 범위를 반환 */
export function children(xml: string, from: number, to: number): Span[] {
  const out: Span[] = [];
  const stack: Span[] = [];
  TAG_RE.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml)) && m.index < to) {
    if (!m[2]) continue; // PI, 주석, CDATA
    const [whole, closing, name, attrStr, selfClose] = m;
    const start = m.index;
    const after = start + whole.length;
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) throw new Error(`XML 짝이 맞지 않음: </${name}> @${start}`);
      open.closeStart = start;
      open.end = after;
      if (stack.length === 0) out.push(open);
    } else {
      const span: Span = { name, start, end: after, openEnd: after, closeStart: after, attrs: parseAttrs(attrStr) };
      if (selfClose) {
        if (stack.length === 0) out.push(span);
      } else stack.push(span);
    }
  }
  if (stack.length) throw new Error(`닫히지 않은 요소: ${stack.map((s) => s.name).join(",")}`);
  return out;
}

/** 요소 내부(여는 태그 뒤 ~ 닫는 태그 앞)의 자식들 */
export function inner(xml: string, s: Span): Span[] {
  return children(xml, s.openEnd, s.closeStart);
}

/** 범위 안 모든 깊이에서 특정 이름의 요소를 찾음 */
export function findAll(xml: string, name: string, from = 0, to = xml.length): Span[] {
  const res: Span[] = [];
  const walk = (a: number, b: number) => {
    for (const c of children(xml, a, b)) {
      if (c.name === name) res.push(c);
      if (c.openEnd < c.closeStart) walk(c.openEnd, c.closeStart);
    }
  };
  walk(from, to);
  return res;
}

export const slice = (xml: string, s: Span) => xml.slice(s.start, s.end);

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
