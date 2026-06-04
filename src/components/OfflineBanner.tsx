import { useEffect, useState } from 'react'
import { Wifi } from 'lucide-react'

type Phase = 'hidden' | 'offline' | 'back-online' | 'leaving'

export function NetworkPill() {
  const [phase, setPhase] = useState<Phase>(() =>
    navigator.onLine ? 'hidden' : 'offline'
  )

  useEffect(() => {
    let leaveTimer: ReturnType<typeof setTimeout>
    let hideTimer: ReturnType<typeof setTimeout>

    const goOffline = () => {
      clearTimeout(leaveTimer)
      clearTimeout(hideTimer)
      setPhase('offline')
    }

    const goOnline = () => {
      clearTimeout(leaveTimer)
      clearTimeout(hideTimer)
      setPhase('back-online')
      leaveTimer = setTimeout(() => setPhase('leaving'), 3000)
      hideTimer = setTimeout(() => setPhase('hidden'), 3700)
    }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      clearTimeout(leaveTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (phase === 'hidden') return null

  const isOffline = phase === 'offline'
  const leaving = phase === 'leaving'

  return (
    <div
      className={leaving ? 'net-leave-inline' : 'net-enter-inline'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px 3px 8px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        background: isOffline ? '#FFFBEB' : '#F0FDF4',
        border: `1.5px solid ${isOffline ? '#F59E0B' : '#22C55E'}`,
        color: isOffline ? '#92400E' : '#166534',
      }}
    >
      {isOffline ? (
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', flexShrink: 0, display: 'inline-block' }} />
      ) : (
        <Wifi size={12} color="#22C55E" strokeWidth={2.5} />
      )}
      {isOffline ? "You're offline" : 'Back online'}
    </div>
  )
}
