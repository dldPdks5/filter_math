// POST /api/exams/:id/tags-import — 태그 초안 JSON 일괄 적용
// 형식: { problems: [{ number, mainUnit, tags: ["단원키|중단원명|태그명", …] }] }
// 체계표에 없는 태그는 적용하지 않고 목록으로 돌려줌 (자동으로 만들지 않음)
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const body = await req.json();
  const repo = await getRepo();
  const tax = await repo.getTaxonomy();
  const key = (u: string, s: string, t: string) => `${u}|${s}|${t}`;
  const lookup = new Map<string, number>();
  for (const t of tax.tags) {
    const s = tax.sections.find((x) => x.id === t.sectionId)!;
    lookup.set(key(s.unitKey, s.name, t.name), t.id);
  }
  const units = new Set(tax.units.map((u) => u.key));
  const problems = await repo.listProblems({ examId: id });
  const missing: string[] = [];
  let applied = 0;
  for (const item of body.problems ?? []) {
    const p = problems.find((x) => x.number === Number(item.number));
    if (!p) { missing.push(`${item.number}번 문항 없음`); continue; }
    const ids: number[] = [];
    for (const s of item.tags ?? []) {
      const tid = lookup.get(String(s));
      if (tid) ids.push(tid);
      else missing.push(`${item.number}번: ${s}`);
    }
    await repo.setProblemTags(p.id, { mainUnit: units.has(item.mainUnit) ? item.mainUnit : p.mainUnit, tagIds: [...new Set([...p.tagIds, ...ids])], tagStatus: p.tagStatus });
    applied++;
  }
  return NextResponse.json({ applied, missing });
}
