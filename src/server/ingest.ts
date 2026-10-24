// HWPX 바이트 → 분리 → 저장
import "server-only";
import JSZip from "jszip";
import { parseHwpx } from "../hwpx/parse";
import type { Curriculum, ImageInput, Repo } from "../repo/types";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", wmf: "image/wmf", emf: "image/emf" };

export async function ingestHwpx(repo: Repo, file: Uint8Array, opt: { curriculum: Curriculum; title?: string }) {
  const exam = await parseHwpx(file);
  const zip = await JSZip.loadAsync(file);
  const images: ImageInput[] = [];
  for (const [binId, b] of Object.entries(exam.binData)) {
    const f = zip.file(b.path);
    if (!f) continue;
    const ext = b.path.split(".").pop()!.toLowerCase();
    images.push({ binId, fileName: `${binId}.${ext}`, mime: MIME[ext] ?? "application/octet-stream", data: await f.async("uint8array") });
  }
  const title = (opt.title ?? "").trim() || exam.sourceTitle || "제목 없음";
  const id = await repo.saveExam(
    {
      title,
      curriculum: opt.curriculum,
      sourceRaw: exam.sourceRaw,
      headerTitleText: exam.headerTitleText,
      problemStyleId: exam.problemStyleId,
      sectionHead: exam.sectionHead,
      sectionTail: exam.sectionTail,
      shellRunsXml: exam.shellRunsXml,
      columnWidth: exam.columnWidth,
      binData: exam.binData,
    },
    exam.problems.map((p) => ({
      number: p.number,
      answer: p.answer,
      problemXml: p.problemXml,
      problemXmlWithSolution: p.problemXmlWithSolution,
      solutionXml: p.solutionXml,
      problemBlocks: p.problemBlocks,
      solutionBlocks: p.solutionBlocks,
      images: p.images,
      solutionImages: p.solutionImages,
    })),
    file,
    images
  );
  return { id, title, count: exam.problems.length };
}
