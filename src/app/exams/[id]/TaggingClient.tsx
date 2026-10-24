"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Taxonomy, TaxTag, TagStatus } from "@/repo/types";

export interface ClientProblem {
  id: string;
  number: number;
  answer: string;
  mainUnit: string | null;
  tagStatus: TagStatus;
  tagIds: number[];
  problemHtml: string;
  solutionHtml: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function TaggingClient({
  exam,
  problems: initial,
  taxonomy: initialTax,
}: {
  exam: { id: string; title: string; curriculum: string };
  problems: ClientProblem[];
  taxonomy: Taxonomy;
}) {
  const [problems, setProblems] = useState(initial);
  const [tax, setTax] = useState(initialTax);
  const [cur, setCur] = useState(0);
  const [showSol, setShowSol] = useState(false);
  const [q, setQ] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [adding, setAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const p = problems[cur];

  // 조회용 맵
  const sectionById = useMemo(() => new Map(tax.sections.map((s) => [s.id, s])), [tax]);
  const unitName = useMemo(() => new Map(tax.units.map((u) => [u.key, u.name])), [tax]);
  const tagById = useMemo(() => new Map(tax.tags.map((t) => [t.id, t])), [tax]);
  const tagUnit = (t: TaxTag) => sectionById.get(t.sectionId)?.unitKey ?? "";

  // 이 교육과정에서 보여줄 과목 묶음
  const subjects = useMemo(
    () => tax.subjects.filter((s) => s.curriculum === exam.curriculum || s.curriculum === "common").sort((a, b) => a.sort - b.sort),
    [tax, exam.curriculum]
  );
  const unitsInView = useMemo(() => subjects.flatMap((s) => s.unitKeys), [subjects]);

  const persist = useCallback((next: ClientProblem) => {
    clearTimeout(timers.current[next.id]);
    setSave("saving");
    timers.current[next.id] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/problems/${next.id}/tags`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mainUnit: next.mainUnit, tagIds: next.tagIds, tagStatus: next.tagStatus }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, 350);
  }, []);

  const update = (patch: Partial<ClientProblem>) => {
    const next = { ...p, ...patch };
    setProblems((ps) => ps.map((x, i) => (i === cur ? next : x)));
    persist(next);
  };

  const toggleTag = (id: number) => {
    const has = p.tagIds.includes(id);
    const tagIds = has ? p.tagIds.filter((x) => x !== id) : [...p.tagIds, id];
    // 주 단원이 비어 있으면 처음 고른 태그의 단원으로 채움
    const t = tagById.get(id);
    const mainUnit = p.mainUnit ?? (!has && t && tagUnit(t) !== "TOOL" ? tagUnit(t) : null);
    update({ tagIds, mainUnit });
  };

  async function addTag(sectionId: number) {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/taxonomy/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sectionId, name }) });
    const json = await res.json();
    if (!res.ok) { alertLike(json.error); return; }
    setTax((t) => (t.tags.some((x) => x.id === json.id) ? t : { ...t, tags: [...t.tags, json] }));
    setNewName("");
    setAdding(null);
    if (!p.tagIds.includes(json.id)) update({ tagIds: [...p.tagIds, json.id] });
  }
  const alertLike = (m: string) => setImportMsg(m);

  async function importTags(f: File) {
    setImportMsg("");
    try {
      const body = JSON.parse(await f.text());
      const res = await fetch(`/api/exams/${exam.id}/tags-import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setImportMsg(`${json.applied}문항에 적용했습니다.${json.missing.length ? `\n체계표에 없어 건너뛴 항목:\n${json.missing.join("\n")}` : ""}`);
      location.reload();
    } catch (e: any) {
      setImportMsg("불러오기 실패: " + e.message);
    }
  }

  // 키보드: ↑↓ 또는 j/k 로 문항 이동
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === "ArrowDown" || e.key === "j") { setCur((c) => Math.min(problems.length - 1, c + 1)); e.preventDefault(); }
      if (e.key === "ArrowUp" || e.key === "k") { setCur((c) => Math.max(0, c - 1)); e.preventDefault(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [problems.length]);

  useEffect(() => { setShowSol(false); setAdding(null); }, [cur]);

  if (!p) return <main className="page"><p className="empty">이 회차에는 문항이 없습니다.</p></main>;

  const query = q.trim();
  const chosen = p.tagIds.map((id) => tagById.get(id)).filter((t): t is TaxTag => !!t);
  const isCross = (t: TaxTag) => !!p.mainUnit && tagUnit(t) !== p.mainUnit;
  const done = problems.filter((x) => x.tagStatus === "confirmed").length;

  return (
    <div className="work">
      <aside className="qlist" aria-label="문항 목록">
        <h2>{exam.title} — 확정 {done}/{problems.length}</h2>
        {problems.map((x, i) => (
          <button key={x.id} className="qitem" aria-current={i === cur} onClick={() => setCur(i)}>
            <span className="n">{x.number}</span>
            <span className="u">{x.mainUnit ? unitName.get(x.mainUnit) : x.tagIds.length ? "주 단원 미지정" : "미분류"}</span>
            <span className={`dot ${x.tagStatus === "confirmed" ? "confirmed" : x.tagIds.length ? "draft" : ""}`} title={x.tagStatus === "confirmed" ? "확정" : x.tagIds.length ? "태그 있음(초안)" : "태그 없음"} />
          </button>
        ))}
      </aside>

      <section className="stage">
        <div className="stage-head">
          <span className="src">{exam.title} {p.number}번</span>
          <span className="ans">정답 {p.answer || "—"}</span>
          <div className="seg sw" role="group" aria-label="보기 전환">
            <button aria-pressed={!showSol} onClick={() => setShowSol(false)}>문제</button>
            <button aria-pressed={showSol} onClick={() => setShowSol(true)}>문제 + 해설</button>
          </div>
        </div>
        <article className="sheet">
          <span className="qno">{p.number}.</span>
          <div dangerouslySetInnerHTML={{ __html: p.problemHtml }} />
        </article>
        {showSol && <article className="sheet solution" dangerouslySetInnerHTML={{ __html: p.solutionHtml }} />}
      </section>

      <aside className="tagpanel" aria-label="태그">
        <div className="tp-head">
          <div className="tp-row">
            <label htmlFor="main">주 단원</label>
            <select id="main" className="input" value={p.mainUnit ?? ""} onChange={(e) => update({ mainUnit: e.target.value || null })}>
              <option value="">선택 안 함</option>
              {unitsInView.filter((u) => u !== "TOOL").map((u) => <option key={u} value={u}>{unitName.get(u)}</option>)}
            </select>
          </div>
          <span className={`save-state${save === "error" ? " err" : ""}`} aria-live="polite">
            {save === "saving" ? "저장 중…" : save === "saved" ? "저장됨" : save === "error" ? "저장하지 못했습니다. 태그를 다시 눌러 주세요." : "태그를 누르면 바로 저장됩니다."}
          </span>
          <div className="chosen">
            {chosen.length === 0 ? (
              <span className="none">아래에서 이 문제에 쓰인 개념을 모두 고르세요.</span>
            ) : (
              chosen.map((t) => (
                <button key={t.id} className={`chip static${isCross(t) ? " cross" : ""}`} title={`${unitName.get(tagUnit(t))} › ${sectionById.get(t.sectionId)?.name} — 눌러서 빼기`} onClick={() => toggleTag(t.id)}>
                  {t.name} ×
                </button>
              ))
            )}
          </div>
        </div>

        <div className="tp-body">
          <div className="tp-search">
            <input className="input" type="search" placeholder="개념 찾기 (예: 연속, 코사인)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="개념 찾기" />
          </div>
          {subjects.map((s) => (
            <div className="subj" key={s.id}>
              <h3>{s.name}</h3>
              {s.unitKeys.map((uk) => {
                const secs = tax.sections.filter((x) => x.unitKey === uk).sort((a, b) => a.sort - b.sort);
                const tagsOf = (sid: number) => tax.tags.filter((t) => t.sectionId === sid && (!query || t.name.includes(query))).sort((a, b) => a.sort - b.sort);
                const visibleSecs = secs.filter((x) => !query || tagsOf(x.id).length > 0);
                if (query && !visibleSecs.length) return null;
                const cnt = p.tagIds.filter((id) => { const t = tagById.get(id); return t && tagUnit(t) === uk; }).length;
                const open = !!query || p.mainUnit === uk || cnt > 0;
                return (
                  <details className="unit" key={`${s.id}-${uk}-${p.id}-${query ? "q" : ""}`} open={open}>
                    <summary>
                      {unitName.get(uk)}
                      {cnt > 0 && <span className="cnt">{cnt}개 선택</span>}
                    </summary>
                    {visibleSecs.map((sec) => (
                      <div className="sec" key={sec.id}>
                        <h4>{sec.name}{sec.verify && <em title={sec.verify}>확인 필요</em>}</h4>
                        <div className="chips">
                          {tagsOf(sec.id).map((t) => (
                            <button key={t.id} className={`chip${p.mainUnit && uk !== p.mainUnit ? " cross" : ""}`} aria-pressed={p.tagIds.includes(t.id)} onClick={() => toggleTag(t.id)}>
                              {t.name}
                            </button>
                          ))}
                          {!query && adding !== sec.id && (
                            <button className="chip add" onClick={() => { setAdding(sec.id); setNewName(""); }}>+ 개념 추가</button>
                          )}
                        </div>
                        {adding === sec.id && (
                          <form className="addtag" onSubmit={(e) => { e.preventDefault(); addTag(sec.id); }}>
                            <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`${sec.name}에 넣을 개념 이름`} aria-label="새 개념 이름" />
                            <button className="btn" type="submit">추가</button>
                            <button className="btn" type="button" onClick={() => setAdding(null)}>취소</button>
                          </form>
                        )}
                      </div>
                    ))}
                  </details>
                );
              })}
            </div>
          ))}
          {importMsg && <p className="error" style={{ color: "var(--ink-2)" }}>{importMsg}</p>}
        </div>

        <div className="tp-foot">
          <button className="btn status-btn" aria-pressed={p.tagStatus === "confirmed"} onClick={() => update({ tagStatus: p.tagStatus === "confirmed" ? "draft" : "confirmed" })}>
            {p.tagStatus === "confirmed" ? "확정됨" : "태그 확정"}
          </button>
          <button className="btn" onClick={() => setCur((c) => Math.min(problems.length - 1, c + 1))} disabled={cur === problems.length - 1}>
            다음 문항
          </button>
          <button className="btn" style={{ marginLeft: "auto" }} title="태그 초안 JSON 불러오기" onClick={() => fileRef.current?.click()}>초안 불러오기</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importTags(e.target.files[0])} />
        </div>
      </aside>
    </div>
  );
}
