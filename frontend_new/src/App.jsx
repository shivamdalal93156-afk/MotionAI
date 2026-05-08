import { useEffect, useMemo, useState } from 'react'
import TemplateBrowser from './TemplateBrowser.jsx'
import PreviewPanel from './PreviewPanel.jsx'
import FieldsEditor from './FieldsEditor.jsx'
import './App.css'

const BACKEND_BASE = 'http://localhost:3001'

const loadFieldValues = (templateId) => {
  if (!templateId) return {}
  try {
    const raw = window.localStorage.getItem(`motionai.fields.${templateId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const loadRenderedTemplateIds = () => {
  try {
    const stored = window.localStorage.getItem('motionai.renderedTemplates')
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveRenderedTemplate = (templateId, updateRendered) => {
  if (!templateId) return
  try {
    const stored = window.localStorage.getItem('motionai.renderedTemplates')
    const list = stored ? JSON.parse(stored) : []
    const ids = Array.isArray(list) ? Array.from(new Set([...list, templateId])) : [templateId]
    window.localStorage.setItem('motionai.renderedTemplates', JSON.stringify(ids))
    if (typeof updateRendered === 'function') {
      updateRendered(ids)
    }
  } catch {}
}

function App() {
  const [templates, setTemplates] = useState([])
  const [renderedTemplateIds, setRenderedTemplateIds] = useState(() => loadRenderedTemplateIds())
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    () => window.localStorage.getItem('motionai.selectedTemplateId') || '',
  )
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0)
  const [fieldValues, setFieldValues] = useState(() =>
    loadFieldValues(window.localStorage.getItem('motionai.selectedTemplateId')),
  )
  const [outputUrl, setOutputUrl] = useState(null)
  const [renderState, setRenderState] = useState('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderMessage, setRenderMessage] = useState('Ready to render')
  const [renderError, setRenderError] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobId, setJobId] = useState(null)

  useEffect(() => {
    if (!selectedTemplateId || templates.length === 0) return

    const selectedExists = templates.some((template) => template.id === selectedTemplateId)
    if (!selectedExists) {
      setSelectedTemplateId(templates[0]?.id || '')
      setSelectedSceneIndex(0)
    }
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (!selectedTemplateId) return
    window.localStorage.setItem('motionai.selectedTemplateId', selectedTemplateId)
    setFieldValues(loadFieldValues(selectedTemplateId))
    setSelectedSceneIndex(0)
    setOutputUrl(null)
    setRenderState('idle')
    setRenderProgress(0)
    setRenderMessage('Ready to render')
    setRenderError('')
    setValidationErrors([])
    setIsSubmitting(false)
    setJobId(null)
  }, [selectedTemplateId])

  useEffect(() => {
    if (!selectedTemplateId) return
    window.localStorage.setItem(`motionai.fields.${selectedTemplateId}`, JSON.stringify(fieldValues))
  }, [fieldValues, selectedTemplateId])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId],
  )

  const sceneCards = useMemo(() => {
    if (!selectedTemplate) return []

    const rawScenes = Object.entries(selectedTemplate.sceneMap || {}).map(([sceneId, scene]) => ({
      id: sceneId,
      ...scene,
    }))

    if (rawScenes.length > 0) {
      return rawScenes
        .sort((a, b) => (a.start || 0) - (b.start || 0))
        .map((scene, index) => ({
          ...scene,
          index,
          label: scene.name || `Scene ${index + 1}`,
          duration:
            typeof scene.duration === 'number'
              ? scene.duration
              : Math.max(3, (scene.end ?? scene.start ?? 0) - (scene.start ?? 0)),
          contentTags: [
            scene.hasText || selectedTemplate.textFields?.length ? 'text' : null,
            scene.hasImage || selectedTemplate.imageFields?.length ? 'image' : null,
          ].filter(Boolean),
        }))
    }

    return [
      {
        id: 'scene-main',
        index: 0,
        label: 'Scene 1',
        duration: selectedTemplate.duration ?? 12,
        contentTags: [
          selectedTemplate.textFields?.length ? 'text' : null,
          selectedTemplate.imageFields?.length ? 'image' : null,
        ].filter(Boolean),
      },
    ]
  }, [selectedTemplate])

  const handleSceneClick = (index) => {
    setSelectedSceneIndex(index)
  }

  const handleFieldChange = (fieldKey, value) => {
    setFieldValues((current) => ({
      ...current,
      [fieldKey]: value,
    }))
  }

  const validateFields = () => {
    if (!selectedTemplate) return []

    const missing = []
    const allFields = [...(selectedTemplate.textFields || []), ...(selectedTemplate.imageFields || [])]
    allFields.forEach((field) => {
      const value = fieldValues[field.key]
      if (!value || !String(value).trim()) {
        missing.push(field.key)
      }
    })
    return missing
  }

  const handleRenderResponse = async (response) => {
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = body?.message || 'Something went wrong. Our team has been notified. Try again.'
      throw new Error(message)
    }
    return body
  }

  const handleStartRender = async () => {
    if (!selectedTemplate) return

    const missing = validateFields()
    if (missing.length) {
      setValidationErrors(missing)
      setRenderMessage('Complete required fields before rendering.')
      setRenderError('')
      return
    }

    setValidationErrors([])
    setIsSubmitting(true)
    setRenderState('queued')
    setRenderProgress(12)
    setRenderMessage('Opening your template in After Effects...')
    setRenderError('')

    try {
      const response = await fetch(`${BACKEND_BASE}/api/render/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ template: selectedTemplateId, inputData: fieldValues }),
      })
      const data = await handleRenderResponse(response)
      setJobId(data.jobId)
      setRenderState('queued')
      setRenderProgress(18)
      setRenderMessage('Queued in the render engine. Monitoring progress...')
    } catch (error) {
      setRenderState('error')
      setRenderError(error.message)
      setRenderMessage('Something went wrong. Try again.')
      setIsSubmitting(false)
    }
  }

  const handleRetry = () => {
    setRenderError('')
    setRenderState('idle')
    setRenderProgress(0)
    setRenderMessage('Ready to render')
    setValidationErrors([])
    setIsSubmitting(false)
    setJobId(null)
    setOutputUrl(null)
  }

  useEffect(() => {
    if (!jobId) return

    let interval = null
    const mapErrorMessage = (reason) => {
      if (reason === 'AE_HEARTBEAT_TIMEOUT') return 'After Effects is taking longer than expected, retrying...'
      if (reason === 'FFMPEG_FAIL') return 'Compression failed, retrying...'
      return 'Something went wrong. Our team has been notified. Try again.'
    }

    const pollJob = async () => {
      try {
        const response = await fetch(`${BACKEND_BASE}/api/jobs/${jobId}`)
        if (!response.ok) {
          throw new Error('Unable to reach render status endpoint.')
        }
        const job = await response.json()

        if (job.status === 'pending') {
          setRenderState('queued')
          setRenderProgress(18)
          setRenderMessage('Opening your template in After Effects...')
          setRenderError('')
          return
        }

        if (job.status === 'lock') {
          setRenderState('rendering')
          setRenderProgress(45)
          setRenderMessage('Rendering frames in After Effects...')
          setRenderError('')
          return
        }

        if (job.status === 'retry_scheduled') {
          setRenderState('retry_scheduled')
          setRenderProgress(75)
          setRenderMessage('After Effects is retrying the render. Please wait...')
          setRenderError('')
          return
        }

        if (job.status === 'done') {
          clearInterval(interval)
          setRenderState('done')
          setRenderProgress(100)
          setRenderMessage('Done — your video is ready')
          setRenderError('')
          const output = job.outputUrl ? `${BACKEND_BASE}${job.outputUrl}` : `${BACKEND_BASE}/outputs/${job.jobId}.mp4`
          setOutputUrl(output)
          saveRenderedTemplate(selectedTemplateId, setRenderedTemplateIds)
          setIsSubmitting(false)
          return
        }

        if (job.status === 'error') {
          clearInterval(interval)
          setRenderState('error')
          setRenderProgress(0)
          setRenderMessage(mapErrorMessage(job.errorReason))
          setRenderError(mapErrorMessage(job.errorReason))
          setIsSubmitting(false)
          return
        }
      } catch (error) {
        clearInterval(interval)
        setRenderState('error')
        setRenderProgress(0)
        setRenderMessage('Unable to update render progress at this time.')
        setRenderError(error.message)
        setIsSubmitting(false)
      }
    }

    pollJob()
    interval = setInterval(pollJob, 3000)
    return () => clearInterval(interval)
  }, [jobId, selectedTemplateId])

  return (
    <div className="app-shell">
      <TemplateBrowser
        selectedTemplateId={selectedTemplateId}
        onSelect={setSelectedTemplateId}
        onTemplatesLoaded={setTemplates}
        renderedTemplateIds={renderedTemplateIds}
      />

      <PreviewPanel
        template={selectedTemplate}
        sceneCards={sceneCards}
        selectedSceneIndex={selectedSceneIndex}
        onSceneSelect={handleSceneClick}
        outputUrl={outputUrl}
        status={renderState === 'done' ? 'Render complete' : renderMessage}
      />

      <FieldsEditor
        template={selectedTemplate}
        selectedSceneIndex={selectedSceneIndex}
        fieldValues={fieldValues}
        onFieldChange={handleFieldChange}
        renderStatus={renderState}
        renderProgress={renderProgress}
        renderMessage={renderMessage}
        renderError={renderError}
        validationErrors={validationErrors}
        isSubmitting={isSubmitting}
        onStartRender={handleStartRender}
        onRetry={handleRetry}
      />
    </div>
  )
}

export default App
