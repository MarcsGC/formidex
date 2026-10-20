import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getGoogleClientId, hasBuiltInClientId, readLocalClientId, saveLocalClientId } from '../config'
import { db } from '../db'
import { formatDateTime } from '../model'
import { connectGoogle, disconnectGoogle, reloadSyncConfig, syncFromButton } from '../sync/controller'
import { useSyncState } from './useSyncState'

const STATUS_TEXT: Record<string, string> = {
  unconfigured: 'Falta configurar el acceso a Google.',
  disconnected: 'No conectado.',
  'needs-auth': 'La sesión de Google ha caducado. Pulsa «Reconectar» para seguir sincronizando.',
  idle: 'Conectado.',
  syncing: 'Sincronizando…',
  error: 'Hubo un error en la última sincronización.',
  offline: 'Sin conexión. Los cambios se subirán al recuperarla.',
}

export function SettingsView() {
  const sync = useSyncState()
  const counts = useLiveQuery(async () => {
    const [observations, pending, photos] = await Promise.all([
      db.observations.filter((o) => !o.deleted).count(),
      db.observations.where('dirty').equals(1).count(),
      db.photos.count(),
    ])
    return { observations, pending, photos }
  }, [])
  const [usage, setUsage] = useState<string | null>(null)
  const [clientId, setClientId] = useState(readLocalClientId())
  const [showAdvanced, setShowAdvanced] = useState(!hasBuiltInClientId() && !readLocalClientId())

  useEffect(() => {
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined) setUsage(`${(estimate.usage / 1024 / 1024).toFixed(1)} MB`)
    })
  }, [counts])

  const connected = Boolean(sync.account)

  return (
    <div className="page settings">
      <section className="panel">
        <h2>Google Drive</h2>
        <p>
          Tus registros y fotos se guardan en este dispositivo y se copian en la carpeta <strong>Formidex</strong> de tu Google Drive, así
          los ves igual en el móvil y en el ordenador.
        </p>
        <p className={`status-line status-${sync.status}`}>
          {STATUS_TEXT[sync.status]}
          {sync.account?.email && (
            <>
              {' '}
              Cuenta: <strong>{sync.account.email}</strong>.
            </>
          )}
        </p>
        {sync.status === 'error' && sync.message && <p className="form-error">{sync.message}</p>}
        {sync.status !== 'error' && sync.message && <p className="muted">{sync.message}</p>}
        {sync.lastSync && <p className="muted">Última sincronización: {formatDateTime(sync.lastSync)}</p>}

        <div className="button-row">
          {sync.status === 'unconfigured' ? null : !connected ? (
            <button type="button" className="button" onClick={() => void connectGoogle()}>
              Conectar con Google Drive
            </button>
          ) : (
            <>
              {sync.status === 'needs-auth' ? (
                <button type="button" className="button" onClick={() => void connectGoogle()}>
                  Reconectar
                </button>
              ) : (
                <button type="button" className="button" onClick={() => void syncFromButton()} disabled={sync.status === 'syncing'}>
                  Sincronizar ahora
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  if (window.confirm('¿Desconectar Google Drive? Tus datos siguen en este dispositivo y en Drive.')) disconnectGoogle()
                }}
              >
                Desconectar
              </button>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Este dispositivo</h2>
        {counts && (
          <ul className="facts">
            <li>
              {counts.observations} {counts.observations === 1 ? 'registro' : 'registros'} y {counts.photos}{' '}
              {counts.photos === 1 ? 'foto' : 'fotos'} guardados aquí
            </li>
            <li>
              {counts.pending === 0
                ? 'Todo está subido a Drive'
                : `${counts.pending} ${counts.pending === 1 ? 'cambio pendiente' : 'cambios pendientes'} de subir`}
            </li>
            {usage && <li>Espacio usado por la app: {usage}</li>}
          </ul>
        )}
      </section>

      <section className="panel">
        <button type="button" className="link-button" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Ocultar configuración avanzada' : 'Configuración avanzada'}
        </button>
        {showAdvanced && (
          <div className="advanced">
            <p className="muted">
              ID de cliente OAuth de Google que usa la app para pedir acceso a Drive.
              {hasBuiltInClientId() ? ' La app ya trae uno; pega otro solo si quieres sustituirlo en este dispositivo.' : ''}
            </p>
            <label className="field">
              <span className="field-label">ID de cliente</span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="1234567890-abc.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  saveLocalClientId(clientId)
                  reloadSyncConfig()
                }}
                disabled={clientId.trim() === readLocalClientId()}
              >
                Guardar
              </button>
            </div>
            <p className="muted small">En uso: {getGoogleClientId() || 'ninguno'}</p>
          </div>
        )}
      </section>

      <p className="muted small about">Formidex {__APP_VERSION__}</p>
    </div>
  )
}
