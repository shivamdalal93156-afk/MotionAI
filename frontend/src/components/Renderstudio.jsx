import React, { useState, useEffect } from 'react';

const API = 'http://localhost:3001';

export default function RenderStudio() {
  // ---- STATE ----
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [activeConfig, setActiveConfig] = useState(null);
  
  // Form States
  const [textData, setTextData] = useState({});
  const [imageData, setImageData] = useState({});
  const [scriptText, setScriptText] = useState('');
  
  // Render & Polling States
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState('');
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);

  // 1. Fetch Template List
  useEffect(() => {
    fetch(`${API}/api/render/templates`)
      .then(res => res.json())
      .then(data => {
        const templateList = Array.isArray(data) ? data : (data.templates || []);
        const validTemplates = templateList.filter(t => t.id || t.template_id);
        setTemplates(validTemplates);
        
        if (validTemplates.length > 0 && !activeTemplateId) {
          setActiveTemplateId(validTemplates[0].id || validTemplates[0].template_id);
        }
      })
      .catch(err => console.error("Error fetching templates:", err));
  }, []);

  // 2. Fetch Manifest & Reset Form when Template Changes
  useEffect(() => {
    if (!activeTemplateId) return;
    
    setActiveConfig(null);
    setTextData({});
    setImageData({});
    setScriptText('');
    setRenderProgress(0);
    setFinalVideoUrl(null);

    fetch(`${API}/api/render/manifest/${activeTemplateId}`)
      .then(res => res.json())
      .then(data => {
        const manifestData = data.manifest || data;
        setActiveConfig(manifestData);

        // Reset all states for the new template
        const initialText = {};
        if (manifestData.text_map) {
          Object.keys(manifestData.text_map).forEach(key => {
            initialText[key] = '';
          });
        }
        setTextData(initialText);
      })
      .catch(err => console.error("Error fetching manifest:", err));
  }, [activeTemplateId]);

  // 3. Listen for clicks from the Template Gallery
  useEffect(() => {
    const handleGalleryClick = (e) => {
      setActiveTemplateId(e.detail); // Change the template
    };
    window.addEventListener('forceTemplateChange', handleGalleryClick);
    return () => window.removeEventListener('forceTemplateChange', handleGalleryClick);
  }, []);

  // ---- HANDLERS ----

  // Normal Text Fields
  const handleTextChange = (key, value) => {
    setTextData(prev => ({ ...prev, [key]: value }));
  };

  // Auto-Distributing Script Box (For Typography)
  const handleScriptChange = (e) => {
    const text = e.target.value;
    setScriptText(text);

    if (!activeConfig || !activeConfig.text_map) return;
    
    const keys = Object.keys(activeConfig.text_map);
    if (keys.length === 0) return;

    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const newTextData = {};

    if (words.length === 0) {
      keys.forEach(k => newTextData[k] = '');
    } else {
      const wordsPerKey = Math.max(1, Math.ceil(words.length / keys.length));
      keys.forEach((key, index) => {
        const start = index * wordsPerKey;
        const chunk = words.slice(start, start + wordsPerKey).join(' ');
        newTextData[key] = chunk || ''; 
      });
    }
    setTextData(newTextData);
  };

  // Image Upload
  const handleImageUpload = async (key, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch(`${API}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.filePath) {
        setImageData(prev => ({ ...prev, [key]: data.filePath }));
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  // The Render Pipeline & Live Polling
  const handleRender = () => {
    if (!activeTemplateId || !activeConfig) {
      alert('Please select a template first');
      return;
    }

    setIsRendering(true);
    setRenderProgress(5);
    setRenderMessage('Warming up render engine...');
    setFinalVideoUrl(null);

    const payload = {
      template_id: activeTemplateId,
      textData: textData,
      imageData: imageData,
      strategy: 'full_render'
    };

    fetch(`${API}/api/render/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.jobId) {
        console.log("Job Queued:", data.jobId);
        
        // Poll backend every 2 seconds
        const pollInterval = setInterval(() => {
          fetch(`${API}/api/jobs/${data.jobId}`)
            .then(r => r.json())
            .then(responseData => {
              // ✨ THE FIX: Unwrap the job object safely
              const job = responseData.job || responseData;

              if (job.progress) setRenderProgress(job.progress);
              if (job.message) setRenderMessage(job.message);

              if (job.status === 'done') {
                clearInterval(pollInterval);
                setIsRendering(false);
                setRenderProgress(100);
                setRenderMessage('Render Complete!');
                setFinalVideoUrl(`${API}${job.outputUrl}`);
              } else if (job.status === 'error') {
                clearInterval(pollInterval);
                setIsRendering(false);
                setRenderMessage(`Render Failed: ${job.message}`);
                alert(`Render Failed: ${job.message}`);
              }
            })
            .catch(err => console.error("Polling error:", err));
        }, 2000);

      } else {
        setIsRendering(false);
        alert("Failed to queue render.");
      }
    })
    .catch(err => {
      console.error("Render error:", err);
      setIsRendering(false);
      alert("Network error connecting to backend.");
    });
  };

  // ---- UI ----
  return (
    <div id="render-studio-section" className="render-studio">
      
      {/* SIDEBAR */}
      <div className="render-studio-sidebar">
        <h3 className="render-sidebar-title">SELECT TEMPLATE</h3>
        
        {templates.map((tpl, i) => {
          const id = tpl.id || tpl.template_id;
          const isActive = activeTemplateId === id;
          return (
            <div key={i} 
              className={`render-sidebar-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTemplateId(id)}
            >
              <div className="render-sidebar-name">{tpl.name || id}</div>
              <div className="render-sidebar-type">{tpl.type}</div>
            </div>
          );
        })}
      </div>

      {/* MAIN AREA */}
      <div className="render-studio-main">
        <div className="render-card">
          
          {!activeConfig ? (
            <div className="render-loading">Loading template configuration...</div>
          ) : (
            <>
              <h1 className="render-card-title">
                {activeConfig.name || activeTemplateId}
              </h1>
              <p className="render-card-desc">
                {activeConfig.type === 'typography' 
                  ? "Paste your full script. We handle the scene timing automatically." 
                  : "Fill in the media and text to generate your cinematic reel."}
              </p>

              {/* CONDITIONAL RENDER: Script Box OR Individual Fields */}
              {activeConfig.type === 'typography' ? (
                <div className="render-form-section">
                  <textarea
                    value={scriptText}
                    onChange={handleScriptChange}
                    placeholder="Paste your full text here..."
                    rows={6}
                    className="render-textarea"
                  />
                  {/* Auto-Mapping Preview */}
                  {scriptText && (
                    <div className="render-preview-box">
                      <h4 className="render-preview-title">Auto-Mapping Preview</h4>
                      <div className="render-preview-grid">
                        {Object.keys(activeConfig.text_map || {}).map(key => (
                          <div key={key} className="render-preview-item">
                            <span className="render-preview-key">{key}: </span>
                            <span className="render-preview-value">{textData[key] || '...'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Fallback for SlideShows / Regular Inputs */
                activeConfig.text_map && Object.keys(activeConfig.text_map).length > 0 && (
                  <div className="render-form-section">
                    {Object.keys(activeConfig.text_map).map(key => (
                      <div key={key} className="render-form-group">
                        <label className="render-label">
                          {key.replace('_', ' ').toUpperCase()}
                        </label>
                        <input 
                          type="text" 
                          value={textData[key] || ''}
                          onChange={(e) => handleTextChange(key, e.target.value)}
                          className="render-input"
                        />
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* IMAGES */}
              {activeConfig.image_map && Object.keys(activeConfig.image_map).length > 0 && (
                <div className="render-form-section">
                  <h3 className="render-images-title">Media Slots</h3>
                  {Object.keys(activeConfig.image_map).map((key) => {
                    const imgCfg = activeConfig.image_map[key];
                    const ratio = typeof imgCfg === 'object' ? imgCfg.ratio : null;
                    const hint = typeof imgCfg === 'object' ? imgCfg.hint : null;
                    return (
                      <div key={key} className="render-image-slot">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <label className="render-label">
                            {key.toUpperCase()}
                          </label>
                          {ratio && (
                            <span className="render-ratio-badge">{ratio}</span>
                          )}
                          {hint && (
                            <span className="render-hint-text">— {hint}</span>
                          )}
                        </div>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleImageUpload(key, e.target.files[0])}
                          className="render-file-input"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RENDER BUTTON */}
              <button 
                onClick={handleRender}
                disabled={isRendering}
                className={`render-btn ${isRendering ? 'disabled' : ''}`}
              >
                {isRendering ? `Initializing Render Node... ${renderProgress}%` : '▷ Render Video'}
              </button>

              {/* LIVE PROGRESS BAR */}
              {isRendering && (
                <div className="render-progress-container">
                  <div className="render-progress-bar">
                    <div 
                      className="render-progress-fill" 
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                  <p className="render-progress-message">{renderMessage}</p>
                </div>
              )}

              {/* FINAL VIDEO */}
              {finalVideoUrl && (
                <div className="render-video-container">
                  <h3 className="render-video-title">Your Video is Ready!</h3>
                  <video
                    src={finalVideoUrl}
                    controls
                    className="render-video-player"
                  />
                  <a 
                    href={finalVideoUrl}
                    download
                    className="render-download-btn"
                  >
                    ⬇️ Download MP4
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
// // //                             {isRendering && (
// // //                                 <div style={{ marginTop: '24px', width: '100%', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
// // //                                     <div style={{ width: `${renderProgress}%`, height: '4px', background: '#f59e0b', transition: 'width 0.5s ease' }} />
// // //                                     <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#888' }}>
// // //                                         Rendering... {renderProgress}%
// // //                                     </div>
// // //                                 </div>
// // //                             )}

// // //                             {/* FINAL MP4 PLAYER & DOWNLOAD */}
// // //                             {finalVideoUrl && !isRendering && (
// // //                                 <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid #f59e0b', borderRadius: '8px', textAlign: 'center' }}>
// // //                                     <h3 style={{ color: '#f59e0b', margin: '0 0 16px 0', fontSize: '16px', textTransform: 'uppercase' }}>Render Complete</h3>
// // //                                     <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '16px', border: '1px solid #333' }} />
// // //                                     <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '12px 24px', background: '#f59e0b', color: '#000', textDecoration: 'none', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
// // //                                         ↓ Download MP4
// // //                                     </a>
// // //                                 </div>
// // //                             )}

// // //                         </>
// // //                     )}
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // }
// // import React, { useState, useEffect, useRef } from 'react';

// // export default function RenderStudio() {
// //   // ---- STATE ----
// //   const [templates, setTemplates] = useState([]);
// //   const [activeTemplateId, setActiveTemplateId] = useState(null);
// //   const [activeConfig, setActiveConfig] = useState(null);

// //   const [textData, setTextData] = useState({});
// //   const [imageData, setImageData] = useState({});
// //   const [scriptText, setScriptText] = useState('');

// //   const [isRendering, setIsRendering] = useState(false);
// //   const [renderProgress, setRenderProgress] = useState(0);
// //   const [finalVideoUrl, setFinalVideoUrl] = useState(null);

// //   // Split panel video state
// //   const [activeSceneIndex, setActiveSceneIndex] = useState(0);
// //   const videoRef = useRef(null);

// //   // ── 1. Fetch Template List ───────────────────────────────────────────────
// //   useEffect(() => {
// //     fetch('http://localhost:3001/api/render/templates')
// //       .then(res => res.json())
// //       .then(data => {
// //         const templateList = data.templates || [];
// //         const valid = templateList.filter(t => t.id || t.template_id);
// //         setTemplates(valid);
// //         if (valid.length > 0 && !activeTemplateId) {
// //           setActiveTemplateId(valid[0].id || valid[0].template_id);
// //         }
// //       })
// //       .catch(err => console.error('Error fetching templates:', err));
// //   }, []);

// //   // ── 2. Fetch Manifest when Template Changes ──────────────────────────────
// //   useEffect(() => {
// //     if (!activeTemplateId) return;
// //     setActiveConfig(null);
// //     fetch(`http://localhost:3001/api/render/manifest/${activeTemplateId}`)
// //       .then(res => res.json())
// //       .then(data => {
// //         const manifest = data.manifest || data;
// //         setActiveConfig(manifest);
// //         const initialText = {};
// //         if (manifest.text_map) {
// //           Object.keys(manifest.text_map).forEach(k => { initialText[k] = ''; });
// //         }
// //         setTextData(initialText);
// //         setImageData({});
// //         setScriptText('');
// //         setRenderProgress(0);
// //         setFinalVideoUrl(null);
// //         setActiveSceneIndex(0);
// //       })
// //       .catch(err => console.error('Error fetching manifest:', err));
// //   }, [activeTemplateId]);

// //   // ── 3. Gallery click listener ────────────────────────────────────────────
// //   useEffect(() => {
// //     const handler = e => setActiveTemplateId(e.detail);
// //     window.addEventListener('forceTemplateChange', handler);
// //     return () => window.removeEventListener('forceTemplateChange', handler);
// //   }, []);

// //   // ── HANDLERS ────────────────────────────────────────────────────────────

// //   const handleTextChange = (key, value) => {
// //     setTextData(prev => ({ ...prev, [key]: value }));
// //   };

// //   // Typography: split script across scene keys
// //   const handleScriptChange = (e) => {
// //     const text = e.target.value;
// //     setScriptText(text);
// //     if (!activeConfig?.text_map) return;

// //     const keys = Object.keys(activeConfig.text_map);
// //     if (!keys.length) return;

// //     // Try blank-line split first, then sentence split, then word split
// //     let parts = [];
// //     const byBlank = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
// //     if (byBlank.length >= 2) {
// //       parts = byBlank;
// //     } else {
// //       const bySentence = text.match(/[^.!?]+[.!?]+/g);
// //       if (bySentence && bySentence.length >= 2) {
// //         parts = bySentence.map(s => s.trim());
// //       } else {
// //         const words = text.trim().split(/\s+/).filter(w => w.length > 0);
// //         const size = Math.max(1, Math.ceil(words.length / keys.length));
// //         for (let i = 0; i < keys.length; i++) {
// //           parts.push(words.slice(i * size, (i + 1) * size).join(' '));
// //         }
// //       }
// //     }

// //     // Map parts into scene keys (distribute evenly if more keys than parts)
// //     const newTextData = {};
// //     const perPart = Math.ceil(keys.length / Math.max(parts.length, 1));
// //     keys.forEach((key, i) => {
// //       const partIndex = Math.floor(i / perPart);
// //       newTextData[key] = parts[partIndex] || '';
// //     });
// //     setTextData(newTextData);
// //   };

// //   const handleImageUpload = async (key, file) => {
// //     const formData = new FormData();
// //     formData.append('file', file);
// //     try {
// //       const res = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: formData });
// //       const data = await res.json();
// //       if (data.filePath) setImageData(prev => ({ ...prev, [key]: data.filePath }));
// //     } catch (err) {
// //       console.error('Upload failed', err);
// //     }
// //   };

// //   const handleRender = () => {
// //     setIsRendering(true);
// //     setRenderProgress(5);
// //     setFinalVideoUrl(null);

// //     const payload = {
// //       template_id: activeTemplateId,
// //       textData,
// //       imageData,
// //       strategy: 'full_render'
// //     };

// //     fetch('http://localhost:3001/api/render/start', {
// //       method: 'POST',
// //       headers: { 'Content-Type': 'application/json' },
// //       body: JSON.stringify(payload)
// //     })
// //       .then(res => res.json())
// //       .then(data => {
// //         if (data.success && data.jobId) {
// //           const pollInterval = setInterval(() => {
// //             fetch(`http://localhost:3001/api/jobs/${data.jobId}`)
// //               .then(r => r.json())
// //               .then(responseData => {
// //                 const job = responseData.job || responseData;
// //                 if (job.progress) setRenderProgress(job.progress);
// //                 if (job.status === 'done') {
// //                   clearInterval(pollInterval);
// //                   setIsRendering(false);
// //                   setRenderProgress(100);
// //                   setFinalVideoUrl(`http://localhost:3001${job.outputUrl}`);
// //                 } else if (job.status === 'error') {
// //                   clearInterval(pollInterval);
// //                   setIsRendering(false);
// //                   alert(`Render Failed: ${job.message}`);
// //                 }
// //               })
// //               .catch(err => console.error('Polling error:', err));
// //           }, 2000);
// //         } else {
// //           setIsRendering(false);
// //           alert('Failed to queue render.');
// //         }
// //       })
// //       .catch(err => {
// //         console.error('Render error:', err);
// //         setIsRendering(false);
// //         alert('Network error connecting to backend.');
// //       });
// //   };

// //   // ── Video jump helper ────────────────────────────────────────────────────
// //   const jumpToTime = (seconds) => {
// //     if (videoRef.current) {
// //       videoRef.current.currentTime = seconds;
// //       videoRef.current.pause();
// //     }
// //   };

// //   // ── Scene data helpers ───────────────────────────────────────────────────

// //   // For typography: group text_map keys by scene number
// //   const getTypographyScenes = (config) => {
// //     if (!config?.text_map) return [];
// //     const sceneMap = {};
// //     Object.keys(config.text_map).forEach(key => {
// //       const match = key.match(/^scene(\d+)_/);
// //       if (match) {
// //         const sceneNum = match[1];
// //         if (!sceneMap[sceneNum]) sceneMap[sceneNum] = [];
// //         sceneMap[sceneNum].push(key);
// //       }
// //     });
// //     return Object.entries(sceneMap)
// //       .sort((a, b) => Number(a[0]) - Number(b[0]))
// //       .map(([sceneNum, keys]) => ({
// //         sceneNum,
// //         keys,
// //         label: `Scene ${sceneNum}`,
// //         timestamp: config.scene_outpoints?.[`scene${sceneNum}`]
// //           ? (sceneNum === '1' ? 0 : config.scene_outpoints[`scene${Number(sceneNum) - 1}`] || 0)
// //           : 0
// //       }));
// //   };

// //   // For photo_slideshow: one slot per image_map key
// //   const getSlideshowScenes = (config) => {
// //     if (!config?.image_map) return [];
// //     return Object.keys(config.image_map).map((key, i) => {
// //       const sceneKey = `scene${i + 1}`;
// //       const frameTime = config.scene_frame_times?.[sceneKey];
// //       const fps = 25;
// //       const seconds = frameTime != null ? frameTime / fps : 0;
// //       return {
// //         key,
// //         label: `Image ${i + 1}`,
// //         hint: config.image_map[key]?.hint || '',
// //         ratio: config.image_map[key]?.ratio || '',
// //         seconds
// //       };
// //     });
// //   };

// //   const previewUrl = activeTemplateId
// //     ? `http://localhost:3001/previews/${activeTemplateId}.mp4`
// //     : null;

// //   const isSplitPanel = activeConfig?.type === 'typography' || activeConfig?.type === 'photo_slideshow';

// //   // ── STYLES ──────────────────────────────────────────────────────────────
// //   const S = {
// //     root: { display: 'flex', minHeight: '80vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' },
// //     sidebar: { width: '280px', background: '#111', borderRight: '1px solid #222', padding: '24px', flexShrink: 0 },
// //     sidebarTitle: { fontSize: '11px', color: '#555', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' },
// //     tplCard: (active) => ({
// //       padding: '14px 16px', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer',
// //       background: active ? '#1a1a1a' : 'transparent',
// //       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a', transition: 'all 0.2s'
// //     }),
// //     tplName: (active) => ({ color: active ? '#f59e0b' : '#fff', fontWeight: '600', fontSize: '14px' }),
// //     tplType: { fontSize: '11px', color: '#555', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '1px' },
// //     main: { flex: 1, padding: '32px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
// //     splitGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flex: 1 },
// //     leftPanel: { display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' },
// //     rightPanel: { display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: 0 },
// //     tmplTitle: { fontSize: '22px', fontWeight: '700', textTransform: 'uppercase', margin: 0 },
// //     tmplSub: { fontSize: '13px', color: '#888', margin: '4px 0 0' },
// //     formatBox: { background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '14px 16px' },
// //     formatTitle: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' },
// //     fmtRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '7px' },
// //     fmtTag: { fontSize: '10px', fontWeight: '600', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: '4px', padding: '2px 8px', minWidth: '56px', textAlign: 'center', flexShrink: 0, marginTop: '1px' },
// //     fmtDesc: { fontSize: '12px', color: '#777', lineHeight: '1.5' },
// //     taLabel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
// //     taLabelText: { fontSize: '12px', color: '#888' },
// //     wordCount: { fontSize: '11px', color: '#555' },
// //     textarea: { width: '100%', minHeight: '110px', padding: '12px', background: '#0d0d0d', border: '1px solid #2a2a2a', color: '#fff', borderRadius: '6px', outline: 'none', resize: 'vertical', fontSize: '13px', lineHeight: '1.6', fontFamily: 'sans-serif' },
// //     scenesLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
// //     chipsWrap: { display: 'flex', flexDirection: 'column', gap: '5px' },
// //     chip: (active) => ({
// //       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
// //       background: active ? 'rgba(245,158,11,0.07)' : '#111',
// //       borderRadius: '7px', padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s'
// //     }),
// //     chipTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' },
// //     chipName: (active) => ({ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: active ? '#f59e0b' : '#555' }),
// //     chipTime: { fontSize: '10px', color: '#444', fontVariantNumeric: 'tabular-nums' },
// //     chipText: (hasText) => ({ fontSize: '12px', color: hasText ? '#ccc' : '#444', fontStyle: hasText ? 'normal' : 'italic', lineHeight: '1.4' }),
// //     // Image slots
// //     slotCard: (active) => ({
// //       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
// //       background: active ? 'rgba(245,158,11,0.05)' : '#111',
// //       borderRadius: '8px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s'
// //     }),
// //     slotTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
// //     slotLabel: (active) => ({ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: active ? '#f59e0b' : '#888' }),
// //     slotBadge: { fontSize: '10px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: '4px', padding: '2px 7px' },
// //     slotUpload: { display: 'flex', alignItems: 'center', gap: '10px' },
// //     slotThumb: { width: '48px', height: '32px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
// //     slotInput: { flex: 1, fontSize: '12px', color: '#888' },
// //     // Right panel
// //     vidWrap: { position: 'relative', background: '#000', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9' },
// //     video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
// //     vidControls: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' },
// //     ctrlBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px', padding: '4px 6px', borderRadius: '4px' },
// //     sceneNavWrap: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
// //     sceneNavBtn: (active) => ({
// //       fontSize: '11px', padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', transition: 'all 0.15s',
// //       background: active ? '#f59e0b' : 'transparent',
// //       color: active ? '#000' : '#666',
// //       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
// //       fontWeight: active ? '600' : '400'
// //     }),
// //     rightLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
// //     // Single column fallback
// //     singleCol: { width: '100%', maxWidth: '600px', background: '#141414', border: '1px solid #222', borderRadius: '12px', padding: '32px', margin: '0 auto' },
// //     renderBtn: (disabled) => ({
// //       width: '100%', padding: '14px', background: disabled ? '#555' : '#f59e0b',
// //       color: disabled ? '#888' : '#000', border: 'none', borderRadius: '6px',
// //       fontSize: '15px', fontWeight: '700', cursor: disabled ? 'not-allowed' : 'pointer',
// //       textTransform: 'uppercase', letterSpacing: '1px', marginTop: '8px'
// //     }),
// //     progressWrap: { marginTop: '16px', width: '100%', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden' },
// //     progressBar: (pct) => ({ width: `${pct}%`, height: '4px', background: '#f59e0b', transition: 'width 0.5s ease' }),
// //     progressText: { textAlign: 'center', marginTop: '6px', fontSize: '12px', color: '#666' },
// //     finalBox: { marginTop: '24px', padding: '16px', background: 'rgba(245,158,11,0.05)', border: '1px solid #f59e0b', borderRadius: '8px', textAlign: 'center' },
// //     finalTitle: { color: '#f59e0b', margin: '0 0 14px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' },
// //     dlBtn: { display: 'inline-block', padding: '10px 22px', background: '#f59e0b', color: '#000', textDecoration: 'none', fontWeight: '700', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '13px' }
// //   };

// //   const fmtTime = (s) => {
// //     if (s == null) return '';
// //     const m = Math.floor(s / 60), sec = Math.floor(s % 60);
// //     return `${m}:${sec < 10 ? '0' : ''}${sec}`;
// //   };

// //   // ── RENDER ───────────────────────────────────────────────────────────────
// //   return (
// //     <div id="render-studio-section" style={S.root}>

// //       {/* SIDEBAR */}
// //       <div style={S.sidebar}>
// //         <div style={S.sidebarTitle}>Select Template</div>
// //         {templates.map((tpl, i) => {
// //           const id = tpl.id || tpl.template_id;
// //           const active = activeTemplateId === id;
// //           return (
// //             <div key={i} onClick={() => setActiveTemplateId(id)} style={S.tplCard(active)}>
// //               <div style={S.tplName(active)}>{tpl.name || id}</div>
// //               <div style={S.tplType}>{tpl.type}</div>
// //             </div>
// //           );
// //         })}
// //       </div>

// //       {/* MAIN AREA */}
// //       <div style={S.main}>
// //         {!activeConfig ? (
// //           <div style={{ color: '#555', textAlign: 'center', marginTop: '80px' }}>Loading template...</div>
// //         ) : isSplitPanel ? (
// //           <SplitPanelUI
// //             activeConfig={activeConfig}
// //             activeTemplateId={activeTemplateId}
// //             textData={textData}
// //             imageData={imageData}
// //             scriptText={scriptText}
// //             activeSceneIndex={activeSceneIndex}
// //             setActiveSceneIndex={setActiveSceneIndex}
// //             videoRef={videoRef}
// //             previewUrl={previewUrl}
// //             handleScriptChange={handleScriptChange}
// //             handleImageUpload={handleImageUpload}
// //             handleRender={handleRender}
// //             isRendering={isRendering}
// //             renderProgress={renderProgress}
// //             finalVideoUrl={finalVideoUrl}
// //             jumpToTime={jumpToTime}
// //             getTypographyScenes={getTypographyScenes}
// //             getSlideshowScenes={getSlideshowScenes}
// //             fmtTime={fmtTime}
// //             S={S}
// //           />
// //         ) : (
// //           /* ── FALLBACK: original single-column UI for other types ── */
// //           <div style={S.singleCol}>
// //             <h1 style={{ margin: '0 0 8px', fontSize: '26px', textTransform: 'uppercase' }}>
// //               {activeConfig.name || activeTemplateId}
// //             </h1>
// //             <p style={{ color: '#888', marginBottom: '28px', fontSize: '13px' }}>
// //               Fill in the media and text to generate your cinematic reel.
// //             </p>

// //             {activeConfig.text_map && Object.keys(activeConfig.text_map).length > 0 && (
// //               <div style={{ marginBottom: '28px' }}>
// //                 {Object.keys(activeConfig.text_map).map(key => (
// //                   <div key={key} style={{ marginBottom: '14px' }}>
// //                     <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
// //                       {key.replace(/_/g, ' ')}
// //                     </label>
// //                     <input type="text" value={textData[key] || ''} onChange={e => handleTextChange(key, e.target.value)}
// //                       style={{ width: '100%', padding: '11px', background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '13px' }} />
// //                   </div>
// //                 ))}
// //               </div>
// //             )}

// //             {activeConfig.image_map && Object.keys(activeConfig.image_map).length > 0 && (
// //               <div style={{ marginBottom: '28px' }}>
// //                 <h3 style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Media Slots</h3>
// //                 {Object.keys(activeConfig.image_map).map(key => (
// //                   <div key={key} style={{ marginBottom: '14px', padding: '14px', border: '1px dashed #2a2a2a', borderRadius: '8px' }}>
// //                     <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
// //                       {key} — {activeConfig.image_map[key]?.hint || 'Upload Image'}
// //                     </label>
// //                     <input type="file" accept="image/*" onChange={e => handleImageUpload(key, e.target.files[0])} style={{ color: '#ccc', fontSize: '12px' }} />
// //                   </div>
// //                 ))}
// //               </div>
// //             )}

// //             <button onClick={handleRender} disabled={isRendering} style={S.renderBtn(isRendering)}>
// //               {isRendering ? 'Rendering...' : '▷ Render Video'}
// //             </button>

// //             {isRendering && (
// //               <div style={S.progressWrap}>
// //                 <div style={S.progressBar(renderProgress)} />
// //                 <div style={S.progressText}>Rendering... {renderProgress}%</div>
// //               </div>
// //             )}

// //             {finalVideoUrl && !isRendering && (
// //               <div style={S.finalBox}>
// //                 <h3 style={S.finalTitle}>Render Complete</h3>
// //                 <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '14px', border: '1px solid #333' }} />
// //                 <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={S.dlBtn}>↓ Download MP4</a>
// //               </div>
// //             )}
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // }

// // // ── SPLIT PANEL COMPONENT ────────────────────────────────────────────────────
// // function SplitPanelUI({
// //   activeConfig, activeTemplateId, textData, imageData, scriptText,
// //   activeSceneIndex, setActiveSceneIndex, videoRef, previewUrl,
// //   handleScriptChange, handleImageUpload, handleRender,
// //   isRendering, renderProgress, finalVideoUrl,
// //   jumpToTime, getTypographyScenes, getSlideshowScenes, fmtTime, S
// // }) {
// //   const isTypography = activeConfig.type === 'typography';
// //   const typoScenes = isTypography ? getTypographyScenes(activeConfig) : [];
// //   const slideScenes = !isTypography ? getSlideshowScenes(activeConfig) : [];
// //   const scenes = isTypography ? typoScenes : slideScenes;

// //   const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;

// //   // Build format guide labels from scene structure
// //   const sceneFormatGuide = isTypography
// //     ? typoScenes.map(s => ({
// //         label: s.label,
// //         placeholder: activeConfig.text_map
// //           ? Object.values(activeConfig.text_map)
// //               .slice((Number(s.sceneNum) - 1) * 3, (Number(s.sceneNum) - 1) * 3 + 3)
// //               .join(' · ')
// //           : ''
// //       }))
// //     : [];

// //   const handleSceneClick = (index) => {
// //     setActiveSceneIndex(index);
// //     const scene = scenes[index];
// //     const seconds = isTypography ? (scene.timestamp || 0) : (scene.seconds || 0);
// //     jumpToTime(seconds);
// //   };

// //   return (
// //     <div style={S.splitGrid}>

// //       {/* ── LEFT PANEL ── */}
// //       <div style={S.leftPanel}>
// //         <div>
// //           <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
// //             {activeConfig.type}
// //           </div>
// //           <div style={S.tmplTitle}>{activeConfig.name || activeTemplateId}</div>
// //           <div style={S.tmplSub}>
// //             {isTypography
// //               ? 'Paste your script — we split it across all scenes automatically.'
// //               : 'Upload your images — click a slot to preview that scene.'}
// //           </div>
// //         </div>

// //         {/* Format guide — typography only */}
// //         {isTypography && sceneFormatGuide.length > 0 && (
// //           <div style={S.formatBox}>
// //             <div style={S.formatTitle}>Script format guide</div>
// //             {sceneFormatGuide.map((s, i) => (
// //               <div key={i} style={{ ...S.fmtRow, marginBottom: i === sceneFormatGuide.length - 1 ? 0 : '7px' }}>
// //                 <span style={S.fmtTag}>{s.label}</span>
// //                 <span style={S.fmtDesc}>
// //                   Original template words: <span style={{ color: '#f59e0b' }}>{s.placeholder}</span>
// //                 </span>
// //               </div>
// //             ))}
// //             <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #222', fontSize: '11px', color: '#555', lineHeight: '1.5' }}>
// //               Separate scenes with a blank line, or just write — we split by sentences automatically.
// //             </div>
// //           </div>
// //         )}

// //         {/* Textarea — typography only */}
// //         {isTypography && (
// //           <div>
// //             <div style={S.taLabel}>
// //               <span style={S.taLabelText}>Your script</span>
// //               <span style={S.wordCount}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
// //             </div>
// //             <textarea
// //               value={scriptText}
// //               onChange={handleScriptChange}
// //               placeholder={`Paste your full script here...\n\nTip: press Enter twice between sections to split by scene.`}
// //               style={S.textarea}
// //             />
// //           </div>
// //         )}

// //         {/* Scene chips / image slots */}
// //         <div style={S.scenesLabel}>
// //           {isTypography ? 'Live scene mapping' : 'Image slots'}
// //         </div>

// //         <div style={S.chipsWrap}>
// //           {isTypography
// //             ? typoScenes.map((scene, i) => {
// //                 const sceneText = scene.keys.map(k => textData[k] || '').filter(Boolean).join(' ');
// //                 const active = activeSceneIndex === i;
// //                 return (
// //                   <div key={i} style={S.chip(active)} onClick={() => handleSceneClick(i)}>
// //                     <div style={S.chipTop}>
// //                       <span style={S.chipName(active)}>{scene.label}</span>
// //                       <span style={S.chipTime}>{fmtTime(scene.timestamp)}</span>
// //                     </div>
// //                     <div style={S.chipText(!!sceneText)}>
// //                       {sceneText || '— paste your script above —'}
// //                     </div>
// //                   </div>
// //                 );
// //               })
// //             : slideScenes.map((slot, i) => {
// //                 const active = activeSceneIndex === i;
// //                 const uploaded = imageData[slot.key];
// //                 return (
// //                   <div key={i} style={S.slotCard(active)} onClick={() => handleSceneClick(i)}>
// //                     <div style={S.slotTop}>
// //                       <span style={S.slotLabel(active)}>{slot.label}</span>
// //                       <span style={S.slotBadge}>{slot.ratio} {slot.hint}</span>
// //                     </div>
// //                     <div style={S.slotUpload}>
// //                       <div style={S.slotThumb}>
// //                         {uploaded
// //                           ? <img src={`http://localhost:3001${uploaded}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
// //                           : <span style={{ fontSize: '16px', color: '#333' }}>+</span>
// //                         }
// //                       </div>
// //                       <input
// //                         type="file"
// //                         accept="image/*"
// //                         style={S.slotInput}
// //                         onClick={e => e.stopPropagation()}
// //                         onChange={e => {
// //                           e.stopPropagation();
// //                           handleImageUpload(slot.key, e.target.files[0]);
// //                         }}
// //                       />
// //                     </div>
// //                   </div>
// //                 );
// //               })
// //           }
// //         </div>

// //         {/* Render button */}
// //         <button onClick={handleRender} disabled={isRendering} style={S.renderBtn(isRendering)}>
// //           {isRendering ? 'Rendering...' : '▷ Render Video'}
// //         </button>

// //         {isRendering && (
// //           <div style={S.progressWrap}>
// //             <div style={S.progressBar(renderProgress)} />
// //             <div style={S.progressText}>Rendering... {renderProgress}%</div>
// //           </div>
// //         )}

// //         {finalVideoUrl && !isRendering && (
// //           <div style={S.finalBox}>
// //             <h3 style={S.finalTitle}>Render Complete</h3>
// //             <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '14px', border: '1px solid #333' }} />
// //             <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={S.dlBtn}>↓ Download MP4</a>
// //           </div>
// //         )}
// //       </div>

// //       {/* ── RIGHT PANEL ── */}
// //       <div style={S.rightPanel}>
// //         <div style={S.rightLabel}>Template preview</div>

// //         {/* Video player */}
// //         <div style={S.vidWrap}>
// //           {previewUrl ? (
// //             <video
// //               ref={videoRef}
// //               src={previewUrl}
// //               style={S.video}
// //               controls={false}
// //               loop
// //               muted
// //               playsInline
// //               onLoadedMetadata={() => {
// //                 if (videoRef.current) videoRef.current.play();
// //               }}
// //             />
// //           ) : (
// //             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '13px' }}>
// //               No preview available
// //             </div>
// //           )}
// //         </div>

// //         {/* Manual controls */}
// //         <div style={S.vidControls}>
// //           <button style={S.ctrlBtn} onClick={() => {
// //             if (videoRef.current) {
// //               if (videoRef.current.paused) videoRef.current.play();
// //               else videoRef.current.pause();
// //             }
// //           }}>▶ / ❚❚</button>
// //           <button style={S.ctrlBtn} onClick={() => handleSceneClick(Math.max(0, activeSceneIndex - 1))}>◀◀ Prev</button>
// //           <button style={S.ctrlBtn} onClick={() => handleSceneClick(Math.min(scenes.length - 1, activeSceneIndex + 1))}>Next ▶▶</button>
// //         </div>

// //         {/* Scene jump pills */}
// //         <div style={S.rightLabel}>Jump to scene</div>
// //         <div style={S.sceneNavWrap}>
// //           {scenes.map((scene, i) => (
// //             <button
// //               key={i}
// //               style={S.sceneNavBtn(activeSceneIndex === i)}
// //               onClick={() => handleSceneClick(i)}
// //             >
// //               {isTypography ? `Scene ${scene.sceneNum}` : `Img ${i + 1}`}
// //             </button>
// //           ))}
// //         </div>

// //         {/* Current scene info */}
// //         {scenes[activeSceneIndex] && (
// //           <div style={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '12px 14px' }}>
// //             <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
// //               {isTypography ? `Scene ${scenes[activeSceneIndex].sceneNum} — original template text` : `Image ${activeSceneIndex + 1} — template frame`}
// //             </div>
// //             {isTypography ? (
// //               <div style={{ fontSize: '13px', color: '#f59e0b', lineHeight: '1.5' }}>
// //                 {scenes[activeSceneIndex].keys.map(k => activeConfig.text_map[k]).join(' · ')}
// //               </div>
// //             ) : (
// //               <div style={{ fontSize: '13px', color: '#888' }}>
// //                 {scenes[activeSceneIndex].ratio} · {scenes[activeSceneIndex].hint} · frame {activeConfig.scene_frame_times?.[`scene${activeSceneIndex + 1}`]}
// //               </div>
// //             )}
// //             <div style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>
// //               ↑ your content replaces this in the final render
// //             </div>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // }
// import React, { useState, useEffect, useRef } from 'react';

// export default function RenderStudio() {
//   // ---- STATE ----
//   const [templates, setTemplates] = useState([]);
//   const [activeTemplateId, setActiveTemplateId] = useState(null);
//   const [activeConfig, setActiveConfig] = useState(null);

//   const [textData, setTextData] = useState({});
//   const [imageData, setImageData] = useState({});
//   const [scriptText, setScriptText] = useState('');

//   const [isRendering, setIsRendering] = useState(false);
//   const [renderProgress, setRenderProgress] = useState(0);
//   const [finalVideoUrl, setFinalVideoUrl] = useState(null);

//   // Split panel video state
//   const [activeSceneIndex, setActiveSceneIndex] = useState(0);
//   const videoRef = useRef(null);

//   // ── 1. Fetch Template List ───────────────────────────────────────────────
//   useEffect(() => {
//     fetch('http://localhost:3001/api/render/templates')
//       .then(res => res.json())
//       .then(data => {
//         const templateList = data.templates || [];
//         const valid = templateList.filter(t => t.id || t.template_id);
//         setTemplates(valid);
//         if (valid.length > 0 && !activeTemplateId) {
//           setActiveTemplateId(valid[0].id || valid[0].template_id);
//         }
//       })
//       .catch(err => console.error('Error fetching templates:', err));
//   }, []);

//   // ── 2. Fetch Manifest when Template Changes ──────────────────────────────
//   useEffect(() => {
//     if (!activeTemplateId) return;
//     setActiveConfig(null);
//     fetch(`http://localhost:3001/api/render/manifest/${activeTemplateId}`)
//       .then(res => res.json())
//       .then(data => {
//         const manifest = data.manifest || data;
//         setActiveConfig(manifest);
//         const initialText = {};
//         if (manifest.text_map) {
//           Object.keys(manifest.text_map).forEach(k => { initialText[k] = ''; });
//         }
//         setTextData(initialText);
//         setImageData({});
//         setScriptText('');
//         setRenderProgress(0);
//         setFinalVideoUrl(null);
//         setActiveSceneIndex(0);
//       })
//       .catch(err => console.error('Error fetching manifest:', err));
//   }, [activeTemplateId]);

//   // ── 3. Gallery click listener ────────────────────────────────────────────
//   useEffect(() => {
//     const handler = e => setActiveTemplateId(e.detail);
//     window.addEventListener('forceTemplateChange', handler);
//     return () => window.removeEventListener('forceTemplateChange', handler);
//   }, []);

//   // ── HANDLERS ────────────────────────────────────────────────────────────

//   const handleTextChange = (key, value) => {
//     setTextData(prev => ({ ...prev, [key]: value }));
//   };

//   // Typography: split script across scene keys
//   const handleScriptChange = (e) => {
//     const text = e.target.value;
//     setScriptText(text);
//     if (!activeConfig?.text_map) return;

//     const keys = Object.keys(activeConfig.text_map);
//     if (!keys.length) return;

//     // Try blank-line split first, then sentence split, then word split
//     let parts = [];
//     const byBlank = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
//     if (byBlank.length >= 2) {
//       parts = byBlank;
//     } else {
//       const bySentence = text.match(/[^.!?]+[.!?]+/g);
//       if (bySentence && bySentence.length >= 2) {
//         parts = bySentence.map(s => s.trim());
//       } else {
//         const words = text.trim().split(/\s+/).filter(w => w.length > 0);
//         const size = Math.max(1, Math.ceil(words.length / keys.length));
//         for (let i = 0; i < keys.length; i++) {
//           parts.push(words.slice(i * size, (i + 1) * size).join(' '));
//         }
//       }
//     }

//     // Map parts into scene keys (distribute evenly if more keys than parts)
//     const newTextData = {};
//     const perPart = Math.ceil(keys.length / Math.max(parts.length, 1));
//     keys.forEach((key, i) => {
//       const partIndex = Math.floor(i / perPart);
//       newTextData[key] = parts[partIndex] || '';
//     });
//     setTextData(newTextData);
//   };

//   const handleImageUpload = async (key, file) => {
//     const formData = new FormData();
//     formData.append('file', file);
//     try {
//       const res = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: formData });
//       const data = await res.json();
//       if (data.filePath) setImageData(prev => ({ ...prev, [key]: data.filePath }));
//     } catch (err) {
//       console.error('Upload failed', err);
//     }
//   };

//   const handleRender = () => {
//     setIsRendering(true);
//     setRenderProgress(5);
//     setFinalVideoUrl(null);

//     const payload = {
//       template_id: activeTemplateId,
//       textData,
//       imageData,
//       strategy: 'full_render'
//     };

//     fetch('http://localhost:3001/api/render/start', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     })
//       .then(res => res.json())
//       .then(data => {
//         if (data.success && data.jobId) {
//           const pollInterval = setInterval(() => {
//             fetch(`http://localhost:3001/api/jobs/${data.jobId}`)
//               .then(r => r.json())
//               .then(responseData => {
//                 const job = responseData.job || responseData;
//                 if (job.progress) setRenderProgress(job.progress);
//                 if (job.status === 'done') {
//                   clearInterval(pollInterval);
//                   setIsRendering(false);
//                   setRenderProgress(100);
//                   setFinalVideoUrl(`http://localhost:3001${job.outputUrl}`);
//                 } else if (job.status === 'error') {
//                   clearInterval(pollInterval);
//                   setIsRendering(false);
//                   alert(`Render Failed: ${job.message}`);
//                 }
//               })
//               .catch(err => console.error('Polling error:', err));
//           }, 2000);
//         } else {
//           setIsRendering(false);
//           alert('Failed to queue render.');
//         }
//       })
//       .catch(err => {
//         console.error('Render error:', err);
//         setIsRendering(false);
//         alert('Network error connecting to backend.');
//       });
//   };

//   // ── Video jump helper ────────────────────────────────────────────────────
//   const jumpToTime = (seconds) => {
//     if (videoRef.current) {
//       videoRef.current.currentTime = seconds;
//       videoRef.current.pause();
//     }
//   };

//   // ── Scene data helpers ───────────────────────────────────────────────────

//   // For typography: group text_map keys by scene number
//   const getTypographyScenes = (config) => {
//     if (!config?.text_map) return [];
//     const sceneMap = {};
//     Object.keys(config.text_map).forEach(key => {
//       const match = key.match(/^scene(\d+)_/);
//       if (match) {
//         const sceneNum = match[1];
//         if (!sceneMap[sceneNum]) sceneMap[sceneNum] = [];
//         sceneMap[sceneNum].push(key);
//       }
//     });
//     return Object.entries(sceneMap)
//       .sort((a, b) => Number(a[0]) - Number(b[0]))
//       .map(([sceneNum, keys]) => ({
//         sceneNum,
//         keys,
//         label: `Scene ${sceneNum}`,
//         timestamp: config.scene_outpoints?.[`scene${sceneNum}`]
//           ? (sceneNum === '1' ? 0 : config.scene_outpoints[`scene${Number(sceneNum) - 1}`] || 0)
//           : 0
//       }));
//   };

//   // For photo_slideshow: one slot per image_map key
//   const getSlideshowScenes = (config) => {
//     if (!config?.image_map) return [];
//     return Object.keys(config.image_map).map((key, i) => {
//       const sceneKey = `scene${i + 1}`;
//       const frameTime = config.scene_frame_times?.[sceneKey];
//       const fps = 25;
//       const seconds = frameTime != null ? frameTime / fps : 0;
//       return {
//         key,
//         label: `Image ${i + 1}`,
//         hint: config.image_map[key]?.hint || '',
//         ratio: config.image_map[key]?.ratio || '',
//         seconds
//       };
//     });
//   };

//   const previewUrl = activeTemplateId
//     ? `/previews/${activeTemplateId}_preview.mp4`
//     : null;

//   const isSplitPanel = activeConfig?.type === 'typography' || activeConfig?.type === 'photo_slideshow'
//     || (activeConfig?.text_map && Object.keys(activeConfig.text_map).length > 0 && !activeConfig?.image_map)
//     || (activeConfig?.image_map && Object.keys(activeConfig.image_map).length > 0);

//   // ── STYLES ──────────────────────────────────────────────────────────────
//   const S = {
//     root: { display: 'flex', minHeight: '80vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' },
//     sidebar: { width: '280px', background: '#111', borderRight: '1px solid #222', padding: '24px', flexShrink: 0 },
//     sidebarTitle: { fontSize: '11px', color: '#555', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' },
//     tplCard: (active) => ({
//       padding: '14px 16px', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer',
//       background: active ? '#1a1a1a' : 'transparent',
//       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a', transition: 'all 0.2s'
//     }),
//     tplName: (active) => ({ color: active ? '#f59e0b' : '#fff', fontWeight: '600', fontSize: '14px' }),
//     tplType: { fontSize: '11px', color: '#555', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '1px' },
//     main: { flex: 1, padding: '32px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
//     splitGrid: { display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px', flex: 1, minHeight: 0 },
//     leftPanel: { display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '8px', maxHeight: 'calc(100vh - 120px)' },
//     rightPanel: { display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: '32px', height: 'fit-content' },
//     tmplTitle: { fontSize: '22px', fontWeight: '700', textTransform: 'uppercase', margin: 0 },
//     tmplSub: { fontSize: '13px', color: '#888', margin: '4px 0 0' },
//     formatBox: { background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '14px 16px' },
//     formatTitle: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' },
//     fmtRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '7px' },
//     fmtTag: { fontSize: '10px', fontWeight: '600', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: '4px', padding: '2px 8px', minWidth: '56px', textAlign: 'center', flexShrink: 0, marginTop: '1px' },
//     fmtDesc: { fontSize: '12px', color: '#777', lineHeight: '1.5' },
//     taLabel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
//     taLabelText: { fontSize: '12px', color: '#888' },
//     wordCount: { fontSize: '11px', color: '#555' },
//     textarea: { width: '100%', minHeight: '110px', padding: '12px', background: '#0d0d0d', border: '1px solid #2a2a2a', color: '#fff', borderRadius: '6px', outline: 'none', resize: 'vertical', fontSize: '13px', lineHeight: '1.6', fontFamily: 'sans-serif' },
//     scenesLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
//     chipsWrap: { display: 'flex', flexDirection: 'column', gap: '5px' },
//     chip: (active) => ({
//       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
//       background: active ? 'rgba(245,158,11,0.07)' : '#111',
//       borderRadius: '7px', padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s'
//     }),
//     chipTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' },
//     chipName: (active) => ({ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: active ? '#f59e0b' : '#555' }),
//     chipTime: { fontSize: '10px', color: '#444', fontVariantNumeric: 'tabular-nums' },
//     chipText: (hasText) => ({ fontSize: '12px', color: hasText ? '#ccc' : '#444', fontStyle: hasText ? 'normal' : 'italic', lineHeight: '1.4' }),
//     // Image slots
//     slotCard: (active) => ({
//       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
//       background: active ? 'rgba(245,158,11,0.05)' : '#111',
//       borderRadius: '8px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s'
//     }),
//     slotTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
//     slotLabel: (active) => ({ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: active ? '#f59e0b' : '#888' }),
//     slotBadge: { fontSize: '10px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: '4px', padding: '2px 7px' },
//     slotUpload: { display: 'flex', alignItems: 'center', gap: '10px' },
//     slotThumb: { width: '48px', height: '32px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
//     slotInput: { flex: 1, fontSize: '12px', color: '#888' },
//     // Right panel
//     vidWrap: { position: 'relative', background: '#000', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9' },
//     video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
//     vidControls: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' },
//     ctrlBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px', padding: '4px 6px', borderRadius: '4px' },
//     sceneNavWrap: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
//     sceneNavBtn: (active) => ({
//       fontSize: '11px', padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', transition: 'all 0.15s',
//       background: active ? '#f59e0b' : 'transparent',
//       color: active ? '#000' : '#666',
//       border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
//       fontWeight: active ? '600' : '400'
//     }),
//     rightLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
//     // Single column fallback
//     singleCol: { width: '100%', maxWidth: '600px', background: '#141414', border: '1px solid #222', borderRadius: '12px', padding: '32px', margin: '0 auto' },
//     renderBtn: (disabled) => ({
//       width: '100%', padding: '14px', background: disabled ? '#555' : '#f59e0b',
//       color: disabled ? '#888' : '#000', border: 'none', borderRadius: '6px',
//       fontSize: '15px', fontWeight: '700', cursor: disabled ? 'not-allowed' : 'pointer',
//       textTransform: 'uppercase', letterSpacing: '1px', marginTop: '8px'
//     }),
//     progressWrap: { marginTop: '16px', width: '100%', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden' },
//     progressBar: (pct) => ({ width: `${pct}%`, height: '4px', background: '#f59e0b', transition: 'width 0.5s ease' }),
//     progressText: { textAlign: 'center', marginTop: '6px', fontSize: '12px', color: '#666' },
//     finalBox: { marginTop: '24px', padding: '16px', background: 'rgba(245,158,11,0.05)', border: '1px solid #f59e0b', borderRadius: '8px', textAlign: 'center' },
//     finalTitle: { color: '#f59e0b', margin: '0 0 14px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' },
//     dlBtn: { display: 'inline-block', padding: '10px 22px', background: '#f59e0b', color: '#000', textDecoration: 'none', fontWeight: '700', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '13px' }
//   };

//   const fmtTime = (s) => {
//     if (s == null) return '';
//     const m = Math.floor(s / 60), sec = Math.floor(s % 60);
//     return `${m}:${sec < 10 ? '0' : ''}${sec}`;
//   };

//   // ── RENDER ───────────────────────────────────────────────────────────────
//   return (
//     <div id="render-studio-section" style={S.root}>

//       {/* SIDEBAR */}
//       <div style={S.sidebar}>
//         <div style={S.sidebarTitle}>Select Template</div>
//         {templates.map((tpl, i) => {
//           const id = tpl.id || tpl.template_id;
//           const active = activeTemplateId === id;
//           return (
//             <div key={i} onClick={() => setActiveTemplateId(id)} style={S.tplCard(active)}>
//               <div style={S.tplName(active)}>{tpl.name || id}</div>
//               <div style={S.tplType}>{tpl.type}</div>
//             </div>
//           );
//         })}
//       </div>

//       {/* MAIN AREA */}
//       <div style={S.main}>
//         {!activeConfig ? (
//           <div style={{ color: '#555', textAlign: 'center', marginTop: '80px' }}>Loading template...</div>
//         ) : isSplitPanel ? (
//           <SplitPanelUI
//             activeConfig={activeConfig}
//             activeTemplateId={activeTemplateId}
//             textData={textData}
//             imageData={imageData}
//             scriptText={scriptText}
//             activeSceneIndex={activeSceneIndex}
//             setActiveSceneIndex={setActiveSceneIndex}
//             videoRef={videoRef}
//             previewUrl={previewUrl}
//             handleScriptChange={handleScriptChange}
//             handleImageUpload={handleImageUpload}
//             handleRender={handleRender}
//             isRendering={isRendering}
//             renderProgress={renderProgress}
//             finalVideoUrl={finalVideoUrl}
//             jumpToTime={jumpToTime}
//             getTypographyScenes={getTypographyScenes}
//             getSlideshowScenes={getSlideshowScenes}
//             fmtTime={fmtTime}
//             S={S}
//           />
//         ) : (
//           /* ── FALLBACK: original single-column UI for other types ── */
//           <div style={S.singleCol}>
//             <h1 style={{ margin: '0 0 8px', fontSize: '26px', textTransform: 'uppercase' }}>
//               {activeConfig.name || activeTemplateId}
//             </h1>
//             <p style={{ color: '#888', marginBottom: '28px', fontSize: '13px' }}>
//               Fill in the media and text to generate your cinematic reel.
//             </p>

//             {activeConfig.text_map && Object.keys(activeConfig.text_map).length > 0 && (
//               <div style={{ marginBottom: '28px' }}>
//                 {Object.keys(activeConfig.text_map).map(key => (
//                   <div key={key} style={{ marginBottom: '14px' }}>
//                     <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
//                       {key.replace(/_/g, ' ')}
//                     </label>
//                     <input type="text" value={textData[key] || ''} onChange={e => handleTextChange(key, e.target.value)}
//                       style={{ width: '100%', padding: '11px', background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '13px' }} />
//                   </div>
//                 ))}
//               </div>
//             )}

//             {activeConfig.image_map && Object.keys(activeConfig.image_map).length > 0 && (
//               <div style={{ marginBottom: '28px' }}>
//                 <h3 style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Media Slots</h3>
//                 {Object.keys(activeConfig.image_map).map(key => (
//                   <div key={key} style={{ marginBottom: '14px', padding: '14px', border: '1px dashed #2a2a2a', borderRadius: '8px' }}>
//                     <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
//                       {key} — {activeConfig.image_map[key]?.hint || 'Upload Image'}
//                     </label>
//                     <input type="file" accept="image/*" onChange={e => handleImageUpload(key, e.target.files[0])} style={{ color: '#ccc', fontSize: '12px' }} />
//                   </div>
//                 ))}
//               </div>
//             )}

//             <button onClick={handleRender} disabled={isRendering} style={S.renderBtn(isRendering)}>
//               {isRendering ? 'Rendering...' : '▷ Render Video'}
//             </button>

//             {isRendering && (
//               <div style={S.progressWrap}>
//                 <div style={S.progressBar(renderProgress)} />
//                 <div style={S.progressText}>Rendering... {renderProgress}%</div>
//               </div>
//             )}

//             {finalVideoUrl && !isRendering && (
//               <div style={S.finalBox}>
//                 <h3 style={S.finalTitle}>Render Complete</h3>
//                 <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '14px', border: '1px solid #333' }} />
//                 <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={S.dlBtn}>↓ Download MP4</a>
//               </div>
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // ── SPLIT PANEL COMPONENT ────────────────────────────────────────────────────
// function SplitPanelUI({
//   activeConfig, activeTemplateId, textData, imageData, scriptText,
//   activeSceneIndex, setActiveSceneIndex, videoRef, previewUrl,
//   handleScriptChange, handleImageUpload, handleRender,
//   isRendering, renderProgress, finalVideoUrl,
//   jumpToTime, getTypographyScenes, getSlideshowScenes, fmtTime, S
// }) {
//   const isTypography = activeConfig.type === 'typography'
//     || (activeConfig.text_map && Object.keys(activeConfig.text_map).length > 0 && !activeConfig.image_map);
//   const typoScenes = isTypography ? getTypographyScenes(activeConfig) : [];
//   const slideScenes = !isTypography ? getSlideshowScenes(activeConfig) : [];
//   const scenes = isTypography ? typoScenes : slideScenes;

//   const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;

//   // Build format guide labels from scene structure
//   const sceneFormatGuide = isTypography
//     ? typoScenes.map(s => ({
//         label: s.label,
//         placeholder: activeConfig.text_map
//           ? Object.values(activeConfig.text_map)
//               .slice((Number(s.sceneNum) - 1) * 3, (Number(s.sceneNum) - 1) * 3 + 3)
//               .join(' · ')
//           : ''
//       }))
//     : [];

//   const handleSceneClick = (index) => {
//     setActiveSceneIndex(index);
//     const scene = scenes[index];
//     const seconds = isTypography ? (scene.timestamp || 0) : (scene.seconds || 0);
//     jumpToTime(seconds);
//   };

//   return (
//     <div style={S.splitGrid}>

//       {/* ── LEFT PANEL ── */}
//       <div style={S.leftPanel}>
//         <div>
//           <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
//             {activeConfig.type}
//           </div>
//           <div style={S.tmplTitle}>{activeConfig.name || activeTemplateId}</div>
//           <div style={S.tmplSub}>
//             {isTypography
//               ? 'Paste your script — we split it across all scenes automatically.'
//               : 'Upload your images — click a slot to preview that scene.'}
//           </div>
//         </div>

//         {/* Format guide — typography only */}
//         {isTypography && sceneFormatGuide.length > 0 && (
//           <div style={S.formatBox}>
//             <div style={S.formatTitle}>Script format guide</div>
//             {sceneFormatGuide.map((s, i) => (
//               <div key={i} style={{ ...S.fmtRow, marginBottom: i === sceneFormatGuide.length - 1 ? 0 : '7px' }}>
//                 <span style={S.fmtTag}>{s.label}</span>
//                 <span style={S.fmtDesc}>
//                   Original template words: <span style={{ color: '#f59e0b' }}>{s.placeholder}</span>
//                 </span>
//               </div>
//             ))}
//             <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #222', fontSize: '11px', color: '#555', lineHeight: '1.5' }}>
//               Separate scenes with a blank line, or just write — we split by sentences automatically.
//             </div>
//           </div>
//         )}

//         {/* Textarea — typography only */}
//         {isTypography && (
//           <div>
//             <div style={S.taLabel}>
//               <span style={S.taLabelText}>Your script</span>
//               <span style={S.wordCount}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
//             </div>
//             <textarea
//               value={scriptText}
//               onChange={handleScriptChange}
//               placeholder={`Paste your full script here...\n\nTip: press Enter twice between sections to split by scene.`}
//               style={S.textarea}
//             />
//           </div>
//         )}

//         {/* Scene chips / image slots */}
//         <div style={S.scenesLabel}>
//           {isTypography ? 'Live scene mapping' : 'Image slots'}
//         </div>

//         <div style={S.chipsWrap}>
//           {isTypography
//             ? typoScenes.map((scene, i) => {
//                 const sceneText = scene.keys.map(k => textData[k] || '').filter(Boolean).join(' ');
//                 const active = activeSceneIndex === i;
//                 return (
//                   <div key={i} style={S.chip(active)} onClick={() => handleSceneClick(i)}>
//                     <div style={S.chipTop}>
//                       <span style={S.chipName(active)}>{scene.label}</span>
//                       <span style={S.chipTime}>{fmtTime(scene.timestamp)}</span>
//                     </div>
//                     <div style={S.chipText(!!sceneText)}>
//                       {sceneText || '— paste your script above —'}
//                     </div>
//                   </div>
//                 );
//               })
//             : slideScenes.map((slot, i) => {
//                 const active = activeSceneIndex === i;
//                 const uploaded = imageData[slot.key];
//                 return (
//                   <div key={i} style={S.slotCard(active)} onClick={() => handleSceneClick(i)}>
//                     <div style={S.slotTop}>
//                       <span style={S.slotLabel(active)}>{slot.label}</span>
//                       <span style={S.slotBadge}>{slot.ratio} {slot.hint}</span>
//                     </div>
//                     <div style={S.slotUpload}>
//                       <div style={S.slotThumb}>
//                         {uploaded
//                           ? <img src={`http://localhost:3001${uploaded}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
//                           : <span style={{ fontSize: '16px', color: '#333' }}>+</span>
//                         }
//                       </div>
//                       <input
//                         type="file"
//                         accept="image/*"
//                         style={S.slotInput}
//                         onClick={e => e.stopPropagation()}
//                         onChange={e => {
//                           e.stopPropagation();
//                           handleImageUpload(slot.key, e.target.files[0]);
//                         }}
//                       />
//                     </div>
//                   </div>
//                 );
//               })
//           }
//         </div>

//         {/* Render button */}
//         <button onClick={handleRender} disabled={isRendering} style={S.renderBtn(isRendering)}>
//           {isRendering ? 'Rendering...' : '▷ Render Video'}
//         </button>

//         {isRendering && (
//           <div style={S.progressWrap}>
//             <div style={S.progressBar(renderProgress)} />
//             <div style={S.progressText}>Rendering... {renderProgress}%</div>
//           </div>
//         )}

//         {finalVideoUrl && !isRendering && (
//           <div style={S.finalBox}>
//             <h3 style={S.finalTitle}>Render Complete</h3>
//             <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '14px', border: '1px solid #333' }} />
//             <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={S.dlBtn}>↓ Download MP4</a>
//           </div>
//         )}
//       </div>

//       {/* ── RIGHT PANEL ── */}
//       <div style={S.rightPanel}>
//         <div style={S.rightLabel}>Template preview</div>

//         {/* Video player */}
//         <div style={S.vidWrap}>
//           {previewUrl ? (
//             <video
//               ref={videoRef}
//               src={previewUrl}
//               style={S.video}
//               controls={false}
//               loop
//               muted
//               playsInline
//               onLoadedMetadata={() => {
//                 if (videoRef.current) videoRef.current.play();
//               }}
//             />
//           ) : (
//             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '13px' }}>
//               No preview available
//             </div>
//           )}
//         </div>

//         {/* Manual controls */}
//         <div style={S.vidControls}>
//           <button style={S.ctrlBtn} onClick={() => {
//             if (videoRef.current) {
//               if (videoRef.current.paused) videoRef.current.play();
//               else videoRef.current.pause();
//             }
//           }}>▶ / ❚❚</button>
//           <button style={S.ctrlBtn} onClick={() => handleSceneClick(Math.max(0, activeSceneIndex - 1))}>◀◀ Prev</button>
//           <button style={S.ctrlBtn} onClick={() => handleSceneClick(Math.min(scenes.length - 1, activeSceneIndex + 1))}>Next ▶▶</button>
//         </div>

//         {/* Scene jump pills */}
//         <div style={S.rightLabel}>Jump to scene</div>
//         <div style={S.sceneNavWrap}>
//           {scenes.map((scene, i) => (
//             <button
//               key={i}
//               style={S.sceneNavBtn(activeSceneIndex === i)}
//               onClick={() => handleSceneClick(i)}
//             >
//               {isTypography ? `Scene ${scene.sceneNum}` : `Img ${i + 1}`}
//             </button>
//           ))}
//         </div>

//         {/* Current scene info */}
//         {scenes[activeSceneIndex] && (
//           <div style={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '12px 14px' }}>
//             <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
//               {isTypography ? `Scene ${scenes[activeSceneIndex].sceneNum} — original template text` : `Image ${activeSceneIndex + 1} — template frame`}
//             </div>
//             {isTypography ? (
//               <div style={{ fontSize: '13px', color: '#f59e0b', lineHeight: '1.5' }}>
//                 {scenes[activeSceneIndex].keys.map(k => activeConfig.text_map[k]).join(' · ')}
//               </div>
//             ) : (
//               <div style={{ fontSize: '13px', color: '#888' }}>
//                 {scenes[activeSceneIndex].ratio} · {scenes[activeSceneIndex].hint} · frame {activeConfig.scene_frame_times?.[`scene${activeSceneIndex + 1}`]}
//               </div>
//             )}
//             <div style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>
//               ↑ your content replaces this in the final render
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
import React, { useState, useEffect, useRef } from 'react';

export default function RenderStudio() {
  // ---- STATE ----
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [activeConfig, setActiveConfig] = useState(null);

  const [textData, setTextData] = useState({});
  const [imageData, setImageData] = useState({});
  const [scriptText, setScriptText] = useState('');

  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);

  // Split panel video state
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const videoRef = useRef(null);

  // ── 1. Fetch Template List ───────────────────────────────────────────────
  useEffect(() => {
    fetch('http://localhost:3001/api/render/templates')
      .then(res => res.json())
      .then(data => {
        const templateList = data.templates || [];
        const valid = templateList.filter(t => t.id || t.template_id);
        setTemplates(valid);
        if (valid.length > 0 && !activeTemplateId) {
          setActiveTemplateId(valid[0].id || valid[0].template_id);
        }
      })
      .catch(err => console.error('Error fetching templates:', err));
  }, []);

  // ── 2. Fetch Manifest when Template Changes ──────────────────────────────
  useEffect(() => {
    if (!activeTemplateId) return;
    setActiveConfig(null);
    fetch(`http://localhost:3001/api/render/manifest/${activeTemplateId}`)
      .then(res => res.json())
      .then(data => {
        const manifest = data.manifest || data;
        setActiveConfig(manifest);
        const initialText = {};
        if (manifest.text_map) {
          Object.keys(manifest.text_map).forEach(k => { initialText[k] = ''; });
        }
        setTextData(initialText);
        setImageData({});
        setScriptText('');
        setRenderProgress(0);
        setFinalVideoUrl(null);
        setActiveSceneIndex(0);
      })
      .catch(err => console.error('Error fetching manifest:', err));
  }, [activeTemplateId]);

  // ── 3. Gallery click listener ────────────────────────────────────────────
  useEffect(() => {
    const handler = e => setActiveTemplateId(e.detail);
    window.addEventListener('forceTemplateChange', handler);
    return () => window.removeEventListener('forceTemplateChange', handler);
  }, []);

  // ── HANDLERS ────────────────────────────────────────────────────────────

  const handleTextChange = (key, value) => {
    setTextData(prev => ({ ...prev, [key]: value }));
  };

  // Typography: split script across scene keys
  const handleScriptChange = (e) => {
    const text = e.target.value;
    setScriptText(text);
    if (!activeConfig?.text_map) return;

    const keys = Object.keys(activeConfig.text_map);
    if (!keys.length) return;

    // Get scene count — group by scene number
    const sceneNums = [...new Set(keys.map(k => {
      const m = k.match(/^scene(\d+)_/);
      return m ? m[1] : '1';
    }))];
    const sceneCount = sceneNums.length;

    // Split by blank lines first (user manually separated), then sentences, then word chunks
    let parts = [];
    const byBlank = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (byBlank.length >= 2) {
      parts = byBlank;
    } else {
      const bySentence = text.match(/[^.!?]+[.!?]+/g);
      if (bySentence && bySentence.length >= 2) {
        parts = bySentence.map(s => s.trim());
      } else {
        // Split into sceneCount chunks by words
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        const size = Math.max(1, Math.ceil(words.length / sceneCount));
        for (let i = 0; i < sceneCount; i++) {
          parts.push(words.slice(i * size, (i + 1) * size).join(' '));
        }
      }
    }

    // Map each part to the corresponding scene's keys
    const newTextData = {};
    sceneNums.forEach((sceneNum, si) => {
      const sceneKeys = keys.filter(k => k.match(new RegExp(`^scene${sceneNum}_`)));
      const part = parts[si] || '';
      // If scene has multiple keys, split part words across them
      const partWords = part.split(/\s+/).filter(Boolean);
      if (sceneKeys.length === 1) {
        newTextData[sceneKeys[0]] = part;
      } else {
        const wPerKey = Math.max(1, Math.ceil(partWords.length / sceneKeys.length));
        sceneKeys.forEach((k, ki) => {
          newTextData[k] = partWords.slice(ki * wPerKey, (ki + 1) * wPerKey).join(' ') || '';
        });
      }
    });

    setTextData(newTextData);
  };

  const handleImageUpload = async (key, file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.filePath) setImageData(prev => ({ ...prev, [key]: data.filePath }));
    } catch (err) {
      console.error('Upload failed', err);
    }
  };

  const handleRender = () => {
    setIsRendering(true);
    setRenderProgress(5);
    setFinalVideoUrl(null);

    const payload = {
      template_id: activeTemplateId,
      textData,
      imageData,
      strategy: 'full_render'
    };

    fetch('http://localhost:3001/api/render/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.jobId) {
          const pollInterval = setInterval(() => {
            fetch(`http://localhost:3001/api/jobs/${data.jobId}`)
              .then(r => r.json())
              .then(responseData => {
                const job = responseData.job || responseData;
                if (job.progress) setRenderProgress(job.progress);
                if (job.status === 'done') {
                  clearInterval(pollInterval);
                  setIsRendering(false);
                  setRenderProgress(100);
                  setFinalVideoUrl(`http://localhost:3001${job.outputUrl}`);
                } else if (job.status === 'error') {
                  clearInterval(pollInterval);
                  setIsRendering(false);
                  alert(`Render Failed: ${job.message}`);
                }
              })
              .catch(err => console.error('Polling error:', err));
          }, 2000);
        } else {
          setIsRendering(false);
          alert('Failed to queue render.');
        }
      })
      .catch(err => {
        console.error('Render error:', err);
        setIsRendering(false);
        alert('Network error connecting to backend.');
      });
  };

  // ── Video jump helper ────────────────────────────────────────────────────
  const sceneEndRef = useRef(null);

  const jumpToTime = (seconds, endSeconds = null) => {
    const vid = videoRef.current;
    if (!vid) return;

    // Remove any previous timeupdate listener
    if (sceneEndRef.current) {
      vid.removeEventListener('timeupdate', sceneEndRef.current);
      sceneEndRef.current = null;
    }

    vid.currentTime = seconds;
    vid.play();

    if (endSeconds != null) {
      const stopAt = (e) => {
        if (e.target.currentTime >= endSeconds) {
          e.target.pause();
          e.target.removeEventListener('timeupdate', stopAt);
          sceneEndRef.current = null;
        }
      };
      sceneEndRef.current = stopAt;
      vid.addEventListener('timeupdate', stopAt);
    }
  };

  // ── Scene data helpers ───────────────────────────────────────────────────

  // For typography: group text_map keys by scene number
  const getTypographyScenes = (config) => {
    if (!config?.text_map) return [];
    const sceneMap = {};
    Object.keys(config.text_map).forEach(key => {
      const match = key.match(/^scene(\d+)_/);
      if (match) {
        const sceneNum = match[1];
        if (!sceneMap[sceneNum]) sceneMap[sceneNum] = [];
        sceneMap[sceneNum].push(key);
      }
    });
    return Object.entries(sceneMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([sceneNum, keys], index, arr) => {
        // Start time = previous scene's outpoint, Scene 1 starts at 0
        const prevSceneNum = Number(sceneNum) - 1;
        const startTime = prevSceneNum > 0
          ? (config.scene_outpoints?.[`scene${prevSceneNum}`] || 0)
          : 0;
        const endTime = config.scene_outpoints?.[`scene${sceneNum}`] || null;
        return {
          sceneNum,
          keys,
          label: `Scene ${sceneNum}`,
          timestamp: startTime,
          endTime
        };
      });
  };

  // For photo_slideshow: one slot per image_map key
  const getSlideshowScenes = (config) => {
    if (!config?.image_map) return [];
    return Object.keys(config.image_map).map((key, i) => {
      const sceneKey = `scene${i + 1}`;
      const frameTime = config.scene_frame_times?.[sceneKey];
      const fps = 25;
      const seconds = frameTime != null ? frameTime / fps : 0;
      return {
        key,
        label: `Image ${i + 1}`,
        hint: config.image_map[key]?.hint || '',
        ratio: config.image_map[key]?.ratio || '',
        seconds
      };
    });
  };

  const previewUrl = activeTemplateId
    ? `/previews/${activeTemplateId}_preview.mp4`
    : null;

  const isSplitPanel = activeConfig?.type === 'typography' || activeConfig?.type === 'photo_slideshow'
    || (activeConfig?.text_map && Object.keys(activeConfig.text_map).length > 0 && !activeConfig?.image_map)
    || (activeConfig?.image_map && Object.keys(activeConfig.image_map).length > 0);

  // ── STYLES ──────────────────────────────────────────────────────────────
  const S = {
    root: { display: 'flex', minHeight: '80vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' },
    sidebar: { width: '280px', background: '#111', borderRight: '1px solid #222', padding: '24px', flexShrink: 0 },
    sidebarTitle: { fontSize: '11px', color: '#555', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' },
    tplCard: (active) => ({
      padding: '14px 16px', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer',
      background: active ? '#1a1a1a' : 'transparent',
      border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a', transition: 'all 0.2s'
    }),
    tplName: (active) => ({ color: active ? '#f59e0b' : '#fff', fontWeight: '600', fontSize: '14px' }),
    tplType: { fontSize: '11px', color: '#555', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '1px' },
    main: { flex: 1, padding: '32px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    splitGrid: { display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px', flex: 1, minHeight: 0 },
    leftPanel: { display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '8px', maxHeight: 'calc(100vh - 120px)' },
    rightPanel: { display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: '32px', height: 'fit-content' },
    tmplTitle: { fontSize: '22px', fontWeight: '700', textTransform: 'uppercase', margin: 0 },
    tmplSub: { fontSize: '13px', color: '#888', margin: '4px 0 0' },
    formatBox: { background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '14px 16px' },
    formatTitle: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' },
    fmtRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '7px' },
    fmtTag: { fontSize: '10px', fontWeight: '600', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: '4px', padding: '2px 8px', minWidth: '56px', textAlign: 'center', flexShrink: 0, marginTop: '1px' },
    fmtDesc: { fontSize: '12px', color: '#777', lineHeight: '1.5' },
    taLabel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
    taLabelText: { fontSize: '12px', color: '#888' },
    wordCount: { fontSize: '11px', color: '#555' },
    textarea: { width: '100%', minHeight: '110px', padding: '12px', background: '#0d0d0d', border: '1px solid #2a2a2a', color: '#fff', borderRadius: '6px', outline: 'none', resize: 'vertical', fontSize: '13px', lineHeight: '1.6', fontFamily: 'sans-serif' },
    scenesLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
    chipsWrap: { display: 'flex', flexDirection: 'column', gap: '5px' },
    chip: (active) => ({
      border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
      background: active ? 'rgba(245,158,11,0.07)' : '#111',
      borderRadius: '7px', padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s'
    }),
    chipTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' },
    chipName: (active) => ({ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: active ? '#f59e0b' : '#555' }),
    chipTime: { fontSize: '10px', color: '#444', fontVariantNumeric: 'tabular-nums' },
    chipText: (hasText) => ({ fontSize: '12px', color: hasText ? '#ccc' : '#444', fontStyle: hasText ? 'normal' : 'italic', lineHeight: '1.4' }),
    // Image slots
    slotCard: (active) => ({
      border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
      background: active ? 'rgba(245,158,11,0.05)' : '#111',
      borderRadius: '8px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s'
    }),
    slotTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
    slotLabel: (active) => ({ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', color: active ? '#f59e0b' : '#888' }),
    slotBadge: { fontSize: '10px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: '4px', padding: '2px 7px' },
    slotUpload: { display: 'flex', alignItems: 'center', gap: '10px' },
    slotThumb: { width: '48px', height: '32px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    slotInput: { flex: 1, fontSize: '12px', color: '#888' },
    // Right panel
    vidWrap: { position: 'relative', background: '#000', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9' },
    video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
    vidControls: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' },
    ctrlBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px', padding: '4px 6px', borderRadius: '4px' },
    sceneNavWrap: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
    sceneNavBtn: (active) => ({
      fontSize: '11px', padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', transition: 'all 0.15s',
      background: active ? '#f59e0b' : 'transparent',
      color: active ? '#000' : '#666',
      border: active ? '1px solid #f59e0b' : '1px solid #2a2a2a',
      fontWeight: active ? '600' : '400'
    }),
    rightLabel: { fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
    // Single column fallback
    singleCol: { width: '100%', maxWidth: '600px', background: '#141414', border: '1px solid #222', borderRadius: '12px', padding: '32px', margin: '0 auto' },
    renderBtn: (disabled) => ({
      width: '100%', padding: '14px', background: disabled ? '#555' : '#f59e0b',
      color: disabled ? '#888' : '#000', border: 'none', borderRadius: '6px',
      fontSize: '15px', fontWeight: '700', cursor: disabled ? 'not-allowed' : 'pointer',
      textTransform: 'uppercase', letterSpacing: '1px', marginTop: '8px'
    }),
    progressWrap: { marginTop: '16px', width: '100%', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden' },
    progressBar: (pct) => ({ width: `${pct}%`, height: '4px', background: '#f59e0b', transition: 'width 0.5s ease' }),
    progressText: { textAlign: 'center', marginTop: '6px', fontSize: '12px', color: '#666' },
    finalBox: { marginTop: '24px', padding: '16px', background: 'rgba(245,158,11,0.05)', border: '1px solid #f59e0b', borderRadius: '8px', textAlign: 'center' },
    finalTitle: { color: '#f59e0b', margin: '0 0 14px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' },
    dlBtn: { display: 'inline-block', padding: '10px 22px', background: '#f59e0b', color: '#000', textDecoration: 'none', fontWeight: '700', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '13px' }
  };

  const fmtTime = (s) => {
    if (s == null) return '';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div id="render-studio-section" style={S.root}>

      {/* SIDEBAR */}
      <div style={S.sidebar}>
        <div style={S.sidebarTitle}>Select Template</div>
        {templates.map((tpl, i) => {
          const id = tpl.id || tpl.template_id;
          const active = activeTemplateId === id;
          return (
            <div key={i} onClick={() => setActiveTemplateId(id)} style={S.tplCard(active)}>
              <div style={S.tplName(active)}>{tpl.name || id}</div>
              <div style={S.tplType}>{tpl.type}</div>
            </div>
          );
        })}
      </div>

      {/* MAIN AREA */}
      <div style={S.main}>
        {!activeConfig ? (
          <div style={{ color: '#555', textAlign: 'center', marginTop: '80px' }}>Loading template...</div>
        ) : isSplitPanel ? (
          <SplitPanelUI
            activeConfig={activeConfig}
            activeTemplateId={activeTemplateId}
            textData={textData}
            imageData={imageData}
            scriptText={scriptText}
            activeSceneIndex={activeSceneIndex}
            setActiveSceneIndex={setActiveSceneIndex}
            videoRef={videoRef}
            previewUrl={previewUrl}
            handleScriptChange={handleScriptChange}
            handleImageUpload={handleImageUpload}
            handleRender={handleRender}
            isRendering={isRendering}
            renderProgress={renderProgress}
            finalVideoUrl={finalVideoUrl}
            jumpToTime={jumpToTime}
            getTypographyScenes={getTypographyScenes}
            getSlideshowScenes={getSlideshowScenes}
            fmtTime={fmtTime}
            S={S}
          />
        ) : (
          /* ── FALLBACK: original single-column UI for other types ── */
          <div style={S.singleCol}>
            <h1 style={{ margin: '0 0 8px', fontSize: '26px', textTransform: 'uppercase' }}>
              {activeConfig.name || activeTemplateId}
            </h1>
            <p style={{ color: '#888', marginBottom: '28px', fontSize: '13px' }}>
              Fill in the media and text to generate your cinematic reel.
            </p>

            {activeConfig.text_map && Object.keys(activeConfig.text_map).length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                {Object.keys(activeConfig.text_map).map(key => (
                  <div key={key} style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {key.replace(/_/g, ' ')}
                    </label>
                    <input type="text" value={textData[key] || ''} onChange={e => handleTextChange(key, e.target.value)}
                      style={{ width: '100%', padding: '11px', background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '13px' }} />
                  </div>
                ))}
              </div>
            )}

            {activeConfig.image_map && Object.keys(activeConfig.image_map).length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <h3 style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Media Slots</h3>
                {Object.keys(activeConfig.image_map).map(key => (
                  <div key={key} style={{ marginBottom: '14px', padding: '14px', border: '1px dashed #2a2a2a', borderRadius: '8px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
                      {key} — {activeConfig.image_map[key]?.hint || 'Upload Image'}
                    </label>
                    <input type="file" accept="image/*" onChange={e => handleImageUpload(key, e.target.files[0])} style={{ color: '#ccc', fontSize: '12px' }} />
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleRender} disabled={isRendering} style={S.renderBtn(isRendering)}>
              {isRendering ? 'Rendering...' : '▷ Render Video'}
            </button>

            {isRendering && (
              <div style={S.progressWrap}>
                <div style={S.progressBar(renderProgress)} />
                <div style={S.progressText}>Rendering... {renderProgress}%</div>
              </div>
            )}

            {finalVideoUrl && !isRendering && (
              <div style={S.finalBox}>
                <h3 style={S.finalTitle}>Render Complete</h3>
                <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '14px', border: '1px solid #333' }} />
                <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={S.dlBtn}>↓ Download MP4</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SPLIT PANEL COMPONENT ────────────────────────────────────────────────────
function SplitPanelUI({
  activeConfig, activeTemplateId, textData, imageData, scriptText,
  activeSceneIndex, setActiveSceneIndex, videoRef, previewUrl,
  handleScriptChange, handleImageUpload, handleRender,
  isRendering, renderProgress, finalVideoUrl,
  jumpToTime, getTypographyScenes, getSlideshowScenes, fmtTime, S
}) {
  const isTypography = activeConfig.type === 'typography'
    || (activeConfig.text_map && Object.keys(activeConfig.text_map).length > 0 && !activeConfig.image_map);
  const typoScenes = isTypography ? getTypographyScenes(activeConfig) : [];
  const slideScenes = !isTypography ? getSlideshowScenes(activeConfig) : [];
  const scenes = isTypography ? typoScenes : slideScenes;

  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;

  // Build format guide — show actual original template words per scene
  const sceneFormatGuide = isTypography
    ? typoScenes.map(s => ({
        label: s.label,
        // Get the actual original template placeholder words from text_map values for this scene's keys
        placeholder: s.keys.map(k => activeConfig.text_map[k]).filter(Boolean).join(' ')
      }))
    : [];

  const handleSceneClick = (index) => {
    setActiveSceneIndex(index);
    const scene = scenes[index];
    const vid = videoRef.current;
    if (!vid) return;

    if (isTypography) {
      jumpToTime(scene.timestamp || 0, scene.endTime || null);
    } else {
      vid.pause();
      vid.currentTime = scene.seconds || 0;
    }
  };

  return (
    <div style={S.splitGrid}>

      {/* ── LEFT PANEL ── */}
      <div style={S.leftPanel}>
        <div>
          <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            {activeConfig.type}
          </div>
          <div style={S.tmplTitle}>{activeConfig.name || activeTemplateId}</div>
          <div style={S.tmplSub}>
            {isTypography
              ? 'Paste your script — we split it across all scenes automatically.'
              : 'Upload your images — click a slot to preview that scene.'}
          </div>
        </div>

        {/* Format guide — typography only */}
        {isTypography && sceneFormatGuide.length > 0 && (
          <div style={S.formatBox}>
            <div style={S.formatTitle}>Script format guide</div>
            {sceneFormatGuide.map((s, i) => (
              <div key={i} style={{ ...S.fmtRow, marginBottom: i === sceneFormatGuide.length - 1 ? 0 : '7px' }}>
                <span style={S.fmtTag}>{s.label}</span>
                <span style={S.fmtDesc}>
                  Original template words: <span style={{ color: '#f59e0b' }}>{s.placeholder}</span>
                </span>
              </div>
            ))}
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #222', fontSize: '11px', color: '#555', lineHeight: '1.5' }}>
              Separate scenes with a blank line, or just write — we split by sentences automatically.
            </div>
          </div>
        )}

        {/* Textarea — typography only */}
        {isTypography && (
          <div>
            <div style={S.taLabel}>
              <span style={S.taLabelText}>Your script</span>
              <span style={S.wordCount}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
            </div>
            <textarea
              value={scriptText}
              onChange={handleScriptChange}
              placeholder={`Paste your full script here...\n\nTip: press Enter twice between sections to split by scene.`}
              style={S.textarea}
            />
          </div>
        )}

        {/* Scene chips / image slots */}
        <div style={S.scenesLabel}>
          {isTypography ? 'Live scene mapping' : 'Image slots'}
        </div>

        <div style={S.chipsWrap}>
          {isTypography
            ? typoScenes.map((scene, i) => {
                const sceneText = scene.keys.map(k => textData[k] || '').filter(Boolean).join(' ');
                const active = activeSceneIndex === i;
                return (
                  <div key={i} style={S.chip(active)} onClick={() => handleSceneClick(i)}>
                    <div style={S.chipTop}>
                      <span style={S.chipName(active)}>{scene.label}</span>
                      <span style={S.chipTime}>{fmtTime(scene.timestamp)}</span>
                    </div>
                    <div style={S.chipText(!!sceneText)}>
                      {sceneText || '— paste your script above —'}
                    </div>
                  </div>
                );
              })
            : slideScenes.map((slot, i) => {
                const active = activeSceneIndex === i;
                const uploaded = imageData[slot.key];
                return (
                  <div key={i} style={S.slotCard(active)} onClick={() => handleSceneClick(i)}>
                    <div style={S.slotTop}>
                      <span style={S.slotLabel(active)}>{slot.label}</span>
                      <span style={S.slotBadge}>{slot.ratio} {slot.hint}</span>
                    </div>
                    <div style={S.slotUpload}>
                      <div style={S.slotThumb}>
                        {uploaded
                          ? <img src={`http://localhost:3001${uploaded}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: '16px', color: '#333' }}>+</span>
                        }
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        style={S.slotInput}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          e.stopPropagation();
                          handleImageUpload(slot.key, e.target.files[0]);
                        }}
                      />
                    </div>
                  </div>
                );
              })
          }
        </div>

        {/* Render button */}
        <button onClick={handleRender} disabled={isRendering} style={S.renderBtn(isRendering)}>
          {isRendering ? 'Rendering...' : '▷ Render Video'}
        </button>

        {isRendering && (
          <div style={S.progressWrap}>
            <div style={S.progressBar(renderProgress)} />
            <div style={S.progressText}>Rendering... {renderProgress}%</div>
          </div>
        )}

        {finalVideoUrl && !isRendering && (
          <div style={S.finalBox}>
            <h3 style={S.finalTitle}>Render Complete</h3>
            <video src={finalVideoUrl} controls autoPlay style={{ width: '100%', borderRadius: '6px', marginBottom: '14px', border: '1px solid #333' }} />
            <a href={finalVideoUrl} download target="_blank" rel="noreferrer" style={S.dlBtn}>↓ Download MP4</a>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={S.rightPanel}>
        <div style={S.rightLabel}>Template preview</div>

        {/* Video player */}
        <div style={S.vidWrap}>
          {previewUrl ? (
            <video
              ref={videoRef}
              src={previewUrl}
              style={S.video}
              controls={false}
              loop
              muted
              playsInline
              onLoadedMetadata={() => {
                if (videoRef.current) videoRef.current.play();
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '13px' }}>
              No preview available
            </div>
          )}
        </div>

        {/* Manual controls */}
        <div style={S.vidControls}>
          <button style={S.ctrlBtn} onClick={() => {
            if (videoRef.current) {
              if (videoRef.current.paused) videoRef.current.play();
              else videoRef.current.pause();
            }
          }}>▶ / ❚❚</button>
          <button style={S.ctrlBtn} onClick={() => handleSceneClick(Math.max(0, activeSceneIndex - 1))}>◀◀ Prev</button>
          <button style={S.ctrlBtn} onClick={() => handleSceneClick(Math.min(scenes.length - 1, activeSceneIndex + 1))}>Next ▶▶</button>
        </div>

        {/* Scene jump pills */}
        <div style={S.rightLabel}>Jump to scene</div>
        <div style={S.sceneNavWrap}>
          {scenes.map((scene, i) => (
            <button
              key={i}
              style={S.sceneNavBtn(activeSceneIndex === i)}
              onClick={() => handleSceneClick(i)}
            >
              {isTypography ? `Scene ${scene.sceneNum}` : `Img ${i + 1}`}
            </button>
          ))}
        </div>

        {/* Current scene info */}
        {scenes[activeSceneIndex] && (
          <div style={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
              {isTypography
                ? `Scene ${scenes[activeSceneIndex].sceneNum} — your text will replace`
                : `Image ${activeSceneIndex + 1} — template frame`}
            </div>
            {isTypography ? (
              <div>
                {scenes[activeSceneIndex].keys.map((k, ki) => (
                  <div key={ki} style={{ fontSize: '13px', color: '#f59e0b', lineHeight: '1.8' }}>
                    <span style={{ color: '#555', fontSize: '11px' }}>layer: </span>
                    <span>{activeConfig.text_map[k]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#888' }}>
                {scenes[activeSceneIndex].ratio} · {scenes[activeSceneIndex].hint} · frame {activeConfig.scene_frame_times?.[`scene${activeSceneIndex + 1}`]}
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#444', marginTop: '6px' }}>
              ↑ your typed text replaces this layer in the final render
            </div>
          </div>
        )}
      </div>
    </div>
  );
}