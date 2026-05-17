import { useEffect, useRef, useState } from "react";

const LAND_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

.al { position:fixed; inset:0; background:#080808; color:#f0ede6; font-family:'DM Sans',sans-serif; overflow-y:auto; overflow-x:hidden; z-index:9999; scroll-behavior:smooth; }
.al::before { content:''; position:fixed; inset:-50%; width:200%; height:200%; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); opacity:.035; pointer-events:none; z-index:1; animation:grain .8s steps(1) infinite; }
@keyframes grain { 0%{transform:translate(0,0)} 20%{transform:translate(3%,1%)} 40%{transform:translate(4%,-2%)} 60%{transform:translate(2%,-4%)} 80%{transform:translate(1%,-1%)} 100%{transform:translate(0,0)} }

.blob { position:fixed; border-radius:50%; filter:blur(120px); pointer-events:none; z-index:0; }
.b1 { width:600px;height:600px; background:radial-gradient(circle,rgba(180,120,60,.18) 0%,transparent 70%); top:-150px;left:-100px; animation:bf1 12s ease-in-out infinite; }
.b2 { width:500px;height:500px; background:radial-gradient(circle,rgba(60,100,180,.12) 0%,transparent 70%); bottom:-100px;right:-80px; animation:bf2 15s ease-in-out infinite; }
@keyframes bf1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,30px) scale(1.08)} }
@keyframes bf2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,-40px) scale(1.05)} }

/* NAV */
.nav { position:fixed; top:0;left:0;right:0; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:24px 48px; background:linear-gradient(to bottom,rgba(8,8,8,.9),transparent); backdrop-filter:blur(12px); }
.logo { font-family:'Bebas Neue',sans-serif; font-size:26px; letter-spacing:.12em; color:#f0ede6; }
.nav-r { display:flex; align-items:center; gap:32px; }
.nav-link { font-size:13px; color:rgba(240,237,230,.5); letter-spacing:.04em; cursor:pointer; background:none; border:none; transition:color .2s; font-family:'DM Sans',sans-serif; }
.nav-link:hover { color:#f0ede6; }
.nav-cta { font-size:12px; font-weight:500; color:#080808; background:#f0ede6; border:none; border-radius:100px; padding:9px 22px; cursor:pointer; letter-spacing:.04em; transition:all .2s; font-family:'DM Sans',sans-serif; }
.nav-cta:hover { background:#fff; transform:scale(1.03); }

/* HERO SECTION */
.hero { position:relative; z-index:5; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 24px; flex-shrink:0; }
.eyebrow { display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:500; letter-spacing:.18em; text-transform:uppercase; color:rgba(240,237,230,.4); margin-bottom:28px; opacity:0; animation:fadeUp .7s .5s forwards; }
.edot { width:5px;height:5px; border-radius:50%; background:#c8933a; animation:pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
.hl { font-family:'Bebas Neue',sans-serif; font-size:clamp(72px,12vw,160px); line-height:.9; letter-spacing:.02em; color:#f0ede6; opacity:0; animation:fadeUp .9s .65s forwards; }
.hl2 { display:block; color:transparent; -webkit-text-stroke:1px rgba(240,237,230,.2); letter-spacing:.06em; }
.sub { margin-top:32px; font-size:clamp(14px,1.8vw,17px); font-weight:300; color:rgba(240,237,230,.45); max-width:420px; line-height:1.65; opacity:0; animation:fadeUp .8s .85s forwards; font-style:italic; }
.ctag { margin-top:48px; display:flex; align-items:center; gap:16px; opacity:0; animation:fadeUp .8s 1.05s forwards; }
.cta1 { font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; color:#080808; background:#f0ede6; border:none; border-radius:100px; padding:14px 36px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:8px; }
.cta1:hover { background:#fff; transform:translateY(-2px); box-shadow:0 12px 40px rgba(240,237,230,.15); }
.cta2 { font-size:13px; color:rgba(240,237,230,.4); background:transparent; border:1px solid rgba(240,237,230,.15); border-radius:100px; padding:13px 28px; cursor:pointer; transition:all .2s; font-family:'DM Sans',sans-serif; }
.cta2:hover { border-color:rgba(240,237,230,.35); color:rgba(240,237,230,.7); }

.steps { position:absolute; bottom:48px; left:48px; z-index:10; display:flex; flex-direction:column; gap:10px; opacity:0; animation:fadeUp .8s 1.3s forwards; }
.snum { font-family:'Bebas Neue',sans-serif; font-size:13px; color:#c8933a; letter-spacing:.05em; width:20px; flex-shrink:0; }
.stxt { font-size:11px; color:rgba(240,237,230,.3); letter-spacing:.03em; }
.badge { position:absolute; bottom:48px; right:48px; z-index:10; text-align:right; opacity:0; animation:fadeUp .8s 1.2s forwards; }
.bnum { font-family:'Bebas Neue',sans-serif; font-size:42px; line-height:1; color:rgba(240,237,230,.08); }
.blbl { font-size:10px; letter-spacing:.15em; text-transform:uppercase; color:rgba(240,237,230,.2); }
.scroll-ind { position:absolute; bottom:36px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:8px; opacity:0; animation:fadeUp .8s 1.4s forwards; }
@keyframes scrollL { 0%{transform:scaleY(0);transform-origin:top} 50%{transform:scaleY(1);transform-origin:top} 51%{transform:scaleY(1);transform-origin:bottom} 100%{transform:scaleY(0);transform-origin:bottom} }
.scroll-txt { font-size:9px; letter-spacing:.2em; text-transform:uppercase; color:rgba(240, 233, 230, 0.2); }

/* HOW IT WORKS SECTION */
.how { position:relative; z-index:5; min-height:100vh; padding:120px 48px 80px; display:flex; flex-direction:column; align-items:center; }
.section-label { font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#c8933a; margin-bottom:20px; }
.section-title { font-family:'Bebas Neue',sans-serif; font-size:clamp(48px,7vw,96px); color:#f0ede6; text-align:center; line-height:.95; margin-bottom:80px; }
.how-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; width:100%; max-width:1100px; }
.how-card { background:rgba(240,237,230,.02); border:1px solid rgba(240,237,230,.06); padding:48px 36px; display:flex; flex-direction:column; gap:20px; transition:background .3s,border-color .3s; cursor:default; opacity:0; transform:translateY(40px); transition:opacity .7s,transform .7s,background .3s,border-color .3s; }
.how-card.visible { opacity:1; transform:translateY(0); }
.how-card:hover { background:rgba(240,237,230,.04); border-color:rgba(240,237,230,.12); }
.hc-num { font-family:'Bebas Neue',sans-serif; font-size:56px; color:rgba(200,147,58,.3); line-height:1; }
.hc-title { font-size:20px; font-weight:500; color:#f0ede6; letter-spacing:-.01em; }
.hc-desc { font-size:14px; color:rgba(240,237,230,.4); line-height:1.7; font-weight:300; }
.hc-icon { font-size:32px; margin-bottom:8px; }

/* DIVIDER */
.divider { width:100%; max-width:1100px; height:1px; background:linear-gradient(to right,transparent,rgba(240,237,230,.08),transparent); margin:0 auto; }

/* DEMO SECTION */
.demo { position:relative; z-index:5; padding:80px 48px 120px; display:flex; flex-direction:column; align-items:center; }
.demo-inner { width:100%; max-width:900px; }
.demo-title { font-family:'Bebas Neue',sans-serif; font-size:clamp(40px,6vw,80px); color:#f0ede6; text-align:center; line-height:.95; margin-bottom:48px; }
.demo-frame { width:100%; aspect-ratio:16/9; border-radius:12px; overflow:hidden; border:1px solid rgba(240,237,230,.08); background:#111; position:relative; opacity:0; transform:translateY(30px); transition:opacity .8s,transform .8s; }
.demo-frame.visible { opacity:1; transform:translateY(0); }
.demo-placeholder { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; }
.demo-play { width:72px; height:72px; border-radius:50%; background:rgba(240,237,230,.1); border:1.5px solid rgba(240,237,230,.2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; backdrop-filter:blur(8px); }
.demo-play:hover { background:rgba(240,237,230,.18); transform:scale(1.06); }
.demo-play-icon { font-size:24px; margin-left:4px; }
.demo-label { font-size:13px; color:rgba(240,237,230,.3); letter-spacing:.06em; }

/* FOOTER */
.foot { position:relative; z-index:5; padding:32px 48px; border-top:1px solid rgba(240,237,230,.06); display:flex; align-items:center; justify-content:space-between; }
.foot-logo { font-family:'Bebas Neue',sans-serif; font-size:20px; letter-spacing:.12em; color:rgba(240,237,230,.3); }
.foot-txt { font-size:12px; color:rgba(240,237,230,.2); }

/* VIDEO MODAL */
.modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:200; display:flex; align-items:center; justify-content:center; padding:24px; backdrop-filter:blur(8px); animation:fadeIn .25s forwards; }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
.modal-inner { width:100%; max-width:900px; aspect-ratio:16/9; border-radius:12px; overflow:hidden; position:relative; }
.modal-close { position:absolute; top:-40px; right:0; background:none; border:none; color:rgba(240,237,230,.5); font-size:24px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:color .2s; z-index:201; }
.modal-close:hover { color:#f0ede6; }

@keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
.exiting { animation:exitFade .55s forwards !important; }
@keyframes exitFade { to{opacity:0;transform:scale(1.03)} }
`;

// Intersection observer hook for scroll animations
function useVisible(ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return visible;
}

function HowCard({ num, icon, title, desc, delay }) {
  const ref = useRef(null);
  const visible = useVisible(ref);
  return (
    <div ref={ref} className={`how-card${visible ? " visible" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="hc-icon">{icon}</div>
      <div className="hc-num">{num}</div>
      <div className="hc-title">{title}</div>
      <div className="hc-desc">{desc}</div>
    </div>
  );
}

function DemoFrame({ onPlay }) {
  const ref = useRef(null);
  const visible = useVisible(ref);
  return (
    <div ref={ref} className={`demo-frame${visible ? " visible" : ""}`}>
      <div className="demo-placeholder" style={{ background: "linear-gradient(135deg,#0d0d0d,#1a1208)" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <button className="demo-play" onClick={onPlay}>
          <span className="demo-play-icon">▶</span>
        </button>
        <div className="demo-label">Watch how Aootra works</div>
      </div>
    </div>
  );
}

export default function LandingPage({ onEnter }) {
  const [exiting, setExiting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const howRef = useRef(null);

  // Push a history state so browser back works
  useEffect(() => {
    window.history.pushState({ page: "landing" }, "", window.location.href);
    const onPop = () => {
      // Browser back pressed — stay on landing, don't go to google
      window.history.pushState({ page: "landing" }, "", window.location.href);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(onEnter, 560);
  };

  const scrollToHow = () => {
    howRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <style>{LAND_CSS}</style>
      <div className={`al${exiting ? " exiting" : ""}`}>

        {/* Blobs */}
        <div className="blob b1" />
        <div className="blob b2" />

        {/* Nav */}
        <nav className="nav">
          <div className="logo">Aootra</div>
          <div className="nav-r">
            <button className="nav-link" onClick={scrollToHow}>How it works</button>
            <button className="nav-link">Pricing</button>
            <button className="nav-cta" onClick={handleEnter}>Start free</button>
          </div>
        </nav>

        {/* Hero */}
        <section className="hero">
          <div className="eyebrow">
            <span className="edot" />
            Professional video — no editor needed
          </div>
          <h1 className="hl">
            Your video
            <span className="hl2">in minutes</span>
          </h1>
          <p className="sub">Upload your photos, fill in your details,<br />download a cinema-grade video.</p>
          <div className="ctag">
            <button className="cta1" onClick={handleEnter}>
              Browse templates <span style={{fontSize:16}}>→</span>
            </button>
            <button className="cta2" onClick={scrollToHow}>How it works</button>
          </div>

          <div className="steps">
            {[["01","Pick a template"],["02","Add photos & text"],["03","Download & share"]].map(([n,t]) => (
              <div key={n} style={{display:"flex",alignItems:"center",gap:10}}>
                <span className="snum">{n}</span>
                <span className="stxt">{t}</span>
              </div>
            ))}
          </div>
          <div className="badge">
            <div className="bnum">10+</div>
            <div className="blbl">Templates ready</div>
          </div>
          <div className="scroll-ind" onClick={scrollToHow} style={{cursor:"pointer"}}>
            <div className="scroll-line" />
            <div className="scroll-txt">scroll</div>
          </div>
        </section>

        <div className="divider" />

        {/* How it works */}
        <section className="how" ref={howRef} id="how">
          <div className="section-label">The process</div>
          <h2 className="section-title">How it<br /><span style={{color:"transparent",WebkitTextStroke:"1px rgba(240,237,230,.2)"}}>works</span></h2>
          <div className="how-grid">
            <HowCard delay={0}   num="01" icon="🎬" title="Pick your template" desc="Browse 10+ professionally designed After Effects templates. Real estate, slideshows, typography, and more." />
            <HowCard delay={120} num="02" icon="🖼" title="Add your content" desc="Upload photos, fill in text fields. Our smart crop tool fits images perfectly to every slot." />
            <HowCard delay={240} num="03" icon="⚡" title="Render & download" desc="Download your MP4. Add your logo or watermark with custom position and timing — no editor needed." />
          </div>
        </section>

        <div className="divider" />

        {/* Demo */}
        <section className="demo" id="demo">
          <div className="demo-inner">
            <div className="section-label" style={{textAlign:"center"}}>See it in action</div>
            <h2 className="demo-title">Watch the<br /><span style={{color:"transparent",WebkitTextStroke:"1px rgba(240,237,230,.2)"}}>demo</span></h2>
            <DemoFrame onPlay={() => setShowModal(true)} />
            <div style={{textAlign:"center",marginTop:32}}>
              <button className="cta1" onClick={handleEnter} style={{margin:"0 auto"}}>
                Try it free <span style={{fontSize:16}}>→</span>
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="foot">
          <div className="foot-logo">Aootra</div>
          <div className="foot-txt">© 2026 Aootra. Professional videos, no editor needed.</div>
        </footer>

      </div>

      {/* Video modal */}
      {showModal && (
        <div className="modal-bg" onClick={() => setShowModal(false)}>
          <div className="modal-inner" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕ close</button>
            {/* Replace src with your YouTube embed URL */}
            <iframe
              width="100%" height="100%"
              src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
              title="Aootra Demo"
              frameBorder="0"
              allow="autoplay; fullscreen"
              allowFullScreen
              style={{display:"block"}}
            />
          </div>
        </div>
      )}
    </>
  );
}