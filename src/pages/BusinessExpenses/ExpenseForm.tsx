import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import type { BusinessExpense } from '../../db/db'
import { logBusinessExpense, deleteSheetRow } from '../../lib/sheets'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['Supplies', 'Utilities', 'Rent', 'Delivery', 'Other']
const MODES = ['Cash', 'GCash', 'Bank Transfer', 'Credit Card', 'Cheque']

interface Props {
  expense?: BusinessExpense
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
}

const lbl: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: '6px',
  display: 'block',
}

export default function ExpenseForm({ expense, onClose, onSaved }: Props) {
  const isEdit = !!expense?.id

  const [name, setName] = useState(expense?.name ?? '')
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? '')
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? '')
  const [mode, setMode] = useState(expense?.modeOfPayment ?? 'Cash')
  const [category, setCategory] = useState(expense?.category ?? 'Supplies')
  const [isPaid, setIsPaid] = useState(expense?.isPaid ?? false)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const handleClose = () => setClosing(true)

  const canSave = name.trim() && amount && parseFloat(amount) > 0 && dueDate

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    const data: Omit<BusinessExpense, 'id'> = {
      name: name.trim(),
      amount: parseFloat(amount),
      dueDate,
      modeOfPayment: mode,
      category,
      isPaid,
      notes: notes.trim() || undefined,
    }
    try {
      if (isEdit) {
        if (expense!.supabaseId) {
          const { error } = await supabase.from('business_expenses').update({
            name: data.name, amount: data.amount, due_date: data.dueDate,
            mode_of_payment: data.modeOfPayment ?? null, is_paid: data.isPaid,
            category: data.category, notes: data.notes ?? null,
          }).eq('id', expense!.supabaseId)
          if (error) throw error
        }
        await db.businessExpenses.update(expense!.id!, data)
      } else {
        const { data: row, error } = await supabase.from('business_expenses').insert({
          name: data.name, amount: data.amount, due_date: data.dueDate,
          mode_of_payment: data.modeOfPayment ?? null, is_paid: data.isPaid,
          category: data.category, notes: data.notes ?? null,
        }).select().single()
        if (error) throw error
        await db.businessExpenses.add({ ...data, supabaseId: row.id })
        logBusinessExpense(data, row.id)
      }
      onSaved()
      handleClose()
    } catch (err: any) {
      setSaveError(err?.message ?? 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!expense?.id) return
    if (expense.supabaseId) {
      deleteSheetRow('Business Expenses', expense.supabaseId)
      await supabase.from('business_expenses').delete().eq('id', expense.supabaseId)
    }
    await db.businessExpenses.delete(expense.id)
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
            {isEdit ? 'Edit Expense' : 'New Business Expense'}
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
              <span style={lbl}>Biller / Company *</span>
              <input
                style={input}
                placeholder="e.g. Meralco, SM Flower Supplies"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Bill Date *</span>
              <input
                style={input}
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Amount (₱) *</span>
              <input
                style={input}
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>

            <div>
              <span style={lbl}>Mode of Payment</span>
              <select style={{ ...input, appearance: 'none' }} value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <span style={lbl}>Category</span>
              <select style={{ ...input, appearance: 'none' }} value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <span style={lbl}>Notes</span>
              <textarea
                style={{ ...input, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Optional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Status toggle */}
            <button
              onClick={() => setIsPaid(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px',
                background: isPaid ? '#7A9E7E15' : '#E8A83810',
                border: `1.5px solid ${isPaid ? '#7A9E7E' : '#E8A838'}`,
                borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: isPaid ? '#7A9E7E' : '#E8A838', flexShrink: 0,
              }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>
                  {isPaid ? 'Paid' : 'Unpaid'}
                </p>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>
                  Tap to toggle payment status
                </p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{
                  width: '42px', height: '24px', borderRadius: '12px',
                  background: isPaid ? '#7A9E7E' : '#d1ccc8',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: isPaid ? '20px' : '3px',
                    width: '18px', height: '18px',
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
              </div>
            </button>

          </div>
        </div>

        {/* Save button */}
        <div style={{ padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {saveError && (
            <p style={{ fontSize: '13px', color: '#ef4444', marginBottom: '10px', wordBreak: 'break-word' }}>
              Error: {saveError}
            </p>
          )}
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
