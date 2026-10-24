// PUT /api/problems/:id/tags — 주 단원·개념 태그·확정 상태 저장
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const body = await req.json();
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.map(Number).filter(Number.isFinite) : [];
  const tagStatus = body.tagStatus === "confirmed" ? "confirmed" : "draft";
  try {
    await (await getRepo()).setProblemTags(id, { mainUnit: body.mainUnit || null, tagIds, tagStatus });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
