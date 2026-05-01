import { useState, useEffect } from 'react';
import CoordinatePicker from './CoordinatePicker';
import PreviewEditor from './PreviewEditor';
import TemplateGallery from './components/Templategallery';
import RenderStudio from './components/Renderstudio';
import PolygonPicker from './PolygonPicker';
import TemplateSetupWizard from './TemplateSetupWizard';

export default function App() {
  // ============ PRESERVE URL PARAMETER ROUTES ============
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('setup')) {
    return <TemplateSetupWizard templateId={urlParams.get('setup')} />;
  }

  if (urlParams.get('picker') === 'flat') {
    return <CoordinatePicker />;
  }

  if (urlParams.get('picker') === 'poly') {
    return <PolygonPicker />;
  }

  if (urlParams.get('preview')) {
    return <PreviewEditor templateId={urlParams.get('preview')} />;
  }

  // ============ MAIN APP LAYOUT ============
  return (
    <div className="mai-app">
      {/* Navigation Bar */}
      <nav className="mai-nav">
        <div className="mai-nav-container">
          <div className="mai-logo">
            <span className="mai-logo-icon">⚡</span>
            <span className="mai-logo-text">MotionAI</span>
          </div>
          <div className="mai-nav-links">
            <a href="#templates" className="mai-nav-link">Templates</a>
            <a href="#render" className="mai-nav-link">Studio</a>
            <a href="#" className="mai-nav-link-cta">API Docs</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mai-section mai-hero">
        <div className="mai-hero-content">
          <h1 className="mai-hero-title">
            RENDER ANYTHING
            <br />
            <span className="mai-hero-accent">INSTANTLY</span>
          </h1>
          <p className="mai-hero-desc">
            Professional After Effects templates, automated. No software, no waiting. Just create.
          </p>
          <button className="mai-btn-primary" onClick={() => document.getElementById('render-studio-section')?.scrollIntoView({ behavior: 'smooth' })}>
            Start Creating →
          </button>
        </div>
        <div className="mai-hero-visual">
          <div className="mai-hero-card mai-hero-card-1">
            <div className="mai-hero-card-inner">DECODER</div>
          </div>
          <div className="mai-hero-card mai-hero-card-2">
            <div className="mai-hero-card-inner">TYPOGRAPHY</div>
          </div>
          <div className="mai-hero-card mai-hero-card-3">
            <div className="mai-hero-card-inner">SLIDESHOW</div>
          </div>
        </div>
      </section>

      {/* Template Gallery */}
      <TemplateGallery onSelectTemplate={() => {}} />

      {/* How It Works */}
      <section className="mai-section" id="how-it-works">
        <div className="mai-section-header">
          <div className="mai-section-tag">The Process</div>
          <div className="mai-section-title">HOW IT WORKS</div>
        </div>
        <div className="mai-how-grid">
          <div className="mai-how-card">
            <div className="mai-how-num">01</div>
            <h3 className="mai-how-title">Choose Template</h3>
            <p className="mai-how-desc">Pick from our library of professional After Effects designs</p>
          </div>
          <div className="mai-how-card">
            <div className="mai-how-num">02</div>
            <h3 className="mai-how-title">Add Your Content</h3>
            <p className="mai-how-desc">Paste text, upload images. Auto-mapped to your template</p>
          </div>
          <div className="mai-how-card">
            <div className="mai-how-num">03</div>
            <h3 className="mai-how-title">Render & Download</h3>
            <p className="mai-how-desc">We render on our servers. Download your MP4 in minutes</p>
          </div>
        </div>
      </section>

      {/* Render Studio */}
      <RenderStudio />

      {/* Footer */}
      <footer className="mai-footer">
        <div className="mai-footer-content">
          <div className="mai-footer-col">
            <h4 className="mai-footer-title">MotionAI</h4>
            <p className="mai-footer-text">Professional video rendering at scale</p>
          </div>
          <div className="mai-footer-col">
            <h4 className="mai-footer-title">Product</h4>
            <a href="#" className="mai-footer-link">Templates</a>
            <a href="#" className="mai-footer-link">API</a>
            <a href="#" className="mai-footer-link">Pricing</a>
          </div>
          <div className="mai-footer-col">
            <h4 className="mai-footer-title">Company</h4>
            <a href="#" className="mai-footer-link">About</a>
            <a href="#" className="mai-footer-link">Blog</a>
            <a href="#" className="mai-footer-link">Contact</a>
          </div>
        </div>
        <div className="mai-footer-bottom">
          <p>&copy; 2026 MotionAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
            <h4 style={{ color: '#888', marginTop: 0 }}>SCENE {scene}</h4>
            {keys.map(k => (
              <div key={k} style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>{manifest.text_map[k]}</label>
                <input type='text' value={textData[k] || ''} onChange={e => setTextData({ ...textData, [k]: e.target.value })} style={{ width: '100%', padding: '8px', background: '#0d0d0d', color: '#fff', border: '1px solid #333' }} />
              </div>
            ))}
          </div>
        ))}
        {manifest?.image_map && Object.keys(manifest.image_map).length > 0 && (
  <div style={{background:'#141414',padding:'15px',marginBottom:'15px',border:'1px solid #222'}}>
    <h4 style={{color:'#888',marginTop:0}}>IMAGES</h4>
    {Object.keys(manifest.image_map).map(k => {
      const imgConfig = manifest.image_map[k];
      const isObject = typeof imgConfig === 'object';
      const ratio = isObject ? imgConfig.ratio : null;
      const hint = isObject ? imgConfig.hint : null;
      return (
        <div key={k} style={{marginBottom:'14px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px'}}>
            <label style={{fontSize:'12px',color:'#666'}}>{k}</label>
            {ratio && (
              <span style={{fontSize:'11px', background:'#1a1a2e', color:'#4a9eff', padding:'2px 8px', borderRadius:'4px', border:'1px solid #2563eb'}}>
                {ratio}
              </span>
            )}
            {hint && (
              <span style={{fontSize:'11px', color:'#888'}}>
                — {hint} photo recommended
              </span>
            )}
          </div>
          <input type='file' accept='image/*' onChange={e => {
            const file = e.target.files[0];
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            fetch('http://localhost:3001/api/upload', {method:'POST',body:form})
              .then(r => r.json())
              .then(d => setImageData(prev => ({...prev, [k]: d.filePath})));
          }} style={{color:'#aaa'}} />
        </div>
      );
    })}
  </div>
)}

        {status && <div style={{ background: '#141414', padding: '15px', marginBottom: '15px', color: '#aaa', borderLeft: '3px solid #2563eb' }}>{status}</div>}
        
        {finalUrl && (
          <div style={{ background: '#141414', padding: '15px', marginBottom: '15px' }}>
            <video src={`http://localhost:3001${finalUrl}`} controls style={{ width: '100%' }} />
          </div>
        )}

        {manifest && !finalUrl && <button onClick={handleRender} style={{ width: '100%', padding: '15px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Engage Render</button>}
      </div>
    </div>
  );
}
