"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    if (error) {
      setError("이메일 또는 비밀번호가 맞지 않습니다.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login">
      <h1>로그인</h1>
      <p className="lead">문항은 저작권 자료라 로그인한 계정만 볼 수 있습니다.</p>
      <form onSubmit={login}>
        <label className="field"><span>이메일</span><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>비밀번호</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>{busy ? "확인 중…" : "로그인"}</button>
      </form>
    </main>
  );
}
