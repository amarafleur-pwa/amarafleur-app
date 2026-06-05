import { useRef, useState } from 'react'
import { X, Trash2, Camera, RefreshCw } from 'lucide-react'
import { db } from '../../db/db'
import type { BusinessExpense } from '../../db/db'
import { logBusinessExpense, deleteSheetRow } from '../../lib/sheets'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['Supplies', 'Utilities', 'Rent', 'Delivery', 'Other']
const MODES = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Cheque']
type ExpenseType = 'one-time' | 'monthly' | 'instant'

interface Props {
  expense?: BusinessExpense
  onClose: () => void
  onSaved: () => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  border: '1.5px solid #e5e0db', borderRadius: '10px',
  fontSize: '15px', color: '#2D2D2D', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: '#6b7280',
  marginBottom: '6px', display: 'block',
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1200
      let { width, height } = img
      if (width > max || height > max) {
        if (width > height) { height = Math.round(height * max / width); width = max }
        else { width = Math.round(width * max / height); height = max }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.72)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

function deriveType(e?: BusinessExpense): ExpenseType {
  if (!e) return 'one-time'
  if (e.expenseType) return e.expenseType
  if (e.isRecurring) return 'monthly'
  return 'one-time'
}

export default function ExpenseForm({ expense, onClose, onSaved }: Props) {
  const isEdit = !!expense?.id
  const fileRef = useRef<HTMLInputElement>(null)

  const [expenseType, setExpenseType] = useState<ExpenseType>(deriveType(expense))
  const [name, setName] = useState(expense?.name ?? '')
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? '')
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? '')
  const [mode, setMode] = useState(expense?.modeOfPayment ?? 'Cash')
  const [category, setCategory] = useState(expense?.category ?? 'Supplies')
  const [isPaid, setIsPaid] = useState(expense?.isPaid ?? false)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [receiptUrl, setReceiptUrl] = useState(expense?.receiptUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const handleClose = () => setClosing(true)

  const needsDate = expenseType !== 'instant'
  const canSave = name.trim() && amount && parseFloat(amount) > 0 && (!needsDate || dueDate)

  async function handleReceiptPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const path = `business/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' })
      if (!error) {
        const { data } = supabase.storage.from('receipts').getPublicUrl(path)
        setReceiptUrl(data.publicUrl)
      }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const isMonthly = expenseType === 'monthly'
    const isInstant = expenseType === 'instant'
    const data: Omit<BusinessExpense, 'id'> = {
      name: name.trim(),
      amount: parseFloat(amount),
      dueDate: isInstant ? new Date().toISOString().split('T')[0] : dueDate,
      modeOfPayment: mode,
      category,
      isPaid: isInstant ? true : isPaid,
      isRecurring: isMonthly,
      notes: notes.trim() || undefined,
      expenseType,
      receiptUrl: receiptUrl || undefined,
    }
    const supabasePayload = {
      name: data.name, amount: data.amount, due_date: data.dueDate,
      mode_of_payment: data.modeOfPayment ?? null, is_paid: data.isPaid,
      is_recurring: data.isRecurring ?? false, category: data.category,
      notes: data.notes ?? null, expense_type: data.expenseType ?? null,
      receipt_url: data.receiptUrl ?? null,
    }
    if (isEdit) {
      await db.businessExpenses.update(expense!.id!, { ...data, pendingSync: true })
      onSaved(); handleClose()
      if (navigator.onLine && expense!.supabaseId) {
        const { error } = await supabase.from('business_expenses').update(supabasePayload).eq('id', expense!.supabaseId)
        if (!error) await db.businessExpenses.update(expense!.id!, { pendingSync: false })
      }
    } else {
      const localId = await db.businessExpenses.add({ ...data, pendingSync: true })
      onSaved(); handleClose()
      if (navigator.onLine) {
        const { data: row, error } = await supabase.from('business_expenses').insert(supabasePayload).select().single()
        if (!error) {
          await db.businessExpenses.update(localId as number, { supabaseId: row.id, pendingSync: false })
          logBusinessExpense(data, row.id)
        }
      }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!expense?.id) return
    if (expense.supabaseId) {
      deleteSheetRow('Business Expenses', expense.supabaseId)
      await supabase.from('business_expenses').delete().eq('id', expense.supabaseId)
    }
    await db.businessExpenses.delete(expense.id)
    onSaved(); handleClose()
  }

  // When monthly bill is marked paid, auto-create next month entry
  async function handleMonthlyPaidToggle() {
    if (!isEdit || !expense || expenseType !== 'monthly') return
    const nowPaid = !isPaid
    setIsPaid(nowPaid)
    if (nowPaid && expense.isRecurring) {
      const next = new Date(expense.dueDate + 'T00:00:00')
      next.setMonth(next.getMonth() + 1)
      const newData = {
        name: expense.name, amount: expense.amount,
        dueDate: next.toISOString().split('T')[0],
        category: expense.category, notes: expense.notes,
        isRecurring: true, isPaid: false,
        modeOfPayment: expense.modeOfPayment,
        expenseType: 'monthly' as ExpenseType,
      }
      const { data: row } = await supabase.from('business_expenses').insert({
        name: newData.name, amount: newData.amount, due_date: newData.dueDate,
        category: newData.category, notes: newData.notes ?? null,
        is_paid: false, is_recurring: true,
        mode_of_payment: newData.modeOfPayment ?? null,
        expense_type: 'monthly',
      }).select().single()
      await db.businessExpenses.add({ ...newData, supabaseId: row?.id })
    }
  }

  const typeOptions: { key: ExpenseType; icon: string; label: string }[] = [
    { key: 'one-time', icon: '📋', label: 'One-Time Bill' },
    { key: 'monthly', icon: '🔄', label: 'Monthly Bill' },
    { key: 'instant', icon: '🛒', label: 'Instant Purchase' },
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
        style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '92svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D' }}>
            {isEdit ? 'Edit Expense' : 'New Business Expense'}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isEdit && (
              <button onClick={handleDelete} style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
                <Trash2 size={17} color="#ef4444" />
              </button>
            )}
            <button onClick={handleClose} style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
              <X size={17} color="#6b7280" />
            </button>
          </div>
        </div>

        {/* Form body */}
        <div style={{ overflowY: 'auto', padding: '8px 20px 0', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Type selector */}
            {!isEdit && (
              <div style={{ display: 'flex', background: '#e5e0db', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                {typeOptions.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setExpenseType(t.key)}
                    style={{
                      flex: 1, padding: '8px 4px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
                      background: expenseType === t.key ? '#fff' : 'transparent',
                      color: expenseType === t.key ? '#2D2D2D' : '#9ca3af',
                      boxShadow: expenseType === t.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '16px', marginBottom: '2px' }}>{t.icon}</div>
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {isEdit && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: '#fff', borderRadius: '10px', padding: '10px 14px',
                border: '1.5px solid #e5e0db',
              }}>
                <span style={{ fontSize: '18px' }}>
                  {typeOptions.find(t => t.key === expenseType)?.icon}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>
                  {typeOptions.find(t => t.key === expenseType)?.label}
                </span>
                {expenseType === 'monthly' && <RefreshCw size={13} color="#7A9E7E" style={{ marginLeft: 'auto' }} />}
              </div>
            )}

            <div>
              <span style={lbl}>Biller / Company *</span>
              <input style={inp} placeholder={expenseType === 'instant' ? 'e.g. SM Flower Supplies' : 'e.g. Meralco, PLDT'} value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div>
              <span style={lbl}>Amount (₱) *</span>
              <input style={inp} type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            {needsDate && (
              <div>
                <span style={lbl}>Due Date *</span>
                <input style={inp} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            )}

            <div>
              <span style={lbl}>Mode of Payment</span>
              <select style={{ ...inp, appearance: 'none' }} value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <span style={lbl}>Category</span>
              <select style={{ ...inp, appearance: 'none' }} value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <span style={lbl}>Notes</span>
              <textarea style={{ ...inp, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }} placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* Monthly note */}
            {expenseType === 'monthly' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', background: '#7A9E7E12',
                border: '1.5px solid #7A9E7E30', borderRadius: '10px',
              }}>
                <RefreshCw size={16} color="#7A9E7E" />
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4 }}>
                  Automatically creates next month's entry when marked <strong>Paid</strong>.
                </p>
              </div>
            )}

            {/* Paid status toggle — not shown for instant (always paid) */}
            {isEdit && expenseType !== 'instant' && (
              <button
                onClick={expenseType === 'monthly' ? handleMonthlyPaidToggle : () => setIsPaid(p => !p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 16px',
                  background: isPaid ? '#7A9E7E15' : '#E8A83810',
                  border: `1.5px solid ${isPaid ? '#7A9E7E' : '#E8A838'}`,
                  borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isPaid ? '#7A9E7E' : '#E8A838', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>{isPaid ? 'Paid' : 'Unpaid'}</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>Tap to toggle payment status</p>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <div style={{ width: '42px', height: '24px', borderRadius: '12px', background: isPaid ? '#7A9E7E' : '#d1ccc8', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ position: 'absolute', top: '3px', left: isPaid ? '20px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              </button>
            )}

            {/* Receipt upload */}
            <div>
              <span style={lbl}>Receipt</span>
              {receiptUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={receiptUrl} alt="Receipt" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1.5px solid #e5e0db' }} />
                  <div>
                    <p style={{ fontSize: '12px', color: '#7A9E7E', fontWeight: 600 }}>Receipt uploaded</p>
                    <button onClick={() => setReceiptUrl('')} style={{ fontSize: '12px', color: '#C9848A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '4px' }}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    width: '100%', padding: '12px', border: '1.5px dashed #d1ccc8',
                    borderRadius: '10px', background: '#fff', cursor: uploading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    color: '#9ca3af', fontSize: '13px', fontWeight: 500,
                  }}
                >
                  <Camera size={16} color="#9ca3af" />
                  {uploading ? 'Uploading...' : 'Upload receipt / Take photo'}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleReceiptPick} />
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
              background: canSave ? '#7A9E7E' : '#e5e0db',
              color: canSave ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: '12px',
              fontSize: '15px', fontWeight: 700,
              cursor: canSave ? 'pointer' : 'default',
              boxShadow: canSave ? '0 4px 14px #7A9E7E44' : 'none',
            }}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}
