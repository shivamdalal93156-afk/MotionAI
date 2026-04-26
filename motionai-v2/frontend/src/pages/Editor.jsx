import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SceneCard from "../components/SceneCard.jsx";
import ImageUploader from "../components/ImageUploader.jsx";
import ProgressTracker from "../components/ProgressTracker.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5055";

function deriveScenesFromConfig(cfg) {
  const textKeys = Object.keys(cfg?.text_map || {});
  const imageKeys = Object.keys(cfg?.image_map || {});

  const outpoints = Array.isArray(cfg?.scene_outpoints) ? cfg.scene_outpoints : null;
  const outpointScenesCount = outpoints ? outpoints.length : 0;

  const sceneNums = new Set();
  for (const k of [...textKeys, ...imageKeys]) {
    const m = String(k).match(/^scene(\d+)_/i);
    if (m) sceneNums.add(Number(m[1]));
  }

  let nums = [...sceneNums].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (outpointScenesCount > 0) nums = Array.from({ length: outpointScenesCount }, (_, i) => i + 1);
  if (nums.length === 0) nums = [1];

  const scenes = nums.map((n) => {
    const textSlots = textKeys.filter((k) => new RegExp(`^scene${n}_`, "i").test(k));
    const imageSlots = imageKeys.filter((k) => new RegExp(`^scene${n}_`, "i").test(k));
    return {
      scene_number: n,
      label: `Scene ${n}`,
      text_slots: textSlots,
      image_slots: imageSlots,
      max_chars_per_slot: 100,
    };
  });

  // If some templates use image_1 style with no scene prefix, place them in Scene 1
  const leftoverText = textKeys.filter((k) => !/^scene\d+_/i.test(k));
  const leftoverImages = imageKeys.filter((k) => !/^scene\d+_/i.test(k));
  if (leftoverText.length || leftoverImages.length) {
    scenes[0] = {
      ...scenes[0],
      text_slots: [...new Set([...(scenes[0].text_slots || []), ...leftoverText])],
      image_slots: [...new Set([...(scenes[0].image_slots || []), ...leftoverImages])],
    };
  }

  return scenes;
}

function getScenes(cfg) {
  if (Array.isArray(cfg?.scene_definitions) && cfg.scene_definitions.length) return cfg.scene_definitions;
  return deriveScenesFromConfig(cfg);
}

export default function Editor() {
  const { templateId } = useParams();

  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [textBySlot, setTextBySlot] = useState({});
  const [uploadPathBySlot, setUploadPathBySlot] = useState({});

  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);

  const pollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}/config`);
        if (!res.ok) throw new Error(`Failed to load config (${res.status})`);
        const data = await res.json();
        if (!alive) return;
        setCfg(data);

        const initialText = {};
        for (const [slot, defaultText] of Object.entries(data?.text_map || {})) {
          initialText[slot] = String(defaultText ?? "");
        }
        setTextBySlot(initialText);
        setUploadPathBySlot({});
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
  }, [templateId]);

  const scenes = useMemo(() => (cfg ? getScenes(cfg) : []), [cfg]);

  async function fetchJob(nextJobId) {
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(nextJobId)}`);
    if (!res.ok) throw new Error(`Failed to fetch job (${res.status})`);
    return await res.json();
  }

  function startPolling(nextJobId) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const j = await fetchJob(nextJobId);
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // ignore transient polling errors
      }
    }, 4000);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleStartRender() {
    if (!cfg) return;
    setStarting(true);
    setError(null);
    try {
      // Phase 1 contract: send slotKey -> userValue, backend maps via config JSON.
      const textData = { ...(textBySlot || {}) };
      const imageData = { ...(uploadPathBySlot || {}) };

      const res = await fetch(`${API_BASE}/api/render/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          textData,
          imageData,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Failed to start render (${res.status}): ${msg}`);
      }
      const data = await res.json();
      if (!data?.jobId) throw new Error("Render start response missing jobId");

      setJobId(data.jobId);
      const first = await fetchJob(data.jobId);
      setJob(first);
      startPolling(data.jobId);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <div style={{ opacity: 0.8 }}>Loading template…</div>;
  if (error && !cfg)
    return (
      <div>
        <div style={{ marginBottom: 14 }}>
          <Link to="/" style={{ color: "#b9c6ff", textDecoration: "none" }}>
            ← Back to gallery
          </Link>
        </div>
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
      </div>
    );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link to="/" style={{ color: "#b9c6ff", textDecoration: "none", fontSize: 13 }}>
            ← Back to gallery
          </Link>
          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 6 }}>
            {cfg?.name || templateId}
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {cfg?.category ? `${cfg.category} · ` : ""}
            Render comp: <code>{cfg?.render_comp}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={starting || (job && job.status !== "done" && job.status !== "error")}
            onClick={handleStartRender}
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background:
                starting || (job && job.status !== "done" && job.status !== "error")
                  ? "rgba(255,255,255,0.06)"
                  : "linear-gradient(135deg, #6d5efc 0%, #19d3ff 100%)",
              color: "white",
              fontWeight: 900,
              cursor:
                starting || (job && job.status !== "done" && job.status !== "error")
                  ? "not-allowed"
                  : "pointer",
              boxShadow:
                starting || (job && job.status !== "done" && job.status !== "error")
                  ? "none"
                  : "0 12px 30px rgba(109,94,252,0.22)",
            }}
          >
            {starting ? "Starting…" : "Engage Render"}
          </button>
          {job?.status === "done" && job?.outputUrl ? (
            <a
              href={`${API_BASE}${job.outputUrl}`}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              Download MP4
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.10)",
            color: "#ffd2d2",
          }}
        >
          {error}
        </div>
      ) : null}

      {jobId ? <ProgressTracker job={job} /> : null}

      <div style={{ display: "grid", gap: 12 }}>
        {scenes.map((scene) => {
          const sceneNum = scene.scene_number ?? scene.sceneNumber ?? "";
          const title = `SCENE ${sceneNum || ""}${scene.label ? ` — ${scene.label}` : ""}`;
          const subtitleParts = [];
          if (Array.isArray(scene.text_slots) && scene.text_slots.length) subtitleParts.push(`${scene.text_slots.length} text`);
          if (Array.isArray(scene.image_slots) && scene.image_slots.length) subtitleParts.push(`${scene.image_slots.length} images`);
          const subtitle = subtitleParts.join(" · ");

          const maxChars = Number(scene.max_chars_per_slot || 100);

          return (
            <SceneCard
              key={String(sceneNum) + (scene.label || "")}
              title={title}
              subtitle={subtitle}
              right={
                maxChars ? (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Max chars/slot: <strong>{maxChars}</strong>
                  </div>
                ) : null
              }
            >
              {(scene.text_slots || []).map((slot) => {
                const val = String(textBySlot?.[slot] ?? "");
                const over = val.length > maxChars;
                return (
                  <div key={slot} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{slot}</div>
                      <div style={{ fontSize: 12, opacity: 0.75, color: over ? "#ffd2d2" : "inherit" }}>
                        {val.length}/{maxChars}
                      </div>
                    </div>
                    <input
                      value={val}
                      onChange={(e) =>
                        setTextBySlot((prev) => ({
                          ...prev,
                          [slot]: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${over ? "rgba(255,80,80,0.55)" : "rgba(255,255,255,0.14)"}`,
                        background: "rgba(255,255,255,0.05)",
                        color: "inherit",
                        outline: "none",
                      }}
                    />
                  </div>
                );
              })}

              {(scene.image_slots || []).map((slot) => (
                <ImageUploader
                  key={slot}
                  label={`${slot} → ${String(cfg?.image_map?.[slot] ?? "")}`}
                  value={uploadPathBySlot?.[slot] || ""}
                  onChange={(p) =>
                    setUploadPathBySlot((prev) => ({
                      ...prev,
                      [slot]: p,
                    }))
                  }
                />
              ))}
            </SceneCard>
          );
        })}
      </div>
    </div>
  );
}

