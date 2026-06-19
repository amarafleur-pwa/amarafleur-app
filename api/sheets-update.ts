import { JWT } from 'google-auth-library'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

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

  const { sheet, appId, row } = req.body ?? {}
  if (!sheet || !appId || !Array.isArray(row)) return res.status(400).json({ error: 'Missing sheet, appId, or row' })

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID

  if (!clientEmail || !privateKey || !spreadsheetId) {
    return res.status(200).json({ ok: true, skipped: 'not configured' })
  }

  try {
    const token = await getToken(clientEmail, privateKey)
    const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const rangeRes = await fetch(
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(sheet + '!A:Z')}`,
      { headers: hdrs }
    )
    const rangeData = await rangeRes.json() as { values?: string[][] }
    const rows = rangeData.values ?? []

    let rowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][rows[i].length - 1] === appId) { rowIndex = i; break }
    }

    if (rowIndex !== -1) {
      // Update in-place — row stays in its current position, order unchanged
      const rowNum = rowIndex + 1
      const endCol = colLetter(row.length)
      await fetch(
        `${BASE}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A${rowNum}:${endCol}${rowNum}`)}?valueInputOption=USER_ENTERED`,
        { method: 'PUT', headers: hdrs, body: JSON.stringify({ values: [row] }) }
      )
    } else {
      // Fallback: row not found, append at bottom
      await fetch(
        `${BASE}/${spreadsheetId}/values/${encodeURIComponent(sheet + '!A1')}:append?valueInputOption=USER_ENTERED`,
        { method: 'POST', headers: hdrs, body: JSON.stringify({ values: [row] }) }
      )
    }

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sheets-update]', message)
    return res.status(500).json({ error: 'Sheets update failed' })
  }
}
