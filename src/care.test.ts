import { describe, expect, it } from 'vitest'
import {
  buildCareTree,
  cleanParams,
  describeDiapause,
  diapauseBadge,
  diapauseStatus,
  formatAge,
  parentsOf,
  resolveCare,
  sheetTitle,
  type CareParams,
  type CareSheet,
} from './care'

let n = 0
function make(partial: Partial<CareSheet>): CareSheet {
  n++
  return {
    id: `s${n}`,
    level: 'colony',
    params: {},
    photos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`,
    ...partial,
  }
}

describe('herencia de las fichas', () => {
  const genus = make({
    level: 'genus',
    genus: 'Messor',
    params: {
      escape: 'baja',
      temperature: '24–28 °C',
      diapause: { kind: 'period', start: '11-15', end: '02-15' },
      carbs: [
        { name: 'Semillas de alpiste', liking: 'mucho' },
        { name: 'Miel', liking: 'poco' },
      ],
    },
  })
  const species = make({
    level: 'species',
    genus: 'Messor',
    species: 'barbarus',
    params: { escape: 'media', carbs: [{ name: 'miel', liking: 'nada' }] },
  })
  const colony = make({
    genus: 'Messor',
    species: 'barbarus',
    name: 'Barbarus 1',
    params: { temperature: ' ', carbs: [{ name: 'Fruta', liking: 'poco' }] },
  })
  const all = [genus, species, colony]

  it('la colonia hereda de su especie y la especie de su género', () => {
    const chain = [colony, ...parentsOf(colony, all)]
    expect(chain.map((s) => s.id)).toEqual([colony.id, species.id, genus.id])

    const care = resolveCare(chain)
    expect(care.escape).toEqual({ value: 'media', from: species })
    expect(care.temperature).toEqual({ value: '24–28 °C', from: genus })
    expect(care.diapause?.from).toBe(genus)
    expect(care.humidity).toBeUndefined()
  })

  it('combina los alimentos uno a uno y los ordena por cuánto les gustan', () => {
    const care = resolveCare([colony, species, genus])
    expect(care.carbs.map((f) => [f.name, f.liking, f.from.level])).toEqual([
      ['Semillas de alpiste', 'mucho', 'genus'],
      ['Fruta', 'poco', 'colony'],
      ['miel', 'nada', 'species'],
    ])
    expect(care.proteins).toEqual([])
  })

  it('«no necesita diapausa» en la especie anula las fechas del género', () => {
    const tropical = make({ level: 'species', genus: 'Messor', species: 'tropicalis', params: { diapause: { kind: 'none' } } })
    expect(resolveCare([tropical, genus]).diapause).toEqual({ value: { kind: 'none' }, from: tropical })
  })

  it('busca las fichas sin distinguir mayúsculas y, si hay dos del mismo taxón, usa la más reciente', () => {
    const newer = make({ level: 'genus', genus: 'messor', params: {} })
    const deleted = make({ level: 'genus', genus: 'Messor', params: {}, deleted: true })
    expect(parentsOf({ level: 'species', genus: 'MESSOR', species: 'x' }, [genus, newer, deleted])).toEqual([newer])
  })

  it('una colonia sin especie hereda solo del género, y una sin identificar de ninguna', () => {
    expect(parentsOf({ level: 'colony', genus: 'Messor' }, all)).toEqual([genus])
    expect(parentsOf({ level: 'colony' }, all)).toEqual([])
    expect(parentsOf(genus, all)).toEqual([])
  })
})

describe('antes de guardar', () => {
  it('quita lo vacío y los alimentos repetidos y conserva los parámetros que no conoce', () => {
    const params = {
      escape: undefined,
      temperature: '  ',
      nest: ' Yeso ',
      carbs: [
        { name: ' Miel ', liking: 'mucho' },
        { name: 'miel', liking: 'poco' },
        { name: '', liking: 'nada' },
      ],
      proteins: [],
      diapause: { kind: 'period' },
      futuro: 1,
    } as CareParams
    expect(cleanParams(params)).toEqual({ nest: 'Yeso', carbs: [{ name: 'Miel', liking: 'mucho' }], futuro: 1 })
  })

  it('conserva otros tipos de diapausa y los datos de más de cada alimento, de versiones más nuevas', () => {
    const params = {
      diapause: { kind: 'variable', meses: 3 },
      carbs: [{ name: 'Miel ', liking: 'poco', nota: 'diluida' }],
    } as unknown as CareParams
    expect(cleanParams(params)).toEqual({ diapause: { kind: 'variable', meses: 3 }, carbs: [{ name: 'Miel', liking: 'poco', nota: 'diluida' }] })
  })
})

describe('diapausa', () => {
  const winter = { kind: 'period', start: '11-15', end: '02-15' } as const

  it('sabe si está en diapausa aunque cruce el año, y cuánto falta', () => {
    expect(diapauseStatus(winter, new Date(2026, 0, 10))).toEqual({ state: 'active', end: '02-15', daysLeft: 36 })
    expect(diapauseStatus(winter, new Date(2026, 10, 15))).toMatchObject({ state: 'active' })
    expect(diapauseStatus(winter, new Date(2026, 10, 1))).toEqual({ state: 'upcoming', start: '11-15', daysUntil: 14 })
    expect(diapauseStatus(winter, new Date(2026, 1, 16))).toEqual({ state: 'upcoming', start: '11-15', daysUntil: 272 })
    expect(diapauseStatus({ kind: 'period', start: '06-01', end: '08-31' }, new Date(2026, 6, 1))).toMatchObject({ state: 'active' })
  })

  it('sin las dos fechas no calcula nada', () => {
    expect(diapauseStatus({ kind: 'period', start: '11-15' })).toBeNull()
    expect(diapauseStatus({ kind: 'none' })).toBeNull()
    expect(diapauseStatus(undefined)).toBeNull()
  })

  it('lo describe en castellano', () => {
    expect(describeDiapause({ ...winter, temperature: '8–12 °C' })).toBe('Del 15 de noviembre al 15 de febrero, a 8–12 °C')
    expect(describeDiapause({ kind: 'none' })).toBe('No necesita')
    expect(diapauseBadge(diapauseStatus(winter, new Date(2026, 10, 1)))).toBe('Diapausa en 14 días')
    expect(diapauseBadge(diapauseStatus(winter, new Date(2026, 8, 1)))).toBeNull()
    expect(diapauseBadge(diapauseStatus(winter, new Date(2026, 11, 24)))).toBe('En diapausa')
  })
})

describe('colonias', () => {
  it('calcula la edad', () => {
    const today = new Date(2026, 9, 19)
    expect(formatAge('2026-03-12', today)).toBe('7 meses')
    expect(formatAge('2025-08-01', today)).toBe('1 año y 2 meses')
    expect(formatAge('2024-10-19', today)).toBe('2 años')
    expect(formatAge('2026-10-07', today)).toBe('12 días')
    expect(formatAge('2026-11-01', today)).toBe('')
  })

  it('usa el nombre o, si no tiene, la especie', () => {
    expect(sheetTitle(make({ name: 'Reina del parque' }))).toBe('Reina del parque')
    expect(sheetTitle(make({ genus: 'Lasius' }))).toBe('Colonia de Lasius sp.')
  })
})

describe('árbol de la pantalla de cría', () => {
  it('agrupa por género y especie, incluye las especies sin ficha y deja al final las colonias sin identificar', () => {
    const sheets = [
      make({ name: 'Sin nombre conocido' }),
      make({ genus: 'Messor', species: 'barbarus', name: 'Barbarus 10' }),
      make({ genus: 'Messor', species: 'barbarus', name: 'Barbarus 2' }),
      make({ level: 'species', genus: 'Messor', species: 'barbarus' }),
      make({ genus: 'Messor', species: 'structor', name: 'Structor' }),
      make({ genus: 'Messor', name: 'Messor sin especie' }),
      make({ level: 'genus', genus: 'Camponotus' }),
      make({ genus: 'Camponotus', name: 'Borrada', deleted: true }),
    ]

    const tree = buildCareTree(sheets)

    expect(tree.map((g) => g.genus)).toEqual(['Camponotus', 'Messor', null])
    const [camponotus, messor, unknown] = tree
    expect(camponotus).toMatchObject({ species: [], colonies: [] })
    expect(camponotus.sheets).toHaveLength(1)
    expect(messor.sheets).toHaveLength(0)
    expect(messor.species.map((s) => [s.species, s.sheets.length, s.colonies.map(sheetTitle)])).toEqual([
      ['barbarus', 1, ['Barbarus 2', 'Barbarus 10']],
      ['structor', 0, ['Structor']],
    ])
    expect(messor.colonies.map(sheetTitle)).toEqual(['Messor sin especie'])
    expect(unknown.colonies.map(sheetTitle)).toEqual(['Sin nombre conocido'])
  })
})
