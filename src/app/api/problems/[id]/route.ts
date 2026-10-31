// DELETE /api/problems/:id — 문항 하나 영구 삭제 (뒤 문항 번호를 하나씩 당김)
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { deleteOne } from "@/server/edit";
import { editErrorResponse } from "@/server/edit-response";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  try {
    return NextResponse.json(await deleteOne(await getRepo(), id));
  } catch (e) {
    return editErrorResponse(e);
  }
}
