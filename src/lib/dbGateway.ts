import { getSetupSecret } from './setupSecret'

type Operation = 'insert' | 'update' | 'delete'

interface WriteOpts {
  payload?: Record<string, unknown> | Record<string, unknown>[]
  eq?: Record<string, string | number | boolean>
  ilike?: Record<string, string>
  inFilter?: { column: string; values: (string | number)[] }
  select?: boolean | string
  single?: boolean
}

interface WriteResult<T> {
  data: T | null
  error: { message: string } | null
}

export async function dbWrite<T = unknown>(table: string, operation: Operation, opts: WriteOpts = {}): Promise<WriteResult<T>> {
  try {
    const res = await fetch('/api/db-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-setup-secret': getSetupSecret() },
      body: JSON.stringify({ table, operation, ...opts }),
    })
    const body = await res.json() as { data?: T; error?: string }
    if (!res.ok) return { data: null, error: { message: body.error ?? 'Request failed' } }
    return { data: body.data ?? null, error: null }
  } catch {
    return { data: null, error: { message: 'Network error' } }
  }
}

export async function uploadReceipt(path: string, blob: Blob, contentType: string): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  try {
    const base64 = await blobToBase64(blob)
    const res = await fetch('/api/storage-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-setup-secret': getSetupSecret() },
      body: JSON.stringify({ path, contentType, base64 }),
    })
    const body = await res.json() as { publicUrl?: string; error?: string }
    if (!res.ok) return { publicUrl: null, error: { message: body.error ?? 'Upload failed' } }
    return { publicUrl: body.publicUrl ?? null, error: null }
  } catch {
    return { publicUrl: null, error: { message: 'Network error' } }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
