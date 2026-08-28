import { House, LayoutGrid, ShoppingBag, UserRound, Wallet, X } from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CityPicker } from '../CityPicker';
import styles from './Layout.module.css';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { safeNavigateBack, useInAppHistoryTracker } from '../../lib/navigation';

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
  const { error, loading, setError, cart, balanceAmount, user } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  useInAppHistoryTracker();

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const backButton = webApp?.BackButton;
    if (!backButton) return;

    const rootRoutes = new Set(['/home', '/catalog', '/shop/cart', '/profile']);
    const shouldShowBack = !rootRoutes.has(location.pathname);
    const backHandler = () => safeNavigateBack(navigate, `${location.pathname}${location.search}`, '/home');

    if (shouldShowBack) {
      backButton.show();
      backButton.onClick(backHandler);
    } else {
      backButton.hide();
    }

    return () => {
      backButton.offClick(backHandler);
    };
  }, [location.pathname, location.search, navigate]);

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
      {user ? (
        <div className={styles.topBar}>
          <button className={styles.balanceChip} onClick={() => navigate('/balance')} type="button">
            <Wallet size={12} strokeWidth={1.9} />
            <span>${balanceAmount.toFixed(2)}</span>
          </button>
        </div>
      ) : null}
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
