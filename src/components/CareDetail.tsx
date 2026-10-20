import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import {
  AMOUNT_LABELS,
  describeDiapause,
  describeDiapauseStatus,
  diapauseStatus,
  findTaxonSheet,
  formatAge,
  formatPlainDate,
  FOUNDING_LABELS,
  LEVEL_LABELS,
  LIKING_LABELS,
  parentsOf,
  QUEENS_LABELS,
  resolveCare,
  sheetTitle,
  sourceLabel,
  type CareSheet,
  type ResolvedFood,
} from '../care'
import { db } from '../db'
import { formatDateTime, isIdentified, taxonLabel } from '../model'
import type { CareFormTarget } from './CareForm'
import { Chevron, ColonyRow } from './CareRows'
import { PhotoThumb } from './PhotoThumb'
import { PhotoViewer } from './PhotoViewer'

interface CareDetailProps {
  id: string
  onBack: () => void
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onNew: (target: CareFormTarget) => void
}

export function CareDetail({ id, onBack, onOpen, onEdit, onNew }: CareDetailProps) {
  const sheets = useLiveQuery(() => db.sheets.filter((s) => !s.deleted).toArray(), [])
  const [viewing, setViewing] = useState<string | null>(null)

  if (!sheets) {
    return (
      <div className="page page-center">
        <span className="spinner spinner-large" />
      </div>
    )
  }

  const sheet = sheets.find((s) => s.id === id)
  if (!sheet) {
    return (
      <div className="page">
        <BackButton onBack={onBack} />
        <p className="empty">Esta ficha ya no existe. Puede que se borrara desde otro dispositivo.</p>
      </div>
    )
  }

  const parents = parentsOf(sheet, sheets)
  const care = resolveCare([sheet, ...parents])
  const status = sheet.archived ? null : diapauseStatus(care.diapause?.value)
  const heirs = sheets.filter((s) => s.id !== sheet.id && parentsOf(s, sheets).some((p) => p.id === sheet.id))
  const source = (from: CareSheet) => (from.id === sheet.id ? null : <SourceTag from={from} onOpen={onOpen} />)

  const careFacts = [
    care.escape && { label: 'Capacidad de escape', value: AMOUNT_LABELS[care.escape.value], from: care.escape.from },
    care.temperature && { label: 'Temperatura', value: care.temperature.value, from: care.temperature.from },
    care.humidity && { label: 'Humedad', value: AMOUNT_LABELS[care.humidity.value], from: care.humidity.from },
    care.nest && { label: 'Nido', value: care.nest.value, from: care.nest.from },
  ].filter((f) => !!f)
  const biologyFacts = [
    care.queenSize && { label: 'Tamaño de la reina', value: care.queenSize.value, from: care.queenSize.from },
    care.workerSize && { label: 'Tamaño de las obreras', value: care.workerSize.value, from: care.workerSize.from },
    care.founding && { label: 'Fundación', value: FOUNDING_LABELS[care.founding.value], from: care.founding.from },
    care.queens && { label: 'Reinas', value: QUEENS_LABELS[care.queens.value], from: care.queens.from },
  ].filter((f) => !!f)
  const inheritedNotes = parents.filter((p) => p.notes)
  const hasFood = care.carbs.length + care.proteins.length > 0
  const isEmpty = !care.diapause && !hasFood && careFacts.length + biologyFacts.length === 0 && !sheet.notes && inheritedNotes.length === 0

  // Fichas de las que podría heredar y aún no existen.
  const missing: CareFormTarget[] = []
  if (sheet.level === 'colony' && sheet.genus && sheet.species && !findTaxonSheet(sheets, 'species', sheet.genus, sheet.species)) {
    missing.push({ mode: 'new', level: 'species', genus: sheet.genus, species: sheet.species })
  }
  if (sheet.level !== 'genus' && sheet.genus && !findTaxonSheet(sheets, 'genus', sheet.genus)) {
    missing.push({ mode: 'new', level: 'genus', genus: sheet.genus })
  }

  return (
    <div className="page care-detail">
      <div className="detail-bar">
        <BackButton onBack={onBack} />
        <button type="button" className="button button-small" onClick={() => onEdit(sheet.id)}>
          Editar
        </button>
      </div>

      <header className="detail-head">
        <span className="detail-level">
          {sheet.level === 'colony' ? (sheet.archived ? 'Colonia archivada' : 'Colonia') : `Ficha de ${LEVEL_LABELS[sheet.level].toLowerCase()}`}
        </span>
        <h1 className={sheet.level === 'colony' ? '' : 'taxon'}>{sheetTitle(sheet)}</h1>
        {sheet.level === 'colony' && (
          <p className="detail-sub">
            <span className={isIdentified(sheet) ? 'taxon' : ''}>{taxonLabel(sheet)}</span>
            {sheet.startedAt && (
              <>
                {' · '}desde el {formatPlainDate(sheet.startedAt)}
                {formatAge(sheet.startedAt) && ` (${formatAge(sheet.startedAt)})`}
              </>
            )}
          </p>
        )}
        {sheet.origin && <p className="detail-sub">Origen: {sheet.origin}</p>}
        {status && <p className={`status-pill ${status.state === 'active' ? 'is-active' : ''}`}>{describeDiapauseStatus(status)}</p>}
      </header>

      {sheet.photos.length > 0 && (
        <div className="detail-photos">
          {sheet.photos.map((photo) => (
            <button key={photo.id} type="button" className="detail-photo" onClick={() => setViewing(photo.id)} aria-label="Ver foto">
              <PhotoThumb photoId={photo.id} />
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        <section className="detail-section">
          <p className="muted">Todavía no hay datos de cría. Pulsa «Editar» para añadirlos.</p>
        </section>
      ) : (
        <>
          {care.diapause && (
            <section className="detail-section">
              <h2>Diapausa</h2>
              <p className="fact-line">
                {describeDiapause(care.diapause.value)}
                {source(care.diapause.from)}
              </p>
            </section>
          )}

          {hasFood && (
            <section className="detail-section">
              <h2>Alimentación</h2>
              <FoodSummary label="Carbohidratos" items={care.carbs} source={source} />
              <FoodSummary label="Proteínas" items={care.proteins} source={source} />
            </section>
          )}

          {careFacts.length > 0 && (
            <section className="detail-section">
              <h2>Cuidados</h2>
              <Facts facts={careFacts} source={source} />
            </section>
          )}

          {biologyFacts.length > 0 && (
            <section className="detail-section">
              <h2>Biología</h2>
              <Facts facts={biologyFacts} source={source} />
            </section>
          )}

          {(sheet.notes || inheritedNotes.length > 0) && (
            <section className="detail-section">
              <h2>Notas</h2>
              {sheet.notes && <p className="detail-notes">{sheet.notes}</p>}
              {inheritedNotes.map((parent) => (
                <div key={parent.id} className="inherited-notes">
                  <span className="from-label">De la ficha de {sourceLabel(parent)}</span>
                  <p className="detail-notes">{parent.notes}</p>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {(parents.length > 0 || missing.length > 0) && (
        <section className="detail-section">
          <h2>Hereda de</h2>
          <ul className="care-rows">
            {parents.map((parent) => (
              <li key={parent.id}>
                <button type="button" className="care-row" onClick={() => onOpen(parent.id)}>
                  <span className="care-row-text">
                    <span className="care-row-title taxon">{sheetTitle(parent)}</span>
                    <span className="care-row-meta">Ficha de {LEVEL_LABELS[parent.level].toLowerCase()}</span>
                  </span>
                  <Chevron />
                </button>
              </li>
            ))}
            {missing.map((target) => (
              <li key={target.mode === 'new' ? target.level : ''}>
                <button type="button" className="care-row" onClick={() => onNew(target)}>
                  <span className="care-row-text">
                    <span className="care-row-title taxon">
                      {target.mode === 'new' && [target.genus, target.species].filter(Boolean).join(' ')}
                    </span>
                    <span className="care-row-meta">Sin ficha: créala para compartir sus datos con otras colonias</span>
                  </span>
                  <span className="care-row-action">＋ Crear</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheet.level !== 'colony' && (
        <section className="detail-section">
          <h2>{sheet.level === 'genus' ? 'Especies y colonias' : 'Colonias'}</h2>
          {heirs.length > 0 ? (
            <ul className="care-rows">
              {heirs
                .filter((s) => s.level === 'species')
                .map((s) => (
                  <li key={s.id}>
                    <button type="button" className="care-row" onClick={() => onOpen(s.id)}>
                      <span className="care-row-text">
                        <span className="care-row-title taxon">{sheetTitle(s)}</span>
                        <span className="care-row-meta">Ficha de especie</span>
                      </span>
                      <Chevron />
                    </button>
                  </li>
                ))}
              {heirs
                .filter((s) => s.level === 'colony')
                .map((s) => (
                  <li key={s.id}>
                    <ColonyRow colony={s} sheets={sheets} onOpen={onOpen} />
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">Aún no hay {sheet.level === 'genus' ? 'especies ni colonias' : 'colonias'} que hereden de esta ficha.</p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => onNew({ mode: 'new', level: 'colony', genus: sheet.genus, species: sheet.species })}
            >
              ＋ Nueva colonia
            </button>
            {sheet.level === 'genus' && (
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => onNew({ mode: 'new', level: 'species', genus: sheet.genus })}
              >
                ＋ Ficha de especie
              </button>
            )}
          </div>
        </section>
      )}

      <p className="muted small detail-footer">
        Creada el {formatDateTime(sheet.createdAt)} ·{' '}
        {sheet.dirty === 1 ? 'pendiente de subir a Drive' : 'guardada en Drive'}
      </p>

      {viewing && <PhotoViewer photoId={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="link-button back-button" onClick={onBack}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Cría
    </button>
  )
}

function SourceTag({ from, onOpen }: { from: CareSheet; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="from" onClick={() => onOpen(from.id)} title={`Heredado de la ficha de ${sheetTitle(from)}`}>
      de {sourceLabel(from)}
    </button>
  )
}

function FoodSummary({ label, items, source }: { label: string; items: ResolvedFood[]; source: (from: CareSheet) => ReactNode }) {
  if (items.length === 0) return null
  return (
    <div className="food-summary">
      <h3>{label}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.name} className="food-item">
            <span className="food-item-name">{item.name}</span>
            <span className={`liking liking-${item.liking}`}>{LIKING_LABELS[item.liking]}</span>
            {source(item.from)}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Fact {
  label: string
  value: string
  from: CareSheet
}

function Facts({ facts, source }: { facts: Fact[]; source: (from: CareSheet) => ReactNode }) {
  return (
    <dl className="facts-list">
      {facts.map((fact) => (
        <div key={fact.label} className="fact">
          <dt>{fact.label}</dt>
          <dd>
            {fact.value}
            {source(fact.from)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
