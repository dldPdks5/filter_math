import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="page" style={{ maxWidth: 820 }}>
      <h1>저장 공간 · 백업</h1>
      <p className="lead">무료 플랜 용량을 아끼고, 데이터를 파일로 보관하거나 되살립니다.</p>
      <SettingsClient />
    </main>
  );
}
