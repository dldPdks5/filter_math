"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** 두 번 눌러야 지워지는 삭제 버튼 (학습지 구성만 지워지고 문항은 그대로) */
export default function DeleteWorksheet({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    await fetch(`/api/worksheets/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <button className="btn" onClick={del} disabled={busy} aria-label={`${title} 삭제`} style={armed ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}>
      {armed ? "한 번 더 누르면 삭제" : "삭제"}
    </button>
  );
}
