import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIos, setShowIos] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('install-dismissed')) return
    // Already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((navigator as { standalone?: boolean }).standalone) return

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIos) {
      setShowIos(true)
      setVisible(true)
      return
    }

    function handler(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!visible) return null

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setPrompt(null)
  }

  function handleDismiss() {
    localStorage.setItem('install-dismissed', '1')
    setVisible(false)
  }

  return (
    <div style={{
      background: '#2D2D2D',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <div style={{
        background: '#C9848A28',
        borderRadius: '10px',
        padding: '8px',
        flexShrink: 0,
        display: 'flex',
      }}>
        <Download size={17} color="#C9848A" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Install Amar Fleur</p>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>
          {showIos ? 'Tap Share ↑ → Add to Home Screen' : 'Add to home screen for quick access'}
        </p>
      </div>
      {!showIos && (
        <button
          onClick={handleInstall}
          style={{
            background: '#C9848A', color: '#fff',
            border: 'none', borderRadius: '8px',
            padding: '8px 14px', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', flexShrink: 0,
            boxShadow: '0 2px 8px #C9848A44',
          }}
        >
          Install
        </button>
      )}
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px',
          flexShrink: 0, display: 'flex',
        }}
      >
        <X size={16} color="#6b7280" />
      </button>
    </div>
  )
}
