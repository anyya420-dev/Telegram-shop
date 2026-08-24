import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CityPicker } from '../CityPicker';
import styles from './Layout.module.css';
import { useTranslation } from 'react-i18next';

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconCatalog({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconCart({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

const NAV_ITEMS = [
  { path: '/home', labelKey: 'nav.home', Icon: IconHome },
  { path: '/catalog', labelKey: 'nav.catalog', Icon: IconCatalog },
  { path: '/shop/cart', labelKey: 'nav.cart', exact: true, Icon: IconCart },
  { path: '/profile', labelKey: 'nav.profile', Icon: IconProfile },
];

export default function Layout() {
  const { error, loading, setError, user, cart, citySelectionSkipped } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && user && !user.selectedCityId && !citySelectionSkipped) {
      navigate('/select-city', { replace: true });
    }
  }, [citySelectionSkipped, loading, navigate, user]);

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
        {error ? (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" aria-label={t('common.close')} onClick={() => setError(null)}>
              ×
            </button>
          </div>
        ) : null}
        <Outlet />
      </main>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.path;
          return (
            <button
              key={item.path}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => navigate(item.path)}
              type="button"
            >
              <span className={styles.navIconWrap}>
                <item.Icon active={isActive} />
                {item.labelKey === 'nav.cart' && cartCount > 0 && (
                  <span className={styles.navBadge}>{cartCount}</span>
                )}
              </span>
              <span className={styles.navLabel}>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
      <CityPicker />
    </div>
  );
}
