// Motor de sincronización con Google Drive.
//
// El dispositivo trabaja siempre contra su base de datos local (IndexedDB) y la sincronización
// copia los cambios en los dos sentidos. En Drive cada registro es un archivo JSON propio dentro
// de Formidex/registros y cada foto son dos JPEG (tamaño completo y miniatura) en Formidex/fotos.
// Si el mismo registro se cambia en dos dispositivos, gana el cambio con updatedAt más reciente.

import type { FormidexDB } from '../db'
import type { Observation, PhotoRef } from '../model'
import { NotFoundError, type DriveApi, type DriveFileMeta } from './driveApi'

export const FOLDER_MARKERS = {
  root: 'root',
  observations: 'observations',
  photos: 'photos',
} as const

const JSON_MIME = 'application/json'
const JPEG_MIME = 'image/jpeg'
const DOWNLOAD_CONCURRENCY = 4

export interface SyncProgress {
  phase: string
  done?: number
  total?: number
}

export interface SyncReport {
  pulled: number
  pushed: number
  photosUploaded: number
  thumbsDownloaded: number
  trashed: number
}

export interface DriveFolders {
  observations: string
  photos: string
}

type ProgressFn = (progress: SyncProgress) => void

export async function runSync(db: FormidexDB, drive: DriveApi, onProgress: ProgressFn = () => {}): Promise<SyncReport> {
  onProgress({ phase: 'Preparando las carpetas de Drive' })
  const folders = await ensureFolders(db, drive)
  const trashed = await flushDeletions(db, drive)
  const pulled = await pull(db, drive, folders, onProgress)
  const { pushed, photosUploaded } = await push(db, drive, folders, onProgress)
  const thumbsDownloaded = await downloadMissingThumbs(db, drive, onProgress)
  await db.setMeta('lastSync', new Date().toISOString())
  return { pulled, pushed, photosUploaded, thumbsDownloaded, trashed }
}

/** Descarga la foto a tamaño completo si este dispositivo aún no la tiene. */
export async function fetchFullPhoto(db: FormidexDB, drive: DriveApi, photoId: string): Promise<Blob | undefined> {
  const photo = await db.photos.get(photoId)
  if (!photo) return undefined
  if (photo.full) return photo.full
  if (!photo.driveFullId) return photo.thumb
  const blob = await drive.downloadBlob(photo.driveFullId)
  await db.photos.update(photoId, { full: blob })
  return blob
}

async function ensureFolders(db: FormidexDB, drive: DriveApi): Promise<DriveFolders> {
  let observations = await drive.findFolder(FOLDER_MARKERS.observations)
  let photos = await drive.findFolder(FOLDER_MARKERS.photos)
  if (!observations || !photos) {
    const root = (await drive.findFolder(FOLDER_MARKERS.root)) ?? (await drive.createFolder('Formidex', FOLDER_MARKERS.root))
    observations ??= await drive.createFolder('registros', FOLDER_MARKERS.observations, root)
    photos ??= await drive.createFolder('fotos', FOLDER_MARKERS.photos, root)
  }
  const folders: DriveFolders = { observations, photos }
  const previous = await db.getMeta<DriveFolders>('driveFolders')
  if (previous && (previous.observations !== observations || previous.photos !== photos)) {
    // Otra cuenta de Google o las carpetas se borraron: se vuelve a subir todo lo de este dispositivo.
    await forgetRemoteState(db)
  }
  await db.setMeta('driveFolders', folders)
  return folders
}

async function forgetRemoteState(db: FormidexDB): Promise<void> {
  await db.transaction('rw', db.observations, db.photos, db.pendingDeletions, async () => {
    await db.observations.toCollection().modify((o) => {
      delete o.driveFileId
      delete o.remoteModifiedTime
      o.photos = o.photos.map(({ id, width, height }) => ({ id, width, height }))
      o.dirty = o.deleted ? 0 : 1
    })
    await db.photos.toCollection().modify((p) => {
      delete p.driveFullId
      delete p.driveThumbId
    })
    await db.pendingDeletions.clear()
  })
}

async function flushDeletions(db: FormidexDB, drive: DriveApi): Promise<number> {
  const pending = await db.pendingDeletions.toArray()
  for (const { driveFileId } of pending) {
    await drive.trashFile(driveFileId)
    await db.pendingDeletions.delete(driveFileId)
  }
  return pending.length
}

async function pull(db: FormidexDB, drive: DriveApi, folders: DriveFolders, onProgress: ProgressFn): Promise<number> {
  onProgress({ phase: 'Buscando cambios en Drive' })
  const files = await drive.listFiles(folders.observations)

  // Si por algún fallo hay dos archivos del mismo registro, manda el más reciente.
  const latest = new Map<string, DriveFileMeta>()
  for (const file of files) {
    const id = observationIdOf(file)
    if (!id) continue
    const previous = latest.get(id)
    if (!previous || previous.modifiedTime < file.modifiedTime) latest.set(id, file)
  }

  const ids = [...latest.keys()]
  const locals = await db.observations.bulkGet(ids)
  const changed = ids
    .map((id, i) => ({ id, file: latest.get(id)!, local: locals[i] }))
    .filter(({ file, local }) => !(local && local.driveFileId === file.id && local.remoteModifiedTime === file.modifiedTime))

  let applied = 0
  let done = 0
  await forEachLimited(changed, DOWNLOAD_CONCURRENCY, async ({ id, file }) => {
    onProgress({ phase: 'Descargando registros', done: done++, total: changed.length })
    const remote = parseObservation(await drive.downloadText(file.id))
    if (!remote || remote.id !== id) return
    if (await applyRemote(db, remote, file)) applied++
  })
  return applied
}

async function applyRemote(db: FormidexDB, remote: Observation, file: DriveFileMeta): Promise<boolean> {
  return db.transaction('rw', db.observations, db.photos, async () => {
    const local = await db.observations.get(remote.id)
    if (local && local.dirty === 1 && local.updatedAt >= remote.updatedAt) {
      // El cambio local es más reciente: se queda y se sube después.
      await db.observations.update(remote.id, { driveFileId: file.id, remoteModifiedTime: file.modifiedTime })
      return false
    }

    const remotePhotos = remote.deleted ? [] : remote.photos
    const keep = new Set(remotePhotos.map((p) => p.id))
    const removed = (local?.photos ?? []).map((p) => p.id).filter((id) => !keep.has(id))
    if (removed.length) await db.photos.bulkDelete(removed)

    for (const ref of remotePhotos) {
      const existing = await db.photos.get(ref.id)
      if (!existing) {
        await db.photos.put({
          id: ref.id,
          width: ref.width,
          height: ref.height,
          driveFullId: ref.driveFullId,
          driveThumbId: ref.driveThumbId,
        })
      } else if (ref.driveFullId && (existing.driveFullId !== ref.driveFullId || existing.driveThumbId !== ref.driveThumbId)) {
        await db.photos.update(ref.id, { driveFullId: ref.driveFullId, driveThumbId: ref.driveThumbId })
      }
    }

    await db.observations.put({
      ...remote,
      photos: remotePhotos,
      dirty: 0,
      driveFileId: file.id,
      remoteModifiedTime: file.modifiedTime,
    })
    return true
  })
}

async function push(
  db: FormidexDB,
  drive: DriveApi,
  folders: DriveFolders,
  onProgress: ProgressFn,
): Promise<{ pushed: number; photosUploaded: number }> {
  const dirty = await db.observations.where('dirty').equals(1).toArray()
  let pushed = 0
  let photosUploaded = 0

  for (const [i, obs] of dirty.entries()) {
    onProgress({ phase: 'Subiendo registros', done: i, total: dirty.length })

    if (obs.deleted && !obs.driveFileId) {
      // Se creó y se borró sin llegar a subirse: no hay nada que avisar a otros dispositivos.
      await db.observations.delete(obs.id)
      continue
    }

    const refs: PhotoRef[] = []
    for (const ref of obs.photos) {
      const result = await ensurePhotoUploaded(db, drive, folders.photos, ref)
      if (result.uploaded) photosUploaded++
      if (result.ref) refs.push(result.ref)
    }

    const { dirty: _dirty, driveFileId, remoteModifiedTime: _remote, ...plain } = obs
    const payload: Observation = { ...plain, photos: refs }
    const body = JSON.stringify(payload)

    let meta: DriveFileMeta | undefined
    if (driveFileId) {
      try {
        meta = await drive.updateFileContent(driveFileId, JSON_MIME, body)
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error
      }
    }
    meta ??= await drive.createFile({
      name: `registro-${obs.id}.json`,
      parentId: folders.observations,
      mimeType: JSON_MIME,
      appProperties: { formidexObservation: obs.id },
      body,
    })

    const uploaded = meta
    await db.transaction('rw', db.observations, async () => {
      const current = await db.observations.get(obs.id)
      if (!current) return
      if (current.updatedAt === obs.updatedAt) {
        await db.observations.update(obs.id, {
          photos: refs,
          dirty: 0,
          driveFileId: uploaded.id,
          remoteModifiedTime: uploaded.modifiedTime,
        })
      } else {
        // Se editó mientras se subía: sigue pendiente para la próxima vez.
        await db.observations.update(obs.id, { driveFileId: uploaded.id, remoteModifiedTime: uploaded.modifiedTime })
      }
    })
    pushed++
  }
  return { pushed, photosUploaded }
}

async function ensurePhotoUploaded(
  db: FormidexDB,
  drive: DriveApi,
  folderId: string,
  ref: PhotoRef,
): Promise<{ ref: PhotoRef | null; uploaded: boolean }> {
  const local = await db.photos.get(ref.id)
  let fullId = ref.driveFullId ?? local?.driveFullId
  let thumbId = ref.driveThumbId ?? local?.driveThumbId
  let uploaded = false

  if (!fullId) {
    const blob = local?.full ?? local?.thumb
    // La foto no está en este dispositivo ni en Drive: no se puede recuperar.
    if (!blob) return { ref: null, uploaded }
    const file = await drive.createFile({
      name: `${ref.id}.jpg`,
      parentId: folderId,
      mimeType: JPEG_MIME,
      appProperties: { formidexPhoto: ref.id, formidexKind: 'full' },
      body: blob,
    })
    fullId = file.id
    await db.photos.update(ref.id, { driveFullId: fullId })
    uploaded = true
  }

  if (!thumbId) {
    const blob = local?.thumb ?? local?.full
    if (blob) {
      const file = await drive.createFile({
        name: `${ref.id}-mini.jpg`,
        parentId: folderId,
        mimeType: JPEG_MIME,
        appProperties: { formidexPhoto: ref.id, formidexKind: 'thumb' },
        body: blob,
      })
      thumbId = file.id
      await db.photos.update(ref.id, { driveThumbId: thumbId })
    } else {
      thumbId = fullId
    }
  }

  return { ref: { ...ref, driveFullId: fullId, driveThumbId: thumbId }, uploaded }
}

async function downloadMissingThumbs(db: FormidexDB, drive: DriveApi, onProgress: ProgressFn): Promise<number> {
  const missing = await db.photos.filter((p) => !p.thumb && Boolean(p.driveThumbId)).toArray()
  let downloaded = 0
  let done = 0
  await forEachLimited(missing, DOWNLOAD_CONCURRENCY, async (photo) => {
    onProgress({ phase: 'Descargando miniaturas', done: done++, total: missing.length })
    try {
      const blob = await drive.downloadBlob(photo.driveThumbId!)
      await db.photos.update(photo.id, { thumb: blob })
      downloaded++
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }
  })
  return downloaded
}

function observationIdOf(file: DriveFileMeta): string | undefined {
  return file.appProperties?.formidexObservation ?? /^registro-(.+)\.json$/.exec(file.name)?.[1]
}

export function parseObservation(text: string): Observation | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const o = data as Partial<Observation>
  if (
    typeof o.id !== 'string' ||
    typeof o.lat !== 'number' ||
    typeof o.lng !== 'number' ||
    typeof o.updatedAt !== 'string' ||
    typeof o.observedAt !== 'string' ||
    !Array.isArray(o.photos)
  ) {
    return null
  }
  return {
    ...(o as Observation),
    locationSource: o.locationSource ?? 'map',
    createdAt: o.createdAt ?? o.updatedAt,
  }
}

async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}
