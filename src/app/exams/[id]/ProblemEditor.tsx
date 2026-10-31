"use client";
// 태그 화면의 '문제 수정' — 글자·수식·정답·번호 고치기, 문항 나누기·합치기 (저장하면 원본을 바로 덮어씀)
import { useEffect, useMemo, useState } from "react";
import { eqHtml } from "@/render/html";

interface Piece { i: number; k: "t" | "eq"; part: "p" | "s"; para: number; inTable: boolean; v: string }
interface ParaInfo { index: number; preview: string; hasSolution: boolean }
interface EditorData { id: string; number: number; answer: string; points: number | null; fp: string; pieces: Piece[]; paras: ParaInfo[] }

export default function ProblemEditor({
  problemId,
  nextNumber,
  onDone,
  onCancel,
}: {
  problemId: string;
  nextNumber: number | null; // 다음 문항 번호 (마지막 문항이면 null → 합치기 불가)
  onDone: (focusId: string) => void; // 저장·나누기·합치기 후 (페이지 다시 불러오기)
  onCancel: () => void;
}) {
  const [data, setData] = useState<EditorData | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [answer, setAnswer] = useState("");
  const [number, setNumber] = useState("");
  const [splitAt, setSplitAt] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/problems/${problemId}/content`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as EditorData; })
      .then((j) => { if (!alive) return; setData(j); setAnswer(j.answer); setNumber(String(j.number)); })
      .catch((e) => alive && setLoadErr(e.message));
    return () => { alive = false; };
  }, [problemId]);

  const groups = useMemo(() => {
    const out: { part: "p" | "s"; para: number; inTable: boolean; items: Piece[] }[] = [];
    for (const pc of data?.pieces ?? []) {
      const g = out[out.length - 1];
      if (g && g.part === pc.part && g.para === pc.para) g.items.push(pc);
      else out.push({ part: pc.part, para: pc.para, inTable: pc.inTable, items: [pc] });
    }
    return out;
  }, [data]);

  if (loadErr) return <div className="editor"><p className="error">불러오지 못했습니다: {loadErr}</p><button className="btn" onClick={onCancel}>닫기</button></div>;
  if (!data) return <div className="editor"><p className="note">문항 내용을 불러오는 중…</p></div>;

  const valueOf = (pc: Piece) => (pc.i in edits ? edits[pc.i] : pc.v);
  const changed = Object.entries(edits).filter(([i, v]) => data.pieces[Number(i)]?.v !== v).length;
  const metaChanged = answer.trim() !== data.answer || number.trim() !== String(data.number);
  const dirty = changed > 0 || metaChanged;
  const set = (i: number, v: string) => setEdits((e) => ({ ...e, [i]: v }));

  async function call(url: string, method: string, body: object) {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  }

  async function save(swap = false) {
    if (!data) return;
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) { setMsg("번호는 1 이상의 정수로 입력해 주세요."); return; }
    setBusy(true); setMsg("저장 중…");
    const { ok, json } = await call(`/api/problems/${problemId}/content`, "PUT", { fp: data.fp, edits, answer, number: n, swap });
    if (!ok && json.code === "swap") {
      setBusy(false);
      if (confirm(json.error)) return save(true);
      setMsg("번호는 바꾸지 않았습니다.");
      return;
    }
    if (!ok) { setBusy(false); setMsg("저장하지 못했습니다: " + json.error); return; }
    onDone(problemId);
  }

  async function split() {
    if (!data || splitAt === "") return;
    const p = data.paras[splitAt];
    if (!confirm(`'${p.preview}' 문단부터 ${data.number + 1}번 새 문항으로 나눕니다.\n뒤 문항 번호는 하나씩 밀립니다. 새 문항의 태그는 비어 있습니다.`)) return;
    setBusy(true); setMsg("나누는 중…");
    const { ok, json } = await call(`/api/problems/${problemId}/split`, "POST", { fp: data.fp, index: splitAt });
    if (!ok) { setBusy(false); setMsg("나누지 못했습니다: " + json.error); return; }
    onDone(problemId);
  }

  async function merge() {
    if (!data) return;
    if (nextNumber === null) return;
    if (!confirm(`${nextNumber}번 문항을 이 문항 뒤에 붙입니다.\n${nextNumber}번은 없어지고 그 뒤 번호가 하나씩 당겨집니다. 태그는 두 문항 것을 합칩니다.\n저장 학습지에 담긴 ${nextNumber}번은 빠집니다.`)) return;
    setBusy(true); setMsg("합치는 중…");
    const { ok, json } = await call(`/api/problems/${problemId}/merge`, "POST", { fp: data.fp });
    if (!ok) { setBusy(false); setMsg("합치지 못했습니다: " + json.error); return; }
    onDone(problemId);
  }

  const renderPart = (part: "p" | "s") => {
    const gs = groups.filter((g) => g.part === part);
    if (!gs.length) return <p className="note">고칠 글자나 수식이 없습니다.</p>;
    return gs.map((g) => (
      <div className="ed-para" key={`${part}-${g.para}`}>
        {g.inTable && <span className="tag-tbl">표</span>}
        {g.items.map((pc) => {
          const v = valueOf(pc);
          const isDirty = v !== pc.v;
          if (pc.k === "t")
            return (
              <input
                key={pc.i}
                className={`ed-t${isDirty ? " dirty" : ""}`}
                value={v}
                size={Math.max(3, Math.min(60, v.length + 2))}
                onChange={(e) => set(pc.i, e.target.value)}
                aria-label={`${part === "p" ? "문제" : "해설"} 글자`}
              />
            );
          return (
            <span className="ed-eq" key={pc.i}>
              <textarea
                className={isDirty ? "dirty" : ""}
                value={v}
                rows={1}
                cols={Math.max(12, Math.min(48, v.length + 2))}
                onChange={(e) => set(pc.i, e.target.value)}
                aria-label={`${part === "p" ? "문제" : "해설"} 수식 (한글 수식 문법)`}
                spellCheck={false}
              />
              {isDirty && <span className="pv" dangerouslySetInnerHTML={{ __html: eqHtml(v) }} />}
            </span>
          );
        })}
      </div>
    ));
  };

  const hasSolution = data.pieces.some((p) => p.part === "s");

  return (
    <div className="editor">
      <div className="ed-meta">
        <label>번호 <input className="input" type="number" min={1} max={99} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label>정답 <input className="input ans-in" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="예: ③, 12" /></label>
        <span className="note">배점은 위의 배점 칸에서 바꿉니다.</span>
      </div>

      <section className="ed-part">
        <h3>문제 <small>글자는 칸 안에서, 수식은 한글 수식 문법으로 고치세요. 고친 수식은 아래에 미리보기가 나옵니다.</small></h3>
        {renderPart("p")}
      </section>
      {hasSolution && (
        <section className="ed-part">
          <h3>해설 <small>첫 줄은 정답 줄입니다. 정답을 바꿨다면 위의 정답 칸도 함께 바꿔 주세요.</small></h3>
          {renderPart("s")}
        </section>
      )}

      <section className="ed-part ed-struct">
        <h3>문항 나누기·합치기 <small>분리가 잘못된 경우에 씁니다. 고친 내용을 먼저 저장해야 쓸 수 있습니다.</small></h3>
        <div className="row">
          <select className="input" value={splitAt} onChange={(e) => setSplitAt(e.target.value === "" ? "" : Number(e.target.value))} aria-label="나눌 문단" disabled={busy || dirty}>
            <option value="">나눌 문단 고르기 (이 문단부터 새 문항)</option>
            {data.paras.slice(1).map((p) => (
              <option key={p.index} value={p.index}>{p.index + 1}번째 문단: {p.preview}{p.hasSolution ? " (해설 미주 있음)" : ""}</option>
            ))}
          </select>
          <button className="btn" onClick={split} disabled={busy || dirty || splitAt === ""}>여기서 나누기</button>
        </div>
        <div className="row">
          <button className="btn" onClick={merge} disabled={busy || dirty || nextNumber === null}>
            {nextNumber === null ? "다음 문항과 합치기" : `다음 문항(${nextNumber}번)과 합치기`}
          </button>
          {nextNumber === null && <span className="note">마지막 문항이라 합칠 수 없습니다.</span>}
        </div>
      </section>

      <div className="ed-actions">
        <button className="btn primary" onClick={() => save()} disabled={busy || !dirty}>저장</button>
        <button className="btn" onClick={() => { if (!dirty || confirm("고친 내용을 버리고 닫을까요?")) onCancel(); }} disabled={busy}>취소</button>
        <span className="note" aria-live="polite">{msg || (dirty ? `고친 곳 ${changed + (metaChanged ? 1 : 0)}군데 — 저장하면 원본이 바로 바뀝니다.` : "")}</span>
      </div>
    </div>
  );
}
