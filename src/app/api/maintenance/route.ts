// GET /api/maintenance — 저장 공간 정리 계획 / POST — 실행 (body: {confirm: true})
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { planMaintenance, runMaintenance } from "@/server/maintenance";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  try {
    return NextResponse.json(await planMaintenance(await getRepo()));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) return NextResponse.json({ error: "확인이 필요합니다" }, { status: 400 });
  try {
    return NextResponse.json({ log: await runMaintenance(await getRepo()) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
