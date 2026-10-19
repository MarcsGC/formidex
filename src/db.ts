import { Dexie, type EntityTable } from 'dexie'
import type { Observation } from './model'

/** Campos que solo existen en el dispositivo para saber qué falta por sincronizar. */
export interface SyncFields {
  /** 1 si hay cambios locales que todavía no se han subido a Drive. */
  dirty: 0 | 1
  driveFileId?: string
  /** modifiedTime del archivo en Drive la última vez que lo vimos o lo subimos. */
  remoteModifiedTime?: string
}

export type LocalObservation = Observation & SyncFields

export interface LocalPhoto {
  id: string
  width: number
  height: number
  full?: Blob
  thumb?: Blob
  driveFullId?: string
  driveThumbId?: string
}

/** Archivos de Drive que hay que mandar a la papelera en la próxima sincronización. */
export interface PendingDeletion {
  driveFileId: string
}

export interface MetaEntry {
  key: string
  value: unknown
}

export class FormidexDB extends Dexie {
  observations!: EntityTable<LocalObservation, 'id'>
  photos!: EntityTable<LocalPhoto, 'id'>
  pendingDeletions!: EntityTable<PendingDeletion, 'driveFileId'>
  meta!: EntityTable<MetaEntry, 'key'>

  constructor(name = 'formidex') {
    super(name)
    this.version(1).stores({
      observations: 'id, dirty, observedAt',
      photos: 'id',
      pendingDeletions: 'driveFileId',
      meta: 'key',
    })
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const entry = await this.meta.get(key)
    return entry?.value as T | undefined
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value })
  }
}

export const db = new FormidexDB()
