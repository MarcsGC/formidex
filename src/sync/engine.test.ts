import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./controller', () => ({ scheduleSync: () => {} }))

import { deleteObservation, saveObservation, type ObservationInput } from '../data'
import { FormidexDB } from '../db'
import type { ProcessedPhoto } from '../photos'
import { fetchFullPhoto, runSync } from './engine'
import { FakeDrive } from './fakeDrive'

let counter = 0
let drive: FakeDrive
let a: FormidexDB
let b: FormidexDB

function photo(label: string): ProcessedPhoto {
  return {
    id: crypto.randomUUID(),
    full: new Blob([`full-${label}`], { type: 'image/jpeg' }),
    thumb: new Blob([`thumb-${label}`], { type: 'image/jpeg' }),
    width: 100,
    height: 80,
    exif: {},
  }
}

function input(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    lat: 40.1,
    lng: -3.5,
    locationSource: 'map',
    observedAt: '2026-05-01T10:00:00.000Z',
    genus: 'Messor',
    species: 'barbarus',
    ...overrides,
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  counter++
  drive = new FakeDrive()
  a = new FormidexDB(`device-a-${counter}`)
  b = new FormidexDB(`device-b-${counter}`)
})

describe('sincronización con Google Drive', () => {
  it('sube un registro nuevo con su foto y lo marca como sincronizado', async () => {
    const id = await saveObservation(undefined, input(), [{ kind: 'new', photo: photo('1') }], a)

    const report = await runSync(a, drive)

    expect(report).toMatchObject({ pushed: 1, photosUploaded: 1 })
    const local = await a.observations.get(id)
    expect(local?.dirty).toBe(0)
    expect(local?.driveFileId).toBeTruthy()
    expect(local?.photos[0].driveFullId).toBeTruthy()
    expect(local?.photos[0].driveThumbId).toBeTruthy()
    expect(drive.visible(/^registro-/)).toHaveLength(1)
    expect(drive.visible(/\.jpg$/)).toHaveLength(2)
  })

  it('otro dispositivo recibe el registro y la miniatura, y la foto grande solo cuando se pide', async () => {
    const id = await saveObservation(undefined, input(), [{ kind: 'new', photo: photo('1') }], a)
    await runSync(a, drive)

    const report = await runSync(b, drive)

    expect(report).toMatchObject({ pulled: 1, thumbsDownloaded: 1 })
    const received = await b.observations.get(id)
    expect(received).toMatchObject({ genus: 'Messor', species: 'barbarus', dirty: 0 })
    const stored = await b.photos.get(received!.photos[0].id)
    expect(await stored?.thumb?.text()).toBe('thumb-1')
    expect(stored?.full).toBeUndefined()
    expect(await (await fetchFullPhoto(b, drive, stored!.id))?.text()).toBe('full-1')
  })

  it('no vuelve a descargar lo que el propio dispositivo acaba de subir', async () => {
    await saveObservation(undefined, input(), [], a)
    await runSync(a, drive)
    const downloadsBefore = drive.calls.downloadText ?? 0

    const report = await runSync(a, drive)

    expect(report.pulled).toBe(0)
    expect(drive.calls.downloadText ?? 0).toBe(downloadsBefore)
  })

  it('los cambios hechos en un dispositivo llegan al otro', async () => {
    const id = await saveObservation(undefined, input(), [], a)
    await runSync(a, drive)
    await runSync(b, drive)

    await saveObservation(id, input({ species: 'structor', notes: 'Corregida' }), [], b)
    await runSync(b, drive)
    await runSync(a, drive)

    expect(await a.observations.get(id)).toMatchObject({ species: 'structor', notes: 'Corregida', dirty: 0 })
  })

  it('si los dos dispositivos cambian el mismo registro, gana el cambio más reciente', async () => {
    const id = await saveObservation(undefined, input(), [], a)
    await runSync(a, drive)
    await runSync(b, drive)

    await saveObservation(id, input({ notes: 'desde B' }), [], b)
    await sleep(5)
    await saveObservation(id, input({ notes: 'desde A' }), [], a)
    await runSync(b, drive)
    await runSync(a, drive)
    await runSync(b, drive)

    expect((await a.observations.get(id))?.notes).toBe('desde A')
    expect((await b.observations.get(id))?.notes).toBe('desde A')
  })

  it('un cambio local más antiguo no pisa el más reciente que ya está en Drive', async () => {
    const id = await saveObservation(undefined, input(), [], a)
    await runSync(a, drive)
    await runSync(b, drive)

    await saveObservation(id, input({ notes: 'antiguo en A' }), [], a)
    await sleep(5)
    await saveObservation(id, input({ notes: 'nuevo en B' }), [], b)
    await runSync(b, drive)
    await runSync(a, drive)

    expect(await a.observations.get(id)).toMatchObject({ notes: 'nuevo en B', dirty: 0 })
    const [file] = drive.visible(/^registro-/)
    expect(JSON.parse(await drive.downloadText(file.id)).notes).toBe('nuevo en B')
  })

  it('borrar un registro lo quita del otro dispositivo y manda sus fotos a la papelera', async () => {
    const id = await saveObservation(undefined, input(), [{ kind: 'new', photo: photo('1') }], a)
    await runSync(a, drive)
    await runSync(b, drive)

    await deleteObservation(id, a)
    await runSync(a, drive)
    await runSync(b, drive)

    expect(drive.visible(/\.jpg$/)).toHaveLength(0)
    expect(await b.observations.get(id)).toMatchObject({ deleted: true, photos: [] })
    expect(await b.photos.count()).toBe(0)
  })

  it('quitar una foto al editar también la quita de Drive', async () => {
    const first = photo('1')
    const id = await saveObservation(undefined, input(), [{ kind: 'new', photo: first }, { kind: 'new', photo: photo('2') }], a)
    await runSync(a, drive)
    const saved = await a.observations.get(id)

    await saveObservation(id, input(), [{ kind: 'existing', ref: saved!.photos[0] }], a)
    await runSync(a, drive)
    await runSync(b, drive)

    expect(drive.visible(/\.jpg$/)).toHaveLength(2)
    expect(await a.pendingDeletions.count()).toBe(0)
    expect((await b.observations.get(id))?.photos.map((p) => p.id)).toEqual([first.id])
  })

  it('un registro creado y borrado antes de sincronizar no llega a Drive', async () => {
    const id = await saveObservation(undefined, input(), [{ kind: 'new', photo: photo('1') }], a)
    await deleteObservation(id, a)

    await runSync(a, drive)

    expect(drive.visible(/^registro-|\.jpg$/)).toHaveLength(0)
    expect(await a.observations.count()).toBe(0)
  })

  it('si cambian las carpetas de Drive (otra cuenta), vuelve a subir todo', async () => {
    await saveObservation(undefined, input(), [{ kind: 'new', photo: photo('1') }], a)
    await runSync(a, drive)

    const otherAccount = new FakeDrive()
    const report = await runSync(a, otherAccount)

    expect(report).toMatchObject({ pushed: 1, photosUploaded: 1 })
    expect(otherAccount.visible(/^registro-/)).toHaveLength(1)
    expect(otherAccount.visible(/\.jpg$/)).toHaveLength(2)
  })

  it('ignora archivos dañados en la carpeta de registros', async () => {
    await saveObservation(undefined, input(), [], a)
    await runSync(a, drive)
    const folder = (await drive.findFolder('observations'))!
    await drive.createFile({ name: 'registro-roto.json', parentId: folder, mimeType: 'application/json', body: '{no es json' })

    const report = await runSync(b, drive)

    expect(report.pulled).toBe(1)
    expect(await b.observations.count()).toBe(1)
  })

  it('las dos primeras sincronizaciones crean una sola carpeta Formidex', async () => {
    await runSync(a, drive)
    await runSync(b, drive)

    expect(drive.calls.createFolder).toBe(3)
  })
})
