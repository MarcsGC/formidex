// Altas, cambios y bajas de registros y fichas de cría. Todo se guarda primero en el dispositivo
// y se marca como pendiente para que la sincronización lo suba a Drive.

import { cleanParams, findTaxonSheet, sameName, type CareParams, type CareSheet, type SheetLevel } from './care'
import { db as defaultDb, type FormidexDB, type LocalObservation, type LocalSheet } from './db'
import { newId, type LocationSource, type PhotoRef } from './model'
import type { ProcessedPhoto } from './photos'
import { scheduleSync } from './sync/controller'

export interface ObservationInput {
  lat: number
  lng: number
  locationSource: LocationSource
  observedAt: string
  genus?: string
  species?: string
  notes?: string
}

export type PhotoItem = { kind: 'existing'; ref: PhotoRef } | { kind: 'new'; photo: ProcessedPhoto }

export async function saveObservation(
  existingId: string | undefined,
  input: ObservationInput,
  items: PhotoItem[],
  db: FormidexDB = defaultDb,
): Promise<string> {
  const id = existingId ?? newId()
  const now = new Date().toISOString()

  await db.transaction('rw', db.observations, db.photos, db.pendingDeletions, async () => {
    const previous = existingId ? await db.observations.get(existingId) : undefined
    const refs = await storePhotos(db, previous?.photos ?? [], items)
    const observation: LocalObservation = {
      // Se parte del registro anterior para no perder campos que añada una versión más nueva de la app.
      ...previous,
      id,
      lat: input.lat,
      lng: input.lng,
      locationSource: input.locationSource,
      observedAt: input.observedAt,
      genus: input.genus,
      species: input.genus ? input.species : undefined,
      notes: input.notes?.trim() || undefined,
      photos: refs,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      deleted: undefined,
      dirty: 1,
      driveFileId: previous?.driveFileId,
      remoteModifiedTime: previous?.remoteModifiedTime,
    }
    await db.observations.put(observation)
  })

  scheduleSync()
  return id
}

export async function deleteObservation(id: string, db: FormidexDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.observations, db.photos, db.pendingDeletions, async () => {
    const observation = await db.observations.get(id)
    if (!observation) return
    for (const ref of observation.photos) await removePhoto(db, ref)
    await db.observations.put({
      ...observation,
      photos: [],
      deleted: true,
      updatedAt: new Date().toISOString(),
      dirty: 1,
    })
  })
  scheduleSync()
}

export interface SheetInput {
  level: SheetLevel
  genus?: string
  species?: string
  name?: string
  startedAt?: string
  origin?: string
  archived?: boolean
  params: CareParams
  notes?: string
}

export async function saveSheet(
  existingId: string | undefined,
  input: SheetInput,
  items: PhotoItem[],
  db: FormidexDB = defaultDb,
): Promise<string> {
  const id = existingId ?? newId()
  const now = new Date().toISOString()
  const colony = input.level === 'colony'

  await db.transaction('rw', db.sheets, db.photos, db.pendingDeletions, async () => {
    const previous = existingId ? await db.sheets.get(existingId) : undefined
    const refs = await storePhotos(db, previous?.photos ?? [], items)
    const sheet: LocalSheet = {
      // Se parte de la ficha anterior para no perder campos que añada una versión más nueva de la app.
      ...previous,
      id,
      level: input.level,
      genus: input.genus,
      species: input.genus && input.level !== 'genus' ? input.species : undefined,
      name: colony ? input.name?.trim() || undefined : undefined,
      startedAt: colony ? input.startedAt || undefined : undefined,
      origin: colony ? input.origin?.trim() || undefined : undefined,
      archived: colony && input.archived ? true : undefined,
      params: cleanParams(input.params),
      notes: input.notes?.trim() || undefined,
      photos: refs,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      deleted: undefined,
      dirty: 1,
      driveFileId: previous?.driveFileId,
      remoteModifiedTime: previous?.remoteModifiedTime,
    }
    await db.sheets.put(sheet)
    if (previous && !previous.deleted) await renameChildren(db, previous, sheet, now)
  })

  scheduleSync()
  return id
}

// Al corregir el nombre de una ficha de género o de especie, sus especies y colonias lo siguen
// para no perder lo que heredan.
async function renameChildren(db: FormidexDB, before: CareSheet, after: CareSheet, now: string): Promise<void> {
  const level = before.level
  if (level === 'colony') return
  if (sameName(before.genus, after.genus) && sameName(before.species, after.species)) return
  const live = await db.sheets.filter((s) => !s.deleted).toArray()
  // Si hay dos fichas del mismo taxón (creadas sin conexión en dos dispositivos), sus hijos heredan
  // de la más reciente: solo la siguen si la que se ha corregido es esa.
  const effective = findTaxonSheet(
    live.map((s) => (s.id === before.id ? before : s)),
    level,
    before.genus,
    before.species,
  )
  if (effective?.id !== before.id) return
  const children = live.filter((s) => {
    if (s.id === after.id || !sameName(s.genus, before.genus)) return false
    return level === 'genus' ? s.level !== 'genus' : s.level === 'colony' && sameName(s.species, before.species)
  })
  for (const child of children) {
    await db.sheets.update(child.id, {
      genus: after.genus,
      ...(before.level === 'species' ? { species: after.species } : {}),
      updatedAt: now,
      dirty: 1,
    })
  }
}

export async function deleteSheet(id: string, db: FormidexDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.sheets, db.photos, db.pendingDeletions, async () => {
    const sheet = await db.sheets.get(id)
    if (!sheet) return
    for (const ref of sheet.photos) await removePhoto(db, ref)
    await db.sheets.put({ ...sheet, photos: [], deleted: true, updatedAt: new Date().toISOString(), dirty: 1 })
  })
  scheduleSync()
}

/** Guarda las fotos nuevas, quita las que ya no están y devuelve las referencias en orden. */
async function storePhotos(db: FormidexDB, previous: PhotoRef[], items: PhotoItem[]): Promise<PhotoRef[]> {
  const refs: PhotoRef[] = []
  for (const item of items) {
    if (item.kind === 'existing') {
      refs.push(item.ref)
      continue
    }
    const { id: photoId, full, thumb, width, height } = item.photo
    await db.photos.put({ id: photoId, full, thumb, width, height })
    refs.push({ id: photoId, width, height })
  }
  const kept = new Set(refs.map((r) => r.id))
  for (const old of previous) {
    if (!kept.has(old.id)) await removePhoto(db, old)
  }
  return refs
}

async function removePhoto(db: FormidexDB, ref: PhotoRef): Promise<void> {
  const local = await db.photos.get(ref.id)
  const driveIds = new Set([ref.driveFullId, ref.driveThumbId, local?.driveFullId, local?.driveThumbId].filter(Boolean) as string[])
  for (const driveFileId of driveIds) await db.pendingDeletions.put({ driveFileId })
  await db.photos.delete(ref.id)
}

/** Pide al navegador que no borre los datos locales si le falta espacio. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    // No es imprescindible.
  }
}
