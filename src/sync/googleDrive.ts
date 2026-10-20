// Cliente de la API REST de Google Drive v3 usando fetch desde el navegador.
// Con el permiso drive.file la app solo ve los archivos que ella misma ha creado.

import { AuthError, NotFoundError, type CreateFileOptions, type DriveApi, type DriveFileMeta } from './driveApi'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,modifiedTime,appProperties'
const MAX_ATTEMPTS = 4

export function createGoogleDrive(getToken: () => string | null): DriveApi {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const token = getToken()
      if (!token) throw new AuthError()
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${token}`)
      const response = await fetch(url, { ...init, headers })
      if (response.ok) return response
      if (response.status === 401) throw new AuthError('La sesión de Google ha caducado')
      if (response.status === 404) throw new NotFoundError()
      const retryable = response.status === 429 || response.status >= 500 || (response.status === 403 && (await isRateLimit(response.clone())))
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** attempt + Math.random() * 250)
        continue
      }
      const detail = await response.text().catch(() => '')
      throw new Error(`Google Drive respondió ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }
  }

  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await request(url, init)
    return (await response.json()) as T
  }

  return {
    async findFolder(marker) {
      const params = new URLSearchParams({
        q: `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='formidex' and value='${marker}' }`,
        orderBy: 'createdTime',
        pageSize: '10',
        fields: 'files(id)',
        spaces: 'drive',
      })
      const result = await json<{ files: { id: string }[] }>(`${API}/files?${params}`)
      return result.files[0]?.id ?? null
    },

    async createFolder(name, marker, parentId) {
      const result = await json<{ id: string }>(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME,
          appProperties: { formidex: marker },
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      })
      return result.id
    },

    async listFiles(folderId) {
      const files: DriveFileMeta[] = []
      let pageToken: string | undefined
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed=false`,
          pageSize: '1000',
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          spaces: 'drive',
        })
        if (pageToken) params.set('pageToken', pageToken)
        const page = await json<{ files: DriveFileMeta[]; nextPageToken?: string }>(`${API}/files?${params}`)
        files.push(...page.files)
        pageToken = page.nextPageToken
      } while (pageToken)
      return files
    },

    async createFile({ name, parentId, mimeType, appProperties, body }: CreateFileOptions) {
      const boundary = `formidex-${crypto.randomUUID()}`
      const metadata = { name, mimeType, parents: [parentId], ...(appProperties ? { appProperties } : {}) }
      const multipart = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        body,
        `\r\n--${boundary}--`,
      ])
      return json<DriveFileMeta>(`${UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      })
    },

    async updateFileContent(fileId, mimeType, body) {
      return json<DriveFileMeta>(`${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body,
      })
    },

    async downloadText(fileId) {
      const response = await request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)
      return response.text()
    },

    async downloadBlob(fileId) {
      const response = await request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)
      return response.blob()
    },

    async trashFile(fileId) {
      try {
        await request(`${API}/files/${encodeURIComponent(fileId)}?fields=id`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        })
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error
      }
    },
  }
}

/** Nombre y correo de la cuenta conectada, para mostrarlo en Ajustes. */
export async function fetchDriveUser(token: string): Promise<{ email?: string; name?: string }> {
  const response = await fetch(`${API}/about?fields=user(emailAddress,displayName)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new AuthError()
  if (!response.ok) return {}
  const data = (await response.json()) as { user?: { emailAddress?: string; displayName?: string } }
  return { email: data.user?.emailAddress, name: data.user?.displayName }
}

async function isRateLimit(response: Response): Promise<boolean> {
  const text = await response.text().catch(() => '')
  return /rateLimitExceeded|userRateLimitExceeded/.test(text)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
