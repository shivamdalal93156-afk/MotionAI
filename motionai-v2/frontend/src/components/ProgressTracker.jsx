import React from "react";

export default function ProgressTracker({ job }) {
  const pct = Math.max(0, Math.min(100, Number(job?.progress || 0)));
  const status = job?.status || "queued";
  const message = job?.message || "";

  const label = `${status}${message ? ` · ${message}` : ""}`;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: 13 }}>Render progress</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{pct}%</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div
        style={{
          marginTop: 10,
          height: 10,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #6d5efc 0%, #19d3ff 100%)",
          }}
        />
      </div>

      {job?.status === "error" ? (
        <div style={{ marginTop: 10, color: "#ffd2d2", fontSize: 12 }}>
          {job?.error || "Render failed"}
        </div>
      ) : null}
    </div>
  );
}

