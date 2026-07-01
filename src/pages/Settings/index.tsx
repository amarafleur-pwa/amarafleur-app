import { useEffect, useRef, useState } from 'react'
import { Users, Trash2, Lock, RefreshCw, Camera, Bell } from 'lucide-react'
import { db } from '../../db/db'
import { NetworkPill } from '../../components/OfflineBanner'
import { useSyncActions } from '../../lib/SyncContext'
import { supabase } from '../../lib/supabase'
import { deleteSheetRow } from '../../lib/sheets'
import { getCurrentUser } from '../../lib/currentUser'
import { clearSetupSecret } from '../../lib/setupSecret'
import { dbWrite, uploadReceipt } from '../../lib/dbGateway'
import { getPermissionStatus, requestPermission, notificationsEnabled, setNotificationsEnabled, sendTestNotification } from '../../lib/notifications'

interface AppUser {
  id: string
  name: string
  claimed_at: string
  photo_url?: string | null
}

function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1200
      let { width, height } = img
      if (width > max || height > max) {
        if (width > height) { height = Math.round(height * max / width); width = max }
        else { width = Math.round(width * max / height); height = max }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.72)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

export default function Settings() {
  const { forceSync, isSyncing, lastSyncedAt } = useSyncActions()
  const [accounts, setAccounts] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<AppUser | null>(null)
  const [releaseConfirmText, setReleaseConfirmText] = useState('')
  const currentUser = getCurrentUser()
  const photoCacheKey = `af-profile-photo-${currentUser}`
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<string | null>(() => localStorage.getItem(photoCacheKey))
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const notifSupported = getPermissionStatus() !== null
  const [notifOn, setNotifOn] = useState(() => notificationsEnabled())
  const [notifMsg, setNotifMsg] = useState<string | null>(null)

  async function handleToggleNotif() {
    if (notifOn) {
      setNotificationsEnabled(false)
      setNotifOn(false)
      setNotifMsg(null)
      return
    }
    const perm = await requestPermission()
    if (perm === 'granted') {
      setNotificationsEnabled(true)
      setNotifOn(true)
      setNotifMsg(null)
    } else {
      setNotifMsg('Blocked in browser settings — enable notifications for this site.')
    }
  }

  async function handleTestNotif() {
    const res = await sendTestNotification()
    if (res === 'ok') setNotifMsg(null)
    else if (res === 'denied') setNotifMsg('Enable notifications first.')
    else setNotifMsg('Not supported on this device.')
  }

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
  }, [currentUser, photoCacheKey])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return
    setUploadingPhoto(true)
    setPhotoError(null)
    try {
      const blob = await compressImage(file)
      const path = `avatars/${slugifyName(currentUser)}.jpg`
      const { publicUrl, error } = await uploadReceipt(path, blob, 'image/jpeg')
      if (!error && publicUrl) {
        const versionedUrl = `${publicUrl}?v=${Date.now()}`
        const { data: rows, error: updateError } = await dbWrite<{ id: string }[]>('app_users', 'update', {
          payload: { photo_url: versionedUrl }, ilike: { name: currentUser }, select: 'id',
        })
        if (!updateError && rows && rows.length > 0) {
          localStorage.setItem(photoCacheKey, versionedUrl)
          setProfilePhoto(versionedUrl)
        } else {
          setPhotoError('Could not save photo — try again.')
        }
      } else {
        console.error('[avatar upload] failed:', error)
        setPhotoError(error?.message || 'Upload failed')
      }
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  async function handleDeleteAll() {
    const [orders, payments, personalExpenses, businessExpenses, customers] = await Promise.all([
      db.orders.toArray(),
      db.payments.toArray(),
      db.personalExpenses.toArray(),
      db.businessExpenses.toArray(),
      db.customers.toArray(),
    ])

    // Fire-and-forget sheet row deletions
    orders.forEach(o => { if (o.supabaseId) deleteSheetRow('Orders', o.supabaseId) })
    payments.forEach(p => { if (p.supabaseId) deleteSheetRow('Payments', p.supabaseId) })
    personalExpenses.forEach(e => { if (e.supabaseId) deleteSheetRow('Personal Expenses', e.supabaseId) })
    businessExpenses.forEach(e => { if (e.supabaseId) deleteSheetRow('Business Expenses', e.supabaseId) })
    customers.forEach(c => { if (c.supabaseId) deleteSheetRow('Customers', c.supabaseId) })

    // Bulk delete from Supabase
    const orderIds = orders.map(o => o.supabaseId).filter(Boolean) as string[]
    const paymentIds = payments.map(p => p.supabaseId).filter(Boolean) as string[]
    const personalIds = personalExpenses.map(e => e.supabaseId).filter(Boolean) as string[]
    const businessIds = businessExpenses.map(e => e.supabaseId).filter(Boolean) as string[]
    const customerIds = customers.map(c => c.supabaseId).filter(Boolean) as string[]

    // payments MUST go before orders (FK: payments.order_id → orders.id)
    if (paymentIds.length) await dbWrite('payments', 'delete', { inFilter: { column: 'id', values: paymentIds } })
    if (orderIds.length) await dbWrite('orders', 'delete', { inFilter: { column: 'id', values: orderIds } })
    await Promise.all([
      personalIds.length ? dbWrite('personal_expenses', 'delete', { inFilter: { column: 'id', values: personalIds } }) : Promise.resolve(),
      businessIds.length ? dbWrite('business_expenses', 'delete', { inFilter: { column: 'id', values: businessIds } }) : Promise.resolve(),
      customerIds.length ? dbWrite('customers', 'delete', { inFilter: { column: 'id', values: customerIds } }) : Promise.resolve(),
    ])

    // Clear IndexedDB
    await Promise.all([
      db.orders.clear(),
      db.payments.clear(),
      db.personalExpenses.clear(),
      db.businessExpenses.clear(),
      db.customers.clear(),
      db.inventory.clear(),
    ])

    setShowDeleteAll(false)
    setDeleteConfirmText('')
  }

  async function handleRemovePhoto() {
    if (!currentUser) return
    setPhotoError(null)
    const { data: rows, error: updateError } = await dbWrite<{ id: string }[]>('app_users', 'update', {
      payload: { photo_url: null }, ilike: { name: currentUser }, select: 'id',
    })
    if (!updateError && rows && rows.length > 0) {
      localStorage.removeItem(photoCacheKey)
      setProfilePhoto(null)
      if (photoInputRef.current) photoInputRef.current.value = ''
    } else {
      setPhotoError('Could not remove photo — try again.')
    }
  }

  function load() {
    supabase
      .from('app_users')
      .select('id, name, claimed_at')
      .order('claimed_at', { ascending: true })
      .then(({ data }) => {
        setAccounts(data ?? [])
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  async function handleRelease() {
    if (!releaseTarget) return
    setActionError(null)
    const { error } = await dbWrite('app_users', 'delete', { eq: { id: releaseTarget.id } })
    if (error) {
      setActionError('Could not free that slot. Try again.')
      return
    }
    setReleaseTarget(null)
    setReleaseConfirmText('')
    load()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: '480px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#2D2D2D', margin: 0 }}>Settings</h1>
          <NetworkPill />
        </div>
        <button
          onClick={() => { localStorage.removeItem('af-authed'); clearSetupSecret(); window.location.reload() }}
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

      {/* Profile Photo section */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e5e0db',
        marginBottom: '20px', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f0ed' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Profile
          </p>
        </div>
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              border: '2.5px solid #C9848A',
              boxShadow: '0 4px 14px rgba(201,132,138,0.22)',
              overflow: 'hidden', background: '#F9E8EA',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {profilePhoto
                ? <img src={profilePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '22px', fontWeight: 700, color: '#C9848A', letterSpacing: '1px' }}>AF</span>
              }
            </div>
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: '#C9848A', border: '2px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: uploadingPhoto ? 'default' : 'pointer', boxShadow: '0 2px 6px rgba(201,132,138,0.4)',
                opacity: uploadingPhoto ? 0.6 : 1,
              }}
            >
              <Camera size={13} color="#fff" />
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{
                padding: '9px 18px', borderRadius: '10px',
                background: '#C9848A', color: '#fff',
                border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: uploadingPhoto ? 'default' : 'pointer', boxShadow: '0 2px 8px rgba(201,132,138,0.35)',
                opacity: uploadingPhoto ? 0.6 : 1,
              }}
            >
              {uploadingPhoto ? 'Uploading…' : 'Change Photo'}
            </button>
            {profilePhoto && !uploadingPhoto && (
              <button
                onClick={handleRemovePhoto}
                style={{
                  padding: '9px 18px', borderRadius: '10px',
                  background: 'none', color: '#9ca3af',
                  border: '1.5px solid #e5e0db', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
          {photoError && (
            <p style={{ fontSize: '12px', color: '#C9848A', fontWeight: 500, margin: 0, textAlign: 'center' }}>{photoError}</p>
          )}
        </div>
      </div>

      {/* Accounts section */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e5e0db',
        marginBottom: '20px', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f0ed' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Accounts
          </p>
        </div>

        {loading ? (
          <p style={{ padding: '20px', fontSize: '14px', color: '#9ca3af' }}>Loading…</p>
        ) : (
          <>
            {accounts.map((a, i) => {
              const isYou = a.name.toLowerCase() === currentUser.toLowerCase()
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: i < accounts.length - 1 ? '1px solid #f3f0ed' : 'none',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: '#C9848A12', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginRight: '12px', flexShrink: 0,
                  }}>
                    <Users size={17} color="#C9848A" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#2D2D2D', margin: 0 }}>
                      {a.name}{isYou ? ' (You)' : ''}
                    </p>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                      Joined {formatDate(a.claimed_at)}
                    </p>
                  </div>
                  {!isYou && (
                    <button
                      onClick={() => setReleaseTarget(a)}
                      style={{
                        background: 'none',
                        border: '1.5px solid #e5e0db',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        color: '#9ca3af',
                        fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '5px',
                      }}
                    >
                      <Trash2 size={13} />
                      Release
                    </button>
                  )}
                </div>
              )
            })}

            {accounts.length < 3 && (
              <p style={{
                padding: '14px 20px', fontSize: '13px', color: '#9ca3af', margin: 0,
                borderTop: accounts.length > 0 ? '1px solid #f3f0ed' : 'none',
              }}>
                {3 - accounts.length} slot{accounts.length === 2 ? '' : 's'} open — sign in with a new name on the login screen to claim {accounts.length === 2 ? 'it' : 'one'}.
              </p>
            )}

            {actionError && (
              <p style={{ padding: '0 20px 16px', fontSize: '13px', color: '#C9848A', fontWeight: 500, margin: 0 }}>{actionError}</p>
            )}
          </>
        )}
      </div>

      {/* Data section */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e5e0db',
        marginBottom: '20px', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f0ed' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Data
          </p>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#2D2D2D', margin: 0 }}>Sync Now</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
              {lastSyncedAt
                ? `Last synced at ${lastSyncedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
                : '—'}
            </p>
          </div>
          <button
            onClick={forceSync}
            disabled={isSyncing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px',
              background: isSyncing ? '#f3f0ed' : '#C9848A',
              color: isSyncing ? '#9ca3af' : '#fff',
              border: 'none', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600,
              cursor: isSyncing ? 'default' : 'pointer',
              boxShadow: isSyncing ? 'none' : '0 3px 10px #C9848A44',
            }}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Notifications section */}
      <div style={{
        background: '#fff', borderRadius: '16px',
        border: '1px solid #e5e0db',
        marginBottom: '20px', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f0ed' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Notifications
          </p>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#C9848A12', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bell size={17} color="#C9848A" />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#2D2D2D', margin: 0 }}>Enable Notifications</p>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                Order &amp; payment reminders
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleNotif}
            disabled={!notifSupported}
            aria-pressed={notifOn}
            style={{
              width: '48px', height: '28px', borderRadius: '999px',
              border: 'none', position: 'relative', flexShrink: 0,
              background: notifOn ? '#C9848A' : '#e5e0db',
              cursor: notifSupported ? 'pointer' : 'not-allowed',
              opacity: notifSupported ? 1 : 0.5,
              boxShadow: notifOn ? '0 2px 8px #C9848A44' : 'none',
              transition: 'background 0.15s',
            }}
          >
            <span style={{
              position: 'absolute', top: '3px', left: notifOn ? '23px' : '3px',
              width: '22px', height: '22px', borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              transition: 'left 0.15s',
            }} />
          </button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f0ed' }}>
          <span style={{ fontSize: '14px', color: '#2D2D2D' }}>Test Notification</span>
          <button
            onClick={handleTestNotif}
            disabled={!notifSupported}
            style={{
              padding: '8px 16px', borderRadius: '10px',
              background: '#C9848A', color: '#fff',
              border: 'none', fontSize: '13px', fontWeight: 600,
              cursor: notifSupported ? 'pointer' : 'not-allowed',
              opacity: notifSupported ? 1 : 0.5,
              boxShadow: '0 3px 10px #C9848A44',
            }}
          >
            Send Test
          </button>
        </div>

        {(notifMsg || !notifSupported) && (
          <p style={{ padding: '0 20px 14px', fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            {notifSupported ? notifMsg : 'Notifications are not supported on this device.'}
          </p>
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
        <div
          onClick={() => setShowDeleteAll(true)}
          style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f0ed', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '14px', color: '#E05C5C' }}>Delete All Entries</span>
          <Trash2 size={15} color="#E05C5C" />
        </div>
      </div>

      {showDeleteAll && (
      <div
        onClick={() => { setShowDeleteAll(false); setDeleteConfirmText('') }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
        >
          <p style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', marginBottom: '6px' }}>Delete all entries?</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '14px' }}>
            All orders, payments, expenses, customers, and inventory will be permanently deleted. This cannot be undone.
          </p>
          <input
            type="text"
            placeholder='Type "delete" to confirm'
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e5e0db', borderRadius: '10px', fontSize: '14px', color: '#2D2D2D', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setShowDeleteAll(false); setDeleteConfirmText('') }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid #e5e0db', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deleteConfirmText !== 'delete'}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: deleteConfirmText === 'delete' ? 'pointer' : 'not-allowed', background: deleteConfirmText === 'delete' ? '#E05C5C' : '#f3f0ed', color: deleteConfirmText === 'delete' ? '#fff' : '#9ca3af', boxShadow: deleteConfirmText === 'delete' ? '0 3px 10px #E05C5C44' : 'none', transition: 'all 0.15s' }}
            >
              Delete All
            </button>
          </div>
        </div>
      </div>
      )}

      {releaseTarget && (
      <div
        onClick={() => { setReleaseTarget(null); setReleaseConfirmText('') }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
        >
          <p style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D', marginBottom: '6px' }}>Release {releaseTarget.name}'s slot?</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '14px' }}>
            This permanently removes the account and frees the slot for someone else to claim. This cannot be undone.
          </p>
          <input
            type="text"
            placeholder='Type "release" to confirm'
            value={releaseConfirmText}
            onChange={e => setReleaseConfirmText(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e5e0db', borderRadius: '10px', fontSize: '14px', color: '#2D2D2D', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setReleaseTarget(null); setReleaseConfirmText('') }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid #e5e0db', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handleRelease}
              disabled={releaseConfirmText !== 'release'}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: releaseConfirmText === 'release' ? 'pointer' : 'not-allowed', background: releaseConfirmText === 'release' ? '#E05C5C' : '#f3f0ed', color: releaseConfirmText === 'release' ? '#fff' : '#9ca3af', boxShadow: releaseConfirmText === 'release' ? '0 3px 10px #E05C5C44' : 'none', transition: 'all 0.15s' }}
            >
              Release
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
