// Inicio de sesión con Google Identity Services (modelo de token, sin servidor propio).
// El token dura una hora; cuando caduca hay que pedir otro desde un clic del usuario,
// porque el navegador bloquea la ventana de Google si no viene de una acción suya.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_KEY = 'formidex.googleToken'
const EXPIRY_MARGIN_MS = 60_000

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string
      scope: string
      callback: (response: TokenResponse) => void
      error_callback?: (error: { type?: string; message?: string }) => void
    }): TokenClient
    revoke(token: string, done?: () => void): void
  }
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

interface StoredToken {
  accessToken: string
  expiresAt: number
}

let scriptPromise: Promise<void> | null = null
let client: TokenClient | null = null
let clientId: string | null = null
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null
let memoryToken: StoredToken | null = null

function loadScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('No se pudo cargar el inicio de sesión de Google. ¿Hay conexión?'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Prepara el cliente de Google con antelación para poder abrir la ventana justo en el clic. */
export async function prepareGoogleAuth(id: string): Promise<void> {
  if (client && clientId === id) return
  await loadScript()
  client = window.google!.accounts.oauth2.initTokenClient({
    client_id: id,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      const waiting = pending
      pending = null
      if (!waiting) return
      if (response.error || !response.access_token) {
        waiting.reject(new Error(response.error_description || response.error || 'Google no dio acceso'))
        return
      }
      const expiresIn = Number(response.expires_in ?? 3600)
      storeToken({ accessToken: response.access_token, expiresAt: Date.now() + expiresIn * 1000 })
      waiting.resolve(response.access_token)
    },
    error_callback: (error) => {
      const waiting = pending
      pending = null
      const closed = error.type === 'popup_closed'
      waiting?.reject(new Error(closed ? 'Se cerró la ventana de Google' : error.message || 'No se pudo abrir la ventana de Google'))
    },
  })
  clientId = id
}

export function isGoogleAuthReady(): boolean {
  return client !== null
}

/** Abre la ventana de Google. Llamar directamente desde un clic. */
export function requestGoogleToken(loginHint?: string): Promise<string> {
  if (!client) return Promise.reject(new Error('El inicio de sesión de Google aún se está cargando'))
  pending?.reject(new Error('Se ha pedido otro inicio de sesión'))
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    client!.requestAccessToken({ prompt: '', ...(loginHint ? { login_hint: loginHint } : {}) })
  })
}

/** Token guardado si todavía vale; si no, null. */
export function getValidToken(): string | null {
  const stored = readToken()
  if (!stored || stored.expiresAt - EXPIRY_MARGIN_MS <= Date.now()) return null
  return stored.accessToken
}

export function forgetToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Sin almacenamiento disponible no hay nada que borrar.
  }
}

export function revokeGoogleAccess(): void {
  const stored = readToken()
  forgetToken()
  if (stored && window.google?.accounts) window.google.accounts.oauth2.revoke(stored.accessToken)
}

function storeToken(token: StoredToken): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  } catch {
    // Si no se puede guardar, el token solo vive mientras la página esté abierta.
    memoryToken = token
  }
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (raw) return JSON.parse(raw) as StoredToken
  } catch {
    // Almacenamiento no disponible: se usa la copia en memoria.
  }
  return memoryToken
}
