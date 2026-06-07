import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { requestPermission, checkAndFireReminders } from '../lib/notifications'

export default function NotificationBanner() {
  const [visible, setVisible] = useState(() => {
    if (!('Notification' in window)) return false
    if (Notification.permission !== 'default') return false
    if (localStorage.getItem('notif-banner-dismissed')) return false
    return true
  })
  const [requesting, setRequesting] = useState(false)

  if (!visible) return null

  async function handleEnable() {
    setRequesting(true)
    const result = await requestPermission()
    setRequesting(false)
    setVisible(false)
    if (result === 'granted') {
      await checkAndFireReminders()
    }
  }

  function handleDismiss() {
    localStorage.setItem('notif-banner-dismissed', '1')
    setVisible(false)
  }

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #e5e0db',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <div style={{
        background: '#C9848A18',
        borderRadius: '10px',
        padding: '8px',
        flexShrink: 0,
        display: 'flex',
      }}>
        <Bell size={17} color="#C9848A" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#2D2D2D' }}>Enable Reminders</p>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>
          Due bills &amp; tomorrow's orders
        </p>
      </div>
      <button
        onClick={handleEnable}
        disabled={requesting}
        style={{
          background: '#C9848A', color: '#fff',
          border: 'none', borderRadius: '8px',
          padding: '8px 14px', fontSize: '13px', fontWeight: 700,
          cursor: requesting ? 'default' : 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 8px #C9848A44',
          opacity: requesting ? 0.7 : 1,
        }}
      >
        {requesting ? '…' : 'Enable'}
      </button>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px',
          flexShrink: 0, display: 'flex',
        }}
      >
        <X size={16} color="#9ca3af" />
      </button>
    </div>
  )
}
