import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useObjectUrl } from './useObjectUrl'

interface PhotoThumbProps {
  photoId?: string
  /** Blob ya en memoria (fotos nuevas que aún no se han guardado). */
  blob?: Blob
  alt?: string
  className?: string
}

export function PhotoThumb({ photoId, blob, alt = '', className = '' }: PhotoThumbProps) {
  const stored = useLiveQuery(() => (photoId && !blob ? db.photos.get(photoId) : undefined), [photoId, blob])
  const url = useObjectUrl(blob ?? stored?.thumb ?? stored?.full)
  if (!url) {
    return (
      <div className={`thumb thumb-empty ${className}`} aria-label={alt || 'Sin foto'}>
        <span aria-hidden="true">🐜</span>
      </div>
    )
  }
  return <img className={`thumb ${className}`} src={url} alt={alt} loading="lazy" decoding="async" />
}
