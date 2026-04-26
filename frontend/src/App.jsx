
import React, { useState, useEffect } from 'react';

export default function App() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [manifest, setManifest] = useState(null);
  const [textData, setTextData] = useState({});
  const [status, setStatus] = useState('');
  const [finalUrl, setFinalUrl] = useState(null);
  const [imageData, setImageData] = useState({});


  useEffect(() => {
    fetch('http://localhost:3001/api/render/templates')
      .then(r => r.json())
      .then(d => { if (d.success) setTemplates(d.templates); })
      .catch(() => setStatus('Backend not running. Start server.js'));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setManifest(null);
    setTextData({});
    setImageData({});
    setStatus('');
    setFinalUrl(null);

    fetch(`http://localhost:3001/api/render/manifest/${selectedId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setManifest(d.manifest);
          const init = {};
          Object.keys(d.manifest.text_map).forEach(k => { init[k] = ''; });
          setTextData(init);
        } else {
          setStatus('Config error: JSON missing text_map.');
        }
      });
  }, [selectedId]);

  const pollStatus = (jid) => {
    const iv = setInterval(async () => {
      const r = await fetch(`http://localhost:3001/api/jobs/${jid}`);
      const d = await r.json();
      if (!d.job) return;
      setStatus(d.job.message || d.job.status);
      if (d.job.status === 'done') {
        clearInterval(iv);
        setFinalUrl(d.job.outputUrl);
        setStatus('Render Complete!');
      } else if (d.job.status === 'error') {
        clearInterval(iv);
      }
    }, 4000);
  };

  const handleRender = async () => {
    if (!manifest) return;
    setStatus('Warming up render engine...');
    setFinalUrl(null);

    const r = await fetch('http://localhost:3001/api/render/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: selectedId, textData, imageData, strategy: 'full_render' })
    });
    const d = await r.json();
    if (d.success) {
      pollStatus(d.jobId);
    } else {
      setStatus('Error: ' + d.message);
    }
  };

  const scenes = manifest?.text_map ? Object.keys(manifest.text_map).reduce((acc, k) => {
    const s = k.match(/^scene(\d+)/)?.[1] || '1';
    (acc[s] = acc[s] || []).push(k);
    return acc;
  }, {}) : {};

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#fff', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <h2>MotionAI Engine</h2>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px', background: '#141414', color: '#fff', border: '1px solid #333' }}>
          <option value=''>-- Select Architecture --</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {Object.entries(scenes).map(([scene, keys]) => (
          <div key={scene} style={{ background: '#141414', padding: '15px', marginBottom: '15px', border: '1px solid #222' }}>
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
