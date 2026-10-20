import { diapauseBadge, diapauseStatus, formatAge, parentsOf, resolveCare, sheetTitle, type CareSheet } from '../care'
import { PhotoThumb } from './PhotoThumb'

export function ColonyRow({ colony, sheets, onOpen }: { colony: CareSheet; sheets: CareSheet[]; onOpen: (id: string) => void }) {
  const diapause = resolveCare([colony, ...parentsOf(colony, sheets)]).diapause?.value
  const badge = diapauseBadge(diapauseStatus(diapause))
  const age = formatAge(colony.startedAt)
  const meta = colony.archived ? 'Archivada' : age && `Desde hace ${age}`
  return (
    <button type="button" className={`care-row care-colony ${colony.archived ? 'is-archived' : ''}`} onClick={() => onOpen(colony.id)}>
      <PhotoThumb photoId={colony.photos[0]?.id} className="care-row-photo" alt="" />
      <span className="care-row-text">
        <span className="care-row-title">{sheetTitle(colony)}</span>
        {(meta || badge) && (
          <span className="care-row-meta">
            {meta}
            {badge && !colony.archived && <span className="badge badge-diapause">{badge}</span>}
          </span>
        )}
      </span>
      <Chevron />
    </button>
  )
}

export function Chevron() {
  return (
    <svg className="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
