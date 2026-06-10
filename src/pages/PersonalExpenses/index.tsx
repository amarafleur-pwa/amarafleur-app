import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Search } from 'lucide-react'
import receiptIcon from '../../assets/receipt.svg'
import { db } from '../../db/db'
import type { PersonalExpense } from '../../db/db'
import ExpenseForm from './ExpenseForm'
import { dbWrite } from '../../lib/dbGateway'
import { logPersonalExpense, deleteSheetRow } from '../../lib/sheets'
import { useSyncVersion } from '../../lib/SyncContext'
import { NetworkPill } from '../../components/OfflineBanner'
import SwipeableItem from '../../components/SwipeableItem'

type ListTab = 'active' | 'monthly' | 'instant' | 'history'
type HistoryFilter = 'today' | 'yesterday' | '7days' | 'range'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function diffDays(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const now = new Date(todayStr() + 'T00:00:00')
  return Math.floor((due.getTime() - now.getTime()) / 86400000)
}

function urgency(dueDate: string, isPaid: boolean) {
  if (isPaid) return { color: '#7A9E7E', bg: '#7A9E7E18', label: 'Paid' }
  const diff = diffDays(dueDate)
  if (diff < 0) return { color: '#C9848A', bg: '#C9848A18', label: 'Overdue' }
  if (diff === 0) return { color: '#E8A838', bg: '#E8A83818', label: 'Today' }
  if (diff <= 3) return { color: '#E8A838', bg: '#E8A83818', label: `${diff}d` }
  return { color: '#7A9E7E', bg: '#7A9E7E18', label: `${diff}d` }
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

function resolveType(e: PersonalExpense): 'one-time' | 'monthly' | 'instant' {
  if (e.expenseType) return e.expenseType
  if (e.isRecurring) return 'monthly'
  return 'one-time'
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export default function PersonalExpenses() {
  const syncVersion = useSyncVersion()
  const [expenses, setExpenses] = useState<PersonalExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ListTab>('active')
  const [search, setSearch] = useState('')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('7days')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [activeSwipeId, setActiveSwipeId] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PersonalExpense | undefined>()
  const [pendingDelete, setPendingDelete] = useState<PersonalExpense | null>(null)
  const [previewEntry, setPreviewEntry] = useState<PersonalExpense | null>(null)
  const [closingPreview, setClosingPreview] = useState(false)
  const [logPayEntry, setLogPayEntry] = useState<PersonalExpense | null>(null)
  const [logPayAmount, setLogPayAmount] = useState('')
  const [logPaySaving, setLogPaySaving] = useState(false)
  const [confirmPayAll, setConfirmPayAll] = useState<PersonalExpense | null>(null)

  function load() {
    db.personalExpenses
      .orderBy('dueDate')
      .toArray()
      .then(data => { setExpenses(data); setError(null) })
      .catch(err => setError(err.message ?? 'Failed to load expenses'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [syncVersion])

  async function markPaid(expense: PersonalExpense) {
    const paidAmt = expense.amount
    if (expense.supabaseId) {
      await dbWrite('personal_expenses', 'update', { payload: { is_paid: true, amount_paid: paidAmt }, eq: { id: expense.supabaseId } })
    }
    await db.personalExpenses.update(expense.id!, { isPaid: true, amountPaid: paidAmt })

    if (expense.isRecurring) {
      const next = new Date(expense.dueDate + 'T00:00:00')
      next.setMonth(next.getMonth() + 1)
      const newData = {
        name: expense.name, amount: expense.amount,
        dueDate: next.toISOString().split('T')[0],
        category: expense.category, notes: expense.notes,
        modeOfPayment: expense.modeOfPayment,
        isRecurring: true, isPaid: false, expenseType: 'monthly' as const,
      }
      const { data: row } = await dbWrite<{ id: string }>('personal_expenses', 'insert', {
        payload: {
          name: newData.name, amount: newData.amount, due_date: newData.dueDate,
          category: newData.category ?? null, notes: newData.notes ?? null,
          mode_of_payment: newData.modeOfPayment ?? null,
          is_paid: false, is_recurring: true, expense_type: 'monthly',
        },
        select: true, single: true,
      })
      await db.personalExpenses.add({ ...newData, supabaseId: row?.id })
      if (row?.id) logPersonalExpense(newData, row.id)
    }
    load()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const e = pendingDelete
    setPendingDelete(null)
    if (e.supabaseId) {
      deleteSheetRow('Personal Expenses', e.supabaseId)
      await dbWrite('personal_expenses', 'delete', { eq: { id: e.supabaseId } })
    }
    await db.personalExpenses.delete(e.id!)
    load()
  }

  async function handleLogPay() {
    if (!logPayEntry || !logPayAmount || parseFloat(logPayAmount) <= 0) return
    setLogPaySaving(true)
    const newPaid = Math.min((logPayEntry.amountPaid ?? 0) + parseFloat(logPayAmount), logPayEntry.amount)
    const nowPaid = newPaid >= logPayEntry.amount
    await db.personalExpenses.update(logPayEntry.id!, { amountPaid: newPaid, isPaid: nowPaid, pendingSync: true })
    if (navigator.onLine && logPayEntry.supabaseId) {
      const { error } = await dbWrite('personal_expenses', 'update', {
        payload: { amount_paid: newPaid, is_paid: nowPaid }, eq: { id: logPayEntry.supabaseId },
      })
      if (!error) {
        await db.personalExpenses.update(logPayEntry.id!, { pendingSync: false })
        deleteSheetRow('Personal Expenses', logPayEntry.supabaseId)
        logPersonalExpense({ ...logPayEntry, amountPaid: newPaid }, logPayEntry.supabaseId)
      }
    }
    setLogPayEntry(null)
    setLogPayAmount('')
    setLogPaySaving(false)
    load()
  }

  async function handlePayAll() {
    if (!confirmPayAll) return
    const entry = confirmPayAll
    setConfirmPayAll(null)
    await db.personalExpenses.update(entry.id!, { amountPaid: entry.amount, isPaid: true, pendingSync: true })
    if (navigator.onLine && entry.supabaseId) {
      const { error } = await dbWrite('personal_expenses', 'update', {
        payload: { amount_paid: entry.amount, is_paid: true }, eq: { id: entry.supabaseId },
      })
      if (!error) {
        await db.personalExpenses.update(entry.id!, { pendingSync: false })
        deleteSheetRow('Personal Expenses', entry.supabaseId)
        logPersonalExpense({ ...entry, amountPaid: entry.amount }, entry.supabaseId)
      }
    }
    load()
    if (previewEntry) setClosingPreview(true)
  }

  const q = search.toLowerCase()

  const filtered = expenses.filter(e => {
    if (q && !e.name.toLowerCase().includes(q) && !(e.category ?? '').toLowerCase().includes(q)) return false
    const type = resolveType(e)
    if (tab === 'active') return !e.isPaid && (type === 'one-time' || type === 'monthly')
    if (tab === 'monthly') return type === 'monthly'
    if (tab === 'instant') return type === 'instant'
    if (tab === 'history') {
      if (!e.isPaid) return false
      if (historyFilter === 'today') return e.dueDate === todayStr()
      if (historyFilter === 'yesterday') return e.dueDate === yesterdayStr()
      if (historyFilter === '7days') return e.dueDate >= daysAgoStr(7)
      if (historyFilter === 'range') {
        if (rangeFrom && e.dueDate < rangeFrom) return false
        if (rangeTo && e.dueDate > rangeTo) return false
        return true
      }
      return true
    }
    return true
  })

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

  const historyTotal = tab === 'history' ? filtered.reduce((s, e) => s + e.amount, 0) : 0

  const historyPills: { key: HistoryFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7days', label: '7 Days' },
    { key: 'range', label: '📅 Range' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>Personal Expenses</h1>
            <NetworkPill />
          </div>
          <button
            onClick={() => { setEditing(undefined); setShowForm(true) }}
            style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#C9848A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px #C9848A55' }}
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
                  background: active ? '#C9848A' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #C9848A33' : 'none',
                  flexShrink: 0,
                }}
              >
                {t.label}
                {t.badge !== undefined && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#C9848A', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '1px 5px', border: '2px solid #F9F3EE' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* History filters */}
        {tab === 'history' && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
              {historyPills.map(p => (
                <button
                  key={p.key}
                  onClick={() => setHistoryFilter(p.key)}
                  style={{
                    padding: '5px 12px', borderRadius: '16px', border: 'none',
                    fontSize: '12px', fontWeight: historyFilter === p.key ? 700 : 500,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    background: historyFilter === p.key ? '#2D2D2D' : '#fff',
                    color: historyFilter === p.key ? '#fff' : '#6b7280',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {historyFilter === 'range' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={e => setRangeFrom(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e5e0db', borderRadius: '8px', fontSize: '13px', color: '#2D2D2D', background: '#fff', outline: 'none', minWidth: 0 }}
                />
                <input
                  type="date"
                  value={rangeTo}
                  onChange={e => setRangeTo(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e5e0db', borderRadius: '8px', fontSize: '13px', color: '#2D2D2D', background: '#fff', outline: 'none', minWidth: 0 }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', flex: 1 }}>
        {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>Loading...</p>}
        {error && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>
              {tab === 'active' ? 'No unpaid bills. Great job!' :
               tab === 'monthly' ? 'No monthly bills yet. Tap + to add one.' :
               tab === 'instant' ? 'No instant purchases yet.' :
               'No paid expenses in this month.'}
            </p>
          </div>
        )}

        {tab === 'history' && !loading && !error && filtered.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Period Total</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(historyTotal)}</span>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {filtered.map(e => {
              const type = resolveType(e)
              const isInstant = type === 'instant'
              const fullyPaid = e.isPaid || (e.amountPaid ?? 0) >= e.amount
              const partial = !fullyPaid && (e.amountPaid ?? 0) > 0
              const u = urgency(e.dueDate, fullyPaid)
              const badge = partial ? { color: '#E8A838', bg: '#E8A83818', label: 'Partial' } : u
              return (
                <SwipeableItem
                  key={e.id}
                  id={e.id!}
                  activeId={activeSwipeId}
                  onActivate={setActiveSwipeId}
                  onPaid={!isInstant && !e.isPaid ? () => (e.amountPaid ?? 0) > 0 ? setConfirmPayAll(e) : markPaid(e) : undefined}
                  onPreview={() => setPreviewEntry(e)}
                  onEdit={() => { setEditing(e); setShowForm(true) }}
                  onDelete={() => setPendingDelete(e)}
                >
                  <div style={{
                    background: '#fff', padding: '10px 12px',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                        {!isInstant && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: '5px', padding: '1px 8px', minWidth: '44px', display: 'inline-block', textAlign: 'center' }}>
                            {badge.label}
                          </span>
                        )}
                        {isInstant && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#7A9E7E', background: '#7A9E7E18', borderRadius: '5px', padding: '1px 8px', minWidth: '44px', display: 'inline-block', textAlign: 'center' }}>
                            Paid
                          </span>
                        )}
                        <p style={{ fontWeight: 600, fontSize: '14px', color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.name}
                        </p>
                        {type === 'monthly' && <RefreshCw size={12} color="#9ca3af" />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                        {(tab === 'history' || !isInstant) && <span style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDate(e.dueDate)}</span>}
                        {e.category && <span style={{ fontSize: '11px', color: '#9ca3af' }}>· {e.category}</span>}
                        {e.modeOfPayment && <span style={{ fontSize: '11px', color: '#9ca3af' }}>· {e.modeOfPayment}</span>}
                        {e.loggedBy && <span style={{ fontSize: '11px', color: '#9ca3af' }}>· 👤 {e.loggedBy}</span>}
                      </div>
                      {partial && (
                        <p style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                          <span style={{ color: '#E8A838' }}>Paid {fmt(e.amountPaid!)} · </span>
                          <span style={{ color: '#8B1A1A' }}>Bal {fmt(e.amount - e.amountPaid!)}</span>
                        </p>
                      )}
                    </div>

                    {/* Right side: amount + receipt thumbnail */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {e.receiptUrl && (
                        <button
                          onClick={ev => { ev.stopPropagation(); setPreviewUrl(e.receiptUrl!) }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <img src={receiptIcon} width={22} height={22} alt="receipt" />
                        </button>
                      )}
                      <p style={{ fontWeight: 700, fontSize: '14px', color: '#2D2D2D' }}>{fmt(e.amount)}</p>
                    </div>
                  </div>
                </SwipeableItem>
              )
            })}
          </div>
        )}

        {/* Swipe hint */}
        {!loading && !error && filtered.length > 0 && tab !== 'instant' && (
          <p style={{ fontSize: '11px', color: '#d1ccc8', textAlign: 'center', marginTop: '16px' }}>← Swipe left for actions</p>
        )}
      </div>

      {/* Form modal */}
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
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#C9848A', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff', boxShadow: '0 2px 8px #C9848A44' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entry preview sheet */}
      {previewEntry && (
        <div
          onClick={() => setClosingPreview(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={closingPreview ? 'sheet-exit' : 'sheet-enter'}
            onAnimationEnd={e => { if (closingPreview && e.animationName === 'sheet-down') { setPreviewEntry(null); setClosingPreview(false) } }}
            style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '85svh', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
            </div>
            <div style={{ padding: '12px 20px 24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D', margin: 0, flex: 1, marginRight: '12px' }}>{previewEntry.name}</h2>
                <p style={{ fontSize: '20px', fontWeight: 800, color: '#2D2D2D', margin: 0, flexShrink: 0 }}>{fmt(previewEntry.amount)}</p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {(() => {
                  const type = resolveType(previewEntry)
                  const isInstant = type === 'instant'
                  const u = urgency(previewEntry.dueDate, previewEntry.isPaid)
                  return (
                    <>
                      {!isInstant && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: u.color, background: u.bg, borderRadius: '6px', padding: '3px 10px' }}>{u.label}</span>
                      )}
                      {isInstant && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#7A9E7E', background: '#7A9E7E18', borderRadius: '6px', padding: '3px 10px' }}>Paid</span>
                      )}
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: '6px', padding: '3px 10px', textTransform: 'capitalize' }}>{type}</span>
                    </>
                  )
                })()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                {previewEntry.category && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af' }}>Category</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>{previewEntry.category}</span>
                  </div>
                )}
                {resolveType(previewEntry) !== 'instant' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af' }}>Due date</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>{formatDate(previewEntry.dueDate)}</span>
                  </div>
                )}
                {previewEntry.modeOfPayment && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af' }}>Payment mode</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>{previewEntry.modeOfPayment}</span>
                  </div>
                )}
                {previewEntry.notes && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '13px', color: '#9ca3af' }}>Notes</span>
                    <span style={{ fontSize: '13px', color: '#2D2D2D' }}>{previewEntry.notes}</span>
                  </div>
                )}
              </div>

              {previewEntry.receiptUrl && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Receipt</p>
                  <button
                    onClick={() => setPreviewUrl(previewEntry.receiptUrl!)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <img src={receiptIcon} width={38} height={38} alt="receipt" />
                  </button>
                </div>
              )}

              {!previewEntry.isPaid && (previewEntry.amountPaid ?? 0) > 0 && (
                <>
                  <button
                    onClick={() => setConfirmPayAll(previewEntry)}
                    style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#8B1A1A', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #8B1A1A44', marginBottom: '10px' }}
                  >
                    Pay the remaining
                  </button>
                  <button
                    onClick={() => { setLogPayEntry(previewEntry); setClosingPreview(true) }}
                    style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#7A9E7E', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #7A9E7E44', marginBottom: '10px' }}
                  >
                    Log Payment
                  </button>
                </>
              )}
              <button
                onClick={() => { setClosingPreview(true); setEditing(previewEntry); setShowForm(true) }}
                style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', background: '#E8A838', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #E8A83844' }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Pay modal */}
      {logPayEntry && (
        <div
          onClick={() => { setLogPayEntry(null); setLogPayAmount('') }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 110, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
            </div>
            <div style={{ padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', margin: '0 0 4px' }}>Log Payment</h3>
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 16px' }}>
                {logPayEntry.name} · Balance {fmt(logPayEntry.amount - (logPayEntry.amountPaid ?? 0))}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', display: 'block' }}>Amount (₱) *</span>
                  <input
                    style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #e5e0db', borderRadius: '10px', fontSize: '15px', color: '#2D2D2D', background: '#fff', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
                    type="number" inputMode="decimal" placeholder="0.00" autoFocus
                    value={logPayAmount} onChange={e => setLogPayAmount(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleLogPay}
                  disabled={!logPayAmount || parseFloat(logPayAmount) <= 0 || logPaySaving}
                  style={{
                    width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
                    background: logPayAmount && parseFloat(logPayAmount) > 0 ? '#7A9E7E' : '#e5e0db',
                    color: logPayAmount && parseFloat(logPayAmount) > 0 ? '#fff' : '#9ca3af',
                    fontSize: '15px', fontWeight: 700, cursor: logPayAmount && parseFloat(logPayAmount) > 0 ? 'pointer' : 'default',
                    boxShadow: logPayAmount && parseFloat(logPayAmount) > 0 ? '0 4px 14px #7A9E7E44' : 'none',
                  }}
                >
                  {logPaySaving ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pay remaining confirmation */}
      {confirmPayAll && (
        <div onClick={() => setConfirmPayAll(null)} style={{ position: 'fixed', inset: 0, background: '#00000066', zIndex: 120, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#FAF7F4', borderRadius: '20px 20px 0 0', padding: '24px 20px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', margin: '0 0 8px' }}>Pay the remaining?</h3>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 20px' }}>
              This will mark <strong style={{ color: '#2D2D2D' }}>{confirmPayAll.name}</strong> as fully paid by adding {fmt(confirmPayAll.amount - (confirmPayAll.amountPaid ?? 0))} to the paid amount.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmPayAll(null)} style={{ flex: 1, padding: '14px', border: '1.5px solid #e5e0db', borderRadius: '12px', background: '#fff', color: '#9ca3af', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handlePayAll} style={{ flex: 1, padding: '14px', border: 'none', borderRadius: '12px', background: '#8B1A1A', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #8B1A1A44' }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <img
            src={previewUrl}
            alt="Receipt preview"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90svh', borderRadius: '12px', objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  )
}
