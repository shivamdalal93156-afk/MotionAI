// ─────────────────────────────────────────────────────────────────────────────
// REPLACE the entire CropTool function in App.jsx with this.
// Also update where CropTool is called inside ImgSlot (shown at bottom).
// ─────────────────────────────────────────────────────────────────────────────

function CropTool({ src, onDone, onCancel, slotW = 1, slotH = 1, maskShape = 'rectangle', cornerRadius = 0 }) {
  const canvasRef = useRef(null);
  const s = useRef({
    img: null, crop: null,
    dragging: false, resizing: false,
    dragStartX: 0, dragStartY: 0,
    resizeStartX: 0, resizeStartY: 0,
    resizeStartCrop: null,
    lockedRatio: slotW / slotH,
  });
  const animRef = useRef(null);

  // Draw everything on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { img, crop } = s.current;
    if (!img || !crop) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw image
    ctx.drawImage(img, 0, 0, W, H);

    // Dim everything outside crop
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';

    // Build the mask shape clip path INVERTED (fill outside = dim outside)
    ctx.beginPath();
    ctx.rect(0, 0, W, H); // full canvas
    buildShapePath(ctx, crop, maskShape, cornerRadius, W / img.naturalWidth);
    ctx.evenOddFill = true; // alternate fill rule cuts out the shape
    ctx.fill('evenodd');
    ctx.restore();

    // Draw the shape border
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    buildShapePath(ctx, crop, maskShape, cornerRadius, W / img.naturalWidth);
    ctx.stroke();
    ctx.restore();

    // Draw resize handles at corners (always rectangular handle positions)
    const handles = getHandles(crop);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    handles.forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }, [maskShape, cornerRadius]);

  // Build the shape path on the canvas context
  function buildShapePath(ctx, crop, shape, cr, scale) {
    const { x, y, w, h } = crop;
    const scaledCr = cr * scale;

    if (shape === 'circle') {
      const cx = x + w / 2, cy = y + h / 2;
      const rx = w / 2, ry = h / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    } else if (shape === 'rounded_rect') {
      const r = Math.min(scaledCr, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y,     x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x,     y + h, r);
      ctx.arcTo(x,     y + h, x,     y,     r);
      ctx.arcTo(x,     y,     x + w, y,     r);
      ctx.closePath();

    } else if (shape === 'triangle') {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();

    } else {
      // Default: rectangle
      ctx.rect(x, y, w, h);
    }
  }

  function getHandles(crop) {
    if (!crop) return [];
    const { x, y, w, h } = crop;
    return [
      { id: 'tl', x: x,     y: y     },
      { id: 'tr', x: x + w, y: y     },
      { id: 'bl', x: x,     y: y + h },
      { id: 'br', x: x + w, y: y + h },
    ];
  }

  function hitHandle(px, py, crop) {
    const handles = getHandles(crop);
    for (const h of handles) {
      if (Math.abs(px - h.x) < 10 && Math.abs(py - h.y) < 10) return h.id;
    }
    return null;
  }

  function insideCrop(px, py, crop) {
    return px >= crop.x && px <= crop.x + crop.w &&
           py >= crop.y && py <= crop.y + crop.h;
  }

  const schedDraw = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Initialize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new window.Image();
    img.onload = () => {
      s.current.img = img;

      // Size canvas to fit viewport
      const maxW = Math.min(window.innerWidth * 0.88, 800);
      const maxH = Math.min(window.innerHeight * 0.72, 600);
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      // Initial crop box: locked to exact slot ratio, 80% of canvas
      const ratio = slotW / slotH;
      let cw, ch;
      if (canvas.width * 0.8 / ratio <= canvas.height * 0.8) {
        cw = canvas.width * 0.8;
        ch = cw / ratio;
      } else {
        ch = canvas.height * 0.8;
        cw = ch * ratio;
      }
      // Center crop box
      const cx = (canvas.width  - cw) / 2;
      const cy = (canvas.height - ch) / 2;
      s.current.crop = { x: cx, y: cy, w: cw, h: ch };
      s.current.lockedRatio = ratio;
      schedDraw();
    };
    img.src = src;
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [src, slotW, slotH, schedDraw]);

  const getXY = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  };

  const onDown = useCallback(e => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const [x, y] = getXY(e, canvas);
    const { crop } = s.current;
    if (!crop) return;

    const handle = hitHandle(x, y, crop);
    if (handle) {
      s.current.resizing = handle;
      s.current.resizeStartX = x;
      s.current.resizeStartY = y;
      s.current.resizeStartCrop = { ...crop };
    } else if (insideCrop(x, y, crop)) {
      s.current.dragging = true;
      s.current.dragStartX = x - crop.x;
      s.current.dragStartY = y - crop.y;
    }
  }, []);

  const onMove = useCallback(e => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const [x, y] = getXY(e, canvas);
    const W = canvas.width, H = canvas.height;
    const { crop, dragging, resizing, resizeStartCrop, lockedRatio } = s.current;
    if (!crop) return;

    if (dragging) {
      let nx = x - s.current.dragStartX;
      let ny = y - s.current.dragStartY;
      nx = Math.max(0, Math.min(W - crop.w, nx));
      ny = Math.max(0, Math.min(H - crop.h, ny));
      s.current.crop = { ...crop, x: nx, y: ny };
      schedDraw();
      return;
    }

    if (resizing) {
      const dx = x - s.current.resizeStartX;
      const sc = resizeStartCrop;
      const ratio = lockedRatio;
      const min = 40;
      let { x: cx, y: cy, w: cw, h: ch } = sc;

      // All resize driven by horizontal delta, height follows ratio lock
      if (resizing === 'br') {
        cw = Math.max(min, sc.w + dx);
        ch = cw / ratio;
      } else if (resizing === 'bl') {
        cw = Math.max(min, sc.w - dx);
        cx = sc.x + sc.w - cw;
        ch = cw / ratio;
      } else if (resizing === 'tr') {
        cw = Math.max(min, sc.w + dx);
        ch = cw / ratio;
        cy = sc.y + sc.h - ch;
      } else if (resizing === 'tl') {
        cw = Math.max(min, sc.w - dx);
        cx = sc.x + sc.w - cw;
        ch = cw / ratio;
        cy = sc.y + sc.h - ch;
      }

      // Boundary clamp
      cx = Math.max(0, cx);
      cy = Math.max(0, cy);
      if (cx + cw > W) { cw = W - cx; ch = cw / ratio; }
      if (cy + ch > H) { ch = H - cy; cw = ch * ratio; cx = Math.max(0, cx); }

      s.current.crop = { x: cx, y: cy, w: cw, h: ch };
      schedDraw();
    }
  }, [schedDraw]);

  const onUp = useCallback(() => {
    s.current.dragging  = false;
    s.current.resizing  = false;
  }, []);

  // Export crop as blob at EXACT slot dimensions
  const handleDone = useCallback(() => {
    const canvas = canvasRef.current;
    const { img, crop } = s.current;
    if (!img || !crop) return;

    // Scale crop coords back to original image pixels
    const scaleX = img.naturalWidth  / canvas.width;
    const scaleY = img.naturalHeight / canvas.height;
    const srcX = crop.x * scaleX;
    const srcY = crop.y * scaleY;
    const srcW = crop.w * scaleX;
    const srcH = crop.h * scaleY;

    // Output canvas at EXACT slot dimensions
    const out = document.createElement('canvas');
    out.width  = slotW;
    out.height = slotH;
    const ctx = out.getContext('2d');
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, slotW, slotH);

    out.toBlob(blob => {
      if (blob) onDone(blob);
    }, 'image/jpeg', 0.93);
  }, [onDone, slotW, slotH]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{ color: '#fff', fontSize: 13, opacity: 0.8 }}>
        {maskShape !== 'rectangle'
          ? `Crop to ${maskShape} — drag to reposition, corners to resize`
          : `Crop to ${slotW}×${slotH} — drag to reposition, corners to resize`}
      </div>
      <canvas
        ref={canvasRef}
        style={{ cursor: 'crosshair', borderRadius: 6, touchAction: 'none' }}
        onMouseDown={onDown}  onMouseMove={onMove}  onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove}  onTouchEnd={onUp}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{
          padding: '8px 22px', borderRadius: 7, border: '1.5px solid #555',
          background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 13,
        }}>Cancel</button>
        <button onClick={handleDone} style={{
          padding: '8px 28px', borderRadius: 7, border: 'none',
          background: '#2563eb', color: '#fff', cursor: 'pointer',
          fontSize: 13, fontWeight: 600,
        }}>Use this crop</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// In ImgSlot, update where CropTool is called.
// Find the existing <CropTool ... /> line and replace with:
// ─────────────────────────────────────────────────────────────────────────────

/*
  <CropTool
    src={cropping}
    onDone={onCropDone}
    onCancel={() => setCropping(null)}
    slotW={imgField.slotW || imgField.compW || 1}
    slotH={imgField.slotH || imgField.compH || 1}
    maskShape={imgField.maskShape || 'rectangle'}
    cornerRadius={imgField.cornerRadius || 0}
  />
*/

// ─────────────────────────────────────────────────────────────────────────────
// In backend/routes/render.js, add slotW/slotH/maskShape to imageFields map:
// ─────────────────────────────────────────────────────────────────────────────

/*
  imageFields: (config.imageLayers || []).map(l => ({
    key:          l.key,
    label:        l.label || l.compName || l.key,
    absIn:        l.absIn,
    absOut:       l.absOut,
    compName:     l.compName,
    layerName:    l.layerName,
    type:         l.type,
    ratio:        l.ratio,
    slotW:        l.slotW  || l.compW  || null,
    slotH:        l.slotH  || l.compH  || null,
    maskShape:    l.maskShape    || 'rectangle',
    cornerRadius: l.cornerRadius || 0,
  })),
*/
