import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import type { AdminSettingsResponse, AdminStats } from '../types'
import styles from './AdminPage.module.css'

type StatusTone = 'success' | 'error' | 'info'

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

export default function AdminPage() {
  const { t } = useTranslation()
  const [telegramId, setTelegramId] = useState('')
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
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
    setSettings(settingsResponse)
    setStats(statsResponse)
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadProtectedData()
        setAuthenticated(true)
      } catch {
        setAuthenticated(false)
      }
    })()
  }, [])

  async function handleLogin() {
    if (!telegramId.trim() || !password) return
    setLoading(true)
    setStatus(null)
    try {
      const response = await api.adminLogin({ telegramId: telegramId.trim(), password })
      api.setAdminToken(response.adminToken)
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

  const botStatusLabel = useMemo(() => {
    if (!settings) return 'Disconnected'
    if (settings.bot.connected) return 'Connected'
    return 'Disconnected'
  }, [settings])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Administration</h1>

      {status && <div className={`${styles.alert} ${styles[status.tone]}`}>{status.message}</div>}

      {!authenticated && (
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

      {canManage && (
        <>
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
              <button className={styles.removeButton} onClick={() => void api.disconnectAdminBot().then(() => refreshSettings('Bot disconnected.')).catch((error: unknown) => setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to disconnect bot' }))} disabled={loading || !settings.bot.connected}>Disconnect</button>
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
