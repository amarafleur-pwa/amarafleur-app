import { useRef, useState } from 'react'
import { X, Trash2, Camera, RefreshCw } from 'lucide-react'
import { db } from '../../db/db'
import type { PersonalExpense } from '../../db/db'
import { logPersonalExpense, updatePersonalExpense, deleteSheetRow } from '../../lib/sheets'
import { dbWrite, uploadReceipt } from '../../lib/dbGateway'
import { getCurrentUser } from '../../lib/currentUser'

const CATEGORIES = ['Food', 'Gas/RFID', "Aki's needs", 'Leisure', 'Tithes/Donation', 'Tiktok & Shopee', 'Insurance', 'Utilities', 'Others']
const MODES = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Cheque']
type ExpenseType = 'one-time' | 'monthly' | 'instant'

interface Props {
  expense?: PersonalExpense
  onClose: () => void
  onSaved: () => void
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  border: '1.5px solid #e5e0db', borderRadius: '10px',
  fontSize: '15px', color: '#2D2D2D', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
  minWidth: 0, maxWidth: '100%', WebkitAppearance: 'none',
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

function deriveType(e?: PersonalExpense): ExpenseType {
  if (!e) return 'instant'
  if (e.expenseType) return e.expenseType
  if (e.isRecurring) return 'monthly'
  // old instant purchases had isPaid=true and no real due date context — use 'one-time' as safe default
  return 'one-time'
}

export default function ExpenseForm({ expense, onClose, onSaved }: Props) {
  const isEdit = !!expense?.id
  const fileRef = useRef<HTMLInputElement>(null)

  const [expenseType, setExpenseType] = useState<ExpenseType>(deriveType(expense))
  const [name, setName] = useState(expense?.name ?? '')
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? '')
  const [amountPaid, setAmountPaid] = useState(expense?.amountPaid?.toString() ?? '')
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>(
    expense?.amountPaid && expense.amountPaid > 0 && expense.amountPaid < expense.amount ? 'partial' : 'full'
  )
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? new Date().toISOString().split('T')[0])
  const [mode, setMode] = useState(expense?.modeOfPayment ?? 'Cash')
  const [category, setCategory] = useState(expense?.category ?? 'Food')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [receiptUrl, setReceiptUrl] = useState(expense?.receiptUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const handleClose = () => setClosing(true)

  const needsDate = expenseType !== 'instant'
  const canSave = name.trim() && amount && parseFloat(amount) > 0 && !!dueDate &&
    (!needsDate || paymentType === 'full' || (amountPaid !== '' && parseFloat(amountPaid) >= 0))

  async function handleReceiptPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const path = `personal/${crypto.randomUUID()}.jpg`
      const { publicUrl, error } = await uploadReceipt(path, blob, 'image/jpeg')
      if (!error && publicUrl) setReceiptUrl(publicUrl)
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
    const totalAmt = parseFloat(amount)
    const today = new Date().toISOString().split('T')[0]
    const autoMarkPaid = !isInstant && expenseType === 'one-time' && dueDate === today
    const paidAmt = isInstant || autoMarkPaid ? totalAmt : (
      paymentType === 'partial' ? (parseFloat(amountPaid) || 0) :
      (isEdit ? (expense?.isPaid ? totalAmt : (expense?.amountPaid ?? 0)) : 0)
    )
    const data: Omit<PersonalExpense, 'id'> = {
      name: name.trim(),
      amount: totalAmt,
      dueDate: dueDate,
      modeOfPayment: mode,
      category,
      notes: notes.trim() || undefined,
      isRecurring: isMonthly,
      isPaid: isInstant || autoMarkPaid ? true : paidAmt >= totalAmt,
      amountPaid: paidAmt,
      expenseType,
      receiptUrl: receiptUrl || undefined,
      loggedBy: isEdit ? expense!.loggedBy : getCurrentUser(),
    }
    const supabasePayload = {
      name: data.name, amount: data.amount, due_date: data.dueDate,
      mode_of_payment: data.modeOfPayment ?? null,
      category: data.category ?? null, is_paid: data.isPaid,
      is_recurring: data.isRecurring, notes: data.notes ?? null,
      expense_type: data.expenseType ?? null, receipt_url: data.receiptUrl ?? null,
      amount_paid: paidAmt, logged_by: data.loggedBy ?? null,
    }
    if (isEdit) {
      await db.personalExpenses.update(expense!.id!, { ...data, pendingSync: true })
      onSaved(); handleClose()
      if (navigator.onLine && expense!.supabaseId) {
        const { error } = await dbWrite('personal_expenses', 'update', { payload: supabasePayload, eq: { id: expense!.supabaseId } })
        if (!error) {
          await db.personalExpenses.update(expense!.id!, { pendingSync: false })
          updatePersonalExpense(data, expense!.supabaseId)
        }
      }
    } else {
      const localId = await db.personalExpenses.add({ ...data, pendingSync: true })
      onSaved(); handleClose()
      if (navigator.onLine) {
        const { data: row, error } = await dbWrite<{ id: string }>('personal_expenses', 'insert', { payload: supabasePayload, select: true, single: true })
        if (!error && row) {
          await db.personalExpenses.update(localId as number, { supabaseId: row.id, pendingSync: false })
          logPersonalExpense(data, row.id)
        }
      }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!expense?.id) return
    if (expense.supabaseId) {
      deleteSheetRow('Personal Expenses', expense.supabaseId)
      await dbWrite('personal_expenses', 'delete', { eq: { id: expense.supabaseId } })
    }
    await db.personalExpenses.delete(expense.id)
    onSaved(); handleClose()
  }

  const typeOptions: { key: ExpenseType; icon: string; label: string }[] = [
    { key: 'instant', icon: '🛒', label: 'Instant Purchase' },
    { key: 'one-time', icon: '📋', label: 'One-Time Bill' },
    { key: 'monthly', icon: '🔄', label: 'Monthly Bill' },
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
            {isEdit ? 'Edit Expense' : 'New Expense'}
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

            <div style={{ display: 'flex', background: '#e5e0db', borderRadius: '10px', padding: '3px', gap: '3px' }}>
              {typeOptions.map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    if (t.key === 'instant' && !dueDate) setDueDate(new Date().toISOString().split('T')[0])
                    setExpenseType(t.key)
                  }}
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

            <div>
              <span style={lbl}>Name *</span>
              <input style={inp} placeholder={expenseType === 'instant' ? 'e.g. Grocery run' : 'e.g. Electricity Bill'} value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div>
              <span style={lbl}>Total Amount (₱) *</span>
              <input style={inp} type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            {needsDate && (
              <div>
                <span style={lbl}>Payment Type</span>
                <div style={{ display: 'flex', background: '#e5e0db', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                  {(['full', 'partial'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => { setPaymentType(pt); if (pt === 'full') setAmountPaid('') }}
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

            {needsDate && paymentType === 'partial' && (
              <div>
                <span style={lbl}>Amount Paid (₱) *</span>
                <input style={inp} type="number" inputMode="decimal" placeholder="0.00" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} />
              </div>
            )}

            <div>
              <span style={lbl}>{expenseType === 'instant' ? 'Purchase Date *' : 'Due Date *'}</span>
              <input style={inp} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>

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
                padding: '12px 14px', background: '#C9848A12',
                border: '1.5px solid #C9848A30', borderRadius: '10px',
              }}>
                <RefreshCw size={16} color="#C9848A" />
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4 }}>
                  Automatically creates next month's entry when marked <strong>Paid</strong>.
                </p>
              </div>
            )}

            {/* Receipt upload */}
            <div>
              <span style={lbl}>Receipt</span>
              {receiptUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={receiptUrl} alt="Receipt"
                    style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1.5px solid #e5e0db' }}
                  />
                  <div>
                    <p style={{ fontSize: '12px', color: '#7A9E7E', fontWeight: 600 }}>Receipt uploaded</p>
                    <button
                      onClick={() => setReceiptUrl('')}
                      style={{ fontSize: '12px', color: '#C9848A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '4px' }}
                    >
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
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleReceiptPick} />
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
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}
