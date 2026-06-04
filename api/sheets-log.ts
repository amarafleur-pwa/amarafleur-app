import { google } from 'googleapis'

const HEADERS: Record<string, string[]> = {
  'Personal Expenses': ['Name', 'Amount', 'Due Date', 'Category', 'Recurring', 'Notes', 'Logged At'],
  'Business Expenses': ['Name', 'Due Date', 'Mode of Payment', 'Amount', 'Category', 'Notes', 'Logged At'],
  'Orders': ['Customer Name', 'Description', 'Quantity', 'Due Date', 'Time', 'Total Amount', 'Deposit Paid', 'Notes', 'Logged At'],
  'Payments': ['Customer Name', 'Order Description', 'Amount', 'Type', 'Paid At', 'Notes', 'Logged At'],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sheet, row } = req.body ?? {}

  if (!sheet || !Array.isArray(row)) {
    return res.status(400).json({ error: 'Missing sheet or row' })
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID

  // Silently succeed if credentials aren't configured yet
  if (!clientEmail || !privateKey || !spreadsheetId) {
    return res.status(200).json({ ok: true, skipped: 'not configured' })
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })

    // Check if the sheet already has a header row
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheet}!A1`,
    })

    const values: (string | number)[][] = []
    if (!existing.data.values?.length && HEADERS[sheet]) {
      values.push(HEADERS[sheet])
    }
    values.push(row)

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheet}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    })

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[sheets-log]', message)
    return res.status(500).json({ error: 'Sheets append failed' })
  }
}
