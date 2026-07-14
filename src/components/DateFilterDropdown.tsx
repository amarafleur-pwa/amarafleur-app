import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { todayPH, daysFromNowPH } from '../lib/dateUtils'

export type DateFilterValue = 'today' | 'yesterday' | '3days' | '7days' | '15days' | '30days' | `d:${string}` | `r:${string}`

const PRESETS: { key: DateFilterValue; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '3days', label: 'Last 3 days' },
  { key: '7days', label: 'Last 7 days' },
  { key: '15days', label: 'Last 15 days' },
  { key: '30days', label: 'Last 30 days' },
]

export function dateFilterRange(v: DateFilterValue): { from: string; to: string } {
  if (v.startsWith('r:')) { const [from, to] = v.slice(2).split(':'); return { from, to } }
  if (v.startsWith('d:')) { const d = v.slice(2); return { from: d, to: d } }
  if (v === 'today') { const t = todayPH(); return { from: t, to: t } }
  if (v === 'yesterday') { const y = daysFromNowPH(-1); return { from: y, to: y } }
  const n = parseInt(v, 10)
  return { from: daysFromNowPH(-(n - 1)), to: todayPH() }
}

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fmtShort = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function labelFor(v: DateFilterValue): string {
  if (v.startsWith('r:')) { const [from, to] = v.slice(2).split(':'); return `${fmtShort(from)} – ${fmtShort(to)}` }
  if (v.startsWith('d:'))
    return new Date(v.slice(2) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return PRESETS.find(p => p.key === v)?.label ?? v
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export default function DateFilterDropdown({ value, onChange, accent }: {
  value: DateFilterValue
  onChange: (v: DateFilterValue) => void
  accent: string
}) {
  const [open, setOpen] = useState(false)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [view, setView] = useState(() => {
    const [y, m] = dateFilterRange(value).to.split('-').map(Number)
    return { y, m: m - 1 }
  })

  const range = dateFilterRange(value)

  function toggle() {
    if (!open) {
      const [y, m] = dateFilterRange(value).to.split('-').map(Number)
      setView({ y, m: m - 1 })
      setPendingStart(null)
    }
    setOpen(o => !o)
  }

  function pick(v: DateFilterValue) {
    onChange(v)
    setPendingStart(null)
    setOpen(false)
  }

  function pickDay(d: string) {
    if (!pendingStart) { setPendingStart(d); return }
    if (d === pendingStart) { pick(`d:${d}`); return }
    const [from, to] = d < pendingStart ? [d, pendingStart] : [pendingStart, d]
    pick(`r:${from}:${to}`)
  }

  const gridStart = new Date(view.y, view.m, 1)
  gridStart.setDate(1 - gridStart.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    return { str: toStr(d), day: d.getDate(), inMonth: d.getMonth() === view.m }
  })
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 14px', borderRadius: '12px', border: '1px solid #e5e0db',
          background: '#fff', color: '#2D2D2D', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        {labelFor(value)}
        {open ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
      </button>

      {open && (
        <>
          <div onClick={() => { setOpen(false); setPendingStart(null) }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
            display: 'flex', gap: '4px', width: 'min(340px, calc(100vw - 32px))',
            background: '#fff', border: '1px solid #e5e0db', borderRadius: '14px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.14)', padding: '10px',
          }}>
            {/* Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: '1px solid #f0ebe6', paddingRight: '4px' }}>
              {PRESETS.map(p => {
                const active = value === p.key
                return (
                  <button
                    key={p.key}
                    onClick={() => pick(p.key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                      padding: '8px 10px', border: 'none', borderRadius: '8px', textAlign: 'left',
                      background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
                      fontSize: '12px', fontWeight: active ? 700 : 500,
                      color: active ? accent : '#2D2D2D',
                    }}
                  >
                    {p.label}
                    {active && <Check size={13} color={accent} />}
                  </button>
                )
              })}
            </div>

            {/* Calendar */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <button
                  onClick={() => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })}
                  style={{ width: '26px', height: '26px', borderRadius: '8px', border: 'none', background: '#f5f1ec', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronLeft size={14} color="#2D2D2D" />
                </button>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D2D2D' }}>{monthLabel}</span>
                <button
                  onClick={() => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 })}
                  style={{ width: '26px', height: '26px', borderRadius: '8px', border: 'none', background: '#f5f1ec', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronRight size={14} color="#2D2D2D" />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {WEEKDAYS.map(w => (
                  <span key={w} style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', textAlign: 'center', padding: '2px 0' }}>{w}</span>
                ))}
                {cells.map(c => {
                  const inRange = !pendingStart && c.str >= range.from && c.str <= range.to
                  const selected = pendingStart ? c.str === pendingStart : (c.str === range.to || c.str === range.from)
                  return (
                    <button
                      key={c.str}
                      onClick={() => pickDay(c.str)}
                      style={{
                        aspectRatio: '1', border: 'none', borderRadius: '7px', cursor: 'pointer',
                        fontSize: '11px', fontWeight: selected ? 700 : 500, padding: 0,
                        background: selected ? accent : inRange ? `${accent}22` : 'transparent',
                        color: selected ? '#fff' : !c.inMonth ? '#d1ccc8' : inRange ? '#2D2D2D' : '#6b7280',
                      }}
                    >
                      {c.day}
                    </button>
                  )
                })}
              </div>
              {pendingStart && (
                <p style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', margin: '6px 0 0' }}>
                  Tap another date to set a range
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
