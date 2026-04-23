import React, { useState, useEffect } from 'react';

export default function App() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [manifest, setManifest] = useState(null);
  
  // State for both Text and Images
  const [textData, setTextData] = useState({});
  const [imageData, setImageData] = useState({}); 
  
  const [status, setStatus] = useState('');
  const [finalUrl, setFinalUrl] = useState(null);

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
    setImageData({}); // Clear old images when switching templates
    setStatus('');
    setFinalUrl(null);

    fetch(`http://localhost:3001/api/render/manifest/${selectedId}`)
      .then(r => r.json())
      .then(d => {
        // UPGRADE: Now accepts templates even if they only have images
        if (d.success && d.manifest) { 
          setManifest(d.manifest);
          const initText = {};
          if (d.manifest.text_map) {
            Object.keys(d.manifest.text_map).forEach(k => { initText[k] = ''; });
          }
          setTextData(initText);
        } else {
          setStatus('Config error: JSON missing manifest.');
        }
      });
  }, [selectedId]);

  // NEW: Sends your local image to your backend upload.js route
  const handleImageUpload = async (key, file) => {
    if (!file) return;
    setStatus(`Uploading media for ${key}...`);
    
    const formData = new FormData();
    formData.append('file', file); 

    try {
      const r = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData
      });
      const d = await r.json();
      
      if (d.success) {
        // Save the backend file path so ExtendScript can find it on the server
        setImageData(prev => ({ ...prev, [key]: d.filePath || d.path || d.url }));
        setStatus(`Successfully uploaded ${key}!`);
      } else {
        setStatus('Upload failed: ' + d.message);
      }
    } catch (err) {
      setStatus('Upload error. Make sure your upload.js route is working!');
    }
  };

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
      // UPGRADE: Send both textData AND imageData to the engine
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

        {/* DYNAMIC TEXT INJECTIONS */}
        {Object.keys(scenes).length > 0 && Object.entries(scenes).map(([scene, keys]) => (
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

        {/* DYNAMIC MEDIA INJECTIONS (NEW) */}
        {manifest?.image_map && Object.keys(manifest.image_map).length > 0 && (
          <div style={{ background: '#1a1a24', padding: '15px', marginBottom: '15px', border: '1px solid #3b3b5c' }}>
            <h4 style={{ color: '#88aaff', marginTop: 0 }}>MEDIA INJECTIONS</h4>
            {Object.keys(manifest.image_map).map(k => (
              <div key={k} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#88aaff', marginBottom: '4px' }}>Target Layer: {manifest.image_map[k]}</label>
                  <input type='file' accept="image/*,video/*" onChange={e => handleImageUpload(k, e.target.files[0])} style={{ color: '#fff', fontSize: '14px' }} />
                </div>
                {imageData[k] && <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 'bold' }}>✓ Ready</span>}
              </div>
            ))}
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