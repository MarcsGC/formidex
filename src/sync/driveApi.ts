// Operaciones de Google Drive que necesita la sincronización.
// Se define como interfaz para poder probar el motor con un Drive falso en memoria.

export interface DriveFileMeta {
  id: string
  name: string
  modifiedTime: string
  appProperties?: Record<string, string>
}

export interface CreateFileOptions {
  name: string
  parentId: string
  mimeType: string
  appProperties?: Record<string, string>
  body: Blob | string
}

export interface DriveApi {
  /** Busca una carpeta creada por la app con esa marca. Devuelve la más antigua si hay varias. */
  findFolder(marker: string): Promise<string | null>
  createFolder(name: string, marker: string, parentId?: string): Promise<string>
  /** Todos los archivos (no borrados) dentro de una carpeta. */
  listFiles(folderId: string): Promise<DriveFileMeta[]>
  createFile(options: CreateFileOptions): Promise<DriveFileMeta>
  updateFileContent(fileId: string, mimeType: string, body: Blob | string): Promise<DriveFileMeta>
  downloadText(fileId: string): Promise<string>
  downloadBlob(fileId: string): Promise<Blob>
  /** Manda el archivo a la papelera. No falla si ya no existe. */
  trashFile(fileId: string): Promise<void>
}

/** La sesión de Google no es válida o ha caducado: hay que volver a conectar. */
export class AuthError extends Error {
  constructor(message = 'Hay que volver a conectar con Google') {
    super(message)
    this.name = 'AuthError'
  }
}

/** El archivo ya no existe en Drive (por ejemplo, se borró a mano). */
export class NotFoundError extends Error {
  constructor(message = 'El archivo ya no existe en Google Drive') {
    super(message)
    this.name = 'NotFoundError'
  }
}
