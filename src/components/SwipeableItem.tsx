import { useEffect, useRef, useState } from 'react'

interface Props {
  id: number
  activeId: number | null
  onActivate: (id: number | null) => void
  onPaid?: () => void
  paidLabel?: string
  onPreview?: () => void
  onEdit: () => void
  onDelete: () => void
  children: React.ReactNode
}

const SNAP_THRESHOLD = 60
const REVEAL_WIDTH_3 = 168  // Paid + Edit + Delete
const REVEAL_WIDTH_2 = 112  // Edit + Delete only

export default function SwipeableItem({ id, activeId, onActivate, onPaid, paidLabel, onPreview, onEdit, onDelete, children }: Props) {
  const revealW = onPaid ? REVEAL_WIDTH_3 : REVEAL_WIDTH_2
  const [offset, setOffset] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isSnapped, setIsSnapped] = useState(false)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const dragging = useRef(false)
  const direction = useRef<'open' | 'close'>('close')

  useEffect(() => {
    if (activeId !== id && isOpen) close()
  }, [activeId, id])

  function onTouchStart(e: React.TouchEvent) {
    onActivate(id)
    startX.current = e.touches[0].clientX
    startOffset.current = isOpen ? -revealW : 0
    dragging.current = true
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return
    const dx = e.touches[0].clientX - startX.current
    const next = Math.max(-revealW, Math.min(0, startOffset.current + dx))
    setOffset(next)
  }

  function onTouchEnd() {
    dragging.current = false
    const open = offset < -SNAP_THRESHOLD
    direction.current = open ? 'open' : 'close'
    setOffset(open ? -revealW : 0)
    setIsOpen(open)
    if (!open) onActivate(null)
  }

  function close() {
    direction.current = 'close'
    setOffset(0)
    setIsOpen(false)
    setIsSnapped(false)
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation()
    close()
    onEdit()
  }

  function handlePaid(e: React.MouseEvent) {
    e.stopPropagation()
    close()
    onPaid?.()
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    close()
    onDelete()
  }

  function handleCardClick() {
    if (isOpen) { close(); return }
    if (onPreview) { onPreview() } else { onEdit() }
  }

  const ease = direction.current === 'open'
    ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'cubic-bezier(0.25, 0, 0.25, 1)'

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px' }}>
      {/* Action buttons behind */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        display: 'flex', alignItems: 'stretch',
        width: revealW,
      }}>
        {onPaid && (
          <button
            onClick={handlePaid}
            style={{
              flex: 1, border: 'none', cursor: 'pointer',
              background: '#7A9E7E', color: '#fff',
              fontSize: '11px', fontWeight: 700,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '3px',
            }}
          >
            <span style={{ fontSize: '16px' }}>✓</span>
            {paidLabel ?? 'Paid'}
          </button>
        )}
        <button
          onClick={handleEdit}
          style={{
            flex: 1, border: 'none', cursor: 'pointer',
            background: '#E8A838', color: '#fff',
            fontSize: '11px', fontWeight: 700,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '3px',
          }}
        >
          <span style={{ fontSize: '16px' }}>✎</span>
          Edit
        </button>
        <button
          onClick={handleDelete}
          style={{
            flex: 1, border: 'none', cursor: 'pointer',
            background: '#C9848A', color: '#fff',
            fontSize: '11px', fontWeight: 700,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '3px',
            borderRadius: '0 12px 12px 0',
          }}
        >
          <span style={{ fontSize: '16px' }}>✕</span>
          Delete
        </button>
      </div>

      {/* Card */}
      <div
        onClick={handleCardClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTransitionEnd={() => { if (isOpen) setIsSnapped(true) }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current ? 'none' : `transform 0.28s ${ease}`,
          position: 'relative',
          cursor: 'pointer',
          overflow: 'hidden',
          borderRadius: isSnapped ? '12px 0 0 12px' : '12px',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
