// Altas, cambios y bajas de registros. Todo se guarda primero en el dispositivo
// y se marca como pendiente para que la sincronización lo suba a Drive.

import { db as defaultDb, type FormidexDB, type LocalObservation } from './db'
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
    for (const old of previous?.photos ?? []) {
      if (!kept.has(old.id)) await removePhoto(db, old)
    }

    const observation: LocalObservation = {
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
