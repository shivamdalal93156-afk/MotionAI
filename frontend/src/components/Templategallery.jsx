import { useRef, useEffect, useCallback, useState } from 'react';

const API   = 'http://localhost:3001';
const AMBER = '#E8A020';
const WHITE = '#F5F2ED';
const MUTED2 = '#444440';

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS FALLBACK ANIMATIONS
// One generic animation per template "type"
// These fire only when no real preview MP4 exists
// ─────────────────────────────────────────────────────────────────────────────

function canvasStatic(ctx, w, h, name, type) {
  const isSlide = type === 'photo_slideshow';
  ctx.fillStyle = isSlide ? '#050a14' : '#080808';
  ctx.fillRect(0, 0, w, h);

  if (isSlide) {
    // Grid of placeholder boxes
    const cells = [
      { x:w*0.08, y:h*0.12, cw:w*0.4,  ch:h*0.58, c:'rgba(100,150,255,0.18)' },
      { x:w*0.52, y:h*0.08, cw:w*0.4,  ch:h*0.38, c:'rgba(232,160,32,0.15)'  },
      { x:w*0.52, y:h*0.50, cw:w*0.4,  ch:h*0.24, c:'rgba(255,255,255,0.05)' },
    ];
    cells.forEach(c => {
      ctx.fillStyle = c.c; ctx.fillRect(c.x, c.y, c.cw, c.ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(c.x, c.y, c.cw, c.ch);
    });
  } else {
    // Typography style
    ctx.fillStyle = AMBER;
    ctx.fillRect(28, 40, 3, 120);
    const sz = Math.floor(w * 0.085);
    ctx.font = `bold ${sz}px 'Bebas Neue', serif`;
    ctx.fillStyle = AMBER; ctx.textAlign = 'left';
    const words = name.toUpperCase().split(' ');
    words.slice(0, 2).forEach((word, i) => {
      ctx.globalAlpha = i === 0 ? 1 : 0.5;
      ctx.fillText(word, 44, h * 0.38 + i * (sz * 1.3));
    });
    ctx.globalAlpha = 1;
  }

  // Template name at bottom
  ctx.font = `${Math.floor(w * 0.022)}px 'DM Sans', sans-serif`;
  ctx.fillStyle = MUTED2; ctx.textAlign = 'center';
  ctx.fillText(name.toUpperCase(), w / 2, h - 14);
}

function canvasAnimate(ctx, w, h, name, type, phase) {
  canvasStatic(ctx, w, h, name, type);
  
  if (type === 'typography') {
    // Decode animation overlay
    ctx.fillStyle = `rgba(232,160,32,${0.3 * Math.sin(phase * 8)})`;
    ctx.fillRect(44, h * 0.38, w * 0.3, 20);
  } else {
    // Slideshow parallax effect
    const offset = Math.sin(phase * 6) * 8;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = AMBER;
    ctx.fillRect(w * 0.52 + offset, h * 0.08 - offset / 2, w * 0.35, h * 0.35);
    ctx.globalAlpha = 1;
  }
}

function canvasFrame(ctx, w, h, f, name, type) {
  const isSlide = type === 'photo_slideshow';

  if (isSlide) {
    // Sliding card animation
    ctx.fillStyle = '#050a14'; ctx.fillRect(0, 0, w, h);
    const scene = Math.floor(f / 72) % 4;
    const t     = (f % 72) / 72;
    const ease  = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    const colors = ['rgba(90,140,255,0.22)','rgba(232,160,32,0.2)','rgba(255,90,90,0.16)','rgba(80,210,160,0.16)'];
    ctx.save();
    ctx.transform(1, 0, Math.sin(f*0.035)*0.018, 1, 0, 0);
    const cw=w*0.6, ch=h*0.65, cx=(w-cw)/2+(1-ease)*w*0.1, cy=(h-ch)/2;
    ctx.fillStyle = colors[scene];
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
    ctx.fillRect(cx,cy,cw,ch); ctx.strokeRect(cx,cy,cw,ch);
    ctx.font = `bold ${Math.floor(w*0.05)}px 'Bebas Neue', serif`;
    ctx.fillStyle = WHITE; ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, ease*1.5);
    ctx.fillText(name.toUpperCase(), w/2, cy+ch/2+6);
    ctx.globalAlpha = 1; ctx.restore();
    for (let i=0;i<4;i++) {
      ctx.beginPath(); ctx.arc(w/2-18+i*12, h-16, i===scene?3.5:2, 0, Math.PI*2);
      ctx.fillStyle = i===scene ? AMBER : 'rgba(255,255,255,0.18)'; ctx.fill();
    }
  } else {
    // Text decode animation
    ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(232,160,32,0.025)';
    ctx.fillRect(0, (f*2.5)%(h+20)-10, w, 3);
    ctx.fillStyle = AMBER; ctx.fillRect(28, 38, 3, 135);
    const words  = name.toUpperCase().split(' ');
    const cycle  = Math.floor(f / 55) % words.length;
    const prog   = (f % 55) / 55;
    const sz     = Math.floor(w * 0.075);
    words.forEach((word, i) => {
      const y = 72 + i * (sz * 1.35); ctx.textAlign = 'left';
      if (i < cycle) {
        ctx.font = `bold ${Math.floor(sz*0.72)}px 'Bebas Neue',serif`;
        ctx.fillStyle = 'rgba(232,160,32,0.35)'; ctx.fillText(word, 44, y);
      } else if (i === cycle) {
        ctx.font = `bold ${sz}px 'Bebas Neue',serif`;
        const rev = Math.floor(prog * word.length);
        ctx.fillStyle = AMBER; ctx.fillText(word.slice(0, rev), 44, y);
        if (rev < word.length) {
          ctx.fillStyle = 'rgba(232,160,32,0.22)'; ctx.font = `bold ${sz}px monospace`;
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ#_@!';
          for (let j=rev; j<Math.min(rev+3,word.length); j++)
            ctx.fillText(chars[Math.floor(Math.random()*chars.length)], 44+j*(sz*0.61), y);
        }
      } else {
        ctx.font = `bold ${Math.floor(sz*0.72)}px 'Bebas Neue',serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillText(word, 44, y);
      }
    });
  }

  ctx.font = `${Math.floor(w*0.022)}px 'DM Sans',sans-serif`;
  ctx.fillStyle = 'rgba(232,160,32,0.28)'; ctx.textAlign = 'center';
  ctx.fillText('MOTIONAI', w/2, h-12);
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE CARD
// ─────────────────────────────────────────────────────────────────────────────
function TemplateCard({ template, onUse }) {
  const staticRef = useRef(null);
  const animRef   = useRef(null);
  const videoRef  = useRef(null);
  const rafRef    = useRef(null);
  const frameRef  = useRef(0);
  const activeRef = useRef(false);

  const { template_id, name, type } = template;
  const thumbSrc   = `/previews/${template_id}_thumb.jpg`;
  const previewSrc = `/previews/${template_id}_preview.mp4`;

  // Track whether real files actually loaded
  const thumbOk = useRef(false);
  const videoOk = useRef(false);

  // Paint canvas static thumbnail as base layer always
  useEffect(() => {
    const c = staticRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    canvasStatic(ctx, c.width, c.height, name, type);
  }, [name, type]);

  // Eagerly check if video file exists using a HEAD fetch
  // This way videoOk is set before the user even hovers
  useEffect(() => {
    fetch(previewSrc, { method: 'HEAD' })
      .then(r => { if (r.ok) videoOk.current = true; })
      .catch(() => {});
  }, [previewSrc]);

  const showStatic = () => {
    if (staticRef.current) staticRef.current.style.opacity = '1';
    if (videoRef.current)  videoRef.current.style.opacity  = '0';
    if (animRef.current)   animRef.current.style.opacity   = '0';
  };

  const startCanvasAnim = useCallback(() => {
    if (!animRef.current) return;
    animRef.current.style.opacity = '1';
    const tick = () => {
      if (!activeRef.current) return;
      const c = animRef.current;
      if (!c) return;
      canvasFrame(c.getContext('2d'), c.width, c.height, frameRef.current, name, type);
      frameRef.current = (frameRef.current + 1) % 480;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [name, type]);

  const startPreview = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    if (staticRef.current) staticRef.current.style.opacity = '0';

    if (videoOk.current && videoRef.current) {
      // Real MP4 exists — play it
      videoRef.current.style.opacity = '1';
      videoRef.current.currentTime   = 0;
      videoRef.current.play().catch(startCanvasAnim);
    } else {
      // No video — canvas animation
      startCanvasAnim();
    }
  }, [startCanvasAnim]);

  const stopPreview = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (videoRef.current) videoRef.current.pause();
    showStatic();
  }, []);
  

  useEffect(() => () => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const badge = type === 'photo_slideshow' ? 'Image + Text' : 'Typography';
  const label = type === 'photo_slideshow' ? 'Photo Slideshow' : 'Typography Reel';

  return (
    <div className="mai-tcard" onMouseEnter={startPreview} onMouseLeave={stopPreview}>
      <div className="mai-tcard-media">

        {/* Canvas thumbnail — always rendered as base, hidden by real thumb if it loads */}
        <canvas
          ref={staticRef}
          width={400} height={225}
          style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            display:'block', transition:'opacity 0.4s ease',
          }}
        />

        {/* Real JPG thumbnail — painted on top if it loads successfully */}
        <img
          src={thumbSrc}
          alt={name}
          onLoad={() => {
            thumbOk.current = true;
            // Hide canvas thumbnail since real image loaded
            if (staticRef.current && !activeRef.current)
              staticRef.current.style.opacity = '0';
          }}
          onError={() => { thumbOk.current = false; }}
          style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'cover', transition:'opacity 0.4s ease',
          }}
        />

        {/* Real MP4 preview */}
        <video
          ref={videoRef}
          src={previewSrc}
          muted loop playsInline preload="metadata"
          style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'cover', opacity:0, transition:'opacity 0.4s ease',
          }}
        />

        {/* Canvas animation layer */}
        <canvas
          ref={animRef}
          width={400} height={225}
          style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            display:'block', opacity:0, transition:'opacity 0.4s ease',
            pointerEvents:'none',
          }}
        />

        <div className="mai-tcard-play">
          <div className="mai-tcard-play-dot" />
          <span className="mai-tcard-play-txt">Preview</span>
        </div>

        <div className="mai-tcard-overlay">
          <div className="mai-tcard-overlay-label">{label}</div>
          <div className="mai-tcard-overlay-desc">{name}</div>
          <button
            className="mai-tcard-overlay-btn"
            onClick={e => { e.stopPropagation(); onUse(template_id); }}
          >
            Use Template
          </button>
        </div>
      </div>

      <div className="mai-tcard-meta">
        <div className="mai-tcard-name">{name}</div>
        <div className="mai-tcard-badge">{badge}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY — fetches templates from backend automatically
// ─────────────────────────────────────────────────────────────────────────────
export default function TemplateGallery({ onSelectTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const handleUseTemplate = (templateId) => {
        // 1. Send the template ID to RenderStudio
        window.dispatchEvent(new CustomEvent('forceTemplateChange', { detail: templateId }));
        
        // 2. Smoothly scroll down the page to the studio
        document.getElementById('render-studio-section')?.scrollIntoView({ behavior: 'smooth' });
    };

  useEffect(() => {
    fetch(`${API}/api/render/templates`)
      .then(r => r.json())
      .then(data => {
        // API returns either array directly OR { success, templates: [] }
        const raw = Array.isArray(data) ? data : (data.templates || []);
        // Filter broken configs (missing id)
        const valid = raw.filter(t => t.id && t.name);
        // Normalize: API uses "id" but our components expect "template_id"
        const normalized = valid.map(t => ({
          ...t,
          template_id: t.id || t.template_id,
        }));
        setTemplates(normalized);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section className="mai-section mai-section-alt" id="templates">
      <div className="mai-gallery-header">
        <div>
          <div className="mai-section-tag">Template Library</div>
          <div className="mai-section-title">CHOOSE YOUR TEMPLATE</div>
        </div>
        <button className="mai-btn-ghost-sm">Upload Your Own AEP →</button>
      </div>

      {loading ? (
        <div style={{ color:'var(--muted)', fontSize:13, padding:'40px 0' }}>
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div style={{ color:'var(--muted)', fontSize:13, padding:'40px 0' }}>
          No templates found. Add configs to backend/configs/
        </div>
      ) : (
        <div className="mai-template-grid">
          {templates.map(t => (
            <TemplateCard
              key={t.template_id}
              template={t}
              onUse={id => {
                handleUseTemplate(id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
