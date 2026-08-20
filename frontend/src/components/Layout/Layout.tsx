import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n'
import { CityPicker } from '../CityPicker'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { path: '/shop', icon: '🛍', labelKey: 'nav.shop' },
  { path: '/casino', icon: '🎰', labelKey: 'nav.casino' },
  { path: '/balance', icon: '💰', labelKey: 'nav.balance' },
  { path: '/profile', icon: '👤', labelKey: 'nav.profile' },
  { path: '/support', icon: '🎧', labelKey: 'nav.support' },
] as const

export function Layout() {
  const { error, loading, setError, user } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!loading && user && !user.selectedCityId) {
      navigate('/select-city', { replace: true })
    }
  }, [loading, navigate, user])

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} aria-hidden="true" />
      </div>
    )
  }

  const activeTab = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path))?.path

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        <div className="app-shell">
          {error ? (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button type="button" aria-label={t('common.close')} onClick={() => setError(null)}>
                ×
              </button>
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`${styles.navItem} ${activeTab === item.path ? styles.active : ''}`}
            onClick={() => navigate(item.path)}
            type="button"
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>
      <CityPicker />
    </div>
  )
}
