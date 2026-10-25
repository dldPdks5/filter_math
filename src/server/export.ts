// 담은 문항 → HWPX (여러 회차 섞기)
import "server-only";
import { composeWorksheet, type ComposeExam, type ComposeItem } from "../hwpx/compose";
import type { Repo, WorksheetOptions } from "../repo/types";

export async function buildHwpx(repo: Repo, problemIds: string[], title: string, options: WorksheetOptions) {
  const problems = await repo.getProblems(problemIds);
  if (!problems.length) throw new Error("담은 문항을 찾지 못했습니다");
  const examIds = [...new Set(problems.map((p) => p.examId))];
  const exams: ComposeExam[] = await Promise.all(
    examIds.map(async (id) => {
      const e = await repo.getExam(id);
      if (!e) throw new Error("회차 정보를 찾지 못했습니다");
      return {
        key: id,
        file: await repo.getExamFile(id),
        getBin: async (binId: string) => (await repo.getImage(id, binId))?.data ?? null,
        sectionHead: e.sectionHead,
        sectionTail: e.sectionTail,
        shellRunsXml: e.shellRunsXml,
        headerTitleText: e.headerTitleText,
        problemStyleId: e.problemStyleId,
      };
    })
  );
  const items: ComposeItem[] = problems.map((p) => ({
    examKey: p.examId,
    number: p.number,
    answer: p.answer,
    problemXml: p.problemXml,
    problemXmlWithSolution: p.problemXmlWithSolution,
    label: `${p.examTitle} ${p.number}번`,
  }));
  return composeWorksheet(exams, items, { title, answers: options.answers, showSource: options.showSource });
}

export function parseOptions(o: any): WorksheetOptions {
  const answers = o?.answers === "key" || o?.answers === "solutions" ? o.answers : "none";
  return { answers, showSource: !!o?.showSource };
}
