// GET /api/problems/:id/content — 고칠 수 있는 글자·수식 조각, 문단 목록
// PUT /api/problems/:id/content {fp, edits: {조각번호: 새 내용}, answer?, points?, number?, swap?} — 저장 (원본을 바로 덮어씀)
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { getEditor, saveContent } from "@/server/edit";
import { editErrorResponse } from "@/server/edit-response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  try {
    return NextResponse.json(await getEditor(await getRepo(), id));
  } catch (e) {
    return editErrorResponse(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const b = await req.json();
  try {
    const points = b.points === undefined ? undefined : Number.isInteger(Number(b.points)) && Number(b.points) > 0 ? Number(b.points) : null;
    const number = b.number === undefined || b.number === "" ? undefined : Number(b.number);
    const edits = b.edits && typeof b.edits === "object" ? b.edits : {};
    const answer = typeof b.answer === "string" ? b.answer : undefined;
    return NextResponse.json(await saveContent(await getRepo(), id, { fp: b.fp, edits, answer, points, number, swap: !!b.swap }));
  } catch (e) {
    return editErrorResponse(e);
  }
}
