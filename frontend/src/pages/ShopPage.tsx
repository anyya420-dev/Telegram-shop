import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ProductCard from '../components/ProductCard/ProductCard';
import styles from './ShopPage.module.css';
import { useTranslation } from 'react-i18next';
import { getLocalizedCategoryName } from '../lib/localized';
import i18n from '../lib/i18n';
import type { Language } from '../types';

export default function ShopPage() {
  const { user, categories, products, cart, refreshCatalog, openCityPicker } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void refreshCatalog(search, activeCategoryId);
  }, []);

  const handleSearch = useCallback(() => {
    void refreshCatalog(search, activeCategoryId);
  }, [search, activeCategoryId, refreshCatalog]);

  const cartCount = cart?.items.length ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('shop.title')}</h1>
          {user?.selectedCity && (
            <button className={styles.city} onClick={() => openCityPicker()}>
              <MapPin size={14} strokeWidth={1.5} /> {user.selectedCity.name}
            </button>
          )}
        </div>
        <button
          className={styles.cartBtn}
          onClick={() => navigate('/shop/cart')}
          aria-label="Cart"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          {cartCount > 0 && (
            <span className={styles.cartBadge}>{cartCount}</span>
          )}
        </button>
      </div>

      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="text"
          placeholder={t('shop.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
      </div>

      <div className={styles.categories}>
        <button
          className={`${styles.catBtn} ${activeCategoryId === 'all' ? styles.catActive : ''}`}
          onClick={() => {
            setActiveCategoryId('all');
            void refreshCatalog(search, 'all');
          }}
        >
          {t('shop.allCategories')}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.catBtn} ${activeCategoryId === cat.id ? styles.catActive : ''}`}
            onClick={() => {
              setActiveCategoryId(cat.id);
              void refreshCatalog(search, cat.id);
            }}
          >
            {getLocalizedCategoryName(cat, language)}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <p>{t('shop.empty')}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard
              key={product.productCityId}
              product={product}
              onClick={() => navigate(`/shop/product/${product.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
