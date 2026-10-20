import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { buildCareTree, type CareSheet, type CareTreeGenus } from '../care'
import { db } from '../db'
import type { CareFormTarget } from './CareForm'
import { Chevron, ColonyRow } from './CareRows'

interface CareViewProps {
  onOpen: (id: string) => void
  onNew: (target: CareFormTarget) => void
}

export function CareView({ onOpen, onNew }: CareViewProps) {
  const sheets = useLiveQuery(() => db.sheets.filter((s) => !s.deleted).toArray(), [])
  const [showArchived, setShowArchived] = useState(false)

  const tree = useMemo(() => buildCareTree((sheets ?? []).filter((s) => showArchived || !s.archived)), [sheets, showArchived])
  const stats = useMemo(() => {
    const list = sheets ?? []
    const active = list.filter((s) => s.level === 'colony' && !s.archived).length
    return {
      colonies: active,
      archived: list.filter((s) => s.level === 'colony' && s.archived).length,
      taxa: list.filter((s) => s.level !== 'colony').length,
    }
  }, [sheets])

  if (!sheets) {
    return (
      <div className="page page-center">
        <span className="spinner spinner-large" />
      </div>
    )
  }

  return (
    <div className="page care-page">
      <div className="care-actions">
        <button type="button" className="button" onClick={() => onNew({ mode: 'new', level: 'colony' })}>
          ＋ Nueva colonia
        </button>
        <button type="button" className="button button-secondary" onClick={() => onNew({ mode: 'new', level: 'species' })}>
          ＋ Nueva ficha
        </button>
      </div>

      {sheets.length === 0 ? (
        <div className="empty care-empty">
          <p>
            Aquí van tus fichas de cría. Crea una ficha por género o por especie con lo que sabes de su cría, y añade tus colonias:
            cada colonia hereda los datos de su especie y su género, así que solo tienes que apuntar lo que sea distinto.
          </p>
        </div>
      ) : (
        <>
          <p className="stats">
            {stats.colonies} {stats.colonies === 1 ? 'colonia' : 'colonias'} · {stats.taxa}{' '}
            {stats.taxa === 1 ? 'ficha de especie o género' : 'fichas de especie o género'}
          </p>
          {tree.map((group) => (
            <GenusGroup key={group.genus ?? '-'} group={group} sheets={sheets} onOpen={onOpen} onNew={onNew} />
          ))}
          {stats.archived > 0 && (
            <button type="button" className="link-button" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Ocultar las archivadas' : `Ver las archivadas (${stats.archived})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

interface GroupProps {
  group: CareTreeGenus
  sheets: CareSheet[]
  onOpen: (id: string) => void
  onNew: (target: CareFormTarget) => void
}

function GenusGroup({ group, sheets, onOpen, onNew }: GroupProps) {
  const genus = group.genus
  return (
    <section className="care-group">
      <header className="care-genus">
        <h2 className={genus ? 'taxon' : ''}>{genus ?? 'Sin identificar'}</h2>
        {genus &&
          (group.sheets.length > 0 ? (
            group.sheets.map((sheet) => (
              <button key={sheet.id} type="button" className="care-sheet-link" onClick={() => onOpen(sheet.id)}>
                Ficha del género <Chevron />
              </button>
            ))
          ) : (
            <button type="button" className="care-sheet-link care-sheet-missing" onClick={() => onNew({ mode: 'new', level: 'genus', genus })}>
              ＋ Ficha del género
            </button>
          ))}
      </header>
      <ul className="care-rows">
        {group.species.map((node) => (
          <li key={node.species}>
            {node.sheets.length > 0 ? (
              node.sheets.map((sheet) => (
                <button key={sheet.id} type="button" className="care-row care-species" onClick={() => onOpen(sheet.id)}>
                  <span className="care-row-text">
                    <span className="care-row-title taxon">
                      {genus} {node.species}
                    </span>
                    <span className="care-row-meta">Ficha de especie</span>
                  </span>
                  <Chevron />
                </button>
              ))
            ) : (
              <button
                type="button"
                className="care-row care-species"
                onClick={() => onNew({ mode: 'new', level: 'species', genus: genus ?? undefined, species: node.species })}
              >
                <span className="care-row-text">
                  <span className="care-row-title taxon">
                    {genus} {node.species}
                  </span>
                  <span className="care-row-meta">Sin ficha de especie</span>
                </span>
                <span className="care-row-action">＋ Crear</span>
              </button>
            )}
            {node.colonies.length > 0 && (
              <ul className="care-rows care-rows-nested">
                {node.colonies.map((colony) => (
                  <li key={colony.id}>
                    <ColonyRow colony={colony} sheets={sheets} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {group.colonies.map((colony) => (
          <li key={colony.id}>
            <ColonyRow colony={colony} sheets={sheets} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  )
}
