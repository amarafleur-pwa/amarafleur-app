import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck2, Clock, DollarSign, Wallet, ShoppingBag, Receipt, Lock } from 'lucide-react'
import { db } from '../../db/db'
import type { Order } from '../../db/db'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function daysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function diffDays(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const now = new Date(todayStr() + 'T00:00:00')
  return Math.floor((due.getTime() - now.getTime()) / 86400000)
}

type DueItem = {
  key: string
  name: string
  amount: number
  dueDate: string
  type: 'Personal' | 'Business'
  diff: number
}

function urgencyTag(diff: number): { color: string; label: string } {
  if (diff < 0) return { color: '#C9848A', label: 'Overdue' }
  if (diff === 0) return { color: '#E8A838', label: 'Today' }
  if (diff <= 2) return { color: '#E8A838', label: `${diff}d` }
  return { color: '#7A9E7E', label: `${diff}d` }
}

const fmt = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })

const card: CSSProperties = {
  background: '#fff',
  borderRadius: '14px',
  padding: '16px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
}

const cardHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const cardTitle: CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  color: '#2D2D2D',
}

const emptyText: CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  marginTop: '12px',
  textAlign: 'center',
  padding: '4px 0',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [todayOrders, setTodayOrders] = useState<Order[]>([])
  const [dueItems, setDueItems] = useState<DueItem[]>([])
  const [unpaidTotal, setUnpaidTotal] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)

  useEffect(() => {
    const t = todayStr()
    const in7 = daysFromNow(7)

    Promise.all([
      db.orders.filter(o => o.dueDate === t && !o.isDone).toArray(),
      db.personalExpenses.where('dueDate').belowOrEqual(in7).filter(e => !e.isPaid).toArray(),
      db.businessExpenses.where('dueDate').belowOrEqual(in7).filter(e => !e.isPaid).toArray(),
      db.orders.filter(o => !o.isDone).toArray(),
    ]).then(([orders, personal, business, active]) => {
      setTodayOrders(orders)

      const items: DueItem[] = [
        ...personal.map(e => ({
          key: `p-${e.id}`,
          name: e.name,
          amount: e.amount,
          dueDate: e.dueDate,
          type: 'Personal' as const,
          diff: diffDays(e.dueDate),
        })),
        ...business.map(e => ({
          key: `b-${e.id}`,
          name: e.name,
          amount: e.amount,
          dueDate: e.dueDate,
          type: 'Business' as const,
          diff: diffDays(e.dueDate),
        })),
      ]
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 6)

      setDueItems(items)

      const total = active.reduce((sum, o) => sum + Math.max(0, o.totalAmount - o.depositPaid), 0)
      setUnpaidTotal(total)
      setUnpaidCount(active.filter(o => o.totalAmount - o.depositPaid > 0).length)
    })
  }, [])

  const quickAdd = [
    { label: 'Order', icon: CalendarCheck2, path: '/calendar', color: '#C9848A' },
    { label: 'Personal Bill', icon: Wallet, path: '/personal', color: '#E8A838' },
    { label: 'Business Bill', icon: ShoppingBag, path: '/business', color: '#7A9E7E' },
    { label: 'Payment', icon: Receipt, path: '/payments', color: '#2D2D2D' },
  ]

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D', marginTop: '2px' }}>
            Amara Fleur
          </h1>
        </div>
        <button
          onClick={() => { localStorage.removeItem('af-authed'); window.location.reload() }}
          title="Lock app"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px', marginTop: '2px', display: 'flex',
            borderRadius: '8px', color: '#d1ccc8',
          }}
        >
          <Lock size={20} color="#d1ccc8" />
        </button>
      </div>

      {/* Today's Orders */}
      <div style={card}>
        <div style={cardHeader}>
          <CalendarCheck2 size={18} color="#C9848A" />
          <span style={cardTitle}>Today's Orders</span>
          <span style={{
            marginLeft: 'auto',
            background: '#C9848A',
            color: '#fff',
            borderRadius: '12px',
            padding: '1px 10px',
            fontSize: '13px',
            fontWeight: 700,
          }}>
            {todayOrders.length}
          </span>
        </div>

        {todayOrders.length === 0 ? (
          <p style={emptyText}>No orders due today</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {todayOrders.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '14px', color: '#2D2D2D' }}>{o.customerName}</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>{o.description}</p>
                </div>
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#C9848A', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                  {fmt(o.totalAmount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Bills */}
      <div style={card}>
        <div style={cardHeader}>
          <Clock size={18} color="#E8A838" />
          <span style={cardTitle}>Upcoming Bills</span>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>next 7 days</span>
        </div>

        {dueItems.length === 0 ? (
          <p style={emptyText}>No bills due in the next 7 days</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {dueItems.map(item => {
              const { color, label } = urgencyTag(item.diff)
              return (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      minWidth: '44px',
                      textAlign: 'center',
                      background: color + '22',
                      color,
                      borderRadius: '6px',
                      padding: '3px 4px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}>
                      {label}
                    </span>
                    <div>
                      <p style={{ fontWeight: 500, fontSize: '14px', color: '#2D2D2D' }}>{item.name}</p>
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{item.type}</p>
                    </div>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#2D2D2D', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                    {fmt(item.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Unpaid Balances */}
      <div style={card}>
        <div style={cardHeader}>
          <DollarSign size={18} color="#7A9E7E" />
          <span style={cardTitle}>Unpaid Balances</span>
        </div>

        {unpaidCount === 0 ? (
          <p style={emptyText}>All orders are settled</p>
        ) : (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '30px', fontWeight: 700, color: '#2D2D2D', letterSpacing: '-0.5px' }}>
              {fmt(unpaidTotal)}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
              outstanding across {unpaidCount} order{unpaidCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Quick Add */}
      <div>
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Quick Add
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {quickAdd.map(({ label, icon: Icon, path, color }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 14px',
                background: '#fff',
                border: `1.5px solid ${color}28`,
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                color: '#2D2D2D',
                boxShadow: `0 2px 8px ${color}18`,
                textAlign: 'left',
              }}
            >
              <span style={{
                background: color + '18',
                borderRadius: '8px',
                padding: '7px',
                display: 'flex',
                flexShrink: 0,
              }}>
                <Icon size={17} color={color} />
              </span>
              + {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
