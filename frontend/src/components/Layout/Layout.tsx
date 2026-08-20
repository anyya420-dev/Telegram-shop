import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import styles from './Layout.module.css';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { path: '/shop', icon: '🛍', label: 'Магазин' },
  { path: '/casino', icon: '🎰', label: 'Казино' },
  { path: '/balance', icon: '💰', label: 'Баланс' },
  { path: '/profile', icon: '👤', label: 'Профиль' },
  { path: '/support', icon: '🎧', label: 'Поддержка' },
];

export default function Layout() {
  const { loading, user } = useApp();
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
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
