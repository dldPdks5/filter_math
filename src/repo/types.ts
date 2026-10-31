// 저장소 공통 타입 — 로컬(JSON 파일)과 Supabase 구현이 같은 인터페이스를 따른다
import type { Block } from "../hwpx/parse";

export type Curriculum = "2015" | "2022";
export type TagStatus = "draft" | "confirmed";

export interface TaxUnit { key: string; name: string; sort: number }
export interface TaxSection { id: number; unitKey: string; key: string; name: string; sort: number; verify?: string | null }
export interface TaxTag { id: number; sectionId: number; name: string; sort: number }
export interface TaxSubject { id: string; curriculum: string; name: string; unitKeys: string[]; sort: number }
export interface Taxonomy { units: TaxUnit[]; sections: TaxSection[]; tags: TaxTag[]; subjects: TaxSubject[] }

export interface ExamInput {
  title: string;
  curriculum: Curriculum;
  sourceRaw: string;
  headerTitleText: string;
  problemStyleId: string;
  sectionHead: string;
  sectionTail: string;
  shellRunsXml: string;
  columnWidth: number;
  binData: Record<string, { path: string; mediaType: string }>;
}
export interface ExamRow extends ExamInput { id: string; filePath: string; createdAt: string; problemCount: number }

export interface ProblemInput {
  number: number;
  answer: string;
  problemXml: string;
  problemXmlWithSolution: string;
  solutionXml: string;
  problemBlocks: Block[];
  solutionBlocks: Block[];
  images: string[];
  solutionImages: string[];
  points: number | null; // 배점, 없으면 null
}
/** 목록·필터용 (XML 제외) */
export interface ProblemSummary {
  id: string;
  examId: string;
  examTitle: string;
  curriculum: Curriculum;
  number: number;
  answer: string;
  points: number | null;
  mainUnit: string | null;
  tagStatus: TagStatus;
  tagIds: number[];
  problemBlocks: Block[];
  solutionBlocks: Block[];
}
export interface ProblemRow extends ProblemSummary, ProblemInput {}

export interface ImageInput { binId: string; fileName: string; mime: string; data: Uint8Array }

export interface ProblemFilter {
  examId?: string;
  unitKeys?: string[]; // 대단원(교육과정 연결 키)
  tagIds?: number[];
  tagMode?: "any" | "all";
  mainOnly?: boolean; // 주 단원이 unitKeys인 문제만
  curriculum?: Curriculum; // '따로 보기'일 때만 지정
  status?: TagStatus;
  points?: number[]; // 고른 배점들 (0 = 배점 표기 없음)
}

/** 문항 수정 (주어진 칸만 바꿈) */
export interface ProblemPatch {
  number?: number;
  answer?: string;
  points?: number | null;
  problemXmlWithSolution?: string;
  problemBlocks?: Block[];
  solutionBlocks?: Block[];
  images?: string[];
  solutionImages?: string[];
  mainUnit?: string | null;
  tagIds?: number[];
  tagStatus?: TagStatus;
}

export interface TagUpdate { mainUnit: string | null; tagIds: number[]; tagStatus: TagStatus; points?: number | null }

export type AnswerMode = "none" | "key" | "solutions";
export interface WorksheetOptions { answers: AnswerMode; showSource: boolean }
export interface WorksheetInput { id?: string; title: string; problemIds: string[]; options: WorksheetOptions }
export interface Worksheet extends WorksheetInput { id: string; createdAt: string; updatedAt: string }

export interface Repo {
  mode: "local" | "supabase";
  getTaxonomy(): Promise<Taxonomy>;
  addTag(sectionId: number, name: string): Promise<TaxTag>;
  listExams(): Promise<ExamRow[]>;
  getExam(id: string): Promise<ExamRow | null>;
  saveExam(exam: ExamInput, problems: ProblemInput[], template: Uint8Array, images: ImageInput[]): Promise<string>; // template: 양식 HWPX
  listProblems(f: ProblemFilter): Promise<ProblemSummary[]>;
  getProblems(ids: string[]): Promise<ProblemRow[]>;
  setProblemTags(id: string, u: TagUpdate): Promise<void>;
  getImage(examId: string, binId: string): Promise<{ data: Uint8Array; mime: string } | null>;
  getExamFile(examId: string): Promise<Uint8Array>;
  listWorksheets(): Promise<Worksheet[]>;
  getWorksheet(id: string): Promise<Worksheet | null>;
  saveWorksheet(w: WorksheetInput): Promise<string>;
  deleteWorksheet(id: string): Promise<void>;

  // ── 회차 삭제·문항 수정
  deleteExam(id: string): Promise<{ files: number }>; // 회차·문항·태그 연결·저장 파일까지 영구 삭제
  updateProblem(id: string, patch: ProblemPatch): Promise<void>;
  createProblem(examId: string, p: ProblemInput, meta: { mainUnit: string | null; tagIds: number[]; tagStatus: TagStatus }): Promise<string>;
  deleteProblem(id: string): Promise<void>;
  removeExamImages(examId: string, binIds: string[]): Promise<number>; // 회차 그림 파일 지우고 목록에서 뺌 → 지운 개수
  setNumbers(examId: string, list: { id: string; number: number }[]): Promise<void>; // 번호 겹침 없이 한 번에 바꿈

  // ── 저장 공간 관리·백업용 (path는 저장소 고유 경로: Supabase는 버킷 안 경로, 로컬은 .data 기준 경로)
  listFiles(): Promise<StoredFile[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array, mime: string): Promise<void>;
  deleteFiles(paths: string[]): Promise<void>;
  examFilePath(examId: string, name: string): string; // 회차 파일을 둘 경로
  setExamFilePath(examId: string, path: string): Promise<void>;
  examImages(examId: string): Promise<{ binId: string; path: string; mime: string }[]>;
  countRedundantXml(): Promise<number>; // 지워도 되는 중복 XML이 남은 문항 수
  clearRedundantXml(): Promise<number>;
  dumpProblems(examId: string): Promise<BackupProblem[]>;
  restoreTaxonomy(t: BackupTaxonomy): Promise<void>; // 없는 단원·중단원·개념만 추가
  restoreExam(e: BackupExam, filePath: string, images: { binId: string; path: string; mime: string }[]): Promise<void>;
  restoreProblems(examId: string, problems: BackupProblem[]): Promise<{ added: number; missingTags: string[] }>;
  restoreWorksheet(w: Worksheet): Promise<boolean>; // 없을 때만 추가
}

export interface StoredFile { path: string; size: number }

// ── 백업 파일 형식 (문항창고-백업.zip 안의 backup.json, problems/<회차id>.json)
export interface BackupTaxonomy {
  units: { key: string; name: string; sort: number }[];
  sections: { unitKey: string; key: string; name: string; sort: number; verify?: string | null }[];
  tags: { unitKey: string; sectionKey: string; name: string; sort: number }[];
  subjects: TaxSubject[];
}
export interface BackupExam extends ExamInput { id: string; createdAt: string; template: string; images: { binId: string; file: string; mime: string }[] }
export interface BackupProblem {
  id: string;
  number: number;
  answer: string;
  points: number | null;
  mainUnit: string | null;
  tagStatus: TagStatus;
  tags: string[]; // "단원키|중단원키|개념 이름"
  problemXmlWithSolution: string;
  problemBlocks: Block[];
  solutionBlocks: Block[];
  images: string[];
  solutionImages: string[];
}
export interface BackupFile {
  format: "munhang-backup";
  version: 1;
  createdAt: string;
  taxonomy: BackupTaxonomy;
  exams: BackupExam[];
  worksheets: Worksheet[];
}

/** 체계표 → 백업 형식, 태그 id → "단원|중단원키|이름" */
export function taxonomyToBackup(t: Taxonomy): { tax: BackupTaxonomy; ref: Map<number, string> } {
  const sec = new Map(t.sections.map((s) => [s.id, s]));
  const ref = new Map<number, string>();
  for (const g of t.tags) {
    const s = sec.get(g.sectionId);
    if (s) ref.set(g.id, `${s.unitKey}|${s.key}|${g.name}`);
  }
  return {
    ref,
    tax: {
      units: t.units.map((u) => ({ key: u.key, name: u.name, sort: u.sort })),
      sections: t.sections.map((s) => ({ unitKey: s.unitKey, key: s.key, name: s.name, sort: s.sort, verify: s.verify ?? null })),
      tags: t.tags.filter((g) => sec.has(g.sectionId)).map((g) => ({ unitKey: sec.get(g.sectionId)!.unitKey, sectionKey: sec.get(g.sectionId)!.key, name: g.name, sort: g.sort })),
      subjects: t.subjects,
    },
  };
}

/** 필터 공통 로직 (두 구현이 같이 사용) */
export function matchFilter(p: ProblemSummary, f: ProblemFilter, tagUnit: Map<number, string>): boolean {
  if (f.examId && p.examId !== f.examId) return false;
  if (f.curriculum && p.curriculum !== f.curriculum) return false;
  if (f.status && p.tagStatus !== f.status) return false;
  if (f.points?.length && !f.points.includes(p.points ?? 0)) return false;
  if (f.unitKeys?.length) {
    const units = new Set(f.unitKeys);
    const inMain = p.mainUnit ? units.has(p.mainUnit) : false;
    const inTags = p.tagIds.some((t) => units.has(tagUnit.get(t) ?? ""));
    if (f.mainOnly ? !inMain : !(inMain || inTags)) return false;
  }
  if (f.tagIds?.length) {
    const has = new Set(p.tagIds);
    if (f.tagMode === "all" ? !f.tagIds.every((t) => has.has(t)) : !f.tagIds.some((t) => has.has(t))) return false;
  }
  return true;
}
