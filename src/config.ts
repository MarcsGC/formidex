// Identificador de cliente OAuth de Google (no es secreto: viaja siempre en la web).
// Se puede fijar al compilar con VITE_GOOGLE_CLIENT_ID o pegarlo en Ajustes en cada dispositivo.

const LOCAL_CLIENT_ID_KEY = 'formidex.googleClientId'
const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? ''

export function getGoogleClientId(): string {
  return readLocalClientId() || BUILT_IN_CLIENT_ID
}

export function hasBuiltInClientId(): boolean {
  return BUILT_IN_CLIENT_ID !== ''
}

export function readLocalClientId(): string {
  try {
    return localStorage.getItem(LOCAL_CLIENT_ID_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function saveLocalClientId(id: string): void {
  try {
    if (id.trim()) localStorage.setItem(LOCAL_CLIENT_ID_KEY, id.trim())
    else localStorage.removeItem(LOCAL_CLIENT_ID_KEY)
  } catch {
    // Sin almacenamiento no se puede recordar.
  }
}

/** Centro inicial del mapa si todavía no hay registros: la península ibérica. */
export const DEFAULT_MAP_VIEW = { center: [40.2, -3.7] as [number, number], zoom: 6 }
