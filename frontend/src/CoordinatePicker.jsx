import React, { useState, useRef } from 'react';

export default function CoordinatePicker({  }) {
  const [boxes, setBoxes] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentBox, setCurrentBox] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [label, setLabel] = useState('');
  const imgRef = useRef(null);

  const getRelativePos = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  };

  const onMouseDown = (e) => {
    const pos = getRelativePos(e);
    setStartPos(pos);
    setDrawing(true);
  };

  const onMouseMove = (e) => {
    if (!drawing || !startPos) return;
    const pos = getRelativePos(e);
    setCurrentBox({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y)
    });
  };

  const onMouseUp = () => {
    if (currentBox && currentBox.w > 2 && currentBox.h > 2) {
      const name = prompt('Name this hotspot (e.g. image_1, title_text):');
      if (name) {
        setBoxes(prev => [...prev, { ...currentBox, name }]);
      }
    }
    setDrawing(false);
    setCurrentBox(null);
    setStartPos(null);
  };

  const removeBox = (index) => {
    setBoxes(prev => prev.filter((_, i) => i !== index));
  };

  const exportJSON = () => {
    const result = {};
    boxes.forEach(b => {
      result[b.name] = {
        preview_x: Math.round(b.x * 10) / 10,
        preview_y: Math.round(b.y * 10) / 10,
        preview_w: Math.round(b.w * 10) / 10,
        preview_h: Math.round(b.h * 10) / 10
      };
    });
    const json = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(json);
    alert('Copied to clipboard! Paste into your config file.');
  };

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#fff', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Coordinate Picker Tool</h2>
      <p style={{ color: '#888' }}>Draw boxes on the template preview to define hotspot positions. Each box = one clickable placeholder.</p>

      {!previewImage ? (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#888' }}>Upload template preview image:</label>
          <input type='file' accept='image/*' onChange={e => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            setPreviewImage(url);
          }} />
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', userSelect: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            <img ref={imgRef} src={previewImage} style={{ display: 'block', maxWidth: '600px', maxHeight: '600px' }} draggable={false} />

            {boxes.map((box, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${box.x}%`, top: `${box.y}%`,
                width: `${box.w}%`, height: `${box.h}%`,
                border: '2px solid #2563eb',
                background: 'rgba(37,99,235,0.2)',
                boxSizing: 'border-box'
              }}>
                <span style={{ fontSize: '10px', background: '#2563eb', padding: '1px 4px', color: '#fff' }}>{box.name}</span>
                <button onClick={() => removeBox(i)} style={{ position: 'absolute', top: 0, right: 0, background: 'red', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', padding: '1px 4px' }}>✕</button>
              </div>
            ))}

            {currentBox && (
              <div style={{
                position: 'absolute',
                left: `${currentBox.x}%`, top: `${currentBox.y}%`,
                width: `${currentBox.w}%`, height: `${currentBox.h}%`,
                border: '2px dashed #fff',
                background: 'rgba(255,255,255,0.1)',
                boxSizing: 'border-box',
                pointerEvents: 'none'
              }} />
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#888' }}>Defined Hotspots:</h4>
            {boxes.length === 0 && <p style={{ color: '#555' }}>None yet — draw on the image above</p>}
            {boxes.map((box, i) => (
              <div key={i} style={{ color: '#aaa', fontSize: '12px', marginBottom: '4px' }}>
                {box.name}: x={Math.round(box.x)}% y={Math.round(box.y)}% w={Math.round(box.w)}% h={Math.round(box.h)}%
              </div>
            ))}
            {boxes.length > 0 && (
              <button onClick={exportJSON} style={{ marginTop: '15px', padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                Copy JSON to Clipboard
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}