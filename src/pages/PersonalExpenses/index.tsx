import { useEffect, useState } from 'react'
import { Plus, RefreshCw, CheckCircle2, Circle, Search } from 'lucide-react'
import { db } from '../../db/db'
import type { PersonalExpense } from '../../db/db'
import ExpenseForm from './ExpenseForm'
import { supabase } from '../../lib/supabase'
import { logPersonalExpense } from '../../lib/sheets'

type Filter = 'all' | 'overdue' | 'upcoming'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function diffDays(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const now = new Date(todayStr() + 'T00:00:00')
  return Math.floor((due.getTime() - now.getTime()) / 86400000)
}

function urgency(dueDate: string, isPaid: boolean): { color: string; bg: string; label: string } {
  if (isPaid) return { color: '#9ca3af', bg: '#f3f4f6', label: 'Paid' }
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

export default function PersonalExpenses() {
  const [expenses, setExpenses] = useState<PersonalExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PersonalExpense | undefined>()

  function load() {
    db.personalExpenses
      .orderBy('dueDate')
      .toArray()
      .then(data => {
        setExpenses(data)
        setError(null)
      })
      .catch(err => setError(err.message ?? 'Failed to load expenses'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function togglePaid(expense: PersonalExpense) {
    const nowPaid = !expense.isPaid
    if (expense.supabaseId) {
      await supabase.from('personal_expenses').update({ is_paid: nowPaid }).eq('id', expense.supabaseId)
    }
    await db.personalExpenses.update(expense.id!, { isPaid: nowPaid })

    // Recurring: create next month's copy when marking paid
    if (nowPaid && expense.isRecurring) {
      const next = new Date(expense.dueDate + 'T00:00:00')
      next.setMonth(next.getMonth() + 1)
      const newData = {
        name: expense.name, amount: expense.amount,
        dueDate: next.toISOString().split('T')[0],
        category: expense.category, notes: expense.notes,
        isRecurring: true, isPaid: false,
      }
      const { data: row } = await supabase.from('personal_expenses').insert({
        name: newData.name, amount: newData.amount, due_date: newData.dueDate,
        category: newData.category ?? null, notes: newData.notes ?? null,
        is_paid: false, is_recurring: true,
      }).select().single()
      await db.personalExpenses.add({ ...newData, supabaseId: row?.id })
      if (row?.id) logPersonalExpense(newData, row.id)
    }

    load()
  }

  function openAdd() {
    setEditing(undefined)
    setShowForm(true)
  }

  function openEdit(expense: PersonalExpense) {
    setEditing(expense)
    setShowForm(true)
  }

  const today = todayStr()
  const q = search.toLowerCase()
  const filtered = expenses.filter(e => {
    if (filter === 'overdue' && (e.isPaid || e.dueDate >= today)) return false
    if (filter === 'upcoming' && (e.isPaid || e.dueDate < today)) return false
    if (q && !e.name.toLowerCase().includes(q) && !(e.category ?? '').toLowerCase().includes(q)) return false
    return true
  })

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'upcoming', label: 'Upcoming' },
  ]

  const overdueCount = expenses.filter(e => !e.isPaid && e.dueDate < today).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D' }}>Personal Expenses</h1>

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

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          {filters.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '20px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  background: active ? '#C9848A' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #C9848A33' : 'none',
                  position: 'relative',
                }}
              >
                {f.label}
                {f.key === 'overdue' && overdueCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    background: '#C9848A', color: '#fff',
                    fontSize: '10px', fontWeight: 700,
                    borderRadius: '10px', padding: '1px 5px',
                    border: '2px solid #F9F3EE',
                  }}>
                    {overdueCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', flex: 1 }}>
        {loading && (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>
            Loading...
          </p>
        )}

        {error && (
          <div style={{
            background: '#fee2e2', color: '#991b1b', borderRadius: '12px',
            padding: '14px 16px', fontSize: '14px', marginTop: '8px',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: '15px', color: '#9ca3af' }}>
              {filter === 'all' ? 'No expenses yet. Tap + to add one.' :
               filter === 'overdue' ? 'No overdue expenses.' :
               'No upcoming expenses.'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            {filtered.map(e => {
              const u = urgency(e.dueDate, e.isPaid)
              return (
                <div
                  key={e.id}
                  onClick={() => openEdit(e)}
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '14px 14px',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    opacity: e.isPaid ? 0.6 : 1,
                  }}
                >
                  {/* Paid toggle */}
                  <button
                    onClick={ev => { ev.stopPropagation(); togglePaid(e) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex' }}
                  >
                    {e.isPaid
                      ? <CheckCircle2 size={22} color="#7A9E7E" />
                      : <Circle size={22} color="#d1ccc8" />}
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{
                        fontWeight: 600, fontSize: '15px', color: '#2D2D2D',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: e.isPaid ? 'line-through' : 'none',
                      }}>
                        {e.name}
                      </p>
                      {e.isRecurring && <RefreshCw size={13} color="#9ca3af" />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700,
                        color: u.color, background: u.bg,
                        borderRadius: '5px', padding: '2px 7px',
                      }}>
                        {u.label}
                      </span>
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>{formatDate(e.dueDate)}</span>
                      {e.category && (
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>· {e.category}</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D', flexShrink: 0 }}>
                    {fmt(e.amount)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={openAdd}
        style={{
          position: 'fixed',
          bottom: 'calc(72px + 16px)',
          right: '16px',
          width: '52px', height: '52px',
          borderRadius: '50%',
          background: '#C9848A',
          border: 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px #C9848A55',
          zIndex: 40,
        }}
      >
        <Plus size={24} color="#fff" strokeWidth={2.5} />
      </button>

      {/* Form modal */}
      {showForm && (
        <ExpenseForm
          expense={editing}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
