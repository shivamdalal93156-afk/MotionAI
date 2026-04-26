import React, { useState, useCallback } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export default function ImageCropModal({ imageSrc, aspectRatio, onComplete, onCancel }) {
  const parseAspect = (ratio) => {
    if (!ratio) return undefined;
    const [w, h] = ratio.split(':').map(Number);
    return w / h;
  };

  const [crop, setCrop] = useState({
    unit: '%',
    width: 80,
    height: 80,
    x: 10,
    y: 10
  });
  const [imgEl, setImgEl] = useState(null);

  const getCroppedImg = () => {
    if (!imgEl || !crop.width || !crop.height) return;
    
    const canvas = document.createElement('canvas');
    const scaleX = imgEl.naturalWidth / imgEl.width;
    const scaleY = imgEl.naturalHeight / imgEl.height;

    const cropX = (crop.x / 100) * imgEl.width * scaleX;
    const cropY = (crop.y / 100) * imgEl.height * scaleY;
    const cropW = (crop.width / 100) * imgEl.width * scaleX;
    const cropH = (crop.height / 100) * imgEl.height * scaleY;

    canvas.width = cropW;
    canvas.height = cropH;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    canvas.toBlob(blob => {
      if (!blob) {
        console.error('Canvas toBlob failed');
        return;
      }
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
      onComplete(file);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ background: '#141414', padding: '24px', borderRadius: '8px', maxWidth: '700px', width: '90%' }}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>Crop & Position Image</h3>
        <p style={{ color: '#888', fontSize: '12px' }}>Drag to reposition. Drag corners to resize crop area.</p>

        <ReactCrop
          crop={crop}
          onChange={c => setCrop(c)}
          aspect={parseAspect(aspectRatio)}
          style={{ maxHeight: '400px' }}
        >
          <img
            src={imageSrc}
            onLoad={e => setImgEl(e.currentTarget)}
            style={{ maxWidth: '100%', maxHeight: '400px' }}
          />
        </ReactCrop>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={getCroppedImg} style={{
            flex: 1, padding: '12px', background: '#2563eb',
            color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px'
          }}>
            Use This Crop
          </button>
          <button onClick={onCancel} style={{
            padding: '12px 20px', background: '#333',
            color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px'
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}