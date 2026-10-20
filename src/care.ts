// Fichas de cría. Hay una por género, una por especie y una por colonia, y todas comparten los
// mismos parámetros. Lo que no se rellena en una ficha se hereda: la colonia de la ficha de su
// especie, y la especie de la de su género. Así en la colonia solo se apunta lo que sea distinto.

import { taxonLabel, type PhotoRef } from './model'

export type SheetLevel = 'genus' | 'species' | 'colony'
export type Liking = 'nada' | 'poco' | 'mucho'
export type Amount = 'baja' | 'media' | 'alta'
export type Founding = 'claustral' | 'semiclaustral' | 'parasitaria'
export type QueenCount = 'monoginica' | 'poliginica'

export interface FoodPreference {
  name: string
  liking: Liking
}

/** Inicio y fin en formato MM-DD, porque se repiten cada año. */
export type Diapause = { kind: 'none' } | { kind: 'period'; start?: string; end?: string; temperature?: string }

export interface CareParams {
  diapause?: Diapause
  carbs?: FoodPreference[]
  proteins?: FoodPreference[]
  escape?: Amount
  temperature?: string
  humidity?: Amount
  nest?: string
  queenSize?: string
  workerSize?: string
  founding?: Founding
  queens?: QueenCount
}

export interface CareSheet {
  id: string
  level: SheetLevel
  genus?: string
  /** Epíteto específico, como en los registros. */
  species?: string
  /** Nombre de la colonia. */
  name?: string
  /** Fecha en que empezó la colonia (YYYY-MM-DD). */
  startedAt?: string
  origin?: string
  archived?: boolean
  params: CareParams
  notes?: string
  photos: PhotoRef[]
  createdAt: string
  updatedAt: string
  deleted?: boolean
}

export const LEVEL_LABELS: Record<SheetLevel, string> = { genus: 'Género', species: 'Especie', colony: 'Colonia' }
export const LIKING_LABELS: Record<Liking, string> = { nada: 'Nada', poco: 'Poco', mucho: 'Mucho' }
export const AMOUNT_LABELS: Record<Amount, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' }
export const FOUNDING_LABELS: Record<Founding, string> = {
  claustral: 'Claustral',
  semiclaustral: 'Semiclaustral',
  parasitaria: 'Parasitaria',
}
export const QUEENS_LABELS: Record<QueenCount, string> = {
  monoginica: 'Monogínica (una reina)',
  poliginica: 'Poligínica (varias reinas)',
}

export const CARB_SUGGESTIONS = [
  'Agua azucarada',
  'Miel',
  'Agua con miel',
  'Fruta',
  'Néctar comercial',
  'Semillas de alpiste',
  'Semillas de mijo',
  'Semillas de lino',
  'Semillas de chía',
  'Semillas de diente de león',
]

export const PROTEIN_SUGGESTIONS = [
  'Grillos',
  'Tenebrios',
  'Moscas',
  'Moscas de la fruta',
  'Cucarachas',
  'Gusanos de la harina',
  'Larvas de mosca soldado',
  'Huevo cocido',
  'Gambas',
]

const SCALAR_KEYS = ['diapause', 'escape', 'temperature', 'humidity', 'nest', 'queenSize', 'workerSize', 'founding', 'queens'] as const
const FOOD_KEYS = ['carbs', 'proteins'] as const

export type ScalarKey = (typeof SCALAR_KEYS)[number]
export type FoodKey = (typeof FOOD_KEYS)[number]

export interface Inherited<T> {
  value: T
  /** Ficha de la que sale el valor. */
  from: CareSheet
}

export type ResolvedFood = FoodPreference & { from: CareSheet }

export type ResolvedCare = { [K in ScalarKey]?: Inherited<NonNullable<CareParams[K]>> } & { [K in FoodKey]: ResolvedFood[] }

const LIKING_ORDER: Record<Liking, number> = { mucho: 0, poco: 1, nada: 2 }

/**
 * Valores efectivos de una cadena de fichas, de la más concreta a la más general
 * (colonia, especie, género). Cada parámetro sale de la primera ficha que lo tiene; los
 * alimentos se combinan uno a uno, así la colonia puede cambiar solo cuánto le gusta uno.
 */
export function resolveCare(chain: CareSheet[]): ResolvedCare {
  const scalars: Partial<Record<ScalarKey, Inherited<unknown>>> = {}
  for (const key of SCALAR_KEYS) {
    const from = chain.find((sheet) => hasValue(sheet.params[key]))
    if (from) scalars[key] = { value: from.params[key], from }
  }
  const foods = { carbs: [] as ResolvedFood[], proteins: [] as ResolvedFood[] }
  for (const key of FOOD_KEYS) {
    const seen = new Set<string>()
    for (const sheet of chain) {
      for (const item of sheet.params[key] ?? []) {
        const k = foodKey(item.name)
        if (!k || seen.has(k)) continue
        seen.add(k)
        foods[key].push({ ...item, from: sheet })
      }
    }
    foods[key].sort((a, b) => LIKING_ORDER[a.liking] - LIKING_ORDER[b.liking])
  }
  return { ...scalars, ...foods } as ResolvedCare
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && 'kind' in value) {
    const d = value as Diapause
    return d.kind === 'none' || Boolean(d.start || d.end || d.temperature?.trim())
  }
  return true
}

export function foodKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Quita lo vacío antes de guardar y conserva los parámetros que esta versión no conoce. */
export function cleanParams(params: CareParams): CareParams {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if ((FOOD_KEYS as readonly string[]).includes(key)) {
      const seen = new Set<string>()
      const items = (value as FoodPreference[] | undefined)
        ?.map((item) => ({ ...item, name: item.name.trim() }))
        .filter((item) => {
          const k = foodKey(item.name)
          if (!k || seen.has(k)) return false
          seen.add(k)
          return true
        })
      if (items?.length) out[key] = items
    } else if (key === 'diapause') {
      const d = value as Diapause | undefined
      if (d?.kind === 'none') out[key] = { kind: 'none' }
      else if (d?.kind === 'period') {
        const temperature = d.temperature?.trim()
        if (hasValue(d)) out[key] = { kind: 'period', start: d.start || undefined, end: d.end || undefined, temperature: temperature || undefined }
      } else if (d) {
        // Un tipo de diapausa de una versión más nueva de la app: se guarda tal cual.
        out[key] = d
      }
    } else if (typeof value === 'string') {
      if (value.trim()) out[key] = value.trim()
    } else if (value !== undefined && value !== null) {
      out[key] = value
    }
  }
  return out as CareParams
}

/** Mismo nombre de género o de especie, sin distinguir mayúsculas. */
export function sameName(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

/** Ficha de género o de especie de ese taxón. Si hubiera dos (creadas sin conexión), la más reciente. */
export function findTaxonSheet(
  sheets: CareSheet[],
  level: 'genus' | 'species',
  genus: string | undefined,
  species?: string,
  excludeId?: string,
): CareSheet | undefined {
  if (!genus?.trim() || (level === 'species' && !species?.trim())) return undefined
  let best: CareSheet | undefined
  for (const sheet of sheets) {
    if (sheet.deleted || sheet.level !== level || sheet.id === excludeId) continue
    if (!sameName(sheet.genus, genus) || (level === 'species' && !sameName(sheet.species, species))) continue
    if (!best || best.updatedAt < sheet.updatedAt) best = sheet
  }
  return best
}

/** Fichas de las que hereda una ficha (o una ficha que se está creando), de la más concreta a la más general. */
export function parentsOf(target: Pick<CareSheet, 'level' | 'genus' | 'species'> & { id?: string }, sheets: CareSheet[]): CareSheet[] {
  const parents: CareSheet[] = []
  if (target.level === 'colony') {
    const speciesSheet = findTaxonSheet(sheets, 'species', target.genus, target.species, target.id)
    if (speciesSheet) parents.push(speciesSheet)
  }
  if (target.level !== 'genus') {
    const genusSheet = findTaxonSheet(sheets, 'genus', target.genus, undefined, target.id)
    if (genusSheet) parents.push(genusSheet)
  }
  return parents
}

export function sheetTitle(sheet: CareSheet): string {
  if (sheet.level === 'colony') return sheet.name?.trim() || `Colonia de ${taxonLabel(sheet)}`
  if (sheet.level === 'species') return `${sheet.genus ?? ''} ${sheet.species ?? ''}`.trim()
  return sheet.genus ?? ''
}

/** Nombre corto para indicar de dónde sale un valor heredado. */
export function sourceLabel(sheet: CareSheet): string {
  if (sheet.level === 'species') return `${(sheet.genus ?? '').charAt(0)}. ${sheet.species ?? ''}`
  return sheetTitle(sheet)
}

// Diapausa

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DAY_MS = 86_400_000

export const MONTH_NAMES = MONTHS

export function toDayMonth(day: number, month: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDayMonth(value: string | undefined): { day: number; month: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { day, month }
}

/** «15 de noviembre». */
export function formatDayMonth(value: string | undefined): string {
  const parsed = parseDayMonth(value)
  return parsed ? `${parsed.day} de ${MONTHS[parsed.month - 1]}` : ''
}

export function describeDiapause(d: Diapause): string {
  if (d.kind === 'none') return 'No necesita'
  let dates = ''
  if (d.start && d.end) dates = `Del ${formatDayMonth(d.start)} al ${formatDayMonth(d.end)}`
  else if (d.start) dates = `Desde el ${formatDayMonth(d.start)}`
  else if (d.end) dates = `Hasta el ${formatDayMonth(d.end)}`
  if (!d.temperature) return dates
  return dates ? `${dates}, a ${d.temperature}` : `A ${d.temperature}`
}

export type DiapauseStatus = { state: 'active'; end: string; daysLeft: number } | { state: 'upcoming'; start: string; daysUntil: number }

/** Si la colonia está ahora en diapausa o cuánto falta para la próxima. */
export function diapauseStatus(d: Diapause | undefined, today: Date = new Date()): DiapauseStatus | null {
  if (!d || d.kind !== 'period' || !parseDayMonth(d.start) || !parseDayMonth(d.end)) return null
  const start = d.start!
  const end = d.end!
  const now = toDayMonth(today.getDate(), today.getMonth() + 1)
  const active = start <= end ? now >= start && now <= end : now >= start || now <= end
  return active
    ? { state: 'active', end, daysLeft: daysUntil(end, today) }
    : { state: 'upcoming', start, daysUntil: daysUntil(start, today) }
}

function daysUntil(dayMonth: string, today: Date): number {
  const { day, month } = parseDayMonth(dayMonth)!
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(base.getFullYear(), month - 1, day)
  if (next < base) next = new Date(base.getFullYear() + 1, month - 1, day)
  return Math.round((next.getTime() - base.getTime()) / DAY_MS)
}

/** Texto corto para la lista: solo cuando está en diapausa o le falta poco. */
export function diapauseBadge(status: DiapauseStatus | null): string | null {
  if (!status) return null
  if (status.state === 'active') return 'En diapausa'
  if (status.daysUntil === 0) return 'Diapausa desde hoy'
  if (status.daysUntil <= 30) return `Diapausa en ${status.daysUntil} ${status.daysUntil === 1 ? 'día' : 'días'}`
  return null
}

export function describeDiapauseStatus(status: DiapauseStatus): string {
  if (status.state === 'active') return `En diapausa hasta el ${formatDayMonth(status.end)}`
  if (status.daysUntil === 0) return 'La diapausa empieza hoy'
  return `La diapausa empieza en ${status.daysUntil} ${status.daysUntil === 1 ? 'día' : 'días'}, el ${formatDayMonth(status.start)}`
}

/** Edad de una colonia: «12 días», «7 meses», «1 año y 2 meses». */
export function formatAge(startedAt: string | undefined, today: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startedAt ?? '')
  if (!m) return ''
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (start > base) return ''
  let months = (base.getFullYear() - start.getFullYear()) * 12 + base.getMonth() - start.getMonth()
  if (base.getDate() < start.getDate()) months--
  if (months < 1) {
    const days = Math.round((base.getTime() - start.getTime()) / DAY_MS)
    return `${days} ${days === 1 ? 'día' : 'días'}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years ? `${years} ${years === 1 ? 'año' : 'años'}` : ''
  const mo = rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''
  return [y, mo].filter(Boolean).join(' y ')
}

/** «12 mar 2026» a partir de YYYY-MM-DD, sin desfases por la zona horaria. */
export function formatPlainDate(value: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Árbol de la pantalla de cría: géneros, sus especies y las colonias de cada una.

export interface CareTreeSpecies {
  species: string
  /** Normalmente una; dos si se crearon a la vez en dos dispositivos. */
  sheets: CareSheet[]
  colonies: CareSheet[]
}

export interface CareTreeGenus {
  /** null para las colonias sin identificar. */
  genus: string | null
  sheets: CareSheet[]
  species: CareTreeSpecies[]
  /** Colonias con género pero sin especie. */
  colonies: CareSheet[]
}

export function buildCareTree(sheets: CareSheet[]): CareTreeGenus[] {
  const genera = new Map<string, CareTreeGenus>()
  const unknown: CareTreeGenus = { genus: null, sheets: [], species: [], colonies: [] }

  const genusNode = (name: string) => {
    const key = name.toLowerCase()
    let node = genera.get(key)
    if (!node) {
      node = { genus: name, sheets: [], species: [], colonies: [] }
      genera.set(key, node)
    }
    return node
  }
  const speciesNode = (g: CareTreeGenus, name: string) => {
    let node = g.species.find((s) => sameName(s.species, name))
    if (!node) {
      node = { species: name, sheets: [], colonies: [] }
      g.species.push(node)
    }
    return node
  }

  for (const sheet of sheets) {
    if (sheet.deleted) continue
    const genus = sheet.genus?.trim()
    const species = sheet.species?.trim()
    if (!genus) {
      if (sheet.level === 'colony') unknown.colonies.push(sheet)
      continue
    }
    const g = genusNode(genus)
    if (sheet.level === 'genus') g.sheets.push(sheet)
    else if (species && sheet.level === 'species') speciesNode(g, species).sheets.push(sheet)
    else if (species) speciesNode(g, species).colonies.push(sheet)
    else if (sheet.level === 'colony') g.colonies.push(sheet)
  }

  const byName = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
  const byTitle = (a: CareSheet, b: CareSheet) => byName(sheetTitle(a), sheetTitle(b))
  const latestFirst = (a: CareSheet, b: CareSheet) => (a.updatedAt < b.updatedAt ? 1 : -1)
  const tree = [...genera.values()].sort((a, b) => byName(a.genus!, b.genus!))
  for (const g of tree) {
    g.sheets.sort(latestFirst)
    g.colonies.sort(byTitle)
    g.species.sort((a, b) => byName(a.species, b.species))
    for (const s of g.species) {
      s.sheets.sort(latestFirst)
      s.colonies.sort(byTitle)
    }
  }
  if (unknown.colonies.length) {
    unknown.colonies.sort(byTitle)
    tree.push(unknown)
  }
  return tree
}
