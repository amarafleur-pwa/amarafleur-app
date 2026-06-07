// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { secret } = req.body ?? {}
  const expected = process.env.SETUP_SECRET

  if (!expected) return res.status(200).json({ ok: false })

  return res.status(200).json({ ok: typeof secret === 'string' && secret === expected })
}
