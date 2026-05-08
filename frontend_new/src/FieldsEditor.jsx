import { useEffect, useMemo, useState } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import CropModal from './CropModal.jsx'
import RenderControls from './RenderControls.jsx'

const humanizeLabel = (field) => {
  if (!field) return ''
  return field
    .replace(/[_\-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b(id|img|bg|hdr)\b/gi, (match) => match.toUpperCase())
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
}

function TextField({ fieldKey, value, label, helper, onChange, error }) {
  return (
    <div className="field-row">
      <label htmlFor={fieldKey} className="field-label">
        {label}
      </label>
      <input
        id={fieldKey}
        type="text"
        value={value || ''}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        placeholder={`Enter ${label.toLowerCase()}`}
        className={error ? 'field-input-error' : ''}
      />
      <p className={`field-helper ${error ? 'field-error' : ''}`}>
        {error ? 'This field is required' : helper}
      </p>
    </div>
  )
}

function ImageField({ fieldKey, value, label, helper, onChooseImage, error }) {
  const [preview, setPreview] = useState(value || '')

  useEffect(() => {
    setPreview(value || '')
  }, [value])

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      onChooseImage(fieldKey, dataUrl)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="field-row field-row-image">
      <div className="field-row-heading">
        <label className="field-label">{label}</label>
        <span className={`field-helper ${error ? 'field-error' : ''}`}>{error ? 'This image is required' : helper}</span>
      </div>
      <label className={`image-uploader ${error ? 'field-input-error' : ''}`}>
        <div className="image-preview-frame">
          {preview ? (
            <img src={preview} alt={label} />
          ) : (
            <div className="image-placeholder">
              <Upload size={18} />
              <p>Upload image</p>
            </div>
          )}
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          hidden
        />
      </label>
    </div>
  )
}

function SceneFieldGroup({ sceneIndex, textFields, imageFields, values, onFieldChange, validationErrors }) {
  if (!textFields.length && !imageFields.length) {
    return (
      <div className="empty-state-card">
        <p className="secondary">No editable fields were detected for this scene.</p>
      </div>
    )
  }

  return (
    <div className="field-card">
      <div className="field-card-header">
        <div>
          <p className="eyebrow">Scene {sceneIndex + 1}</p>
          <h3>{textFields.length + imageFields.length ? 'Editable fields' : 'Scene details'}</h3>
        </div>
      </div>

      <div className="field-card-body">
        {textFields.map((field) => (
          <TextField
            key={field.key}
            fieldKey={field.key}
            label={field.label || humanizeLabel(field.key)}
            helper={field.maxLength ? `${field.maxLength} character limit` : 'Full name or headline text'}
            value={values[field.key] || ''}
            onChange={onFieldChange}
            error={validationErrors.includes(field.key)}
          />
        ))}

        {imageFields.map((field) => (
          <ImageField
            key={field.key}
            fieldKey={field.key}
            label={field.label || humanizeLabel(field.key)}
            helper={`Required ratio ${field.ratio || '16:9'}`}
            value={values[field.key] || ''}
            onChooseImage={onFieldChange}
            error={validationErrors.includes(field.key)}
          />
        ))}
      </div>
    </div>
  )
}

function FieldsEditor({
  template,
  selectedSceneIndex,
  fieldValues,
  onFieldChange,
  renderStatus,
  renderProgress,
  renderMessage,
  renderError,
  validationErrors,
  isSubmitting,
  onStartRender,
  onRetry,
}) {
  const [cropState, setCropState] = useState({ open: false, fieldKey: null, imageSrc: '', ratio: '16:9' })

  const sceneFields = useMemo(() => {
    if (!template) return { textFields: [], imageFields: [] }

    const scenes = Object.keys(template.sceneMap || {})
    const sceneCount = Math.max(1, scenes.length)

    if (sceneCount === 1) {
      // Single scene - show all fields
      return {
        textFields: template.textFields || [],
        imageFields: template.imageFields || [],
      }
    }

    // Multi-scene: distribute fields evenly across scenes
    const textFields = (template.textFields || []).filter((_, index) => {
      return Math.floor(index / sceneCount) === selectedSceneIndex
    })
    const imageFields = (template.imageFields || []).filter((_, index) => {
      return Math.floor(index / sceneCount) === selectedSceneIndex
    })

    return { textFields, imageFields }
  }, [selectedSceneIndex, template])

  const handleImageSelect = (key, dataUrl) => {
    const field = template?.imageFields?.find((field) => field.key === key)
    setCropState({
      open: true,
      fieldKey: key,
      imageSrc: dataUrl,
      ratio: field?.ratio || '16:9',
    })
  }

  const handleCropConfirm = (croppedUrl) => {
    if (cropState.fieldKey) {
      onFieldChange(cropState.fieldKey, croppedUrl)
    }
    setCropState({ open: false, fieldKey: null, imageSrc: '', ratio: '16:9' })
  }

  return (
    <aside className="panel right-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Fields editor</p>
          <h2>{template ? `Scene ${selectedSceneIndex + 1}` : 'No scene selected'}</h2>
        </div>
      </div>

      <div className="right-body">
        {template ? (
          <SceneFieldGroup
            sceneIndex={selectedSceneIndex}
            textFields={sceneFields.textFields}
            imageFields={sceneFields.imageFields}
            values={fieldValues}
            onFieldChange={(fieldKey, value) => {
              if (fieldKey && typeof value === 'string' && value.startsWith('data:image/')) {
                handleImageSelect(fieldKey, value)
              } else {
                onFieldChange(fieldKey, value)
              }
            }}
            validationErrors={validationErrors}
          />
        ) : (
          <div className="empty-state-card">
            <p className="secondary">
              Select a scene from the timeline to edit its text and image fields.
            </p>
          </div>
        )}
      </div>

      <RenderControls
        templateLoaded={Boolean(template)}
        isSubmitting={isSubmitting}
        status={renderStatus}
        progress={renderProgress}
        message={renderMessage}
        error={renderError}
        validationErrors={validationErrors}
        onStart={onStartRender}
        onRetry={onRetry}
      />

      <CropModal
        open={cropState.open}
        imageSrc={cropState.imageSrc}
        ratio={cropState.ratio}
        onConfirm={handleCropConfirm}
        onClose={() => setCropState({ open: false, fieldKey: null, imageSrc: '', ratio: '16:9' })}
      />
    </aside>
  )
}

export default FieldsEditor
