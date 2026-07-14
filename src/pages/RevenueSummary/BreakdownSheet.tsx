import { useEffect, useMemo, useState } from 'react'
import { X, Loader2 } from 'lucide-react'

export type BreakdownRow = {
  id: string
  title: string
  subtitle: string
  date: string
  amount: number
  amountColor?: string
}

type Sort = 'recent' | 'largest'

const fmt = (n: number) => '₱' + Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })

export default function BreakdownSheet({
  open, onClose, title, subtitle, total, accent, rows,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  total: number
  accent: string
  rows: BreakdownRow[]
}) {
  const [closing, setClosing] = useState(false)
  const [sort, setSort] = useState<Sort>('recent')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setClosing(false)
    setSort('recent')
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 250)
    return () => clearTimeout(t)
  }, [open])

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    if (sort === 'largest') copy.sort((a, b) => b.amount - a.amount)
    else copy.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return copy
  }, [rows, sort])

  if (!open) return null

  const handleClose = () => setClosing(true)

  const sorts: { key: Sort; label: string }[] = [
    { key: 'recent', label: 'Recent' },
    { key: 'largest', label: 'Largest' },
  ]

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={closing ? 'sheet-exit' : 'sheet-enter'}
        onAnimationEnd={e => { if (closing && e.animationName === 'sheet-down') onClose() }}
        style={{
          width: '100%', background: '#F9F3EE',
          borderRadius: '20px 20px 0 0', maxHeight: '85svh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#2D2D2D' }}>{title}</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{subtitle}</p>
            <p style={{ fontSize: '26px', fontWeight: 800, color: accent, letterSpacing: '-0.5px', marginTop: '6px' }}>{fmt(total)}</p>
          </div>
          <button
            onClick={handleClose}
            style={{ background: '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}
          >
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {/* Sort toggle */}
        <div style={{ display: 'flex', gap: '8px', padding: '14px 16px 12px' }}>
          {sorts.map(s => {
            const active = sort === s.key
            return (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                style={{
                  padding: '6px 16px', borderRadius: '20px', border: 'none',
                  fontSize: '12px', fontWeight: active ? 700 : 500, cursor: 'pointer',
                  background: active ? '#C9848A' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #C9848A33' : 'none',
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 24px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 size={30} color="#C9848A" className="animate-spin" />
            </div>
          ) : sortedRows.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>No items for this period.</p>
          ) : (
            sortedRows.map(r => (
              <div
                key={r.id}
                style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ minWidth: 0, marginRight: '10px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{r.subtitle}</p>
                </div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: r.amountColor ?? '#2D2D2D', whiteSpace: 'nowrap' }}>{fmt(r.amount)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
