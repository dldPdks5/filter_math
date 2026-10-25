import Link from "next/link";
import { getRepo } from "@/repo";
import DeleteWorksheet from "./DeleteWorksheet";

export const dynamic = "force-dynamic";

const ANS: Record<string, string> = { none: "문제만", key: "빠른 정답", solutions: "해설 포함" };

export default async function WorksheetsPage() {
  const list = await (await getRepo()).listWorksheets();
  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1>학습지</h1>
          <p className="lead" style={{ margin: 0 }}>저장한 학습지입니다. 열어서 문제를 더 담거나 순서를 바꾸고 다시 출력할 수 있습니다.</p>
        </div>
        <Link href="/problems" className="btn primary" style={{ marginLeft: "auto" }}>새 학습지 만들기</Link>
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <p>저장한 학습지가 없습니다.</p>
          <Link href="/problems" className="btn primary">문제 찾으러 가기</Link>
        </div>
      ) : (
        <ul className="exam-list">
          {list.map((w) => {
            const q = new URLSearchParams({ ws: w.id });
            return (
              <li key={w.id}>
                <div>
                  <Link href={`/problems?ws=${w.id}`} className="t">{w.title}</Link>
                  <div className="m">
                    {w.problemIds.length}문제 / {ANS[w.options.answers]}{w.options.showSource ? " / 출처 표시" : ""} / {new Date(w.updatedAt).toLocaleDateString("ko-KR")} 저장
                  </div>
                </div>
                <div className="ws-actions">
                  <Link href={`/print?${q}`} className="btn" target="_blank">인쇄 · PDF</Link>
                  <Link href={`/problems?ws=${w.id}`} className="btn">열기</Link>
                </div>
                <DeleteWorksheet id={w.id} title={w.title} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
