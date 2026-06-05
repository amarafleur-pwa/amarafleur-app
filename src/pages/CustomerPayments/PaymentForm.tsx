import { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { db } from '../../db/db'
import type { Order, Payment } from '../../db/db'
import { logPayment, deleteSheetRow } from '../../lib/sheets'
import { supabase } from '../../lib/supabase'

interface Props {
  order: Order
  onClose: () => void
  onSaved: () => void
}

const TYPES: Payment['type'][] = ['deposit', 'balance', 'full']
const TYPE_LABELS: Record<Payment['type'], string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  full: 'Full Payment',
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
  minWidth: 0,
  maxWidth: '100%',
  WebkitAppearance: 'none',
}

const lbl: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: '6px',
  display: 'block',
}

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PaymentForm({ order, onClose, onSaved }: Props) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<Payment['type']>('balance')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const handleClose = () => setClosing(true)

  function loadPayments() {
    db.payments.where('orderId').equals(order.id!).sortBy('paidAt').then(setPayments)
  }

  useEffect(() => { loadPayments() }, [order.id])

  const totalPaid = order.depositPaid + payments.reduce((s, p) => s + p.amount, 0)
  const balance = Math.max(0, order.totalAmount - totalPaid)

  async function handleSave() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setSaving(true)
    const localId = await db.payments.add({
      orderId: order.id!, amount: amt, type, paidAt,
      notes: notes.trim() || undefined, pendingSync: true,
    })
    setAmount('')
    setNotes('')
    setShowForm(false)
    loadPayments()
    onSaved()
    if (navigator.onLine && order.supabaseId) {
      const { data: row, error } = await supabase.from('payments').insert({
        order_id: order.supabaseId,
        amount: amt, type, paid_at: paidAt,
        notes: notes.trim() || null,
      }).select().single()
      if (!error) {
        await db.payments.update(localId as number, { supabaseId: row.id, pendingSync: false })
        logPayment({
          customerName: order.customerName, orderDesc: order.description,
          amount: amt, type, paidAt, notes: notes.trim() || undefined,
        }, row.id)
      }
    }
    setSaving(false)
  }

  async function deletePayment(id: number) {
    const p = await db.payments.get(id)
    if (p?.supabaseId) {
      deleteSheetRow('Payments', p.supabaseId)
      await supabase.from('payments').delete().eq('id', p.supabaseId)
    }
    await db.payments.delete(id)
    loadPayments()
    onSaved()
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={closing ? 'sheet-exit' : 'sheet-enter'}
        onAnimationEnd={(e) => { if (closing && e.animationName === 'sheet-down') onClose() }}
        style={{
          width: 'calc(100% - 32px)',
          margin: '0 16px',
          background: '#F9F3EE',
          borderRadius: '20px',
          maxHeight: '92svh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 0' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D' }}>Payments</h2>
          <button
            onClick={handleClose}
            style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
          >
            <X size={17} color="#6b7280" />
          </button>
        </div>

        {/* Order summary */}
        <div style={{ margin: '12px 20px 0', background: '#fff', borderRadius: '12px', padding: '14px' }}>
          <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D' }}>{order.customerName}</p>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{order.description}</p>
          <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{formatDate(order.dueDate)}</p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
            <div>
              <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Total</p>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(order.totalAmount)}</p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Paid</p>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#7A9E7E' }}>{fmt(totalPaid)}</p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Balance</p>
              <p style={{ fontSize: '15px', fontWeight: 700, color: balance > 0 ? '#8B1A1A' : '#7A9E7E' }}>{fmt(balance)}</p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 20px 0' }}>

          {/* Payment history */}
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280', marginBottom: '8px' }}>Payment History</p>

          {order.depositPaid > 0 && (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>Initial Deposit</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>Recorded at order creation</p>
              </div>
              <p style={{ fontWeight: 700, fontSize: '14px', color: '#7A9E7E' }}>{fmt(order.depositPaid)}</p>
            </div>
          )}

          {payments.length === 0 && order.depositPaid === 0 && (
            <p style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>No payments recorded yet.</p>
          )}

          {payments.map(p => (
            <div
              key={p.id}
              style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>{TYPE_LABELS[p.type]}</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{formatDate(p.paidAt)}{p.notes ? ` · ${p.notes}` : ''}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <p style={{ fontWeight: 700, fontSize: '14px', color: '#7A9E7E' }}>{fmt(p.amount)}</p>
                <button
                  onClick={() => deletePayment(p.id!)}
                  style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px', color: '#ef4444', fontWeight: 600 }}
                >
                  Del
                </button>
              </div>
            </div>
          ))}

          {/* New payment form */}
          {showForm ? (
            <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', marginTop: '4px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D', marginBottom: '12px' }}>Record Payment</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <span style={lbl}>Amount (₱) *</span>
                    <input style={input} type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                  <div>
                    <span style={lbl}>Date</span>
                    <input style={input} type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
                  </div>
                </div>
                <div>
                  <span style={lbl}>Type</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        style={{
                          flex: 1, padding: '9px 4px', border: 'none', borderRadius: '8px',
                          fontSize: '12px', fontWeight: type === t ? 700 : 500,
                          cursor: 'pointer',
                          background: type === t ? '#C9848A' : '#f3f4f6',
                          color: type === t ? '#fff' : '#6b7280',
                        }}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={lbl}>Notes</span>
                  <input style={input} placeholder="e.g. via GCash" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowForm(false)}
                    style={{ flex: 1, padding: '12px', background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!amount || saving}
                    style={{
                      flex: 2, padding: '12px',
                      background: amount ? '#C9848A' : '#e5e0db',
                      color: amount ? '#fff' : '#9ca3af',
                      border: 'none', borderRadius: '10px',
                      fontWeight: 700, cursor: amount ? 'pointer' : 'default',
                      fontSize: '14px',
                      boxShadow: amount ? '0 3px 10px #C9848A44' : 'none',
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            balance > 0 && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  width: '100%', padding: '13px', marginTop: '4px',
                  background: '#C9848A18', border: '1.5px dashed #C9848A',
                  borderRadius: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  color: '#C9848A', fontWeight: 700, fontSize: '14px',
                }}
              >
                <Plus size={16} /> Record Payment
              </button>
            )
          )}
        </div>

        <div style={{ height: 'calc(16px + env(safe-area-inset-bottom))' }} />
      </div>
    </div>
  )
}
