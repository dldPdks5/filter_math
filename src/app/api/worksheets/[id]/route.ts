// GET /api/worksheets/:id — 학습지 하나 / DELETE — 학습지 삭제(담은 문항은 지워지지 않음)
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const w = await (await getRepo()).getWorksheet(id);
  return w ? NextResponse.json(w) : NextResponse.json({ error: "학습지를 찾을 수 없습니다" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  await (await getRepo()).deleteWorksheet(id);
  return NextResponse.json({ ok: true });
}
