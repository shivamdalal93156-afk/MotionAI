import { useEffect, useMemo, useState } from 'react'
import { Search, ImageIcon, FileText, MapPin, Layers } from 'lucide-react'

const typeLabels = {
  slideshow: 'Slideshow',
  typography: 'Typography',
  investigation: 'Investigation',
  map: 'Map',
  general: 'Template',
}

const typeIconMap = {
  slideshow: ImageIcon,
  typography: FileText,
  investigation: Layers,
  map: MapPin,
  general: ImageIcon,
}

const inferTemplateType = (template) => {
  const name = `${template.compName || template.id}`.toLowerCase()
  if (name.includes('slideshow')) return 'slideshow'
  if (name.includes('typography')) return 'typography'
  if (name.includes('investigation') || name.includes('detective')) return 'investigation'
  if (name.includes('map')) return 'map'
  return 'general'
}

function TemplateBrowser({ selectedTemplateId, onSelect, onTemplatesLoaded, renderedTemplateIds = [] }) {
  const [templates, setTemplates] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')

  const renderedIds = useMemo(() => renderedTemplateIds, [renderedTemplateIds])

  useEffect(() => {
    const url = 'http://localhost:3001/api/render/templates'
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load templates')
        }
        return response.json()
      })
      .then((data) => {
        const items = Array.isArray(data.templates) ? data.templates : []
        setTemplates(items)
        onTemplatesLoaded(items)
        if (items.length && !selectedTemplateId) {
          onSelect(items[0].id)
        }
        setStatus('ready')
      })
      .catch(() => {
        setErrorMessage('Unable to load templates from the render service.')
        setStatus('error')
      })
  }, [onSelect, onTemplatesLoaded, selectedTemplateId])

  const filteredTemplates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return templates
    return templates.filter((template) => {
      const title = `${template.compName || template.id}`.toLowerCase()
      const id = template.id.toLowerCase()
      return title.includes(query) || id.includes(query)
    })
  }, [searchTerm, templates])

  return (
    <section className="panel browser-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Templates</p>
          <h2>Template browser</h2>
        </div>
      </div>

      <div className="panel-body">
        <div className="browser-search">
          <Search size={16} />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search templates by name"
            aria-label="Search templates"
          />
        </div>

        {status === 'loading' && (
          <div className="empty-state-card">
            <p className="secondary">Loading available templates from the render engine...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="empty-state-card">
            <p className="secondary">{errorMessage}</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="template-list">
            {filteredTemplates.length === 0 ? (
              <div className="empty-state-card">
                <p className="secondary">No templates match your search. Try a different keyword.</p>
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const templateType = inferTemplateType(template)
                const TypeIcon = typeIconMap[templateType] || ImageIcon
                const isSelected = template.id === selectedTemplateId
                const rendered = renderedIds.includes(template.id)

                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`template-card ${isSelected ? 'active' : ''}`}
                    onClick={() => onSelect(template.id)}
                  >
                    <div className="template-thumb">
                      <TypeIcon size={20} />
                    </div>
                    <div className="template-body">
                      <span className="template-headline">{template.compName || template.id}</span>
                      <span className="template-subline">
                        {typeLabels[templateType]} · {template.textFields?.length ?? 0} text ·{' '}
                        {template.imageFields?.length ?? 0} image
                      </span>
                    </div>
                    <div className="template-meta">
                      <span className="template-type">{typeLabels[templateType]}</span>
                      <span className={`rendered-dot ${rendered ? '' : 'inactive'}`} />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default TemplateBrowser
