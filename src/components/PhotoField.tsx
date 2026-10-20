import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import type { PhotoItem } from '../data'
import { processPhoto, type ProcessedPhoto } from '../photos'
import { PhotoThumb } from './PhotoThumb'
import { PhotoViewer } from './PhotoViewer'

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

interface PhotoFieldProps {
  items: PhotoItem[]
  setItems: Dispatch<SetStateAction<PhotoItem[]>>
  /** Cada foto nueva ya preparada, por ejemplo para leer su GPS. */
  onAdded?: (photo: ProcessedPhoto) => void
  onChanged: () => void
  onError: (message: string | null) => void
  /** Mientras se preparan fotos no se puede guardar. */
  onBusyChange: (busy: boolean) => void
}

export function PhotoField({ items, setItems, onAdded, onChanged, onError, onBusyChange }: PhotoFieldProps) {
  const [processing, setProcessing] = useState(0)
  const [viewing, setViewing] = useState<PhotoItem | null>(null)
  const busy = useRef(0)

  function track(delta: number) {
    busy.current += delta
    setProcessing(busy.current)
    onBusyChange(busy.current > 0)
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    onChanged()
    onError(null)
    for (const file of files) {
      track(1)
      try {
        const photo = await processPhoto(file)
        setItems((prev) => [...prev, { kind: 'new', photo }])
        onAdded?.(photo)
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e))
      } finally {
        track(-1)
      }
    }
  }

  function removeItem(index: number) {
    onChanged()
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <>
      <div className="photo-grid">
        {items.map((item, index) => (
          <div className="photo-cell" key={item.kind === 'existing' ? item.ref.id : item.photo.id}>
            <button type="button" className="photo-open" onClick={() => setViewing(item)} aria-label="Ver foto">
              {item.kind === 'existing' ? <PhotoThumb photoId={item.ref.id} /> : <PhotoThumb blob={item.photo.thumb} />}
            </button>
            <button type="button" className="photo-remove" onClick={() => removeItem(index)} aria-label="Quitar foto">
              ×
            </button>
          </div>
        ))}
        {processing > 0 && (
          <div className="photo-cell photo-processing" aria-label="Preparando foto">
            <span className="spinner" />
          </div>
        )}
        {isTouchDevice && (
          <label className="photo-add">
            <span aria-hidden="true">📷</span>
            <span>Hacer foto</span>
            <input type="file" accept="image/*" capture="environment" onChange={addFiles} hidden />
          </label>
        )}
        <label className="photo-add">
          <span aria-hidden="true">🖼️</span>
          <span>{isTouchDevice ? 'Galería' : 'Añadir fotos'}</span>
          <input type="file" accept="image/*" multiple onChange={addFiles} hidden />
        </label>
      </div>

      {viewing && (
        <PhotoViewer
          blob={viewing.kind === 'new' ? viewing.photo.full : undefined}
          photoId={viewing.kind === 'existing' ? viewing.ref.id : undefined}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}
