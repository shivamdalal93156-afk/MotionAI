import React, { useState, useEffect } from 'react'

export default function App() {
  const [templates, setTemplates] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [manifest, setManifest] = useState(null)
  const [textData, setTextData] = useState({})
  const [imageData, setImageData] = useState({})
  const [imagePreviews, setImagePreviews] = useState({})
  const [status, setStatus] = useState('')
  const [jobId, setJobId] = useState(null)
  const [finalUrl, setFinalUrl] = useState(null)

  useEffect(() => {
    fetch('http://localhost:3001/api/render/templates')
      .then(r => r.json())
      .then(d => { if (d.success) setTemplates(d.templates) })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setManifest(null)
    setTextData({})
    setImageData({})
    setImagePreviews({})
    setStatus('')
    setFinalUrl(null)
    setJobId(null)
    fetch(`http://localhost:3001/api/render/manifest/${selectedId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setManifest(d.manifest)
          const init = {}
          if (d.manifest.text_map) {
            Object.keys(d.manifest.text_map).forEach(k => { init[k] = '' })
          } else if (d.manifest.layers) {
            d.manifest.layers.filter(l => l.type === 'text').forEach(l => { init[l.name] = '' })
          }
          setTextData(init)
        }
      })
  }, [selectedId])

  const uploadImage = async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: fd })
    const d = await r.json()
    if (d.success) return d.filePath
    throw new Error('Upload failed')
  }

  const handleImageChange = async (e, name) => {
    const file = e.target.files[0]
    if (!file) return
    setImagePreviews(p => ({ ...p, [name]: URL.createObjectURL(file) }))
    const path = await uploadImage(file)
    setImageData(p => ({ ...p, [name]: path }))
  }

  const pollStatus = (jid) => {
  const iv = setInterval(async () => {
    try {
      const r = await fetch(`http://localhost:3001/api/jobs/${jid}`)
      const d = await r.json()
      const job = d.job  // unwrap the nested job object
      if (!job) return
      setStatus(job.message || job.status)
      if (job.status === 'done') {
        clearInterval(iv)
        setFinalUrl(job.outputUrl)
        setStatus('Done!')
      } else if (job.status === 'error') {
        clearInterval(iv)
        setStatus('Error: ' + job.message)
      }
    } catch(e) {
      console.error('Poll error:', e)
    }
  }, 4000)
}

  const handleRender = async () => {
    if (!manifest) return
    setStatus('Sending to render engine...')
    setFinalUrl(null)
    let finalTextData = textData
    if (selectedId === 'kinetic_001' && textData['__script__']) {
      const words = textData['__script__'].trim().split(/\s+/).filter(w => w.length > 0)
      const layers = manifest.layers.filter(l => l.type === 'text')
      finalTextData = {}
      layers.forEach((layer, i) => {
        finalTextData[layer.name] = words[i] || ' '
      })
    }
    const payload = {
      template_id: selectedId,
      textData: finalTextData,
      imageData,
      strategy: 'full_render'
    }
    console.log('Payload:', payload)
    const r = await fetch('http://localhost:3001/api/render/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const d = await r.json()
    console.log('Response:', d)
    if (d.success) {
      setJobId(d.jobId)
      setStatus('Queued — After Effects is starting...')
      pollStatus(d.jobId)
    } else {
      setStatus('Error: ' + d.message)
    }
  }

  const textLayers = selectedId === 'kinetic_001' ? [] : (manifest?.layers?.filter(l => l.type === 'text') || [])
const imageLayers = selectedId === 'kinetic_001' ? [] : (manifest?.layers?.filter(l => l.type === 'image' && l.user_upload) || [])
const textMapKeys = manifest?.text_map ? Object.keys(manifest.text_map) : []

  const groupByScene = (layers) => {
    const groups = {}
    layers.forEach(l => {
      const s = l.scene || 1
      if (!groups[s]) groups[s] = []
      groups[s].push(l)
    })
    return groups
  }

  const s = { background: '#0d0d0d', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif', padding: '40px 20px' }
  const card = { background: '#141414', border: '1px solid #222', borderRadius: '10px', padding: '20px', marginBottom: '16px' }
  const label = { display: 'block', color: '#888', fontSize: '13px', marginBottom: '6px' }
  const inp = { width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: '6px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }
  const btn = { background: '#2563eb', border: 'none', color: '#fff', padding: '14px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', width: '100%', marginTop: '8px' }

  return (
    <div style={s}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '4px' }}>MotionAI</h1>
        <p style={{ color: '#666', marginBottom: '32px' }}>Cinematic Render Engine</p>

        {/* Template selector */}
        <div style={card}>
          <label style={label}>Select Template</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ ...inp, cursor: 'pointer' }}
          >
            <option value=''>-- Choose a template --</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* text_map style (dynamic_typography) */}
        {manifest && textMapKeys.length > 0 && (
          <div>
            {Object.entries(
              textMapKeys.reduce((acc, k) => {
                const m = k.match(/^scene(\d+)/)
                const s = m ? m[1] : '1'
                if (!acc[s]) acc[s] = []
                acc[s].push(k)
                return acc
              }, {})
            ).map(([scene, keys]) => (
              <div key={scene} style={card}>
                <div style={{ color: '#555', fontSize: '11px', fontWeight: 'bold', marginBottom: '14px', letterSpacing: '1px' }}>SCENE {scene}</div>
                {keys.map((k, i) => (
                  <div key={k} style={{ marginBottom: '12px' }}>
                    <label style={label}>Word {i + 1} ({manifest.text_map[k]}) <span style={{ color: '#444' }}>(Max 12 chars)</span></label>
                    <input type='text' value={textData[k] || ''} onChange={e => setTextData(p => ({ ...p, [k]: e.target.value }))} style={inp} placeholder='Enter text...' />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* layers style (history_timeline) */}
        {manifest && textLayers.length > 0 && (
          <div>
            {Object.entries(groupByScene(imageLayers.concat(textLayers))).map(([scene, layers]) => (
              <div key={scene} style={card}>
                <div style={{ color: '#555', fontSize: '11px', fontWeight: 'bold', marginBottom: '14px', letterSpacing: '1px' }}>SCENE {scene}</div>
                {layers.filter(l => l.type === 'image').map(layer => (
                  <div key={layer.name} style={{ marginBottom: '14px' }}>
                    <label style={label}>{layer.label}</label>
                    {imagePreviews[layer.name] && <img src={imagePreviews[layer.name]} alt='' style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }} />}
                    <input type='file' accept='image/png,image/jpeg' onChange={e => handleImageChange(e, layer.name)} style={{ color: '#666', fontSize: '13px' }} />
                  </div>
                ))}
                {layers.filter(l => l.type === 'text').map(layer => (
                  <div key={layer.name} style={{ marginBottom: '12px' }}>
                    <label style={label}>{layer.label} {layer.max_words && <span style={{ color: '#444' }}>({layer.max_words} words max)</span>}</label>
                    <input type='text' value={textData[layer.name] || ''} onChange={e => setTextData(p => ({ ...p, [layer.name]: e.target.value }))} style={inp} placeholder={layer.default_text || 'Enter text...'} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Status */}
        {status && (
          <div style={{ ...card, color: '#aaa', fontSize: '14px' }}>{status}</div>
        )}

        {/* Final video */}
        {finalUrl && (
          <div style={card}>
            <video src={`http://localhost:3001${finalUrl}`} controls style={{ width: '100%', borderRadius: '8px' }} />
            <a href={`http://localhost:3001${finalUrl}`} download style={{ ...btn, display: 'block', textAlign: 'center', marginTop: '12px', textDecoration: 'none' }}>Download</a>
          </div>
        )}

        {/* Kinetic typography — single textarea */}
        {selectedId === 'kinetic_001' && manifest && (
          <div style={card}>
            <label style={label}>Your Script</label>
            <textarea
              value={textData['__script__'] || ''}
              onChange={e => setTextData({ '__script__': e.target.value })}
              placeholder="Paste your full script here. Words will be split across scenes automatically."
              style={{ ...inp, minHeight: '160px', resize: 'vertical' }}
            />
          </div>
        )}

        {/* Render button */}
        {manifest && !finalUrl && (
          <button onClick={handleRender} style={btn}>Generate Video</button>
        )}
      </div>
    </div>
  )
}