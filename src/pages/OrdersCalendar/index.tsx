import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Pencil } from 'lucide-react'
import { db } from '../../db/db'
import type { Order } from '../../db/db'
import OrderForm from './OrderForm'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildCells(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

export default function OrdersCalendar() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Order | undefined>()

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = todayStr()

  function load() {
    db.orders
      .toArray()
      .then(data => {
        setOrders(data)
        setError(null)
      })
      .catch(err => setError(err.message ?? 'Failed to load orders'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function prevMonth() {
    setViewDate(d => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() - 1)
      return nd
    })
    setSelectedDate(null)
  }

  function nextMonth() {
    setViewDate(d => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + 1)
      return nd
    })
    setSelectedDate(null)
  }

  async function toggleDone(order: Order) {
    await db.orders.update(order.id!, { isDone: !order.isDone })
    load()
  }

  function openAdd() {
    setEditing(undefined)
    setShowForm(true)
  }

  function openEdit(order: Order) {
    setEditing(order)
    setShowForm(true)
  }

  // Map dueDate → orders for fast calendar dot lookup
  const orderMap = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const o of orders) {
      const list = map.get(o.dueDate) ?? []
      list.push(o)
      map.set(o.dueDate, list)
    }
    return map
  }, [orders])

  const cells = useMemo(() => buildCells(year, month), [year, month])

  const selectedOrders = selectedDate ? (orderMap.get(selectedDate) ?? []) : []

  const monthLabel = viewDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const selectedLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric' })
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: '24px' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D' }}>Orders Calendar</h1>
      </div>

      {/* Calendar card */}
      <div style={{ margin: '12px 16px 0', background: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <button
            onClick={prevMonth}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronLeft size={18} color="#6b7280" />
          </button>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D' }}>{monthLabel}</span>
          <button
            onClick={nextMonth}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronRight size={18} color="#6b7280" />
          </button>
        </div>

        {/* Day labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px' }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px 12px' }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} />
            const ds = dateStr(year, month, day)
            const isToday = ds === today
            const isSelected = ds === selectedDate
            const dayOrders = orderMap.get(ds)
            const hasActive = dayOrders?.some(o => !o.isDone)
            const hasAny = !!dayOrders?.length
            const dotColor = hasActive ? '#C9848A' : hasAny ? '#7A9E7E' : null

            return (
              <div
                key={ds}
                onClick={() => setSelectedDate(isSelected ? null : ds)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '4px 2px', cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '34px', height: '34px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? '#C9848A' : isToday ? '#C9848A18' : 'transparent',
                  border: isToday && !isSelected ? '1.5px solid #C9848A' : 'none',
                }}>
                  <span style={{
                    fontSize: '14px', fontWeight: isToday || isSelected ? 700 : 400,
                    color: isSelected ? '#fff' : isToday ? '#C9848A' : '#2D2D2D',
                  }}>
                    {day}
                  </span>
                </div>
                {dotColor && (
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotColor, marginTop: '2px' }} />
                )}
                {!dotColor && <div style={{ width: '5px', height: '5px', marginTop: '2px' }} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0', fontSize: '14px' }}>Loading...</p>
      )}
      {error && (
        <div style={{ margin: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Day detail */}
      {!loading && selectedDate && (
        <div style={{ margin: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#6b7280' }}>{selectedLabel}</p>
            <span style={{
              background: '#C9848A18', color: '#C9848A',
              borderRadius: '10px', padding: '2px 10px',
              fontSize: '12px', fontWeight: 700,
            }}>
              {selectedOrders.length} order{selectedOrders.length !== 1 ? 's' : ''}
            </span>
          </div>

          {selectedOrders.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '14px', color: '#9ca3af' }}>No orders on this day</p>
              <button
                onClick={openAdd}
                style={{
                  marginTop: '12px', padding: '10px 20px',
                  background: '#C9848A', color: '#fff',
                  border: 'none', borderRadius: '10px',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 3px 10px #C9848A44',
                }}
              >
                + Add Order
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedOrders
                .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
                .map(o => (
                  <div
                    key={o.id}
                    style={{
                      background: '#fff', borderRadius: '12px', padding: '14px',
                      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                      opacity: o.isDone ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      {/* Done toggle */}
                      <button
                        onClick={() => toggleDone(o)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', marginTop: '2px' }}
                      >
                        {o.isDone
                          ? <CheckCircle2 size={20} color="#7A9E7E" />
                          : <Circle size={20} color="#d1ccc8" />}
                      </button>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <p style={{
                            fontWeight: 700, fontSize: '15px', color: '#2D2D2D',
                            textDecoration: o.isDone ? 'line-through' : 'none',
                          }}>
                            {o.customerName}
                          </p>
                          <button
                            onClick={() => openEdit(o)}
                            style={{ background: '#f3f4f6', border: 'none', borderRadius: '7px', padding: '6px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                          >
                            <Pencil size={14} color="#6b7280" />
                          </button>
                        </div>

                        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px' }}>
                          {o.description}{o.quantity && o.quantity > 1 ? ` × ${o.quantity}` : ''}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {o.time && (
                            <span style={{ fontSize: '12px', color: '#C9848A', fontWeight: 600 }}>
                              {formatTime(o.time)}
                            </span>
                          )}
                          {o.totalAmount > 0 && (
                            <span style={{ fontSize: '12px', color: '#2D2D2D', fontWeight: 600 }}>
                              {fmt(o.totalAmount)}
                            </span>
                          )}
                          {o.depositPaid > 0 && (
                            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                              dep {fmt(o.depositPaid)}
                            </span>
                          )}
                          {o.totalAmount > o.depositPaid && (
                            <span style={{ fontSize: '12px', color: '#E8A838', fontWeight: 600 }}>
                              bal {fmt(o.totalAmount - o.depositPaid)}
                            </span>
                          )}
                        </div>

                        {o.notes && (
                          <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px', fontStyle: 'italic' }}>{o.notes}</p>
                        )}
                      </div>
                    </div>

                    {o.isDone && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#7A9E7E', background: '#7A9E7E18', borderRadius: '5px', padding: '2px 8px' }}>
                          Done
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={openAdd}
        style={{
          position: 'fixed',
          bottom: 'calc(72px + 16px)',
          right: '16px',
          width: '52px', height: '52px',
          borderRadius: '50%',
          background: '#C9848A',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px #C9848A55',
          zIndex: 40,
        }}
      >
        <Plus size={24} color="#fff" strokeWidth={2.5} />
      </button>

      {showForm && (
        <OrderForm
          order={editing}
          defaultDate={selectedDate ?? undefined}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
