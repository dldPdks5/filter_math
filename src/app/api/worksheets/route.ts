// GET /api/worksheets — 저장한 학습지 목록 / POST — 새로 저장 또는 덮어쓰기 {id?, title, problemIds, options}
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { parseOptions } from "@/server/export";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  return NextResponse.json(await (await getRepo()).listWorksheets());
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "학습지 제목을 입력해 주세요" }, { status: 400 });
  const problemIds = Array.isArray(body.problemIds) ? body.problemIds.map(String) : [];
  try {
    const id = await (await getRepo()).saveWorksheet({ id: body.id || undefined, title, problemIds, options: parseOptions(body.options) });
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
