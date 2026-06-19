import { JWT } from 'google-auth-library'
import { supabaseAdmin } from './_lib/supabaseAdmin'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const HEADERS = ['Customer Name', 'Order Description', 'Amount', 'Type', 'Paid At', 'Notes', 'Logged By', 'Logged At', 'App ID']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const secret = req.query?.secret || req.headers['x-app-secret']
  const expectedSecret = process.env.SHEETS_API_SECRET
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID

  if (!clientEmail || !privateKey || !spreadsheetId) {
    return res.status(200).json({ ok: true, skipped: 'not configured' })
  }

  const { data: payments, error } = await supabaseAdmin()
    .from('payments')
    .select('id, amount, type, paid_at, notes, logged_by, created_at, orders(customer_name, description)')
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
    const { token } = await auth.getAccessToken()
    const hdrs = { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' }

    // Clear existing data
    await fetch(`${BASE}/${spreadsheetId}/values/${encodeURIComponent('Payments!A:I')}:clear`, {
      method: 'POST', headers: hdrs,
    })

    const rows = (payments ?? []).map((p: any) => {
      const order = Array.isArray(p.orders) ? p.orders[0] : p.orders
      return [
        order?.customer_name ?? '',
        order?.description ?? '',
        p.amount,
        p.type,
        p.paid_at,
        p.notes ?? '',
        p.logged_by ?? '',
        p.created_at ?? '',
        p.id,
      ]
    })

    await fetch(
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent('Payments!A1')}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ values: [HEADERS, ...rows] }),
      }
    )

    return res.status(200).json({ ok: true, count: rows.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[temp-backfill-payments]', message)
    return res.status(500).json({ error: message })
  }
}
