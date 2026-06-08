import { useState, useEffect } from 'react'
import { KeyRound, User, LogIn } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { setCurrentUser } from '../../lib/currentUser'
import { setSetupSecret } from '../../lib/setupSecret'
import { dbWrite } from '../../lib/dbGateway'

interface Props {
  onAuth: () => void
}

const PETAL_COLORS = ['#F4A7B1','#E8829A','#FADADD','#FFB6C1','#FF8FA3','#FFC8D4','#C9848A','#E8B4B8','#FFF0F5','#FFAEC9']
const PETALS = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(Math.random() * 100).toFixed(1)}%`,
  delay: `${(Math.random() * 10).toFixed(2)}s`,
  duration: `${(4 + Math.random() * 4).toFixed(2)}s`,
  width: `${5 + Math.floor(Math.random() * 5)}px`,
  height: `${8 + Math.floor(Math.random() * 7)}px`,
  color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
}))

const LOCK_KEY = 'af-login-locked-until'
const FAILS_KEY = 'af-login-fails'
const MAX_FAILS = 3
const LOCK_DURATION_MS = 15 * 60 * 1000

function readLockUntil(): number | null {
  const until = parseInt(localStorage.getItem(LOCK_KEY) ?? '', 10)
  return until > Date.now() ? until : null
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const mm = Math.floor(totalSeconds / 60)
  const ss = totalSeconds % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  border: '1.5px solid #e5e0db',
  borderRadius: '12px',
  fontSize: '15px',
  color: '#2D2D2D',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  textAlign: 'center',
}

export default function Auth({ onAuth }: Props) {
  const [secret, setSecret] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(readLockUntil)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= lockedUntil) {
        localStorage.removeItem(LOCK_KEY)
        localStorage.removeItem(FAILS_KEY)
        setLockedUntil(null)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  const ready = secret.trim() && name.trim()

  async function handleSubmit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const verifyRes = await fetch('/api/verify-setup-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim() }),
      })
      const verifyData = await verifyRes.json() as { ok?: boolean }
      if (!verifyData.ok) {
        setError('Incorrect code.')
        return
      }
      setSetupSecret(secret.trim())

      const trimmedName = name.trim()
      const { data: existing } = await supabase
        .from('app_users')
        .select('name')
        .ilike('name', trimmedName)
        .maybeSingle()

      let loginName = trimmedName
      if (existing) {
        loginName = existing.name
      } else {
        const { count } = await supabase
          .from('app_users')
          .select('id', { count: 'exact', head: true })

        if ((count ?? 0) >= 3) {
          const fails = parseInt(localStorage.getItem(FAILS_KEY) ?? '0', 10) + 1
          if (fails >= MAX_FAILS) {
            const until = Date.now() + LOCK_DURATION_MS
            localStorage.setItem(LOCK_KEY, String(until))
            localStorage.removeItem(FAILS_KEY)
            setNow(Date.now())
            setLockedUntil(until)
          } else {
            localStorage.setItem(FAILS_KEY, String(fails))
          }
          setError('All 3 accounts are taken — ask one of the others to free a slot in Settings.')
          return
        }

        const { error: insertError } = await dbWrite('app_users', 'insert', { payload: { name: trimmedName } })
        if (insertError) {
          setError('That name was just taken — try a different one.')
          return
        }
      }

      localStorage.removeItem(FAILS_KEY)
      localStorage.removeItem(LOCK_KEY)
      setCurrentUser(loginName)
      localStorage.setItem('af-authed', '1')
      onAuth()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9999 }}>
      {PETALS.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: p.left,
          top: '-15px',
          width: p.width,
          height: p.height,
          borderRadius: '50% 30% 50% 70% / 60% 40% 60% 40%',
          background: p.color,
          animation: `petal-fall ${p.duration} ${p.delay} infinite linear`,
        }} />
      ))}
    </div>
    <div style={{
      minHeight: '100svh',
      background: '#F9F3EE',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      position: 'relative',
      zIndex: 1,
    }}>

      {/* Logo */}
      <div style={{
        width: '80px', height: '80px', borderRadius: '24px',
        background: '#C9848A18', border: '2px solid #C9848A33',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '40px', marginBottom: '20px',
      }}>
        🌸
      </div>

      <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#2D2D2D', marginBottom: '6px' }}>
        Amara Fleur
      </h1>
      <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '40px' }}>
        Flower Shop Manager
      </p>

      <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {lockedUntil ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '10px' }}>
              Too many attempts. Try again in
            </p>
            <p style={{ fontSize: '32px', fontWeight: 800, color: '#C9848A', letterSpacing: '1px', margin: 0 }}>
              {formatCountdown(lockedUntil - now)}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '14px', color: '#6b7280', textAlign: 'center', marginBottom: '4px' }}>
              Enter the shared code and your name to continue.
            </p>

            <div style={{ position: 'relative' }}>
              <KeyRound size={17} color="#9ca3af" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={{ ...input, paddingLeft: '42px', textAlign: 'left' }}
                type="password"
                placeholder="Shared code"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ position: 'relative' }}>
              <User size={17} color="#9ca3af" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={{ ...input, paddingLeft: '42px', textAlign: 'left' }}
                placeholder="Your name (e.g. Maria)"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!ready || busy}
              style={{
                padding: '16px',
                background: ready ? '#C9848A' : '#e5e0db',
                color: ready ? '#fff' : '#9ca3af',
                border: 'none', borderRadius: '14px',
                fontSize: '16px', fontWeight: 700,
                cursor: ready && !busy ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: ready ? '0 4px 20px #C9848A44' : 'none',
              }}
            >
              <LogIn size={20} />
              {busy ? 'Checking…' : 'Continue'}
            </button>

            {/* Error */}
            {error && (
              <p style={{
                fontSize: '13px', color: '#C9848A',
                textAlign: 'center', fontWeight: 500,
              }}>
                {error}
              </p>
            )}
          </>
        )}

      </div>

      <p style={{ fontSize: '11px', color: '#d1ccc8', marginTop: '48px', textAlign: 'center' }}>
        Restricted to 3 known accounts
      </p>
    </div>
    </>
  )
}
