import { JWT } from 'google-auth-library'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const DATE_COL: Record<string, number> = {
  'Personal Expenses': 3,
  'Business Expenses': 3,
  'Orders': 3,
  'Advance Orders': 3,
  'Payments': 4,
  'Customers': 4,
}

async function getToken(email: string, key: string): Promise<string> {
  const auth = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const result = await auth.getAccessToken()
  return result.token!
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: AnyObj, res: AnyObj) {
  const expectedSecret = process.env.SHEETS_API_SECRET
  const providedSecret = req.headers['x-app-secret'] ?? req.query?.secret
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  res.setHeader('Access-Control-Allow-Origin', '*')

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID

  if (!clientEmail || !privateKey || !spreadsheetId) {
    return res.status(200).json({ ok: true, skipped: 'not configured' })
  }

  try {
    const token = await getToken(clientEmail, privateKey)
    const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const metaRes = await fetch(`${BASE}/${spreadsheetId}?fields=sheets.properties`, { headers: hdrs })
    const { sheets } = await metaRes.json() as { sheets: AnyObj[] }

    const targets = sheets.filter(s => DATE_COL[s.properties.title] !== undefined)

    const counts: number[] = await Promise.all(targets.map(s =>
      fetch(`${BASE}/${spreadsheetId}/values/${encodeURIComponent(s.properties.title + '!A:A')}`, { headers: hdrs })
        .then(r => r.json())
        .then((d: AnyObj) => d.values?.length ?? 0)
    ))

    const log: string[] = []
    const requests = targets.flatMap((s, i) => {
      const rowCount = counts[i]
      if (rowCount <= 1) { log.push(`skip: ${s.properties.title} (no data)`); return [] }
      log.push(`sort: ${s.properties.title} (${rowCount - 1} rows)`)
      return [{
        sortRange: {
          range: { sheetId: s.properties.sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 26 },
          sortSpecs: [{ dimensionIndex: DATE_COL[s.properties.title], sortOrder: 'DESCENDING' }]
        }
      }]
    })

    if (!requests.length) return res.status(200).json({ ok: true, message: 'Nothing to sort', log })

    const sortRes = await fetch(`${BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ requests })
    })
    const sortData = await sortRes.json() as AnyObj

    if (sortData.error) return res.status(500).json({ error: sortData.error, log })
    return res.status(200).json({ ok: true, message: 'All sheets sorted newest-first', log })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
