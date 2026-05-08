import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://tripp-acinaceous-bellicosely.ngrok-free.dev";

// ─── Upload ───────────────────────────────────────────────────────────────────
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
          try { resolve(JSON.parse(xhr.responseText).path || JSON.parse(xhr.responseText).filePath); }
          catch { reject(new Error("Bad response")); }
        } else reject(new Error("Upload failed"));
      };
      xhr.onerror = () => reject(new Error("Network"));
      xhr.open("POST", `${API}/api/upload`);
      xhr.send(fd);
    });
  }, []);
}

// ─── Normalize template from API ──────────────────────────────────────────────
function norm(t) {
  const name = t.id || t.name || "";
  return {
    ...t,
    name,
    previewBase: `${API}/templates/${name}/preview`,
    footageBase: `${API}/footage/${name}/(Footage)`,
    config: {
      compName:    t.compName,
      fps:         t.fps,
      duration:    t.duration,
      imageLayers: (t.imageFields || t.imageLayers || []),
      textLayers:  (t.textFields  || t.textLayers  || []),
      sceneMap:    t.sceneMap || {},
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clean(s = "") {
  return s.replace(/^\d+\s*[-–]\s*/, "").replace(/[_-]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase()).trim() || s;
}

function keyN(k = "") {
  const m = k.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function buildSlots(config) {
  if (!config) return { slots: [], extraText: [] };
  const imgF     = config.imageLayers || [];
  const txtF     = config.textLayers  || [];
  const usedKeys = new Set();

  const slots = imgF.map(img => {
    const n     = keyN(img.key);
    const texts = n !== null ? txtF.filter(t => keyN(t.key) === n) : [];
    texts.forEach(t => usedKeys.add(t.key));
    return { img, texts };
  });

  const extraText = txtF.filter(t => !usedKeys.has(t.key));
  return { slots, extraText };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f0eeea;--bg2:#e8e6e0;--white:#fff;
  --ink:#111110;--ink2:#5c5b56;--ink3:#9e9d97;
  --border:#dddcd7;--accent:#ff4500;--green:#16a34a;
}
html,body,#root{height:100%;font-family:'Inter',sans-serif;}
body{background:var(--bg);color:var(--ink);overflow:hidden;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
::-webkit-scrollbar-track{background:transparent;}
@keyframes fu{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes ind{0%{transform:translateX(-150%)}100%{transform:translateX(430%)}}
`;

// ─── CropTool ─────────────────────────────────────────────────────────────────
function CropTool({ src, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef    = useRef(new Image());
  const s         = useRef({
    imgW:0, imgH:0, zoom:1, minZoom:0.3, maxZoom:4,
    panX:0, panY:0, crop:null,
    dragging:false, panning:false, lastX:0, lastY:0,
    resizing:null, resizeStartCrop:null, resizeStartX:0, resizeStartY:0,
  });
  const rafRef          = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom]   = useState(1);
  const HANDLE = 12;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;
    const { zoom:z, panX, panY, crop } = s.current;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.save(); ctx.translate(panX,panY); ctx.scale(z,z);
    ctx.drawImage(img, 0, 0, s.current.imgW, s.current.imgH);
    ctx.restore();
    if (!crop) return;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0,0,W,H);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(crop.x, crop.y, crop.w, crop.h);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(crop.x, crop.y, crop.w, crop.h); ctx.clip();
    ctx.translate(panX,panY); ctx.scale(z,z);
    ctx.drawImage(img, 0, 0, s.current.imgW, s.current.imgH);
    ctx.restore();
    ctx.strokeStyle="#ff4500"; ctx.lineWidth=2;
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
    ctx.strokeStyle="rgba(255,255,255,0.2)"; ctx.lineWidth=0.5;
    for (let i=1;i<3;i++) {
      ctx.beginPath(); ctx.moveTo(crop.x+crop.w*i/3,crop.y); ctx.lineTo(crop.x+crop.w*i/3,crop.y+crop.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(crop.x,crop.y+crop.h*i/3); ctx.lineTo(crop.x+crop.w,crop.y+crop.h*i/3); ctx.stroke();
    }
    ctx.fillStyle="#ff4500";
    [[crop.x,crop.y],[crop.x+crop.w-HANDLE,crop.y],[crop.x,crop.y+crop.h-HANDLE],[crop.x+crop.w-HANDLE,crop.y+crop.h-HANDLE]]
      .forEach(([hx,hy]) => ctx.fillRect(hx,hy,HANDLE,HANDLE));
  }, []);

  const schedDraw = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw); };

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = Math.min(window.innerWidth*0.88, 760);
      const maxH = window.innerHeight*0.72;
      const fit  = Math.min(maxW/img.naturalWidth, maxH/img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth*fit);
      canvas.height = Math.round(img.naturalHeight*fit);
      s.current.imgW = img.naturalWidth;
      s.current.imgH = img.naturalHeight;
      s.current.zoom = fit;
      s.current.minZoom = fit*0.5;
      s.current.maxZoom = fit*8;
      setZoom(fit);
      const cw = canvas.width*0.75, ch = canvas.height*0.75;
      s.current.crop = { x:(canvas.width-cw)/2, y:(canvas.height-ch)/2, w:cw, h:ch };
      setReady(true);
      schedDraw();
    };
    img.src = src;
    return () => cancelAnimationFrame(rafRef.current);
  }, [src]);

  useEffect(() => { if (ready) schedDraw(); }, [ready]);

  const applyZoom = (newZ, px, py) => {
    newZ = Math.max(s.current.minZoom, Math.min(s.current.maxZoom, newZ));
    const ratio = newZ/s.current.zoom;
    s.current.panX = px - ratio*(px-s.current.panX);
    s.current.panY = py - ratio*(py-s.current.panY);
    s.current.zoom = newZ; setZoom(newZ); schedDraw();
  };
  const zoomBy = d => { const c=canvasRef.current; applyZoom(s.current.zoom*d, c.width/2, c.height/2); };
  const onWheel = e => {
    e.preventDefault();
    const c=canvasRef.current, r=c.getBoundingClientRect();
    applyZoom(s.current.zoom*(e.deltaY<0?1.12:0.89), e.clientX-r.left, e.clientY-r.top);
  };
  const getPos = e => {
    const c=canvasRef.current, r=c.getBoundingClientRect(), t=e.touches?.[0]||e;
    return { x:t.clientX-r.left, y:t.clientY-r.top };
  };
  const hitHandle = (x,y) => {
    const {crop} = s.current; if (!crop) return null;
    const corners = { tl:[crop.x,crop.y], tr:[crop.x+crop.w-HANDLE,crop.y], bl:[crop.x,crop.y+crop.h-HANDLE], br:[crop.x+crop.w-HANDLE,crop.y+crop.h-HANDLE] };
    for (const [k,[hx,hy]] of Object.entries(corners)) if (x>=hx&&x<=hx+HANDLE&&y>=hy&&y<=hy+HANDLE) return k;
    return null;
  };
  const inCrop = (x,y) => { const {crop}=s.current; return crop&&x>=crop.x&&x<=crop.x+crop.w&&y>=crop.y&&y<=crop.y+crop.h; };
  const onDown = e => {
    const {x,y}=getPos(e), h=hitHandle(x,y);
    if (h) { s.current.resizing=h; s.current.resizeStartCrop={...s.current.crop}; s.current.resizeStartX=x; s.current.resizeStartY=y; }
    else if (inCrop(x,y)) { s.current.dragging=true; s.current.lastX=x-s.current.crop.x; s.current.lastY=y-s.current.crop.y; }
    else { s.current.panning=true; s.current.lastX=x; s.current.lastY=y; }
    e.preventDefault();
  };
  const onMove = e => {
    const {x,y}=getPos(e), c=canvasRef.current, W=c.width, H=c.height;
    if (s.current.panning) {
      s.current.panX+=x-s.current.lastX; s.current.panY+=y-s.current.lastY;
      s.current.lastX=x; s.current.lastY=y; schedDraw();
    } else if (s.current.dragging) {
      s.current.crop.x=Math.max(0,Math.min(x-s.current.lastX,W-s.current.crop.w));
      s.current.crop.y=Math.max(0,Math.min(y-s.current.lastY,H-s.current.crop.h));
      schedDraw();
    } else if (s.current.resizing) {
      const sc=s.current.resizeStartCrop, dx=x-s.current.resizeStartX, dy=y-s.current.resizeStartY;
      let {x:cx,y:cy,w:cw,h:ch}=sc; const min=40;
      if (s.current.resizing==="br") { cw=Math.max(min,sc.w+dx); ch=Math.max(min,sc.h+dy); }
      else if (s.current.resizing==="bl") { cw=Math.max(min,sc.w-dx); cx=sc.x+sc.w-cw; ch=Math.max(min,sc.h+dy); }
      else if (s.current.resizing==="tr") { cw=Math.max(min,sc.w+dx); cy=sc.y+sc.h-(ch=Math.max(min,sc.h-dy)); }
      else if (s.current.resizing==="tl") { cw=Math.max(min,sc.w-dx); cx=sc.x+sc.w-cw; cy=sc.y+sc.h-(ch=Math.max(min,sc.h-dy)); }
      cx=Math.max(0,cx); cy=Math.max(0,cy);
      if (cx+cw>W) cw=W-cx; if (cy+ch>H) ch=H-cy;
      s.current.crop={x:cx,y:cy,w:cw,h:ch}; schedDraw();
    }
    e.preventDefault();
  };
  const onUp = () => { s.current.dragging=false; s.current.panning=false; s.current.resizing=null; };
  const confirm = () => {
    const img=imgRef.current, {crop,zoom:z,panX,panY}=s.current;
    if (!crop) return;
    const out=document.createElement("canvas");
    out.width=Math.round(crop.w/z); out.height=Math.round(crop.h/z);
    out.getContext("2d").drawImage(img,(crop.x-panX)/z,(crop.y-panY)/z,crop.w/z,crop.h/z,0,0,out.width,out.height);
    out.toBlob(blob => onDone(new File([blob],"cropped.jpg",{type:"image/jpeg"}),URL.createObjectURL(blob)),"image/jpeg",0.93);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:1000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
      <div style={{color:"rgba(255,255,255,.45)",fontSize:12}}>Scroll to zoom · Drag crop box to move · Drag corners to resize · Drag outside to pan</div>
      <canvas ref={canvasRef} style={{maxWidth:"88vw",maxHeight:"72vh",cursor:"crosshair",borderRadius:8,touchAction:"none",display:ready?"block":"none"}}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onWheel={onWheel} />
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>zoomBy(0.8)} style={{width:32,height:32,borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"white",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
        <div style={{width:100,height:4,background:"rgba(255,255,255,.12)",borderRadius:2,position:"relative",cursor:"pointer"}}
          onClick={e=>{const r=e.currentTarget.getBoundingClientRect(),ratio=(e.clientX-r.left)/r.width;applyZoom(s.current.minZoom+ratio*(s.current.maxZoom-s.current.minZoom),canvasRef.current.width/2,canvasRef.current.height/2);}}>
          <div style={{position:"absolute",left:0,top:0,height:"100%",background:"#ff4500",borderRadius:2,width:`${((zoom-s.current.minZoom)/(s.current.maxZoom-s.current.minZoom))*100}%`}} />
        </div>
        <button onClick={()=>zoomBy(1.25)} style={{width:32,height:32,borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"white",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        <span style={{fontSize:11,color:"rgba(255,255,255,.3)",minWidth:36}}>{Math.round((zoom/(s.current.minZoom||1))*100)}%</span>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"transparent",color:"white",fontSize:13,cursor:"pointer"}}>Cancel</button>
        <button onClick={confirm} style={{padding:"10px 28px",borderRadius:8,border:"none",background:"#ff4500",color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>Use this crop →</button>
      </div>
    </div>
  );
}

// ─── ImgSlot ──────────────────────────────────────────────────────────────────
function ImgSlot({ slotId, imgField, textFields, data, onChange, uploadFn, footageBase, highlighted ,videoRef}) {
  const [preview,  setPreview]  = useState(null);
  const [cropping, setCropping] = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [prog,     setProg]     = useState(0);
  const [placeholderOk, setPlaceholderOk] = useState(false);

  const placeholderSrc = imgField.layerName ? `${footageBase}/${imgField.layerName}` : null;

  useEffect(() => {
    if (!placeholderSrc) return;
    fetch(placeholderSrc, { method:"HEAD" }).then(r => { if (r.ok) setPlaceholderOk(true); }).catch(()=>{});
  }, [placeholderSrc]);

  const onFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCropping(URL.createObjectURL(f));
  };
  const onCropDone = async (croppedFile, croppedUrl) => {
    setCropping(null); setPreview(croppedUrl); setBusy(true); setProg(0);
    try { onChange(imgField.key, await uploadFn(croppedFile, setProg)); }
    catch { setPreview(null); }
    finally { setBusy(false); }
  };
  const clear = e => { e.stopPropagation(); setPreview(null); onChange(imgField.key, null); };

  return (
    <>
      {cropping && <CropTool src={cropping} onDone={onCropDone} onCancel={()=>setCropping(null)} />}
      <div
        id={slotId}
        style={{
          border: highlighted ? "2px solid #ff4500" : "1.5px solid var(--border)",
          borderRadius:12, overflow:"hidden",
          background: highlighted ? "#fff5f0" : "var(--white)",
          transition:"border-color .6s,background .6s",
          marginBottom:8,
        }}
      >
        {/* header */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid var(--border)",background: highlighted?"#fff0e8":"var(--bg)"}}>
  <div style={{width:24,height:24,borderRadius:6,background:"#ff4500",color:"white",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    {keyN(imgField.key) || "?"}
  </div>
  <span style={{fontSize:12,fontWeight:600,color:"var(--ink)",flex:1}}>{clean(imgField.label||imgField.key)}</span>
  {(imgField.absIn !== null && imgField.absIn !== undefined) ? (
  <button
    onClick={() => {
      if (!videoRef || !videoRef.current) return;
      videoRef.current.currentTime = imgField.absIn;
      videoRef.current.play().catch(() => {});
      setTimeout(() => {
        if (videoRef && videoRef.current) videoRef.current.pause();
      }, 3000);
    }}
    style={{padding:"2px 7px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--ink2)",fontSize:10,fontWeight:600,cursor:"pointer",flexShrink:0,fontFamily:"monospace"}}
    onMouseEnter={e=>{e.currentTarget.style.background="#ff4500";e.currentTarget.style.color="white";e.currentTarget.style.borderColor="#ff4500";}}
    onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="var(--ink2)";e.currentTarget.style.borderColor="var(--border)";}}
  >
    {Number(imgField.absIn).toFixed(1)}s
  </button>
) : null}
  {busy && <span style={{fontSize:10,color:"#ff4500"}}>{prog}%</span>}
</div>
        {/* body */}
        <div style={{display:"flex"}}>
          {/* image area */}
          <div style={{width:110,height:110,flexShrink:0,position:"relative",background:"#f0eeea",borderRight:"1px solid var(--border)",overflow:"hidden",cursor:"pointer"}}>
            {placeholderOk && !preview && (
              <img src={placeholderSrc} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.35}} />
            )}
            {preview && <img src={preview} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} />}
            <label
              style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.45)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:20,color:"white",textShadow:"0 1px 4px rgba(0,0,0,.8)",pointerEvents:"none"}}>↑</span>
              <span style={{fontSize:9,color:"white",fontWeight:600,textShadow:"0 1px 3px rgba(0,0,0,.8)",pointerEvents:"none"}}>{preview?"CHANGE":"UPLOAD"}</span>
              <input type="file" accept="image/*,video/*" style={{display:"none"}} onChange={onFile} />
            </label>
            {preview && (
              <button onClick={clear} style={{position:"absolute",top:4,right:4,width:18,height:18,borderRadius:"50%",background:"rgba(0,0,0,.6)",border:"none",color:"white",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>×</button>
            )}
            {busy && (
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"rgba(0,0,0,.2)"}}>
                <div style={{height:"100%",width:`${prog}%`,background:"#ff4500",transition:"width .25s"}} />
              </div>
            )}
          </div>
          {/* text fields */}
          <div style={{flex:1,padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
            {textFields.length === 0 && <div style={{fontSize:11,color:"var(--ink3)",paddingTop:4}}>Image only slot</div>}
            {textFields.map((tf, i) => (
              <div key={i} style={{display:"flex",flexDirection:"column",gap:3}}>
                <label style={{fontSize:10,fontWeight:600,color:"var(--ink2)"}}>{clean(tf.label||tf.key)}</label>
                {(tf.label||"").length > 80
                  ? <textarea value={data[tf.key]||""} onChange={e=>onChange(tf.key,e.target.value)} placeholder="Enter text…"
                      style={{border:"1px solid var(--border)",borderRadius:6,background:"var(--bg)",color:"var(--ink)",fontFamily:"Inter,sans-serif",fontSize:12,padding:"5px 8px",width:"100%",outline:"none",resize:"none",minHeight:48,lineHeight:1.4,transition:"border-color .12s"}}
                      onFocus={e=>e.target.style.borderColor="#ff4500"} onBlur={e=>e.target.style.borderColor="var(--border)"} />
                  : <input type="text" value={data[tf.key]||""} onChange={e=>onChange(tf.key,e.target.value)} placeholder="Enter name or text…"
                      style={{border:"1px solid var(--border)",borderRadius:6,background:"var(--bg)",color:"var(--ink)",fontFamily:"Inter,sans-serif",fontSize:12,padding:"6px 8px",width:"100%",outline:"none",transition:"border-color .12s"}}
                      onFocus={e=>e.target.style.borderColor="#ff4500"} onBlur={e=>e.target.style.borderColor="var(--border)"} />
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── SceneStrip ───────────────────────────────────────────────────────────────
function SceneStrip({ templateName, config, data, videoRef, onSceneClick }) {
  const [act, setAct] = useState(0);
  const entries = Object.entries(config?.sceneMap || {});
  if (!entries.length) return null;

  const jump = (sceneData, i) => {
  setAct(i);
  const op = sceneData.outpoint || 0;
  const prevOp = i === 0 ? 0 : (entries[i-1][1].outpoint || 0);
  const startTime = i === 0 ? 0 : Math.max(0, prevOp + 0.1);

  if (videoRef.current) {
    videoRef.current.currentTime = startTime;
    videoRef.current.play().catch(() => {});

    // Stop at scene end
    const stopAt = op;
    const onTimeUpdate = () => {
      if (videoRef.current && videoRef.current.currentTime >= stopAt) {
        videoRef.current.pause();
        videoRef.current.removeEventListener('timeupdate', onTimeUpdate);
      }
    };
    // Remove any previous listener first
    videoRef.current.removeEventListener('timeupdate', videoRef.current._sceneListener);
    videoRef.current._sceneListener = onTimeUpdate;
    videoRef.current.addEventListener('timeupdate', onTimeUpdate);
  }

  if (onSceneClick) onSceneClick(sceneData.keys || [], i);
};

  return (
    <div style={{background:"#0a0a0a",borderTop:"1px solid #1c1c1c",padding:"10px 14px 12px",flexShrink:0}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"#333",marginBottom:8}}>
        Scenes — click to jump &amp; highlight fields
      </div>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
        {entries.map(([key, sc], i) => {
          const ik  = (sc.keys||[]).find(k => k.startsWith("photo_")||k.startsWith("image_"));
          const src = ik ? data[ik] : null;
          return (
            <div key={key} onClick={()=>jump(sc,i)} title={`${clean(key)} — ${(sc.outpoint||0).toFixed(1)}s`}
              style={{flexShrink:0,width:76,cursor:"pointer",display:"flex",flexDirection:"column",gap:3,opacity:act===i?1:0.55,transition:"opacity .15s"}}>
              <div style={{width:76,height:48,borderRadius:6,background:"#181818",border:`1.5px solid ${act===i?"#ff4500":"transparent"}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",transition:"border-color .12s"}}>
                {src
                  ? <img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                  : <span style={{fontSize:9,fontWeight:700,color:act===i?"#ff4500":"#2a2a2a"}}>{(sc.outpoint||0).toFixed(1)}s</span>
                }
              </div>
              <div style={{fontSize:9,color:act===i?"#aaa":"#2e2e2e",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clean(key)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TCard ────────────────────────────────────────────────────────────────────
const PALETTES = ["#1a1a2e","#16213e","#0f3460","#1b1b2f","#2d132c","#1f4068","#1b262c","#162447","#1a1a1a","#2c2c2c","#3d2b1f","#1e3a2f","#2b1d3a","#1a2e1a","#2e1a1a","#1a2535"];
const ICONS    = { investigation:"🔍",carousel:"🎠",slideshow:"🖼",decoder:"💻",typography:"✍️",labor:"🏗",motion:"🎬",dynamic:"⚡" };
const tIcon    = n => { const l=(n||"").toLowerCase(); for(const[k,v] of Object.entries(ICONS)) if(l.includes(k)) return v; return "🎬"; };

function TCard({ t, idx, onClick }) {
  const [mediaSrc,  setMediaSrc]  = useState(null);
  const [mediaType, setMediaType] = useState(null);

  useEffect(() => {
  // Don't HEAD check — just try setting src directly, browser will handle 404
  const name = t.name;
  const base = `${API}/templates/${name}/preview`;
  // Try video first, fallback to img using onError
  setMediaSrc(`${base}/preview.mp4`);
  setMediaType("video");
}, [t.name]);

  const imgs = t.config?.imageLayers?.length || 0;
  const txts = t.config?.textLayers?.length  || 0;
  const dur  = t.config?.duration ? `${Math.round(t.config.duration)}s` : null;

  return (
    <div onClick={onClick}
      style={{borderRadius:14,overflow:"hidden",cursor:"pointer",background:"var(--white)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",animation:"fu .2s ease both",animationDelay:`${idx*.04}s`}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,.1)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
      <div style={{height:130,position:"relative",overflow:"hidden",background:PALETTES[idx%PALETTES.length],display:"flex",alignItems:"center",justifyContent:"center"}}>
        {mediaType==="video" && (
  <video
    src={mediaSrc}
    muted autoPlay loop playsInline
    style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}
    onError={() => {
      // video failed, try jpg
      setMediaSrc(`${API}/templates/${t.name}/preview/preview.jpg`);
      setMediaType("img");
    }}
  />
)}
{mediaType==="img" && (
  <img
    src={mediaSrc}
    alt=""
    style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}
    onError={() => {
      // img failed too, show nothing
      setMediaSrc(null);
      setMediaType(null);
    }}
  />
)}
        {!mediaSrc && <span style={{fontSize:38,opacity:.3}}>{tIcon(t.name)}</span>}
      </div>
      <div style={{padding:"12px 14px"}}>
        <div style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{clean(t.name)}</div>
        <div style={{fontSize:11,color:"var(--ink3)",marginTop:3}}>{[imgs&&`${imgs} photos`,txts&&`${txts} text`,dur].filter(Boolean).join(" · ")}</div>
        <div style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:3,fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:100,background:"var(--bg2)",color:"var(--ink3)"}}>
          {tIcon(t.name)} {imgs>0&&txts>0?"Photo + Text":imgs>0?"Photo":"Text"}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [templates,       setTemplates]       = useState([]);
  const [sel,             setSel]             = useState(null);
  const [chunks,          setChunks]          = useState([{}]);
  const [chunk,           setChunk]           = useState(0);
  const [tab,             setTab]             = useState("photos");
  const [jobId,           setJobId]           = useState(null);
  const [jobSt,           setJobSt]           = useState(null);
  const [rState,          setRState]          = useState("idle");
  const [outUrl,          setOutUrl]          = useState(null);
  const [toast,           setToast]           = useState(null);
  const [highlightedKeys, setHighlightedKeys] = useState(new Set());

  const vidRef = useRef(null);
  const upload = useUpload();

  const data   = chunks[chunk] || {};
  const config = sel?.config   || null;
  const { slots, extraText } = buildSlots(config);
  console.log("IMAGE LAYERS:", config?.imageLayers?.map(l => ({ key: l.key, absIn: l.absIn })));


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
      .then(d => setTemplates((Array.isArray(d)?d:d.templates||[]).map(norm).filter(t=>t.name)))
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
        if (d.status==="done") {
          clearInterval(iv); setRState("done");
          const url = d.outputUrl
  ? `${API}${d.outputUrl}`
  : `${API}/outputs/${jobId}.mp4`;
          setOutUrl(url);
          // if (vidRef.current) { vidRef.current.src=url; vidRef.current.load(); }
          toast2("✓ Video ready — download below");
        } else if (d.status==="error"||d.status==="failed") {
          clearInterval(iv); setRState("error"); toast2("Render failed");
        }
      } catch {}
    }, 2500);
    return () => clearInterval(iv);
  }, [jobId, rState]);

  const toast2 = msg => { setToast(msg); setTimeout(()=>setToast(null), 3200); };

  const setF = (key, val) => setChunks(prev => {
    const n = [...prev]; n[chunk] = { ...n[chunk], [key]: val }; return n;
  });

  // scene click → jump video + highlight + scroll to fields
  const handleSceneClick = (keys, sceneIdx) => {
    setHighlightedKeys(new Set(keys));
    const imgKeys  = (config?.imageLayers||[]).map(l => l.key);
    const hasPhoto = keys.some(k => imgKeys.includes(k));
    if (hasPhoto) setTab("photos"); else setTab("text");

    setTimeout(() => {
      const firstImgKey  = keys.find(k => imgKeys.includes(k));
      const firstTextKey = keys.find(k => !imgKeys.includes(k));
      if (firstImgKey) {
        const idx = slots.findIndex(s => s.img.key === firstImgKey);
        if (idx >= 0) document.getElementById(`slot-${idx}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
      } else if (firstTextKey) {
        document.getElementById(`tfield-${firstTextKey}`)?.scrollIntoView({ behavior:"smooth", block:"center" });
      }
      setTimeout(() => setHighlightedKeys(new Set()), 2500);
    }, 80);
  };

  const startRender = async () => {
    if (!sel) return;
    setRState("rendering"); setOutUrl(null); setJobId(null); setJobSt(null);
    try {
      const merged    = Object.assign({}, ...chunks);
      const inputData = {};
      Object.entries(merged).forEach(([k,v]) => { if (v!==null&&v!==undefined&&v!=="") inputData[k]=v; });
      const r = await fetch(`${API}/api/render/start`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ template:sel.name, inputData }),
      });
      const d = await r.json();
      if (!r.ok) { setRState("error"); toast2(d.message||d.error||"Error"); return; }
      if (d.jobId) { setJobId(d.jobId); toast2("Rendering started…"); }
      else { setRState("error"); toast2("Could not start render"); }
    } catch { setRState("error"); toast2("Network error — is backend running?"); }
  };

  const reset = () => { setChunks([{}]); setChunk(0); setRState("idle"); setJobId(null); setOutUrl(null); setJobSt(null); setHighlightedKeys(new Set()); };
  const open  = t => { setSel(t); reset(); setTab("photos"); };
  const back  = () => { setSel(null); reset(); };

  const inEditor  = !!sel;
  const statusTxt = rState==="rendering"?(jobSt?.stage||"Rendering…"):rState==="done"?"Done":rState==="error"?"Error":"Ready";

  return (
    <>
      <style>{CSS}</style>

      {/* Topbar */}
      <div style={{height:52,display:"flex",alignItems:"center",padding:"0 18px",gap:10,background:"var(--white)",borderBottom:"1px solid var(--border)",position:"fixed",top:0,left:0,right:0,zIndex:50}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18,letterSpacing:"-.03em",flexShrink:0}}>
          Motion<em style={{color:"#ff4500",fontStyle:"normal"}}>AI</em>
        </div>
        <div style={{width:1,height:18,background:"var(--border)"}} />
        {inEditor ? (
          <>
            <span onClick={back} style={{fontSize:12,fontWeight:500,color:"var(--ink3)",cursor:"pointer"}}>Templates</span>
            <span style={{color:"var(--ink3)",fontSize:11}}>›</span>
            <span style={{fontSize:12,fontWeight:500,color:"var(--ink)"}}>{clean(sel.name)}</span>
          </>
        ) : (
          <span style={{fontSize:12,fontWeight:500,color:"var(--ink)"}}>Templates</span>
        )}
        <div style={{flex:1}} />
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:500,color:"var(--ink3)"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:rState==="rendering"?"#16a34a":rState==="error"?"#dc2626":"var(--ink3)",animation:rState==="rendering"?"blink 1.1s infinite":"none"}} />
          {statusTxt}
        </div>
      </div>

      {/* GALLERY */}
      {!inEditor && (
        <div style={{paddingTop:52,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"24px 28px 14px",flexShrink:0}}>
            <h1 style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,letterSpacing:"-.03em"}}>Choose a template</h1>
            <p style={{fontSize:13,color:"var(--ink2)",marginTop:4}}>Select the video style you want to generate</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,padding:"0 28px 28px",overflowY:"auto"}}>
            {templates.map((t,i) => <TCard key={t.name} t={t} idx={i} onClick={()=>open(t)} />)}
          </div>
        </div>
      )}

      {/* EDITOR */}
      {inEditor && (
        <div style={{position:"fixed",top:52,left:0,right:0,bottom:0,display:"flex",overflow:"hidden"}}>

          {/* Left: video + scenes */}
          <div style={{flex:1,display:"flex",flexDirection:"column",background:"#101010",minWidth:0,overflow:"hidden"}}>
            {/* video */}
            <div style={{flex:1,minHeight:0,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
              <video
              key={outUrl || 'preview'}
  ref={vidRef}
  controls
  src={outUrl || `${API}/templates/${sel.name}/preview/preview.mp4`}
  style={{width:"100%",height:"100%",objectFit:"contain"}}
  loop={!outUrl}
  autoPlay={!outUrl}
  muted={!outUrl}
  onError={() => {
    if (!outUrl && vidRef.current) {
      vidRef.current.removeAttribute('src');
      vidRef.current.load();
    }
  }}
/>
              {rState==="rendering" && (
                <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:"white",zIndex:10}}>
                  <div style={{width:26,height:26,border:"2px solid rgba(255,255,255,.1)",borderTopColor:"#ff4500",borderRadius:"50%",animation:"spin .75s linear infinite"}} />
                  <div style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>{jobSt?.stage||"Processing…"}</div>
                  <div style={{width:160,height:2,background:"rgba(255,255,255,.08)",borderRadius:1,overflow:"hidden"}}>
                    <div style={{height:"100%",background:"#ff4500",borderRadius:1,width:jobSt?.progress?`${jobSt.progress}%`:"35%",transition:jobSt?.progress?"width .4s":"none",animation:jobSt?.progress?"none":"ind 1.3s infinite ease-in-out"}} />
                  </div>
                </div>
              )}
            </div>
            {/* scene strip */}
            {config && (
              <SceneStrip
                templateName={sel.name}
                config={config}
                data={data}
                videoRef={vidRef}
                onSceneClick={handleSceneClick}
              />
            )}
          </div>

          {/* Right: form */}
          <div style={{width:390,flexShrink:0,display:"flex",flexDirection:"column",background:"var(--white)",borderLeft:"1px solid var(--border)",overflow:"hidden"}}>
            {/* tab bar */}
            <div style={{display:"flex",alignItems:"center",padding:"0 12px",borderBottom:"1px solid var(--border)",height:44,gap:3,flexShrink:0}}>
              {[{id:"photos",label:`Photos (${slots.length})`},{id:"text",label:`Text (${extraText.length})`}].map(({id,label})=>(
                <button key={id} onClick={()=>setTab(id)} style={{padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer",border:"none",background:tab===id?"var(--ink)":"transparent",color:tab===id?"white":"var(--ink2)",transition:"all .1s"}}>{label}</button>
              ))}
              <div style={{flex:1}} />
              <div style={{display:"flex",gap:3}}>
                {chunks.map((_,i)=>(
                  <button key={i} onClick={()=>setChunk(i)} style={{padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:500,cursor:"pointer",border:"1px solid var(--border)",background:chunk===i?"#ff4500":"transparent",color:chunk===i?"white":"var(--ink2)"}}>{i+1}</button>
                ))}
                <button onClick={()=>{setChunks(p=>[...p,{}]);setChunk(chunks.length);}} style={{padding:"3px 8px",borderRadius:5,fontSize:11,cursor:"pointer",border:"1px dashed var(--border)",background:"transparent",color:"var(--ink3)"}}>+</button>
              </div>
            </div>

            {/* fields */}
            <div style={{flex:1,overflowY:"auto",padding:"10px 10px 0"}}>

              {/* PHOTOS TAB */}
              {tab==="photos" && (
                <>
                  {slots.length===0 && <div style={{padding:"24px 0",textAlign:"center",color:"var(--ink3)",fontSize:12}}>No image slots.</div>}
                  {slots.map((slot,i) => (
                    <ImgSlot
                      key={i}
                      videoRef={vidRef}
                      slotId={`slot-${i}`}
                      imgField={slot.img}
                      textFields={slot.texts}
                      data={data}
                      onChange={setF}
                      uploadFn={upload}
                      footageBase={sel.footageBase}
                      highlighted={highlightedKeys.has(slot.img.key) || slot.texts.some(t=>highlightedKeys.has(t.key))}
                    />
                  ))}
                </>
              )}

              {/* TEXT TAB */}
              {tab==="text" && (
                <>
                  {extraText.length===0 && <div style={{padding:"24px 0",textAlign:"center",color:"var(--ink3)",fontSize:12}}>No standalone text fields.</div>}
                  {Object.entries(textGroups).map(([grp,fields])=>(
                    <div key={grp}>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--ink3)",padding:"12px 2px 6px",borderBottom:"1px solid var(--border)",marginBottom:6}}>{clean(grp)}</div>
                      {fields.map((f,i)=>(
                        <div key={i} id={`tfield-${f.key}`}
                          style={{display:"flex",flexDirection:"column",gap:4,padding:"8px 10px",borderRadius:8,border:highlightedKeys.has(f.key)?"1.5px solid #ff4500":"1px solid var(--border)",background:highlightedKeys.has(f.key)?"#fff5f0":"var(--bg)",marginBottom:6,transition:"border-color .3s,background .3s"}}
                          onFocusCapture={e=>e.currentTarget.style.borderColor="#ffb090"}
                          onBlurCapture={e=>e.currentTarget.style.borderColor=highlightedKeys.has(f.key)?"#ff4500":"var(--border)"}
                        >
                          <label style={{fontSize:10,fontWeight:600,color:"var(--ink2)"}}>{clean(f.label||f.key)}</label>
                          {(f.label||"").length>80
                            ? <textarea value={data[f.key]||""} onChange={e=>setF(f.key,e.target.value)} placeholder="Enter text…" style={{border:"none",background:"transparent",color:"var(--ink)",fontFamily:"Inter,sans-serif",fontSize:13,padding:0,width:"100%",outline:"none",resize:"none",minHeight:52,lineHeight:1.5}} />
                            : <input type="text" value={data[f.key]||""} onChange={e=>setF(f.key,e.target.value)} placeholder={f.label||"Enter text…"} style={{border:"none",background:"transparent",color:"var(--ink)",fontFamily:"Inter,sans-serif",fontSize:13,padding:0,width:"100%",outline:"none"}} />
                          }
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
              <div style={{height:10}} />
            </div>

            {/* submit */}
            <div style={{padding:"10px",borderTop:"1px solid var(--border)",flexShrink:0}}>
              {rState==="idle" && (
                <button onClick={startRender}
                  style={{width:"100%",background:"#ff4500",color:"white",border:"none",borderRadius:"10px",fontFamily:"Syne,sans-serif",fontSize:14,fontWeight:800,padding:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7,transition:"background .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#e03d00"}
                  onMouseLeave={e=>e.currentTarget.style.background="#ff4500"}
                >Render video →</button>
              )}
              {rState==="rendering" && (
                <button disabled style={{width:"100%",background:"#ff4500",opacity:.5,color:"white",border:"none",borderRadius:"10px",fontFamily:"Syne,sans-serif",fontSize:14,fontWeight:800,padding:13,cursor:"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <div style={{width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin .75s linear infinite"}} />
                  Rendering…
                </button>
              )}
              {rState==="done" && (
                <div style={{display:"flex",gap:7}}>
                  <a href={outUrl} download target="_blank" rel="noreferrer" style={{flex:1,background:"#16a34a",border:"none",borderRadius:"10px",fontFamily:"Inter,sans-serif",fontSize:12,fontWeight:600,padding:11,cursor:"pointer",color:"white",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>↓ Download MP4</a>
                  <button onClick={reset} style={{flex:1,background:"transparent",border:"1px solid var(--border)",borderRadius:"10px",fontFamily:"Inter,sans-serif",fontSize:12,fontWeight:500,padding:11,cursor:"pointer",color:"var(--ink2)"}}>Render again</button>
                </div>
              )}
              {rState==="error" && (
                <div style={{display:"flex",gap:7}}>
                  <button onClick={startRender} style={{flex:2,background:"#dc2626",color:"white",border:"none",borderRadius:"10px",fontFamily:"Syne,sans-serif",fontSize:13,fontWeight:800,padding:12,cursor:"pointer"}}>Retry →</button>
                  <button onClick={reset} style={{flex:1,background:"transparent",border:"1px solid var(--border)",borderRadius:"10px",fontFamily:"Inter,sans-serif",fontSize:12,padding:12,cursor:"pointer",color:"var(--ink2)"}}>Reset</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      <div style={{position:"fixed",bottom:18,left:"50%",transform:`translateX(-50%) translateY(${toast?"0":"60px"})`,background:"var(--ink)",color:"white",borderRadius:100,padding:"9px 18px",fontSize:12,fontWeight:500,zIndex:9999,transition:"transform .25s cubic-bezier(.34,1.56,.64,1)",whiteSpace:"nowrap",pointerEvents:"none"}}>{toast}</div>
    </>
  );
}