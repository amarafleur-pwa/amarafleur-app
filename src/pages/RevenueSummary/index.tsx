import { useEffect, useState } from 'react'
import { Download, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { db } from '../../db/db'
import type { Order, Payment, BusinessExpense } from '../../db/db'

type Period = 'daily' | 'weekly' | 'monthly'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function getPeriodRange(period: Period): { start: string; end: string } {
  const today = new Date()
  const start = new Date(today)
  const end = new Date(today)

  if (period === 'weekly') {
    start.setDate(today.getDate() - today.getDay()) // back to Sunday
    end.setDate(start.getDate() + 6)
  } else if (period === 'monthly') {
    start.setDate(1)
    end.setMonth(end.getMonth() + 1, 0) // last day of month
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function getPeriodLabel(period: Period, range: { start: string; end: string }) {
  const opts = (o: Intl.DateTimeFormatOptions) =>
    new Date(range.start + 'T00:00:00').toLocaleDateString('en-PH', o)
  if (period === 'daily')
    return opts({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  if (period === 'weekly') {
    const s = new Date(range.start + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    const e = new Date(range.end + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} – ${e}`
  }
  return opts({ month: 'long', year: 'numeric' })
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

const fmt = (n: number) => '₱' + Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })

async function exportCSV() {
  const [orders, payments, businessExpenses, personalExpenses] = await Promise.all([
    db.orders.orderBy('dueDate').toArray(),
    db.payments.orderBy('paidAt').toArray(),
    db.businessExpenses.orderBy('dueDate').toArray(),
    db.personalExpenses.orderBy('dueDate').toArray(),
  ])

  const esc = (s: string | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`

  const rows: string[] = [
    'Type,Name / Customer,Date,Amount,Status,Details',
  ]

  for (const o of orders) {
    const totalPaid = o.depositPaid + payments.filter(p => p.orderId === o.id).reduce((s, p) => s + p.amount, 0)
    const balance = o.totalAmount - totalPaid
    const status = balance <= 0 ? 'Fully Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid'
    rows.push([
      'Order', esc(o.customerName), o.dueDate,
      o.totalAmount.toFixed(2), status,
      esc(`${o.description}${o.quantity && o.quantity > 1 ? ` x${o.quantity}` : ''}`),
    ].join(','))
  }

  for (const p of payments) {
    const order = orders.find(o => o.id === p.orderId)
    rows.push([
      'Payment', esc(order?.customerName), p.paidAt,
      p.amount.toFixed(2), p.type,
      esc(order?.description),
    ].join(','))
  }

  for (const e of businessExpenses) {
    rows.push([
      'Business Expense', esc(e.name), e.dueDate,
      e.amount.toFixed(2), e.isPaid ? 'Paid' : 'Unpaid',
      esc(e.category),
    ].join(','))
  }

  for (const e of personalExpenses) {
    rows.push([
      'Personal Expense', esc(e.name), e.dueDate,
      e.amount.toFixed(2), e.isPaid ? 'Paid' : 'Unpaid',
      esc(e.category),
    ].join(','))
  }

  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `amarafleur-${todayStr()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function RevenueSummary() {
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [businessExpenses, setBusinessExpenses] = useState<BusinessExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('monthly')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([
      db.orders.toArray(),
      db.payments.toArray(),
      db.businessExpenses.toArray(),
    ])
      .then(([o, p, b]) => {
        setOrders(o)
        setPayments(p)
        setBusinessExpenses(b)
        setError(null)
      })
      .catch(err => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const range = getPeriodRange(period)

  // Revenue = deposits from orders placed in period + payment records in period
  const periodDeposits = orders
    .filter(o => inRange(o.orderDate, range.start, range.end) && o.depositPaid > 0)
  const depositTotal = periodDeposits.reduce((s, o) => s + o.depositPaid, 0)

  const periodPayments = payments.filter(p => inRange(p.paidAt, range.start, range.end))
  const paymentTotal = periodPayments.reduce((s, p) => s + p.amount, 0)

  const revenue = depositTotal + paymentTotal
  const txCount = periodDeposits.length + periodPayments.length

  // Expenses = business expenses with dueDate in period
  const periodExpenses = businessExpenses.filter(e => inRange(e.dueDate, range.start, range.end))
  const expenseTotal = periodExpenses.reduce((s, e) => s + e.amount, 0)
  const paidExpenses = periodExpenses.filter(e => e.isPaid).reduce((s, e) => s + e.amount, 0)

  const net = revenue - expenseTotal
  const maxBar = Math.max(revenue, expenseTotal, 1)

  const periodLabel = getPeriodLabel(period, range)

  async function handleExport() {
    setExporting(true)
    try {
      await exportCSV()
    } finally {
      setExporting(false)
    }
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: '32px' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D' }}>Revenue Summary</h1>

        {/* Period tabs */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          {periods.map(p => {
            const active = period === p.key
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: '7px 18px', borderRadius: '20px', border: 'none',
                  fontSize: '13px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  background: active ? '#C9848A' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #C9848A33' : 'none',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '10px' }}>{periodLabel}</p>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>Loading...</p>}

      {error && (
        <div style={{ margin: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '14px 16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Revenue card */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <TrendingUp size={18} color="#7A9E7E" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#6b7280' }}>Income Collected</span>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 800, color: '#2D2D2D', letterSpacing: '-0.5px' }}>{fmt(revenue)}</p>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '20px' }}>
              <div>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Deposits</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(depositTotal)}</p>
              </div>
              <ArrowRight size={14} color="#d1ccc8" style={{ alignSelf: 'center' }} />
              <div>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Balance Payments</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>{fmt(paymentTotal)}</p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Transactions</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>{txCount}</p>
              </div>
            </div>
          </div>

          {/* Expenses card */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <TrendingDown size={18} color="#E8A838" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#6b7280' }}>Business Expenses</span>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 800, color: '#2D2D2D', letterSpacing: '-0.5px' }}>{fmt(expenseTotal)}</p>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '20px' }}>
              <div>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Paid</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#7A9E7E' }}>{fmt(paidExpenses)}</p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Unpaid</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#E8A838' }}>{fmt(expenseTotal - paidExpenses)}</p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>Count</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#2D2D2D' }}>{periodExpenses.length}</p>
              </div>
            </div>
          </div>

          {/* Net income card */}
          <div style={{
            background: net >= 0 ? '#7A9E7E18' : '#C9848A12',
            border: `1.5px solid ${net >= 0 ? '#7A9E7E40' : '#C9848A33'}`,
            borderRadius: '14px', padding: '16px',
          }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280', marginBottom: '8px' }}>Net Income</p>
            <p style={{ fontSize: '34px', fontWeight: 800, color: net >= 0 ? '#7A9E7E' : '#C9848A', letterSpacing: '-0.5px' }}>
              {net >= 0 ? '+' : '−'}{fmt(net)}
            </p>

            {/* Comparison bars */}
            {(revenue > 0 || expenseTotal > 0) && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#7A9E7E', width: '60px', textAlign: 'right' }}>Income</span>
                  <div style={{ flex: 1, height: '10px', background: '#e5e0db', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '5px',
                      background: '#7A9E7E',
                      width: `${(revenue / maxBar) * 100}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#2D2D2D', width: '70px' }}>{fmt(revenue)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#E8A838', width: '60px', textAlign: 'right' }}>Expenses</span>
                  <div style={{ flex: 1, height: '10px', background: '#e5e0db', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '5px',
                      background: '#E8A838',
                      width: `${(expenseTotal / maxBar) * 100}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#2D2D2D', width: '70px' }}>{fmt(expenseTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              width: '100%', padding: '16px',
              background: '#2D2D2D', color: '#fff',
              border: 'none', borderRadius: '14px',
              fontSize: '15px', fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: '0 4px 16px rgba(45,45,45,0.25)',
              marginTop: '4px',
            }}
          >
            <Download size={18} color="#fff" />
            {exporting ? 'Preparing...' : 'Export All Data to CSV'}
          </button>

          <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', marginTop: '-4px' }}>
            Exports orders, payments, and all expenses
          </p>
        </div>
      )}
    </div>
  )
}
