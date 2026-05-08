function ProgressBar({ value }) {
  return (
    <div className="progress-track" aria-hidden="true">
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function RenderControls({
  templateLoaded,
  isSubmitting,
  status,
  progress,
  message,
  error,
  validationErrors,
  onStart,
  onRetry,
}) {
  const hasValidation = validationErrors?.length > 0
  const buttonText = error
    ? 'Retry render'
    : isSubmitting
    ? 'Queued...'
    : '▶ Start Render'

  return (
    <div className="render-panel">
      <div className="render-copy">
        <p className="render-label">Render status</p>
        <p className="render-message">{message || 'Fill required fields and queue the render.'}</p>
      </div>

      {templateLoaded && (
        <div className="render-progress-group">
          <ProgressBar value={progress} />
          <p className={`render-status-line ${error ? 'error' : ''}`}>
            {error || message}
          </p>
        </div>
      )}

      {hasValidation && (
        <p className="render-validation">
          Complete {validationErrors.length} required field{validationErrors.length > 1 ? 's' : ''} before rendering.
        </p>
      )}

      <button
        type="button"
        className={`render-button ${isSubmitting ? 'loading' : ''} ${error ? 'error' : ''}`}
        onClick={error ? onRetry : onStart}
        disabled={!templateLoaded || isSubmitting}
      >
        {buttonText}
      </button>
    </div>
  )
}

export default RenderControls
