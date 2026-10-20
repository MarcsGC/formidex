// Google Drive en memoria para las pruebas del motor de sincronización.

import { NotFoundError, type CreateFileOptions, type DriveApi, type DriveFileMeta } from './driveApi'

interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  appProperties: Record<string, string>
  content: Blob | string
  modifiedTime: string
  trashed: boolean
}

let instances = 0

export class FakeDrive implements DriveApi {
  files = new Map<string, FakeFile>()
  calls: Record<string, number> = {}
  // Como en Drive, los identificadores no se repiten entre cuentas.
  private prefix = `d${++instances}`
  private nextId = 1
  private clock = Date.UTC(2026, 0, 1)

  private tick(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  private count(name: string): void {
    this.calls[name] = (this.calls[name] ?? 0) + 1
  }

  private meta(file: FakeFile): DriveFileMeta {
    return { id: file.id, name: file.name, modifiedTime: file.modifiedTime, appProperties: { ...file.appProperties } }
  }

  private get(fileId: string): FakeFile {
    const file = this.files.get(fileId)
    if (!file) throw new NotFoundError()
    return file
  }

  async findFolder(marker: string): Promise<string | null> {
    this.count('findFolder')
    for (const file of this.files.values()) {
      if (!file.trashed && file.mimeType === 'folder' && file.appProperties.formidex === marker) return file.id
    }
    return null
  }

  async createFolder(name: string, marker: string, parentId?: string): Promise<string> {
    this.count('createFolder')
    const id = `${this.prefix}-folder-${this.nextId++}`
    this.files.set(id, {
      id,
      name,
      mimeType: 'folder',
      parents: parentId ? [parentId] : [],
      appProperties: { formidex: marker },
      content: '',
      modifiedTime: this.tick(),
      trashed: false,
    })
    return id
  }

  async listFiles(folderId: string): Promise<DriveFileMeta[]> {
    this.count('listFiles')
    return [...this.files.values()].filter((f) => !f.trashed && f.parents.includes(folderId)).map((f) => this.meta(f))
  }

  async createFile({ name, parentId, mimeType, appProperties, body }: CreateFileOptions): Promise<DriveFileMeta> {
    this.count('createFile')
    const id = `${this.prefix}-file-${this.nextId++}`
    const file: FakeFile = {
      id,
      name,
      mimeType,
      parents: [parentId],
      appProperties: { ...appProperties },
      content: body,
      modifiedTime: this.tick(),
      trashed: false,
    }
    this.files.set(id, file)
    return this.meta(file)
  }

  async updateFileContent(fileId: string, _mimeType: string, body: Blob | string): Promise<DriveFileMeta> {
    this.count('updateFileContent')
    const file = this.get(fileId)
    file.content = body
    file.modifiedTime = this.tick()
    return this.meta(file)
  }

  async downloadText(fileId: string): Promise<string> {
    this.count('downloadText')
    const content = this.get(fileId).content
    return typeof content === 'string' ? content : content.text()
  }

  async downloadBlob(fileId: string): Promise<Blob> {
    this.count('downloadBlob')
    const content = this.get(fileId).content
    return typeof content === 'string' ? new Blob([content]) : content
  }

  async trashFile(fileId: string): Promise<void> {
    this.count('trashFile')
    const file = this.files.get(fileId)
    if (file) {
      file.trashed = true
      file.modifiedTime = this.tick()
    }
  }

  /** Archivos visibles (no en la papelera) cuyo nombre cumple el patrón. */
  visible(pattern: RegExp): FakeFile[] {
    return [...this.files.values()].filter((f) => !f.trashed && pattern.test(f.name))
  }
}
