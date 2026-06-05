import { useEffect, useState } from 'react'
import { Plus, ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react'
import { db } from '../../db/db'
import type { BusinessExpense } from '../../db/db'
import ExpenseForm from './ExpenseForm'
import { supabase } from '../../lib/supabase'
import { deleteSheetRow, logBusinessExpense } from '../../lib/sheets'
import { useSyncVersion } from '../../lib/SyncContext'
import { NetworkPill } from '../../components/OfflineBanner'
import SwipeableItem from '../../components/SwipeableItem'

const CATEGORIES = ['Supplies', 'Utilities', 'Rent', 'Delivery', 'Other']
type ListTab = 'active' | 'monthly' | 'instant' | 'history'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

function todayStr() { return new Date().toISOString().split('T')[0] }

function diffDays(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const now = new Date(todayStr() + 'T00:00:00')
  return Math.floor((due.getTime() - now.getTime()) / 86400000)
}

function urgency(dueDate: string, isPaid: boolean) {
  if (isPaid) return { color: '#9ca3af', bg: '#f3f4f6', label: 'Paid' }
  const diff = diffDays(dueDate)
  if (diff < 0) return { color: '#C9848A', bg: '#C9848A18', label: 'Overdue' }
  if (diff === 0) return { color: '#E8A838', bg: '#E8A83818', label: 'Today' }
  if (diff <= 3) return { color: '#E8A838', bg: '#E8A83818', label: `${diff}d` }
  return { color: '#7A9E7E', bg: '#7A9E7E18', label: `${diff}d` }
}

function resolveType(e: BusinessExpense): 'one-time' | 'monthly' | 'instant' {
  if (e.expenseType) return e.expenseType
  if (e.isRecurring) return 'monthly'
  return 'one-time'
}

function getMonthStrips(count = 12): { label: string; value: string }[] {
  const result = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    const year = d.getFullYear()
    const month = d.getMonth()
    const value = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
    result.push({ label, value })
    d.setMonth(month - 1)
  }
  return result
}

export default function BusinessExpenses() {
  const syncVersion = useSyncVersion()
  const [expenses, setExpenses] = useState<BusinessExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ListTab>('active')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [search, setSearch] = useState('')
  const [historyMonth, setHistoryMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BusinessExpense | undefined>()
  const [pendingDelete, setPendingDelete] = useState<BusinessExpense | null>(null)

  function load() {
    db.businessExpenses
      .orderBy('dueDate')
      .reverse()
      .toArray()
      .then(data => { setExpenses(data); setError(null) })
      .catch(err => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [syncVersion])

  async function markPaid(expense: BusinessExpense) {
    const nowPaid = !expense.isPaid
    if (expense.supabaseId) {
      await supabase.from('business_expenses').update({ is_paid: nowPaid }).eq('id', expense.supabaseId)
    }
    await db.businessExpenses.update(expense.id!, { isPaid: nowPaid })

    if (nowPaid && expense.isRecurring) {
      const next = new Date(expense.dueDate + 'T00:00:00')
      next.setMonth(next.getMonth() + 1)
      const newData = {
        name: expense.name, amount: expense.amount,
        dueDate: next.toISOString().split('T')[0],
        category: expense.category, notes: expense.notes,
        isRecurring: true, isPaid: false, modeOfPayment: expense.modeOfPayment,
        expenseType: 'monthly' as const,
      }
      const { data: row } = await supabase.from('business_expenses').insert({
        name: newData.name, amount: newData.amount, due_date: newData.dueDate,
        category: newData.category, notes: newData.notes ?? null,
        is_paid: false, is_recurring: true, mode_of_payment: newData.modeOfPayment ?? null,
        expense_type: 'monthly',
      }).select().single()
      await db.businessExpenses.add({ ...newData, supabaseId: row?.id })
      if (row?.id) logBusinessExpense(newData, row.id)
    }
    load()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const e = pendingDelete
    setPendingDelete(null)
    if (e.supabaseId) {
      deleteSheetRow('Business Expenses', e.supabaseId)
      await supabase.from('business_expenses').delete().eq('id', e.supabaseId)
    }
    await db.businessExpenses.delete(e.id!)
    load()
  }

  const q = search.toLowerCase()

  const filtered = expenses.filter(e => {
    if (q && !e.name.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false
    if (catFilter && e.category !== catFilter) return false
    const type = resolveType(e)
    if (tab === 'active') return !e.isPaid && (type === 'one-time' || type === 'monthly')
    if (tab === 'monthly') return type === 'monthly'
    if (tab === 'instant') return type === 'instant'
    if (tab === 'history') return e.isPaid && e.dueDate.startsWith(historyMonth)
    return true
  })

  const breakdown = CATEGORIES.map(cat => {
    const items = expenses.filter(e => e.category === cat)
    const total = items.reduce((s, e) => s + e.amount, 0)
    const unpaid = items.filter(e => !e.isPaid).reduce((s, e) => s + e.amount, 0)
    return { cat, total, unpaid, count: items.length }
  }).filter(b => b.count > 0)

  const totalUnpaid = expenses.filter(e => !e.isPaid).reduce((s, e) => s + e.amount, 0)
  const unpaidCount = expenses.filter(e => !e.isPaid).length

  const activeUnpaidCount = expenses.filter(e => {
    const type = resolveType(e)
    return !e.isPaid && (type === 'one-time' || type === 'monthly')
  }).length

  const tabs: { key: ListTab; label: string; badge?: number }[] = [
    { key: 'active', label: 'Active', badge: activeUnpaidCount > 0 ? activeUnpaidCount : undefined },
    { key: 'monthly', label: 'Monthly' },
    { key: 'instant', label: 'Instant' },
    { key: 'history', label: 'History' },
  ]

  const monthStrips = getMonthStrips(12)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>Business Expenses</h1>
            <NetworkPill />
          </div>
          <button
            onClick={() => { setEditing(undefined); setShowForm(true) }}
            style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#7A9E7E', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px #7A9E7E55' }}
          >
            <Plus size={20} color="#fff" strokeWidth={2.5} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginTop: '12px' }}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            placeholder="Search expenses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1.5px solid #e5e0db', borderRadius: '10px', fontSize: '14px', color: '#2D2D2D', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Outstanding summary */}
        {unpaidCount > 0 && (
          <div style={{ marginTop: '12px', background: '#E8A83812', border: '1.5px solid #E8A83840', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Outstanding</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(totalUnpaid)}</p>
            </div>
            <span style={{ background: '#E8A838', color: '#fff', borderRadius: '12px', padding: '3px 12px', fontSize: '13px', fontWeight: 700 }}>
              {unpaidCount} unpaid
            </span>
          </div>
        )}

        {/* Main tabs */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
          {tabs.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', border: 'none',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer', position: 'relative',
                  background: active ? '#7A9E7E' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #7A9E7E33' : 'none',
                  flexShrink: 0,
                }}
              >
                {t.label}
                {t.badge !== undefined && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#E8A838', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '1px 5px', border: '2px solid #F9F3EE' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
          <button
            onClick={() => setCatFilter(null)}
            style={{ padding: '4px 12px', borderRadius: '14px', border: 'none', fontSize: '11px', fontWeight: catFilter === null ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', background: catFilter === null ? '#2D2D2D' : '#fff', color: catFilter === null ? '#fff' : '#6b7280', flexShrink: 0 }}
          >
            All
          </button>
          {CATEGORIES.map(cat => {
            const active = catFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(active ? null : cat)}
                style={{ padding: '4px 12px', borderRadius: '14px', border: 'none', fontSize: '11px', fontWeight: active ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', background: active ? '#2D2D2D' : '#fff', color: active ? '#fff' : '#6b7280', flexShrink: 0 }}
              >
                {cat}
              </button>
            )
          })}
        </div>

        {/* Month strip — History tab only */}
        {tab === 'history' && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            {monthStrips.map(m => (
              <button
                key={m.value}
                onClick={() => setHistoryMonth(m.value)}
                style={{ padding: '5px 12px', borderRadius: '16px', border: 'none', fontSize: '12px', fontWeight: historyMonth === m.value ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, background: historyMonth === m.value ? '#2D2D2D' : '#fff', color: historyMonth === m.value ? '#fff' : '#6b7280' }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', flex: 1 }}>

        {/* Category breakdown */}
        {breakdown.length > 0 && tab !== 'history' && (
          <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <button
              onClick={() => setShowBreakdown(b => !b)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D2D2D' }}>Category Breakdown</span>
              {showBreakdown ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
            </button>
            {showBreakdown && (
              <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {breakdown.map(b => (
                  <div key={b.cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: '#2D2D2D', fontWeight: 500 }}>{b.cat}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{b.count} item{b.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(b.total)}</p>
                      {b.unpaid > 0 && <p style={{ fontSize: '11px', color: '#E8A838' }}>{fmt(b.unpaid)} unpaid</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>Loading...</p>}
        {error && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>
              {tab === 'active' ? 'No unpaid bills.' :
               tab === 'monthly' ? 'No monthly bills yet.' :
               tab === 'instant' ? 'No instant purchases yet.' :
               'No paid expenses in this month.'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(e => {
              const type = resolveType(e)
              const isInstant = type === 'instant'
              const u = urgency(e.dueDate, e.isPaid)
              return (
                <SwipeableItem
                  key={e.id}
                  onPaid={!isInstant ? () => markPaid(e) : undefined}
                  onEdit={() => { setEditing(e); setShowForm(true) }}
                  onDelete={() => setPendingDelete(e)}
                >
                  <div style={{
                    background: '#fff', borderRadius: '12px', padding: '10px 12px',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    opacity: e.isPaid ? 0.65 : 1,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <p style={{ fontWeight: 600, fontSize: '14px', color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: e.isPaid ? 'line-through' : 'none' }}>
                          {e.name}
                        </p>
                        {type === 'monthly' && <RefreshCw size={12} color="#9ca3af" />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                        {!isInstant && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: u.color, background: u.bg, borderRadius: '5px', padding: '1px 6px' }}>
                            {u.label}
                          </span>
                        )}
                        {isInstant && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#7A9E7E', background: '#7A9E7E18', borderRadius: '5px', padding: '1px 6px' }}>
                            Paid
                          </span>
                        )}
                        {!isInstant && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDate(e.dueDate)}</span>}
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>· {e.category}</span>
                        {e.modeOfPayment && <span style={{ fontSize: '11px', color: '#9ca3af' }}>· {e.modeOfPayment}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {e.receiptUrl && (
                        <img src={e.receiptUrl} alt="Receipt" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e5e0db' }} />
                      )}
                      <p style={{ fontWeight: 700, fontSize: '14px', color: '#2D2D2D' }}>{fmt(e.amount)}</p>
                    </div>
                  </div>
                </SwipeableItem>
              )
            })}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && tab !== 'instant' && (
          <p style={{ fontSize: '11px', color: '#d1ccc8', textAlign: 'center', marginTop: '16px' }}>← Swipe left for actions</p>
        )}
      </div>

      {showForm && (
        <ExpenseForm
          expense={editing}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      {/* Delete confirmation */}
      {pendingDelete && (
        <div
          onClick={() => setPendingDelete(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
          >
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', marginBottom: '6px' }}>Delete expense?</p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}>
              "{pendingDelete.name}" will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPendingDelete(null)}
                style={{ flex: 1, padding: '12px', border: '1.5px solid #e5e0db', borderRadius: '10px', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#6b7280' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#7A9E7E', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff', boxShadow: '0 2px 8px #7A9E7E44' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
