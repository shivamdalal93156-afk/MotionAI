import { useState, useEffect, useRef } from "react";

const API = "http://localhost:3001";

export default function App() {
  const [templates, setTemplates]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [fields, setFields]         = useState({});
  const [jobId, setJobId]           = useState(null);
  const [status, setStatus]         = useState(null);
  const [errorMsg, setErrorMsg]     = useState(null);
  const [videoUrl, setVideoUrl]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [logs, setLogs]             = useState([]);
  const pollRef                     = useRef(null);
  const logsEndRef                  = useRef(null);

  // Load templates on mount
  useEffect(() => {
    fetch(`${API}/api/render/templates`)
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => setErrorMsg("Cannot reach backend on port 3001"));
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function selectTemplate(tmpl) {
    setSelected(tmpl);
    // Pre-fill all fields with empty strings
    const initial = {};
    [...(tmpl.textFields || []), ...(tmpl.imageFields || [])].forEach(f => {
      initial[f.key] = "";
    });
    setFields(initial);
    reset();
  }

  function reset() {
    stopPolling();
    setJobId(null);
    setStatus(null);
    setErrorMsg(null);
    setVideoUrl(null);
    setLogs([]);
    setLoading(false);
  }

  function log(msg, type = "info") {
    setLogs(p => [...p, { msg, type, t: new Date().toLocaleTimeString() }]);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling(id) {
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/api/jobs/${id}`);
        const data = await res.json();
        setStatus(data.status);

        if (data.status === "lock")             log("Rendering in After Effects...", "info");
        if (data.status === "retry_scheduled")  log("Retrying after error...", "warn");

        if (data.status === "done") {
          stopPolling();
          setLoading(false);
          setVideoUrl(`${API}${data.outputUrl}`);
          log("Render complete!", "success");
        }
        if (data.status === "error") {
          stopPolling();
          setLoading(false);
          setErrorMsg(`${data.errorReason || "Unknown error"}: ${data.errorDetail || ""}`);
          log(`Failed: ${data.errorReason}`, "error");
        }
      } catch (e) {
        log(`Poll failed: ${e.message}`, "error");
      }
    }, 3000);
  }

  async function handleRender() {
    if (!selected) return;
    reset();
    setLoading(true);
    log(`Starting render: ${selected.id}`);

    try {
      const res  = await fetch(`${API}/api/render/start`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ template: selected.id, inputData: fields }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        setErrorMsg(`${data.error}: ${data.message}`);
        log(`Error: ${data.error}`, "error");
        return;
      }

      setJobId(data.jobId);
      setStatus("pending");
      log(`Job queued — ${data.jobId.slice(0, 8)}...`);
      log("Polling every 3s...");
      startPolling(data.jobId);
    } catch (e) {
      setLoading(false);
      setErrorMsg(`Network error: ${e.message}`);
    }
  }

  const STAGE_LABEL = {
    pending:          { label: "Queued",     color: "#f59e0b" },
    lock:             { label: "Rendering",  color: "#3b82f6" },
    retry_scheduled:  { label: "Retrying",   color: "#8b5cf6" },
    done:             { label: "Done",       color: "#10b981" },
    error:            { label: "Failed",     color: "#ef4444" },
  };

  const stage = STAGE_LABEL[status];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0c0c0e",
      color: "#d4d4d8",
      fontFamily: "'DM Mono', 'Fira Mono', monospace",
      display: "flex",
    }}>

      {/* ── Sidebar: template picker ── */}
      <div style={{
        width: "240px",
        minHeight: "100vh",
        background: "#111114",
        borderRight: "1px solid #1e1e24",
        padding: "24px 0",
        flexShrink: 0,
      }}>
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #1e1e24" }}>
          <div style={{ fontSize: "11px", color: "#52525b", letterSpacing: "0.1em" }}>MOTIONAI</div>
          <div style={{ fontSize: "16px", color: "#fff", marginTop: "2px" }}>Templates</div>
        </div>

        <div style={{ padding: "12px 8px" }}>
          {templates.length === 0 && (
            <div style={{ padding: "12px", fontSize: "12px", color: "#52525b" }}>
              No templates found
            </div>
          )}
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => selectTemplate(t)}
              style={{
                padding: "10px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
                background: selected?.id === t.id ? "#1e1e2e" : "transparent",
                color: selected?.id === t.id ? "#a78bfa" : "#a1a1aa",
                borderLeft: selected?.id === t.id ? "2px solid #7c3aed" : "2px solid transparent",
                marginBottom: "2px",
                transition: "all 0.15s",
              }}
            >
              {t.id.replace(/_/g, " ")}
              <div style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>
                {t.textFields.length} text · {t.imageFields.length} image
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, padding: "32px", maxWidth: "800px" }}>

        {!selected && (
          <div style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#3f3f46",
            fontSize: "14px",
          }}>
            ← Select a template to begin
          </div>
        )}

        {selected && (
          <>
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{ margin: 0, fontSize: "20px", color: "#fff" }}>
                {selected.id.replace(/_/g, " ")}
              </h2>
              <div style={{ fontSize: "12px", color: "#52525b", marginTop: "4px" }}>
                Comp: {selected.compName}
              </div>
            </div>

            {/* Text fields */}
            {selected.textFields.length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "12px" }}>
                  TEXT LAYERS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {selected.textFields.map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>
                        {f.label}
                      </label>
                      <input
                        value={fields[f.key] || ""}
                        onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={`Enter ${f.label}...`}
                        style={{
                          width: "100%",
                          background: "#18181b",
                          border: "1px solid #27272a",
                          borderRadius: "6px",
                          color: "#e4e4e7",
                          fontFamily: "inherit",
                          fontSize: "13px",
                          padding: "8px 10px",
                          boxSizing: "border-box",
                          outline: "none",
                          transition: "border 0.15s",
                        }}
                        onFocus={e => e.target.style.borderColor = "#7c3aed"}
                        onBlur={e => e.target.style.borderColor = "#27272a"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Image fields */}
            {selected.imageFields.length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "12px" }}>
                  IMAGE LAYERS (full file path)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                  {selected.imageFields.map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: "11px", color: "#71717a", display: "block", marginBottom: "4px" }}>
                        {f.label}
                      </label>
                      <input
                        value={fields[f.key] || ""}
                        onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder="C:/path/to/image.jpg"
                        style={{
                          width: "100%",
                          background: "#18181b",
                          border: "1px solid #27272a",
                          borderRadius: "6px",
                          color: "#e4e4e7",
                          fontFamily: "inherit",
                          fontSize: "13px",
                          padding: "8px 10px",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                        onFocus={e => e.target.style.borderColor = "#7c3aed"}
                        onBlur={e => e.target.style.borderColor = "#27272a"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Render button */}
            <button
              onClick={handleRender}
              disabled={loading}
              style={{
                background:   loading ? "#27272a" : "#7c3aed",
                color:        loading ? "#52525b" : "#fff",
                border:       "none",
                borderRadius: "8px",
                padding:      "12px 32px",
                fontSize:     "13px",
                fontFamily:   "inherit",
                cursor:       loading ? "not-allowed" : "pointer",
                marginBottom: "24px",
                transition:   "background 0.2s",
              }}
            >
              {loading ? "⏳ Rendering..." : "▶ Start Render"}
            </button>

            {/* Status badge */}
            {stage && (
              <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{
                  background:   stage.color + "18",
                  border:       `1px solid ${stage.color}55`,
                  color:        stage.color,
                  borderRadius: "4px",
                  padding:      "3px 10px",
                  fontSize:     "11px",
                  letterSpacing: "0.05em",
                }}>
                  {stage.label.toUpperCase()}
                </span>
                {jobId && (
                  <span style={{ fontSize: "10px", color: "#3f3f46" }}>
                    {jobId.slice(0, 8)}...
                  </span>
                )}
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div style={{
                background:   "#1a0808",
                border:       "1px solid #7f1d1d",
                borderRadius: "8px",
                padding:      "12px",
                color:        "#fca5a5",
                fontSize:     "12px",
                marginBottom: "16px",
                whiteSpace:   "pre-wrap",
                wordBreak:    "break-word",
              }}>
                {errorMsg}
              </div>
            )}

            {/* Video */}
            {videoUrl && (
              <div style={{ marginBottom: "24px" }}>
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  style={{
                    width:        "100%",
                    borderRadius: "8px",
                    border:       "1px solid #27272a",
                    display:      "block",
                    marginBottom: "8px",
                  }}
                />
                <a href={videoUrl} download style={{ color: "#7c3aed", fontSize: "12px" }}>
                  ⬇ Download MP4
                </a>
              </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <div style={{
                background:   "#111114",
                border:       "1px solid #1e1e24",
                borderRadius: "8px",
                padding:      "12px",
                fontSize:     "11px",
                lineHeight:   "1.9",
                maxHeight:    "200px",
                overflowY:    "auto",
              }}>
                {logs.map((l, i) => (
                  <div key={i} style={{
                    color: l.type === "success" ? "#10b981"
                         : l.type === "error"   ? "#ef4444"
                         : l.type === "warn"    ? "#f59e0b"
                         : "#52525b",
                  }}>
                    <span style={{ color: "#3f3f46" }}>{l.t} </span>{l.msg}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}