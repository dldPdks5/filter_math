// HWPX 바이트 → 분리 → 저장
import "server-only";
import JSZip from "jszip";
import { parseHwpx } from "../hwpx/parse";
import { makeTemplate } from "../hwpx/compose";
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
      problemXml: "", // 용량 절약: 해설 없는 버전은 출력할 때 해설 포함본에서 만듦
      problemXmlWithSolution: p.problemXmlWithSolution,
      solutionXml: "", // 사용하지 않음 (해설은 problemXmlWithSolution·solutionBlocks에 있음)
      problemBlocks: p.problemBlocks,
      solutionBlocks: p.solutionBlocks,
      images: p.images,
      solutionImages: p.solutionImages,
      points: p.points,
    })),
    await makeTemplate(file), // 원본 대신 그림·본문을 뺀 양식 파일만 저장 (그림은 따로, 본문 조각은 DB에)
    images
  );
  return { id, title, count: exam.problems.length };
}
