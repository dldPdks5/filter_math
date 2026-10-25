// POST /api/export/hwpx {problemIds, title, options} → HWPX 파일
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { buildHwpx, parseOptions } from "@/server/export";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.problemIds) ? body.problemIds.map(String) : [];
    if (!ids.length) return NextResponse.json({ error: "담은 문항이 없습니다" }, { status: 400 });
    const title = String(body.title ?? "").trim() || "학습지";
    const out = await buildHwpx(await getRepo(), ids, title, parseOptions(body.options));
    const name = encodeURIComponent(`${title}.hwpx`);
    return new Response(Buffer.from(out), {
      headers: { "content-type": "application/hwp+zip", "content-disposition": `attachment; filename*=UTF-8''${name}` },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
