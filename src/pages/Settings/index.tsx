import { useEffect, useState } from 'react'
import { KeyRound, Trash2, Lock, Plus } from 'lucide-react'
import { db } from '../../db/db'
import type { Passkey } from '../../db/db'

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
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
}

export default function Settings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [userName, setUserName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  function load() {
    db.passkeys.toArray().then(setPasskeys).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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
          rp: { name: 'Amara Fleur', id: window.location.hostname },
          user: { id: userId, name: userName.trim(), displayName: userName.trim() },
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
      setAdding(false)
      setUserName('')
      load()
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : ''
      const msg = e instanceof Error ? e.message : ''
      if (name !== 'NotAllowedError') setError(msg || 'Registration failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: number) {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    await db.passkeys.delete(id)
    setConfirmDelete(null)
    load()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#2D2D2D', margin: 0 }}>Settings</h1>
        <button
          onClick={() => { localStorage.removeItem('af-authed'); window.location.reload() }}
          title="Lock app"
          style={{
            background: 'none', border: '1.5px solid #e5e0db',
            borderRadius: '10px', padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: '6px',
            color: '#9ca3af', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Lock size={15} />
          Lock
        </button>
      </div>

      {/* Security section */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e5e0db',
        marginBottom: '20px', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f0ed' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Security
          </p>
        </div>

        {loading ? (
          <p style={{ padding: '20px', fontSize: '14px', color: '#9ca3af' }}>Loading…</p>
        ) : (
          <>
            {passkeys.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '14px 20px',
                borderBottom: i < passkeys.length - 1 || adding ? '1px solid #f3f0ed' : 'none',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: '#C9848A12', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: '12px', flexShrink: 0,
                }}>
                  <KeyRound size={17} color="#C9848A" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#2D2D2D', margin: 0 }}>{p.userName}</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                    Registered {formatDate(p.registeredAt)}
                  </p>
                </div>
                {passkeys.length > 1 && (
                  <button
                    onClick={() => handleDelete(p.id!)}
                    style={{
                      background: confirmDelete === p.id ? '#fee2e2' : 'none',
                      border: '1.5px solid',
                      borderColor: confirmDelete === p.id ? '#fca5a5' : '#e5e0db',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      color: confirmDelete === p.id ? '#dc2626' : '#9ca3af',
                      fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    <Trash2 size={13} />
                    {confirmDelete === p.id ? 'Confirm' : 'Remove'}
                  </button>
                )}
              </div>
            ))}

            {/* Add passkey form */}
            {adding && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f0ed', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  style={input}
                  placeholder="Device name (e.g. Owner 2)"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setAdding(false); setUserName(''); setError(null) }}
                    style={{
                      flex: 1, padding: '12px', background: 'transparent',
                      color: '#9ca3af', border: '1.5px solid #e5e0db',
                      borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={!userName.trim() || busy}
                    style={{
                      flex: 2, padding: '12px',
                      background: userName.trim() ? '#C9848A' : '#e5e0db',
                      color: userName.trim() ? '#fff' : '#9ca3af',
                      border: 'none', borderRadius: '10px',
                      fontSize: '14px', fontWeight: 700,
                      cursor: userName.trim() && !busy ? 'pointer' : 'default',
                      boxShadow: userName.trim() ? '0 3px 12px #C9848A44' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                  >
                    <KeyRound size={16} />
                    {busy ? 'Registering…' : 'Register Passkey'}
                  </button>
                </div>
                {error && (
                  <p style={{ fontSize: '13px', color: '#C9848A', fontWeight: 500, margin: 0 }}>{error}</p>
                )}
              </div>
            )}

            {/* Add device button */}
            {!adding && passkeys.length < 2 && (
              <button
                onClick={() => { setAdding(true); setConfirmDelete(null) }}
                style={{
                  width: '100%', padding: '14px 20px',
                  background: 'none', border: 'none',
                  borderTop: passkeys.length > 0 ? '1px solid #f3f0ed' : 'none',
                  color: '#C9848A', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <Plus size={16} />
                Add Another Device
              </button>
            )}
          </>
        )}
      </div>

      {/* App info section */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e5e0db', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f0ed' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            App
          </p>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: '#2D2D2D' }}>Amara Fleur</span>
          <span style={{ fontSize: '13px', color: '#9ca3af' }}>Flower Shop Manager</span>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f0ed' }}>
          <span style={{ fontSize: '14px', color: '#2D2D2D' }}>Storage</span>
          <span style={{ fontSize: '13px', color: '#9ca3af' }}>Local + Supabase sync</span>
        </div>
      </div>

    </div>
  )
}
