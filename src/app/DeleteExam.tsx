"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** 회차 영구 삭제 — 확인 창에서 회차 이름을 입력해야 지워짐 */
export default function DeleteExam({
  id,
  title,
  total,
  confirmed,
  worksheets,
  after = "refresh",
  className = "btn",
  label = "삭제",
}: {
  id: string;
  title: string;
  total: number;
  confirmed: number;
  worksheets: number; // 이 회차 문항이 들어간 저장 학습지 수
  after?: "refresh" | "home";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = typed.trim() === title.trim();

  async function del() {
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/exams/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: typed }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      ref.current?.close();
      if (after === "home") router.push("/");
      router.refresh();
    } catch (e: any) {
      setErr("지우지 못했습니다: " + e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className} onClick={() => { setTyped(""); setErr(""); ref.current?.showModal(); }} aria-label={`${title} 회차 삭제`}>
        {label}
      </button>
      <dialog ref={ref} className="confirm" aria-labelledby={`del-${id}`}>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); del(); }}>
          <h2 id={`del-${id}`}>회차를 영구 삭제할까요?</h2>
          <p className="what"><strong>{title}</strong></p>
          <ul>
            <li>문항 {total}개 (태그 확정 {confirmed}개)와 태그가 모두 지워집니다.</li>
            <li>저장소에 있는 이 회차의 양식 파일과 그림도 지워집니다.</li>
            {worksheets > 0 ? (
              <li>이 회차 문항이 들어간 저장 학습지 <b>{worksheets}개</b>는 그대로 남고, 열면 지워진 문항만 빠집니다.</li>
            ) : (
              <li>이 회차 문항이 들어간 저장 학습지는 없습니다.</li>
            )}
            <li className="warn">되돌릴 수 없습니다. 필요하면 먼저 설정 화면에서 백업을 받아 두세요.</li>
          </ul>
          <label className="field">
            <span>지우려면 회차 이름을 그대로 입력하세요</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={title} autoComplete="off" aria-label="회차 이름 확인" />
          </label>
          {err && <p className="error">{err}</p>}
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={busy}>취소</button>
            <button type="submit" className="btn danger" disabled={!ok || busy}>{busy ? "지우는 중…" : "영구 삭제"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
