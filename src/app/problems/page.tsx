import { getRepo } from "@/repo";
import { blocksHtml } from "@/render/html";
import SearchClient, { type SearchProblem } from "./SearchClient";

export const dynamic = "force-dynamic";

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws } = await searchParams;
  const repo = await getRepo();
  const [tax, exams, problems, worksheet] = await Promise.all([
    repo.getTaxonomy(),
    repo.listExams(),
    repo.listProblems({}),
    ws ? repo.getWorksheet(ws) : Promise.resolve(null),
  ]);
  const items: SearchProblem[] = problems.map((p) => ({
    id: p.id,
    examId: p.examId,
    examTitle: p.examTitle,
    curriculum: p.curriculum,
    number: p.number,
    answer: p.answer,
    mainUnit: p.mainUnit,
    tagStatus: p.tagStatus,
    tagIds: p.tagIds,
    html: blocksHtml(p.problemBlocks, (bin) => `/api/images/${p.examId}/${encodeURIComponent(bin)}`),
  }));
  return (
    <SearchClient
      taxonomy={tax}
      exams={exams.map((e) => ({ id: e.id, title: e.title, curriculum: e.curriculum }))}
      problems={items}
      initialWorksheet={worksheet}
    />
  );
}
