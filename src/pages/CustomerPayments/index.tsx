import { useEffect, useRef, useState } from 'react'
import { Plus, X, Phone, FileText, Search } from 'lucide-react'
import { db } from '../../db/db'
import type { Order, Payment, Customer } from '../../db/db'
import PaymentForm from './PaymentForm'
import { dbWrite } from '../../lib/dbGateway'
import { getCurrentUser } from '../../lib/currentUser'
import { logCustomer, deleteSheetRow, logPayment } from '../../lib/sheets'
import { useSyncVersion } from '../../lib/SyncContext'
import { NetworkPill } from '../../components/OfflineBanner'
import SwipeableItem from '../../components/SwipeableItem'

type View = 'payments' | 'directory'
type StatusFilter = 'all' | 'outstanding' | 'paid'

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function getStatus(order: Order, orderPayments: Payment[]) {
  const totalPaid = order.depositPaid + orderPayments.reduce((s, p) => s + p.amount, 0)
  const balance = order.totalAmount - totalPaid
  if (balance <= 0) return { label: 'Fully Paid', color: '#7A9E7E', bg: '#7A9E7E18', balance: 0, totalPaid }
  if (totalPaid <= 0) return { label: 'Unpaid', color: '#C9848A', bg: '#C9848A18', balance, totalPaid }
  if (orderPayments.length === 0) return { label: 'Deposit', color: '#E8A838', bg: '#E8A83818', balance, totalPaid }
  return { label: 'Partial', color: '#E8A838', bg: '#E8A83818', balance, totalPaid }
}

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Deposit', balance: 'Balance', full: 'Full Payment',
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '1.5px solid #e5e0db',
  borderRadius: '10px',
  fontSize: '15px',
  color: '#2D2D2D',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: '6px',
  display: 'block',
}

export default function CustomerPayments() {
  const syncVersion = useSyncVersion()
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('payments')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)

  // Customer form state
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>()
  const [cName, setCName] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cNotes, setCNotes] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null)
  const [closingPreviewOrder, setClosingPreviewOrder] = useState(false)
  const [closingDetail, setClosingDetail] = useState(false)
  const handleCloseDetail = () => setClosingDetail(true)
  const [closingCustomerForm, setClosingCustomerForm] = useState(false)
  const handleCloseCustomerForm = () => setClosingCustomerForm(true)

  const [activeSwipeId, setActiveSwipeId] = useState<number | null>(null)
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<Order | null>(null)
  const [pendingBalancePay, setPendingBalancePay] = useState<Order | null>(null)
  const balancePaying = useRef(false)

  function load() {
    Promise.all([
      db.orders.orderBy('dueDate').reverse().toArray(),
      db.payments.toArray(),
      db.customers.orderBy('name').toArray(),
    ])
      .then(([o, p, c]) => {
        setOrders(o)
        setPayments(p)
        setCustomers(c)
        setError(null)
      })
      .catch(err => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [syncVersion])

  async function handleDeleteOrder(order: Order) {
    const linkedPayments = await db.payments.where('orderId').equals(order.id!).toArray()
    for (const p of linkedPayments) {
      if (p.supabaseId) deleteSheetRow('Payments', p.supabaseId)
    }
    if (order.supabaseId) {
      deleteSheetRow('Payments', order.supabaseId + ':deposit')
      deleteSheetRow(order.isDone ? 'Orders' : 'Advance Orders', order.supabaseId)
      const { error } = await dbWrite('orders', 'delete', { eq: { id: order.supabaseId } })
      if (error) console.error('[delete-order]', error.message)
    }
    await db.payments.where('orderId').equals(order.id!).delete()
    await db.orders.delete(order.id!)
    setPendingDeleteOrder(null)
    load()
  }

  function openCustomerForm(customer?: Customer) {
    setEditingCustomer(customer)
    setCName(customer?.name ?? '')
    setCPhone(customer?.phone ?? '')
    setCNotes(customer?.notes ?? '')
    setShowCustomerForm(true)
  }

  async function saveCustomer() {
    if (!cName.trim()) return
    setSavingCustomer(true)
    try {
      const data: Omit<Customer, 'id'> = {
        name: cName.trim(),
        phone: cPhone.trim() || undefined,
        notes: cNotes.trim() || undefined,
        loggedBy: editingCustomer?.id ? editingCustomer.loggedBy : getCurrentUser(),
      }
      if (editingCustomer?.id) {
        if (editingCustomer.supabaseId) {
          const { error } = await dbWrite('customers', 'update', {
            payload: { name: data.name, phone: data.phone ?? null, notes: data.notes ?? null },
            eq: { id: editingCustomer.supabaseId },
          })
          if (error) throw error
        }
        await db.customers.update(editingCustomer.id, data)
      } else {
        const { data: row, error } = await dbWrite<{ id: string }>('customers', 'insert', {
          payload: {
            name: data.name, phone: data.phone ?? null, notes: data.notes ?? null,
            logged_by: data.loggedBy ?? null,
          },
          select: true, single: true,
        })
        if (error || !row) throw error ?? new Error('Insert failed')
        await db.customers.add({ ...data, supabaseId: row.id })
        logCustomer(data, row.id)
      }
      handleCloseCustomerForm()
      load()
    } finally {
      setSavingCustomer(false)
    }
  }

  async function deleteCustomer() {
    if (!editingCustomer?.id) return
    if (editingCustomer.supabaseId) {
      deleteSheetRow('Customers', editingCustomer.supabaseId)
      await dbWrite('customers', 'delete', { eq: { id: editingCustomer.supabaseId } })
    }
    await db.customers.delete(editingCustomer.id)
    handleCloseCustomerForm()
    load()
  }

  // Build per-order payment map
  const paymentMap = new Map<number, Payment[]>()
  for (const p of payments) {
    const list = paymentMap.get(p.orderId) ?? []
    list.push(p)
    paymentMap.set(p.orderId, list)
  }

  async function handleBalancePaid(order: Order) {
    if (balancePaying.current) return
    balancePaying.current = true
    try {
      const s = getStatus(order, paymentMap.get(order.id!) ?? [])
      if (s.balance <= 0) return
      const loggedBy = getCurrentUser()
      const today = new Date().toISOString().split('T')[0]
      if (navigator.onLine && order.supabaseId) {
        const { data: row, error } = await dbWrite<{ id: string }>('payments', 'insert', {
          payload: {
            order_id: order.supabaseId,
            amount: s.balance, type: 'balance', paid_at: today,
            notes: null, logged_by: loggedBy || null,
          },
          select: true, single: true,
        })
        console.log('[pay-balance] dbWrite', { data: row, error })
        if (!error && row) {
          await db.payments.add({
            orderId: order.id!, amount: s.balance, type: 'balance', paidAt: today,
            supabaseId: row.id, pendingSync: false, loggedBy,
          })
          logPayment({
            customerName: order.customerName, orderDesc: order.description,
            amount: s.balance, type: 'balance', paidAt: today, loggedBy,
          }, row.id)
        } else {
          await db.payments.add({
            orderId: order.id!, amount: s.balance, type: 'balance', paidAt: today,
            pendingSync: true, loggedBy,
          })
        }
      } else {
        await db.payments.add({
          orderId: order.id!, amount: s.balance, type: 'balance', paidAt: today,
          pendingSync: true, loggedBy,
        })
      }
      setPendingBalancePay(null)
      setClosingPreviewOrder(true)
      load()
    } finally {
      balancePaying.current = false
    }
  }

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'outstanding', label: 'Outstanding' },
    { key: 'paid', label: 'Fully Paid' },
  ]

  const q = search.toLowerCase()
  const filteredOrders = orders.filter(o => {
    const s = getStatus(o, paymentMap.get(o.id!) ?? [])
    if (statusFilter === 'outstanding' && s.balance <= 0) return false
    if (statusFilter === 'paid' && s.balance > 0) return false
    if (q && !o.customerName.toLowerCase().includes(q) && !o.description.toLowerCase().includes(q)) return false
    return true
  })

  // Outstanding total
  const outstandingTotal = orders.reduce((sum, o) => {
    const s = getStatus(o, paymentMap.get(o.id!) ?? [])
    return sum + s.balance
  }, 0)

  const detailOrders = detailCustomer
    ? orders.filter(o => o.customerName.toLowerCase() === detailCustomer.name.toLowerCase()).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    : []
  const detailTotalAmount = detailOrders.reduce((s, o) => s + o.totalAmount, 0)
  const detailOutstanding = detailOrders.reduce((s, o) => s + getStatus(o, paymentMap.get(o.id!) ?? []).balance, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: '24px' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>Customer Payments</h1>
            <NetworkPill />
          </div>
          {view === 'directory' && (
            <button
              onClick={() => openCustomerForm()}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: '#C9848A', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px #C9848A55',
              }}
            >
              <Plus size={20} color="#fff" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          {(['payments', 'directory'] as View[]).map(v => {
            const active = view === v
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '7px 20px', borderRadius: '20px', border: 'none',
                  fontSize: '13px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  background: active ? '#C9848A' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #C9848A33' : 'none',
                  textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            )
          })}
        </div>
      </div>

      {/* Loading / error */}
      {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>Loading...</p>}
      {error && (
        <div style={{ margin: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* ─── PAYMENTS VIEW ─── */}
      {!loading && view === 'payments' && (
        <div style={{ padding: '12px 16px 0' }}>

          {/* Outstanding banner */}
          {outstandingTotal > 0 && (
            <div style={{
              background: '#C9848A12', border: '1.5px solid #C9848A33',
              borderRadius: '12px', padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '12px',
            }}>
              <div>
                <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Total Outstanding</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(outstandingTotal)}</p>
              </div>
              <span style={{ background: '#C9848A', color: '#fff', borderRadius: '12px', padding: '3px 12px', fontSize: '13px', fontWeight: 700 }}>
                {orders.filter(o => getStatus(o, paymentMap.get(o.id!) ?? []).balance > 0).length} orders
              </span>
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              placeholder="Search by customer or order..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1.5px solid #e5e0db', borderRadius: '10px', fontSize: '14px', color: '#2D2D2D', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {statusFilters.map(f => {
              const active = statusFilter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  style={{
                    padding: '6px 14px', borderRadius: '16px', border: 'none',
                    fontSize: '12px', fontWeight: active ? 700 : 500, cursor: 'pointer',
                    background: active ? '#2D2D2D' : '#fff',
                    color: active ? '#fff' : '#6b7280',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {filteredOrders.length === 0 && (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>
              {orders.length === 0 ? 'No orders yet. Add orders in the Calendar tab.' : 'No orders match this filter.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredOrders.map(o => {
              const s = getStatus(o, paymentMap.get(o.id!) ?? [])
              const orderPmts = paymentMap.get(o.id!) ?? []
              const lastPmt = [...orderPmts].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]
              return (
                <SwipeableItem
                  key={o.id}
                  id={o.id!}
                  activeId={activeSwipeId}
                  onActivate={setActiveSwipeId}
                  onPreview={() => setPreviewOrder(o)}
                  onEdit={() => setPreviewOrder(o)}
                  onDelete={() => setPendingDeleteOrder(o)}
                >
                  <div
                    style={{
                      background: '#fff', borderRadius: '12px', padding: '14px',
                      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D' }}>{o.customerName}</p>
                        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.description}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDate(o.dueDate)}</span>
                          <span style={{
                            display: 'inline-block', fontSize: '11px', fontWeight: 700,
                            color: s.color, background: s.bg,
                            borderRadius: '5px', padding: '3px 8px',
                          }}>
                            {s.label}
                          </span>
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(o.totalAmount)}</p>
                      </div>
                    </div>
                    {s.balance > 0 && (
                      <div style={{
                        marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6',
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>Paid: {fmt(s.totalPaid)}</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#8B1A1A' }}>Balance: {fmt(s.balance)}</span>
                      </div>
                    )}
                    {s.balance > 0 && lastPmt && (
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                        Last: {fmt(lastPmt.amount)}{lastPmt.loggedBy ? ` · ${lastPmt.loggedBy}` : ''}
                      </p>
                    )}
                  </div>
                </SwipeableItem>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── DIRECTORY VIEW ─── */}
      {!loading && view === 'directory' && (
        <div style={{ padding: '12px 16px 0' }}>
          {customers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: '15px', color: '#9ca3af' }}>No customers yet. Tap + to add one.</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {customers.map(c => {
              const orderCount = orders.filter(o => o.customerName.toLowerCase() === c.name.toLowerCase()).length
              return (
                <div
                  key={c.id}
                  onClick={() => setDetailCustomer(c)}
                  style={{
                    background: '#fff', borderRadius: '12px', padding: '14px',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.06)', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D' }}>{c.name}</p>
                    {orderCount > 0 && (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {orderCount} order{orderCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {c.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
                      <Phone size={12} color="#9ca3af" />
                      <p style={{ fontSize: '13px', color: '#6b7280' }}>{c.phone}</p>
                    </div>
                  )}
                  {c.notes && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <FileText size={12} color="#9ca3af" />
                      <p style={{ fontSize: '13px', color: '#6b7280' }}>{c.notes}</p>
                    </div>
                  )}
                  {c.loggedBy && (
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '5px 0 0' }}>👤 {c.loggedBy}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* Order preview sheet */}
      {previewOrder && (
        <div
          onClick={() => setClosingPreviewOrder(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={closingPreviewOrder ? 'sheet-exit' : 'sheet-enter'}
            onAnimationEnd={e => { if (closingPreviewOrder && e.animationName === 'sheet-down') { setPreviewOrder(null); setClosingPreviewOrder(false) } }}
            style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '85svh', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
            </div>
            <div style={{ padding: '12px 20px 24px', overflowY: 'auto' }}>
              {(() => {
                const s = getStatus(previewOrder, paymentMap.get(previewOrder.id!) ?? [])
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D', margin: 0, flex: 1, marginRight: '12px' }}>{previewOrder.customerName}</h2>
                      <p style={{ fontSize: '20px', fontWeight: 800, color: '#2D2D2D', margin: 0, flexShrink: 0 }}>{fmt(previewOrder.totalAmount)}</p>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: s.color, background: s.bg, borderRadius: '6px', padding: '3px 10px' }}>{s.label}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af' }}>Description</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D', maxWidth: '60%', textAlign: 'right' }}>{previewOrder.description}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#9ca3af' }}>Due date</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>{formatDate(previewOrder.dueDate)}</span>
                      </div>
                      {s.totalPaid > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#9ca3af' }}>Paid so far</span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#7A9E7E' }}>{fmt(s.totalPaid)}</span>
                        </div>
                      )}
                      {s.balance > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#9ca3af' }}>Balance</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B1A1A' }}>{fmt(s.balance)}</span>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const previewPmts = paymentMap.get(previewOrder.id!) ?? []
                      const hasHistory = previewOrder.depositPaid > 0 || previewPmts.length > 0
                      return hasHistory && (
                        <div style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280', marginBottom: '8px' }}>Payment History</p>
                          {previewOrder.depositPaid > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>Initial Deposit</p>
                                <p style={{ fontSize: '11px', color: '#9ca3af' }}>Recorded at order creation</p>
                              </div>
                              <p style={{ fontSize: '14px', fontWeight: 700, color: '#7A9E7E' }}>{fmt(previewOrder.depositPaid)}</p>
                            </div>
                          )}
                          {previewPmts.map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>{TYPE_LABELS[p.type]}</p>
                                <p style={{ fontSize: '11px', color: '#9ca3af' }}>
                                  {formatDate(p.paidAt)}{p.notes ? ` · ${p.notes}` : ''}{p.loggedBy ? ` · 👤 ${p.loggedBy}` : ''}
                                </p>
                              </div>
                              <p style={{ fontSize: '14px', fontWeight: 700, color: '#7A9E7E' }}>{fmt(p.amount)}</p>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {s.balance > 0 && (
                      <>
                        <button
                          onClick={() => { setClosingPreviewOrder(true); setSelectedOrder(previewOrder) }}
                          style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#7A9E7E', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #7A9E7E44', marginBottom: '10px' }}
                        >
                          Log Payment
                        </button>
                        <button
                          onClick={() => setPendingBalancePay(previewOrder)}
                          style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#C9848A', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #C9848A44' }}
                        >
                          Balance Paid
                        </button>
                      </>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Payment form modal */}
      {selectedOrder && (
        <PaymentForm
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onSaved={load}
        />
      )}

      {/* Customer detail drawer */}
      {detailCustomer && (
        <div
          onClick={handleCloseDetail}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={closingDetail ? 'sheet-exit' : 'sheet-enter'}
            onAnimationEnd={(e) => { if (closingDetail && e.animationName === 'sheet-down') { setDetailCustomer(null); setClosingDetail(false) } }}
            style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '85svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>{detailCustomer.name}</h2>
                {detailCustomer.phone && <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>📞 {detailCustomer.phone}</p>}
                {detailCustomer.notes && <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0' }}>📝 {detailCustomer.notes}</p>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setDetailCustomer(null); openCustomerForm(detailCustomer) }}
                  style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#6b7280' }}
                >
                  Edit
                </button>
                <button
                  onClick={handleCloseDetail}
                  style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={17} color="#6b7280" />
                </button>
              </div>
            </div>

            {/* Stats strip */}
            <div style={{ display: 'flex', borderTop: '1px solid #e5e0db', borderBottom: '1px solid #e5e0db', background: '#fff' }}>
              {[
                { label: 'Orders', value: String(detailOrders.length), color: '#2D2D2D' },
                { label: 'Total', value: fmt(detailTotalAmount), color: '#2D2D2D' },
                { label: 'Outstanding', value: fmt(detailOutstanding), color: detailOutstanding > 0 ? '#C9848A' : '#7A9E7E' },
              ].map((stat, i) => (
                <div key={stat.label} style={{ flex: 1, padding: '12px 8px', textAlign: 'center', borderRight: i < 2 ? '1px solid #e5e0db' : 'none' }}>
                  <p style={{ fontSize: '15px', fontWeight: 800, color: stat.color, margin: 0 }}>{stat.value}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Order history */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 20px' }}>
              {detailOrders.length === 0 ? (
                <p style={{ fontSize: '14px', color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>No orders yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {detailOrders.map(o => {
                    const s = getStatus(o, paymentMap.get(o.id!) ?? [])
                    return (
                      <div key={o.id} style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 600, fontSize: '14px', color: '#2D2D2D', margin: 0 }}>
                              {o.description}{o.quantity && o.quantity > 1 ? ` ×${o.quantity}` : ''}
                            </p>
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '3px 0 0' }}>{formatDate(o.dueDate)}</p>
                          </div>
                          <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                            <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, color: s.color, background: s.bg, borderRadius: '5px', padding: '2px 7px' }}>
                              {s.label}
                            </span>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#2D2D2D', margin: '4px 0 0' }}>{fmt(o.totalAmount)}</p>
                            {s.balance > 0 && <p style={{ fontSize: '11px', color: '#8B1A1A', margin: '2px 0 0' }}>Balance: {fmt(s.balance)}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer form modal */}
      {showCustomerForm && (
        <div
          onClick={handleCloseCustomerForm}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={closingCustomerForm ? 'sheet-exit' : 'sheet-enter'}
            onAnimationEnd={(e) => { if (closingCustomerForm && e.animationName === 'sheet-down') { setShowCustomerForm(false); setClosingCustomerForm(false) } }}
            style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '85svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D' }}>
                {editingCustomer ? 'Edit Customer' : 'New Customer'}
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editingCustomer && (
                  <button
                    onClick={deleteCustomer}
                    style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#ef4444' }}
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={handleCloseCustomerForm}
                  style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={17} color="#6b7280" />
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 20px 0', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <span style={lbl}>Name *</span>
                  <input style={input} placeholder="e.g. Maria Santos" value={cName} onChange={e => setCName(e.target.value)} />
                </div>
                <div>
                  <span style={lbl}>Phone</span>
                  <input style={input} type="tel" placeholder="e.g. 09171234567" value={cPhone} onChange={e => setCPhone(e.target.value)} />
                </div>
                <div>
                  <span style={lbl}>Notes</span>
                  <textarea
                    style={{ ...input, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Preferences, allergies, etc."
                    value={cNotes}
                    onChange={e => setCNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              <button
                onClick={saveCustomer}
                disabled={!cName.trim() || savingCustomer}
                style={{
                  width: '100%', padding: '15px',
                  background: cName.trim() ? '#C9848A' : '#e5e0db',
                  color: cName.trim() ? '#fff' : '#9ca3af',
                  border: 'none', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 700,
                  cursor: cName.trim() ? 'pointer' : 'default',
                  boxShadow: cName.trim() ? '0 4px 14px #C9848A44' : 'none',
                }}
              >
                {savingCustomer ? 'Saving...' : editingCustomer ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete order confirmation */}
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
                onClick={() => { const o = pendingDeleteOrder; setPendingDeleteOrder(null); handleDeleteOrder(o) }}
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#C9848A', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff', boxShadow: '0 2px 8px #C9848A44' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Balance paid confirmation */}
      {pendingBalancePay && (
        <div
          onClick={() => setPendingBalancePay(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
          >
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', marginBottom: '6px' }}>Confirm balance payment?</p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '4px' }}>{pendingBalancePay.customerName}</p>
            <p style={{ fontSize: '20px', fontWeight: 800, color: '#7A9E7E', marginBottom: '20px' }}>
              {fmt(getStatus(pendingBalancePay, paymentMap.get(pendingBalancePay.id!) ?? []).balance)}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPendingBalancePay(null)}
                style={{ flex: 1, padding: '12px', border: '1.5px solid #e5e0db', borderRadius: '10px', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#6b7280' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleBalancePaid(pendingBalancePay)}
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#7A9E7E', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff', boxShadow: '0 2px 8px #7A9E7E44' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
