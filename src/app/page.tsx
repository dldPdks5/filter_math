import Link from "next/link";
import { getRepo } from "@/repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const repo = await getRepo();
  const exams = await repo.listExams();
  const all = await repo.listProblems({});
  const stat = (id: string) => {
    const ps = all.filter((p) => p.examId === id);
    return { total: ps.length, done: ps.filter((p) => p.tagStatus === "confirmed").length, tagged: ps.filter((p) => p.tagIds.length > 0).length };
  };
  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1>회차</h1>
          <p className="lead" style={{ margin: 0 }}>올린 모의고사와 태깅 진행 상황입니다. 회차를 열어 문항마다 개념 태그를 붙이세요.</p>
        </div>
        <Link href="/upload" className="btn primary" style={{ marginLeft: "auto" }}>
          HWPX 올리기
        </Link>
      </div>
      {exams.length === 0 ? (
        <div className="empty">
          <p>아직 올린 회차가 없습니다.</p>
          <Link href="/upload" className="btn primary">첫 회차 올리기</Link>
        </div>
      ) : (
        <ul className="exam-list">
          {exams.map((e) => {
            const s = stat(e.id);
            return (
              <li key={e.id}>
                <div>
                  <Link href={`/exams/${e.id}`} className="t">{e.title}</Link>
                  <div className="m">
                    {e.curriculum} 개정 / {s.total}문항 / {new Date(e.createdAt).toLocaleDateString("ko-KR")} 업로드
                  </div>
                </div>
                <div className="progress">
                  태그 {s.tagged}/{s.total}, 확정 {s.done}/{s.total}
                </div>
                <Link href={`/exams/${e.id}`} className="btn">태깅하기</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
