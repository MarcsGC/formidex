import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { formatDate, isIdentified, taxonLabel } from '../model'
import { PhotoThumb } from './PhotoThumb'

interface ObservationListProps {
  onEdit: (id: string) => void
  onShowOnMap: (id: string) => void
  onNew: () => void
}

export function ObservationList({ onEdit, onShowOnMap, onNew }: ObservationListProps) {
  const observations = useLiveQuery(
    () => db.observations.orderBy('observedAt').reverse().filter((o) => !o.deleted).toArray(),
    [],
  )
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!observations || !q) return observations ?? []
    return observations.filter((o) => `${taxonLabel(o)} ${o.notes ?? ''}`.toLowerCase().includes(q))
  }, [observations, query])

  const stats = useMemo(() => {
    const list = observations ?? []
    const genera = new Set(list.filter((o) => o.genus).map((o) => o.genus))
    const species = new Set(list.filter((o) => o.genus && o.species).map((o) => `${o.genus} ${o.species}`))
    return { total: list.length, genera: genera.size, species: species.size, unknown: list.filter((o) => !o.genus).length }
  }, [observations])

  if (!observations) return <div className="page page-center"><span className="spinner spinner-large" /></div>

  return (
    <div className="page">
      <div className="list-header">
        <p className="stats">
          {stats.total} {stats.total === 1 ? 'registro' : 'registros'} · {stats.genera} {stats.genera === 1 ? 'género' : 'géneros'} ·{' '}
          {stats.species} {stats.species === 1 ? 'especie' : 'especies'}
          {stats.unknown > 0 && ` · ${stats.unknown} sin identificar`}
        </p>
        <input
          type="search"
          className="search"
          placeholder="Buscar por género, especie o notas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {observations.length === 0 ? (
        <div className="empty">
          <p>Aún no hay registros.</p>
          <button type="button" className="button" onClick={onNew}>
            Crear el primero
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="empty">Nada coincide con «{query}».</p>
      ) : (
        <ul className="cards">
          {filtered.map((o) => (
            <li key={o.id} className="card">
              <button type="button" className="card-main" onClick={() => onEdit(o.id)}>
                <PhotoThumb photoId={o.photos[0]?.id} className="card-photo" alt={taxonLabel(o)} />
                <span className="card-text">
                  <span className={`card-title ${isIdentified(o) ? 'taxon' : 'muted'}`}>{taxonLabel(o)}</span>
                  <span className="card-meta">
                    {formatDate(o.observedAt)}
                    {o.photos.length > 1 && ` · ${o.photos.length} fotos`}
                    {o.dirty === 1 && <span className="badge">Pendiente</span>}
                  </span>
                  {o.notes && <span className="card-notes">{o.notes}</span>}
                </span>
              </button>
              <button type="button" className="card-map" onClick={() => onShowOnMap(o.id)} aria-label="Ver en el mapa">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
