import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck2, Clock, DollarSign } from 'lucide-react'
import { db } from '../../db/db'
import type { Order } from '../../db/db'
import { useSyncVersion } from '../../lib/SyncContext'
import { NetworkPill } from '../../components/OfflineBanner'
import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/currentUser'

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
  borderRadius: '18px',
  padding: '16px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
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

type BibleVerse = { text: string; ref: string }

function useDailyVerse(): BibleVerse | null {
  const [verse, setVerse] = useState<BibleVerse | null>(() => {
    try {
      const cached = localStorage.getItem('af-bible-verse')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.date === new Date().toISOString().split('T')[0]) {
          return { text: parsed.text, ref: parsed.ref }
        }
      }
    } catch {}
    return null
  })

  useEffect(() => {
    if (verse) return
    fetch('https://labs.bible.org/api/?passage=votd&type=json')
      .then(r => r.json())
      .then((data: Array<{ bookname: string; chapter: string; verse: string; text: string }>) => {
        const v = data[0]
        const text = v.text.replace(/<[^>]+>/g, '').trim()
        const ref = `${v.bookname} ${v.chapter}:${v.verse}`
        const today = new Date().toISOString().split('T')[0]
        localStorage.setItem('af-bible-verse', JSON.stringify({ date: today, text, ref }))
        setVerse({ text, ref })
      })
      .catch(() => {})
  }, [verse])

  return verse
}

export default function Dashboard() {
  const navigate = useNavigate()
  const syncVersion = useSyncVersion()
  const [advanceOrders, setAdvanceOrders] = useState<Order[]>([])
  const [dueItems, setDueItems] = useState<DueItem[]>([])
  const [unpaidTotal, setUnpaidTotal] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const currentUser = getCurrentUser()
  const photoCacheKey = `af-profile-photo-${currentUser}`
  const [profilePhoto, setProfilePhoto] = useState<string | null>(() => localStorage.getItem(photoCacheKey))
  const dailyVerse = useDailyVerse()

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === photoCacheKey) setProfilePhoto(e.newValue)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [photoCacheKey])

  useEffect(() => {
    if (!currentUser) return
    supabase
      .from('app_users')
      .select('photo_url')
      .ilike('name', currentUser)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (data.photo_url) {
          localStorage.setItem(photoCacheKey, data.photo_url)
          setProfilePhoto(data.photo_url)
        } else {
          localStorage.removeItem(photoCacheKey)
          setProfilePhoto(null)
        }
      })

    const channel = supabase
      .channel(`app-users-photo-${currentUser}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_users' }, payload => {
        const updatedName = payload.new.name
        const updatedUrl = payload.new.photo_url
        if (typeof updatedName !== 'string' || updatedName.toLowerCase() !== currentUser.toLowerCase()) return
        if (updatedUrl) {
          localStorage.setItem(photoCacheKey, updatedUrl)
          setProfilePhoto(updatedUrl)
        } else {
          localStorage.removeItem(photoCacheKey)
          setProfilePhoto(null)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUser])

  useEffect(() => {
    const t = todayStr()
    const in7 = daysFromNow(7)

    Promise.all([
      db.orders.filter(o => o.dueDate > t && !o.isDone).toArray(),
      db.personalExpenses.where('dueDate').belowOrEqual(in7).filter(e => !e.isPaid && e.expenseType !== 'instant').toArray(),
      db.businessExpenses.where('dueDate').belowOrEqual(in7).filter(e => !e.isPaid && e.expenseType !== 'instant').toArray(),
      db.orders.filter(o => !o.isDone).toArray(),
    ]).then(([orders, personal, business, active]) => {
      setAdvanceOrders(orders)

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
  }, [syncVersion])

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>

      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, #C9848A1A 0%, #F9F3EE 60%, #7A9E7E14 100%)',
        borderRadius: '0 0 28px 28px',
        padding: '20px 16px 24px',
        margin: '-16px -16px 0',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -48, right: -48,
          width: 160, height: 160, borderRadius: '50%',
          background: '#C9848A0F', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -24, right: 56,
          width: 90, height: 90, borderRadius: '50%',
          background: '#7A9E7E0D', pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <NetworkPill />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', marginTop: '4px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#2D2D2D', letterSpacing: '-0.2px', fontStyle: 'italic', lineHeight: 1.2 }}>
            Hello, Amara Fleur 🌸
          </h1>
          <div
            onClick={() => navigate('/settings')}
            title="Profile"
            style={{
              width: 52, height: 52, borderRadius: '50%',
              border: '2px solid #C9848A',
              boxShadow: '0 2px 8px rgba(201,132,138,0.25)',
              overflow: 'hidden', flexShrink: 0,
              marginTop: '2px', cursor: 'pointer',
              background: '#F9E8EA',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {profilePhoto
              ? <img src={profilePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '15px', fontWeight: 700, color: '#C9848A', letterSpacing: '0.5px' }}>AF</span>
            }
          </div>
        </div>
        {/* Daily Bible Verse */}
        <div style={{ position: 'relative', marginTop: '16px' }}>
          {dailyVerse ? (
            <>
              <p style={{
                fontSize: '12px', fontStyle: 'italic', color: '#6b7280',
                lineHeight: 1.5, margin: 0,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                <span style={{ color: '#C9848A', fontStyle: 'normal', fontWeight: 700, marginRight: 2 }}>"</span>
                {dailyVerse.text}
                <span style={{ color: '#C9848A', fontStyle: 'normal', fontWeight: 700, marginLeft: 2 }}>"</span>
              </p>
              <p style={{ fontSize: '11px', color: '#C9848A', fontWeight: 600, margin: '4px 0 0', textAlign: 'right' }}>
                — {dailyVerse.ref}
              </p>
            </>
          ) : (
            <div style={{
              height: '14px', width: '65%',
              borderRadius: '6px', background: '#C9848A14',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>

      {/* Advance Orders */}
      <div style={{ ...card }}>
        <div style={cardHeader}>
          <CalendarCheck2 size={18} color="#C9848A" />
          <span style={cardTitle}>Advance Orders</span>
          <span style={{
            marginLeft: 'auto',
            background: '#C9848A',
            color: '#fff',
            borderRadius: '12px',
            padding: '1px 10px',
            fontSize: '13px',
            fontWeight: 700,
          }}>
            {advanceOrders.length}
          </span>
        </div>

        {advanceOrders.length === 0 ? (
          <p style={emptyText}>No advance orders booked</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {advanceOrders.map(o => (
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
      <div style={{ ...card }}>
        <div style={cardHeader}>
          <Clock size={18} color="#E8A838" />
          <span style={cardTitle}>Upcoming Bills</span>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>next 7 days</span>
        </div>

        {dueItems.length === 0 ? (
          <p style={emptyText}>No bills due in the next 7 days</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '10px' }}>
            {dueItems.map(item => {
              const { color, label } = urgencyTag(item.diff)
              return (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{
                      width: '52px',
                      textAlign: 'center',
                      background: color + '22',
                      color,
                      borderRadius: '5px',
                      padding: '2px 0',
                      fontSize: '10px',
                      fontWeight: 700,
                      flexShrink: 0,
                      boxSizing: 'border-box',
                    }}>
                      {label}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: '13px', color: '#2D2D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      <p style={{ fontSize: '10px', color: '#9ca3af' }}>{item.type}</p>
                    </div>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#2D2D2D', whiteSpace: 'nowrap', marginLeft: '10px', flexShrink: 0 }}>
                    {fmt(item.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Unpaid Balances */}
      <div style={{ ...card }}>
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

    </div>
  )
}
