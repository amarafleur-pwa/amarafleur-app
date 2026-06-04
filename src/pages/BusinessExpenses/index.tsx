import { useEffect, useState } from 'react'
import { Plus, ChevronDown, ChevronUp, CheckCircle2, Circle, Search } from 'lucide-react'
import { db } from '../../db/db'
import type { BusinessExpense } from '../../db/db'
import ExpenseForm from './ExpenseForm'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['Supplies', 'Utilities', 'Rent', 'Delivery', 'Other']
type StatusFilter = 'all' | 'unpaid' | 'paid'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

export default function BusinessExpenses() {
  const [expenses, setExpenses] = useState<BusinessExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BusinessExpense | undefined>()

  function load() {
    db.businessExpenses
      .orderBy('dueDate')
      .reverse()
      .toArray()
      .then(data => {
        setExpenses(data)
        setError(null)
      })
      .catch(err => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function togglePaid(expense: BusinessExpense) {
    if (expense.supabaseId) {
      await supabase.from('business_expenses').update({ is_paid: !expense.isPaid }).eq('id', expense.supabaseId)
    }
    await db.businessExpenses.update(expense.id!, { isPaid: !expense.isPaid })
    load()
  }

  function openEdit(expense: BusinessExpense) {
    setEditing(expense)
    setShowForm(true)
  }

  function openAdd() {
    setEditing(undefined)
    setShowForm(true)
  }

  const q = search.toLowerCase()
  const filtered = expenses.filter(e => {
    if (statusFilter === 'paid' && !e.isPaid) return false
    if (statusFilter === 'unpaid' && e.isPaid) return false
    if (catFilter && e.category !== catFilter) return false
    if (q && !e.name.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false
    return true
  })

  // Category breakdown totals
  const breakdown = CATEGORIES.map(cat => {
    const items = expenses.filter(e => e.category === cat)
    const total = items.reduce((s, e) => s + e.amount, 0)
    const unpaid = items.filter(e => !e.isPaid).reduce((s, e) => s + e.amount, 0)
    return { cat, total, unpaid, count: items.length }
  }).filter(b => b.count > 0)

  const totalUnpaid = expenses.filter(e => !e.isPaid).reduce((s, e) => s + e.amount, 0)
  const unpaidCount = expenses.filter(e => !e.isPaid).length

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'paid', label: 'Paid' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D' }}>Business Expenses</h1>

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

        {/* Unpaid summary */}
        {unpaidCount > 0 && (
          <div style={{
            marginTop: '12px',
            background: '#E8A83812',
            border: '1.5px solid #E8A83840',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Outstanding</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(totalUnpaid)}</p>
            </div>
            <span style={{
              background: '#E8A838', color: '#fff',
              borderRadius: '12px', padding: '3px 12px',
              fontSize: '13px', fontWeight: 700,
            }}>
              {unpaidCount} unpaid
            </span>
          </div>
        )}

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          {statusTabs.map(t => {
            const active = statusFilter === t.key
            return (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                style={{
                  padding: '7px 16px', borderRadius: '20px', border: 'none',
                  fontSize: '13px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  background: active ? '#7A9E7E' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #7A9E7E33' : 'none',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            onClick={() => setCatFilter(null)}
            style={{
              padding: '5px 14px', borderRadius: '16px', border: 'none',
              fontSize: '12px', fontWeight: catFilter === null ? 700 : 500,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: catFilter === null ? '#2D2D2D' : '#fff',
              color: catFilter === null ? '#fff' : '#6b7280',
              flexShrink: 0,
            }}
          >
            All Categories
          </button>
          {CATEGORIES.map(cat => {
            const active = catFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(active ? null : cat)}
                style={{
                  padding: '5px 14px', borderRadius: '16px', border: 'none',
                  fontSize: '12px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: active ? '#2D2D2D' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  flexShrink: 0,
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', flex: 1 }}>

        {/* Category breakdown */}
        {breakdown.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: '12px',
            overflow: 'hidden', marginBottom: '12px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            <button
              onClick={() => setShowBreakdown(b => !b)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', padding: '12px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#2D2D2D' }}>Category Breakdown</span>
              {showBreakdown ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
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
                      {b.unpaid > 0 && (
                        <p style={{ fontSize: '11px', color: '#E8A838' }}>{fmt(b.unpaid)} unpaid</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>
            Loading...
          </p>
        )}

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: '15px', color: '#9ca3af' }}>
              {expenses.length === 0 ? 'No expenses yet. Tap + to add one.' : 'No expenses match this filter.'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(e => (
              <div
                key={e.id}
                onClick={() => openEdit(e)}
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  padding: '14px',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  opacity: e.isPaid ? 0.65 : 1,
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
                  <p style={{
                    fontWeight: 600, fontSize: '15px', color: '#2D2D2D',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: e.isPaid ? 'line-through' : 'none',
                  }}>
                    {e.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      color: e.isPaid ? '#7A9E7E' : '#E8A838',
                      background: e.isPaid ? '#7A9E7E18' : '#E8A83818',
                      borderRadius: '5px', padding: '2px 7px',
                    }}>
                      {e.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>{formatDate(e.dueDate)}</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>· {e.category}</span>
                    {e.modeOfPayment && (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>· {e.modeOfPayment}</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D', flexShrink: 0 }}>
                  {fmt(e.amount)}
                </p>
              </div>
            ))}
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
          background: '#7A9E7E',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px #7A9E7E55',
          zIndex: 40,
        }}
      >
        <Plus size={24} color="#fff" strokeWidth={2.5} />
      </button>

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
