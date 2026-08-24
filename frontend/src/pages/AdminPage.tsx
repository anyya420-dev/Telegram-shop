import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { AdminCategory, AdminCity, AdminProduct, AdminSettingsResponse, AdminStats } from '../types'
import styles from './AdminPage.module.css'

type StatusTone = 'success' | 'error' | 'info'
type AdminRestoreState = {
  authenticated: boolean
  settings: AdminSettingsResponse | null
  stats: AdminStats | null
}

let adminRestoreInFlight: Promise<AdminRestoreState> | null = null
let cachedAdminToken: string | null = null

function readStoredAdminToken() {
  return cachedAdminToken
}

function storeAdminToken(token: string | null) {
  cachedAdminToken = token?.trim() || null
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 4v5c0 5-3.5 8.8-8 10-4.5-1.2-8-5-8-10V7l8-4z" />
    </svg>
  )
}

function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V4" />
      <circle cx="9" cy="13" r="1" />
      <circle cx="15" cy="13" r="1" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

// ── City Management ──────────────────────────────────────────────────────────

function CitiesSection({ setStatus, loading, setLoading }: {
  setStatus: (s: { tone: StatusTone; message: string } | null) => void
  loading: boolean
  setLoading: (v: boolean) => void
}) {
  const [cities, setCities] = useState<AdminCity[]>([])
  const [newName, setNewName] = useState('')
  const [newNameEn, setNewNameEn] = useState('')
  const [newIsActive, setNewIsActive] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameEn, setEditNameEn] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)

  useEffect(() => {
    void api.getAdminCities().then((r) => setCities(r.cities)).catch(() => null)
  }, [])

  async function refresh() {
    const r = await api.getAdminCities()
    setCities(r.cities)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      await api.createAdminCity({ name: newName.trim(), nameEn: newNameEn.trim() || undefined, isActive: newIsActive })
      setNewName('')
      setNewNameEn('')
      setNewIsActive(true)
      await refresh()
      setStatus({ tone: 'success', message: 'City created.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to create city' })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(city: AdminCity) {
    setLoading(true)
    setStatus(null)
    try {
      await api.updateAdminCity(city.id, { isActive: !city.isActive })
      await refresh()
      setStatus({ tone: 'success', message: city.isActive ? 'City deactivated.' : 'City activated.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update city' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setLoading(true)
    setStatus(null)
    try {
      const data: { name?: string; nameEn?: string; isActive?: boolean } = {}
      if (editName.trim()) data.name = editName.trim()
      data.nameEn = editNameEn.trim() || ''
      data.isActive = editIsActive
      await api.updateAdminCity(editingId, data)
      setEditingId(null)
      await refresh()
      setStatus({ tone: 'success', message: 'City updated.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update city' })
    } finally {
      setLoading(false)
    }
  }

  function handleStartEdit(city: AdminCity) {
    setEditingId(city.id)
    setEditName(city.name)
    setEditNameEn(city.nameEn ?? '')
    setEditIsActive(city.isActive ?? true)
  }

  async function handleDelete(city: AdminCity) {
    if (!confirm(`Delete city "${city.name}"?`)) return
    setLoading(true)
    setStatus(null)
    try {
      const r = await api.deleteAdminCity(city.id)
      await refresh()
      setStatus({ tone: 'success', message: r.deactivated ? `City deactivated (has orders).` : 'City deleted.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to delete city' })
    } finally {
      setLoading(false)
    }
  }


  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}><MapPinIcon /> Cities / Города</h2>
      <ul className={styles.adminList}>
        {cities.length === 0 && <li className={styles.help}>No cities yet.</li>}
        {cities.map((city) => (
          <li key={city.id} className={styles.adminItem}>
            {editingId === city.id ? (
              <div className={styles.editRow} style={{ flex: 1 }}>
                <div className={styles.formRow}>
                  <input className={styles.input} placeholder="Name (RU)" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={styles.input} placeholder="Name (EN)" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} />
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} />
                    <span>Active</span>
                  </label>
                </div>
                <div className={styles.actions}>
                  <button className={styles.primaryButton} onClick={() => void handleSaveEdit()} disabled={loading}>Save</button>
                  <button className={styles.ghostButton} onClick={() => setEditingId(null)} disabled={loading}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span>
                  {city.name}{city.nameEn ? ` / ${city.nameEn}` : ''}
                  {' '}<span className={city.isActive ? styles.badge : styles.badgeOff}>{city.isActive ? 'active' : 'inactive'}</span>
                </span>
                <div className={styles.itemActions}>
                  <button className={styles.ghostButton} onClick={() => handleStartEdit(city)} disabled={loading}>Edit</button>
                  <button className={city.isActive ? styles.warnButton : styles.ghostButton} onClick={() => void handleToggleActive(city)} disabled={loading}>{city.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button className={styles.removeButton} onClick={() => void handleDelete(city)} disabled={loading}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.formRow}>
        <input className={styles.input} placeholder="City name (RU) *" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className={styles.input} placeholder="City name (EN)" value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} />
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={newIsActive} onChange={(e) => setNewIsActive(e.target.checked)} />
          <span>Active</span>
        </label>
        <button className={styles.primaryButton} onClick={() => void handleCreate()} disabled={loading || !newName.trim()}>Add city</button>
      </div>
    </section>
  )
}

// ── Category Management ──────────────────────────────────────────────────────

function CategoriesSection({ setStatus, loading, setLoading }: {
  setStatus: (s: { tone: StatusTone; message: string } | null) => void
  loading: boolean
  setLoading: (v: boolean) => void
}) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [newName, setNewName] = useState('')
  const [newNameEn, setNewNameEn] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameEn, setEditNameEn] = useState('')

  useEffect(() => {
    void api.getAdminCategories().then((r) => setCategories(r.categories)).catch(() => null)
  }, [])

  async function refresh() {
    const r = await api.getAdminCategories()
    setCategories(r.categories)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      await api.createAdminCategory({ name: newName.trim(), nameEn: newNameEn.trim() || undefined })
      setNewName('')
      setNewNameEn('')
      await refresh()
      setStatus({ tone: 'success', message: 'Category created.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to create category' })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(cat: AdminCategory) {
    setLoading(true)
    setStatus(null)
    try {
      await api.updateAdminCategory(cat.id, { isActive: !cat.isActive })
      await refresh()
      setStatus({ tone: 'success', message: cat.isActive ? 'Category deactivated.' : 'Category activated.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update category' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setLoading(true)
    setStatus(null)
    try {
      const data: { name?: string; nameEn?: string } = {}
      if (editName.trim()) data.name = editName.trim()
      data.nameEn = editNameEn.trim() || ''
      await api.updateAdminCategory(editingId, data)
      setEditingId(null)
      await refresh()
      setStatus({ tone: 'success', message: 'Category updated.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update category' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(cat: AdminCategory) {
    if (!confirm(`Delete category "${cat.name}"?`)) return
    setLoading(true)
    setStatus(null)
    try {
      const r = await api.deleteAdminCategory(cat.id)
      await refresh()
      setStatus({ tone: 'success', message: r.deactivated ? `Category deactivated (has products).` : 'Category deleted.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to delete category' })
    } finally {
      setLoading(false)
    }
  }


  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}><TagIcon /> Categories</h2>
      <ul className={styles.adminList}>
        {categories.length === 0 && <li className={styles.help}>No categories yet.</li>}
        {categories.map((cat) => (
          <li key={cat.id} className={styles.adminItem}>
            {editingId === cat.id ? (
              <div className={styles.editRow} style={{ flex: 1 }}>
                <div className={styles.formRow}>
                  <input className={styles.input} placeholder="Name (RU)" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={styles.input} placeholder="Name (EN)" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} />
                </div>
                <div className={styles.actions}>
                  <button className={styles.primaryButton} onClick={() => void handleSaveEdit()} disabled={loading}>Save</button>
                  <button className={styles.ghostButton} onClick={() => setEditingId(null)} disabled={loading}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span>
                  {cat.name}{cat.nameEn ? ` / ${cat.nameEn}` : ''}
                  {' '}<span className={cat.isActive ? styles.badge : styles.badgeOff}>{cat.isActive ? 'active' : 'inactive'}</span>
                </span>
                <div className={styles.itemActions}>
                  <button className={styles.ghostButton} onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditNameEn(cat.nameEn ?? '') }} disabled={loading}>Edit</button>
                  <button className={cat.isActive ? styles.warnButton : styles.ghostButton} onClick={() => void handleToggleActive(cat)} disabled={loading}>{cat.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button className={styles.removeButton} onClick={() => void handleDelete(cat)} disabled={loading}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.formRow}>
        <input className={styles.input} placeholder="Category name (RU) *" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className={styles.input} placeholder="Category name (EN)" value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} />
        <button className={styles.primaryButton} onClick={() => void handleCreate()} disabled={loading || !newName.trim()}>Add category</button>
      </div>
    </section>
  )
}

// ── Product Management ───────────────────────────────────────────────────────

function ProductsSection({ setStatus, loading, setLoading }: {
  setStatus: (s: { tone: StatusTone; message: string } | null) => void
  loading: boolean
  setLoading: (v: boolean) => void
}) {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)

  // new product form
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCatId, setNewCatId] = useState('')
  const [newImage, setNewImage] = useState('')

  // edit fields
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editImage, setEditImage] = useState('')

  useEffect(() => {
    void Promise.all([
      api.getAdminProducts().then((r) => setProducts(r.products)),
      api.getAdminCategories().then((r) => setCategories(r.categories)),
    ]).catch(() => null)
  }, [])

  async function refresh() {
    const [pr, cr] = await Promise.all([api.getAdminProducts(), api.getAdminCategories()])
    setProducts(pr.products)
    setCategories(cr.categories)
  }

  async function handleCreate() {
    const price = parseFloat(newPrice)
    const categoryId = parseInt(newCatId, 10)
    if (!newName.trim() || !newDesc.trim() || isNaN(price) || price <= 0 || isNaN(categoryId)) return
    setLoading(true)
    setStatus(null)
    try {
      await api.createAdminProduct({ name: newName.trim(), description: newDesc.trim(), price, categoryId, image: newImage.trim() || undefined })
      setNewName(''); setNewDesc(''); setNewPrice(''); setNewCatId(''); setNewImage('')
      await refresh()
      setStatus({ tone: 'success', message: 'Product created.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to create product' })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(p: AdminProduct) {
    setLoading(true)
    setStatus(null)
    try {
      await api.updateAdminProduct(p.id, { isActive: !p.isActive })
      await refresh()
      setStatus({ tone: 'success', message: p.isActive ? 'Product deactivated.' : 'Product activated.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update product' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setLoading(true)
    setStatus(null)
    try {
      const data: Record<string, unknown> = {}
      if (editName.trim()) data.name = editName.trim()
      if (editDesc.trim()) data.description = editDesc.trim()
      const p = parseFloat(editPrice)
      if (!isNaN(p) && p > 0) data.price = p
      if (editImage.trim()) data.image = editImage.trim()
      await api.updateAdminProduct(editingId, data)
      setEditingId(null)
      await refresh()
      setStatus({ tone: 'success', message: 'Product updated.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update product' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(p: AdminProduct) {
    if (!confirm(`Delete product "${p.name}"?`)) return
    setLoading(true)
    setStatus(null)
    try {
      const r = await api.deleteAdminProduct(p.id)
      await refresh()
      setStatus({ tone: 'success', message: r.deactivated ? 'Product deactivated (has orders).' : 'Product deleted.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to delete product' })
    } finally {
      setLoading(false)
    }
  }


  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}><BoxIcon /> Products</h2>
      <ul className={styles.adminList}>
        {products.length === 0 && <li className={styles.help}>No products yet.</li>}
        {products.map((p) => (
          <li key={p.id} className={styles.adminItem}>
            {editingId === p.id ? (
              <div className={styles.editRow} style={{ flex: 1 }}>
                <div className={styles.formRow}>
                  <input className={styles.input} placeholder="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={styles.input} placeholder="Price" type="number" step="0.01" min="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                </div>
                <textarea className={styles.textarea} placeholder="Description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                <input className={styles.input} placeholder="Image URL" value={editImage} onChange={(e) => setEditImage(e.target.value)} />
                <div className={styles.actions}>
                  <button className={styles.primaryButton} onClick={() => void handleSaveEdit()} disabled={loading}>Save</button>
                  <button className={styles.ghostButton} onClick={() => setEditingId(null)} disabled={loading}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span>
                  {p.name} — <strong>{p.price.toFixed(2)}</strong> ({p.category?.name ?? '–'})
                  {' '}<span className={p.isActive ? styles.badge : styles.badgeOff}>{p.isActive ? 'active' : 'inactive'}</span>
                </span>
                <div className={styles.itemActions}>
                  <button className={styles.ghostButton} onClick={() => { setEditingId(p.id); setEditName(p.name); setEditDesc(p.description); setEditPrice(String(p.price)); setEditImage(p.image ?? '') }} disabled={loading}>Edit</button>
                  <button className={p.isActive ? styles.warnButton : styles.ghostButton} onClick={() => void handleToggleActive(p)} disabled={loading}>{p.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button className={styles.removeButton} onClick={() => void handleDelete(p)} disabled={loading}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.formRow}>
        <input className={styles.input} placeholder="Product name *" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className={styles.input} placeholder="Price *" type="number" step="0.01" min="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
      </div>
      <textarea className={styles.textarea} placeholder="Description *" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
      <div className={styles.formRow}>
        <select
          className={styles.input}
          value={newCatId}
          onChange={(e) => setNewCatId(e.target.value)}
        >
          <option value="">Category *</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={styles.input} placeholder="Image URL (optional)" value={newImage} onChange={(e) => setNewImage(e.target.value)} />
      </div>
      <button
        className={styles.primaryButton}
        onClick={() => void handleCreate()}
        disabled={loading || !newName.trim() || !newDesc.trim() || !newPrice || !newCatId}
      >
        Add product
      </button>
    </section>
  )
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { t } = useTranslation()
  const [telegramId, setTelegramId] = useState('')
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [status, setStatus] = useState<{ tone: StatusTone; message: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [addAdminId, setAddAdminId] = useState('')
  const [changeFromId, setChangeFromId] = useState('')
  const [changeToId, setChangeToId] = useState('')
  const [botToken, setBotToken] = useState('')

  const canManage = authenticated && settings

  async function loadProtectedData() {
    const [settingsResponse, statsResponse] = await Promise.all([api.getAdminSettings(), api.getAdminStats()])
    return { settingsResponse, statsResponse }
  }

  useEffect(() => {
    let cancelled = false
    setAuthLoading(true)

    async function restoreAdminSession() {
      let activeRestore = adminRestoreInFlight
      if (!activeRestore) {
        const restorePromise = (async () => {
          const savedToken = readStoredAdminToken()
          if (!savedToken) {
            api.setAdminToken(null)
            return { authenticated: false, settings: null, stats: null } satisfies AdminRestoreState
          }

          api.setAdminToken(savedToken)

          try {
            const { settingsResponse, statsResponse } = await loadProtectedData()
            return {
              authenticated: true,
              settings: settingsResponse,
              stats: statsResponse,
            } satisfies AdminRestoreState
          } catch {
            api.setAdminToken(null)
            storeAdminToken(null)
            return { authenticated: false, settings: null, stats: null } satisfies AdminRestoreState
          }
        })()

        adminRestoreInFlight = restorePromise
        void restorePromise.finally(() => {
          if (adminRestoreInFlight === restorePromise) {
            adminRestoreInFlight = null
          }
        })
        activeRestore = restorePromise
      }

      try {
        const state = await activeRestore
        if (cancelled) return

        setAuthenticated(state.authenticated)
        setSettings(state.settings)
        setStats(state.stats)
      } catch {
        if (cancelled) return
        api.setAdminToken(null)
        storeAdminToken(null)
        setAuthenticated(false)
        setSettings(null)
        setStats(null)
      } finally {
        if (!cancelled) {
          setAuthLoading(false)
        }
      }
    }

    void restoreAdminSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin() {
    if (!telegramId.trim() || !password) return
    setLoading(true)
    setStatus(null)
    try {
      const response = await api.adminLogin({ telegramId: telegramId.trim(), password })
      api.setAdminToken(response.adminToken)
      storeAdminToken(response.adminToken)
      setSettings(response.settings)
      setAuthenticated(true)
      setPassword('')
      const statsResponse = await api.getAdminStats()
      setStats(statsResponse)
      setStatus({ tone: 'success', message: 'Administrator session started.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Login failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    setLoading(true)
    try {
      await api.adminLogout()
    } catch {
      // no-op
    } finally {
      api.setAdminToken(null)
      storeAdminToken(null)
      setAuthenticated(false)
      setSettings(null)
      setLoading(false)
      setStatus({ tone: 'info', message: 'Administrator session closed.' })
    }
  }

  async function refreshSettings(successMessage?: string) {
    const next = await api.getAdminSettings()
    setSettings(next)
    if (successMessage) setStatus({ tone: 'success', message: successMessage })
  }

  async function handlePasswordChange() {
    if (!newPassword.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      const response = await api.updateAdminPassword({ currentPassword, newPassword })
      api.setAdminToken(response.adminToken)
      storeAdminToken(response.adminToken)
      setCurrentPassword('')
      setNewPassword('')
      await refreshSettings('Password saved successfully.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Password update failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleAddAdmin() {
    if (!addAdminId.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      await api.addAdministrator(addAdminId.trim())
      setAddAdminId('')
      await refreshSettings('Administrator added.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to add administrator' })
    } finally {
      setLoading(false)
    }
  }

  async function handleChangeAdmin() {
    if (!changeFromId.trim() || !changeToId.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      await api.changeAdministrator(changeFromId.trim(), changeToId.trim())
      setChangeFromId('')
      setChangeToId('')
      await refreshSettings('Administrator Telegram ID updated.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to update administrator' })
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveAdmin(id: string) {
    setLoading(true)
    setStatus(null)
    try {
      await api.removeAdministrator(id)
      await refreshSettings('Administrator removed.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to remove administrator' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveBot() {
    if (!botToken.trim()) return
    setLoading(true)
    setStatus(null)
    try {
      if (settings?.bot.connected) {
        await api.changeAdminBot(botToken.trim())
      } else {
        await api.connectAdminBot(botToken.trim())
      }
      setBotToken('')
      await refreshSettings('Telegram bot token saved and validated.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to save bot token' })
    } finally {
      setLoading(false)
    }
  }

  async function handleTestBot() {
    setLoading(true)
    setStatus(null)
    try {
      await api.testAdminBot()
      await refreshSettings('Telegram bot connection is healthy.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Connection test failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnectBot() {
    if (!settings?.bot.connected) return
    setLoading(true)
    setStatus(null)
    try {
      await api.disconnectAdminBot()
      await refreshSettings('Bot disconnected.')
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to disconnect bot' })
    } finally {
      setLoading(false)
    }
  }

  const botStatusLabel = useMemo(() => {
    if (!settings) return 'Disconnected'
    if (settings.bot.connected) return 'Connected'
    return 'Disconnected'
  }, [settings])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Administration</h1>

      {status && <div className={`${styles.alert} ${styles[status.tone]}`}>{status.message}</div>}

      {authLoading && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}><ShieldIcon /> Admin authorization</h2>
          <p className={styles.help}>{t('common.loading')}</p>
        </section>
      )}

      {!authLoading && !authenticated && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}><ShieldIcon /> Admin authorization</h2>
          <p className={styles.help}>Enter your Telegram ID and administrator password.</p>
          <div className={styles.formRow}>
            <input className={styles.input} placeholder="Telegram ID" value={telegramId} onChange={(event) => setTelegramId(event.target.value)} />
            <input className={styles.input} type="password" placeholder="Administrator password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <button className={styles.primaryButton} onClick={() => void handleLogin()} disabled={loading || !telegramId.trim() || !password}>
            {loading ? t('common.loading') : 'Login to administration'}
          </button>
        </section>
      )}

      {!authLoading && canManage && (
        <>
          <CitiesSection setStatus={setStatus} loading={loading} setLoading={setLoading} />
          <CategoriesSection setStatus={setStatus} loading={loading} setLoading={setLoading} />
          <ProductsSection setStatus={setStatus} loading={loading} setLoading={setLoading} />

          <section className={styles.card}>
            <h2 className={styles.cardTitle}><ShieldIcon /> Security</h2>
            <p className={styles.help}>Use a strong administrator password and rotate it regularly.</p>
            <div className={styles.formRow}>
              <input className={styles.input} type="password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              <input className={styles.input} type="password" placeholder="New password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={() => void handlePasswordChange()} disabled={loading || !newPassword.trim()}>
                Save password
              </button>
              <button className={styles.ghostButton} onClick={() => void handleLogout()} disabled={loading}>
                Logout
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}><ShieldIcon /> Administrators</h2>
            <p className={styles.help}>Current authorized Telegram IDs.</p>
            <ul className={styles.adminList}>
              {settings.administrators.map((id) => (
                <li key={id} className={styles.adminItem}>
                  <span>{id}</span>
                  <button className={styles.removeButton} onClick={() => void handleRemoveAdmin(id)} disabled={loading}>Remove</button>
                </li>
              ))}
            </ul>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Add Telegram ID" value={addAdminId} onChange={(event) => setAddAdminId(event.target.value)} />
              <button className={styles.primaryButton} onClick={() => void handleAddAdmin()} disabled={loading || !addAdminId.trim()}>Add</button>
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Current Telegram ID" value={changeFromId} onChange={(event) => setChangeFromId(event.target.value)} />
              <input className={styles.input} placeholder="New Telegram ID" value={changeToId} onChange={(event) => setChangeToId(event.target.value)} />
              <button className={styles.primaryButton} onClick={() => void handleChangeAdmin()} disabled={loading || !changeFromId.trim() || !changeToId.trim()}>Change</button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}><BotIcon /> Telegram bot</h2>
            <p className={styles.help}>Status: <strong>{botStatusLabel}</strong></p>
            {settings.bot.connected && (
              <p className={styles.help}>Connected bot: @{settings.bot.bot.username} ({settings.bot.bot.firstName})</p>
            )}
            <p className={styles.help}>Token: {settings.bot.tokenMasked ?? 'not configured'}</p>
            <div className={styles.formRow}>
              <input className={styles.input} type="password" placeholder="Telegram Bot Token" value={botToken} onChange={(event) => setBotToken(event.target.value)} />
              <button className={styles.primaryButton} onClick={() => void handleSaveBot()} disabled={loading || !botToken.trim()}>
                Save / Connect Bot
              </button>
            </div>
            <div className={styles.actions}>
              <button className={styles.ghostButton} onClick={() => void handleTestBot()} disabled={loading || !settings.bot.connected}>Test connection</button>
              <button className={styles.removeButton} onClick={() => void handleDisconnectBot()} disabled={loading || !settings.bot.connected}>Disconnect</button>
            </div>
          </section>

          {stats && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Shop statistics</h2>
              <div className={styles.statsGrid}>
                <article className={styles.statCard}><span>Total orders</span><strong>{stats.totalOrders}</strong></article>
                <article className={styles.statCard}><span>Pending orders</span><strong>{stats.pendingOrders}</strong></article>
                <article className={styles.statCard}><span>Total users</span><strong>{stats.totalUsers}</strong></article>
                <article className={styles.statCard}><span>Revenue</span><strong>{stats.totalRevenue.toFixed(2)}</strong></article>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
