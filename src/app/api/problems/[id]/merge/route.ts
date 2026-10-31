// POST /api/problems/:id/merge {fp} — 다음 번호 문항을 이 문항 뒤에 합치기
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { mergeNext } from "@/server/edit";
import { editErrorResponse } from "@/server/edit-response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await mergeNext(await getRepo(), id, { fp: b.fp }));
  } catch (e) {
    return editErrorResponse(e);
  }
}
