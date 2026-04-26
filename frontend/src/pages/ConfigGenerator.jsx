import React, { useState } from 'react';

export default function ConfigGenerator() {
  const [aepFile, setAepFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [compName, setCompName] = useState('');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!aepFile) {
      setStatus("Please select an .aep file.");
      return;
    }

    setLoading(true);
    setStatus("Generating preview..."); // Note: Progress could be real-time with SSE/WebSockets later
    setResult(null);

    const formData = new FormData();
    formData.append('aepFile', aepFile);
    if (previewFile) {
      formData.append('previewFile', previewFile);
    }
    if (compName.trim()) {
      formData.append('compName', compName.trim());
    }

    try {
      setStatus("Processing pipeline... This might take a couple of minutes.");
      
      const response = await fetch('http://localhost:3001/api/generate-config', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(`Done! Processing took ${data.processingTime} seconds.`);
        setResult(data);
      } else {
        setStatus(`Error: ${data.message}`);
      }
    } catch (error) {
      setStatus(`Failed to process: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h2>Universal Config Auto-Generator</h2>
      <p style={{ color: '#888' }}>Upload an After Effects template to automatically extract its text and image maps using Gemini Vision.</p>

      <div style={{ background: '#141414', padding: '20px', marginBottom: '20px', border: '1px solid #333' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>.aep Template File (Required)</label>
          <input 
            type="file" 
            accept=".aep" 
            onChange={(e) => setAepFile(e.target.files[0])} 
            style={{ display: 'block', width: '100%', color: '#ccc' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Preview Video/Image (Optional)</label>
          <input 
            type="file" 
            accept="video/mp4,image/jpeg,image/png" 
            onChange={(e) => setPreviewFile(e.target.files[0])} 
            style={{ display: 'block', width: '100%', color: '#ccc' }}
          />
          <small style={{ color: '#666' }}>If omitted, we will render a low-res preview automatically via aerender.</small>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Main Render Composition (Optional)</label>
          <input 
            type="text"
            placeholder="e.g. Render_HD"
            value={compName}
            onChange={e => setCompName(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '8px', background: '#0a0a0a', color: '#fff', border: '1px solid #333', borderRadius: '4px' }}
          />
          <small style={{ color: '#666' }}>Providing this allows AI to generate a preview. If blank, AI vision is skipped but the deep dump will still proceed successfully.</small>
        </div>

        <button 
          onClick={handleAnalyze} 
          disabled={loading || !aepFile}
          style={{
            background: loading ? '#555' : '#2563eb',
            color: '#fff',
            padding: '12px 24px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            width: '100%',
            marginTop: '10px'
          }}
        >
          {loading ? 'Analyzing Template...' : 'Analyze Template'}
        </button>
      </div>

      {status && (
        <div style={{ padding: '15px', background: '#222', borderLeft: '4px solid #2563eb', marginBottom: '20px', color: '#ccc' }}>
          {status}
        </div>
      )}

      {result && (
        <div style={{ background: '#141414', padding: '20px', border: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Generated Config</h3>
            <div style={{
              padding: '5px 10px',
              borderRadius: '4px',
              fontWeight: 'bold',
              background: result.confidence >= 90 ? '#065f46' : (result.confidence >= 70 ? '#b45309' : '#7f1d1d'),
              color: '#fff'
            }}>
              Confidence: {result.confidence}%
            </div>
          </div>
          
          {result.flaggedFields && result.flaggedFields.length > 0 && (
            <div style={{ background: '#451a03', color: '#fcd34d', padding: '10px', marginBottom: '15px', borderLeft: '4px solid #fbbf24' }}>
              ⚠️ Flagged fields needing review: {result.flaggedFields.join(', ')}
            </div>
          )}

          <textarea 
            value={JSON.stringify(result.config, null, 2)}
            readOnly
            style={{
              width: '100%',
              height: '400px',
              background: '#0a0a0a',
              color: '#10b981',
              fontFamily: 'monospace',
              padding: '15px',
              border: '1px solid #333',
              boxSizing: 'border-box'
            }}
          />
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
             <button style={{ flex: 1, padding: '10px', background: '#059669', color: '#fff', border: 'none', cursor: 'default' }}>
                Config Saved to Backend as {result.configId}.json
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
