import { JWT } from 'google-auth-library'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

const HEADERS: Record<string, string[]> = {
  'Personal Expenses': ['Name', 'Amount', 'Amount Paid', 'Due Date', 'Category', 'Mode of Payment', 'Recurring', 'Notes', 'Logged By', 'Logged At', 'App ID'],
  'Business Expenses': ['Name', 'Amount', 'Amount Paid', 'Due Date', 'Category', 'Mode of Payment', 'Recurring', 'Notes', 'Logged By', 'Logged At', 'App ID'],
  'Orders': ['Customer Name', 'Description', 'Quantity', 'Due Date', 'Total Amount', 'Deposit Paid', 'Mode of Payment', 'Notes', 'Fulfillment Type', 'Logged By', 'Logged At', 'App ID'],
  'Advance Orders': ['Customer Name', 'Description', 'Quantity', 'Due Date', 'Total Amount', 'Deposit Paid', 'Mode of Payment', 'Notes', 'Fulfillment Type', 'Logged By', 'Logged At', 'App ID'],
  'Payments': ['Customer Name', 'Order Description', 'Amount', 'Type', 'Paid At', 'Notes', 'Logged By', 'Logged At', 'App ID'],
  'Customers': ['Name', 'Phone', 'Notes', 'Logged By', 'Logged At', 'App ID'],
}

async function getToken(email: string, key: string): Promise<string> {
  const auth = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const result = await auth.getAccessToken()
  return result.token!
}

function colLetter(n: number): string {
  return String.fromCharCode(64 + n)
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

    const lastColLetter = colLetter((HEADERS[sheet] ?? []).length)
    const incomingAppId = typeof row[row.length - 1] === 'string' ? String(row[row.length - 1]) : ''

    const [checkRes, metaRes, idColRes] = await Promise.all([
      fetch(`${BASE}/${spreadsheetId}/values/${encodeURIComponent(sheet + '!A1')}`, { headers: hdrs }),
      fetch(`${BASE}/${spreadsheetId}?fields=sheets.properties`, { headers: hdrs }),
      incomingAppId
        ? fetch(`${BASE}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!${lastColLetter}:${lastColLetter}`)}`, { headers: hdrs })
        : Promise.resolve(null),
    ])
    const [checkData, meta, idColData] = await Promise.all([
      checkRes.json() as Promise<{ values?: string[][] }>,
      metaRes.json() as Promise<{ sheets?: { properties?: { title?: string; sheetId?: number } }[] }>,
      idColRes ? (idColRes.json() as Promise<{ values?: string[][] }>) : Promise.resolve({ values: [] }),
    ])

    if (incomingAppId) {
      const existingIds = ((idColData as { values?: string[][] }).values ?? []).flat()
      if (existingIds.includes(incomingAppId)) {
        return res.status(200).json({ ok: true, skipped: 'duplicate' })
      }
    }

    const sheetMeta = meta.sheets?.find(s => s.properties?.title === sheet)
    let sheetId: number

    if (!sheetMeta) {
      // Tab doesn't exist — create it, then write headers + data
      await fetch(`${BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheet } } }] })
      })
      await fetch(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `${sheet}!A1`, values: [HEADERS[sheet] ?? []] },
            { range: `${sheet}!A2`, values: [row] }
          ]
        })
      })
      return res.status(200).json({ ok: true, created: true })
    }

    sheetId = sheetMeta.properties!.sheetId!

    if (!checkData.values?.length) {
      // Sheet is empty: write headers to A1 and data to A2 in one call
      await fetch(`${BASE}/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `${sheet}!A1`, values: [HEADERS[sheet] ?? []] },
            { range: `${sheet}!A2`, values: [row] }
          ]
        })
      })
    } else {
      // Insert a blank row at row 2 (after header), then write data there
      await fetch(`${BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
              inheritFromBefore: false
            }
          }]
        })
      })
      await fetch(
        `${BASE}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A2:${lastColLetter}2`)}?valueInputOption=USER_ENTERED`,
        { method: 'PUT', headers: hdrs, body: JSON.stringify({ values: [row] }) }
      )
    }

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sheets-log]', message)
    return res.status(500).json({ error: 'Sheets append failed' })
  }
}
