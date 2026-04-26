import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5055";

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
};

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 16,
  padding: 16,
  textDecoration: "none",
  color: "inherit",
  transition: "transform 120ms ease, border-color 120ms ease",
};

function Card({ t }) {
  return (
    <Link
      to={`/editor/${encodeURIComponent(t.id)}`}
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(109,94,252,0.55)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{t.name}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{t.category}</div>
      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
        Click to open editor →
      </div>
    </Link>
  );
}

export default function Gallery() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/templates`);
        if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
        const data = await res.json();
        if (!alive) return;
        // API contract: returns array; keep backward-compatible with {templates}
        if (Array.isArray(data)) setTemplates(data);
        else setTemplates(Array.isArray(data.templates) ? data.templates : []);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter((t) => {
      return (
        String(t.name || "").toLowerCase().includes(s) ||
        String(t.category || "").toLowerCase().includes(s) ||
        String(t.id || "").toLowerCase().includes(s)
      );
    });
  }, [templates, q]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Template Library</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Browse configs in <code style={{ opacity: 0.85 }}>backend/configs/</code>
          </div>
        </div>
        <div style={{ minWidth: 260 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates…"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Loading templates…</div>
        ) : error ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.10)",
              color: "#ffd2d2",
            }}
          >
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.8 }}>
            No templates found. Make sure you copied JSONs into{" "}
            <code>motionai-v2/backend/configs/</code>.
          </div>
        ) : (
          <div style={gridStyle}>
            {filtered.map((t) => (
              <Card key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

