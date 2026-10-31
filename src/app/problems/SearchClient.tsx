"use client";
import { useEffect, useMemo, useState } from "react";
import type { AnswerMode, Taxonomy, TaxTag, Worksheet, WorksheetOptions } from "@/repo/types";

export interface SearchProblem {
  id: string;
  examId: string;
  examTitle: string;
  curriculum: string;
  number: number;
  answer: string;
  points: number | null;
  mainUnit: string | null;
  tagStatus: string;
  tagIds: number[];
  html: string;
}

const PAGE = 20;
const DRAFT_KEY = "pb-basket-draft";

export default function SearchClient({
  taxonomy: tax,
  exams,
  problems,
  initialWorksheet,
  missingCount = 0,
}: {
  taxonomy: Taxonomy;
  exams: { id: string; title: string; curriculum: string }[];
  problems: SearchProblem[];
  initialWorksheet: Worksheet | null;
  missingCount?: number; // 저장 학습지에서 지워진 문항 수
}) {
  // ── 필터 상태
  const [linked, setLinked] = useState(true);
  const [curr, setCurr] = useState<"2015" | "2022">("2015");
  const [unit, setUnit] = useState<string | null>(null);
  const [tags, setTags] = useState<number[]>([]);
  const [mode, setMode] = useState<"any" | "all">("any");
  const [examId, setExamId] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [mainOnly, setMainOnly] = useState(false);
  const [points, setPoints] = useState<number[]>([]); // 0 = 배점 없음
  const [limit, setLimit] = useState(PAGE);

  // ── 바구니(학습지) 상태
  const [wsId, setWsId] = useState<string | null>(initialWorksheet?.id ?? null);
  const [basket, setBasket] = useState<string[]>(initialWorksheet?.problemIds ?? []);
  const [title, setTitle] = useState(initialWorksheet?.title ?? "");
  const [opts, setOpts] = useState<WorksheetOptions>(initialWorksheet?.options ?? { answers: "key", showSource: false });
  const [msg, setMsg] = useState(missingCount ? `삭제된 문항 ${missingCount}개가 빠졌습니다. 다시 저장하면 학습지 목록에서도 정리됩니다.` : "");
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // 저장 안 한 바구니는 이 브라우저에 임시 보관 (새 학습지일 때만)
  useEffect(() => {
    if (initialWorksheet) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (d?.basket?.length) { setBasket(d.basket); setTitle(d.title ?? ""); if (d.opts) setOpts(d.opts); }
    } catch {}
  }, [initialWorksheet]);
  useEffect(() => {
    if (wsId) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ basket, title, opts })); } catch {}
  }, [basket, title, opts, wsId]);

  // ── 조회용
  const secById = useMemo(() => new Map(tax.sections.map((s) => [s.id, s])), [tax]);
  const unitName = useMemo(() => new Map(tax.units.map((u) => [u.key, u.name])), [tax]);
  const tagById = useMemo(() => new Map(tax.tags.map((t) => [t.id, t])), [tax]);
  const tagUnit = (id: number) => secById.get(tagById.get(id)?.sectionId ?? -1)?.unitKey ?? "";
  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);

  // 대단원 묶음: 연결 보기면 교육과정 사이 같은 단원을 한 묶음으로
  const groups = useMemo(() => {
    const subs = tax.subjects.slice().sort((a, b) => a.sort - b.sort);
    if (!linked) return subs.filter((s) => s.curriculum === curr || s.curriculum === "common").map((s) => ({ label: s.name, units: s.unitKeys }));
    const m = new Map<string, { label: string[]; units: string[] }>();
    for (const s of subs) {
      const k = s.unitKeys.join(",");
      if (!m.has(k)) m.set(k, { label: [], units: s.unitKeys });
      m.get(k)!.label.push(s.name.replace(/\(공통\)/, ""));
    }
    return [...m.values()].map((g) => ({ label: g.label.join(" · "), units: g.units }));
  }, [tax, linked, curr]);

  // 단원 외 조건만 적용한 목록 (단원별 개수 표시에 사용)
  const base = useMemo(
    () =>
      problems.filter(
        (p) =>
          (linked || p.curriculum === curr) &&
          (!examId || p.examId === examId) &&
          (!confirmedOnly || p.tagStatus === "confirmed") &&
          (!points.length || points.includes(p.points ?? 0))
      ),
    [problems, linked, curr, examId, confirmedOnly, points]
  );
  const inUnit = (p: SearchProblem, u: string) => (mainOnly ? p.mainUnit === u : p.mainUnit === u || p.tagIds.some((t) => tagUnit(t) === u));

  const results = useMemo(() => {
    return base.filter((p) => {
      if (unit && !inUnit(p, unit)) return false;
      if (tags.length) {
        const has = new Set(p.tagIds);
        if (mode === "all" ? !tags.every((t) => has.has(t)) : !tags.some((t) => has.has(t))) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, unit, tags, mode, mainOnly]);

  useEffect(() => setLimit(PAGE), [results]);

  const pickUnit = (u: string) => {
    setUnit((cur) => (cur === u ? null : u));
    setTags([]);
  };
  const toggleTag = (id: number) => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const inBasket = (id: string) => basket.includes(id);
  const toggleBasket = (id: string) => setBasket((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const move = (i: number, d: number) =>
    setBasket((b) => {
      const j = i + d;
      if (j < 0 || j >= b.length) return b;
      const n = b.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const dropAt = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    setBasket((b) => {
      const n = b.slice();
      const [x] = n.splice(dragIdx, 1);
      n.splice(to, 0, x);
      return n;
    });
    setDragIdx(null);
  };

  async function saveWs(asNew = false) {
    if (!title.trim()) { setMsg("학습지 제목을 입력해 주세요."); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asNew ? undefined : wsId, title, problemIds: basket, options: opts }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setWsId(j.id);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      history.replaceState(null, "", `/problems?ws=${j.id}`);
      setMsg("저장했습니다.");
    } catch (e: any) {
      setMsg("저장하지 못했습니다: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadHwpx() {
    setBusy(true); setMsg("HWPX 만드는 중…");
    try {
      const res = await fetch("/api/export/hwpx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemIds: basket, title: title || "학습지", options: opts }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title || "학습지"}.hwpx`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg("HWPX를 내려받았습니다.");
    } catch (e: any) {
      setMsg("HWPX를 만들지 못했습니다: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  function openPrint() {
    const q = new URLSearchParams({ ids: basket.join(","), title: title || "학습지", answers: opts.answers, src: opts.showSource ? "1" : "0" });
    window.open(`/print?${q}`, "_blank");
  }

  function newWorksheet() {
    setWsId(null); setBasket([]); setTitle(""); setMsg("");
    history.replaceState(null, "", "/problems");
  }

  const unitSections = unit ? tax.sections.filter((s) => s.unitKey === unit).sort((a, b) => a.sort - b.sort) : [];
  const countTag = (id: number) => base.filter((p) => p.tagIds.includes(id) && (!unit || inUnit(p, unit))).length;

  return (
    <div className="search">
      {/* ── 필터 */}
      <aside className="filters" aria-label="필터">
        <div className="f-block">
          <div className="f-label">교육과정</div>
          <div className="seg" role="group" aria-label="교육과정 보기">
            <button aria-pressed={linked} onClick={() => setLinked(true)}>연결해서 보기</button>
            <button aria-pressed={!linked} onClick={() => setLinked(false)}>따로 보기</button>
          </div>
          {!linked && (
            <div className="seg" role="group" aria-label="교육과정 선택" style={{ marginTop: 8 }}>
              <button aria-pressed={curr === "2015"} onClick={() => { setCurr("2015"); setUnit(null); setTags([]); }}>2015 개정</button>
              <button aria-pressed={curr === "2022"} onClick={() => { setCurr("2022"); setUnit(null); setTags([]); }}>2022 개정</button>
            </div>
          )}
          <p className="note">{linked ? "2015 수학Ⅰ·Ⅱ와 2022 대수·미적분Ⅰ의 같은 단원을 함께 찾습니다." : `${curr} 개정 회차만 찾습니다.`}</p>
        </div>

        <div className="f-block">
          <div className="f-label">단원</div>
          {groups.map((g) => (
            <div key={g.label} className="f-group">
              <div className="f-sub">{g.label}</div>
              {g.units.map((u) => {
                const n = base.filter((p) => inUnit(p, u)).length;
                return (
                  <button key={u} className="unit-btn" aria-pressed={unit === u} onClick={() => pickUnit(u)}>
                    <span>{unitName.get(u)}</span>
                    <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {unit && (
          <div className="f-block">
            <div className="f-label" style={{ display: "flex", alignItems: "center" }}>
              세부 개념
              <div className="seg mini" role="group" aria-label="개념 조건" style={{ marginLeft: "auto" }}>
                <button aria-pressed={mode === "any"} onClick={() => setMode("any")}>하나라도</button>
                <button aria-pressed={mode === "all"} onClick={() => setMode("all")}>모두</button>
              </div>
            </div>
            {unitSections.map((s) => {
              const ts = tax.tags.filter((t) => t.sectionId === s.id).sort((a, b) => a.sort - b.sort);
              return (
                <div key={s.id} className="f-sec">
                  <div className="f-sub">{s.name}</div>
                  <div className="chips">
                    {ts.map((t: TaxTag) => {
                      const n = countTag(t.id);
                      return (
                        <button key={t.id} className="chip" aria-pressed={tags.includes(t.id)} onClick={() => toggleTag(t.id)} disabled={n === 0 && !tags.includes(t.id)}>
                          {t.name} <span className="cn">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="f-block">
          <div className="f-label">배점</div>
          <div className="chips">
            {[2, 3, 4, 0].map((n) => {
              const cnt = problems.filter((p) => (linked || p.curriculum === curr) && (p.points ?? 0) === n).length;
              if (n === 0 && cnt === 0) return null;
              return (
                <button key={n} className="chip" aria-pressed={points.includes(n)} onClick={() => setPoints((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}>
                  {n ? `${n}점` : "배점 없음"} <span className="cn">{cnt}</span>
                </button>
              );
            })}
          </div>
          <p className="note">아무것도 고르지 않으면 모든 배점을 보여 줍니다.</p>
        </div>

        <div className="f-block">
          <div className="f-label">그 밖의 조건</div>
          <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="회차">
            <option value="">모든 회차</option>
            {exams.filter((e) => linked || e.curriculum === curr).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.target.checked)} /> 고른 단원이 주 단원인 문제만</label>
          <label className="check"><input type="checkbox" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} /> 태그 확정된 문제만</label>
        </div>
      </aside>

      {/* ── 결과 */}
      <section className="results" aria-label="찾은 문제">
        <div className="r-head">
          <strong>{results.length}문제</strong>
          <span className="note">
            {unit ? unitName.get(unit) : "모든 단원"}
            {tags.length ? ` › ${tags.map((t) => tagById.get(t)?.name).join(mode === "all" ? " + " : " 또는 ")}` : ""}
            {points.length ? ` / ${points.map((n) => (n ? `${n}점` : "배점 없음")).join(", ")}` : ""}
          </span>
          {results.length > 0 && (
            <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setBasket((b) => [...b, ...results.map((p) => p.id).filter((id) => !b.includes(id))])}>
              모두 담기
            </button>
          )}
        </div>
        {results.length === 0 && <p className="empty">조건에 맞는 문제가 없습니다. 개념 조건을 '하나라도'로 바꾸거나 단원을 넓혀 보세요.</p>}
        <div className="r-list">
          {results.slice(0, limit).map((p) => (
            <article key={p.id} className={`r-card${inBasket(p.id) ? " picked" : ""}`}>
              <header>
                <span className="src">{p.examTitle} {p.number}번</span>
                <span className="unit">{p.mainUnit ? unitName.get(p.mainUnit) : "미분류"}</span>
                <span className="ans">{p.points ? `${p.points}점 / ` : ""}정답 {p.answer || "-"}</span>
                <button className={`btn${inBasket(p.id) ? "" : " primary"}`} onClick={() => toggleBasket(p.id)}>
                  {inBasket(p.id) ? `빼기 (${basket.indexOf(p.id) + 1}번)` : "담기"}
                </button>
              </header>
              <div className="r-sheet" dangerouslySetInnerHTML={{ __html: p.html }} />
              <div className="chips">
                {p.tagIds.map((t) => tagById.get(t)).filter(Boolean).map((t) => (
                  <span key={t!.id} className={`chip static${tags.includes(t!.id) ? "" : " dim"}`}>{t!.name}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
        {results.length > limit && (
          <button className="btn" style={{ alignSelf: "center" }} onClick={() => setLimit((l) => l + PAGE)}>
            {results.length - limit}문제 더 보기
          </button>
        )}
      </section>

      {/* ── 바구니 */}
      <aside className="basket" aria-label="학습지">
        <div className="b-head">
          <input className="input title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="학습지 제목" aria-label="학습지 제목" />
          <div className="note">{wsId ? "저장된 학습지" : "저장 안 함"} / {basket.length}문제</div>
        </div>
        <ol className="b-list">
          {basket.length === 0 && <li className="none">왼쪽에서 문제를 찾아 담으세요. 담은 순서대로 번호가 매겨집니다.</li>}
          {basket.map((id, i) => {
            const p = byId.get(id);
            return (
              <li
                key={id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropAt(i)}
                className={dragIdx === i ? "dragging" : ""}
              >
                <span className="bn">{i + 1}</span>
                <span className="bt">{p ? `${p.examTitle} ${p.number}번` : "삭제된 문항"}<small>{p?.mainUnit ? unitName.get(p.mainUnit) : ""}</small></span>
                <span className="bctl">
                  <button aria-label="위로" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button aria-label="아래로" onClick={() => move(i, 1)} disabled={i === basket.length - 1}>↓</button>
                  <button aria-label="빼기" onClick={() => toggleBasket(id)}>×</button>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="b-opts">
          <div className="f-label">정답·해설</div>
          {([["none", "문제만"], ["key", "문제 + 빠른 정답"], ["solutions", "문제 + 해설 + 빠른 정답"]] as [AnswerMode, string][]).map(([v, l]) => (
            <label key={v} className="check"><input type="radio" name="answers" checked={opts.answers === v} onChange={() => setOpts((o) => ({ ...o, answers: v }))} /> {l}</label>
          ))}
          <label className="check"><input type="checkbox" checked={opts.showSource} onChange={(e) => setOpts((o) => ({ ...o, showSource: e.target.checked }))} /> 문제 아래 출처 표시</label>
        </div>
        <div className="b-actions">
          <button className="btn" onClick={() => saveWs()} disabled={busy || !basket.length}>{wsId ? "저장" : "학습지 저장"}</button>
          {wsId && <button className="btn" onClick={() => saveWs(true)} disabled={busy}>새 이름으로 저장</button>}
          <button className="btn primary" onClick={downloadHwpx} disabled={busy || !basket.length}>HWPX 받기</button>
          <button className="btn primary" onClick={openPrint} disabled={!basket.length}>인쇄 · PDF</button>
        </div>
        {msg && <p className="note" aria-live="polite">{msg}</p>}
        <div className="b-foot">
          <a href="/worksheets">저장한 학습지</a>
          {(wsId || basket.length > 0) && <button className="linkish" onClick={newWorksheet}>새 학습지</button>}
        </div>
      </aside>
    </div>
  );
}
