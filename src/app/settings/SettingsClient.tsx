"use client";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import type { BackupFile, BackupProblem } from "@/repo/types";

interface Plan {
  totalBytes: number;
  fileCount: number;
  templates: { examId: string; title: string; from: string; bytes: number }[];
  deletes: { path: string; bytes: number; reason: string }[];
  redundantXml: number;
  afterBytes: number;
}

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const FREE_STORAGE = 1024 * 1024 * 1024; // 무료 플랜 파일 저장소 1GB (외부 정리 글 기준 — supabase.com/pricing에서 확인 필요)

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body as T;
}

export default function SettingsClient() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planErr, setPlanErr] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<"" | "clean" | "backup" | "restore">("");
  const [log, setLog] = useState<string[]>([]);
  const say = (m: string) => setLog((l) => [...l, m]);

  const loadPlan = () =>
    fetch("/api/maintenance")
      .then((r) => j<Plan>(r))
      .then((p) => { setPlan(p); setPlanErr(""); })
      .catch((e) => setPlanErr(e.message));
  useEffect(() => { loadPlan(); }, []);

  async function clean() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return; }
    setArmed(false); setBusy("clean"); setLog([]);
    try {
      const r = await j<{ log: string[] }>(await fetch("/api/maintenance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) }));
      r.log.forEach(say);
      await loadPlan();
    } catch (e: any) { say("정리하지 못했습니다: " + e.message); }
    setBusy("");
  }

  async function backup() {
    setBusy("backup"); setLog([]);
    try {
      const { backup, files } = await j<{ backup: BackupFile; files: { zip: string; native: string }[] }>(await fetch("/api/backup?part=meta"));
      const zip = new JSZip();
      zip.file("backup.json", JSON.stringify(backup, null, 1));
      say(`회차 ${backup.exams.length}개, 학습지 ${backup.worksheets.length}개를 받습니다.`);
      for (const e of backup.exams) {
        const ps = await j<BackupProblem[]>(await fetch(`/api/backup?part=problems&exam=${e.id}`));
        zip.file(`problems/${e.id}.json`, JSON.stringify(ps));
        say(`${e.title}: 문항 ${ps.length}개`);
      }
      let n = 0;
      for (const f of files) {
        const res = await fetch(`/api/backup?part=file&path=${encodeURIComponent(f.native)}`);
        if (!res.ok) { say(`파일을 받지 못했습니다: ${f.native}`); continue; }
        zip.file(f.zip, await res.arrayBuffer());
        n++;
      }
      say(`파일 ${n}개를 받았습니다. ZIP으로 묶는 중…`);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const d = new Date();
      const name = `문항창고-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.zip`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      say(`백업을 내려받았습니다: ${name} (${size(blob.size)})`);
    } catch (e: any) { say("백업하지 못했습니다: " + e.message); }
    setBusy("");
  }

  async function restore(file: File) {
    setBusy("restore"); setLog([]);
    try {
      const zip = await JSZip.loadAsync(file);
      const raw = await zip.file("backup.json")?.async("string");
      if (!raw) throw new Error("백업 파일이 아닙니다 (backup.json 없음)");
      const backup = JSON.parse(raw) as BackupFile;
      if (backup.format !== "munhang-backup") throw new Error("문항 창고 백업 파일이 아닙니다");
      const post = (step: string, body: unknown) => fetch(`/api/restore?step=${step}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => j<any>(r));
      say(`${new Date(backup.createdAt).toLocaleString("ko-KR")}에 만든 백업입니다.`);
      await post("taxonomy", { taxonomy: backup.taxonomy });
      say("체계표: 없는 개념만 추가했습니다.");
      const { backup: now } = await j<{ backup: BackupFile }>(await fetch("/api/backup?part=meta"));
      const have = new Set(now.exams.map((e) => e.id));
      for (const e of backup.exams) {
        if (have.has(e.id)) { say(`${e.title}: 이미 있어서 건너뜀`); continue; }
        const upload = async (zipPath: string, mime: string) => {
          const data = await zip.file(zipPath)?.async("blob");
          if (!data) throw new Error(`백업에 파일이 없습니다: ${zipPath}`);
          const fd = new FormData();
          fd.set("examId", e.id); fd.set("name", zipPath.split("/").pop()!); fd.set("mime", mime); fd.set("file", data, zipPath.split("/").pop()!);
          return (await j<{ path: string }>(await fetch("/api/restore?step=file", { method: "POST", body: fd }))).path;
        };
        const filePath = await upload(e.template, "application/hwp+zip");
        const images = [];
        for (const im of e.images) images.push({ binId: im.binId, path: await upload(im.file, im.mime), mime: im.mime });
        await post("exam", { exam: e, filePath, images });
        const ps = JSON.parse((await zip.file(`problems/${e.id}.json`)?.async("string")) ?? "[]") as BackupProblem[];
        let added = 0; const missing: string[] = [];
        for (let i = 0; i < ps.length; i += 10) {
          const r = await post("problems", { examId: e.id, problems: ps.slice(i, i + 10) });
          added += r.added; missing.push(...r.missingTags);
        }
        say(`${e.title}: 문항 ${added}개 복원${missing.length ? ` (찾지 못한 개념 ${missing.length}개)` : ""}`);
      }
      const w = await post("worksheets", { worksheets: backup.worksheets });
      say(`학습지 ${w.added}개 복원 (이미 있던 것은 건너뜀)`);
      say("복원이 끝났습니다.");
      await loadPlan();
    } catch (e: any) { say("복원하지 못했습니다: " + e.message); }
    setBusy("");
  }

  const pct = plan ? Math.min(100, (plan.totalBytes / FREE_STORAGE) * 100) : 0;

  return (
    <div className="settings">
      <section className="set-block">
        <h2>파일 저장소</h2>
        {planErr && <p className="error">{planErr}</p>}
        {plan && (
          <>
            <div className="meter" role="img" aria-label={`무료 한도 1GB 중 ${size(plan.totalBytes)} 사용`}>
              <span style={{ width: `${Math.max(pct, 0.5)}%` }} />
            </div>
            <p className="note">
              파일 {plan.fileCount}개, {size(plan.totalBytes)} 사용 / 무료 한도 1GB 기준 {pct.toFixed(1)}%
              <br />DB 용량은 Supabase 대시보드 → Reports → Database에서 확인할 수 있습니다.
            </p>
          </>
        )}
      </section>

      <section className="set-block">
        <h2>저장 공간 정리</h2>
        {!plan ? <p className="note">불러오는 중…</p> : plan.templates.length + plan.deletes.length + plan.redundantXml === 0 ? (
          <p className="note">정리할 것이 없습니다.</p>
        ) : (
          <>
            <p>아래 내용을 정리하면 약 <b>{size(plan.totalBytes)} → {size(plan.afterBytes)}</b>로 줄어듭니다. 문제·태그·학습지와 출력 기능에는 영향이 없습니다.</p>
            <ul className="set-list">
              {plan.templates.map((t) => <li key={t.examId}><b>{t.title}</b>: 원본 HWPX에서 그림·본문을 뺀 양식 파일을 만듭니다.</li>)}
              {plan.deletes.map((d) => <li key={d.path}><span className="del">삭제</span> {d.reason} <small>{d.path} / {size(d.bytes)}</small></li>)}
              {plan.redundantXml > 0 && <li>문항 {plan.redundantXml}개의 중복 XML 칸을 비웁니다 (해설 포함본에서 언제든 다시 만들 수 있음).</li>}
            </ul>
            <p className="note">지운 파일은 되돌릴 수 없습니다. 원본 HWPX가 대장님 컴퓨터에 있는지 확인하고, 먼저 아래에서 백업을 받아 두시기를 권합니다.</p>
            <button className="btn" onClick={clean} disabled={!!busy} style={armed ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}>
              {busy === "clean" ? "정리하는 중…" : armed ? "한 번 더 누르면 정리합니다" : "정리하기"}
            </button>
          </>
        )}
      </section>

      <section className="set-block">
        <h2>백업</h2>
        <p>회차·문항·태그·체계표·학습지와 양식 파일·그림을 ZIP 파일 하나로 내려받습니다. 무료 플랜에는 자동 백업이 없으니 한 달에 한 번쯤 받아 두세요.</p>
        <button className="btn primary" onClick={backup} disabled={!!busy}>{busy === "backup" ? "백업 받는 중…" : "백업 받기"}</button>
      </section>

      <section className="set-block">
        <h2>복원</h2>
        <p>백업 ZIP을 올리면 <b>지금 없는 것만</b> 추가합니다. 이미 있는 회차·문항·학습지는 바꾸지 않습니다.</p>
        <label className="btn" aria-disabled={!!busy}>
          {busy === "restore" ? "복원하는 중…" : "백업 파일 고르기"}
          <input type="file" accept=".zip" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
        </label>
      </section>

      {log.length > 0 && (
        <section className="set-block">
          <h2>진행 기록</h2>
          <ol className="set-log" aria-live="polite">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </section>
      )}
    </div>
  );
}
