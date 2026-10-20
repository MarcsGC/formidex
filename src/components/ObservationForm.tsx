import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { deleteObservation, saveObservation, type PhotoItem } from '../data'
import { db } from '../db'
import { formatDateTime, fromLocalInputValue, normalizeTaxon, toLocalInputValue } from '../model'
import { processPhoto } from '../photos'
import { LocationPicker, type PickedLocation } from './LocationPicker'
import { PhotoThumb } from './PhotoThumb'
import { PhotoViewer } from './PhotoViewer'
import { TaxonFields } from './TaxonFields'

export type FormTarget = { mode: 'new'; preset?: { lat: number; lng: number } } | { mode: 'edit'; id: string }

interface ObservationFormProps {
  target: FormTarget
  onClose: () => void
  onSaved: (id: string) => void
}

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function ObservationForm({ target, onClose, onSaved }: ObservationFormProps) {
  const editingId = target.mode === 'edit' ? target.id : undefined
  const preset = target.mode === 'new' ? target.preset : undefined

  const [loading, setLoading] = useState(Boolean(editingId))
  const [items, setItems] = useState<PhotoItem[]>([])
  const [location, setLocation] = useState<PickedLocation | null>(preset ? { ...preset, source: 'map' } : null)
  const [photoLocation, setPhotoLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [genus, setGenus] = useState('')
  const [species, setSpecies] = useState('')
  const [observedAt, setObservedAt] = useState(() => toLocalInputValue(new Date().toISOString()))
  const [notes, setNotes] = useState('')
  const [processing, setProcessing] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ createdAt: string; pending: boolean } | null>(null)
  const [viewing, setViewing] = useState<PhotoItem | null>(null)
  const changed = useRef(false)
  const locationChosen = useRef(Boolean(preset))
  const dateChosen = useRef(false)

  useEffect(() => {
    if (!editingId) return
    let cancelled = false
    void db.observations.get(editingId).then((o) => {
      if (cancelled) return
      if (!o || o.deleted) {
        setError('Este registro ya no existe. Puede que se borrara desde otro dispositivo.')
        return
      }
      setItems(o.photos.map((ref) => ({ kind: 'existing', ref })))
      setLocation({ lat: o.lat, lng: o.lng, source: o.locationSource })
      setGenus(o.genus ?? '')
      setSpecies(o.species ?? '')
      setObservedAt(toLocalInputValue(o.observedAt))
      setNotes(o.notes ?? '')
      setMeta({ createdAt: o.createdAt, pending: o.dirty === 1 })
      locationChosen.current = true
      dateChosen.current = true
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [editingId])

  function close() {
    if (changed.current && !window.confirm('¿Salir sin guardar los cambios?')) return
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !viewing) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    changed.current = true
    setError(null)
    for (const file of files) {
      setProcessing((n) => n + 1)
      try {
        const photo = await processPhoto(file)
        setItems((prev) => [...prev, { kind: 'new', photo }])
        const { lat, lng, takenAt } = photo.exif
        if (lat !== undefined && lng !== undefined) {
          setPhotoLocation((prev) => prev ?? { lat, lng })
          if (!locationChosen.current) {
            locationChosen.current = true
            setLocation({ lat, lng, source: 'exif' })
          }
        }
        if (takenAt && !dateChosen.current) {
          dateChosen.current = true
          setObservedAt(toLocalInputValue(takenAt))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setProcessing((n) => n - 1)
      }
    }
  }

  function removeItem(index: number) {
    changed.current = true
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    if (!location) {
      setError('Falta la ubicación: toca el mapa, usa «Mi ubicación» o la de la foto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await saveObservation(
        editingId,
        {
          lat: location.lat,
          lng: location.lng,
          locationSource: location.source,
          observedAt: fromLocalInputValue(observedAt) ?? new Date().toISOString(),
          ...normalizeTaxon(genus, species),
          notes,
        },
        items,
      )
      changed.current = false
      onSaved(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  async function remove() {
    if (!editingId || !window.confirm('¿Borrar este registro y sus fotos? También se borrará de Google Drive.')) return
    await deleteObservation(editingId)
    changed.current = false
    onClose()
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="form-title">
        <header className="sheet-header">
          <button type="button" className="link-button" onClick={close}>
            Cancelar
          </button>
          <h2 id="form-title">{editingId ? 'Editar registro' : 'Nuevo registro'}</h2>
          <button type="button" className="button button-small" onClick={save} disabled={saving || processing > 0 || loading}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </header>

        {loading ? (
          <div className="sheet-body sheet-loading">
            {error ? <p className="form-error">{error}</p> : <span className="spinner spinner-large" />}
          </div>
        ) : (
          <div className="sheet-body">
            <section className="form-section">
              <h3>Fotos</h3>
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
              <p className="hint">Si la foto guarda dónde y cuándo se hizo, se rellenan solos la ubicación y la fecha.</p>
            </section>

            <section className="form-section">
              <h3>Ubicación</h3>
              <LocationPicker
                value={location}
                photoLocation={photoLocation}
                onChange={(next) => {
                  changed.current = true
                  locationChosen.current = true
                  setLocation(next)
                }}
              />
            </section>

            <section className="form-section">
              <h3>Identificación</h3>
              <TaxonFields
                genus={genus}
                species={species}
                onChange={(g, s) => {
                  changed.current = true
                  setGenus(g)
                  setSpecies(s)
                }}
              />
              <p className="hint">Puedes dejarlo vacío o poner solo el género y completarlo más adelante.</p>
            </section>

            <section className="form-section">
              <h3>Detalles</h3>
              <label className="field">
                <span className="field-label">Fecha y hora</span>
                <input
                  type="datetime-local"
                  value={observedAt}
                  onChange={(e) => {
                    changed.current = true
                    dateChosen.current = true
                    setObservedAt(e.target.value)
                  }}
                />
              </label>
              <label className="field">
                <span className="field-label">Notas</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => {
                    changed.current = true
                    setNotes(e.target.value)
                  }}
                  placeholder="Hábitat, comportamiento, castas vistas, tiempo…"
                />
              </label>
            </section>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            {editingId && (
              <section className="form-section form-footer">
                {meta && (
                  <p className="muted">
                    Creado el {formatDateTime(meta.createdAt)} · {meta.pending ? 'pendiente de subir a Drive' : 'guardado en Drive'}
                  </p>
                )}
                <button type="button" className="button button-danger" onClick={remove}>
                  Borrar registro
                </button>
              </section>
            )}
          </div>
        )}
      </div>

      {viewing && (
        <PhotoViewer
          blob={viewing.kind === 'new' ? viewing.photo.full : undefined}
          photoId={viewing.kind === 'existing' ? viewing.ref.id : undefined}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
