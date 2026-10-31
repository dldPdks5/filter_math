// DELETE /api/exams/:id {title} — 회차 영구 삭제 (문항·태그 연결·저장 파일까지)
//   실수 방지: 회차 이름을 정확히 입력해야 지워짐. 저장 학습지는 그대로 두고, 열 때 지워진 문항만 빠짐
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const repo = await getRepo();
    const exam = await repo.getExam(id);
    if (!exam) return NextResponse.json({ error: "회차를 찾을 수 없습니다" }, { status: 404 });
    if (String(body.title ?? "").trim() !== exam.title.trim())
      return NextResponse.json({ error: "회차 이름이 맞지 않습니다" }, { status: 400 });
    const r = await repo.deleteExam(id);
    return NextResponse.json({ ok: true, files: r.files });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
