import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout/Layout'
import { AppProvider } from './context/AppContext'
import BalancePage from './pages/BalancePage'
import CartPage from './pages/CartPage'
import CasinoPage from './pages/CasinoPage'
import CitySelectPage from './pages/CitySelectPage'
import ProductPage from './pages/ProductPage'
import ProfilePage from './pages/ProfilePage'
import ShopPage from './pages/ShopPage'
import SupportPage from './pages/SupportPage'

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Routes>
          <Route path="/select-city" element={<CitySelectPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/shop" replace />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="shop/product/:id" element={<ProductPage />} />
            <Route path="shop/cart" element={<CartPage />} />
            <Route path="casino" element={<CasinoPage />} />
            <Route path="balance" element={<BalancePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="*" element={<Navigate to="/shop" replace />} />
          </Route>
        </Routes>
      </AppProvider>
    </HashRouter>
  )
}
