import { supabaseAdmin } from './_lib/supabaseAdmin'

const BUCKET = 'receipts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const expectedSecret = process.env.SETUP_SECRET
  if (!expectedSecret || req.headers['x-setup-secret'] !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { path, contentType, base64 } = req.body ?? {}
  if (typeof path !== 'string' || typeof contentType !== 'string' || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing path, contentType, or base64' })
  }

  try {
    const admin = supabaseAdmin()
    const buffer = Buffer.from(base64, 'base64')

    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true })
    if (error) return res.status(400).json({ error: error.message })

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return res.status(200).json({ publicUrl: data.publicUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[storage-upload]', message)
    return res.status(500).json({ error: 'Upload failed' })
  }
}
