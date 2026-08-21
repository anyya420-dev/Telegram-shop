import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import styles from './Layout.module.css';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
  { path: '/home', icon: '🏠', labelKey: 'nav.home' },
  { path: '/catalog', icon: '🗂', labelKey: 'nav.catalog' },
  { path: '/shop/cart', icon: '🛒', labelKey: 'nav.cart', exact: true },
  { path: '/profile', icon: '👤', labelKey: 'nav.profile' },
];

export default function Layout() {
  const { loading, user, cart } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && user && !user.selectedCityId) {
      navigate('/select-city');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const cartCount = cart.items.length;

  const activeTab = NAV_ITEMS.find((item) =>
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
  )?.path;

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`${styles.navItem} ${activeTab === item.path ? styles.active : ''}`}
            onClick={() => navigate(item.path)}
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
    </div>
  );
}
