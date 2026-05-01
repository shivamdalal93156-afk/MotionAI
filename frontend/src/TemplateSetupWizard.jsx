import React, { useState, useEffect, useRef } from 'react';

export default function TemplateSetupWizard({ templateId }) {
  const [manifest, setManifest] = useState(null);
  const [imageKeys, setImageKeys] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState('Loading manifest...');
  const imgRef = useRef(null);

  // 1. Fetch the manifest
  useEffect(() => {
    fetch(`http://localhost:3001/api/render/manifest/${templateId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setManifest(d.manifest);
          setImageKeys(Object.keys(d.manifest.image_map || {}));
          setStatus('Ready to trace.');
        } else {
          setStatus('Failed to load template.');
        }
      });
  }, [templateId]);

  const currentKey = imageKeys[currentIndex];
  // Look for the extracted frame in your public folder (e.g., 3d_photo_slideshow_scene1.jpg)
  const imageSrc = `/previews/${templateId}_scene${currentIndex + 1}.jpg`;

  const handleClick = (e) => {
    if (points.length >= 4) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setPoints([...points, { x: Math.round(xPct * 100) / 100, y: Math.round(yPct * 100) / 100 }]);
  };

  const handleSaveAndNext = async () => {
    if (points.length !== 4) return alert("You must click exactly 4 corners!");
    
    setStatus('Saving to backend...');
    const polygonString = `polygon(${points[0].x}% ${points[0].y}%, ${points[1].x}% ${points[1].y}%, ${points[2].x}% ${points[2].y}%, ${points[3].x}% ${points[3].y}%)`;

    // TELL THE BACKEND TO REWRITE THE JSON FILE
    const res = await fetch('http://localhost:3001/api/render/update-polygon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        slot_key: currentKey,
        polygon: polygonString
      })
    });

    const data = await res.json();
    if (data.success) {
      setPoints([]);
      if (currentIndex < imageKeys.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setStatus('Saved! Moving to next scene...');
      } else {
        setStatus('All scenes configured! You can close this tool.');
      }
    } else {
      setStatus('Error saving to backend.');
    }
  };

  if (!manifest) return <div style={{ color: 'white', padding: '40px' }}>{status}</div>;

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#fff', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0' }}>Internal Setup Tool: {manifest.name}</h2>
            <p style={{ color: '#888', margin: 0 }}>
              Mapping <b>{currentKey}</b> (Scene {currentIndex + 1} of {imageKeys.length}) <br/>
              Click 4 corners: <b>Top-Left &rarr; Top-Right &rarr; Bottom-Right &rarr; Bottom-Left</b>.
            </p>
          </div>
          <div style={{ color: '#4a9eff', fontWeight: 'bold' }}>{status}</div>
        </div>

        <div style={{ background: '#141414', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
          
          <div 
            style={{ position: 'relative', display: 'inline-block', cursor: points.length < 4 ? 'crosshair' : 'default', border: '1px solid #444', width: '100%' }}
            onClick={handleClick}
          >
            <img ref={imgRef} src={imageSrc} style={{ display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} draggable={false} />
            
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {points.length > 1 && (
                <polygon points={points.map(p => `${p.x}%,${p.y}%`).join(' ')} fill="rgba(37, 99, 235, 0.2)" stroke="#2563eb" strokeWidth="2" strokeDasharray={points.length === 4 ? "0" : "4"} />
              )}
            </svg>

            {points.map((p, i) => (
              <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: '12px', height: '12px', background: '#fff', border: '2px solid #2563eb', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: '-20px', left: '-5px', color: '#fff', fontSize: '12px', fontWeight: 'bold', textShadow: '0 1px 3px #000' }}>{i + 1}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '20px', justifyContent: 'flex-end' }}>
            <button onClick={() => setPoints([])} style={{ padding: '10px 20px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reset Points</button>
            <button 
              onClick={handleSaveAndNext} 
              disabled={points.length !== 4}
              style={{ padding: '10px 20px', background: points.length === 4 ? '#2563eb' : '#222', color: points.length === 4 ? '#fff' : '#555', border: 'none', borderRadius: '4px', cursor: points.length === 4 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
            >
              Save to Backend & Next &rarr;
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}