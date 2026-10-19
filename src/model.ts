// Tipos compartidos por la app y por los archivos JSON que se guardan en Google Drive.

export interface PhotoRef {
  id: string
  width: number
  height: number
  /** Identificadores de los archivos en Drive, una vez subidos. */
  driveFullId?: string
  driveThumbId?: string
}

export type LocationSource = 'gps' | 'exif' | 'map'

export interface Observation {
  id: string
  lat: number
  lng: number
  locationSource: LocationSource
  /** Fecha y hora de la observación (ISO 8601). */
  observedAt: string
  /** Género, opcional. */
  genus?: string
  /** Epíteto específico (solo la segunda palabra), opcional y solo con género. */
  species?: string
  notes?: string
  photos: PhotoRef[]
  createdAt: string
  updatedAt: string
  /** Marca de borrado para que el resto de dispositivos también lo eliminen. */
  deleted?: boolean
}

export function newId(): string {
  return crypto.randomUUID()
}

export function taxonLabel(t: { genus?: string; species?: string }): string {
  if (t.genus && t.species) return `${t.genus} ${t.species}`
  if (t.genus) return `${t.genus} sp.`
  return 'Sin identificar'
}

export function isIdentified(t: { genus?: string }): boolean {
  return Boolean(t.genus)
}

/** Normaliza lo escrito: género con mayúscula inicial y especie en minúsculas. */
export function normalizeTaxon(genus: string, species: string): { genus?: string; species?: string } {
  const g = genus.trim().replace(/\s+/g, ' ')
  const s = species.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!g) return {}
  const genusName = g.charAt(0).toUpperCase() + g.slice(1).toLowerCase()
  return s ? { genus: genusName, species: s } : { genus: genusName }
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Valor para un <input type="datetime-local"> en hora local. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
