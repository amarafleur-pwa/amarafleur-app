import { useEffect, useState } from 'react'
import { Plus, X, Package } from 'lucide-react'
import { db } from '../../db/db'
import type { InventoryItem } from '../../db/db'

const CATEGORIES = ['Flowers', 'Greenery', 'Supplies', 'Packaging', 'Other']
const UNITS = ['stems', 'bunches', 'pcs', 'meters', 'rolls', 'bags']

const input: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '1.5px solid #e5e0db',
  borderRadius: '10px',
  fontSize: '15px',
  color: '#2D2D2D',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: '6px',
  display: 'block',
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>()
  const [iName, setIName] = useState('')
  const [iCategory, setICategory] = useState('Flowers')
  const [iQty, setIQty] = useState('0')
  const [iUnit, setIUnit] = useState('stems')
  const [iMinStock, setIMinStock] = useState('')
  const [iNotes, setINotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [closingForm, setClosingForm] = useState(false)
  const handleCloseForm = () => setClosingForm(true)

  function load() {
    db.inventory.orderBy('name').toArray().then(setItems).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function openForm(item?: InventoryItem) {
    setEditingItem(item)
    setIName(item?.name ?? '')
    setICategory(item?.category ?? 'Flowers')
    setIQty(String(item?.quantity ?? 0))
    setIUnit(item?.unit ?? 'stems')
    setIMinStock(item?.minStock !== undefined ? String(item.minStock) : '')
    setINotes(item?.notes ?? '')
    setConfirmDelete(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!iName.trim() || !iUnit.trim()) return
    setSaving(true)
    try {
      const data: Omit<InventoryItem, 'id'> = {
        name: iName.trim(),
        category: iCategory,
        quantity: Math.max(0, parseInt(iQty) || 0),
        unit: iUnit.trim(),
        minStock: iMinStock !== '' ? parseInt(iMinStock) : undefined,
        notes: iNotes.trim() || undefined,
        updatedAt: new Date().toISOString(),
      }
      if (editingItem?.id) {
        await db.inventory.update(editingItem.id, data)
      } else {
        await db.inventory.add(data)
      }
      handleCloseForm()
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingItem?.id) return
    if (confirmDelete !== editingItem.id) {
      setConfirmDelete(editingItem.id)
      return
    }
    await db.inventory.delete(editingItem.id)
    handleCloseForm()
    load()
  }

  async function adjustQty(id: number, delta: number) {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newQty = Math.max(0, item.quantity + delta)
    await db.inventory.update(id, { quantity: newQty, updatedAt: new Date().toISOString() })
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i))
  }

  const lowStockItems = items.filter(i => i.minStock !== undefined && i.quantity <= i.minStock)
  const filtered = categoryFilter === 'All' ? items : items.filter(i => i.category === categoryFilter)
  const canSave = iName.trim() && iUnit.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: '24px' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2D2D', margin: 0 }}>Inventory</h1>
          <button
            onClick={() => openForm()}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: '#C9848A', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px #C9848A55',
            }}
          >
            <Plus size={20} color="#fff" strokeWidth={2.5} />
          </button>
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['All', ...CATEGORIES].map(cat => {
            const active = categoryFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '6px 14px', borderRadius: '16px', border: 'none', whiteSpace: 'nowrap',
                  fontSize: '12px', fontWeight: active ? 700 : 500, cursor: 'pointer',
                  background: active ? '#C9848A' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px #C9848A33' : 'none',
                  flexShrink: 0,
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>Loading...</p>}

      {!loading && (
        <div style={{ padding: '12px 16px 0' }}>

          {/* Low stock alert */}
          {lowStockItems.length > 0 && (
            <div style={{
              background: '#E8A83812', border: '1.5px solid #E8A83840',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '12px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <Package size={16} color="#E8A838" />
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D', margin: 0 }}>
                {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} running low:{' '}
                <span style={{ color: '#9ca3af', fontWeight: 400 }}>
                  {lowStockItems.slice(0, 3).map(i => i.name).join(', ')}{lowStockItems.length > 3 ? '…' : ''}
                </span>
              </p>
            </div>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: '15px', color: '#9ca3af' }}>
                {items.length === 0 ? 'No items yet. Tap + to add stock.' : 'No items in this category.'}
              </p>
            </div>
          )}

          {/* Item list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(item => {
              const isLow = item.minStock !== undefined && item.quantity <= item.minStock
              return (
                <div
                  key={item.id}
                  style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openForm(item)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p style={{ fontWeight: 700, fontSize: '15px', color: '#2D2D2D', margin: 0 }}>{item.name}</p>
                        {isLow && (
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#E8A838', background: '#E8A83812', borderRadius: '4px', padding: '2px 6px' }}>
                            Low
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                        {item.category} · {item.unit}
                        {item.minStock !== undefined ? ` · min ${item.minStock}` : ''}
                      </p>
                    </div>

                    {/* Quantity stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px', flexShrink: 0 }}>
                      <button
                        onClick={() => adjustQty(item.id!, -1)}
                        disabled={item.quantity === 0}
                        style={{
                          width: '32px', height: '32px', borderRadius: '8px 0 0 8px',
                          border: '1.5px solid #e5e0db', borderRight: 'none',
                          background: item.quantity === 0 ? '#f9f9f9' : '#fff',
                          color: item.quantity === 0 ? '#d1ccc8' : '#6b7280',
                          fontSize: '18px', fontWeight: 700,
                          cursor: item.quantity === 0 ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >−</button>
                      <div style={{
                        minWidth: '40px', height: '32px',
                        border: '1.5px solid #e5e0db',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 700,
                        color: isLow ? '#E8A838' : '#2D2D2D',
                      }}>
                        {item.quantity}
                      </div>
                      <button
                        onClick={() => adjustQty(item.id!, 1)}
                        style={{
                          width: '32px', height: '32px', borderRadius: '0 8px 8px 0',
                          border: '1.5px solid #C9848A', borderLeft: 'none',
                          background: '#C9848A', color: '#fff',
                          fontSize: '18px', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >+</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* Add / Edit form */}
      {showForm && (
        <div
          onClick={handleCloseForm}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={closingForm ? 'sheet-exit' : 'sheet-enter'}
            onAnimationEnd={(e) => { if (closingForm && e.animationName === 'sheet-down') { setShowForm(false); setConfirmDelete(null); setClosingForm(false) } }}
            style={{ width: '100%', background: '#F9F3EE', borderRadius: '20px 20px 0 0', maxHeight: '90svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1ccc8' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#2D2D2D' }}>
                {editingItem ? 'Edit Item' : 'New Item'}
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editingItem && (
                  <button
                    onClick={handleDelete}
                    style={{
                      background: confirmDelete === editingItem.id ? '#fee2e2' : '#e5e0db',
                      border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 700,
                      color: confirmDelete === editingItem.id ? '#ef4444' : '#6b7280',
                    }}
                  >
                    {confirmDelete === editingItem.id ? 'Confirm delete' : 'Delete'}
                  </button>
                )}
                <button
                  onClick={handleCloseForm}
                  style={{ background: '#e5e0db', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={17} color="#6b7280" />
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '8px 20px 0', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <span style={lbl}>Name *</span>
                  <input style={input} placeholder="e.g. Red Roses" value={iName} onChange={e => setIName(e.target.value)} />
                </div>
                <div>
                  <span style={lbl}>Category</span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setICategory(cat)}
                        style={{
                          padding: '7px 14px', borderRadius: '16px', border: 'none',
                          fontSize: '13px', fontWeight: iCategory === cat ? 700 : 500, cursor: 'pointer',
                          background: iCategory === cat ? '#C9848A' : '#fff',
                          color: iCategory === cat ? '#fff' : '#6b7280',
                          boxShadow: iCategory === cat ? '0 2px 8px #C9848A33' : '0 1px 4px rgba(0,0,0,0.06)',
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <span style={lbl}>Quantity *</span>
                    <input
                      style={input} type="number" inputMode="numeric" min="0"
                      placeholder="0" value={iQty}
                      onChange={e => setIQty(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={lbl}>Unit *</span>
                    <input
                      style={input} placeholder="stems" value={iUnit}
                      onChange={e => setIUnit(e.target.value)}
                      list="unit-suggestions"
                    />
                    <datalist id="unit-suggestions">
                      {UNITS.map(u => <option key={u} value={u} />)}
                    </datalist>
                  </div>
                </div>
                <div>
                  <span style={lbl}>Low Stock Alert <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></span>
                  <input
                    style={input} type="number" inputMode="numeric" min="0"
                    placeholder="Alert when quantity falls to this number"
                    value={iMinStock}
                    onChange={e => setIMinStock(e.target.value)}
                  />
                </div>
                <div>
                  <span style={lbl}>Notes</span>
                  <textarea
                    style={{ ...input, minHeight: '64px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Supplier, notes, etc."
                    value={iNotes}
                    onChange={e => setINotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                style={{
                  width: '100%', padding: '15px',
                  background: canSave ? '#C9848A' : '#e5e0db',
                  color: canSave ? '#fff' : '#9ca3af',
                  border: 'none', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 700,
                  cursor: canSave ? 'pointer' : 'default',
                  boxShadow: canSave ? '0 4px 14px #C9848A44' : 'none',
                }}
              >
                {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
