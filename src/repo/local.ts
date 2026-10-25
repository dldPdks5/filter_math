// 로컬 테스트용 저장소: .data/db.json + .data/files/
// Supabase 연결 전 개발·테스트용. Vercel에서는 파일이 유지되지 않으므로 배포에는 쓰지 않는다.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import taxJson from "../../data/taxonomy.json";
import { taxonomyFromJson } from "./seed";
import {
  Repo, Taxonomy, ExamRow, ExamInput, ProblemInput, ProblemRow, ProblemSummary, ProblemFilter, TagUpdate, ImageInput, TaxTag, matchFilter,
  Worksheet, WorksheetInput,
} from "./types";

interface Db {
  taxonomy: Taxonomy;
  exams: ExamRow[];
  problems: (ProblemInput & { id: string; examId: string; mainUnit: string | null; tagStatus: "draft" | "confirmed"; tagIds: number[] })[];
  images: Record<string, { file: string; mime: string }>; // `${examId}/${binId}`
  worksheets?: Worksheet[];
}

const ROOT = process.env.LOCAL_DATA_DIR ?? path.join(process.cwd(), ".data");
const DB = path.join(ROOT, "db.json");

let lock: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = lock.then(fn, fn);
  lock = p.catch(() => {});
  return p;
}

async function load(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(DB, "utf8"));
  } catch {
    return { taxonomy: taxonomyFromJson(taxJson as never), exams: [], problems: [], images: {} };
  }
}
async function save(db: Db) {
  await fs.mkdir(ROOT, { recursive: true });
  const tmp = DB + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db));
  await fs.rename(tmp, DB);
}

function summary(db: Db, p: Db["problems"][number]): ProblemSummary {
  const e = db.exams.find((x) => x.id === p.examId)!;
  return {
    id: p.id, examId: p.examId, examTitle: e.title, curriculum: e.curriculum, number: p.number, answer: p.answer,
    mainUnit: p.mainUnit, tagStatus: p.tagStatus, tagIds: p.tagIds, problemBlocks: p.problemBlocks, solutionBlocks: p.solutionBlocks,
  };
}

export const localRepo: Repo = {
  mode: "local",
  async getTaxonomy() {
    return (await load()).taxonomy;
  },
  addTag(sectionId, name) {
    return serial(async () => {
      const db = await load();
      const exist = db.taxonomy.tags.find((t) => t.sectionId === sectionId && t.name === name);
      if (exist) return exist;
      const tag: TaxTag = {
        id: Math.max(0, ...db.taxonomy.tags.map((t) => t.id)) + 1,
        sectionId,
        name,
        sort: db.taxonomy.tags.filter((t) => t.sectionId === sectionId).length,
      };
      db.taxonomy.tags.push(tag);
      await save(db);
      return tag;
    });
  },
  async listExams() {
    const db = await load();
    return db.exams.map((e) => ({ ...e, problemCount: db.problems.filter((p) => p.examId === e.id).length })).reverse();
  },
  async getExam(id) {
    const db = await load();
    const e = db.exams.find((x) => x.id === id);
    return e ? { ...e, problemCount: db.problems.filter((p) => p.examId === id).length } : null;
  },
  saveExam(exam: ExamInput, problems: ProblemInput[], file: Uint8Array, images: ImageInput[]) {
    return serial(async () => {
      const db = await load();
      const id = crypto.randomUUID();
      const dir = path.join(ROOT, "files", id);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "original.hwpx"), file);
      for (const im of images) {
        await fs.writeFile(path.join(dir, im.fileName), im.data);
        db.images[`${id}/${im.binId}`] = { file: path.join("files", id, im.fileName), mime: im.mime };
      }
      db.exams.push({ ...exam, id, filePath: path.join("files", id, "original.hwpx"), createdAt: new Date().toISOString(), problemCount: problems.length });
      for (const p of problems) db.problems.push({ ...p, id: crypto.randomUUID(), examId: id, mainUnit: null, tagStatus: "draft", tagIds: [] });
      await save(db);
      return id;
    });
  },
  async listProblems(f: ProblemFilter) {
    const db = await load();
    const tagUnit = new Map(db.taxonomy.tags.map((t) => [t.id, db.taxonomy.sections.find((s) => s.id === t.sectionId)!.unitKey]));
    return db.problems
      .map((p) => summary(db, p))
      .filter((p) => matchFilter(p, f, tagUnit))
      .sort((a, b) => (a.examTitle === b.examTitle ? a.number - b.number : a.examTitle.localeCompare(b.examTitle, "ko")));
  },
  async getProblems(ids) {
    const db = await load();
    return ids
      .map((id) => db.problems.find((p) => p.id === id))
      .filter((p): p is Db["problems"][number] => !!p)
      .map((p) => ({ ...p, ...summary(db, p) }) as ProblemRow);
  },
  setProblemTags(id: string, u: TagUpdate) {
    return serial(async () => {
      const db = await load();
      const p = db.problems.find((x) => x.id === id);
      if (!p) throw new Error("문항을 찾을 수 없습니다");
      p.mainUnit = u.mainUnit;
      p.tagIds = [...new Set(u.tagIds)];
      p.tagStatus = u.tagStatus;
      await save(db);
    });
  },
  async getImage(examId, binId) {
    const db = await load();
    const im = db.images[`${examId}/${binId}`];
    if (!im) return null;
    return { data: new Uint8Array(await fs.readFile(path.join(ROOT, im.file))), mime: im.mime };
  },
  async getExamFile(examId) {
    const db = await load();
    const e = db.exams.find((x) => x.id === examId);
    if (!e) throw new Error("회차를 찾을 수 없습니다");
    return new Uint8Array(await fs.readFile(path.join(ROOT, e.filePath)));
  },
  async listWorksheets() {
    const db = await load();
    return [...(db.worksheets ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async getWorksheet(id) {
    return (await load()).worksheets?.find((w) => w.id === id) ?? null;
  },
  saveWorksheet(w: WorksheetInput) {
    return serial(async () => {
      const db = await load();
      db.worksheets ??= [];
      const now = new Date().toISOString();
      const ex = w.id ? db.worksheets.find((x) => x.id === w.id) : undefined;
      if (ex) Object.assign(ex, { title: w.title, problemIds: w.problemIds, options: w.options, updatedAt: now });
      else db.worksheets.push({ ...w, id: crypto.randomUUID(), createdAt: now, updatedAt: now } as Worksheet);
      await save(db);
      return ex?.id ?? db.worksheets[db.worksheets.length - 1].id;
    });
  },
  deleteWorksheet(id) {
    return serial(async () => {
      const db = await load();
      db.worksheets = (db.worksheets ?? []).filter((w) => w.id !== id);
      await save(db);
    });
  },
};
