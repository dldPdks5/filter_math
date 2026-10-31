// 로컬 테스트용 저장소: .data/db.json + .data/files/
// Supabase 연결 전 개발·테스트용. Vercel에서는 파일이 유지되지 않으므로 배포에는 쓰지 않는다.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import taxJson from "../../data/taxonomy.json";
import { taxonomyFromJson } from "./seed";
import {
  Repo, Taxonomy, ExamRow, ExamInput, ProblemInput, ProblemRow, ProblemSummary, ProblemFilter, TagUpdate, ImageInput, TaxTag, matchFilter,
  Worksheet, WorksheetInput, StoredFile, BackupProblem, BackupTaxonomy, BackupExam, taxonomyToBackup,
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
    id: p.id, examId: p.examId, examTitle: e.title, curriculum: e.curriculum, number: p.number, answer: p.answer, points: p.points ?? null,
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
      await fs.writeFile(path.join(dir, "template.hwpx"), file);
      for (const im of images) {
        await fs.writeFile(path.join(dir, im.fileName), im.data);
        db.images[`${id}/${im.binId}`] = { file: path.join("files", id, im.fileName), mime: im.mime };
      }
      db.exams.push({ ...exam, id, filePath: path.join("files", id, "template.hwpx"), createdAt: new Date().toISOString(), problemCount: problems.length });
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
      if (u.points !== undefined) p.points = u.points;
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

  // ── 회차 삭제·문항 수정
  deleteExam(id) {
    return serial(async () => {
      const db = await load();
      const e = db.exams.find((x) => x.id === id);
      if (!e) throw new Error("회차를 찾을 수 없습니다");
      const files = new Set<string>([e.filePath]);
      for (const [k, v] of Object.entries(db.images)) if (k.startsWith(id + "/")) { files.add(v.file); delete db.images[k]; }
      db.exams = db.exams.filter((x) => x.id !== id);
      db.problems = db.problems.filter((p) => p.examId !== id);
      await save(db);
      for (const f of files) await fs.rm(path.join(ROOT, f), { force: true });
      await fs.rm(path.join(ROOT, "files", id), { recursive: true, force: true });
      return { files: files.size };
    });
  },
  updateProblem(id, patch) {
    return serial(async () => {
      const db = await load();
      const p = db.problems.find((x) => x.id === id);
      if (!p) throw new Error("문항을 찾을 수 없습니다");
      const { tagIds, ...rest } = patch;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) (p as any)[k] = v;
      if (tagIds) p.tagIds = [...new Set(tagIds)];
      await save(db);
    });
  },
  createProblem(examId, input, meta) {
    return serial(async () => {
      const db = await load();
      const id = crypto.randomUUID();
      db.problems.push({ ...input, id, examId, mainUnit: meta.mainUnit, tagStatus: meta.tagStatus, tagIds: [...new Set(meta.tagIds)] });
      await save(db);
      return id;
    });
  },
  deleteProblem(id) {
    return serial(async () => {
      const db = await load();
      db.problems = db.problems.filter((p) => p.id !== id);
      await save(db);
    });
  },
  removeExamImages(examId, binIds) {
    return serial(async () => {
      const db = await load();
      let n = 0;
      for (const b of binIds) {
        const im = db.images[`${examId}/${b}`];
        if (!im) continue;
        await fs.rm(path.join(ROOT, im.file), { force: true });
        delete db.images[`${examId}/${b}`];
        n++;
      }
      await save(db);
      return n;
    });
  },
  setNumbers(examId, list) {
    return serial(async () => {
      const db = await load();
      for (const { id, number } of list) {
        const p = db.problems.find((x) => x.id === id && x.examId === examId);
        if (p) p.number = number;
      }
      const nums = db.problems.filter((p) => p.examId === examId).map((p) => p.number);
      if (new Set(nums).size !== nums.length) throw new Error("문항 번호가 겹칩니다");
      await save(db);
    });
  },

  // ── 저장 공간 관리·백업
  async listFiles() {
    const out: StoredFile[] = [];
    const walk = async (rel: string) => {
      let ents: import("node:fs").Dirent[] = [];
      try { ents = await fs.readdir(path.join(ROOT, rel), { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const r = path.join(rel, e.name);
        if (e.isDirectory()) await walk(r);
        else out.push({ path: r, size: (await fs.stat(path.join(ROOT, r))).size });
      }
    };
    await walk("files");
    return out;
  },
  async readFile(p) {
    return new Uint8Array(await fs.readFile(path.join(ROOT, p)));
  },
  async writeFile(p, data) {
    await fs.mkdir(path.dirname(path.join(ROOT, p)), { recursive: true });
    await fs.writeFile(path.join(ROOT, p), data);
  },
  async deleteFiles(paths) {
    for (const p of paths) {
      if (!p.startsWith("files" + path.sep) && !p.startsWith("files/")) throw new Error("files 폴더 밖은 지울 수 없습니다");
      await fs.rm(path.join(ROOT, p), { force: true });
    }
  },
  examFilePath(examId, name) {
    return path.join("files", examId, name);
  },
  setExamFilePath(examId, p) {
    return serial(async () => {
      const db = await load();
      const e = db.exams.find((x) => x.id === examId);
      if (e) e.filePath = p;
      await save(db);
    });
  },
  async examImages(examId) {
    const db = await load();
    return Object.entries(db.images)
      .filter(([k]) => k.startsWith(examId + "/"))
      .map(([k, v]) => ({ binId: k.slice(examId.length + 1), path: v.file, mime: v.mime }));
  },
  async countRedundantXml() {
    return (await load()).problems.filter((p) => p.problemXml || p.solutionXml).length;
  },
  clearRedundantXml() {
    return serial(async () => {
      const db = await load();
      let n = 0;
      for (const p of db.problems) if (p.problemXml || p.solutionXml) { p.problemXml = ""; p.solutionXml = ""; n++; }
      await save(db);
      return n;
    });
  },
  async dumpProblems(examId) {
    const db = await load();
    const { ref } = taxonomyToBackup(db.taxonomy);
    return db.problems
      .filter((p) => p.examId === examId)
      .map((p): BackupProblem => ({
        id: p.id, number: p.number, answer: p.answer, points: p.points ?? null, mainUnit: p.mainUnit, tagStatus: p.tagStatus,
        tags: p.tagIds.map((t) => ref.get(t)).filter((x): x is string => !!x),
        problemXmlWithSolution: p.problemXmlWithSolution, problemBlocks: p.problemBlocks, solutionBlocks: p.solutionBlocks,
        images: p.images, solutionImages: p.solutionImages,
      }));
  },
  restoreTaxonomy(t: BackupTaxonomy) {
    return serial(async () => {
      const db = await load();
      const tx = db.taxonomy;
      for (const u of t.units) if (!tx.units.some((x) => x.key === u.key)) tx.units.push(u);
      for (const s of t.sections)
        if (!tx.sections.some((x) => x.unitKey === s.unitKey && x.key === s.key))
          tx.sections.push({ ...s, id: Math.max(0, ...tx.sections.map((x) => x.id)) + 1 });
      for (const g of t.tags) {
        const sec = tx.sections.find((x) => x.unitKey === g.unitKey && x.key === g.sectionKey);
        if (sec && !tx.tags.some((x) => x.sectionId === sec.id && x.name === g.name))
          tx.tags.push({ id: Math.max(0, ...tx.tags.map((x) => x.id)) + 1, sectionId: sec.id, name: g.name, sort: g.sort });
      }
      for (const sj of t.subjects) if (!tx.subjects.some((x) => x.id === sj.id)) tx.subjects.push(sj);
      await save(db);
    });
  },
  restoreExam(e: BackupExam, filePath, images) {
    return serial(async () => {
      const db = await load();
      if (db.exams.some((x) => x.id === e.id)) return;
      const { template: _t, images: _i, ...row } = e;
      db.exams.push({ ...row, filePath, problemCount: 0 });
      for (const im of images) db.images[`${e.id}/${im.binId}`] = { file: im.path, mime: im.mime };
      await save(db);
    });
  },
  restoreProblems(examId, problems) {
    return serial(async () => {
      const db = await load();
      const { ref } = taxonomyToBackup(db.taxonomy);
      const byRef = new Map([...ref.entries()].map(([id, r]) => [r, id]));
      const missingTags: string[] = [];
      let added = 0;
      for (const p of problems) {
        if (db.problems.some((x) => x.id === p.id)) continue;
        const tagIds = p.tags.map((r) => { const id = byRef.get(r); if (!id) missingTags.push(r); return id; }).filter((x): x is number => !!x);
        db.problems.push({
          id: p.id, examId, number: p.number, answer: p.answer, points: p.points, mainUnit: p.mainUnit, tagStatus: p.tagStatus, tagIds,
          problemXml: "", problemXmlWithSolution: p.problemXmlWithSolution, solutionXml: "", problemBlocks: p.problemBlocks,
          solutionBlocks: p.solutionBlocks, images: p.images, solutionImages: p.solutionImages,
        });
        added++;
      }
      await save(db);
      return { added, missingTags };
    });
  },
  restoreWorksheet(w) {
    return serial(async () => {
      const db = await load();
      db.worksheets ??= [];
      if (db.worksheets.some((x) => x.id === w.id)) return false;
      db.worksheets.push(w);
      await save(db);
      return true;
    });
  },
};
