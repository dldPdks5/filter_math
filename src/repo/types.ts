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
  saveExam(exam: ExamInput, problems: ProblemInput[], file: Uint8Array, images: ImageInput[]): Promise<string>;
  listProblems(f: ProblemFilter): Promise<ProblemSummary[]>;
  getProblems(ids: string[]): Promise<ProblemRow[]>;
  setProblemTags(id: string, u: TagUpdate): Promise<void>;
  getImage(examId: string, binId: string): Promise<{ data: Uint8Array; mime: string } | null>;
  getExamFile(examId: string): Promise<Uint8Array>;
  listWorksheets(): Promise<Worksheet[]>;
  getWorksheet(id: string): Promise<Worksheet | null>;
  saveWorksheet(w: WorksheetInput): Promise<string>;
  deleteWorksheet(id: string): Promise<void>;
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
