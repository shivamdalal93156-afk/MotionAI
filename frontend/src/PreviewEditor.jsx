import React, { useState } from 'react';
import ImageCropModal from './ImageCropModal';

export default function PreviewEditor({ manifest, selectedId }) {
  const [imageData, setImageData] = useState({});
  const [textData, setTextData] = useState(() => {
    const init = {};
    if (manifest?.text_map) {
      Object.keys(manifest.text_map).forEach(k => { init[k] = ''; });
    }
    return init;
  });
  const [cropTarget, setCropTarget] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [previews, setPreviews] = useState({});
  const [status, setStatus] = useState('');
  const [finalUrl, setFinalUrl] = useState(null);

  const handleImageClick = (slotKey) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setCropSrc(url);
      setCropTarget(slotKey);
    };
    input.click();
  };

  const handleCropComplete = async (croppedFile) => {
    const slotKey = cropTarget;
    setCropTarget(null);
    console.log('Cropped file:', croppedFile, croppedFile.size); // ADD THIS

    const preview = URL.createObjectURL(croppedFile);
    console.log('Preview URL:', preview); // ADD THIS

    setPreviews(prev => ({ ...prev, [slotKey]: preview }));

    const form = new FormData();
    form.append('file', croppedFile);
    const r = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: form });
    const d = await r.json();
    setImageData(prev => ({ ...prev, [slotKey]: d.filePath }));
    setCropSrc(null);
  };

  const handleRender = async () => {
    setStatus('Warming up render engine...');
    setFinalUrl(null);
    const r = await fetch('http://localhost:3001/api/render/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: selectedId, textData, imageData, strategy: 'full_render' })
    });
    const d = await r.json();
    if (d.success) pollStatus(d.jobId);
    else setStatus('Error: ' + d.message);
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

  const imageMap = manifest?.image_map || {};
  const textMap = manifest?.text_map || {};

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#fff', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        <h2 style={{ marginBottom: '4px' }}>{manifest?.name}</h2>
        <p style={{ color: '#555', fontSize: '12px', marginBottom: '24px' }}>Click each placeholder to upload and crop your image</p>

        {/* IMAGE PLACEHOLDERS */}
        {Object.keys(imageMap).length > 0 && (
          <div style={{ background: '#141414', padding: '20px', marginBottom: '20px', border: '1px solid #222', borderRadius: '6px' }}>
            <h4 style={{ color: '#888', marginTop: 0, marginBottom: '16px' }}>IMAGES</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              {Object.keys(imageMap).map(k => {
                const imgConfig = imageMap[k];
                const isObject = typeof imgConfig === 'object';
                const ratio = isObject ? imgConfig.ratio : '16:9';
                const hint = isObject ? imgConfig.hint : '';
                const [rw, rh] = ratio.split(':').map(Number);
                const paddingTop = `${(rh / rw) * 100}%`;
                const hasImage = !!previews[k];

                return  (
  <div key={k}>
    <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>{k}</span>
      <span style={{ background: '#1a1a2e', color: '#4a9eff', padding: '1px 6px', borderRadius: '3px', border: '1px solid #2563eb', fontSize: '10px' }}>{ratio}</span>
    </div>
    <div
      onClick={() => handleImageClick(k)}
      style={{
        width: '100%',
        aspectRatio: ratio.replace(':', '/'),
        background: hasImage ? '#000' : '#1a1a1a',
        border: hasImage ? '2px solid #2563eb' : '2px dashed #333',
        borderRadius: '4px',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}
    >
      {hasImage ? (
        <>
          <img src={previews[k]} style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.6)', color: '#fff',
            fontSize: '10px', textAlign: 'center', padding: '3px'
          }}>
            Click to change
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#444' }}>
          <div style={{ fontSize: '24px', marginBottom: '4px' }}>+</div>
          <div style={{ fontSize: '10px' }}>{hint || 'Click to upload'}</div>
        </div>
      )}
    </div>
  </div>

                );
              })}
            </div>
          </div>
        )}

        {/* TEXT FIELDS */}
        {Object.keys(textMap).length > 0 && (
          <div style={{ background: '#141414', padding: '20px', marginBottom: '20px', border: '1px solid #222', borderRadius: '6px' }}>
            <h4 style={{ color: '#888', marginTop: 0 }}>TEXT</h4>
            {Object.keys(textMap).map(k => (
              <div key={k} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>{textMap[k]}</label>
                <input
                  type='text'
                  value={textData[k] || ''}
                  onChange={e => setTextData({ ...textData, [k]: e.target.value })}
                  style={{ width: '100%', padding: '8px', background: '#0d0d0d', color: '#fff', border: '1px solid #333', borderRadius: '3px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
        )}

        {/* STATUS */}
        {status && (
          <div style={{ background: '#141414', padding: '15px', marginBottom: '15px', color: '#aaa', borderLeft: '3px solid #2563eb', borderRadius: '3px' }}>
            {status}
          </div>
        )}

        {/* VIDEO OUTPUT */}
        {finalUrl && (
          <div style={{ background: '#141414', padding: '15px', marginBottom: '15px', borderRadius: '6px' }}>
            <video src={`http://localhost:3001${finalUrl}`} controls style={{ width: '100%' }} />
          </div>
        )}

        {/* RENDER BUTTON */}
        {!finalUrl && (
          <button onClick={handleRender} style={{
            width: '100%', padding: '15px', background: '#2563eb',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontWeight: 'bold', borderRadius: '4px', fontSize: '16px'
          }}>
            Engage Render
          </button>
        )}
      </div>

      {/* CROP MODAL */}
      {cropSrc && cropTarget && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspectRatio={(() => {
            const cfg = imageMap[cropTarget];
            return typeof cfg === 'object' ? cfg.ratio : '16:9';
          })()}
          onComplete={handleCropComplete}
          onCancel={() => { setCropSrc(null); setCropTarget(null); }}
        />
      )}
    </div>
  );
}