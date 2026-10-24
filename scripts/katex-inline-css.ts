// KaTeX CSS + woff2 글꼴을 data URI로 묶은 CSS 생성 (오프라인 미리보기/PDF용)
import fs from "node:fs";
import path from "node:path";
const dir = path.join("node_modules", "katex", "dist");
let css = fs.readFileSync(path.join(dir, "katex.min.css"), "utf8");
css = css.replace(/src:url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\)(,url\([^)]+\) format\("[^"]+"\))*/g, (_, f) =>
  `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, "fonts", f)).toString("base64")}) format("woff2")`);
fs.writeFileSync("src/render/katex-inline.css", css);
console.log((css.length / 1024).toFixed(0) + "KB");
