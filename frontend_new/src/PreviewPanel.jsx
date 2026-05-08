function VideoPreview({ template, outputUrl, status }) {
  return (
    <div className="preview-card">
      {template ? (
        outputUrl ? (
          <div className="preview-player-wrapper">
            <video
              className="video-player"
              controls
              src={outputUrl}
              poster=""
              aria-label="Rendered preview"
            />
            <div className="preview-actions">
              <a className="download-button" href={outputUrl} download>
                Download rendered video
              </a>
            </div>
          </div>
        ) : (
          <div className="preview-placeholder">
            <div className="preview-thumb">
              <div className="preview-thumb-label">{template.compName}</div>
            </div>
            <div className="preview-copy">
              <p className="secondary">
                Preview will update here when rendering completes.
              </p>
              <span className="preview-status">{status || 'Template ready to render'}</span>
            </div>
          </div>
        )
      ) : (
        <div className="preview-empty">
          <p className="secondary">
            Waiting for your first template selection. The preview and timeline
            will appear here.
          </p>
        </div>
      )}
    </div>
  )
}

function SceneTimeline({ scenes, activeIndex, onSelect }) {
  return (
    <div className="timeline-panel">
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Scene timeline</p>
          <h3>Timeline overview</h3>
        </div>
        <span className="timeline-meta">
          {scenes.length ? `${scenes.length} scenes` : 'No scenes available'}
        </span>
      </div>

      <div className="scene-list">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            className={`scene-card ${scene.index === activeIndex ? 'active' : ''}`}
            onClick={() => onSelect(scene.index)}
          >
            <div className="scene-summary">
              <span className="scene-index">Scene {scene.index + 1}</span>
              <span className="scene-title">{scene.label}</span>
            </div>
            <div className="scene-meta">
              <span>{scene.duration}s</span>
              <div className="scene-icons">
                {scene.contentTags.includes('text') && <span className="scene-tag">T</span>}
                {scene.contentTags.includes('image') && <span className="scene-tag">IMG</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function PreviewPanel({ template, sceneCards, selectedSceneIndex, onSceneSelect, outputUrl, status }) {
  return (
    <section className="panel center-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{template ? template.compName : 'Select a template to begin'}</h2>
        </div>
        <span className={`status-badge ${template ? 'status-ready' : 'status-idle'}`}>
          {template ? 'Ready to edit' : 'Waiting for template'}
        </span>
      </div>

      <VideoPreview template={template} outputUrl={outputUrl} status={status} />
      <SceneTimeline scenes={sceneCards} activeIndex={selectedSceneIndex} onSelect={onSceneSelect} />
    </section>
  )
}

export default PreviewPanel
