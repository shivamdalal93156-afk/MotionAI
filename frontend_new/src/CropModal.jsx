import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

const parseRatio = (ratio) => {
  const [width, height] = `${ratio}`.split(':').map(Number)
  return width > 0 && height > 0 ? width / height : 16 / 9
}

function CropModal({ open, imageSrc, ratio = '16:9', onConfirm, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState(null)
  const frameRef = useRef(null)
  const aspectRatio = useMemo(() => parseRatio(ratio), [ratio])

  useEffect(() => {
    if (!open) return
    setZoom(1)
    setDrag({ x: 0, y: 0 })
    setDragStart(null)
  }, [open, imageSrc])

  const handlePointerDown = (event) => {
    event.preventDefault()
    setDragStart({ x: event.clientX, y: event.clientY, origin: drag })
  }

  const handlePointerMove = (event) => {
    if (!dragStart) return
    event.preventDefault()
    setDrag({
      x: dragStart.origin.x + (event.clientX - dragStart.x),
      y: dragStart.origin.y + (event.clientY - dragStart.y),
    })
  }

  const handlePointerUp = () => {
    setDragStart(null)
  }

  const handleWheel = (event) => {
    event.preventDefault()
    setZoom((current) => Math.max(1, Math.min(3, current + (event.deltaY > 0 ? -0.1 : 0.1))))
  }

  const handleConfirm = async () => {
    if (!frameRef.current) return

    const frame = frameRef.current
    const img = frame.querySelector('.crop-image')
    if (!img) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // Get frame dimensions
    const frameRect = frame.getBoundingClientRect()
    const frameWidth = frameRect.width
    const frameHeight = frameRect.height

    // Set canvas size to frame size
    canvas.width = frameWidth
    canvas.height = frameHeight

    // Calculate the visible portion of the image
    const imgRect = img.getBoundingClientRect()
    const scaleX = img.naturalWidth / imgRect.width
    const scaleY = img.naturalHeight / imgRect.height

    // Calculate crop coordinates relative to the image
    const cropX = (frameRect.left - imgRect.left) * scaleX
    const cropY = (frameRect.top - imgRect.top) * scaleY
    const cropWidth = frameWidth * scaleX
    const cropHeight = frameHeight * scaleY

    // Draw the cropped portion
    ctx.drawImage(
      img,
      cropX, cropY, cropWidth, cropHeight, // source rectangle
      0, 0, frameWidth, frameHeight // destination rectangle
    )

    // Convert to data URL
    const croppedDataUrl = canvas.toDataURL('image/png')
    onConfirm(croppedDataUrl)
  }

  if (!open) return null

  return (
    <div className="crop-modal-backdrop" onClick={onClose}>
      <div className="crop-modal" onClick={(event) => event.stopPropagation()}>
        <div className="crop-modal-header">
          <div>
            <p className="eyebrow">Image crop</p>
            <h2>Adjust and confirm</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close crop modal">
            <X size={16} />
          </button>
        </div>

        <div
          className="crop-frame"
          ref={frameRef}
          style={{ aspectRatio }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          <img
            src={imageSrc}
            alt="Crop preview"
            className="crop-image"
            style={{ transform: `translate(${drag.x}px, ${drag.y}px) scale(${zoom})` }}
          />
          <div className="crop-overlay" />
        </div>

        <div className="crop-controls">
          <div className="crop-zoom">
            <button type="button" className="icon-button" onClick={() => setZoom((z) => Math.max(1, z - 0.1))}>
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <button type="button" className="icon-button" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
              <ZoomIn size={16} />
            </button>
          </div>
          <p className="field-helper">Drag to reposition, scroll to zoom. Aspect ratio locked to {ratio}.</p>
        </div>

        <div className="crop-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={handleConfirm}>
            Confirm crop
          </button>
        </div>
      </div>
    </div>
  )
}

export default CropModal
