import { getRepo } from "@/repo";
import { blocksHtml } from "@/render/html";
import SearchClient, { type SearchProblem } from "./SearchClient";

export const dynamic = "force-dynamic";

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws: wsParam } = await searchParams;
  const repo = await getRepo();
  const [tax, exams, problems, worksheet] = await Promise.all([
    repo.getTaxonomy(),
    repo.listExams(),
    repo.listProblems({}),
    wsParam ? repo.getWorksheet(wsParam) : Promise.resolve(null),
  ]);
  const items: SearchProblem[] = problems.map((p) => ({
    id: p.id,
    examId: p.examId,
    examTitle: p.examTitle,
    curriculum: p.curriculum,
    number: p.number,
    answer: p.answer,
    points: p.points,
    mainUnit: p.mainUnit,
    tagStatus: p.tagStatus,
    tagIds: p.tagIds,
    html: blocksHtml(p.problemBlocks, (bin) => `/api/images/${p.examId}/${encodeURIComponent(bin)}`),
  }));
  // 저장 학습지에 지워진 문항(회차 삭제·문항 합치기)이 있으면 빼고 몇 개 빠졌는지 알려 줌
  const exist = new Set(problems.map((p) => p.id));
  const missing = worksheet ? worksheet.problemIds.filter((id) => !exist.has(id)).length : 0;
  const ws = worksheet && missing ? { ...worksheet, problemIds: worksheet.problemIds.filter((id) => exist.has(id)) } : worksheet;
  return (
    <SearchClient
      taxonomy={tax}
      exams={exams.map((e) => ({ id: e.id, title: e.title, curriculum: e.curriculum }))}
      problems={items}
      initialWorksheet={ws}
      missingCount={missing}
    />
  );
}
