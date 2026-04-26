import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5055";

export default function ImageUploader({ label, value, onChange }) {
  const inputRef = useRef(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const displayUrl = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;
    if (value && String(value).startsWith("/uploads/")) return `${API_BASE}${value}`;
    return null;
  }, [localPreviewUrl, value]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  async function handlePick(file) {
    if (!file) return;
    setError(null);

    // Immediate local preview before upload
    const nextPreview = URL.createObjectURL(file);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(nextPreview);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const data = await res.json();
      if (!data?.filePath) throw new Error("Upload response missing filePath");
      onChange(data.filePath);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        padding: 12,
        background: "rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {uploading ? "Uploading…" : value ? "Uploaded" : "Not set"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "9px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => handlePick(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {displayUrl ? (
        <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <img
            src={displayUrl}
            alt={label}
            style={{
              width: 120,
              height: 70,
              objectFit: "cover",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.8, wordBreak: "break-all" }}>
            {value ? <div>{value}</div> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 10, color: "#ffd2d2", fontSize: 12 }}>{error}</div>
      ) : null}
    </div>
  );
}

