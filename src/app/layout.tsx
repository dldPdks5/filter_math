import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import { PROBLEM_CSS } from "@/render/html";
import { supabaseEnabled } from "@/lib/supabase-server";

export const metadata: Metadata = { title: "문항 창고", description: "모의고사 문항 분리·분류·출력" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const local = !supabaseEnabled();
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&family=Noto+Serif+KR:wght@400;600&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: PROBLEM_CSS }} />
      </head>
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            문항 창고<small>모의고사 문항 분류</small>
          </Link>
          <nav className="nav">
            <Link href="/problems">문제 찾기</Link>
            <Link href="/worksheets">학습지</Link>
            <Link href="/">회차</Link>
            <Link href="/upload">업로드</Link>
          </nav>
          {local && <span className="mode" title="Supabase 연결 전 — 이 컴퓨터의 .data 폴더에 저장됩니다">로컬 테스트 모드</span>}
        </header>
        {children}
      </body>
    </html>
  );
}
