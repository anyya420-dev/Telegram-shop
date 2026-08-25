import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ProductCard from '../components/ProductCard/ProductCard';
import { useTranslation } from 'react-i18next';
import styles from './HomePage.module.css';
import { getLocalizedCategoryName, getLocalizedCityName } from '../lib/localized';
import i18n from '../lib/i18n';
import type { Language } from '../types';

export default function HomePage() {
  const { user, cart, categories, products, recommended, openCityPicker } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [search, setSearch] = useState('');

  const cartCount = cart?.items.length ?? 0;
  const featuredProducts = products.filter((p) => p.isRecommended).slice(0, 6);
  const allProducts = products.slice(0, 6);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(search.trim())}`);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <h1 className={styles.logo}>{t('home.title')}</h1>
          {user?.selectedCity ? (
            <button className={styles.cityBadge} onClick={openCityPicker}>
              <MapPin size={14} strokeWidth={1.5} /> {getLocalizedCityName(user.selectedCity, language)}
            </button>
          ) : (
            <button className={styles.cityBadge} onClick={openCityPicker}>
              <MapPin size={14} strokeWidth={1.5} /> {t('profile.cityNotSelected')}
            </button>
          )}
        </div>
        <button className={styles.cartBtn} onClick={() => navigate('/shop/cart')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
        </button>
      </div>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('home.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      {!user?.selectedCityId ? (
        <div className={styles.noCityWrap}>
          <div className={styles.noCityIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <p className={styles.noCityText}>{t('city.subtitle')}</p>
          <button className={styles.noCityBtn} onClick={openCityPicker}>
            {t('profile.selectCity')}
          </button>
        </div>
      ) : (
        <>
          {categories.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{t('home.categories')}</span>
                <button className={styles.viewAll} onClick={() => navigate('/catalog')}>
                  {t('home.viewAll')}
                </button>
              </div>
              <div className={styles.catScroll}>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    className={styles.catChip}
                    onClick={() => navigate(`/catalog?categoryId=${cat.id}`)}
                  >
                    {getLocalizedCategoryName(cat, language)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {featuredProducts.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{t('home.featured')}</span>
                <button className={styles.viewAll} onClick={() => navigate('/shop')}>
                  {t('home.viewAll')}
                </button>
              </div>
              <div className={styles.hScroll}>
                {featuredProducts.map((p) => (
                  <div key={p.productCityId} className={styles.hCard}>
                    <ProductCard product={p} onClick={() => navigate(`/shop/product/${p.id}`)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {recommended.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{t('home.popular')}</span>
                <button className={styles.viewAll} onClick={() => navigate('/shop')}>
                  {t('home.viewAll')}
                </button>
              </div>
              <div className={styles.grid}>
                {recommended.slice(0, 6).map((p) => (
                  <ProductCard
                    key={p.productCityId}
                    product={p}
                    onClick={() => navigate(`/shop/product/${p.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {allProducts.length > 0 && featuredProducts.length === 0 && recommended.length === 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{t('home.newest')}</span>
                <button className={styles.viewAll} onClick={() => navigate('/shop')}>
                  {t('home.viewAll')}
                </button>
              </div>
              <div className={styles.grid}>
                {allProducts.map((p) => (
                  <ProductCard
                    key={p.productCityId}
                    product={p}
                    onClick={() => navigate(`/shop/product/${p.id}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
