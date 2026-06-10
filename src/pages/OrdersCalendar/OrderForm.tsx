import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import type { Order } from '../../db/db'
import { logOrder, updateOrder, deleteSheetRow } from '../../lib/sheets'
import { dbWrite } from '../../lib/dbGateway'
import { getCurrentUser } from '../../lib/currentUser'

interface Props {
  order?: Order
  defaultDate?: string
  mode?: 'log' | 'advance'
  onClose: () => void
  onSaved: () => void
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

export default function OrderForm({ order, defaultDate, mode = 'advance', onClose, onSaved }: Props) {
  const isEdit = !!order?.id

  const [customerName, setCustomerName] = useState(order?.customerName ?? '')
  const [arrangementType, setArrangementType] = useState(() =>
    order?.description?.split(' - ')[0] ?? ''
  )
  const [arrangementVariant, setArrangementVariant] = useState(() => {
    const parts = order?.description?.split(' - ')
    return parts && parts.length > 1 ? parts[1] : ''
  })
  const description = arrangementVariant
    ? `${arrangementType} - ${arrangementVariant}`
    : arrangementType
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>(order?.fulfillmentType ?? 'pickup')
  const [quantity, setQuantity] = useState(order?.quantity?.toString() ?? '1')
  const [dueDate, setDueDate] = useState(order?.dueDate ?? defaultDate ?? '')
  const [time, setTime] = useState(order?.time ?? '')
  const [totalAmount, setTotalAmount] = useState(order?.totalAmount ? order.totalAmount.toString() : '')
  const [depositPaid, setDepositPaid] = useState(order?.depositPaid?.toString() ?? '')
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>(() => {
    if (!order) return 'full'
    const dp = order.depositPaid ?? 0
    const ta = order.totalAmount ?? 0
    return dp > 0 && dp < ta ? 'partial' : 'full'
  })
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const handleClose = () => setClosing(true)

  const variantRequired = arrangementType === 'Fresh flower bouquet' || arrangementType === 'Limited Edition (Seasonal)'
  const canSave = customerName.trim() && arrangementType && (!variantRequired || arrangementVariant) && dueDate &&
    totalAmount && parseFloat(totalAmount) > 0 &&
    (mode === 'log' || paymentType === 'full' || (depositPaid !== '' && parseFloat(depositPaid) >= 0))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const totalAmt = parseFloat(totalAmount) || 0
    const depositAmt = mode === 'log'
      ? totalAmt
      : paymentType === 'partial'
        ? (parseFloat(depositPaid) || 0)
        : (isEdit ? order!.depositPaid : totalAmt)
    const data: Omit<Order, 'id'> = {
      customerName: customerName.trim(),
      description: description.trim(),
      fulfillmentType,
      quantity: quantity ? parseInt(quantity) : 1,
      time: time || undefined,
      orderDate: order?.orderDate ?? new Date().toISOString().split('T')[0],
      dueDate,
      totalAmount: totalAmt,
      depositPaid: depositAmt,
      isDone: mode === 'log' ? true : (order?.isDone ?? false),
      notes: notes.trim() || undefined,
      loggedBy: isEdit ? order!.loggedBy : getCurrentUser(),
    }
    const supabasePayload = {
      customer_name: data.customerName, description: data.description,
      fulfillment_type: data.fulfillmentType ?? 'pickup',
      quantity: data.quantity ?? null, time: data.time ?? null,
      order_date: data.orderDate, due_date: data.dueDate,
      total_amount: data.totalAmount, deposit_paid: data.depositPaid,
      is_done: data.isDone, notes: data.notes ?? null,
      logged_by: data.loggedBy ?? null,
    }
    if (isEdit) {
      await db.orders.update(order!.id!, { ...data, pendingSync: true })
      onSaved()
      handleClose()
      if (navigator.onLine && order!.supabaseId) {
        const { error } = await dbWrite('orders', 'update', { payload: supabasePayload, eq: { id: order!.supabaseId } })
        if (!error) {
          await db.orders.update(order!.id!, { pendingSync: false })
          updateOrder(data, order!.supabaseId)
        }
      }
    } else {
      const localId = await db.orders.add({ ...data, pendingSync: true })
      onSaved()
      handleClose()
      if (navigator.onLine) {
        const { data: row, error } = await dbWrite<{ id: string }>('orders', 'insert', { payload: supabasePayload, select: true, single: true })
        if (!error && row) {
          await db.orders.update(localId as number, { supabaseId: row.id, pendingSync: false })
          logOrder(data, row.id)
        }
      }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!order?.id) return
    if (order.supabaseId) {
      deleteSheetRow('Orders', order.supabaseId)
      await dbWrite('orders', 'delete', { eq: { id: order.supabaseId } })
    }
    await db.payments.where('orderId').equals(order.id).delete()
    await db.orders.delete(order.id)
    onSaved()
    handleClose()
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
          width: '100%',
          background: '#F9F3EE',
          borderRadius: '20px 20px 0 0',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D' }}>
            {isEdit ? 'Edit Order' : mode === 'log' ? 'Log Order' : 'New Order'}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isEdit && (
              <button
                onClick={handleDelete}
                style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
              >
                <Trash2 size={17} color="#ef4444" />
              </button>
            )}
            <button
              onClick={handleClose}
              style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
            >
              <X size={17} color="#6b7280" />
            </button>
          </div>
        </div>

        {/* Form body */}
        <div style={{ overflowY: 'auto', padding: '8px 20px 0', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div>
              <span style={lbl}>Customer Name *</span>
              <input
                style={input}
                placeholder="e.g. Maria Santos"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Flower / Arrangement Details *</span>
              <select
                style={{ ...input, cursor: 'pointer' }}
                value={arrangementType}
                onChange={e => { setArrangementType(e.target.value); setArrangementVariant('') }}
              >
                <option value="">Select type…</option>
                {['Fresh flower bouquet', 'Dried flower bouquet', 'Flower dome', 'Kraft box', 'Balloon', 'Vase arrangement', 'Kraft box arrangement', 'Sympathy flowers', 'Money cake', 'Money bouquet', 'Limited Edition (Seasonal)', 'Custom Made']
                  .map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {(arrangementType === 'Fresh flower bouquet' || arrangementType === 'Limited Edition (Seasonal)') && (
              <div>
                <span style={lbl}>Variant *</span>
                <select
                  style={{ ...input, cursor: 'pointer' }}
                  value={arrangementVariant}
                  onChange={e => setArrangementVariant(e.target.value)}
                >
                  <option value="">Select variant…</option>
                  {(arrangementType === 'Fresh flower bouquet'
                    ? ['Korean style', 'Tulips', 'Ecuadorian roses', 'China roses', 'Gerbera daisy', 'Carnation', 'Stargazer', 'Mix flowers', 'Sympathy flowers', 'Custom made']
                    : ["Valentine's Day", "Mother's Day", "Father's Day", "All Saints' Day and All Souls' Day"]
                  ).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}

            <div>
              <span style={lbl}>Fulfillment Type</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['pickup', 'delivery'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFulfillmentType(t)}
                    style={{
                      flex: 1, padding: '10px', border: 'none', borderRadius: '10px', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 600,
                      background: fulfillmentType === t ? (t === 'delivery' ? '#7A9E7E' : '#C9848A') : '#f3f4f6',
                      color: fulfillmentType === t ? '#fff' : '#6b7280',
                      boxShadow: fulfillmentType === t ? `0 2px 8px ${t === 'delivery' ? '#7A9E7E44' : '#C9848A44'}` : 'none',
                    }}
                  >
                    {t === 'pickup' ? '🌸 Pick Up' : '🚚 Delivery'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={lbl}>Delivery / Pickup Date *</span>
              <input
                style={input}
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Time</span>
              <input
                style={input}
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Quantity</span>
              <input
                style={input}
                type="number"
                inputMode="numeric"
                placeholder="1"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Total Amount (₱) *</span>
              <input
                style={input}
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
              />
            </div>

            {mode === 'advance' && (
              <div>
                <span style={lbl}>Payment Type</span>
                <div style={{ display: 'flex', background: '#e5e0db', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                  {(['full', 'partial'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => { setPaymentType(pt); if (pt === 'full') setDepositPaid('') }}
                      style={{
                        flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 600,
                        background: paymentType === pt ? '#fff' : 'transparent',
                        color: paymentType === pt ? '#2D2D2D' : '#9ca3af',
                        boxShadow: paymentType === pt ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {pt === 'full' ? 'Full Payment' : 'Partial Payment'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'advance' && paymentType === 'partial' && (
              <div>
                <span style={lbl}>Deposit Paid (₱) *</span>
                <input
                  style={input}
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={depositPaid}
                  onChange={e => setDepositPaid(e.target.value)}
                />
              </div>
            )}

            <div>
              <span style={lbl}>Notes</span>
              <textarea
                style={{ ...input, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Optional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

          </div>
        </div>

        {/* Save button */}
        <div style={{ padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              width: '100%', padding: '15px',
              background: canSave ? '#C9848A' : '#e5e0db',
              color: canSave ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: '12px',
              fontSize: '15px', fontWeight: 700,
              cursor: canSave ? 'pointer' : 'default',
              boxShadow: canSave ? '0 4px 14px #C9848A44' : 'none',
            }}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
