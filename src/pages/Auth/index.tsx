import { useEffect, useState } from 'react'
import { Fingerprint, KeyRound } from 'lucide-react'
import { db } from '../../db/db'
import type { Passkey } from '../../db/db'

interface Props {
  onAuth: () => void
}

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const buf = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
  return buf
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
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [userName, setUserName] = useState('')

  const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential

  function loadPasskeys() {
    db.passkeys.toArray().then(setPasskeys).finally(() => setLoading(false))
  }

  useEffect(() => { loadPasskeys() }, [])

  async function handleSignIn() {
    setBusy(true)
    setError(null)
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: passkeys.map(p => ({
            type: 'public-key' as const,
            id: base64ToBuffer(p.credentialId),
          })),
          userVerification: 'required',
          timeout: 60000,
        },
      })
      localStorage.setItem('af-authed', '1')
      onAuth()
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : ''
      if (name !== 'NotAllowedError') {
        setError('Sign-in failed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister() {
    if (!userName.trim()) return
    setBusy(true)
    setError(null)
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const userId = crypto.getRandomValues(new Uint8Array(16))

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Amar Fleur', id: window.location.hostname },
          user: {
            id: userId,
            name: userName.trim(),
            displayName: userName.trim(),
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null

      if (!credential) throw new Error('No credential returned')

      await db.passkeys.add({
        credentialId: bufferToBase64(credential.rawId),
        userName: userName.trim(),
        registeredAt: new Date().toISOString(),
      })

      localStorage.setItem('af-authed', '1')
      onAuth()
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : ''
      const msg = e instanceof Error ? e.message : ''
      if (name !== 'NotAllowedError') {
        setError(msg || 'Registration failed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const isFirstTime = passkeys.length === 0
  const canAddMore = passkeys.length < 2

  return (
    <div style={{
      minHeight: '100svh',
      background: '#F9F3EE',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
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
        Amar Fleur
      </h1>
      <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '40px' }}>
        Flower Shop Manager
      </p>

      {!supported && (
        <div style={{
          background: '#fee2e2', color: '#991b1b',
          borderRadius: '12px', padding: '16px',
          fontSize: '14px', textAlign: 'center', maxWidth: '320px',
        }}>
          Passkeys are not supported on this browser. Please use Chrome or Safari on a modern device.
        </div>
      )}

      {supported && loading && (
        <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading...</p>
      )}

      {supported && !loading && (
        <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Sign in — shown when passkeys exist and not registering */}
          {!isFirstTime && !showRegister && (
            <button
              onClick={handleSignIn}
              disabled={busy}
              style={{
                padding: '16px',
                background: '#C9848A',
                color: '#fff',
                border: 'none', borderRadius: '14px',
                fontSize: '16px', fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: '0 4px 20px #C9848A44',
              }}
            >
              <Fingerprint size={22} />
              {busy ? 'Verifying…' : 'Sign In with Passkey'}
            </button>
          )}

          {/* Registered users list */}
          {!isFirstTime && !showRegister && (
            <div style={{ textAlign: 'center' }}>
              {passkeys.map(p => (
                <p key={p.id} style={{ fontSize: '13px', color: '#9ca3af' }}>
                  🔑 {p.userName}
                </p>
              ))}
            </div>
          )}

          {/* Register form */}
          {(isFirstTime || showRegister) && (
            <>
              <p style={{ fontSize: '14px', color: '#6b7280', textAlign: 'center', marginBottom: '4px' }}>
                {isFirstTime
                  ? 'Register your device to get started.'
                  : 'Register a second passkey for another user.'}
              </p>
              <input
                style={input}
                placeholder="Your name (e.g. Owner 1)"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                autoFocus
              />
              <button
                onClick={handleRegister}
                disabled={!userName.trim() || busy}
                style={{
                  padding: '16px',
                  background: userName.trim() ? '#C9848A' : '#e5e0db',
                  color: userName.trim() ? '#fff' : '#9ca3af',
                  border: 'none', borderRadius: '14px',
                  fontSize: '16px', fontWeight: 700,
                  cursor: userName.trim() && !busy ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  boxShadow: userName.trim() ? '0 4px 20px #C9848A44' : 'none',
                }}
              >
                <KeyRound size={20} />
                {busy ? 'Registering…' : 'Register Passkey'}
              </button>
              {!isFirstTime && (
                <button
                  onClick={() => { setShowRegister(false); setError(null) }}
                  style={{
                    padding: '13px', background: 'transparent',
                    color: '#9ca3af', border: '1.5px solid #e5e0db',
                    borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
            </>
          )}

          {/* Add another passkey button */}
          {!isFirstTime && !showRegister && canAddMore && (
            <button
              onClick={() => { setShowRegister(true); setUserName(''); setError(null) }}
              style={{
                padding: '12px', background: 'transparent',
                color: '#9ca3af', border: '1.5px solid #e5e0db',
                borderRadius: '12px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', marginTop: '4px',
              }}
            >
              + Register Another Device
            </button>
          )}

          {/* Error */}
          {error && (
            <p style={{
              fontSize: '13px', color: '#C9848A',
              textAlign: 'center', fontWeight: 500,
            }}>
              {error}
            </p>
          )}

        </div>
      )}

      <p style={{ fontSize: '11px', color: '#d1ccc8', marginTop: '48px', textAlign: 'center' }}>
        Protected by device passkey · no password needed
      </p>
    </div>
  )
}
