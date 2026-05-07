// import { useState, useEffect, useRef } from "react";
// import FileUpload from "./FileUpload.jsx";

// const API = "http://localhost:3001";

// export default function App() {
//   const [templates, setTemplates]   = useState([]);
//   const [selected, setSelected]     = useState(null);
//   const [chunks, setChunks]         = useState([{}]); // array of inputData objects
//   const [jobId, setJobId]           = useState(null);
//   const [jobStatus, setJobStatus]   = useState(null);
//   const [currentChunk, setCurrentChunk] = useState(null);
//   const [totalChunks, setTotalChunks]   = useState(null);
//   const [errorMsg, setErrorMsg]     = useState(null);
//   const [videoUrl, setVideoUrl]     = useState(null);
//   const [loading, setLoading]       = useState(false);
//   const [logs, setLogs]             = useState([]);
//   const pollRef                     = useRef(null);
//   const logsEndRef                  = useRef(null);
  

//   useEffect(() => {
//     fetch(`${API}/api/render/templates`)
//       .then(r => r.json())
//       .then(d => setTemplates(d.templates || []))
//       .catch(() => setErrorMsg("Cannot reach backend on port 3001"));
//   }, []);

//   useEffect(() => {
//     logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
//   }, [logs]);

//   function selectTemplate(tmpl) {
//     setSelected(tmpl);
//     setChunks([makeEmptyChunk(tmpl)]);
//     reset();
//   }

//   function makeEmptyChunk(tmpl) {
//     const obj = {};
//     [...(tmpl.textFields || []), ...(tmpl.imageFields || [])].forEach(f => {
//       obj[f.key] = "";
//     });
//     return obj;
//   }

//   function reset() {
//     stopPolling();
//     setJobId(null);
//     setJobStatus(null);
//     setCurrentChunk(null);
//     setTotalChunks(null);
//     setErrorMsg(null);
//     setVideoUrl(null);
//     setLogs([]);
//     setLoading(false);
//   }

//   function log(msg, type = "info") {
//     setLogs(p => [...p, { msg, type, t: new Date().toLocaleTimeString() }]);
//   }

//   function stopPolling() {
//     if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
//   }

//   function startPolling(id) {
//     pollRef.current = setInterval(async () => {
//       try {
//         const res  = await fetch(`${API}/api/jobs/${id}`);
//         const data = await res.json();
//         setJobStatus(data.status);
//         if (data.currentChunk) setCurrentChunk(data.currentChunk);
//         if (data.totalChunks)  setTotalChunks(data.totalChunks);

//         if (data.status === "lock") {
//           const chunkInfo = data.totalChunks > 1
//             ? ` (Part ${data.currentChunk}/${data.totalChunks})`
//             : '';
//           log(`Rendering in After Effects${chunkInfo}...`);
//         }

//         if (data.status === "done") {
//           stopPolling();
//           setLoading(false);
//           setVideoUrl(`${API}${data.outputUrl}`);
//           log("Render complete!", "success");
//         }
//         if (data.status === "error") {
//           stopPolling();
//           setLoading(false);
//           setErrorMsg(`${data.errorReason}: ${data.errorDetail || ""}`);
//           log(`Failed: ${data.errorReason}`, "error");
//         }
//       } catch (e) {
//         log(`Poll error: ${e.message}`, "error");
//       }
//     }, 3000);
//   }

//   function addChunk() {
//     setChunks(prev => [...prev, makeEmptyChunk(selected)]);
//   }

//   function removeChunk(index) {
//     setChunks(prev => prev.filter((_, i) => i !== index));
//   }

//   function updateField(chunkIndex, key, value) {
//     setChunks(prev => {
//       const next = [...prev];
//       next[chunkIndex] = { ...next[chunkIndex], [key]: value };
//       return next;
//     });
//   }

//   async function handleRender() {
//     if (!selected) return;
//     reset();
//     setLoading(true);
//     log(`Starting render: ${selected.id} — ${chunks.length} part(s)`);

//     const body = chunks.length === 1
//       ? { template: selected.id, inputData: chunks[0] }
//       : { template: selected.id, inputData: chunks[0], chunks };

//     try {
//       const res  = await fetch(`${API}/api/render/start`, {
//         method:  "POST",
//         headers: { "Content-Type": "application/json" },
//         body:    JSON.stringify(body),
//       });
//       const data = await res.json();

//       if (!res.ok) {
//         setLoading(false);
//         setErrorMsg(`${data.error}: ${data.message}`);
//         return;
//       }

//       setJobId(data.jobId);
//       setJobStatus("pending");
//       log(`Job queued — ${data.jobId.slice(0, 8)}...`);
//       startPolling(data.jobId);
//     } catch (e) {
//       setLoading(false);
//       setErrorMsg(`Network error: ${e.message}`);
//     }
//   }

//   const STAGE = {
//     pending:         { label: "Queued",    color: "#f59e0b" },
//     lock:            { label: currentChunk && totalChunks > 1 ? `Rendering Part ${currentChunk}/${totalChunks}` : "Rendering", color: "#3b82f6" },
//     retry_scheduled: { label: "Retrying",  color: "#8b5cf6" },
//     done:            { label: "Done",      color: "#10b981" },
//     error:           { label: "Failed",    color: "#ef4444" },
//   };

//   const stage = STAGE[jobStatus];

//   return (
//     <div style={{
//       minHeight: "100vh",
//       background: "#0c0c0e",
//       color: "#d4d4d8",
//       fontFamily: "'DM Mono', 'Fira Mono', monospace",
//       display: "flex",
//     }}>

//       {/* Sidebar */}
//       <div style={{
//         width: "220px",
//         minHeight: "100vh",
//         background: "#111114",
//         borderRight: "1px solid #1e1e24",
//         padding: "24px 0",
//         flexShrink: 0,
//       }}>
//         <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #1e1e24" }}>
//           <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em" }}>MOTIONAI</div>
//           <div style={{ fontSize: "16px", color: "#fff", marginTop: "2px" }}>Templates</div>
//         </div>
//         <div style={{ padding: "12px 8px" }}>
//           {templates.length === 0 && (
//             <div style={{ padding: "12px", fontSize: "12px", color: "#52525b" }}>No templates found</div>
//           )}
//           {templates.map(t => (
//             <div key={t.id} onClick={() => selectTemplate(t)} style={{
//               padding: "10px 12px",
//               borderRadius: "6px",
//               cursor: "pointer",
//               fontSize: "12px",
//               background: selected?.id === t.id ? "#1e1e2e" : "transparent",
//               color: selected?.id === t.id ? "#a78bfa" : "#a1a1aa",
//               borderLeft: selected?.id === t.id ? "2px solid #7c3aed" : "2px solid transparent",
//               marginBottom: "2px",
//             }}>
//               {t.id.replace(/_/g, " ")}
//               <div style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>
//                 {t.textFields.length} text · {t.imageFields.length} image
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* Main */}
//       <div style={{ flex: 1, padding: "32px", maxWidth: "860px", overflowY: "auto" }}>
//         {!selected ? (
//           <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#3f3f46", fontSize: "14px" }}>
//             ← Select a template to begin
//           </div>
//         ) : (
//           <>
//             <div style={{ marginBottom: "28px" }}>
//               <h2 style={{ margin: 0, fontSize: "20px", color: "#fff" }}>
//                 {selected.id.replace(/_/g, " ")}
//               </h2>
//               <div style={{ fontSize: "12px", color: "#52525b", marginTop: "4px" }}>
//                 Comp: {selected.compName} · {chunks.length} part{chunks.length > 1 ? "s" : ""}
//               </div>
//             </div>

//             {/* Chunks */}
//             {chunks.map((chunk, chunkIdx) => (
//               <div key={chunkIdx} style={{
//                 background: "#111114",
//                 border: "1px solid #1e1e24",
//                 borderRadius: "10px",
//                 padding: "20px",
//                 marginBottom: "16px",
//               }}>
//                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
//                   <div style={{ fontSize: "11px", color: "#52525b", letterSpacing: "0.08em" }}>
//                     {chunks.length > 1 ? `PART ${chunkIdx + 1}` : "INPUT"}
//                   </div>
//                   {chunks.length > 1 && chunkIdx > 0 && (
//                     <button onClick={() => removeChunk(chunkIdx)} style={{
//                       background: "transparent",
//                       border: "1px solid #3f3f46",
//                       borderRadius: "4px",
//                       color: "#71717a",
//                       fontSize: "11px",
//                       cursor: "pointer",
//                       padding: "2px 8px",
//                     }}>
//                       Remove
//                     </button>
//                   )}
//                 </div>

//                 {/* Text fields */}
//                 {selected.textFields.length > 0 && (
//                   <div style={{ marginBottom: "14px" }}>
//                     <div style={{ fontSize: "10px", color: "#3f3f46", marginBottom: "8px" }}>TEXT</div>
//                     <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
//                       {selected.textFields.map(f => (
//                         <div key={f.key}>
//                           <label style={{ fontSize: "10px", color: "#71717a", display: "block", marginBottom: "3px" }}>
//                             {f.label}
//                           </label>
//                           <input
//                             value={chunk[f.key] || ""}
//                             onChange={e => updateField(chunkIdx, f.key, e.target.value)}
//                             placeholder={`${f.label}...`}
//                             style={{
//                               width: "100%", background: "#18181b", border: "1px solid #27272a",
//                               borderRadius: "6px", color: "#e4e4e7", fontFamily: "inherit",
//                               fontSize: "12px", padding: "7px 9px", boxSizing: "border-box", outline: "none",
//                             }}
//                             onFocus={e => e.target.style.borderColor = "#7c3aed"}
//                             onBlur={e => e.target.style.borderColor = "#27272a"}
//                           />
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}

//                 {/* Image fields */}
//                 {selected.imageFields.length > 0 && (
//   <div>
//     <div style={{ fontSize: "10px", color: "#3f3f46", marginBottom: "10px" }}>
//       IMAGES
//     </div>
//     <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
//       {selected.imageFields.map(f => (
//         <FileUpload
//           key={f.key}
//           label={f.label}
//           value={chunk[f.key] || ""}
//           onChange={val => updateField(chunkIdx, f.key, val)}
//         />
//       ))}
//     </div>
//   </div>
// )}
//               </div>
//             ))}

//             {/* Add More button */}
//             <button onClick={addChunk} disabled={loading} style={{
//               background: "transparent",
//               border: "1px dashed #3f3f46",
//               borderRadius: "8px",
//               color: "#71717a",
//               fontSize: "12px",
//               fontFamily: "inherit",
//               cursor: "pointer",
//               padding: "10px 20px",
//               width: "100%",
//               marginBottom: "20px",
//               transition: "border-color 0.15s, color 0.15s",
//             }}
//               onMouseEnter={e => { e.target.style.borderColor = "#7c3aed"; e.target.style.color = "#a78bfa"; }}
//               onMouseLeave={e => { e.target.style.borderColor = "#3f3f46"; e.target.style.color = "#71717a"; }}
//             >
//               + Add More (Part {chunks.length + 1})
//             </button>

//             {/* Render button */}
//             <button onClick={handleRender} disabled={loading} style={{
//               background: loading ? "#27272a" : "#7c3aed",
//               color: loading ? "#52525b" : "#fff",
//               border: "none", borderRadius: "8px",
//               padding: "12px 32px", fontSize: "13px",
//               fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
//               marginBottom: "24px",
//             }}>
//               {loading
//                 ? currentChunk && totalChunks > 1
//                   ? `⏳ Rendering Part ${currentChunk}/${totalChunks}...`
//                   : "⏳ Rendering..."
//                 : `▶ Start Render${chunks.length > 1 ? ` (${chunks.length} parts)` : ""}`
//               }
//             </button>

//             {/* Status badge */}
//             {stage && (
//               <div style={{ marginBottom: "16px" }}>
//                 <span style={{
//                   background: stage.color + "18", border: `1px solid ${stage.color}55`,
//                   color: stage.color, borderRadius: "4px", padding: "3px 10px",
//                   fontSize: "11px", letterSpacing: "0.05em",
//                 }}>
//                   {stage.label.toUpperCase()}
//                 </span>
//                 {jobId && <span style={{ marginLeft: "10px", fontSize: "10px", color: "#3f3f46" }}>{jobId.slice(0, 8)}...</span>}
//               </div>
//             )}

//             {/* Error */}
//             {errorMsg && (
//               <div style={{
//                 background: "#1a0808", border: "1px solid #7f1d1d", borderRadius: "8px",
//                 padding: "12px", color: "#fca5a5", fontSize: "12px", marginBottom: "16px",
//                 whiteSpace: "pre-wrap", wordBreak: "break-word",
//               }}>
//                 {errorMsg}
//               </div>
//             )}

//             {/* Video */}
//             {videoUrl && (
//               <div style={{ marginBottom: "24px" }}>
//                 <video src={videoUrl} controls autoPlay style={{
//                   width: "100%", borderRadius: "8px",
//                   border: "1px solid #27272a", display: "block", marginBottom: "8px",
//                 }} />
//                 <a href={videoUrl} download style={{ color: "#7c3aed", fontSize: "12px" }}>⬇ Download MP4</a>
//               </div>
//             )}

//             {/* Logs */}
//             {logs.length > 0 && (
//               <div style={{
//                 background: "#111114", border: "1px solid #1e1e24", borderRadius: "8px",
//                 padding: "12px", fontSize: "11px", lineHeight: "1.9",
//                 maxHeight: "200px", overflowY: "auto",
//               }}>
//                 {logs.map((l, i) => (
//                   <div key={i} style={{
//                     color: l.type === "success" ? "#10b981" : l.type === "error" ? "#ef4444" : l.type === "warn" ? "#f59e0b" : "#52525b",
//                   }}>
//                     <span style={{ color: "#3f3f46" }}>{l.t} </span>{l.msg}
//                   </div>
//                 ))}
//                 <div ref={logsEndRef} />
//               </div>
//             )}
//           </>
//         )}
//       </div>
//     </div>
//   );
// }
import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://tripp-acinaceous-bellicosely.ngrok-free.dev";

// ── Upload ────────────────────────────────────────────────────────────────────
function useUpload() {
  return useCallback(async (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd  = new FormData();
      fd.append("file", file);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const d = JSON.parse(xhr.responseText);
            resolve(d.path || d.filePath || d.url);
          } catch { reject(new Error("Bad response")); }
        } else reject(new Error("Upload failed"));
      };
      xhr.onerror = () => reject(new Error("Network"));
      xhr.open("POST", `${API}/api/upload`);
      xhr.send(fd);
    });
  }, []);
}

// ── Normalize template from API ───────────────────────────────────────────────
// API: { id, compName, fps, duration, textFields:[{key,label}], imageFields:[{key,label}], sceneMap }
function norm(t) {
  const name = t.id || t.name || "";
  const previewBase = `${API}/templates/${encodeURIComponent(name)}/preview`;
  return {
    ...t,
    name,
    previewBase,
    config: {
      compName:    t.compName,
      fps:         t.fps,
      duration:    t.duration,
      imageLayers: t.imageFields || t.imageLayers || [],
      textLayers:  t.textFields  || t.textLayers  || [],
      sceneMap:    t.sceneMap    || {},
    }
  };
}

// ── Label cleaner ─────────────────────────────────────────────────────────────
// Turns "01 - Newspaper-Big" → "Newspaper Big", "photo_03" → "Photo 3", "badge_name" → "Badge Name"
function cleanLabel(raw = "") {
  return raw
    .replace(/^\d+\s*[-–]\s*/, "")   // strip leading "01 - "
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ── Number from key: photo_01→1, image_3→3, person11_name→11 ─────────────────
function keyNum(key = "") {
  const m = key.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// ── Pair image fields with name text fields ───────────────────────────────────
function buildFields(config) {
  if (!config) return { rows: [], extraText: [] };
  const imgF  = config.imageLayers || [];
  const txtF  = config.textLayers  || [];
  const used  = new Set();

  const rows = imgF.map(img => {
    const n = keyNum(img.key);
    const match = n !== null
      ? txtF.find(t => {
          const tn = keyNum(t.key);
          return tn === n && (t.key.includes("name") || t.key.includes("title"));
        })
      : null;
    if (match) used.add(match.key);
    return { img, text: match || null };
  });

  const extraText = txtF.filter(t => !used.has(t.key));
  return { rows, extraText };
}

// ── Colour palette for template cards (by index) ──────────────────────────────
const PALETTES = [
  "#1a1a2e","#16213e","#0f3460","#1b1b2f","#2d132c","#1f4068","#1b262c","#162447",
  "#1a1a1a","#2c2c2c","#3d2b1f","#1e3a2f","#2b1d3a","#1a2e1a","#2e1a1a","#1a2535",
];
const cardBg = i => PALETTES[i % PALETTES.length];

// ── Icons ─────────────────────────────────────────────────────────────────────
const ICONS = { investigation:"🔍", carousel:"🎠", slideshow:"🖼", decoder:"💻", typography:"✍️", labor:"🏗", motion:"🎬", dynamic:"⚡" };
const tIcon = n => { const l=(n||"").toLowerCase(); for(const[k,v] of Object.entries(ICONS)) if(l.includes(k)) return v; return "🎬"; };

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f0eeea;
  --bg2:#e8e6e1;
  --white:#ffffff;
  --ink:#111110;
  --ink2:#5c5b56;
  --ink3:#9e9d97;
  --border:#dddcd7;
  --accent:#ff4500;
  --accentH:#e03d00;
  --green:#16a34a;
  --r:10px;
  --panel:380px;
}
html,body,#root{height:100%;font-family:'Inter',sans-serif;}
body{background:var(--bg);color:var(--ink);overflow:hidden;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
::-webkit-scrollbar-track{background:transparent;}

/* ── Shell ── */
.shell{display:grid;grid-template-rows:52px 1fr;height:100vh;overflow:hidden;}

/* ── Topbar ── */
.bar{
  display:flex;align-items:center;padding:0 16px;gap:10px;
  background:var(--white);border-bottom:1px solid var(--border);
  position:relative;z-index:50;
}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:18px;letter-spacing:-.03em;flex-shrink:0;}
.logo em{color:var(--accent);font-style:normal;}
.vl{width:1px;height:18px;background:var(--border);}
.crumb{font-size:12px;color:var(--ink2);font-weight:500;cursor:pointer;transition:color .12s;}
.crumb:hover{color:var(--ink);}
.crumb-sep{color:var(--ink3);font-size:11px;padding:0 3px;}
.sp{flex:1;}
.chip{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:var(--ink3);}
.dot{width:5px;height:5px;border-radius:50%;background:var(--ink3);}
.dot.g{background:var(--green);animation:blink 1.1s infinite;}
.dot.r{background:#dc2626;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}

/* ── Views ── */
.view{display:none;height:100%;overflow:hidden;}
.view.active{display:flex;}

/* ════════════════════════════════════
   GALLERY VIEW
   ════════════════════════════════════ */
.gallery{flex-direction:column;background:var(--bg);}
.gallery-head{padding:28px 32px 16px;flex-shrink:0;}
.gallery-head h1{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;letter-spacing:-.03em;}
.gallery-head p{font-size:13px;color:var(--ink2);margin-top:4px;}
.gallery-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:16px;padding:0 32px 32px;
  overflow-y:auto;
}
.tcard{
  border-radius:14px;overflow:hidden;cursor:pointer;
  background:var(--white);border:1px solid var(--border);
  transition:transform .15s,box-shadow .15s;
  display:flex;flex-direction:column;
}
.tcard:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.1);}
.tcard-thumb{
  height:130px;position:relative;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
}
.tcard-thumb video,.tcard-thumb img{
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
}
.tcard-thumb .big-icon{font-size:40px;opacity:.35;z-index:1;}
.tcard-info{padding:12px 14px;}
.tcard-name{font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tcard-meta{font-size:11px;color:var(--ink3);margin-top:3px;}
.tcard-tag{
  display:inline-flex;align-items:center;gap:3px;
  font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;
  background:var(--bg2);color:var(--ink3);margin-top:6px;
}

/* ════════════════════════════════════
   EDITOR VIEW
   ════════════════════════════════════ */
.editor{flex-direction:row;}

/* Left: video + scenes */
.left{
  flex:1;display:flex;flex-direction:column;overflow:hidden;
  background:#101010;
}
.vid-area{
  flex:1;position:relative;display:flex;align-items:center;
  justify-content:center;overflow:hidden;
}
.vid-area video{width:100%;height:100%;object-fit:contain;}
.vid-empty{display:flex;flex-direction:column;align-items:center;gap:10px;color:#2a2a2a;}
.vid-empty .pico{width:52px;height:52px;border-radius:50%;border:1.5px solid #232323;display:flex;align-items:center;justify-content:center;font-size:20px;}
.vid-empty p{font-size:12px;color:#333;}

/* render overlay */
.rov{position:absolute;inset:0;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:white;z-index:10;}
.rov-stage{font-size:12px;color:rgba(255,255,255,.45);}
.rbar{width:160px;height:2px;background:rgba(255,255,255,.08);border-radius:1px;overflow:hidden;}
.rfill{height:100%;background:var(--accent);border-radius:1px;transition:width .4s;}
.rfill.ind{width:35%!important;animation:ind 1.3s infinite ease-in-out;}
@keyframes ind{0%{transform:translateX(-150%)}100%{transform:translateX(430%)}}
.rspin{width:26px;height:26px;border:2px solid rgba(255,255,255,.1);border-top-color:var(--accent);border-radius:50%;animation:spin .75s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}

/* scene strip */
.sstrip{flex-shrink:0;background:#0a0a0a;border-top:1px solid #1c1c1c;padding:10px 14px 12px;}
.sstrip-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.sstrip-lbl{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#2a2a2a;}
.sstrip-ct{font-size:10px;color:#2a2a2a;}
.srow{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;}
.srow::-webkit-scrollbar{height:2px;}
.sc{flex-shrink:0;width:78px;cursor:pointer;display:flex;flex-direction:column;gap:3px;}
.sc-frame{
  width:78px;height:48px;border-radius:6px;
  background:#181818;border:1.5px solid transparent;
  overflow:hidden;display:flex;align-items:center;justify-content:center;
  transition:border-color .12s;
}
.sc.act .sc-frame{border-color:var(--accent);}
.sc-frame img{width:100%;height:100%;object-fit:cover;}
.sc-frame video{width:100%;height:100%;object-fit:cover;}
.sc-t{font-size:9px;font-weight:700;color:#282828;}
.sc.act .sc-t{color:var(--accent);}
.sc-n{font-size:9px;color:#2e2e2e;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sc.act .sc-n{color:#555;}

/* Right: form panel */
.right{
  width:var(--panel);flex-shrink:0;
  display:flex;flex-direction:column;
  background:var(--white);border-left:1px solid var(--border);
  overflow:hidden;
}

/* part tabs */
.ptabs{
  display:flex;align-items:center;padding:0 12px;
  border-bottom:1px solid var(--border);height:42px;gap:3px;flex-shrink:0;
}
.ptab{padding:5px 11px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;color:var(--ink2);border:none;background:transparent;transition:all .1s;}
.ptab:hover{background:var(--bg);color:var(--ink);}
.ptab.on{background:var(--ink);color:white;}
.ptsp{flex:1;}
.pparts{display:flex;gap:3px;}
.pp{padding:3px 8px;border-radius:5px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--ink2);}
.pp.on{background:var(--accent);color:white;border-color:var(--accent);}
.pp-add{padding:3px 8px;border-radius:5px;font-size:11px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--ink3);}
.pp-add:hover{border-color:var(--accent);color:var(--accent);}

/* form scroll */
.fscroll{flex:1;overflow-y:auto;padding:10px;}

/* section header */
.sec-h{
  font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink3);padding:14px 2px 6px;
  border-bottom:1px solid var(--border);margin-bottom:6px;
}
.sec-h:first-child{padding-top:4px;}

/* ── IMAGE + NAME ROW ── */
.irow{
  display:grid;grid-template-columns:54px 1fr;gap:8px;
  align-items:center;padding:7px 8px;border-radius:8px;
  border:1px solid var(--border);background:var(--bg);
  margin-bottom:6px;transition:border-color .12s,background .12s;
}
.irow:focus-within{border-color:#ffb090;background:#fff9f7;}

/* thumb */
.thumb{
  width:54px;height:54px;border-radius:8px;
  border:1.5px dashed var(--border);background:var(--white);
  position:relative;overflow:hidden;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  transition:border-color .12s,background .12s;flex-shrink:0;
}
.thumb:hover{border-color:var(--accent);background:#fff5f0;}
.thumb.has{border-style:solid;border-color:rgba(0,0,0,.08);}
.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.thumb input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.th-ico{font-size:16px;color:var(--ink3);pointer-events:none;z-index:1;}
.th-lbl{font-size:8px;color:var(--ink3);pointer-events:none;z-index:1;}
.thumb.has .th-ico,.thumb.has .th-lbl{display:none;}
.th-x{position:absolute;top:2px;right:2px;z-index:3;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.55);border:none;color:white;font-size:9px;cursor:pointer;display:none;align-items:center;justify-content:center;}
.thumb.has .th-x{display:flex;}

.iinfo{display:flex;flex-direction:column;gap:4px;min-width:0;}
.iinfo-lbl{font-size:10px;font-weight:600;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.iinfo input{
  border:1px solid var(--border);border-radius:6px;
  background:var(--white);color:var(--ink);
  font-family:'Inter',sans-serif;font-size:12px;
  padding:5px 8px;width:100%;outline:none;transition:border-color .12s;
}
.iinfo input:focus{border-color:var(--accent);}
.iinfo input::placeholder{color:var(--ink3);}
.iinfo-only{font-size:11px;color:var(--ink2);font-weight:500;padding-top:2px;}

/* upload progress */
.uprog{height:2px;background:var(--border);border-radius:1px;overflow:hidden;margin-top:2px;}
.uprog-f{height:100%;background:var(--accent);border-radius:1px;transition:width .25s;}

/* ── TEXT FIELD ── */
.tfield{
  display:flex;flex-direction:column;gap:4px;
  padding:8px 10px;border-radius:8px;
  border:1px solid var(--border);background:var(--bg);
  margin-bottom:6px;transition:border-color .12s,background .12s;
}
.tfield:focus-within{border-color:#b0c0ff;background:#f7f8ff;}
.tfield label{font-size:10px;font-weight:600;color:var(--ink2);}
.tfield input,.tfield textarea{
  border:none;background:transparent;color:var(--ink);
  font-family:'Inter',sans-serif;font-size:13px;
  padding:0;width:100%;outline:none;resize:none;line-height:1.5;
}
.tfield textarea{min-height:52px;}

/* ── SUBMIT BAR ── */
.sbar{padding:10px;border-top:1px solid var(--border);flex-shrink:0;}
.btn-r{
  width:100%;background:var(--accent);color:white;border:none;
  border-radius:var(--r);font-family:'Syne',sans-serif;
  font-size:14px;font-weight:800;padding:13px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;
  transition:background .12s,transform .1s;
}
.btn-r:hover{background:var(--accentH);}
.btn-r:active{transform:scale(.99);}
.btn-r:disabled{opacity:.4;cursor:not-allowed;}
.brow{display:flex;gap:7px;}
.btn-s{flex:1;background:transparent;border:1px solid var(--border);border-radius:var(--r);font-family:'Inter',sans-serif;font-size:12px;font-weight:500;padding:11px;cursor:pointer;color:var(--ink2);transition:border-color .12s;}
.btn-s:hover{border-color:var(--ink3);color:var(--ink);}
.btn-dl{flex:1;background:var(--green);border:none;border-radius:var(--r);font-family:'Inter',sans-serif;font-size:12px;font-weight:600;padding:11px;cursor:pointer;color:white;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px;transition:opacity .12s;}
.btn-dl:hover{opacity:.85;}

/* toast */
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(60px);background:var(--ink);color:white;border-radius:100px;padding:9px 18px;font-size:12px;font-weight:500;z-index:9999;transition:transform .25s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;pointer-events:none;}
.toast.show{transform:translateX(-50%) translateY(0);}

@keyframes fadeUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.fu{animation:fadeUp .2s ease both;}
`;

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

// ── Thumb uploader ────────────────────────────────────────────────────────────
function Thumb({ value, onChange, uploadFn }) {
  const [preview, setPreview] = useState(null);
  const [prog, setProg]       = useState(0);
  const [busy, setBusy]       = useState(false);

  const pick = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setBusy(true); setProg(0);
    try { onChange(await uploadFn(f, setProg)); }
    catch { setPreview(null); }
    finally { setBusy(false); }
  };
  const clr = e => { e.stopPropagation(); setPreview(null); onChange(null); };

  return (
    <div>
      <div className={`thumb${preview ? " has" : ""}`}>
        {preview && <img src={preview} alt="" />}
        <span className="th-ico">↑</span>
        <span className="th-lbl">{busy ? `${prog}%` : "Upload"}</span>
        <input type="file" accept="image/*,video/*" onChange={pick} />
        <button className="th-x" onClick={clr}>×</button>
      </div>
      {busy && <div className="uprog"><div className="uprog-f" style={{ width: `${prog}%` }} /></div>}
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────
function TCard({ t, idx, onClick }) {
  const [mediaSrc, setMediaSrc] = useState(null);
  const [mediaType, setMediaType] = useState(null); // "video"|"img"|null

  useEffect(() => {
    // Try to load preview: video first, then image
    const exts = [
      { src: `${t.previewBase}/preview.mp4`,  type: "video" },
      { src: `${t.previewBase}/preview.webm`, type: "video" },
      { src: `${t.previewBase}/preview.jpg`,  type: "img" },
      { src: `${t.previewBase}/preview.png`,  type: "img" },
      { src: `${t.previewBase}/frame.jpg`,    type: "img" },
      { src: `${t.previewBase}/frame.png`,    type: "img" },
    ];
    let cancelled = false;
    (async () => {
      for (const { src, type } of exts) {
        try {
          const r = await fetch(src, { method: "HEAD" });
          if (r.ok && !cancelled) { setMediaSrc(src); setMediaType(type); return; }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [t.previewBase]);

  const bg = cardBg(idx);
  const dur = t.config?.duration ? `${Math.round(t.config.duration)}s` : null;
  const fps = t.config?.fps || null;
  const imgs = t.config?.imageLayers?.length || 0;
  const txts = t.config?.textLayers?.length  || 0;

  return (
    <div className="tcard fu" style={{ animationDelay: `${idx * 0.04}s` }} onClick={onClick}>
      <div className="tcard-thumb" style={{ background: bg }}>
        {mediaType === "video" && (
          <video src={mediaSrc} muted autoPlay loop playsInline style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }} />
        )}
        {mediaType === "img" && (
          <img src={mediaSrc} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }} />
        )}
        {!mediaSrc && <span className="big-icon">{tIcon(t.name)}</span>}
      </div>
      <div className="tcard-info">
        <div className="tcard-name">{cleanLabel(t.name)}</div>
        <div className="tcard-meta">
          {[imgs && `${imgs} photos`, txts && `${txts} text`, dur, fps && `${fps}fps`].filter(Boolean).join(" · ")}
        </div>
        <div className="tcard-tag">{tIcon(t.name)} {imgs > 0 && txts > 0 ? "Photo + Text" : imgs > 0 ? "Photo" : "Text"}</div>
      </div>
    </div>
  );
}

// ── Scene strip ───────────────────────────────────────────────────────────────
function SceneStrip({ config, data, videoRef }) {
  const [act, setAct] = useState(0);
  const entries = Object.entries(config?.sceneMap || {});
  if (!entries.length) return null;

  const jump = (op, i) => {
    setAct(i);
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, i === 0 ? 0 : op - 1.5);
    videoRef.current.play().catch(() => {});
  };

  return (
    <div className="sstrip">
      <div className="sstrip-top">
        <span className="sstrip-lbl">Scenes</span>
        <span className="sstrip-ct">{entries.length} scenes — click to jump</span>
      </div>
      <div className="srow">
        {entries.map(([key, sc], i) => {
          const ik  = (sc.keys||[]).find(k => k.startsWith("photo_")||k.startsWith("image_"));
          const src = ik ? data[ik] : null;
          // also check for preview frame in template folder
          return (
            <div key={key} className={`sc${act===i?" act":""}`} onClick={() => jump(sc.outpoint, i)}>
              <div className="sc-frame">
                {src
                  ? <img src={src} alt="" />
                  : <span className="sc-t">{(sc.outpoint||0).toFixed(1)}s</span>
                }
              </div>
              <div className="sc-n">{cleanLabel(key)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [templates, setTemplates] = useState([]);
  const [sel, setSel]             = useState(null);   // selected template
  const [tab, setTab]             = useState("photos");
  const [chunks, setChunks]       = useState([{}]);
  const [chunk, setChunk]         = useState(0);
  const [jobId, setJobId]         = useState(null);
  const [jobSt, setJobSt]         = useState(null);
  const [rState, setRState]       = useState("idle"); // idle|rendering|done|error
  const [outUrl, setOutUrl]       = useState(null);
  const [toast, setToast]         = useState(null);
  const vidRef  = useRef(null);
  const upload  = useUpload();

  const data   = chunks[chunk] || {};
  const config = sel?.config   || null;
  const { rows, extraText } = buildFields(config);

  // Separate images that have a text pair vs standalone (maps, floorplan etc)
  const pairedRows     = rows.filter(r => r.text);
  const standaloneImgs = rows.filter(r => !r.text);

  // Group extra text by key prefix for clean sections
  const textGroups = {};
  extraText.forEach(f => {
    const g = f.key.split("_")[0] || "other";
    if (!textGroups[g]) textGroups[g] = [];
    textGroups[g].push(f);
  });

  // fetch templates
  useEffect(() => {
    fetch(`${API}/api/render/templates`)
      .then(r => r.json())
      .then(d => {
        const raw = Array.isArray(d) ? d : d.templates || [];
        setTemplates(raw.map(norm).filter(t => t.name));
      })
      .catch(() => {});
  }, []);

  // poll job
  useEffect(() => {
    if (!jobId || rState==="done" || rState==="error") return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/jobs/${jobId}`);
        const d = await r.json();
        setJobSt(d);
        if (d.status === "done") {
          clearInterval(iv); setRState("done");
          const f   = d.outputFile || d.output || `${jobId}.mp4`;
          const url = `${API}/outputs/${String(f).split(/[\\/]/).pop()}`;
          setOutUrl(url);
          if (vidRef.current) { vidRef.current.src = url; vidRef.current.load(); }
          toast2("✓ Done — your video is ready");
        } else if (d.status==="error"||d.status==="failed") {
          clearInterval(iv); setRState("error"); toast2("Render failed");
        }
      } catch {}
    }, 2500);
    return () => clearInterval(iv);
  }, [jobId, rState]);

  const toast2 = msg => { setToast(msg); setTimeout(()=>setToast(null), 3000); };

  const setF = (key, val) => setChunks(prev => {
    const n = [...prev]; n[chunk] = { ...n[chunk], [key]: val }; return n;
  });

  const startRender = async () => {
    if (!sel) return;
    setRState("rendering"); setOutUrl(null); setJobId(null); setJobSt(null);
    try {
      const inputData = Object.assign({}, ...chunks);
      const r = await fetch(`${API}/api/render/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
  template: sel.id, 
  inputData, 
  ...(chunks.length > 1 ? { chunks } : {}) 
})
      });
      const d = await r.json();
      if (d.jobId) { setJobId(d.jobId); toast2("Rendering started…"); }
      else { setRState("error"); toast2("Could not start render"); }
    } catch { setRState("error"); toast2("Network error"); }
  };

  const reset = () => {
    setChunks([{}]); setChunk(0); setRState("idle"); setJobId(null); setOutUrl(null); setJobSt(null);
  };

  const openTemplate = t => {
    setSel(t); reset(); setTab("photos");
  };

  const statusTxt =
    rState==="rendering" ? (jobSt?.stage||"Rendering…")
    : rState==="done"    ? "Done"
    : rState==="error"   ? "Error"
    : "Ready";

  const inEditor = !!sel;

  return (
    <>
      <style>{CSS}</style>

      <div className="shell">
        {/* ── Topbar ── */}
        <header className="bar">
          <div className="logo">Motion<em>AI</em></div>
          <div className="vl" />
          {inEditor ? (
            <>
              <span className="crumb" onClick={() => setSel(null)}>Templates</span>
              <span className="crumb-sep">›</span>
              <span className="crumb" style={{ color:"var(--ink)" }}>{cleanLabel(sel.name)}</span>
            </>
          ) : (
            <span className="crumb" style={{ color:"var(--ink)" }}>Templates</span>
          )}
          <div className="sp" />
          <div className="chip">
            <div className={`dot${rState==="rendering"?" g":rState==="error"?" r":""}`} />
            {statusTxt}
          </div>
        </header>

        {/* ── GALLERY VIEW ── */}
        <div className={`view gallery${!inEditor?" active":""}`}>
          <div className="gallery-head">
            <h1>Choose a template</h1>
            <p>Select the video style you want to generate</p>
          </div>
          <div className="gallery-grid">
            {templates.map((t, i) => (
              <TCard key={t.name} t={t} idx={i} onClick={() => openTemplate(t)} />
            ))}
          </div>
        </div>

        {/* ── EDITOR VIEW ── */}
        <div className={`view editor${inEditor?" active":""}`}>

          {/* Left: video + scenes */}
          <div className="left">
            <div className="vid-area">
              {outUrl
                ? <video ref={vidRef} controls src={outUrl} />
                : <div className="vid-empty">
                    <div className="pico">▷</div>
                    <p>Fill in the form and hit Render</p>
                  </div>
              }
              {rState === "rendering" && (
                <div className="rov">
                  <div className="rspin" />
                  <div className="rov-stage">{jobSt?.stage || "Processing…"}</div>
                  <div className="rbar">
                    <div className={`rfill${jobSt?.progress?"":" ind"}`}
                      style={{ width: jobSt?.progress ? `${jobSt.progress}%` : undefined }} />
                  </div>
                </div>
              )}
            </div>
            {config && <SceneStrip config={config} data={data} videoRef={vidRef} />}
          </div>

          {/* Right: form */}
          <div className="right">

            {/* Part tabs */}
            <div className="ptabs">
              <button className={`ptab${tab==="photos"?" on":""}`} onClick={() => setTab("photos")}>
                Photos {rows.length ? `(${rows.length})` : ""}
              </button>
              <button className={`ptab${tab==="text"?" on":""}`} onClick={() => setTab("text")}>
                Text {extraText.length ? `(${extraText.length})` : ""}
              </button>
              <div className="ptsp" />
              <div className="pparts">
                {chunks.map((_,i) => (
                  <button key={i} className={`pp${chunk===i?" on":""}`} onClick={() => setChunk(i)}>{i+1}</button>
                ))}
                <button className="pp-add" onClick={() => { setChunks(p=>[...p,{}]); setChunk(chunks.length); }}>+</button>
              </div>
            </div>

            {/* Scrollable fields */}
            <div className="fscroll">

              {/* ── PHOTOS TAB ── */}
              {tab === "photos" && (
                <>
                  {rows.length === 0 && (
                    <div style={{ padding:"24px 0",textAlign:"center",color:"var(--ink3)",fontSize:12 }}>
                      This template has no image slots.
                    </div>
                  )}

                  {/* Paired: photo + name */}
                  {pairedRows.length > 0 && (
                    <>
                      <div className="sec-h">Photos &amp; Names</div>
                      {pairedRows.map((row, i) => (
                        <div key={i} className="irow">
                          <Thumb value={data[row.img.key]} onChange={v => setF(row.img.key, v)} uploadFn={upload} />
                          <div className="iinfo">
                            <div className="iinfo-lbl">{cleanLabel(row.img.label || row.img.key)}</div>
                            <input
                              type="text"
                              value={data[row.text.key] || ""}
                              onChange={e => setF(row.text.key, e.target.value)}
                              placeholder="Enter name…"
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Standalone images (maps, floorplans etc) */}
                  {standaloneImgs.length > 0 && (
                    <>
                      <div className="sec-h">Additional Images</div>
                      {standaloneImgs.map((row, i) => (
                        <div key={i} className="irow">
                          <Thumb value={data[row.img.key]} onChange={v => setF(row.img.key, v)} uploadFn={upload} />
                          <div className="iinfo">
                            <div className="iinfo-lbl">{cleanLabel(row.img.label || row.img.key)}</div>
                            <div className="iinfo-only" style={{ color:"var(--ink3)",fontSize:11 }}>Image only</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ── TEXT TAB ── */}
              {tab === "text" && (
                <>
                  {extraText.length === 0 && (
                    <div style={{ padding:"24px 0",textAlign:"center",color:"var(--ink3)",fontSize:12 }}>
                      This template has no text fields.
                    </div>
                  )}
                  {Object.entries(textGroups).map(([group, fields]) => (
                    <div key={group}>
                      <div className="sec-h">{cleanLabel(group)}</div>
                      {fields.map((f, i) => {
                        const isLong = (f.layerName||f.label||"").length > 80;
                        return (
                          <div key={i} className="tfield">
                            <label>{cleanLabel(f.label || f.key)}</label>
                            {isLong
                              ? <textarea
                                  value={data[f.key]||""}
                                  onChange={e => setF(f.key, e.target.value)}
                                  placeholder="Enter text…"
                                />
                              : <input
                                  type="text"
                                  value={data[f.key]||""}
                                  onChange={e => setF(f.key, e.target.value)}
                                  placeholder={f.label || "Enter text…"}
                                />
                            }
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Submit bar */}
            <div className="sbar">
              {rState === "idle" && (
                <button className="btn-r" onClick={startRender}>Render video →</button>
              )}
              {rState === "rendering" && (
                <button className="btn-r" disabled>
                  <div style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.25)",borderTopColor:"white",borderRadius:"50%",animation:"spin .75s linear infinite" }} />
                  Rendering…
                </button>
              )}
              {rState === "done" && (
                <div className="brow">
                  <a className="btn-dl" href={outUrl} download target="_blank" rel="noreferrer">↓ Download</a>
                  <button className="btn-s" onClick={reset}>Render again</button>
                </div>
              )}
              {rState === "error" && (
                <div className="brow">
                  <button className="btn-r" style={{ background:"#dc2626" }} onClick={startRender}>Retry →</button>
                  <button className="btn-s" onClick={reset}>Reset</button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className={`toast${toast?" show":""}`}>{toast}</div>
    </>
  );
}