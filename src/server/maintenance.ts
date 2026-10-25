// 저장 공간 정리: 무엇을 할지 미리 보여 주고(plan), 대장이 누르면 실행(run)
import "server-only";
import { makeTemplate } from "../hwpx/compose";
import type { Repo, StoredFile } from "../repo/types";

export interface MaintenancePlan {
  totalBytes: number; // 지금 파일 저장소 전체
  fileCount: number;
  templates: { examId: string; title: string; from: string; bytes: number }[]; // 양식 파일로 바꿀 회차(원본 → 양식)
  deletes: { path: string; bytes: number; reason: string }[]; // 지울 파일
  redundantXml: number; // 중복 XML을 비울 문항 수
  afterBytes: number; // 정리 후 예상 (양식 파일 크기는 원본의 약 3%로 어림)
}

const isTemplate = (p: string) => /template\.hwpx$/.test(p);

export async function planMaintenance(repo: Repo): Promise<MaintenancePlan> {
  const [files, exams, redundantXml] = await Promise.all([repo.listFiles(), repo.listExams(), repo.countRedundantXml()]);
  const size = new Map(files.map((f: StoredFile) => [f.path.replace(/\\/g, "/"), f.size]));
  const norm = (p: string) => p.replace(/\\/g, "/");
  const templates = exams
    .filter((e) => !isTemplate(e.filePath))
    .map((e) => ({ examId: e.id, title: e.title, from: e.filePath, bytes: size.get(norm(e.filePath)) ?? 0 }));
  const deletes = [
    ...templates.map((t) => ({ path: t.from, bytes: t.bytes, reason: `${t.title} 원본 HWPX (양식 파일로 바꾼 뒤 삭제 — 원본은 대장님 컴퓨터에 있음)` })),
    ...files
      .filter((f) => /(^|[\\/])incoming[\\/]/.test(f.path))
      .map((f) => ({ path: f.path, bytes: f.size, reason: "업로드 때 만든 임시 사본 (내용은 이미 저장됨)" })),
  ];
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  const removed = deletes.reduce((a, d) => a + d.bytes, 0);
  const added = templates.reduce((a, t) => a + Math.round(t.bytes * 0.03), 0);
  return { totalBytes, fileCount: files.length, templates, deletes, redundantXml, afterBytes: totalBytes - removed + added };
}

export async function runMaintenance(repo: Repo): Promise<string[]> {
  const log: string[] = [];
  const plan = await planMaintenance(repo);
  for (const t of plan.templates) {
    const original = await repo.readFile(t.from);
    const tpl = await makeTemplate(original);
    const to = repo.examFilePath(t.examId, "template.hwpx");
    await repo.writeFile(to, tpl, "application/hwp+zip");
    await repo.setExamFilePath(t.examId, to);
    log.push(`${t.title}: 양식 파일 만듦 (${kb(original.length)} → ${kb(tpl.length)})`);
  }
  const paths = plan.deletes.map((d) => d.path);
  if (paths.length) {
    await repo.deleteFiles(paths);
    log.push(`파일 ${paths.length}개 삭제 (${kb(plan.deletes.reduce((a, d) => a + d.bytes, 0))})`);
  }
  if (plan.redundantXml) {
    const n = await repo.clearRedundantXml();
    log.push(`문항 ${n}개의 중복 XML 비움`);
  }
  if (!log.length) log.push("정리할 것이 없습니다.");
  return log;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);
