import { JWT } from 'google-auth-library'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

const HEADERS: Record<string, string[]> = {
  'Personal Expenses': ['Name', 'Amount', 'Amount Paid', 'Due Date', 'Category', 'Mode of Payment', 'Recurring', 'Notes', 'Logged By', 'Logged At', 'App ID'],
  'Business Expenses': ['Name', 'Amount', 'Amount Paid', 'Due Date', 'Category', 'Mode of Payment', 'Recurring', 'Notes', 'Logged By', 'Logged At', 'App ID'],
  'Orders': ['Customer Name', 'Description', 'Quantity', 'Due Date', 'Time', 'Total Amount', 'Deposit Paid', 'Notes', 'Fulfillment Type', 'Logged By', 'Logged At', 'App ID'],
  'Advance Orders': ['Customer Name', 'Description', 'Quantity', 'Due Date', 'Time', 'Total Amount', 'Deposit Paid', 'Mode of Payment', 'Notes', 'Fulfillment Type', 'Logged By', 'Logged At', 'App ID'],
  'Payments': ['Customer Name', 'Order Description', 'Amount', 'Type', 'Paid At', 'Notes', 'Logged By', 'Logged At', 'App ID'],
  'Customers': ['Name', 'Phone', 'Notes', 'Logged By', 'Logged At', 'App ID'],
}

async function getToken(email: string, key: string): Promise<string> {
  const auth = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const result = await auth.getAccessToken()
  return result.token!
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const expectedSecret = process.env.SHEETS_API_SECRET
  if (!expectedSecret || req.headers['x-app-secret'] !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { sheet, row } = req.body ?? {}
  if (!sheet || !Array.isArray(row)) return res.status(400).json({ error: 'Missing sheet or row' })

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID

  if (!clientEmail || !privateKey || !spreadsheetId) {
    return res.status(200).json({ ok: true, skipped: 'not configured' })
  }

  try {
    const token = await getToken(clientEmail, privateKey)
    const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const checkRes = await fetch(
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(sheet + '!A1')}`,
      { headers: hdrs }
    )
    const checkData = await checkRes.json() as { values?: string[][] }

    const values: (string | number)[][] = []
    if (!checkData.values?.length && HEADERS[sheet]) values.push(HEADERS[sheet])
    values.push(row)

    await fetch(
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(sheet + '!A1')}:append?valueInputOption=USER_ENTERED`,
      { method: 'POST', headers: hdrs, body: JSON.stringify({ values }) }
    )

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sheets-log]', message)
    return res.status(500).json({ error: 'Sheets append failed' })
  }
}
