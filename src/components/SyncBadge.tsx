import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { connectGoogle, syncFromButton } from '../sync/controller'
import { useSyncState } from './useSyncState'

export function SyncBadge({ onOpenSettings }: { onOpenSettings: () => void }) {
  const sync = useSyncState()
  const pending = useLiveQuery(() => db.countPending(), []) ?? 0

  let label: string
  let tone: 'ok' | 'busy' | 'warn' | 'off'
  let action: () => void = () => void syncFromButton()

  switch (sync.status) {
    case 'unconfigured':
    case 'disconnected':
      label = 'Conectar Drive'
      tone = 'off'
      action = onOpenSettings
      break
    case 'needs-auth':
      label = 'Reconectar Drive'
      tone = 'warn'
      action = () => void connectGoogle()
      break
    case 'syncing':
      label = sync.progress?.total ? `${sync.progress.phase} ${sync.progress.done ?? 0}/${sync.progress.total}` : 'Sincronizando…'
      tone = 'busy'
      break
    case 'error':
      label = 'Error al sincronizar'
      tone = 'warn'
      break
    case 'offline':
      label = pending ? `Sin conexión · ${pending} pendientes` : 'Sin conexión'
      tone = 'off'
      break
    default:
      label = pending ? `${pending} sin subir` : 'Sincronizado'
      tone = pending ? 'busy' : 'ok'
  }

  return (
    <button type="button" className={`sync-badge sync-${tone}`} onClick={action} title={sync.message ?? label} disabled={sync.status === 'syncing'}>
      <span className="sync-dot" aria-hidden="true" />
      <span className="sync-label">{label}</span>
    </button>
  )
}
