import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CityPicker } from '../CityPicker';
import styles from './Layout.module.css';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
  { path: '/home', icon: '🏠', labelKey: 'nav.home' },
  { path: '/catalog', icon: '🗂', labelKey: 'nav.catalog' },
  { path: '/shop/cart', icon: '🛒', labelKey: 'nav.cart', exact: true },
  { path: '/profile', icon: '👤', labelKey: 'nav.profile' },
];

export default function Layout() {
  const { error, loading, setError, user, cart } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && user && !user.selectedCityId) {
      navigate('/select-city', { replace: true });
    }
  }, [loading, navigate, user]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} aria-hidden="true" />
      </div>
    );
  }

  const cartCount = cart?.items.length ?? 0;

  const activeTab = NAV_ITEMS.find((item) =>
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
  )?.path;

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
            <span className={styles.navIconWrap}>
              <span className={styles.navIcon}>{item.icon}</span>
              {item.labelKey === 'nav.cart' && cartCount > 0 && (
                <span className={styles.navBadge}>{cartCount}</span>
              )}
            </span>
            <span className={styles.navLabel}>{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>
      <CityPicker />
    </div>
  );
}
