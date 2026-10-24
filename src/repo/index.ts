// 환경변수에 Supabase 설정이 있으면 Supabase, 없으면 로컬 테스트 저장소
import "server-only";
import type { Repo } from "./types";
import { supabaseEnabled, supabaseServer } from "../lib/supabase-server";

export async function getRepo(): Promise<Repo> {
  if (supabaseEnabled()) {
    const { supabaseRepo } = await import("./supabase");
    return supabaseRepo(await supabaseServer());
  }
  if (process.env.VERCEL) throw new Error("배포 환경에는 Supabase 설정(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)이 필요합니다");
  const { localRepo } = await import("./local");
  return localRepo;
}

/** API 라우트에서 로그인 확인 (로컬 모드는 통과) */
export async function requireUser(): Promise<{ ok: true } | { ok: false; status: number }> {
  if (!supabaseEnabled()) return { ok: true };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ? { ok: true } : { ok: false, status: 401 };
}
