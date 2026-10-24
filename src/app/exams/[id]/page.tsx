import { notFound } from "next/navigation";
import { getRepo } from "@/repo";
import { blocksHtml } from "@/render/html";
import TaggingClient, { type ClientProblem } from "./TaggingClient";

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepo();
  const exam = await repo.getExam(id);
  if (!exam) notFound();
  const [problems, tax] = await Promise.all([repo.listProblems({ examId: id }), repo.getTaxonomy()]);
  const img = (bin: string) => `/api/images/${id}/${encodeURIComponent(bin)}`;
  const items: ClientProblem[] = problems.map((p) => ({
    id: p.id,
    number: p.number,
    answer: p.answer,
    mainUnit: p.mainUnit,
    tagStatus: p.tagStatus,
    tagIds: p.tagIds,
    problemHtml: blocksHtml(p.problemBlocks, img),
    solutionHtml: blocksHtml(p.solutionBlocks.slice(1), img), // 첫 문단은 정답 줄
  }));
  return <TaggingClient exam={{ id, title: exam.title, curriculum: exam.curriculum }} problems={items} taxonomy={tax} />;
}
