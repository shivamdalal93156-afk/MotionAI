import React from "react";

export default function SceneCard({ title, subtitle, children, right }) {
  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14 }}>{title}</div>
          {subtitle ? <div style={{ opacity: 0.75, fontSize: 12 }}>{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>{children}</div>
    </section>
  );
}

