// data/taxonomy.json → 저장소용 체계표 (로컬 모드 초기값, Supabase seed.sql 생성에 사용)
import type { Taxonomy } from "./types";

interface TaxJson {
  curricula: { id: string; name: string; subjects: { id: string; name: string; units: string[] }[] }[];
  units: { key: string; name: string; sections: { key: string; name: string; tags: string[]; verify?: string }[] }[];
}

export function taxonomyFromJson(j: TaxJson): Taxonomy {
  const t: Taxonomy = { units: [], sections: [], tags: [], subjects: [] };
  let sid = 0, tid = 0, subSort = 0;
  j.curricula.forEach((c) => c.subjects.forEach((s) => t.subjects.push({ id: s.id, curriculum: c.id, name: s.name, unitKeys: s.units, sort: subSort++ })));
  j.units.forEach((u, ui) => {
    t.units.push({ key: u.key, name: u.name, sort: ui });
    u.sections.forEach((s, si) => {
      const id = ++sid;
      t.sections.push({ id, unitKey: u.key, key: s.key, name: s.name, sort: si, verify: s.verify ?? null });
      s.tags.forEach((name, ti) => t.tags.push({ id: ++tid, sectionId: id, name, sort: ti }));
    });
  });
  return t;
}
