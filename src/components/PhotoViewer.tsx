import { useEffect, useState } from 'react'
import { loadFullPhoto } from '../sync/controller'
import { useObjectUrl } from './useObjectUrl'

interface PhotoViewerProps {
  /** Foto nueva aún sin guardar. */
  blob?: Blob
  /** Foto guardada: se busca la grande en el dispositivo o en Drive. */
  photoId?: string
  onClose: () => void
}

export function PhotoViewer({ blob, photoId, onClose }: PhotoViewerProps) {
  const [loaded, setLoaded] = useState<Blob | undefined>(blob)
  const [loading, setLoading] = useState(!blob)
  const url = useObjectUrl(loaded)

  useEffect(() => {
    if (blob || !photoId) return
    let cancelled = false
    void loadFullPhoto(photoId).then((result) => {
      if (cancelled) return
      setLoaded(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [blob, photoId])

  // Escape cierra solo el visor, no el formulario que hay debajo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose}>
      {loading && <span className="spinner spinner-large" />}
      {!loading && url && <img src={url} alt="" onClick={(e) => e.stopPropagation()} />}
      {!loading && !url && <p className="viewer-message">Esta foto aún no está en este dispositivo. Conecta Google Drive para verla.</p>}
      <button type="button" className="viewer-close" onClick={onClose} aria-label="Cerrar">
        ×
      </button>
    </div>
  )
}
