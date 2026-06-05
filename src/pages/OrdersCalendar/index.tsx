import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Pencil } from 'lucide-react'
import { db } from '../../db/db'
import type { Order, Payment } from '../../db/db'
import OrderForm from './OrderForm'
import PaymentForm from '../CustomerPayments/PaymentForm'
import { supabase } from '../../lib/supabase'
import { deleteSheetRow } from '../../lib/sheets'
import { useSyncVersion } from '../../lib/SyncContext'
import { NetworkPill } from '../../components/OfflineBanner'
import SwipeableItem from '../../components/SwipeableItem'

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

type MainView = 'log' | 'advance'

function getPaymentStatus(totalPaid: number, balance: number, orderPayments: Payment[]) {
  if (balance <= 0) return { label: 'Fully Paid', color: '#7A9E7E', bg: '#7A9E7E18' }
  if (totalPaid <= 0) return { label: 'Unpaid', color: '#C9848A', bg: '#C9848A18' }
  if (orderPayments.length === 0) return { label: 'Deposit', color: '#E8A838', bg: '#E8A83818' }
  return { label: 'Partial', color: '#E8A838', bg: '#E8A83818' }
}

export default function OrdersCalendar() {
  const syncVersion = useSyncVersion()
  const [orders, setOrders] = useState<Order[]>([])
  const [allPayments, setAllPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mainView, setMainView] = useState<MainView>('log')

  // Log tab
  const [logDate, setLogDate] = useState(todayStr())

  // Advance (calendar) tab
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr())
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null)
  const [closingPreview, setClosingPreview] = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)

  // Advance swipe + delete
  const [activeSwipeId, setActiveSwipeId] = useState<number | null>(null)
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null)

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Order | undefined>()

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = todayStr()

  function load() {
    Promise.all([db.orders.toArray(), db.payments.toArray()])
      .then(([o, p]) => { setOrders(o); setAllPayments(p); setError(null) })
      .catch(err => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [syncVersion])

  // Log tab: orders for logDate with computed payment totals
  const logItems = useMemo(() => {
    return orders
      .filter(o => o.dueDate === logDate)
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      .map(o => {
        const orderPayments = allPayments.filter(p => p.orderId === o.id)
        const totalPaid = o.depositPaid + orderPayments.reduce((s, p) => s + p.amount, 0)
        const balance = o.totalAmount - totalPaid
        return { ...o, orderPayments, totalPaid, balance }
      })
  }, [orders, allPayments, logDate])

  // Calendar: map dueDate → orders
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
  const logDateLabel = new Date(logDate + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })

  async function toggleDone(order: Order) {
    if (order.supabaseId) {
      await supabase.from('orders').update({ is_done: !order.isDone }).eq('id', order.supabaseId)
    }
    await db.orders.update(order.id!, { isDone: !order.isDone })
    load()
  }

  async function handleDeleteAdvanceOrder(order: Order) {
    if (order.supabaseId) {
      deleteSheetRow('Orders', order.supabaseId)
      await supabase.from('orders').delete().eq('id', order.supabaseId)
    }
    await db.payments.where('orderId').equals(order.id!).delete()
    await db.orders.delete(order.id!)
    load()
  }

  function stepLogDate(days: number) {
    setLogDate(d => {
      const dt = new Date(d + 'T00:00:00')
      dt.setDate(dt.getDate() + days)
      return dt.toISOString().split('T')[0]
    })
  }

  function openAdd() { setEditing(undefined); setShowForm(true) }
  function openEdit(order: Order) { setEditing(order); setShowForm(true) }

  function prevMonth() {
    setViewDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd })
    setSelectedDate(null)
  }
  function nextMonth() {
    setViewDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd })
    setSelectedDate(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: '24px' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>Orders</h1>
            <NetworkPill />
          </div>
          <button
            onClick={openAdd}
            style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#C9848A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px #C9848A55' }}
          >
            <Plus size={20} color="#fff" strokeWidth={2.5} />
          </button>
        </div>

        {/* Sub-tab bar */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
          {(['log', 'advance'] as MainView[]).map(v => (
            <button
              key={v}
              onClick={() => setMainView(v)}
              style={{
                padding: '6px 20px', borderRadius: '20px', border: 'none',
                fontSize: '13px', fontWeight: mainView === v ? 700 : 500,
                cursor: 'pointer',
                background: mainView === v ? '#C9848A' : '#fff',
                color: mainView === v ? '#fff' : '#6b7280',
                boxShadow: mainView === v ? '0 2px 8px #C9848A33' : 'none',
              }}
            >
              {v === 'log' ? 'Log' : 'Advance'}
            </button>
          ))}
        </div>
      </div>

      {/* ===== LOG VIEW ===== */}
      {mainView === 'log' && (
        <div style={{ flex: 1, padding: '12px 16px 0' }}>

          {/* Date navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: '12px' }}>
            <button onClick={() => stepLogDate(-1)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
              <ChevronLeft size={18} color="#6b7280" />
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>{logDateLabel}</p>
              {logDate !== today && (
                <button onClick={() => setLogDate(today)} style={{ fontSize: '11px', color: '#C9848A', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0', fontWeight: 600 }}>
                  Jump to today
                </button>
              )}
            </div>
            <button onClick={() => stepLogDate(1)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
              <ChevronRight size={18} color="#6b7280" />
            </button>
          </div>

          {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0', fontSize: '14px' }}>Loading...</p>}
          {error && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}

          {!loading && logItems.length === 0 && (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '14px', color: '#9ca3af' }}>No orders for this date</p>
              <button
                onClick={openAdd}
                style={{ marginTop: '12px', padding: '10px 20px', background: '#C9848A', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 10px #C9848A44' }}
              >
                + Add Order
              </button>
            </div>
          )}

          {!loading && logItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logItems.map(o => {
                const status = getPaymentStatus(o.totalPaid, o.balance, o.orderPayments)
                const fulfillment = o.fulfillmentType ?? 'pickup'
                return (
                  <div key={o.id} style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', opacity: o.isDone ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <button
                        onClick={() => toggleDone(o)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', marginTop: '1px' }}
                      >
                        {o.isDone ? <CheckCircle2 size={20} color="#7A9E7E" /> : <Circle size={20} color="#d1ccc8" />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D', textDecoration: o.isDone ? 'line-through' : 'none', margin: 0 }}>
                            {o.customerName}
                          </p>
                          <button
                            onClick={() => openEdit(o)}
                            style={{ background: '#f3f4f6', border: 'none', borderRadius: '7px', padding: '6px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                          >
                            <Pencil size={14} color="#6b7280" />
                          </button>
                        </div>
                        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px', marginBottom: 0 }}>
                          {o.description}{o.quantity && o.quantity > 1 ? ` × ${o.quantity}` : ''}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, borderRadius: '5px', padding: '2px 8px',
                            color: fulfillment === 'delivery' ? '#7A9E7E' : '#C9848A',
                            background: fulfillment === 'delivery' ? '#7A9E7E18' : '#C9848A18',
                          }}>
                            {fulfillment === 'delivery' ? '🚚 Delivered' : '🌸 Picked up'}
                          </span>
                          {o.time && (
                            <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>{formatTime(o.time)}</span>
                          )}
                          <span style={{ fontSize: '11px', fontWeight: 700, color: status.color, background: status.bg, borderRadius: '5px', padding: '2px 8px' }}>
                            {status.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {o.totalAmount > 0 && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-around' }}>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px' }}>Total</p>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>{fmt(o.totalAmount)}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px' }}>Paid</p>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: '#7A9E7E', margin: 0 }}>{fmt(o.totalPaid)}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px' }}>Balance</p>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: o.balance > 0 ? '#E8A838' : '#7A9E7E', margin: 0 }}>{fmt(Math.max(0, o.balance))}</p>
                        </div>
                      </div>
                    )}

                    {o.notes && (
                      <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', fontStyle: 'italic', marginBottom: 0 }}>{o.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== ADVANCE (CALENDAR) VIEW ===== */}
      {mainView === 'advance' && (
        <>
          {/* Calendar card */}
          <div style={{ margin: '12px 16px 0', background: '#fff', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
              <button onClick={prevMonth} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
                <ChevronLeft size={18} color="#6b7280" />
              </button>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D' }}>{monthLabel}</span>
              <button onClick={nextMonth} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
                <ChevronRight size={18} color="#6b7280" />
              </button>
            </div>

            {/* Day labels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px' }}>
              {DAY_LABELS.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}>{d}</div>
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
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 2px', cursor: 'pointer' }}
                  >
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? '#C9848A' : isToday ? '#C9848A18' : 'transparent',
                      border: isToday && !isSelected ? '1.5px solid #C9848A' : 'none',
                    }}>
                      <span style={{ fontSize: '14px', fontWeight: isToday || isSelected ? 700 : 400, color: isSelected ? '#fff' : isToday ? '#C9848A' : '#2D2D2D' }}>
                        {day}
                      </span>
                    </div>
                    {dotColor
                      ? <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotColor, marginTop: '2px' }} />
                      : <div style={{ width: '5px', height: '5px', marginTop: '2px' }} />
                    }
                  </div>
                )
              })}
            </div>
          </div>

          {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0', fontSize: '14px' }}>Loading...</p>}
          {error && <div style={{ margin: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>{error}</div>}

          {/* Day detail */}
          {!loading && selectedDate && (
            <div style={{ margin: '12px 16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#6b7280' }}>{selectedLabel}</p>
                <span style={{ background: '#C9848A18', color: '#C9848A', borderRadius: '10px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
                  {selectedOrders.length} order{selectedOrders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {selectedOrders.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '14px', color: '#9ca3af' }}>No orders on this day</p>
                  <button
                    onClick={openAdd}
                    style={{ marginTop: '12px', padding: '10px 20px', background: '#C9848A', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 10px #C9848A44' }}
                  >
                    + Add Order
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedOrders
                    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
                    .map(o => {
                      const fulfillment = o.fulfillmentType ?? 'pickup'
                      const fulfillLabel = o.isDone
                        ? (fulfillment === 'delivery' ? '🚚 Delivered' : '🌸 Picked up')
                        : (fulfillment === 'delivery' ? '🚚 Delivery' : '🌸 Pickup')
                      return (
                        <SwipeableItem
                          key={o.id}
                          id={o.id!}
                          activeId={activeSwipeId}
                          onActivate={setActiveSwipeId}
                          onPaid={() => toggleDone(o)}
                          onEdit={() => openEdit(o)}
                          onDelete={() => setPendingDeleteOrder(o)}
                        >
                          <div
                            onClick={() => setPreviewOrder(o)}
                            style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', opacity: o.isDone ? 0.6 : 1, cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <button
                                onClick={e => { e.stopPropagation(); toggleDone(o) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', marginTop: '2px' }}
                              >
                                {o.isDone ? <CheckCircle2 size={20} color="#7A9E7E" /> : <Circle size={20} color="#d1ccc8" />}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D', textDecoration: o.isDone ? 'line-through' : 'none', margin: 0 }}>
                                  {o.customerName}
                                </p>
                                <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px', marginBottom: 0 }}>
                                  {o.description}{o.quantity && o.quantity > 1 ? ` × ${o.quantity}` : ''}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                  <span style={{
                                    fontSize: '11px', fontWeight: 700, borderRadius: '5px', padding: '2px 8px',
                                    color: fulfillment === 'delivery' ? '#7A9E7E' : '#C9848A',
                                    background: fulfillment === 'delivery' ? '#7A9E7E18' : '#C9848A18',
                                  }}>
                                    {fulfillLabel}
                                  </span>
                                  {o.time && <span style={{ fontSize: '12px', color: '#C9848A', fontWeight: 600 }}>{formatTime(o.time)}</span>}
                                  {o.totalAmount > 0 && <span style={{ fontSize: '12px', color: '#2D2D2D', fontWeight: 600 }}>{fmt(o.totalAmount)}</span>}
                                  {o.depositPaid > 0 && <span style={{ fontSize: '12px', color: '#9ca3af' }}>dep {fmt(o.depositPaid)}</span>}
                                  {o.totalAmount > o.depositPaid && <span style={{ fontSize: '12px', color: '#E8A838', fontWeight: 600 }}>bal {fmt(o.totalAmount - o.depositPaid)}</span>}
                                </div>
                                {o.notes && <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px', fontStyle: 'italic', marginBottom: 0 }}>{o.notes}</p>}
                              </div>
                            </div>

                            {o.isDone && (
                              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#7A9E7E', background: '#7A9E7E18', borderRadius: '5px', padding: '2px 8px' }}>Done</span>
                              </div>
                            )}
                          </div>
                        </SwipeableItem>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* Order preview sheet */}
          {previewOrder && (
            <div
              onClick={() => setClosingPreview(true)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
            >
              <div
                onClick={e => e.stopPropagation()}
                className={closingPreview ? 'sheet-exit' : 'sheet-enter'}
                onAnimationEnd={e => { if (closingPreview && e.animationName === 'sheet-down') { setPreviewOrder(null); setClosingPreview(false) } }}
                style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '85svh', overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
                  <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
                </div>
                <div style={{ padding: '12px 20px 24px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D', margin: 0, flex: 1, marginRight: '12px' }}>{previewOrder.customerName}</h2>
                    {previewOrder.totalAmount > 0 && (
                      <p style={{ fontSize: '20px', fontWeight: 800, color: '#2D2D2D', margin: 0, flexShrink: 0 }}>{fmt(previewOrder.totalAmount)}</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {previewOrder.isDone && (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#7A9E7E', background: '#7A9E7E18', borderRadius: '6px', padding: '3px 10px' }}>Done</span>
                    )}
                    <span style={{
                      fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '3px 10px',
                      color: (previewOrder.fulfillmentType ?? 'pickup') === 'delivery' ? '#7A9E7E' : '#C9848A',
                      background: (previewOrder.fulfillmentType ?? 'pickup') === 'delivery' ? '#7A9E7E18' : '#C9848A18',
                    }}>
                      {(previewOrder.fulfillmentType ?? 'pickup') === 'delivery' ? '🚚 Delivery' : '🌸 Pickup'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: '#9ca3af' }}>Description</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D', maxWidth: '60%', textAlign: 'right' }}>
                        {previewOrder.description}{previewOrder.quantity && previewOrder.quantity > 1 ? ` × ${previewOrder.quantity}` : ''}
                      </span>
                    </div>
                    {previewOrder.time && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af' }}>Time</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#C9848A' }}>{formatTime(previewOrder.time)}</span>
                      </div>
                    )}
                    {(() => {
                      const orderPayments = allPayments.filter(p => p.orderId === previewOrder.id)
                      const totalPaid = previewOrder.depositPaid + orderPayments.reduce((s, p) => s + p.amount, 0)
                      const balance = previewOrder.totalAmount - totalPaid
                      return (
                        <>
                          {previewOrder.depositPaid > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '13px', color: '#9ca3af' }}>Deposit paid</span>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#7A9E7E' }}>{fmt(previewOrder.depositPaid)}</span>
                            </div>
                          )}
                          {orderPayments.length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '13px', color: '#9ca3af' }}>Total paid</span>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#7A9E7E' }}>{fmt(totalPaid)}</span>
                            </div>
                          )}
                          {balance > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '13px', color: '#9ca3af' }}>Balance</span>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#E8A838' }}>{fmt(balance)}</span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    {previewOrder.notes && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af' }}>Notes</span>
                        <span style={{ fontSize: '13px', color: '#2D2D2D', fontStyle: 'italic' }}>{previewOrder.notes}</span>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const orderPayments = allPayments.filter(p => p.orderId === previewOrder.id)
                    const totalPaid = previewOrder.depositPaid + orderPayments.reduce((s, p) => s + p.amount, 0)
                    const balance = previewOrder.totalAmount - totalPaid
                    return previewOrder.totalAmount > 0 && balance > 0 && (
                      <button
                        onClick={() => setShowPayForm(true)}
                        style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#7A9E7E', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #7A9E7E44', marginBottom: '10px' }}
                      >
                        Log Payment
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => { setClosingPreview(true); openEdit(previewOrder) }}
                    style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#E8A838', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #E8A83844' }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Delete confirmation */}
          {pendingDeleteOrder && (
            <div
              onClick={() => setPendingDeleteOrder(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
              >
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', marginBottom: '6px' }}>Delete order?</p>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}>
                  "{pendingDeleteOrder.customerName}" will be permanently deleted.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setPendingDeleteOrder(null)}
                    style={{ flex: 1, padding: '12px', border: '1.5px solid #e5e0db', borderRadius: '10px', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#6b7280' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { const o = pendingDeleteOrder; setPendingDeleteOrder(null); handleDeleteAdvanceOrder(o) }}
                    style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#C9848A', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff', boxShadow: '0 2px 8px #C9848A44' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {previewOrder && showPayForm && (
        <PaymentForm
          order={previewOrder}
          onClose={() => setShowPayForm(false)}
          onSaved={() => { setShowPayForm(false); load() }}
        />
      )}

      {showForm && (
        <OrderForm
          order={editing}
          defaultDate={mainView === 'log' ? logDate : (selectedDate ?? undefined)}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
