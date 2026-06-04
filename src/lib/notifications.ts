import { db } from '../db/db'

function nDaysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function shortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export function getPermissionStatus(): NotificationPermission | null {
  if (!('Notification' in window)) return null
  return Notification.permission
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export async function checkAndFireReminders(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  if (Notification.permission !== 'granted') return

  const today = new Date().toISOString().split('T')[0]

  // Fire at most once per calendar day
  const lastCheck = localStorage.getItem('reminder-check-date')
  if (lastCheck === today) return
  localStorage.setItem('reminder-check-date', today)

  try {
    const [expenses, orders] = await Promise.all([
      db.personalExpenses.filter(e => !e.isPaid).toArray(),
      db.orders.filter(o => !o.isDone).toArray(),
    ])

    const reg = await navigator.serviceWorker.ready
    const in3 = nDaysFromNow(3)
    const tomorrow = nDaysFromNow(1)

    for (const e of expenses) {
      if (e.dueDate === today) {
        await reg.showNotification('Bill Due Today 🌸', {
          body: `${e.name} · ₱${e.amount.toLocaleString('en-PH')}`,
          icon: '/icons/icon-192.png',
          tag: `bill-today-${e.id}`,
        })
      } else if (e.dueDate === in3) {
        await reg.showNotification('Bill Due in 3 Days 🌸', {
          body: `${e.name} · ₱${e.amount.toLocaleString('en-PH')} · due ${shortDate(e.dueDate)}`,
          icon: '/icons/icon-192.png',
          tag: `bill-3d-${e.id}`,
        })
      }
    }

    for (const o of orders) {
      if (o.dueDate === tomorrow) {
        await reg.showNotification('Order Due Tomorrow! 🌸', {
          body: `${o.customerName} · ${o.description}${o.time ? ` · ${o.time}` : ''}`,
          icon: '/icons/icon-192.png',
          tag: `order-tmrw-${o.id}`,
        })
      }
    }
  } catch {
    // Notifications are best-effort — never crash the app
  }
}
