// 복원용 API — 기존 데이터는 덮어쓰지 않고, 없는 것만 추가
//  POST ?step=taxonomy   {taxonomy}
//  POST ?step=file       multipart {examId, name, mime, file} → {path}
//  POST ?step=exam       {exam, filePath, images}
//  POST ?step=problems   {examId, problems}
//  POST ?step=worksheets {worksheets}
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const step = new URL(req.url).searchParams.get("step");
  const repo = await getRepo();
  try {
    if (step === "file") {
      const form = await req.formData();
      const examId = String(form.get("examId") ?? "");
      const name = String(form.get("name") ?? "");
      const file = form.get("file");
      if (!/^[0-9a-f-]{36}$/.test(examId) || !/^[\w.-]+$/.test(name) || !(file instanceof File)) return NextResponse.json({ error: "잘못된 파일 정보" }, { status: 400 });
      const path = repo.examFilePath(examId, name);
      await repo.writeFile(path, new Uint8Array(await file.arrayBuffer()), String(form.get("mime") ?? "application/octet-stream"));
      return NextResponse.json({ path });
    }
    const body = await req.json();
    if (step === "taxonomy") { await repo.restoreTaxonomy(body.taxonomy); return NextResponse.json({ ok: true }); }
    if (step === "exam") { await repo.restoreExam(body.exam, body.filePath, body.images ?? []); return NextResponse.json({ ok: true }); }
    if (step === "problems") return NextResponse.json(await repo.restoreProblems(body.examId, body.problems ?? []));
    if (step === "worksheets") {
      let added = 0;
      for (const w of body.worksheets ?? []) if (await repo.restoreWorksheet(w)) added++;
      return NextResponse.json({ added });
    }
    return NextResponse.json({ error: "step이 필요합니다" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
