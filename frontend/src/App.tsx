import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout/Layout';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CasinoPage from './pages/CasinoPage';
import BalancePage from './pages/BalancePage';
import ProfilePage from './pages/ProfilePage';
import SupportPage from './pages/SupportPage';
import CitySelectPage from './pages/CitySelectPage';

export default function App() {
  return (
    <BrowserRouter>
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
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
