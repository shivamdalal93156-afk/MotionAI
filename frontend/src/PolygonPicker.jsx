import React, { useState, useRef } from 'react';

export default function PolygonPicker() {
  const [imageSrc, setImageSrc] = useState(null);
  const [points, setPoints] = useState([]); // Will hold exactly 4 {x, y} percentage objects
  const [slotName, setSlotName] = useState('image_1');
  const imgRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) setImageSrc(URL.createObjectURL(file));
  };

  const handleClick = (e) => {
    if (points.length >= 4) return; // Only allow 4 points
    
    const rect = imgRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    setPoints([...points, { x: Math.round(xPct * 100) / 100, y: Math.round(yPct * 100) / 100 }]);
  };

  const resetPoints = () => setPoints([]);

  // Generate the CSS clip-path string
  const getPolygonString = () => {
    if (points.length !== 4) return '';
    return `polygon(${points[0].x}% ${points[0].y}%, ${points[1].x}% ${points[1].y}%, ${points[2].x}% ${points[2].y}%, ${points[3].x}% ${points[3].y}%)`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`"polygon": "${getPolygonString()}"`);
    alert('Copied to clipboard! Paste this into your JSON file.');
  };

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#fff', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0' }}>4-Point Polygon Picker (3D Tool)</h2>
            <p style={{ color: '#888', margin: 0, fontSize: '14px' }}>
              Click exactly 4 corners in this order: <b>Top-Left &rarr; Top-Right &rarr; Bottom-Right &rarr; Bottom-Left</b>.
            </p>
          </div>
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ color: '#aaa' }} />
        </div>

        {imageSrc ? (
          <div style={{ background: '#141414', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
            
            {/* INTERACTIVE CANVAS */}
            <div 
              style={{ position: 'relative', display: 'inline-block', cursor: points.length < 4 ? 'crosshair' : 'default', border: '1px solid #444' }}
              onClick={handleClick}
            >
              <img ref={imgRef} src={imageSrc} alt="Preview" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} draggable={false} />
              
              {/* SVG OVERLAY TO DRAW LINES */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {points.length > 1 && (
                  <polygon 
                    points={points.map(p => `${p.x}%,${p.y}%`).join(' ')} 
                    fill="rgba(37, 99, 235, 0.2)" 
                    stroke="#2563eb" 
                    strokeWidth="2"
                    strokeDasharray={points.length === 4 ? "0" : "4"}
                  />
                )}
              </svg>

              {/* DOTS ON CLICKS */}
              {points.map((p, i) => (
                <div key={i} style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                  width: '12px', height: '12px', background: '#fff', border: '2px solid #2563eb',
                  borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
                  boxShadow: '0 0 10px rgba(0,0,0,0.8)'
                }}>
                  <span style={{ position: 'absolute', top: '-20px', left: '-5px', color: '#fff', fontSize: '12px', fontWeight: 'bold', textShadow: '0 1px 3px #000' }}>{i + 1}</span>
                </div>
              ))}
            </div>

            {/* CONTROLS & OUTPUT */}
            <div style={{ marginTop: '20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#888', marginRight: '8px' }}>Slot Name:</label>
                <input type="text" value={slotName} onChange={e => setSlotName(e.target.value)} style={{ padding: '6px', background: '#000', color: '#fff', border: '1px solid #333' }} />
              </div>
              <button onClick={resetPoints} style={{ padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reset Points</button>
            </div>

            {points.length === 4 && (
              <div style={{ marginTop: '20px', padding: '15px', background: '#000', border: '1px dashed #2563eb', borderRadius: '4px' }}>
                <code style={{ color: '#4a9eff', display: 'block', marginBottom: '10px' }}>
                  "polygon": "{getPolygonString()}"
                </code>
                <button onClick={copyToClipboard} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Copy JSON String
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '60px', textAlign: 'center', background: '#141414', border: '1px dashed #333', borderRadius: '8px' }}>
            <p style={{ color: '#666' }}>Upload a scene preview screenshot to begin tracing.</p>
          </div>
        )}
      </div>
    </div>
  );
}