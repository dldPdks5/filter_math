"use client";

export default function PrintButton() {
  return (
    <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => window.print()}>
      인쇄 / PDF로 저장
    </button>
  );
}
