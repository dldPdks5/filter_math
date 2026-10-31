// POST /api/problems/:id/split {fp, index} — index번째 문단부터 새 문항으로 나누기
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { splitAt } from "@/server/edit";
import { editErrorResponse } from "@/server/edit-response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const b = await req.json();
  try {
    return NextResponse.json(await splitAt(await getRepo(), id, { fp: b.fp, index: Number(b.index) }));
  } catch (e) {
    return editErrorResponse(e);
  }
}
