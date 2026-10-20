// Estado de la sincronización para la interfaz y cuándo lanzarla:
// al abrir la app, tras cada cambio, al recuperar conexión, al volver a la app y cada 5 minutos.

import { getGoogleClientId } from '../config'
import { db } from '../db'
import { AuthError } from './driveApi'
import { fetchFullPhoto, runSync, type SyncProgress } from './engine'
import {
  forgetToken,
  getValidToken,
  isGoogleAuthReady,
  prepareGoogleAuth,
  requestGoogleToken,
  revokeGoogleAccess,
} from './googleAuth'
import { createGoogleDrive, fetchDriveUser } from './googleDrive'

export type SyncStatus = 'unconfigured' | 'disconnected' | 'needs-auth' | 'idle' | 'syncing' | 'error' | 'offline'

export interface GoogleAccount {
  email?: string
  name?: string
}

export interface SyncState {
  status: SyncStatus
  progress?: SyncProgress
  message?: string
  lastSync?: string
  account?: GoogleAccount
}

const ACCOUNT_KEY = 'formidex.googleAccount'
const PERIODIC_SYNC_MS = 5 * 60_000
const CHANGE_DEBOUNCE_MS = 2_000

const drive = createGoogleDrive(getValidToken)
const listeners = new Set<() => void>()
let state: SyncState = initialState()
let running: Promise<void> | null = null
let runAgain = false
let debounce: ReturnType<typeof setTimeout> | undefined
let started = false

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncState(): SyncState {
  return state
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function initialState(): SyncState {
  if (!getGoogleClientId()) return { status: 'unconfigured' }
  const account = readAccount()
  if (!account) return { status: 'disconnected' }
  return { status: getValidToken() ? 'idle' : 'needs-auth', account }
}

/** Se llama una vez al arrancar la app. */
export function startSyncService(): void {
  if (started) return
  started = true
  void db.getMeta<string>('lastSync').then((lastSync) => lastSync && setState({ lastSync }))
  void prepare()
  window.addEventListener('online', () => scheduleSync(0))
  window.addEventListener('offline', () => {
    if (state.status === 'idle') setState({ status: 'offline' })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  }, PERIODIC_SYNC_MS)
  scheduleSync(0)
}

/** Vuelve a leer la configuración (por ejemplo, tras pegar el ID de cliente en Ajustes). */
export function reloadSyncConfig(): void {
  state = { ...initialState(), lastSync: state.lastSync }
  for (const listener of listeners) listener()
  void prepare()
}

async function prepare(): Promise<void> {
  const clientId = getGoogleClientId()
  if (!clientId) return
  try {
    await prepareGoogleAuth(clientId)
  } catch {
    // Sin conexión: se reintenta al pulsar el botón.
  }
}

/** Conecta (o reconecta) con Google. Debe llamarse directamente desde un clic. */
export async function connectGoogle(): Promise<void> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    setState({ status: 'unconfigured' })
    return
  }
  try {
    // Si el cliente ya está listo se abre la ventana sin esperas, para no perder el clic.
    if (!isGoogleAuthReady()) await prepareGoogleAuth(clientId)
    const token = await requestGoogleToken(state.account?.email)
    const account = await fetchDriveUser(token).catch(() => ({}))
    saveAccount(account)
    setState({ account, status: 'idle', message: undefined })
  } catch (error) {
    setState({ status: state.account ? 'needs-auth' : 'disconnected', message: errorMessage(error) })
    return
  }
  await runNow()
}

export function disconnectGoogle(): void {
  revokeGoogleAccess()
  try {
    localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    // Nada que borrar.
  }
  setState({ status: 'disconnected', account: undefined, message: undefined, progress: undefined })
}

/** Botón de sincronizar: si la sesión caducó, primero pide otra a Google. */
export async function syncFromButton(): Promise<void> {
  if (!getValidToken()) {
    await connectGoogle()
    return
  }
  await runNow()
}

/** Sincroniza en segundo plano tras un cambio, sin abrir ventanas de Google. */
export function scheduleSync(delay = CHANGE_DEBOUNCE_MS): void {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    if (!state.account) return
    if (!getValidToken()) {
      if (state.status !== 'syncing') setState({ status: 'needs-auth' })
      return
    }
    if (!navigator.onLine) {
      setState({ status: 'offline' })
      return
    }
    void runNow()
  }, delay)
}

function runNow(): Promise<void> {
  if (running) {
    runAgain = true
    return running
  }
  running = (async () => {
    do {
      runAgain = false
      setState({ status: 'syncing', progress: undefined, message: undefined })
      try {
        await runSync(db, drive, (progress) => setState({ progress }))
        setState({ status: 'idle', progress: undefined, lastSync: new Date().toISOString() })
      } catch (error) {
        runAgain = false
        if (error instanceof AuthError) {
          forgetToken()
          setState({ status: 'needs-auth', progress: undefined })
        } else if (!navigator.onLine) {
          setState({ status: 'offline', progress: undefined })
        } else {
          setState({ status: 'error', progress: undefined, message: errorMessage(error) })
        }
      }
    } while (runAgain)
  })().finally(() => {
    running = null
  })
  return running
}

/** Foto a tamaño completo: la local o, si hay sesión, la descarga de Drive. */
export async function loadFullPhoto(photoId: string): Promise<Blob | undefined> {
  const local = await db.photos.get(photoId)
  if (local?.full) return local.full
  if (!getValidToken()) return local?.thumb
  try {
    return await fetchFullPhoto(db, drive, photoId)
  } catch {
    return local?.thumb
  }
}

function readAccount(): GoogleAccount | undefined {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as GoogleAccount) : undefined
  } catch {
    return undefined
  }
}

function saveAccount(account: GoogleAccount): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  } catch {
    // Sin almacenamiento habrá que conectar en cada visita.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
