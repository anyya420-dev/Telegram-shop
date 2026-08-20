import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { CityPicker } from './components/CityPicker'
import { PagePlaceholder } from './components/PagePlaceholder'
import { AppProvider, useApp } from './context/AppContext'
import { useI18n } from './i18n'
import { CartPage } from './pages/CartPage'
import { ProductPage } from './pages/ProductPage'
import { ProfilePage } from './pages/ProfilePage'
import { ShopPage } from './pages/ShopPage'
import './index.css'

function AppShell() {
  const { loading, error, setError } = useApp()
  const { t } = useI18n()

  if (loading) {
    return <div className="app-shell"><section className="placeholder-card"><h1>{t('common.loadingShop')}</h1></section></div>
  }

  return (
    <div className="app-shell">
      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" aria-label={t('common.close')} onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
      <main className="content-shell">
        <Routes>
          <Route path="/" element={<ShopPage />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/casino" element={<PagePlaceholder title={t('placeholders.casinoTitle')} description={t('placeholders.casinoDescription')} />} />
          <Route path="/balance" element={<PagePlaceholder title={t('placeholders.balanceTitle')} description={t('placeholders.balanceDescription')} />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/support" element={<PagePlaceholder title={t('placeholders.supportTitle')} description={t('placeholders.supportDescription')} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
      <CityPicker />
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </AppProvider>
  )
}

export default App
