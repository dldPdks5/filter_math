"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SUPABASE = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [curriculum, setCurriculum] = useState<"2015" | "2022" | "">("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = (f: File | undefined | null) => {
    setError("");
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".hwpx")) {
      setError("HWPX 파일만 올릴 수 있습니다. HWP 파일은 한글에서 '다른 이름으로 저장 → HWPX'로 바꾼 뒤 올려 주세요.");
      return;
    }
    setFile(f);
  };

  async function submit() {
    if (!file || !curriculum) return;
    setBusy(true);
    setError("");
    try {
      let res: Response;
      if (SUPABASE) {
        const { supabaseBrowser } = await import("@/lib/supabase-browser");
        const sb = supabaseBrowser();
        const incomingPath = `incoming/${crypto.randomUUID()}.hwpx`;
        const up = await sb.storage.from("exams").upload(incomingPath, file, { contentType: "application/hwp+zip" });
        if (up.error) throw new Error("파일 올리기 실패: " + up.error.message);
        res = await fetch("/api/exams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incomingPath, curriculum, title }) });
      } else {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("curriculum", curriculum);
        fd.set("title", title);
        res = await fetch("/api/exams", { method: "POST", body: fd });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "분리에 실패했습니다");
      router.push(`/exams/${json.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 620 }}>
      <h1>HWPX 올리기</h1>
      <p className="lead">문항을 자동으로 하나씩 나누고 정답·해설·그림을 함께 저장합니다. 원본 파일은 바뀌지 않습니다.</p>

      <div
        className={`drop${over ? " over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <strong>{file ? file.name : "HWPX 파일을 끌어다 놓거나 눌러서 고르세요"}</strong>
        <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : "문항마다 '문제' 문단 스타일이 걸린 파일이어야 합니다"}</span>
        <input ref={input} type="file" accept=".hwpx" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <div style={{ height: 24 }} />
      <div className="field">
        <span>교육과정</span>
        <div className="seg" role="group" aria-label="교육과정">
          <button type="button" aria-pressed={curriculum === "2015"} onClick={() => setCurriculum("2015")}>2015 개정</button>
          <button type="button" aria-pressed={curriculum === "2022"} onClick={() => setCurriculum("2022")}>2022 개정</button>
        </div>
      </div>
      <label className="field">
        <span>회차 이름 (비워 두면 파일 머리말에서 읽음)</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: PinPoint Light 2회" />
      </label>

      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={!file || !curriculum || busy} onClick={submit}>
        {busy ? "문항 나누는 중…" : "올리고 문항 나누기"}
      </button>
      {!curriculum && file && <p className="note">교육과정을 골라 주세요.</p>}
    </main>
  );
}
