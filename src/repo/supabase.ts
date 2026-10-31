// Supabase 저장소 (DB: supabase/schema.sql, 파일: Storage 'exams' 비공개 버킷)
// 로그인한 사용자의 세션으로 접근하므로 RLS 정책이 그대로 적용된다.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Repo, Taxonomy, ExamRow, ExamInput, ProblemInput, ProblemRow, ProblemSummary, ProblemFilter, TagUpdate, ImageInput, matchFilter,
  Worksheet, WorksheetInput, StoredFile, BackupProblem, BackupTaxonomy, BackupExam, taxonomyToBackup,
} from "./types";

function wsFromRow(r: any): Worksheet {
  return { id: r.id, title: r.title, problemIds: r.problem_ids ?? [], options: { answers: r.options?.answers ?? "none", showSource: !!r.options?.showSource }, createdAt: r.created_at, updatedAt: r.updated_at };
}

const BUCKET = "exams";

function examFromRow(r: any, count = 0): ExamRow {
  return {
    id: r.id, title: r.title, curriculum: r.curriculum, sourceRaw: r.source_raw ?? "", headerTitleText: r.header_title_text ?? "",
    problemStyleId: r.problem_style_id ?? "", sectionHead: r.section_head ?? "", sectionTail: r.section_tail ?? "",
    shellRunsXml: r.shell_runs_xml ?? "", columnWidth: r.column_width ?? 0, binData: r.bin_data ?? {}, filePath: r.file_path,
    createdAt: r.created_at, problemCount: r.problems?.[0]?.count ?? count,
  };
}

const SUMMARY_BASE = "id, exam_id, number, answer, main_unit, tag_status, problem_blocks, solution_blocks, problem_tags(tag_id), exams!inner(title, curriculum)";
// points 칸은 003_points.sql 실행 후 생김 — 실행 전에도 앱이 멈추지 않도록 없으면 빼고 다시 조회
let hasPoints = true;
const cols = () => (hasPoints ? SUMMARY_BASE + ", points" : SUMMARY_BASE);
const missingPoints = (e: any) => !!e && /points/.test(String(e.message ?? ""));

function summaryFromRow(r: any): ProblemSummary {
  return {
    id: r.id, examId: r.exam_id, examTitle: r.exams.title, curriculum: r.exams.curriculum, number: r.number, answer: r.answer ?? "",
    points: r.points ?? null,
    mainUnit: r.main_unit, tagStatus: r.tag_status, tagIds: (r.problem_tags ?? []).map((t: any) => Number(t.tag_id)),
    problemBlocks: r.problem_blocks, solutionBlocks: r.solution_blocks,
  };
}

function check<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function supabaseRepo(sb: SupabaseClient): Repo {
  return {
    mode: "supabase",
    async getTaxonomy(): Promise<Taxonomy> {
      const [u, s, t, sub] = await Promise.all([
        sb.from("units").select("*").order("sort"),
        sb.from("sections").select("*").order("sort"),
        sb.from("tags").select("*").order("sort"),
        sb.from("subjects").select("*").order("sort"),
      ]);
      return {
        units: check(u).map((r: any) => ({ key: r.key, name: r.name, sort: r.sort })),
        sections: check(s).map((r: any) => ({ id: Number(r.id), unitKey: r.unit_key, key: r.key, name: r.name, sort: r.sort, verify: r.verify })),
        tags: check(t).map((r: any) => ({ id: Number(r.id), sectionId: Number(r.section_id), name: r.name, sort: r.sort })),
        subjects: check(sub).map((r: any) => ({ id: r.id, curriculum: r.curriculum, name: r.name, unitKeys: r.unit_keys, sort: r.sort })),
      };
    },
    async addTag(sectionId, name) {
      const { count } = await sb.from("tags").select("id", { count: "exact", head: true }).eq("section_id", sectionId);
      const r: any = check(
        await sb.from("tags").upsert({ section_id: sectionId, name, sort: count ?? 0 }, { onConflict: "section_id,name" }).select().single()
      );
      return { id: Number(r.id), sectionId: Number(r.section_id), name: r.name, sort: r.sort };
    },
    async listExams() {
      const rows = check(await sb.from("exams").select("*, problems(count)").order("created_at", { ascending: false }));
      return (rows as any[]).map((r) => examFromRow(r));
    },
    async getExam(id) {
      const r = check(await sb.from("exams").select("*, problems(count)").eq("id", id).maybeSingle());
      return r ? examFromRow(r) : null;
    },
    async saveExam(exam: ExamInput, problems: ProblemInput[], file: Uint8Array, images: ImageInput[]) {
      const id = crypto.randomUUID();
      const filePath = `${id}/template.hwpx`; // 양식 파일 (그림·본문 제외)
      check(await sb.storage.from(BUCKET).upload(filePath, file, { contentType: "application/hwp+zip" }));
      for (const im of images) check(await sb.storage.from(BUCKET).upload(`${id}/${im.fileName}`, im.data, { contentType: im.mime }));
      check(
        await sb.from("exams").insert({
          id, title: exam.title, curriculum: exam.curriculum, source_raw: exam.sourceRaw, header_title_text: exam.headerTitleText,
          problem_style_id: exam.problemStyleId, section_head: exam.sectionHead, section_tail: exam.sectionTail,
          shell_runs_xml: exam.shellRunsXml, column_width: exam.columnWidth, bin_data: exam.binData, file_path: filePath,
          image_files: Object.fromEntries(images.map((im) => [im.binId, { file: `${id}/${im.fileName}`, mime: im.mime }])),
        })
      );
      const rows = problems.map((p) => ({
        exam_id: id, number: p.number, answer: p.answer, problem_xml: p.problemXml, problem_xml_sol: p.problemXmlWithSolution,
        solution_xml: p.solutionXml || null, problem_blocks: p.problemBlocks, solution_blocks: p.solutionBlocks, images: p.images,
        solution_images: p.solutionImages, ...(hasPoints ? { points: p.points } : {}),
      }));
      let ins = await sb.from("problems").insert(rows);
      if (missingPoints(ins.error)) {
        hasPoints = false;
        ins = await sb.from("problems").insert(rows.map(({ points: _p, ...r }: any) => r));
      }
      check(ins);
      return id;
    },
    async listProblems(f: ProblemFilter) {
      const run = () => {
        let q = sb.from("problems").select(cols());
        if (f.examId) q = q.eq("exam_id", f.examId);
        if (f.status) q = q.eq("tag_status", f.status);
        if (f.curriculum) q = q.eq("exams.curriculum", f.curriculum);
        return q.order("number");
      };
      let res = await run();
      if (missingPoints(res.error) && hasPoints) { hasPoints = false; res = await run(); }
      const rows = check(res) as any[];
      const tax = await this.getTaxonomy();
      const secUnit = new Map(tax.sections.map((s) => [s.id, s.unitKey]));
      const tagUnit = new Map(tax.tags.map((t) => [t.id, secUnit.get(t.sectionId)!]));
      return rows
        .map(summaryFromRow)
        .filter((p) => matchFilter(p, f, tagUnit))
        .sort((a, b) => (a.examTitle === b.examTitle ? a.number - b.number : a.examTitle.localeCompare(b.examTitle, "ko")));
    },
    async getProblems(ids) {
      if (!ids.length) return [];
      const run = () => sb.from("problems").select(`${cols()}, problem_xml, problem_xml_sol, solution_xml, images, solution_images`).in("id", ids);
      let res = await run();
      if (missingPoints(res.error) && hasPoints) { hasPoints = false; res = await run(); }
      const rows = check(res) as any[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r: any) => ({
          ...summaryFromRow(r),
          problemXml: r.problem_xml, problemXmlWithSolution: r.problem_xml_sol, solutionXml: r.solution_xml ?? "",
          images: r.images ?? [], solutionImages: r.solution_images ?? [],
        })) as ProblemRow[];
    },
    async setProblemTags(id: string, u: TagUpdate) {
      const upd: Record<string, unknown> = { main_unit: u.mainUnit, tag_status: u.tagStatus };
      if (u.points !== undefined && hasPoints) upd.points = u.points;
      let r = await sb.from("problems").update(upd).eq("id", id);
      if (missingPoints(r.error)) { hasPoints = false; delete upd.points; r = await sb.from("problems").update(upd).eq("id", id); }
      check(r);
      check(await sb.from("problem_tags").delete().eq("problem_id", id));
      const ids = [...new Set(u.tagIds)];
      if (ids.length) check(await sb.from("problem_tags").insert(ids.map((tag_id) => ({ problem_id: id, tag_id }))));
    },
    async getImage(examId, binId) {
      const e: any = check(await sb.from("exams").select("image_files").eq("id", examId).maybeSingle());
      const im = e?.image_files?.[binId];
      if (!im) return null;
      const blob = check(await sb.storage.from(BUCKET).download(im.file)) as Blob;
      return { data: new Uint8Array(await blob.arrayBuffer()), mime: im.mime };
    },
    async getExamFile(examId) {
      const e: any = check(await sb.from("exams").select("file_path").eq("id", examId).single());
      const blob = check(await sb.storage.from(BUCKET).download(e.file_path)) as Blob;
      return new Uint8Array(await blob.arrayBuffer());
    },
    async listWorksheets() {
      return (check(await sb.from("worksheets").select("*").order("updated_at", { ascending: false })) as any[]).map(wsFromRow);
    },
    async getWorksheet(id) {
      const r = check(await sb.from("worksheets").select("*").eq("id", id).maybeSingle());
      return r ? wsFromRow(r) : null;
    },
    async saveWorksheet(w: WorksheetInput) {
      const row = { title: w.title, problem_ids: w.problemIds, options: w.options, updated_at: new Date().toISOString() };
      if (w.id) {
        check(await sb.from("worksheets").update(row).eq("id", w.id));
        return w.id;
      }
      const r: any = check(await sb.from("worksheets").insert(row).select("id").single());
      return r.id;
    },
    async deleteWorksheet(id) {
      check(await sb.from("worksheets").delete().eq("id", id));
    },

    // ── 회차 삭제·문항 수정
    async deleteExam(id) {
      const e: any = check(await sb.from("exams").select("file_path, image_files").eq("id", id).maybeSingle());
      if (!e) throw new Error("회차를 찾을 수 없습니다");
      // 지울 파일: 양식 파일 + 그림 + 회차 폴더 안에 남은 파일
      const files = new Set<string>([e.file_path, ...Object.values(e.image_files ?? {}).map((v: any) => v.file)]);
      const walk = async (prefix: string) => {
        for (let offset = 0; ; offset += 1000) {
          const items = check(await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset })) as any[];
          for (const it of items) {
            const full = `${prefix}/${it.name}`;
            if (it.id === null) await walk(full);
            else files.add(full);
          }
          if (items.length < 1000) break;
        }
      };
      await walk(id);
      // 회차 행을 지우면 문항·태그 연결은 DB가 함께 지움 (on delete cascade)
      check(await sb.from("exams").delete().eq("id", id));
      const list = [...files].filter(Boolean);
      for (let i = 0; i < list.length; i += 100) check(await sb.storage.from(BUCKET).remove(list.slice(i, i + 100)));
      return { files: list.length };
    },
    async updateProblem(id, patch) {
      const upd: Record<string, unknown> = {};
      if (patch.number !== undefined) upd.number = patch.number;
      if (patch.answer !== undefined) upd.answer = patch.answer;
      if (patch.points !== undefined && hasPoints) upd.points = patch.points;
      if (patch.problemXmlWithSolution !== undefined) upd.problem_xml_sol = patch.problemXmlWithSolution;
      if (patch.problemBlocks !== undefined) upd.problem_blocks = patch.problemBlocks;
      if (patch.solutionBlocks !== undefined) upd.solution_blocks = patch.solutionBlocks;
      if (patch.images !== undefined) upd.images = patch.images;
      if (patch.solutionImages !== undefined) upd.solution_images = patch.solutionImages;
      if (patch.mainUnit !== undefined) upd.main_unit = patch.mainUnit;
      if (patch.tagStatus !== undefined) upd.tag_status = patch.tagStatus;
      if (Object.keys(upd).length) {
        let r = await sb.from("problems").update(upd).eq("id", id);
        if (missingPoints(r.error)) { hasPoints = false; delete upd.points; r = await sb.from("problems").update(upd).eq("id", id); }
        check(r);
      }
      if (patch.tagIds) {
        check(await sb.from("problem_tags").delete().eq("problem_id", id));
        const ids = [...new Set(patch.tagIds)];
        if (ids.length) check(await sb.from("problem_tags").insert(ids.map((tag_id) => ({ problem_id: id, tag_id }))));
      }
    },
    async createProblem(examId, p, meta) {
      const row: Record<string, unknown> = {
        exam_id: examId, number: p.number, answer: p.answer, problem_xml: "", problem_xml_sol: p.problemXmlWithSolution, solution_xml: null,
        problem_blocks: p.problemBlocks, solution_blocks: p.solutionBlocks, images: p.images, solution_images: p.solutionImages,
        main_unit: meta.mainUnit, tag_status: meta.tagStatus, ...(hasPoints ? { points: p.points } : {}),
      };
      let ins = await sb.from("problems").insert(row).select("id").single();
      if (missingPoints(ins.error)) { hasPoints = false; delete row.points; ins = await sb.from("problems").insert(row).select("id").single(); }
      const id = (check(ins) as any).id as string;
      const ids = [...new Set(meta.tagIds)];
      if (ids.length) check(await sb.from("problem_tags").insert(ids.map((tag_id) => ({ problem_id: id, tag_id }))));
      return id;
    },
    async deleteProblem(id) {
      check(await sb.from("problems").delete().eq("id", id));
    },
    async setNumbers(examId, list) {
      // (회차, 번호)는 겹칠 수 없어서 먼저 음수 임시 번호로 옮긴 뒤 새 번호로
      for (let i = 0; i < list.length; i++) check(await sb.from("problems").update({ number: -(i + 1) }).eq("id", list[i].id).eq("exam_id", examId));
      for (const { id, number } of list) check(await sb.from("problems").update({ number }).eq("id", id).eq("exam_id", examId));
    },

    // ── 저장 공간 관리·백업
    async listFiles() {
      const out: StoredFile[] = [];
      const walk = async (prefix: string) => {
        for (let offset = 0; ; offset += 1000) {
          const items = check(await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset })) as any[];
          for (const it of items) {
            const full = prefix ? `${prefix}/${it.name}` : it.name;
            if (it.id === null) await walk(full); // 폴더
            else out.push({ path: full, size: Number(it.metadata?.size ?? 0) });
          }
          if (items.length < 1000) break;
        }
      };
      await walk("");
      return out;
    },
    async readFile(path) {
      const blob = check(await sb.storage.from(BUCKET).download(path)) as Blob;
      return new Uint8Array(await blob.arrayBuffer());
    },
    async writeFile(path, data, mime) {
      check(await sb.storage.from(BUCKET).upload(path, data, { contentType: mime, upsert: true }));
    },
    async deleteFiles(paths) {
      for (let i = 0; i < paths.length; i += 100) check(await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
    },
    examFilePath(examId, name) {
      return `${examId}/${name}`;
    },
    async setExamFilePath(examId, path) {
      check(await sb.from("exams").update({ file_path: path }).eq("id", examId));
    },
    async examImages(examId) {
      const e: any = check(await sb.from("exams").select("image_files").eq("id", examId).single());
      return Object.entries(e.image_files ?? {}).map(([binId, v]: [string, any]) => ({ binId, path: v.file, mime: v.mime }));
    },
    async countRedundantXml() {
      const a = check(await sb.from("problems").select("id").neq("problem_xml", "")) as any[];
      const b = check(await sb.from("problems").select("id").not("solution_xml", "is", null)) as any[];
      return new Set([...a, ...b].map((r) => r.id)).size;
    },
    async clearRedundantXml() {
      const n = await this.countRedundantXml();
      check(await sb.from("problems").update({ problem_xml: "" }).neq("problem_xml", ""));
      check(await sb.from("problems").update({ solution_xml: null }).not("solution_xml", "is", null));
      return n;
    },
    async dumpProblems(examId) {
      const { ref } = taxonomyToBackup(await this.getTaxonomy());
      const rows = check(
        await sb.from("problems").select(`id, number, answer, ${hasPoints ? "points, " : ""}main_unit, tag_status, problem_xml_sol, problem_blocks, solution_blocks, images, solution_images, problem_tags(tag_id)`).eq("exam_id", examId).order("number")
      ) as any[];
      return rows.map((r): BackupProblem => ({
        id: r.id, number: r.number, answer: r.answer ?? "", points: r.points ?? null, mainUnit: r.main_unit, tagStatus: r.tag_status,
        tags: (r.problem_tags ?? []).map((t: any) => ref.get(Number(t.tag_id))).filter(Boolean),
        problemXmlWithSolution: r.problem_xml_sol, problemBlocks: r.problem_blocks, solutionBlocks: r.solution_blocks,
        images: r.images ?? [], solutionImages: r.solution_images ?? [],
      }));
    },
    async restoreTaxonomy(t: BackupTaxonomy) {
      check(await sb.from("units").upsert(t.units, { onConflict: "key", ignoreDuplicates: true }));
      check(await sb.from("sections").upsert(t.sections.map((x) => ({ unit_key: x.unitKey, key: x.key, name: x.name, sort: x.sort, verify: x.verify ?? null })), { onConflict: "unit_key,key", ignoreDuplicates: true }));
      const secs = check(await sb.from("sections").select("id, unit_key, key")) as any[];
      const secId = new Map(secs.map((x) => [`${x.unit_key}|${x.key}`, Number(x.id)]));
      const tagRows = t.tags.map((g) => ({ section_id: secId.get(`${g.unitKey}|${g.sectionKey}`), name: g.name, sort: g.sort })).filter((g) => g.section_id);
      for (let i = 0; i < tagRows.length; i += 500) check(await sb.from("tags").upsert(tagRows.slice(i, i + 500), { onConflict: "section_id,name", ignoreDuplicates: true }));
      check(await sb.from("subjects").upsert(t.subjects.map((x) => ({ id: x.id, curriculum: x.curriculum, name: x.name, unit_keys: x.unitKeys, sort: x.sort })), { onConflict: "id", ignoreDuplicates: true }));
    },
    async restoreExam(e: BackupExam, filePath, images) {
      const ex = check(await sb.from("exams").select("id").eq("id", e.id).maybeSingle());
      if (ex) return;
      check(
        await sb.from("exams").insert({
          id: e.id, title: e.title, curriculum: e.curriculum, source_raw: e.sourceRaw, header_title_text: e.headerTitleText,
          problem_style_id: e.problemStyleId, section_head: e.sectionHead, section_tail: e.sectionTail, shell_runs_xml: e.shellRunsXml,
          column_width: e.columnWidth, bin_data: e.binData, file_path: filePath, created_at: e.createdAt,
          image_files: Object.fromEntries(images.map((im) => [im.binId, { file: im.path, mime: im.mime }])),
        })
      );
    },
    async restoreProblems(examId, problems) {
      const { ref } = taxonomyToBackup(await this.getTaxonomy());
      const byRef = new Map([...ref.entries()].map(([id, r]) => [r, id]));
      const existing = new Set((check(await sb.from("problems").select("id").eq("exam_id", examId)) as any[]).map((r) => r.id));
      const fresh = problems.filter((p) => !existing.has(p.id));
      const missingTags: string[] = [];
      if (fresh.length) {
        const rows = fresh.map((p) => ({
          id: p.id, exam_id: examId, number: p.number, answer: p.answer, main_unit: p.mainUnit, tag_status: p.tagStatus,
          problem_xml: "", problem_xml_sol: p.problemXmlWithSolution, solution_xml: null, problem_blocks: p.problemBlocks,
          solution_blocks: p.solutionBlocks, images: p.images, solution_images: p.solutionImages, ...(hasPoints ? { points: p.points } : {}),
        }));
        let ins = await sb.from("problems").insert(rows);
        if (missingPoints(ins.error)) { hasPoints = false; ins = await sb.from("problems").insert(rows.map(({ points: _p, ...r }: any) => r)); }
        check(ins);
        const links = fresh.flatMap((p) => p.tags.map((r) => { const id = byRef.get(r); if (!id) missingTags.push(r); return id ? { problem_id: p.id, tag_id: id } : null; }).filter(Boolean));
        if (links.length) check(await sb.from("problem_tags").insert(links as any[]));
      }
      return { added: fresh.length, missingTags };
    },
    async restoreWorksheet(w) {
      const ex = check(await sb.from("worksheets").select("id").eq("id", w.id).maybeSingle());
      if (ex) return false;
      check(await sb.from("worksheets").insert({ id: w.id, title: w.title, problem_ids: w.problemIds, options: w.options, created_at: w.createdAt, updated_at: w.updatedAt }));
      return true;
    },
  };
}
