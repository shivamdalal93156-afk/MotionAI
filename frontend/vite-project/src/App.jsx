import { useState, useEffect, useRef, useCallback } from "react";
import LandingPage from './LandingPage';


const API = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:3001"
  : "";
// Hardcode your future Cloudflare backend URL here
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
          try {
  const d = JSON.parse(xhr.responseText);
  resolve(d.filePath || d.path);  // absolute path for AE
}
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
      compName:            t.compName,
      fps:                 t.fps,
      duration:            t.duration,
      imageLayers: (t.imageFields || t.imageLayers || []).map(f => ({
  ...f,
  slotW:        f.slotW        || null,
  slotH:        f.slotH        || null,
  maskShape:    f.maskShape    || 'rectangle',
  cornerRadius: f.cornerRadius || 0,
})),
      textLayers:          (t.textFields          || t.textLayers          || []),
      countryLayers:       (t.countryLayers        || []),
      countryOptions:      (t.countryOptions       || []),
      countryCoordinates:  (t.countryCoordinates   || {}),
      expressionControls:  (t.expressionControls   || []),
      sceneMap:            t.sceneMap || {},
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
function getDisplayUrl(path) {
  if (!path) return '';
  if (typeof path === 'string' && path.includes('uploads/')) {
    // Strip the local C:/... prefix and use the Express static route
    return `${API}/uploads/${path.split('uploads/').pop()}`;
  }
  return path;
}
function buildSlots(config) {
  if (!config) return { slots: [], extraText: [] };
  const imgF     = config.imageLayers || [];
  const txtF     = config.textLayers  || [];
  const sceneMap = config.sceneMap    || {};
  const usedKeys = new Set();

  // Build a map: imageKey → [textKeys from same scene]
  const imgToTexts = {};
  for (const scene of Object.values(sceneMap)) {
    const keys    = scene.keys || [];
    const imgKeys = keys.filter(k => imgF.find(l => l.key === k));
    const txtKeys = keys.filter(k => txtF.find(l => l.key === k));
    for (const ik of imgKeys) {
      if (!imgToTexts[ik]) imgToTexts[ik] = [];
      for (const tk of txtKeys) {
        if (!imgToTexts[ik].includes(tk)) imgToTexts[ik].push(tk);
      }
    }
  }

  const slots = imgF.map(img => {
    const pairedTxtKeys = imgToTexts[img.key] || [];
    const texts = pairedTxtKeys
      .map(k => txtF.find(t => t.key === k))
      .filter(Boolean);
    texts.forEach(t => usedKeys.add(t.key));
    usedKeys.add(img.key);
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
// REPLACE the entire CropTool function in App.jsx with this.
// User gets both:
//   - Drag corners to resize the crop box (locked to slot ratio)
//   - Scroll wheel / pinch to zoom image inside the box
//   - Drag inside box (not on corner) to pan the image

// REPLACE the entire CropTool function in App.jsx with this.
// User gets both:
//   - Drag corners to resize the crop box (locked to slot ratio)
//   - Scroll wheel / pinch to zoom image inside the box
//   - Drag inside box (not on corner) to pan the image

function CropTool({ src, onDone, onCancel, slotW = 1920, slotH = 1080, maskShape = 'rectangle', cornerRadius = 0 }) {
  const canvasRef = useRef(null);
  const s = useRef({
    img: null,
    // Crop box
    box: null,          // { x, y, w, h } in canvas px
    lockedRatio: slotW / slotH,
    // Image pan/zoom (relative to box center)
    imgScale: 1,        // current zoom
    imgOffX: 0,         // offset from box center
    imgOffY: 0,
    minImgScale: 1,     // cover scale — image always fills box
    // Interaction state
    mode: null,         // null | 'pan' | 'resize'
    resizeHandle: null, // 'tl'|'tr'|'bl'|'br'
    dragStartX: 0,
    dragStartY: 0,
    boxAtDragStart: null,
    lastPinchDist: null,
  });
  const animRef = useRef(null);

  // ── Drawing ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { img, box, imgScale, imgOffX, imgOffY } = s.current;
    if (!img || !box) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw full image on canvas (always visible)
    const imgDrawW = img.naturalWidth  * imgScale;
    const imgDrawH = img.naturalHeight * imgScale;
    const cx = box.x + box.w / 2 + imgOffX;
    const cy = box.y + box.h / 2 + imgOffY;

    ctx.drawImage(img, cx - imgDrawW / 2, cy - imgDrawH / 2, imgDrawW, imgDrawH);

    // Dim outside box so crop area is clear
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    shapePath(ctx, box, maskShape, cornerRadius);
    ctx.fill('evenodd');
    ctx.restore();

    // Box border
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    shapePath(ctx, box, maskShape, cornerRadius);
    ctx.stroke();
    ctx.restore();

    // Rule-of-thirds grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    shapePath(ctx, box, maskShape, cornerRadius);
    ctx.clip();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(box.x + box.w * i / 3, box.y);
      ctx.lineTo(box.x + box.w * i / 3, box.y + box.h);
      ctx.moveTo(box.x, box.y + box.h * i / 3);
      ctx.lineTo(box.x + box.w, box.y + box.h * i / 3);
    }
    ctx.stroke();
    ctx.restore();

    // Corner resize handles
    ctx.save();
    ctx.setLineDash([]);
    getHandles(box).forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.restore();

    // Corner accent marks
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    const cs = 16;
    const { x, y, w, h } = box;
    [
      [[x,y+cs],[x,y],[x+cs,y]],
      [[x+w-cs,y],[x+w,y],[x+w,y+cs]],
      [[x,y+h-cs],[x,y+h],[x+cs,y+h]],
      [[x+w-cs,y+h],[x+w,y+h],[x+w,y+h-cs]],
    ].forEach(pts => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0],pts[0][1]);
      ctx.lineTo(pts[1][0],pts[1][1]);
      ctx.lineTo(pts[2][0],pts[2][1]);
      ctx.stroke();
    });
    ctx.restore();

    // Zoom % indicator
    ctx.save();
    const zoomPct = Math.round(imgScale / s.current.minImgScale * 100);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(box.x + 6, box.y + box.h - 26, 58, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText(zoomPct + '%  zoom', box.x + 10, box.y + box.h - 11);
    ctx.restore();

    // Hint text
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scroll to zoom · Drag image to pan · Drag corners to resize', W / 2, H - 12);
    ctx.restore();
  }, [maskShape, cornerRadius]);

  const schedDraw = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function shapePath(ctx, box, shape, cr) {
    const { x, y, w, h } = box;
    if (shape === 'circle') {
      ctx.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2);
    } else if (shape === 'rounded_rect') {
      const r = Math.min(cr, w/2, h/2);
      ctx.moveTo(x+r, y);
      ctx.arcTo(x+w,y, x+w,y+h, r);
      ctx.arcTo(x+w,y+h, x,y+h, r);
      ctx.arcTo(x,y+h, x,y, r);
      ctx.arcTo(x,y, x+w,y, r);
      ctx.closePath();
    } else if (shape === 'triangle') {
      ctx.moveTo(x+w/2, y); ctx.lineTo(x+w, y+h); ctx.lineTo(x, y+h); ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  function getHandles(box) {
    const { x, y, w, h } = box;
    return [
      { id: 'tl', x, y },
      { id: 'tr', x: x+w, y },
      { id: 'bl', x, y: y+h },
      { id: 'br', x: x+w, y: y+h },
    ];
  }

  function hitHandle(px, py, box) {
    for (const h of getHandles(box)) {
      if (Math.hypot(px - h.x, py - h.y) < 14) return h.id;
    }
    return null;
  }

  function insideBox(px, py, box) {
    return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
  }

  // Recalculate minImgScale whenever box changes
  function updateMinScale() {
    const { img, box } = s.current;
    if (!img || !box) return;
    s.current.minImgScale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
    // If current scale is below new minimum, bump it up
    if (s.current.imgScale < s.current.minImgScale) {
      s.current.imgScale = s.current.minImgScale;
    }
    clampImgOffset();
  }

  function clampImgOffset() {
    const { img, imgScale, box } = s.current;
    if (!img || !box) return;
    const imgDrawW = img.naturalWidth  * imgScale;
    const imgDrawH = img.naturalHeight * imgScale;
    const maxX = (imgDrawW - box.w) / 2;
    const maxY = (imgDrawH - box.h) / 2;
    s.current.imgOffX = Math.max(-maxX, Math.min(maxX, s.current.imgOffX));
    s.current.imgOffY = Math.max(-maxY, Math.min(maxY, s.current.imgOffY));
  }

  function applyZoom(newScale, pivotX, pivotY) {
    const max = s.current.minImgScale * 6;
    newScale = Math.max(s.current.minImgScale, Math.min(max, newScale));
    const ratio = newScale / s.current.imgScale;
    const { box } = s.current;
    const relX = (pivotX - (box.x + box.w/2)) - s.current.imgOffX;
    const relY = (pivotY - (box.y + box.h/2)) - s.current.imgOffY;
    s.current.imgOffX += relX - relX * ratio;
    s.current.imgOffY += relY - relY * ratio;
    s.current.imgScale = newScale;
    clampImgOffset();
    schedDraw();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new window.Image();
    img.onload = () => {
      s.current.img = img;
      const maxW = Math.min(window.innerWidth * 0.9, 920);
      const maxH = Math.min(window.innerHeight * 0.78, 660);
      canvas.width  = maxW;
      canvas.height = maxH;

      const ratio = slotW / slotH;
      let bw, bh;
      if (maxW * 0.78 / ratio <= maxH * 0.78) {
        bw = maxW * 0.78; bh = bw / ratio;
      } else {
        bh = maxH * 0.78; bw = bh * ratio;
      }
      s.current.box = {
        x: (maxW - bw) / 2,
        y: (maxH - bh) / 2,
        w: bw, h: bh,
      };
      s.current.lockedRatio = ratio;
      s.current.minImgScale = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
      s.current.imgScale    = s.current.minImgScale;
      s.current.imgOffX     = 0;
      s.current.imgOffY     = 0;
      schedDraw();
    };
    img.src = src;
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [src, slotW, slotH, schedDraw]);

  // ── Pointer events ─────────────────────────────────────────────────────────
  const getXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return [t.clientX - rect.left, t.clientY - rect.top];
  };

  const onDown = useCallback(e => {
    e.preventDefault();
    const [x, y] = getXY(e);
    const { box } = s.current;
    if (!box) return;

    const handle = hitHandle(x, y, box);
    if (handle) {
      s.current.mode = 'resize';
      s.current.resizeHandle = handle;
      s.current.dragStartX = x;
      s.current.dragStartY = y;
      s.current.boxAtDragStart = { ...box };
    } else if (insideBox(x, y, box)) {
      s.current.mode = 'pan';
      s.current.dragStartX = x;
      s.current.dragStartY = y;
    }
  }, []);

  const onMove = useCallback(e => {
    e.preventDefault();
    const [x, y] = getXY(e);
    const { mode, box, lockedRatio, boxAtDragStart, resizeHandle } = s.current;
    if (!mode || !box) return;

    if (mode === 'pan') {
      s.current.imgOffX += x - s.current.dragStartX;
      s.current.imgOffY += y - s.current.dragStartY;
      s.current.dragStartX = x;
      s.current.dragStartY = y;
      clampImgOffset();
      schedDraw();
      return;
    }

    if (mode === 'resize') {
      const dx = x - s.current.dragStartX;
      const sc = boxAtDragStart;
      const ratio = lockedRatio;
      const min = 80;
      let { x: bx, y: by, w: bw, h: bh } = sc;

      if (resizeHandle === 'br') {
        bw = Math.max(min, sc.w + dx); bh = bw / ratio;
      } else if (resizeHandle === 'bl') {
        bw = Math.max(min, sc.w - dx); bx = sc.x + sc.w - bw; bh = bw / ratio;
      } else if (resizeHandle === 'tr') {
        bw = Math.max(min, sc.w + dx); bh = bw / ratio; by = sc.y + sc.h - bh;
      } else if (resizeHandle === 'tl') {
        bw = Math.max(min, sc.w - dx); bx = sc.x + sc.w - bw; bh = bw / ratio; by = sc.y + sc.h - bh;
      }

      const W = canvasRef.current.width;
      const H = canvasRef.current.height;
      bx = Math.max(0, bx); by = Math.max(0, by);
      if (bx + bw > W) { bw = W - bx; bh = bw / ratio; }
      if (by + bh > H) { bh = H - by; bw = bh * ratio; }

      s.current.box = { x: bx, y: by, w: bw, h: bh };
      updateMinScale();
      schedDraw();
    }
  }, [schedDraw]);

  const onUp = useCallback(() => { s.current.mode = null; }, []);

  const onWheel = useCallback(e => {
    e.preventDefault();
    const [x, y] = getXY(e);
    applyZoom(s.current.imgScale * (e.deltaY < 0 ? 1.08 : 0.93), x, y);
  }, []);

  // Pinch zoom
  const onTouchStart = useCallback(e => {
    if (e.touches.length === 2) {
      s.current.lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      s.current.mode = null; // cancel any pan/resize
    } else {
      onDown(e);
    }
  }, [onDown]);

  const onTouchMove = useCallback(e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const rect = canvasRef.current.getBoundingClientRect();
      const px = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const py = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      if (s.current.lastPinchDist) {
        applyZoom(s.current.imgScale * (dist / s.current.lastPinchDist), px, py);
      }
      s.current.lastPinchDist = dist;
    } else {
      onMove(e);
    }
  }, [onMove]);

  const onTouchEnd = useCallback(e => {
    s.current.lastPinchDist = null;
    onUp();
  }, [onUp]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleDone = useCallback(() => {
    const canvas = canvasRef.current;
    const { img, imgScale, imgOffX, imgOffY, box } = s.current;
    if (!img || !box) return;

    // Map canvas box back to source image coordinates
    const canvasToSrc = 1 / imgScale;
    const imgDrawX = (box.x + box.w/2) + imgOffX - (img.naturalWidth  * imgScale) / 2;
    const imgDrawY = (box.y + box.h/2) + imgOffY - (img.naturalHeight * imgScale) / 2;

    // Box in source image px
    const srcX = (box.x - imgDrawX) * canvasToSrc;
    const srcY = (box.y - imgDrawY) * canvasToSrc;
    const srcW = box.w * canvasToSrc;
    const srcH = box.h * canvasToSrc;

    // Export at exact slotW x slotH
    const out = document.createElement('canvas');
    out.width  = slotW;
    out.height = slotH;
    const ctx = out.getContext('2d');
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, slotW, slotH);

    out.toBlob(blob => { if (blob) onDone(blob); }, 'image/jpeg', 0.93);
  }, [onDone, slotW, slotH]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
    }}>
      <div style={{ color: '#fff', fontSize: 13, opacity: 0.75 }}>
        {`Crop to ${slotW}×${slotH}`}
        {maskShape !== 'rectangle' ? ` (${maskShape})` : ''}
      </div>
      <canvas
        ref={canvasRef}
        style={{ cursor: 'crosshair', borderRadius: 8, touchAction: 'none', display: 'block' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{
          padding: '8px 22px', borderRadius: 7,
          border: '1.5px solid #555', background: 'transparent',
          color: '#ccc', cursor: 'pointer', fontSize: 13,
        }}>Cancel</button>
        <button onClick={handleDone} style={{
          padding: '8px 28px', borderRadius: 7, border: 'none',
          background: '#2563eb', color: '#fff',
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>Use this crop</button>
      </div>
    </div>
  );
}

// ─── PASTE THIS ENTIRE BLOCK to replace the existing ImgSlot function ────────

const VIDEO_EXTS = ['mp4','mov','avi','webm','mkv','m4v','wmv','flv'];

function isVideoFile(file) {
  if (!file) return false;
  if (typeof file === 'string') {
    // It's a path/url string — check extension
    const ext = file.split('?')[0].split('.').pop().toLowerCase();
    return VIDEO_EXTS.includes(ext);
  }
  if (file.type && file.type.startsWith('video/')) return true;
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return VIDEO_EXTS.includes(ext);
}

function VideoTrimSlider({ file, trimStart, onChange, templateDuration }) {
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);

  // Get video duration when file is set
  useEffect(() => {
    if (!file) return;
    const url = typeof file === 'string' ? file : URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      setDuration(v.duration);
      URL.revokeObjectURL(url);
    };
    v.src = url;
  }, [file]);

  if (!duration || duration <= templateDuration) return null;

  // Max start point — can't start so late that there's not enough video left
  const maxStart = Math.max(0, duration - templateDuration);
  const endPoint = Math.min(duration, trimStart + templateDuration);

  return (
    <div style={{
      padding: '8px 10px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, fontWeight: 600, color: 'var(--ink2)',
        marginBottom: 4,
      }}>
        <span>Video trim</span>
        <span style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>
          {trimStart.toFixed(1)}s → {endPoint.toFixed(1)}s
          <span style={{ color: 'var(--ink3)', marginLeft: 4 }}>
            (using {templateDuration.toFixed(1)}s of {duration.toFixed(1)}s)
          </span>
        </span>
      </div>

      {/* Timeline bar */}
      <div style={{ position: 'relative', height: 28, marginBottom: 4 }}>
        {/* Full bar */}
        <div style={{
          position: 'absolute', top: 10, left: 0, right: 0,
          height: 8, borderRadius: 4,
          background: 'var(--border)',
        }} />

        {/* Selected range */}
        <div style={{
          position: 'absolute', top: 10,
          left: `${(trimStart / duration) * 100}%`,
          width: `${(templateDuration / duration) * 100}%`,
          height: 8, borderRadius: 4,
          background: '#ff4500',
          pointerEvents: 'none',
        }} />

        {/* Range input */}
        <input
          type="range"
          min={0}
          max={maxStart}
          step={0.5}
          value={trimStart}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: 'var(--ink3)', fontFamily: 'monospace',
      }}>
        <span>0s</span>
        <span style={{ color: '#ff4500', fontWeight: 600 }}>
          ← drag to choose start point
        </span>
        <span>{duration.toFixed(1)}s</span>
      </div>
    </div>
  );
}


function ImgSlot({ slotId, imgField, textFields, data, onChange, uploadFn, footageBase, highlighted, videoRef ,templateDuration}) {
  const [preview,  setPreview]  = useState(null);
  const [cropping, setCropping] = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [prog,     setProg]     = useState(0);
  const [placeholderOk, setPlaceholderOk] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const rawFileRef = useRef(null);   // stores actual File object for VideoTrimSlider



  const placeholderSrc = imgField.layerName ? `${footageBase}/${imgField.layerName}` : null;

  useEffect(() => {
    if (!placeholderSrc) return;
    fetch(placeholderSrc, { method: "HEAD" })
      .then(r => { if (r.ok) setPlaceholderOk(true); })
      .catch(() => {});
  }, [placeholderSrc]);

  // ── File selected ──────────────────────────────────────────────────────────
  const onFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    rawFileRef.current = f;  


    if (isVideoFile(f)) {
      // VIDEO — skip crop, upload directly
      const objectUrl = URL.createObjectURL(f);
      setPreview(objectUrl);
      setBusy(true);
      setProg(0);
      uploadFn(f, setProg)
        .then(path => { onChange(imgField.key, path); })
        .catch(() => { setPreview(null); })
        .finally(() => { setBusy(false); });
    } else {
      // IMAGE — open crop tool
      setCropping(URL.createObjectURL(f));
    }
  };

  // ── Crop done (image only) ─────────────────────────────────────────────────
  const onCropDone = async (blob) => {
    const croppedFile = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
    const croppedUrl  = URL.createObjectURL(blob);
    setCropping(null);
    setPreview(croppedUrl);
    setBusy(true);
    setProg(0);
    try {
      onChange(imgField.key, await uploadFn(croppedFile, setProg));
    } catch {
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const clear = e => {
  e.stopPropagation();
  setPreview(null);
  setTrimStart(0);
  rawFileRef.current = null;  // ← ADD THIS LINE
  onChange(imgField.key, null);
  onChange('videoTrimStart', 0);  // ← ADD THIS LINE
};
 const onTrimChange = (val) => {
  setTrimStart(val);
  onChange('videoTrimStart', val);
};

  const finalPreview = preview || getDisplayUrl(data[imgField.key]);
  const finalIsVideo = finalPreview ? isVideoFile({ name: String(data[imgField.key] || finalPreview || '') }) : false;

  return (
    <>
      {cropping && (
        <CropTool
          src={cropping}
          onDone={onCropDone}
          onCancel={() => setCropping(null)}
          slotW={imgField.slotW || imgField.compW || imgField.w || 1920}
          slotH={imgField.slotH || imgField.compH || imgField.h || 1080}
          maskShape={imgField.maskShape || 'rectangle'}
          cornerRadius={imgField.cornerRadius || 0}
        />
      )}

      <div
        id={slotId}
        style={{
          border: highlighted ? "2px solid #ff4500" : "1.5px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          background: highlighted ? "#fff5f0" : "var(--white)",
          transition: "border-color .6s,background .6s",
          marginBottom: 8,
        }}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderBottom:"1px solid var(--border)", background: highlighted ? "#fff0e8" : "var(--bg)" }}>
          <div style={{ width:24, height:24, borderRadius:6, background:"#ff4500", color:"white", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            {keyN(imgField.key) || "?"}
          </div>
          <span style={{ fontSize:12, fontWeight:600, color:"var(--ink)", flex:1 }}>
            {clean(imgField.label || imgField.key)}
          </span>
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
              style={{ padding:"2px 7px", borderRadius:4, border:"1px solid var(--border)", background:"transparent", color:"var(--ink2)", fontSize:10, fontWeight:600, cursor:"pointer", flexShrink:0, fontFamily:"monospace" }}
              onMouseEnter={e => { e.currentTarget.style.background="#ff4500"; e.currentTarget.style.color="white"; e.currentTarget.style.borderColor="#ff4500"; }}
              onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="var(--ink2)"; e.currentTarget.style.borderColor="var(--border)"; }}
            >
              {Number(imgField.absIn).toFixed(1)}s
            </button>
          ) : null}
          {busy && <span style={{ fontSize:10, color:"#ff4500" }}>{prog}%</span>}
        </div>

        {/* Body */}
        <div style={{ display:"flex" }}>
          {/* Media area */}
          <div style={{ width:110, height:110, flexShrink:0, position:"relative", background:"#f0eeea", borderRight:"1px solid var(--border)", overflow:"hidden", cursor:"pointer" }}>

            {/* Placeholder */}
            {placeholderOk && !finalPreview && (
              <img src={placeholderSrc} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:.35 }} />
            )}

            {/* Preview — video or image */}
            {finalPreview && finalIsVideo && (
              <video
                src={finalPreview}
                muted autoPlay loop playsInline
                style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}
              />
            )}
            {finalPreview && !finalIsVideo && (
              <img src={finalPreview} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
            )}

            {/* Upload label */}
            <label
              style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer", transition:"background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.45)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize:20, color:"white", textShadow:"0 1px 4px rgba(0,0,0,.8)", pointerEvents:"none" }}>↑</span>
              <span style={{ fontSize:9, color:"white", fontWeight:600, textShadow:"0 1px 3px rgba(0,0,0,.8)", pointerEvents:"none" }}>
                {finalPreview ? "CHANGE" : "UPLOAD"}
              </span>
              <input
                type="file"
                accept="image/*,video/mp4,video/mov,video/quicktime,video/avi,video/webm,video/*"
                style={{ display:"none" }}
                onChange={onFile}
              />
            </label>
            {finalIsVideo && (
      <VideoTrimSlider
        file={rawFileRef.current}
        trimStart={trimStart}
        onChange={onTrimChange}
        templateDuration={templateDuration || 0}
      />
    )}

            {/* Clear button */}
            {finalPreview && (
              <button onClick={clear} style={{ position:"absolute", top:4, right:4, width:18, height:18, borderRadius:"50%", background:"rgba(0,0,0,.6)", border:"none", color:"white", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2 }}>×</button>
            )}

            {/* Upload progress bar */}
            {busy && (
              <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:"rgba(0,0,0,.2)" }}>
                <div style={{ height:"100%", width:`${prog}%`, background:"#ff4500", transition:"width .25s" }} />
              </div>
            )}
          </div>

          {/* Text fields */}
          <div style={{ flex:1, padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
            {textFields.length === 0 && (
              <div style={{ fontSize:11, color:"var(--ink3)", paddingTop:4 }}>
                {finalIsVideo ? 'Video slot' : 'Image only slot'}
              </div>
            )}
            {textFields.map((tf, i) => (
              <div key={i} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <label style={{ fontSize:10, fontWeight:600, color:"var(--ink2)" }}>{clean(tf.label || tf.key)}</label>
                {(tf.label || "").length > 80
                  ? <textarea
                      value={data[tf.key] || ""}
                      onChange={e => onChange(tf.key, e.target.value)}
                      placeholder="Enter text…"
                      style={{ border:"1px solid var(--border)", borderRadius:6, background:"var(--bg)", color:"var(--ink)", fontFamily:"Inter,sans-serif", fontSize:12, padding:"5px 8px", width:"100%", outline:"none", resize:"none", minHeight:48, lineHeight:1.4, transition:"border-color .12s" }}
                      onFocus={e => e.target.style.borderColor="#ff4500"}
                      onBlur={e => e.target.style.borderColor="var(--border)"}
                    />
                  : <input
                      type="text"
                      value={data[tf.key] || ""}
                      onChange={e => onChange(tf.key, e.target.value)}
                      placeholder="Enter name or text…"
                      style={{ border:"1px solid var(--border)", borderRadius:6, background:"var(--bg)", color:"var(--ink)", fontFamily:"Inter,sans-serif", fontSize:12, padding:"6px 8px", width:"100%", outline:"none", transition:"border-color .12s" }}
                      onFocus={e => e.target.style.borderColor="#ff4500"}
                      onBlur={e => e.target.style.borderColor="var(--border)"}
                    />
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
          const src = ik ? getDisplayUrl(data[ik]) : null;
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
  function VoiceSync({ templateConfig, inputData, onVoiceReady, onVoiceClear }) {
  const [status,   setStatus]   = useState("idle");   // idle|processing|done|error
  const [warnings, setWarnings] = useState([]);
  const [info,     setInfo]     = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);
  const fileRef = useRef(null);

  // Check if template is voice-syncable
  // Only for text-heavy templates (>4 text fields, ≤4 image fields)
  const textCount  = (templateConfig?.textLayers  || []).length;
  const imageCount = (templateConfig?.imageLayers || []).length;
  const isEligible = textCount >= 4 && imageCount <= 6;

  if (!isEligible) return null;

  const handleAudio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioSrc(URL.createObjectURL(file));
    setStatus("processing");
    setWarnings([]);
    setInfo(null);

    try {
      const fd = new FormData();
      fd.append("audio", file);
      fd.append("templateConfig", JSON.stringify({
        ...templateConfig,
        // Inject current user values into textLayers so voiceSync
        // knows what words the user typed
        textLayers: (templateConfig.textLayers || []).map(l => ({
          ...l,
          value: inputData[l.key] || l.layerName || "",
        })),
      }));

      const r = await fetch(`${API}/api/voice/process`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();

      if (!r.ok || !d.success) {
        setStatus("error");
        setInfo({ error: d.message || "Processing failed" });
        return;
      }

      setStatus("done");
      setWarnings(d.warnings || []);
      setInfo({
        language:      d.whisperLanguage,
        audioDuration: d.audioDuration,
        wordCount:     d.wordCount,
        scenes:        d.sceneResults,
      });

      // Pass result up to App
      onVoiceReady({
        adjustedTimings: d.adjustedTimings,
        audioPath:       d.audioPath,
        warnings:        d.warnings,
      });

    } catch (err) {
      setStatus("error");
      setInfo({ error: err.message });
    }
  };

  const clear = () => {
    setStatus("idle");
    setWarnings([]);
    setInfo(null);
    setAudioSrc(null);
    if (fileRef.current) fileRef.current.value = "";
    onVoiceClear();
  };

  return (
    <div style={{
      margin: "0 10px 0",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <div style={{
          width:22, height:22, borderRadius:6,
          background: status==="done" ? "#16a34a" : status==="error" ? "#dc2626" : status==="processing" ? "#ff4500" : "var(--bg2)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0,
        }}>
          {status==="done" ? "✓" : status==="processing" ? "…" : status==="error" ? "!" : "🎙"}
        </div>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--ink)", flex:1 }}>
          Voice Sync
        </span>
        <span style={{ fontSize:10, color:"var(--ink3)" }}>
          {textCount} text layers
        </span>
      </div>

      {/* Idle state — upload button */}
      {status === "idle" && (
        <label style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          padding:"9px 12px", borderRadius:8,
          border:"1.5px dashed var(--border)", background:"var(--bg)",
          cursor:"pointer", fontSize:12, color:"var(--ink2)",
          transition:"border-color .12s, background .12s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="#ff4500";e.currentTarget.style.background="#fff8f5";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--bg)";}}
        >
          <span style={{fontSize:16}}>🎙</span>
          Upload your voiceover audio
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" style={{display:"none"}} onChange={handleAudio} />
        </label>
      )}

      {/* Processing */}
      {status === "processing" && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fff8f5", border:"1px solid #ffd0b0" }}>
          <div style={{width:14,height:14,border:"2px solid rgba(255,69,0,.2)",borderTopColor:"#ff4500",borderRadius:"50%",animation:"spin .75s linear infinite",flexShrink:0}} />
          <span style={{fontSize:12,color:"#ff4500",fontWeight:500}}>Processing with Whisper…</span>
          <span style={{fontSize:11,color:"var(--ink3)"}}>This may take 30–90s</span>
        </div>
      )}

      {/* Done */}
      {status === "done" && info && (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 10px", borderRadius:8, background:"#f0fdf4", border:"1px solid #86efac" }}>
            <span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>✓ Voice synced</span>
            <span style={{fontSize:11,color:"var(--ink3)",marginLeft:"auto"}}>
              {info.wordCount} words · {info.audioDuration?.toFixed(1)}s · {info.language}
            </span>
            <button onClick={clear} style={{width:18,height:18,borderRadius:"50%",border:"1px solid #86efac",background:"transparent",cursor:"pointer",fontSize:10,color:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {/* Audio playback */}
          {audioSrc && (
            <audio src={audioSrc} controls style={{width:"100%",height:32,borderRadius:6}} />
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {warnings.map((w, i) => (
                <div key={i} style={{ padding:"6px 10px", borderRadius:6, background:"#fffbeb", border:"1px solid #fcd34d", fontSize:11, color:"#92400e" }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Scene breakdown */}
          {info.scenes && info.scenes.filter(s=>s.hasText!==false).length > 0 && (
            <div style={{ fontSize:10, color:"var(--ink3)", padding:"4px 2px" }}>
              {info.scenes.filter(s=>s.speedRatio).map((s,i) => (
                <span key={i} style={{ marginRight:8 }}>
                  {s.scene}: <span style={{color: s.outOfRange?"#dc2626":"#16a34a",fontWeight:600}}>{s.speedRatio}×</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status === "error" && info && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background:"#fef2f2", border:"1px solid #fca5a5" }}>
          <span style={{fontSize:12,color:"#dc2626"}}>✗ {info.error}</span>
          <button onClick={clear} style={{marginLeft:"auto",fontSize:11,color:"#dc2626",background:"transparent",border:"none",cursor:"pointer"}}>Try again</button>
        </div>
      )}
    </div>
  );
}
// ─── LogoOverlay component ────────────────────────────────────────────────────
// Add this component to App.jsx just before the export default function App()
// Then use it in the "done" render state section, below the download/render-again buttons


// ─── LogoSlot component ───────────────────────────────────────────────────────
function LogoSlot({ idx, data, onChange, onRemove, totalDuration }) {
  const dragRef    = useRef(null);
  const isDragging = useRef(false);
  const [preview, setPreview] = useState(null);

  const onFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPreview(url);
    onChange(idx, 'file', f);
    onChange(idx, 'preview', url);
  };

  const updatePos = e => {
    const rect = dragRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(100, ((e.clientX - rect.left)  / rect.width)  * 100));
    const ny = Math.max(0, Math.min(100, ((e.clientY - rect.top)   / rect.height) * 100));
    onChange(idx, 'x', Math.round(nx));
    onChange(idx, 'y', Math.round(ny));
  };

  const onMouseDown = e => { isDragging.current = true; updatePos(e); };
  const onMouseMove = e => { if (isDragging.current) updatePos(e); };
  const onMouseUp   = ()  => { isDragging.current = false; };

  const thumbSrc = data.preview || preview;
  const inputSt  = { border:'1px solid var(--border)', borderRadius:6, background:'var(--bg)', color:'var(--ink)', fontSize:12, padding:'5px 8px', outline:'none', fontFamily:'Inter,sans-serif', width:'100%' };
  const labelSt  = { fontSize:10, fontWeight:600, color:'var(--ink2)', marginBottom:3, display:'block' };

  return (
    <div style={{ border:'1.5px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--white)', marginBottom:10 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
        <div style={{ width:24, height:24, borderRadius:6, background:'#7c3aed', color:'white', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {idx + 1}
        </div>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)', flex:1 }}>Logo / Image {idx + 1}</span>
        {idx > 0 && (
          <button
            onClick={() => onRemove(idx)}
            style={{ width:20, height:20, borderRadius:'50%', border:'1px solid var(--border)', background:'transparent', color:'var(--ink3)', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}
          >×</button>
        )}
      </div>

      <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:10 }}>
        {/* Upload */}
        <label style={{
          display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
          borderRadius:8, border:'1.5px dashed var(--border)', background:'var(--bg)',
          cursor:'pointer', fontSize:12, color:'var(--ink2)', transition:'border-color .12s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor='#7c3aed'}
          onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
        >
          {thumbSrc
            ? <img src={thumbSrc} alt="" style={{ height:28, maxWidth:64, objectFit:'contain', borderRadius:3 }} />
            : <span style={{ fontSize:16 }}>+</span>
          }
          <span>{thumbSrc ? 'Change image' : 'Upload PNG / JPG'}</span>
          <input type="file" accept="image/png,image/jpeg" style={{ display:'none' }} onChange={onFile} />
        </label>

        {thumbSrc && (
          <>
            {/* Position drag box */}
            <div>
              <label style={labelSt}>Position — drag to place</label>
              <div
                ref={dragRef}
                style={{ width:'100%', height:80, borderRadius:8, background:'var(--bg)', border:'1px solid var(--border)', position:'relative', cursor:'crosshair', userSelect:'none', overflow:'hidden' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
              >
                {[33,66].map(p => <div key={`v${p}`} style={{ position:'absolute', left:`${p}%`, top:0, bottom:0, width:1, background:'rgba(0,0,0,.05)' }} />)}
                {[33,66].map(p => <div key={`h${p}`} style={{ position:'absolute', top:`${p}%`, left:0, right:0, height:1, background:'rgba(0,0,0,.05)' }} />)}
                <div style={{
                  position:'absolute', left:`${data.x || 5}%`, top:`${data.y || 5}%`,
                  transform:'translate(-50%,-50%)',
                  width:20, height:20, borderRadius:4,
                  background:'#7c3aed', border:'2px solid white',
                  boxShadow:'0 2px 6px rgba(0,0,0,.25)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9, color:'white', fontWeight:700, pointerEvents:'none',
                }}>L</div>
                <div style={{ position:'absolute', bottom:3, right:6, fontSize:9, color:'var(--ink3)' }}>
                  {data.x || 5}%, {data.y || 5}%
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <label style={labelSt}>Size — {data.scale || 15}% of video width</label>
              <input type="range" min={3} max={60} value={data.scale || 15}
                onChange={e => onChange(idx, 'scale', Number(e.target.value))}
                style={{ width:'100%', accentColor:'#7c3aed' }}
              />
            </div>

            {/* Time range */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div>
                <label style={labelSt}>Show from (sec)</label>
                <input type="number" min={0} step={0.5} value={data.startSec ?? 0}
                  onChange={e => onChange(idx, 'startSec', Number(e.target.value))}
                  style={inputSt}
                />
              </div>
              <div>
                <label style={labelSt}>Hide at (empty = always)</label>
                <input type="number" min={0} step={0.5} value={data.endSec ?? ''}
                  placeholder="Until end"
                  onChange={e => onChange(idx, 'endSec', e.target.value)}
                  style={inputSt}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── LogosTab component ───────────────────────────────────────────────────────
// Props:
//   logos        — array of logo slot data (state from App)
//   setLogos     — setter
//   rState       — render state from App
//   jobId        — jobId after render completes
//   API          — API base URL
function LogosTab({ logos, setLogos, rState, jobId, API }) {
  const [applying,   setApplying]   = useState(false);
  const [resultUrl,  setResultUrl]  = useState(null);
  const [error,      setError]      = useState(null);
  const [progress,   setProgress]   = useState('');

  const addSlot = () => {
    setLogos(prev => [...prev, { file: null, preview: null, x: 5, y: 5, scale: 15, startSec: 0, endSec: '' }]);
  };

  const removeSlot = idx => {
    setLogos(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSlot = (idx, key, val) => {
    setLogos(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));
  };

  const hasAnyLogo = logos.some(l => l.file);
  const renderDone = rState === 'done';

  const applyAll = async () => {
    if (!jobId || !hasAnyLogo) return;
    setApplying(true); setError(null); setResultUrl(null);

    try {
      // Apply logos one by one, chaining jobId each time
      // First call uses original jobId, subsequent calls use previous result
      let currentJobId = jobId;
      let currentUrl   = null;

      const activeLogos = logos.filter(l => l.file);

      for (let i = 0; i < activeLogos.length; i++) {
        const logo = activeLogos[i];
        setProgress(`Applying logo ${i + 1} of ${activeLogos.length}…`);

        const fd = new FormData();
        fd.append('logo',     logo.file);
        fd.append('jobId',    currentJobId);
        fd.append('x',        logo.x ?? 5);
        fd.append('y',        logo.y ?? 5);
        fd.append('scale',    logo.scale ?? 15);
        fd.append('startSec', logo.startSec ?? 0);
        fd.append('endSec',   logo.endSec === '' ? -1 : logo.endSec);

        const r = await fetch(`${API}/api/logo-overlay`, { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed');

        // For next iteration, use the output jobId (strip _logo suffix for chaining)
        // The route returns outputUrl like /outputs/JOBID_logo.mp4
        // We pass a special param to chain — backend handles JOBID_logo as input too
        currentJobId = d.outputJobId || currentJobId + '_logo';
        currentUrl   = `${API}${d.outputUrl}`;
      }

      setProgress('');
      setResultUrl(currentUrl);
    } catch (e) {
      setProgress('');
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'10px 10px 0', display:'flex', flexDirection:'column' }}>

      {/* Info banner */}
      <div style={{ fontSize:11, color:'var(--ink3)', background:'var(--bg)', borderRadius:8, padding:'8px 10px', marginBottom:10, lineHeight:1.5 }}>
        Add your logo or watermark. Each logo has its own position, size and timeline. Applied to your video after rendering.
      </div>

      {/* Logo slots */}
      {logos.map((logo, i) => (
        <LogoSlot key={i} idx={i} data={logo} onChange={updateSlot} onRemove={removeSlot} />
      ))}

      {/* Add logo button */}
      <button
        onClick={addSlot}
        style={{
          width:'100%', background:'transparent', border:'1.5px dashed var(--border)',
          borderRadius:10, fontSize:12, fontWeight:500, color:'var(--ink3)',
          padding:'10px 0', cursor:'pointer', transition:'all .12s', marginBottom:10,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='#7c3aed'; e.currentTarget.style.color='#7c3aed'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--ink3)'; }}
      >
        + Add another logo
      </button>

      <div style={{ flex:1 }} />

      {/* Apply section */}
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, paddingBottom:10 }}>
        {!renderDone && (
          <div style={{ fontSize:11, color:'var(--ink3)', textAlign:'center', padding:'8px 0' }}>
            Render your video first, then logos will be applied automatically.
          </div>
        )}

        {renderDone && !hasAnyLogo && (
          <div style={{ fontSize:11, color:'var(--ink3)', textAlign:'center', padding:'8px 0' }}>
            Upload at least one logo above to apply.
          </div>
        )}

        {renderDone && hasAnyLogo && !resultUrl && (
          <>
            {error && (
              <div style={{ fontSize:11, color:'#dc2626', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6, padding:'6px 10px', marginBottom:8 }}>
                ✗ {error}
              </div>
            )}
            <button
              onClick={applyAll}
              disabled={applying}
              style={{
                width:'100%', background: applying ? 'var(--bg2)' : '#7c3aed',
                color: applying ? 'var(--ink3)' : 'white',
                border:'none', borderRadius:10, fontSize:13, fontWeight:700,
                padding:'12px 0', cursor: applying ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                transition:'background .15s',
              }}
              onMouseEnter={e => { if (!applying) e.currentTarget.style.background='#6d28d9'; }}
              onMouseLeave={e => { if (!applying) e.currentTarget.style.background='#7c3aed'; }}
            >
              {applying
                ? <><div style={{ width:13, height:13, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin .75s linear infinite' }} />{progress || 'Applying…'}</>
                : `🖼 Apply ${logos.filter(l=>l.file).length} logo${logos.filter(l=>l.file).length>1?'s':''} to video`
              }
            </button>
          </>
        )}

        {resultUrl && (
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            <div style={{ fontSize:11, color:'#16a34a', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, padding:'6px 10px', fontWeight:600 }}>
              ✓ {logos.filter(l=>l.file).length} logo{logos.filter(l=>l.file).length>1?'s':''} applied successfully
            </div>
            <a href={resultUrl} download target="_blank" rel="noreferrer"
              style={{ width:'100%', background:'#16a34a', color:'white', border:'none', borderRadius:10, fontSize:13, fontWeight:600, padding:11, cursor:'pointer', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
            >↓ Download with logo</a>
            <button
              onClick={() => { setResultUrl(null); setError(null); }}
              style={{ width:'100%', background:'transparent', border:'1px solid var(--border)', borderRadius:10, fontSize:12, padding:10, cursor:'pointer', color:'var(--ink2)' }}
            >Change logo settings</button>
          </div>
        )}
      </div>
    </div>
  );
}
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
  const [voiceData,    setVoiceData]    = useState(null);  // result from /api/voice/process
  const [voiceStatus,  setVoiceStatus]  = useState("idle"); // idle|uploading|processing|done|error
  const [voiceWarnings,setVoiceWarnings]= useState([]);
  const [showLanding, setShowLanding] = useState(true);
  const [logos, setLogos] = useState([
  { file: null, preview: null, x: 5, y: 5, scale: 15, startSec: 0, endSec: '' }
]);


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
    fetch(`${API}/api/render/templates`, {
  headers: {
    "ngrok-skip-browser-warning": "true"
  },
    })
      .then(r => r.json())
      .then(d => setTemplates((Array.isArray(d)?d:d.templates||[]).map(norm).filter(t=>t.name)))
      .catch(() => {});
  }, []);

  // poll job
  useEffect(() => {
    if (!jobId || rState==="done" || rState==="error") return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/jobs/${jobId}`, {
  headers: {
    "ngrok-skip-browser-warning": "true"
  },
        });
        const d = await r.json();
        setJobSt(d);
        if (d.status==="done") {
  clearInterval(iv);
  const url = d.outputUrl
    ? `${API}${d.outputUrl}`
    : `${API}/outputs/${jobId}.mp4`;
  
  // Auto-apply logos if any uploaded
  const activeLogos = logos.filter(l => l.file);
  if (activeLogos.length > 0) {
    setRState("applying_logos");
    toast2("Applying logos…");
    let currentJobId = d.jobId || jobId;
    let finalUrl = url;
    try {
      for (let i = 0; i < activeLogos.length; i++) {
        const logo = activeLogos[i];
        const fd = new FormData();
        fd.append('logo',     logo.file);
        fd.append('jobId',    currentJobId);
        fd.append('x',        logo.x ?? 5);
        fd.append('y',        logo.y ?? 5);
        fd.append('scale',    logo.scale ?? 15);
        fd.append('startSec', logo.startSec ?? 0);
        fd.append('endSec',   logo.endSec === '' ? -1 : logo.endSec);
        const r = await fetch(`${API}/api/logo-overlay`, { method:'POST', body:fd });
        const ld = await r.json();
        if (!r.ok || !ld.success) throw new Error(ld.error || 'Logo failed');
        currentJobId = ld.outputJobId || currentJobId + '_logo';
        finalUrl = `${API}${ld.outputUrl}`;
      }
      setOutUrl(finalUrl);
      setRState("done");
      toast2("✓ Video ready with logo — download below");
    } catch(e) {
      // Logo failed — still give original video
      setOutUrl(url);
      setRState("done");
      toast2("✓ Video ready (logo apply failed)");
    }
  } else {
    setRState("done");
    setOutUrl(url);
    toast2("✓ Video ready — download below");
  }

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
  function VoiceSync({ templateConfig, inputData, onVoiceReady, onVoiceClear }) {
  const [status,   setStatus]   = useState("idle");   // idle|processing|done|error
  const [warnings, setWarnings] = useState([]);
  const [info,     setInfo]     = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);
  const fileRef = useRef(null);

  // Check if template is voice-syncable
  // Only for text-heavy templates (>4 text fields, ≤4 image fields)
  const textCount  = (templateConfig?.textLayers  || []).length;
  const imageCount = (templateConfig?.imageLayers || []).length;
  const isEligible = textCount >= 4 && imageCount <= 6;

  if (!isEligible) return null;

  const handleAudio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioSrc(URL.createObjectURL(file));
    setStatus("processing");
    setWarnings([]);
    setInfo(null);

    try {
      const fd = new FormData();
      fd.append("audio", file);
      fd.append("templateConfig", JSON.stringify({
        ...templateConfig,
        // Inject current user values into textLayers so voiceSync
        // knows what words the user typed
        textLayers: (templateConfig.textLayers || []).map(l => ({
          ...l,
          value: inputData[l.key] || l.layerName || "",
        })),
      }));

      const r = await fetch(`${API}/api/voice/process`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();

      if (!r.ok || !d.success) {
        setStatus("error");
        setInfo({ error: d.message || "Processing failed" });
        return;
      }

      setStatus("done");
      setWarnings(d.warnings || []);
      setInfo({
        language:      d.whisperLanguage,
        audioDuration: d.audioDuration,
        wordCount:     d.wordCount,
        scenes:        d.sceneResults,
      });

      // Pass result up to App
      onVoiceReady({
        adjustedTimings: d.adjustedTimings,
        audioPath:       d.audioPath,
        warnings:        d.warnings,
      });

    } catch (err) {
      setStatus("error");
      setInfo({ error: err.message });
    }
  };

  const clear = () => {
    setStatus("idle");
    setWarnings([]);
    setInfo(null);
    setAudioSrc(null);
    if (fileRef.current) fileRef.current.value = "";
    onVoiceClear();
  };

  return (
    <div style={{
      margin: "0 10px 0",
      borderTop: "1px solid var(--border)",
      paddingTop: 10,
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <div style={{
          width:22, height:22, borderRadius:6,
          background: status==="done" ? "#16a34a" : status==="error" ? "#dc2626" : status==="processing" ? "#ff4500" : "var(--bg2)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0,
        }}>
          {status==="done" ? "✓" : status==="processing" ? "…" : status==="error" ? "!" : "🎙"}
        </div>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--ink)", flex:1 }}>
          Voice Sync
        </span>
        <span style={{ fontSize:10, color:"var(--ink3)" }}>
          {textCount} text layers
        </span>
      </div>

      {/* Idle state — upload button */}
      {status === "idle" && (
        <label style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          padding:"9px 12px", borderRadius:8,
          border:"1.5px dashed var(--border)", background:"var(--bg)",
          cursor:"pointer", fontSize:12, color:"var(--ink2)",
          transition:"border-color .12s, background .12s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="#ff4500";e.currentTarget.style.background="#fff8f5";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--bg)";}}
        >
          <span style={{fontSize:16}}>🎙</span>
          Upload your voiceover audio
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" style={{display:"none"}} onChange={handleAudio} />
        </label>
      )}

      {/* Processing */}
      {status === "processing" && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"#fff8f5", border:"1px solid #ffd0b0" }}>
          <div style={{width:14,height:14,border:"2px solid rgba(255,69,0,.2)",borderTopColor:"#ff4500",borderRadius:"50%",animation:"spin .75s linear infinite",flexShrink:0}} />
          <span style={{fontSize:12,color:"#ff4500",fontWeight:500}}>Processing with Whisper…</span>
          <span style={{fontSize:11,color:"var(--ink3)"}}>This may take 30–90s</span>
        </div>
      )}

      {/* Done */}
      {status === "done" && info && (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 10px", borderRadius:8, background:"#f0fdf4", border:"1px solid #86efac" }}>
            <span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>✓ Voice synced</span>
            <span style={{fontSize:11,color:"var(--ink3)",marginLeft:"auto"}}>
              {info.wordCount} words · {info.audioDuration?.toFixed(1)}s · {info.language}
            </span>
            <button onClick={clear} style={{width:18,height:18,borderRadius:"50%",border:"1px solid #86efac",background:"transparent",cursor:"pointer",fontSize:10,color:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {/* Audio playback */}
          {audioSrc && (
            <audio src={audioSrc} controls style={{width:"100%",height:32,borderRadius:6}} />
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {warnings.map((w, i) => (
                <div key={i} style={{ padding:"6px 10px", borderRadius:6, background:"#fffbeb", border:"1px solid #fcd34d", fontSize:11, color:"#92400e" }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Scene breakdown */}
          {info.scenes && info.scenes.filter(s=>s.hasText!==false).length > 0 && (
            <div style={{ fontSize:10, color:"var(--ink3)", padding:"4px 2px" }}>
              {info.scenes.filter(s=>s.speedRatio).map((s,i) => (
                <span key={i} style={{ marginRight:8 }}>
                  {s.scene}: <span style={{color: s.outOfRange?"#dc2626":"#16a34a",fontWeight:600}}>{s.speedRatio}×</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status === "error" && info && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background:"#fef2f2", border:"1px solid #fca5a5" }}>
          <span style={{fontSize:12,color:"#dc2626"}}>✗ {info.error}</span>
          <button onClick={clear} style={{marginLeft:"auto",fontSize:11,color:"#dc2626",background:"transparent",border:"none",cursor:"pointer"}}>Try again</button>
        </div>
      )}
    </div>
  );
}
  const startRender = async () => {
    if (!sel) return;
    setRState("rendering"); setOutUrl(null); setJobId(null); setJobSt(null);
    try {
      const merged    = Object.assign({}, ...chunks);
      const inputData = {};
      Object.entries(merged).forEach(([k,v]) => { if (v!==null&&v!==undefined&&v!=="") inputData[k]=v; });
      const r = await fetch(`${API}/api/render/start`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ template:sel.name, inputData ,voiceData: voiceData}),
      });
      const d = await r.json();
      if (!r.ok) { setRState("error"); toast2(d.message||d.error||"Error"); return; }
      if (d.jobId) { setJobId(d.jobId); toast2("Rendering started…"); }
      else { setRState("error"); toast2("Could not start render"); }
    } catch { setRState("error"); toast2("Network error — is backend running?"); }
  };

  const reset = () => { setChunks([{}]); setChunk(0); setRState("idle"); setJobId(null); setOutUrl(null); setJobSt(null); setHighlightedKeys(new Set()); };
  const open  = t => { setSel(t); reset(); setTab("photos"); setLogos([{ file: null, preview: null, x: 5, y: 5, scale: 15, startSec: 0, endSec: '' }]); };
  const back  = () => { setSel(null); reset(); };

  const inEditor  = !!sel;
  if (showLanding) return <LandingPage onEnter={() => setShowLanding(false)} />;
  const statusTxt = rState==="rendering"?(jobSt?.stage||"Rendering…"):rState==="done"?"Done":rState==="error"?"Error":"Ready";

  return (
    <>
      <style>{CSS}</style>

      {/* Topbar — REPLACE the entire topbar div in App.jsx with this */}
      <div style={{height:52,display:"flex",alignItems:"center",padding:"0 18px",gap:10,background:"var(--white)",borderBottom:"1px solid var(--border)",position:"fixed",top:0,left:0,right:0,zIndex:50}}>
        
        {/* Logo — always clickable to go back to landing */}
        <div
          onClick={() => setShowLanding(true)}
          style={{fontFamily:"'Bebas Neue',sans-serif",fontWeight:400,fontSize:20,letterSpacing:".1em",cursor:"pointer",flexShrink:0}}
        >Aootra</div>

        <div style={{width:1,height:18,background:"var(--border)",flexShrink:0}} />

        {/* Back button — shows in BOTH template picker and editor */}
        {!inEditor && (
          <div
            onClick={() => setShowLanding(true)}
            style={{width:32,height:32,borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--ink)";e.currentTarget.style.borderColor="var(--ink)";e.currentTarget.querySelector('span').style.color="white";}}
            onMouseLeave={e=>{e.currentTarget.style.background="var(--bg)";e.currentTarget.style.borderColor="var(--border)";e.currentTarget.querySelector('span').style.color="var(--ink2)";}}
          >
            <span style={{fontSize:16,color:"var(--ink2)",lineHeight:1}}>←</span>
          </div>
        )}

        {inEditor && (
          <div
            onClick={back}
            style={{width:32,height:32,borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--ink)";e.currentTarget.style.borderColor="var(--ink)";e.currentTarget.querySelector('span').style.color="white";}}
            onMouseLeave={e=>{e.currentTarget.style.background="var(--bg)";e.currentTarget.style.borderColor="var(--border)";e.currentTarget.querySelector('span').style.color="var(--ink2)";}}
          >
            <span style={{fontSize:16,color:"var(--ink2)",lineHeight:1}}>←</span>
          </div>
        )}

        {/* Breadcrumb */}
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

        {/* Status dot */}
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
              {rState==="rendering" && (() => {
  const st = jobSt?.status || "pending";
  const ev = jobSt?.lastEvent || "";

  // Map stage to percent + label
  let pct   = 5;
  let label = "Queued — waiting to start…";
  let sub   = "";

  if (st === "lock" || ev) {
    if (ev === "JSX_GENERATED" || ev === "AE_LAUNCH") {
  pct = 15; label = "Preparing your template…"; sub = "Setting up your content";
} else if (ev === "AE_HEARTBEAT") {
  pct = 28; label = "Applying your changes…"; sub = "Text and images are being placed";
} else if (ev === "AE_COMPLETE") {
  pct = 40; label = "Template ready…"; sub = "Starting video render";
} else if (ev === "AERENDER_LAUNCH") {
  pct = 45; label = "Rendering your video…"; sub = "This is the longest step, please wait";
} else if (ev === "AERENDER_PROGRESS") {
  const frame = jobSt?.lastFrame || 0;
  const total = jobSt?.totalFrames || 0;
  pct = total > 0 ? Math.round(45 + (frame / total) * 40) : 62;
  label = total > 0 ? `Rendering frame ${frame} of ${total}` : "Rendering your video…";
  sub = total > 0 ? `${Math.round((frame/total)*100)}% of frames complete` : "Please wait…";
} else if (ev === "AERENDER_COMPLETE") {
  pct = 86; label = "Video rendered…"; sub = "Packaging your file";
} else if (ev === "FFMPEG_LAUNCH" || ev === "FFMPEG_PROGRESS") {
  pct = 92; label = "Packaging your video…"; sub = "Almost ready";
} else if (ev === "FFMPEG_COMPLETE") {
  pct = 98; label = "Almost done…"; sub = "Your video is being saved";

    } else if (ev === "STAGE") {
      const stageStr = jobSt?.stageName || "";
      if (stageStr.includes("1/3")) { pct = 20; label = "Injecting content into template…"; sub = "Stage 1 of 3"; }
      else if (stageStr.includes("2/3")) { pct = 50; label = "Rendering video frames…"; sub = "Stage 2 of 3 — takes longest"; }
      else if (stageStr.includes("3/3")) { pct = 88; label = "Compressing to MP4…"; sub = "Stage 3 of 3"; }
    } else {
      pct = 25; label = "Processing…"; sub = "After Effects is running";
    }
  }
  

  return (
    <div style={{
      position:"absolute",inset:0,
      background:"rgba(0,0,0,.88)",
      display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      gap:16,color:"white",zIndex:10,
      padding:"0 40px",
    }}>
      {/* Spinner */}
      <div style={{
        width:32,height:32,
        border:"2.5px solid rgba(255,255,255,.08)",
        borderTopColor:"#ff4500",
        borderRadius:"50%",
        animation:"spin .8s linear infinite",
        flexShrink:0,
      }} />

      {/* Label */}
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:600,color:"white",marginBottom:4}}>
          {label}
        </div>
        {sub && (
          <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>
            {sub}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{width:"100%",maxWidth:280}}>
        <div style={{
          width:"100%",height:3,
          background:"rgba(255,255,255,.08)",
          borderRadius:2,overflow:"hidden",
        }}>
          <div style={{
            height:"100%",
            background:"#ff4500",
            borderRadius:2,
            width:`${pct}%`,
            transition:"width .6s ease",
          }} />
        </div>
        <div style={{
          display:"flex",justifyContent:"space-between",
          marginTop:6,fontSize:10,
          color:"rgba(255,255,255,.25)",
        }}>
          <span>0%</span>
          <span style={{color:"rgba(255,255,255,.45)",fontWeight:600}}>{pct}%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
})()}
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
              {[{id:"photos",label:`Photos (${slots.length})`},{id:"text",label:`Text (${extraText.length})`},{id:"logos",label:"Logos"}].map(({id,label})=>(
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
                      templateDuration={sel?.config?.duration || 0}
                      highlighted={highlightedKeys.has(slot.img.key) || slot.texts.some(t=>highlightedKeys.has(t.key))}
                    />
                  ))}{/* Country selectors */}
{(config?.countryLayers || []).map((cl, i) => (
  <div key={i} style={{
    border: "1.5px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
    background: "var(--white)",
    marginBottom: 8,
  }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6,
        background: "#3b82f6", color: "white",
        fontSize: 10, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>🌍</div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>
        {cl.label}
      </span>
    </div>
    <div style={{ padding: "10px 12px" }}>
      <select
        value={data[cl.key] || cl.default || ""}
        onChange={e => setF(cl.key, e.target.value)}
        style={{
          width: "100%",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg)",
          color: "var(--ink)",
          fontFamily: "inherit",
          fontSize: 13,
          padding: "7px 10px",
          outline: "none",
          cursor: "pointer",
        }}
      >
        <option value="">— Select country —</option>
        {(config?.countryOptions || []).map((country, ci) => (
          <option key={ci} value={country}>{country}</option>
        ))}
      </select>
    </div>
  </div>
))}
{/* Expression Controls — color pickers, checkboxes, sliders */}
{(config?.expressionControls || []).map((ec, i) => (
  <div key={i} style={{
    border: "1.5px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--white)",
    marginBottom: 8,
  }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px",
      background: "var(--bg)",
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 5,
        background: ec.type === 'color' ? (data[ec.key] || ec.default || '#888') :
                    ec.type === 'checkbox' ? '#6366f1' : '#64748b',
        flexShrink: 0,
        border: "1px solid var(--border)",
      }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>
        {ec.label}
      </span>

      {/* Color picker */}
      {(ec.type === 'color' || ec.type === 'solid_color') && (
        <input
          type="color"
          value={data[ec.key] || ec.default || '#ffffff'}
          onChange={e => setF(ec.key, e.target.value)}
          style={{
            width: 32, height: 24, borderRadius: 4,
            border: "1px solid var(--border)",
            cursor: "pointer", padding: 1,
            background: "transparent",
          }}
        />
      )}

      {/* Checkbox toggle */}
      {ec.type === 'checkbox' && (
        <div
          onClick={() => setF(ec.key, !(data[ec.key] !== undefined ? data[ec.key] : ec.default))}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: (data[ec.key] !== undefined ? data[ec.key] : ec.default) ? '#16a34a' : 'var(--border)',
            cursor: 'pointer', position: 'relative', transition: 'background .15s', flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2,
            left: (data[ec.key] !== undefined ? data[ec.key] : ec.default) ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'white', transition: 'left .15s',
          }} />
        </div>
      )}

      {/* Slider */}
      {ec.type === 'slider' && (
        <input
          type="number"
          value={data[ec.key] !== undefined ? data[ec.key] : (ec.default || 0)}
          onChange={e => setF(ec.key, parseFloat(e.target.value))}
          style={{
            width: 64, border: "1px solid var(--border)",
            borderRadius: 5, background: "var(--bg)",
            color: "var(--ink)", fontSize: 12,
            padding: "3px 6px", outline: "none", textAlign: "center",
          }}
        />
      )}
    </div>
  </div>
))}
                </>
              )}
              {tab==="logos" && (
  <LogosTab
    logos={logos}
    setLogos={setLogos}
    rState={rState}
    jobId={jobId}
    API={API}
  />
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
            <VoiceSync
      templateConfig={config}
      inputData={data}
      onVoiceReady={result => {
        setVoiceData(result);
        setVoiceWarnings(result.warnings || []);
      }}
      onVoiceClear={() => {
        setVoiceData(null);
        setVoiceWarnings([]);
      }}
    />

            {/* submit */}
            <div style={{padding:"10px",borderTop:"1px solid var(--border)",flexShrink:0}}>
              {voiceWarnings.length > 0 && (
  <div
    style={{
      fontSize:11,
      color:"#92400e",
      background:"#fffbeb",
      border:"1px solid #fcd34d",
      borderRadius:6,
      padding:"6px 10px",
      marginBottom:6
    }}
  >
    ⚠ Voice sync: some scenes adjusted beyond ideal range.
    Render will still proceed.
  </div>
)}
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
              {rState==="applying_logos" && (
  <button disabled style={{width:"100%",background:"#7c3aed",opacity:.8,color:"white",border:"none",borderRadius:"10px",fontFamily:"Syne,sans-serif",fontSize:14,fontWeight:800,padding:13,cursor:"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
    <div style={{width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin .75s linear infinite"}} />
    Applying logos…
  </button>
)}
              {/* ADD THIS LINE after the done buttons div */}
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