// Supabase 저장소 (DB: supabase/schema.sql, 파일: Storage 'exams' 비공개 버킷)
// 로그인한 사용자의 세션으로 접근하므로 RLS 정책이 그대로 적용된다.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Repo, Taxonomy, ExamRow, ExamInput, ProblemInput, ProblemRow, ProblemSummary, ProblemFilter, TagUpdate, ImageInput, matchFilter,
} from "./types";

const BUCKET = "exams";

function examFromRow(r: any, count = 0): ExamRow {
  return {
    id: r.id, title: r.title, curriculum: r.curriculum, sourceRaw: r.source_raw ?? "", headerTitleText: r.header_title_text ?? "",
    problemStyleId: r.problem_style_id ?? "", sectionHead: r.section_head ?? "", sectionTail: r.section_tail ?? "",
    shellRunsXml: r.shell_runs_xml ?? "", columnWidth: r.column_width ?? 0, binData: r.bin_data ?? {}, filePath: r.file_path,
    createdAt: r.created_at, problemCount: r.problems?.[0]?.count ?? count,
  };
}

const SUMMARY_COLS = "id, exam_id, number, answer, main_unit, tag_status, problem_blocks, solution_blocks, problem_tags(tag_id), exams!inner(title, curriculum)";

function summaryFromRow(r: any): ProblemSummary {
  return {
    id: r.id, examId: r.exam_id, examTitle: r.exams.title, curriculum: r.exams.curriculum, number: r.number, answer: r.answer ?? "",
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
      const filePath = `${id}/original.hwpx`;
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
      check(
        await sb.from("problems").insert(
          problems.map((p) => ({
            exam_id: id, number: p.number, answer: p.answer, problem_xml: p.problemXml, problem_xml_sol: p.problemXmlWithSolution,
            solution_xml: p.solutionXml, problem_blocks: p.problemBlocks, solution_blocks: p.solutionBlocks, images: p.images,
            solution_images: p.solutionImages,
          }))
        )
      );
      return id;
    },
    async listProblems(f: ProblemFilter) {
      let q = sb.from("problems").select(SUMMARY_COLS);
      if (f.examId) q = q.eq("exam_id", f.examId);
      if (f.status) q = q.eq("tag_status", f.status);
      if (f.curriculum) q = q.eq("exams.curriculum", f.curriculum);
      const rows = check(await q.order("number")) as any[];
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
      const rows = check(await sb.from("problems").select(`${SUMMARY_COLS}, problem_xml, problem_xml_sol, solution_xml, images, solution_images`).in("id", ids)) as any[];
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
      check(await sb.from("problems").update({ main_unit: u.mainUnit, tag_status: u.tagStatus }).eq("id", id));
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
  };
}
