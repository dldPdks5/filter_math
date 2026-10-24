// data/taxonomy.json → supabase/seed.sql (체계표 초기값)
// 이미 있는 항목은 건너뛰므로(on conflict do nothing) 체계표가 바뀐 뒤 다시 실행해도 안전합니다.
import fs from "node:fs";
const tax = JSON.parse(fs.readFileSync("data/taxonomy.json", "utf8"));
const q = (s: string | null | undefined) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const out: string[] = ["-- 자동 생성: npx tsx scripts/make-seed-sql.ts", `-- 체계표 version ${tax.version} (${tax.updated})`, "begin;"];
let sort = 0;
for (const c of tax.curricula)
  for (const s of c.subjects)
    out.push(`insert into subjects (id, curriculum, name, unit_keys, sort) values (${q(s.id)}, ${q(c.id)}, ${q(s.name)}, array[${s.units.map(q).join(",")}], ${sort++}) on conflict (id) do update set name = excluded.name, unit_keys = excluded.unit_keys;`);
tax.units.forEach((u: any, ui: number) => {
  out.push(`insert into units (key, name, sort) values (${q(u.key)}, ${q(u.name)}, ${ui}) on conflict (key) do update set name = excluded.name;`);
  u.sections.forEach((s: any, si: number) => {
    out.push(`insert into sections (unit_key, key, name, sort, verify) values (${q(u.key)}, ${q(s.key)}, ${q(s.name)}, ${si}, ${q(s.verify)}) on conflict (unit_key, key) do update set name = excluded.name, verify = excluded.verify;`);
    s.tags.forEach((t: string, ti: number) =>
      out.push(`insert into tags (section_id, name, sort) select id, ${q(t)}, ${ti} from sections where unit_key = ${q(u.key)} and key = ${q(s.key)} on conflict (section_id, name) do nothing;`)
    );
  });
});
out.push("commit;");
fs.writeFileSync("supabase/seed.sql", out.join("\n") + "\n");
console.log("supabase/seed.sql", out.length, "줄");
