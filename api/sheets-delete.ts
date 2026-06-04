import { google } from 'googleapis'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { sheet, appId } = req.body ?? {}
  if (!sheet || !appId) return res.status(400).json({ error: 'Missing sheet or appId' })

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID

  if (!clientEmail || !privateKey || !spreadsheetId) {
    return res.status(200).json({ ok: true, skipped: 'not configured' })
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail, key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })

    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetMeta = meta.data.sheets?.find(s => s.properties?.title === sheet)
    if (!sheetMeta) return res.status(200).json({ ok: true, skipped: 'sheet not found' })
    const sheetId = sheetMeta.properties!.sheetId!

    const range = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheet}!A:Z` })
    const rows = range.data.values ?? []

    let rowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][rows[i].length - 1] === appId) { rowIndex = i; break }
    }

    if (rowIndex === -1) return res.status(200).json({ ok: true, skipped: 'row not found' })

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }]
      }
    })

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sheets-delete]', message)
    return res.status(500).json({ error: 'Sheets delete failed' })
  }
}
