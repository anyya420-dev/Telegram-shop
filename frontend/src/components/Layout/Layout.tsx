import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import styles from './Layout.module.css';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
  { path: '/shop', icon: '🛍', labelKey: 'nav.shop' },
  { path: '/casino', icon: '🎰', labelKey: 'nav.casino' },
  { path: '/balance', icon: '💰', labelKey: 'nav.balance' },
  { path: '/profile', icon: '👤', labelKey: 'nav.profile' },
  { path: '/support', icon: '🎧', labelKey: 'nav.support' },
];

export default function Layout() {
  const { loading, user } = useApp();
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

  const activeTab = NAV_ITEMS.find((item) =>
    location.pathname.startsWith(item.path)
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
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
