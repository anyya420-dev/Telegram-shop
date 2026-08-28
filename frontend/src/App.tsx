import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/AppContext';
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
import RewardsPage from './pages/RewardsPage';
import SupportPage from './pages/SupportPage';
import CitySelectPage from './pages/CitySelectPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OperatorPage from './pages/OperatorPage';
import AdminPage from './pages/AdminPage';
import WishlistPage from './pages/WishlistPage';
import { resolveEntryRouteRedirect } from './lib/entryRoute';

function LoadingGate() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080810' }}>
      <div
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#34d399',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    </div>
  );
}

function ShopLayoutGate() {
  const { loading } = useApp();

  if (loading) return <LoadingGate />;
  return <Layout />;
}

function CitySelectGate() {
  const { loading, user } = useApp();
  const redirect = resolveEntryRouteRedirect({
    loading,
    hasUser: Boolean(user),
    selectedCityId: user?.selectedCityId,
    route: 'city_select',
  });

  if (loading) return <LoadingGate />;
  if (redirect) return <Navigate to={redirect} replace />;
  return <CitySelectPage />;
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Routes>
          <Route path="/select-city" element={<CitySelectGate />} />
          <Route path="/operator" element={<OperatorPage />} />
          <Route path="/" element={<ShopLayoutGate />}>
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
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="owner" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </AppProvider>
    </HashRouter>
  );
}
