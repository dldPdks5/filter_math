// 태그 화면의 '문제 수정' — 글자·수식·정답·배점·번호 고치기, 문항 나누기·합치기
import "server-only";
import JSZip from "jszip";
import { parseBorders, type Ctx } from "../hwpx/parse";
import {
  applyEdits, derive, fingerprint, listParas, listPieces, mergeProblems, splitProblem, answerFromSolution,
  type FormatInfo, type Piece, type ParaInfo,
} from "../hwpx/edit";
import type { ProblemRow, Repo } from "../repo/types";

export class EditError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

async function examContext(repo: Repo, examId: string): Promise<{ ctx: Ctx; fmt: FormatInfo }> {
  const exam = await repo.getExam(examId);
  if (!exam) throw new EditError("회차를 찾을 수 없습니다", 404);
  const zip = await JSZip.loadAsync(await repo.getExamFile(examId));
  const header = (await zip.file("Contents/header.xml")?.async("string")) ?? "";
  const s0 = header.match(/<hh:style id="0"[^>]*paraPrIDRef="(\d+)"/);
  return {
    ctx: { borders: parseBorders(header), colW: exam.columnWidth || 32000 },
    fmt: { problemStyleId: exam.problemStyleId, plain: { style: "0", paraPr: s0?.[1] ?? "0" } },
  };
}

async function loadProblem(repo: Repo, id: string): Promise<ProblemRow> {
  const [p] = await repo.getProblems([id]);
  if (!p) throw new EditError("문항을 찾을 수 없습니다. 다른 곳에서 지워졌을 수 있습니다.", 404);
  return p;
}

async function siblings(repo: Repo, examId: string) {
  return (await repo.listProblems({ examId })).sort((a, b) => a.number - b.number);
}

export interface EditorData {
  id: string;
  number: number;
  answer: string;
  points: number | null;
  fp: string;
  pieces: Piece[];
  paras: ParaInfo[];
}

export async function getEditor(repo: Repo, id: string): Promise<EditorData> {
  const p = await loadProblem(repo, id);
  const xml = p.problemXmlWithSolution;
  return { id, number: p.number, answer: p.answer, points: p.points, fp: fingerprint(xml), pieces: listPieces(xml), paras: listParas(xml) };
}

function checkFp(p: ProblemRow, fp: unknown) {
  if (typeof fp === "string" && fp && fp !== fingerprint(p.problemXmlWithSolution))
    throw new EditError("그 사이에 이 문항이 바뀌었습니다. 새로고침한 뒤 다시 고쳐 주세요.", 409, "stale");
}

/** 글자·수식·정답·배점·번호 저장 */
export async function saveContent(
  repo: Repo,
  id: string,
  body: { fp?: string; edits?: Record<string, string>; answer?: string; points?: number | null; number?: number; swap?: boolean }
) {
  const p = await loadProblem(repo, id);
  const patch: Parameters<Repo["updateProblem"]>[1] = {};

  const edits = Object.fromEntries(Object.entries(body.edits ?? {}).map(([k, v]) => [Number(k), String(v)]));
  if (Object.keys(edits).length) {
    checkFp(p, body.fp);
    const { xml, changed } = applyEdits(p.problemXmlWithSolution, edits);
    if (changed) {
      const { ctx, fmt } = await examContext(repo, p.examId);
      Object.assign(patch, { problemXmlWithSolution: xml, ...derive(xml, ctx, !fmt.problemStyleId) });
    }
  }
  if (body.answer !== undefined && body.answer.trim() !== p.answer) patch.answer = body.answer.trim();
  if (body.points !== undefined && body.points !== p.points) patch.points = body.points;

  // 번호: 이미 있는 번호면 두 문항 번호를 맞바꿈 (확인 받은 경우만)
  let renumber: { id: string; number: number }[] | null = null;
  if (body.number !== undefined && body.number !== p.number) {
    const n = body.number;
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new EditError("번호는 1~99 사이 정수여야 합니다");
    const other = (await siblings(repo, p.examId)).find((x) => x.number === n && x.id !== id);
    if (other && !body.swap) throw new EditError(`${n}번 문항이 이미 있습니다. 두 문항의 번호를 맞바꿀까요?`, 409, "swap");
    renumber = other ? [{ id, number: n }, { id: other.id, number: p.number }] : [{ id, number: n }];
  }

  if (Object.keys(patch).length) await repo.updateProblem(id, patch);
  if (renumber) await repo.setNumbers(p.examId, renumber);
  return { changed: Object.keys(patch).length > 0 || !!renumber };
}

/** index번째 문단부터 새 문항으로 떼어 냄 → 새 문항은 바로 다음 번호, 뒤 문항 번호는 하나씩 밀림 */
export async function splitAt(repo: Repo, id: string, body: { fp?: string; index: number }) {
  const p = await loadProblem(repo, id);
  checkFp(p, body.fp);
  const { ctx, fmt } = await examContext(repo, p.examId);
  const [ax, bx] = splitProblem(p.problemXmlWithSolution, Number(body.index), fmt, p.number + 1);
  const typed = !fmt.problemStyleId;
  const da = derive(ax, ctx, typed);
  const db = derive(bx, ctx, typed);
  // 정답은 해설(미주)을 따라감. 해설이 없는 형식이면 앞 문항에 남김
  const solInB = db.solutionBlocks.length > 0 && da.solutionBlocks.length === 0;

  const later = (await siblings(repo, p.examId)).filter((x) => x.number > p.number);
  if (later.length) await repo.setNumbers(p.examId, later.map((x) => ({ id: x.id, number: x.number + 1 })));
  await repo.updateProblem(id, { problemXmlWithSolution: ax, ...da, answer: solInB ? "" : p.answer });
  const newId = await repo.createProblem(
    p.examId,
    {
      number: p.number + 1, answer: solInB ? p.answer || answerFromSolution(db.solutionBlocks) : "", problemXml: "", solutionXml: "",
      problemXmlWithSolution: bx, ...db, points: null,
    },
    { mainUnit: null, tagIds: [], tagStatus: "draft" }
  );
  return { newId };
}

/**
 * 문항 하나 영구 삭제 → 뒤 문항 번호를 하나씩 당김.
 * 이 문항만 쓰던 그림 파일도 지움 (다른 문항·머리 장식·양식 파일이 쓰는 그림은 남김)
 */
export async function deleteOne(repo: Repo, id: string) {
  const p = await loadProblem(repo, id);
  const all = await siblings(repo, p.examId);
  if (all.length <= 1) throw new EditError("회차에 남은 문항이 이것 하나뿐입니다. 회차 전체를 지우려면 '이 회차 삭제'를 써 주세요.");

  // 지울 그림 후보: 이 문항만 쓰는 그림
  const mine = new Set([...p.images, ...p.solutionImages]);
  let unused: string[] = [];
  if (mine.size) {
    const exam = await repo.getExam(p.examId);
    const zip = await JSZip.loadAsync(await repo.getExamFile(p.examId));
    const header = (await zip.file("Contents/header.xml")?.async("string")) ?? "";
    const others = await repo.getProblems(all.filter((x) => x.id !== id).map((x) => x.id));
    const used = new Set<string>();
    for (const src of [header, exam?.sectionHead ?? "", exam?.sectionTail ?? "", exam?.shellRunsXml ?? "", ...others.map((o) => o.problemXmlWithSolution)])
      for (const m of src.matchAll(/binaryItemIDRef="([^"]+)"/g)) used.add(m[1]);
    for (const o of others) for (const b of [...o.images, ...o.solutionImages]) used.add(b);
    unused = [...mine].filter((b) => !used.has(b));
  }

  await repo.deleteProblem(id); // 태그 연결은 DB가 함께 지움
  const later = all.filter((x) => x.number > p.number);
  if (later.length) await repo.setNumbers(p.examId, later.map((x) => ({ id: x.id, number: x.number - 1 })));
  // 그림 정리는 실패해도 삭제 자체는 끝난 것으로 봄 (남은 파일은 용량만 차지)
  let images = 0;
  if (unused.length) images = await repo.removeExamImages(p.examId, unused).catch(() => 0);
  return { deletedNumber: p.number, images };
}

/** 바로 다음 번호 문항을 이 문항 뒤에 붙임 → 다음 문항은 없어지고 그 뒤 번호가 하나씩 당겨짐 */
export async function mergeNext(repo: Repo, id: string, body: { fp?: string }) {
  const a = await loadProblem(repo, id);
  checkFp(a, body.fp);
  const all = await siblings(repo, a.examId);
  const nextS = all.find((x) => x.number > a.number);
  if (!nextS) throw new EditError("이 회차의 마지막 문항이라 합칠 다음 문항이 없습니다");
  const b = await loadProblem(repo, nextS.id);
  const { ctx, fmt } = await examContext(repo, a.examId);
  const xml = mergeProblems(a.problemXmlWithSolution, b.problemXmlWithSolution, fmt);
  const d = derive(xml, ctx, !fmt.problemStyleId);

  await repo.updateProblem(a.id, {
    problemXmlWithSolution: xml, ...d,
    answer: a.answer || b.answer,
    points: a.points ?? b.points,
    mainUnit: a.mainUnit ?? b.mainUnit,
    tagIds: [...new Set([...a.tagIds, ...b.tagIds])],
    tagStatus: a.tagStatus === "confirmed" && b.tagStatus === "confirmed" ? "confirmed" : "draft",
  });
  await repo.deleteProblem(b.id);
  const later = all.filter((x) => x.number > b.number);
  if (later.length) await repo.setNumbers(a.examId, later.map((x) => ({ id: x.id, number: x.number - 1 })));
  return { removedId: b.id, removedNumber: b.number };
}
