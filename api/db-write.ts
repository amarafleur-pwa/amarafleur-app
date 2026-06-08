import { supabaseAdmin } from './_lib/supabaseAdmin.js'

const TABLES = ['personal_expenses', 'business_expenses', 'orders', 'payments', 'customers', 'app_users'] as const
const OPERATIONS = ['insert', 'update', 'delete'] as const

type Table = typeof TABLES[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const expectedSecret = process.env.SETUP_SECRET
  if (!expectedSecret || req.headers['x-setup-secret'] !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { table, operation, payload, eq, ilike, inFilter, select, single } = req.body ?? {}

  if (!TABLES.includes(table)) return res.status(400).json({ error: 'Unknown table' })
  if (!OPERATIONS.includes(operation)) return res.status(400).json({ error: 'Unknown operation' })

  try {
    const admin = supabaseAdmin()
    let query

    if (operation === 'insert') {
      query = admin.from(table as Table).insert(payload)
    } else if (operation === 'update') {
      query = admin.from(table as Table).update(payload)
    } else {
      query = admin.from(table as Table).delete()
    }

    if (eq && typeof eq === 'object') {
      for (const [column, value] of Object.entries(eq)) query = query.eq(column, value)
    }
    if (ilike && typeof ilike === 'object') {
      for (const [column, value] of Object.entries(ilike)) query = query.ilike(column, value as string)
    }
    if (inFilter && typeof inFilter === 'object' && inFilter.column && Array.isArray(inFilter.values)) {
      query = query.in(inFilter.column, inFilter.values)
    }

    let result
    if (select) {
      const withSelect = query.select(typeof select === 'string' ? select : undefined)
      result = single ? await withSelect.single() : await withSelect
    } else {
      result = await query
    }
    const { data, error } = result

    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[db-write]', message)
    return res.status(500).json({ error: `Write failed: ${message}` })
  }
}
