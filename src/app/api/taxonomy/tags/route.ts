// POST /api/taxonomy/tags — 중단원에 새 개념 태그 추가 {sectionId, name}
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { sectionId, name } = await req.json();
  const n = String(name ?? "").trim();
  if (!n || !Number.isFinite(Number(sectionId))) return NextResponse.json({ error: "중단원과 태그 이름이 필요합니다" }, { status: 400 });
  try {
    const tag = await (await getRepo()).addTag(Number(sectionId), n);
    return NextResponse.json(tag);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
