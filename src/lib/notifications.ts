import { db } from '../db/db'
import { todayPH, daysFromNowPH } from './dateUtils'

function nDaysFromNow(n: number): string { return daysFromNowPH(n) }

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

export function notificationsEnabled(): boolean {
  return getPermissionStatus() === 'granted' && localStorage.getItem('af-notif-enabled') !== '0'
}

export function setNotificationsEnabled(on: boolean) {
  localStorage.setItem('af-notif-enabled', on ? '1' : '0')
}

export async function sendTestNotification(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Test Notification 🌸', {
    body: 'Notifications are working! You’ll get reminders here.',
    icon: '/icons/icon-192.png',
    tag: 'test-notif',
  })
  return 'ok'
}

// Trigger date (YYYY-MM-DD) for the month-end reminder: 3 days before the last
// day of the current PH month.
function monthEndReminderDate(): string {
  const [y, m] = todayPH().split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const d = new Date(y, m - 1, lastDay - 3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function checkAndFireReminders(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  if (!notificationsEnabled()) return

  const today = todayPH()

  // Fire at most once per calendar day
  const lastCheck = localStorage.getItem('reminder-check-date')
  if (lastCheck === today) return

  try {
    const [expenses, allOrders, allPayments] = await Promise.all([
      db.personalExpenses.filter(e => !e.isPaid).toArray(),
      db.orders.toArray(),
      db.payments.toArray(),
    ])
    const orders = allOrders.filter(o => !o.isDone)

    const reg = await navigator.serviceWorker.ready
    // Only mark today as checked once the service worker is confirmed ready —
    // a transient failure here shouldn't permanently skip reminders for the day
    localStorage.setItem('reminder-check-date', today)
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
      } else if (o.dueDate < today) {
        await reg.showNotification('Advance Order Overdue ⚠️', {
          body: `${o.customerName} · ${o.description} · was due ${shortDate(o.dueDate)}`,
          icon: '/icons/icon-192.png',
          tag: `order-overdue-${o.id}`,
        })
      }
    }

    // Month-end summary: 3 days before the last day of the month
    if (today === monthEndReminderDate()) {
      const unfulfilledCount = orders.length
      let pendingCount = 0
      let pendingTotal = 0
      for (const o of allOrders) {
        const paid = o.depositPaid + allPayments
          .filter(p => p.orderId === o.id)
          .reduce((s, p) => s + p.amount, 0)
        const balance = o.totalAmount - paid
        if (balance > 0) { pendingCount++; pendingTotal += balance }
      }
      if (unfulfilledCount > 0 || pendingCount > 0) {
        await reg.showNotification('Month-End Reminder 🌸', {
          body: `${unfulfilledCount} unfulfilled advance order(s) · ${pendingCount} pending payment(s) (₱${pendingTotal.toLocaleString('en-PH')})`,
          icon: '/icons/icon-192.png',
          tag: 'month-end-summary',
        })
      }
    }
  } catch {
    // Notifications are best-effort — never crash the app
  }
}
