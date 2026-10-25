// 백업 받기용 API (브라우저가 여러 번 나눠 받아서 ZIP 하나로 묶음 — Vercel 응답 크기 제한 4.5MB 때문)
//  GET /api/backup?part=meta            → backup.json 내용 + 받을 파일 목록
//  GET /api/backup?part=problems&exam=  → 한 회차의 문항
//  GET /api/backup?part=file&path=      → 파일 하나 (저장소 고유 경로)
import { NextResponse } from "next/server";
import { getRepo, requireUser } from "@/repo";
import { taxonomyToBackup, type BackupExam, type BackupFile } from "@/repo/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const base = (p: string) => p.replace(/\\/g, "/").split("/").pop()!;

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: auth.status });
  const url = new URL(req.url);
  const part = url.searchParams.get("part");
  const repo = await getRepo();
  try {
    if (part === "meta") {
      const [tax, exams, worksheets] = await Promise.all([repo.getTaxonomy(), repo.listExams(), repo.listWorksheets()]);
      const files: { zip: string; native: string; mime: string }[] = [];
      const bexams: BackupExam[] = [];
      for (const e of exams) {
        const imgs = await repo.examImages(e.id);
        const tplZip = `files/${e.id}/${base(e.filePath)}`;
        files.push({ zip: tplZip, native: e.filePath, mime: "application/hwp+zip" });
        const images = imgs.map((im) => {
          const zip = `files/${e.id}/${base(im.path)}`;
          files.push({ zip, native: im.path, mime: im.mime });
          return { binId: im.binId, file: zip, mime: im.mime };
        });
        const { id, title, curriculum, sourceRaw, headerTitleText, problemStyleId, sectionHead, sectionTail, shellRunsXml, columnWidth, binData, createdAt } = e;
        bexams.push({ id, title, curriculum, sourceRaw, headerTitleText, problemStyleId, sectionHead, sectionTail, shellRunsXml, columnWidth, binData, createdAt, template: tplZip, images });
      }
      const backup: BackupFile = { format: "munhang-backup", version: 1, createdAt: new Date().toISOString(), taxonomy: taxonomyToBackup(tax).tax, exams: bexams, worksheets };
      return NextResponse.json({ backup, files });
    }
    if (part === "problems") {
      const exam = url.searchParams.get("exam") ?? "";
      return NextResponse.json(await repo.dumpProblems(exam));
    }
    if (part === "file") {
      const p = url.searchParams.get("path") ?? "";
      if (!p || p.includes("..")) return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
      const data = await repo.readFile(p);
      return new Response(Buffer.from(data), { headers: { "content-type": "application/octet-stream" } });
    }
    return NextResponse.json({ error: "part가 필요합니다" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
