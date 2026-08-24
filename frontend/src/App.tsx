import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout/Layout';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import CasinoPage from './pages/CasinoPage';
import BalancePage from './pages/BalancePage';
import ProfilePage from './pages/ProfilePage';
import SupportPage from './pages/SupportPage';
import CitySelectPage from './pages/CitySelectPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import AdminPage from './pages/AdminPage';
import WishlistPage from './pages/WishlistPage';

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Routes>
          <Route path="/select-city" element={<CitySelectPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="shop/product/:id" element={<ProductPage />} />
            <Route path="shop/cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="casino" element={<CasinoPage />} />
            <Route path="balance" element={<BalancePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </AppProvider>
    </HashRouter>
  );
}
