// POST /api/exams — HWPX 업로드 후 분리·저장
//  · 로컬 모드: multipart/form-data (file, curriculum, title)
//  · Supabase 모드: JSON {incomingPath, curriculum, title} — 브라우저가 Storage에 먼저 올린 파일을 서버가 가져옴
//    (Vercel 함수 요청 크기 제한 4.5MB를 피하기 위함)
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { ingestHwpx } from "@/server/ingest";
import { supabaseEnabled, supabaseServer } from "@/lib/supabase-server";
import type { Curriculum } from "@/repo/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  try {
    const repo = await getRepo();
    let bytes: Uint8Array;
    let curriculum: string;
    let title = "";
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      if (!supabaseEnabled()) return NextResponse.json({ error: "Supabase 모드가 아닙니다" }, { status: 400 });
      const body = await req.json();
      curriculum = body.curriculum;
      title = body.title ?? "";
      const sb = await supabaseServer();
      const { data, error } = await sb.storage.from("exams").download(body.incomingPath);
      if (error || !data) throw new Error("업로드한 파일을 찾지 못했습니다");
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      const form = await req.formData();
      const f = form.get("file");
      if (!(f instanceof File)) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
      if (!f.name.toLowerCase().endsWith(".hwpx")) return NextResponse.json({ error: "HWPX 파일만 올릴 수 있습니다. HWP는 한글에서 HWPX로 저장한 뒤 올려 주세요." }, { status: 400 });
      bytes = new Uint8Array(await f.arrayBuffer());
      curriculum = String(form.get("curriculum") ?? "");
      title = String(form.get("title") ?? "");
    }
    if (curriculum !== "2015" && curriculum !== "2022") return NextResponse.json({ error: "교육과정을 선택해 주세요" }, { status: 400 });
    const result = await ingestHwpx(repo, bytes, { curriculum: curriculum as Curriculum, title });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
