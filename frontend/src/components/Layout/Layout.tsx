import { House, LayoutGrid, ShoppingBag, UserRound, X } from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CityPicker } from '../CityPicker';
import styles from './Layout.module.css';
import { useTranslation } from 'react-i18next';

function IconHome({ active }: { active: boolean }) {
  return <House size={22} strokeWidth={1.75} color={active ? 'var(--accent)' : 'var(--text-muted)'} />;
}

function IconCatalog({ active }: { active: boolean }) {
  return <LayoutGrid size={22} strokeWidth={1.75} color={active ? 'var(--accent)' : 'var(--text-muted)'} />;
}

function IconCart({ active }: { active: boolean }) {
  return <ShoppingBag size={22} strokeWidth={1.75} color={active ? 'var(--accent)' : 'var(--text-muted)'} />;
}

function IconProfile({ active }: { active: boolean }) {
  return <UserRound size={22} strokeWidth={1.75} color={active ? 'var(--accent)' : 'var(--text-muted)'} />;
}

const NAV_ITEMS = [
  { path: '/home', labelKey: 'nav.home', Icon: IconHome },
  { path: '/catalog', labelKey: 'nav.catalog', Icon: IconCatalog },
  { path: '/shop/cart', labelKey: 'nav.cart', exact: true, Icon: IconCart },
  { path: '/profile', labelKey: 'nav.profile', Icon: IconProfile },
];

export default function Layout() {
  const { error, loading, setError, cart } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

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
              <X size={16} strokeWidth={1.9} />
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
