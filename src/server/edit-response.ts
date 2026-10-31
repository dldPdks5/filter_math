// 문제 수정 API 공통 오류 응답
import { NextResponse } from "next/server";
import { EditError } from "./edit";

export function editErrorResponse(e: any) {
  if (e instanceof EditError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
}
