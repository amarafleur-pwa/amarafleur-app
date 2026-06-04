import { useState } from 'react'
import { X, Trash2, RefreshCw } from 'lucide-react'
import { db } from '../../db/db'
import type { PersonalExpense } from '../../db/db'
import { logPersonalExpense, deleteSheetRow } from '../../lib/sheets'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['Bills', 'Rent', 'Food & Groceries', 'Transportation', 'Health', 'Savings', 'Other']

interface Props {
  expense?: PersonalExpense
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

const label: React.CSSProperties = {
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
  const [category, setCategory] = useState(expense?.category ?? 'Bills')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [isRecurring, setIsRecurring] = useState(expense?.isRecurring ?? false)
  const [expenseType, setExpenseType] = useState<'bill' | 'purchase'>('bill')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const handleClose = () => setClosing(true)

  const canSave = name.trim() && amount && parseFloat(amount) > 0
    && (expenseType === 'purchase' || dueDate)

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const data: Omit<PersonalExpense, 'id'> = {
      name: name.trim(),
      amount: parseFloat(amount),
      dueDate: expenseType === 'purchase' ? new Date().toISOString().split('T')[0] : dueDate,
      category,
      notes: notes.trim() || undefined,
      isRecurring: expenseType === 'purchase' ? false : isRecurring,
      isPaid: expenseType === 'purchase' ? true : (expense?.isPaid ?? false),
    }
    const supabasePayload = {
      name: data.name, amount: data.amount, due_date: data.dueDate,
      category: data.category ?? null, is_paid: data.isPaid,
      is_recurring: data.isRecurring, notes: data.notes ?? null,
    }
    if (isEdit) {
      await db.personalExpenses.update(expense!.id!, { ...data, pendingSync: true })
      onSaved()
      handleClose()
      if (navigator.onLine && expense!.supabaseId) {
        const { error } = await supabase.from('personal_expenses').update(supabasePayload).eq('id', expense!.supabaseId)
        if (!error) await db.personalExpenses.update(expense!.id!, { pendingSync: false })
      }
    } else {
      const localId = await db.personalExpenses.add({ ...data, pendingSync: true })
      onSaved()
      handleClose()
      if (navigator.onLine) {
        const { data: row, error } = await supabase.from('personal_expenses').insert(supabasePayload).select().single()
        if (!error) {
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
      await supabase.from('personal_expenses').delete().eq('id', expense.supabaseId)
    }
    await db.personalExpenses.delete(expense.id)
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
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px 8px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D' }}>
            {isEdit ? 'Edit Expense' : 'New Expense'}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isEdit && (
              <button
                onClick={handleDelete}
                style={{
                  background: '#fee2e2', border: 'none', borderRadius: '8px',
                  padding: '8px', cursor: 'pointer', display: 'flex',
                }}
              >
                <Trash2 size={17} color="#ef4444" />
              </button>
            )}
            <button
              onClick={handleClose}
              style={{
                background: '#e5e0db', border: 'none', borderRadius: '8px',
                padding: '8px', cursor: 'pointer', display: 'flex',
              }}
            >
              <X size={17} color="#6b7280" />
            </button>
          </div>
        </div>

        {/* Form body */}
        <div style={{ overflowY: 'auto', padding: '8px 20px 0', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Type toggle */}
            {!isEdit && (
              <div style={{ display: 'flex', background: '#e5e0db', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                {(['bill', 'purchase'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setExpenseType(t)}
                    style={{
                      flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                      fontSize: '13px', fontWeight: 600,
                      background: expenseType === t ? '#fff' : 'transparent',
                      color: expenseType === t ? '#2D2D2D' : '#9ca3af',
                      boxShadow: expenseType === t ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t === 'bill' ? '📅 Bill / Due' : '🛒 Instant Purchase'}
                  </button>
                ))}
              </div>
            )}

            <div>
              <span style={label}>Name *</span>
              <input
                style={input}
                placeholder="e.g. Electricity Bill"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div>
              <span style={label}>Amount (₱) *</span>
              <input
                style={input}
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>

            {expenseType === 'bill' && (
              <div>
                <span style={label}>Due Date *</span>
                <input
                  style={input}
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            )}

            <div>
              <span style={label}>Category</span>
              <select
                style={{ ...input, appearance: 'none' }}
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <span style={label}>Notes</span>
              <textarea
                style={{ ...input, minHeight: '72px', resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Optional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Recurring toggle — bill only */}
            {expenseType === 'bill' && <button
              onClick={() => setIsRecurring(r => !r)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px',
                background: isRecurring ? '#C9848A15' : '#fff',
                border: `1.5px solid ${isRecurring ? '#C9848A' : '#e5e0db'}`,
                borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <RefreshCw size={18} color={isRecurring ? '#C9848A' : '#9ca3af'} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#2D2D2D' }}>Monthly Recurring</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>
                  {isRecurring
                    ? 'Auto-creates next month when marked paid'
                    : 'Tap to enable recurring'}
                </p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{
                  width: '42px', height: '24px', borderRadius: '12px',
                  background: isRecurring ? '#C9848A' : '#d1ccc8',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: isRecurring ? '20px' : '3px',
                    width: '18px', height: '18px',
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
              </div>
            </button>}

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
