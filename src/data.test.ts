import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sync/controller', () => ({ scheduleSync: () => {} }))

import { saveSheet } from './data'
import { FormidexDB, type LocalSheet } from './db'

let counter = 0
const newDb = () => new FormidexDB(`data-${++counter}`)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('fichas de cría', () => {
  it('guarda solo los datos de colonia en las colonias y quita lo vacío', async () => {
    const db = newDb()
    const id = await saveSheet(
      undefined,
      { level: 'species', genus: 'Messor', species: 'barbarus', name: 'No aplica', params: { escape: 'alta', nest: ' ' }, notes: '  ' },
      [],
      db,
    )

    const saved = await db.sheets.get(id)
    expect(saved).toMatchObject({ level: 'species', genus: 'Messor', species: 'barbarus', params: { escape: 'alta' }, dirty: 1 })
    expect(saved?.name).toBeUndefined()
    expect(saved?.notes).toBeUndefined()
  })

  it('al corregir el nombre de un género, sus especies y colonias lo siguen', async () => {
    const db = newDb()
    const genus = await saveSheet(undefined, { level: 'genus', genus: 'Mesor', params: {} }, [], db)
    const species = await saveSheet(undefined, { level: 'species', genus: 'Mesor', species: 'barbarus', params: {} }, [], db)
    const colony = await saveSheet(undefined, { level: 'colony', genus: 'Mesor', species: 'barbarus', name: 'B1', params: {} }, [], db)
    const other = await saveSheet(undefined, { level: 'colony', genus: 'Camponotus', name: 'C1', params: {} }, [], db)

    await saveSheet(genus, { level: 'genus', genus: 'Messor', params: {} }, [], db)

    expect((await db.sheets.get(species))?.genus).toBe('Messor')
    expect(await db.sheets.get(colony)).toMatchObject({ genus: 'Messor', species: 'barbarus', dirty: 1 })
    expect((await db.sheets.get(other))?.genus).toBe('Camponotus')
  })

  it('al corregir una especie, sus colonias la siguen y las de otras especies no', async () => {
    const db = newDb()
    const species = await saveSheet(undefined, { level: 'species', genus: 'Messor', species: 'barbaurs', params: {} }, [], db)
    const colony = await saveSheet(undefined, { level: 'colony', genus: 'Messor', species: 'barbaurs', params: {} }, [], db)
    const other = await saveSheet(undefined, { level: 'colony', genus: 'Messor', species: 'structor', params: {} }, [], db)

    await saveSheet(species, { level: 'species', genus: 'Messor', species: 'barbarus', params: {} }, [], db)

    expect((await db.sheets.get(colony))?.species).toBe('barbarus')
    expect((await db.sheets.get(other))?.species).toBe('structor')
  })

  it('con dos fichas de la misma especie, corregir la que no se usa no se lleva sus colonias', async () => {
    const db = newDb()
    const older = await saveSheet(undefined, { level: 'species', genus: 'Messor', species: 'barbarus', params: {} }, [], db)
    await sleep(5)
    const newer = await saveSheet(undefined, { level: 'species', genus: 'Messor', species: 'barbarus', params: {} }, [], db)
    const colony = await saveSheet(undefined, { level: 'colony', genus: 'Messor', species: 'barbarus', params: {} }, [], db)

    await saveSheet(older, { level: 'species', genus: 'Messor', species: 'structor', params: {} }, [], db)
    expect((await db.sheets.get(colony))?.species).toBe('barbarus')

    await saveSheet(newer, { level: 'species', genus: 'Messor', species: 'minor', params: {} }, [], db)
    expect((await db.sheets.get(colony))?.species).toBe('minor')
  })

  it('al editar conserva lo que haya guardado una versión más nueva de la app', async () => {
    const db = newDb()
    const id = await saveSheet(undefined, { level: 'colony', genus: 'Messor', params: {} }, [], db)
    await db.sheets.put({ ...(await db.sheets.get(id))!, diario: [{ fecha: '2026-10-01' }] } as LocalSheet)

    await saveSheet(id, { level: 'colony', genus: 'Messor', params: {}, notes: 'Nueva nota' }, [], db)

    expect(await db.sheets.get(id)).toMatchObject({ diario: [{ fecha: '2026-10-01' }], notes: 'Nueva nota' })
  })
})
