import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import ProductCard from '../components/ProductCard/ProductCard';
import { useTranslation } from 'react-i18next';
import styles from './CatalogPage.module.css';
import { getLocalizedCategoryName } from '../lib/localized';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import { resolveApiErrorMessage } from '../lib/errors';

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popular';

function sortProducts(products: ReturnType<typeof useApp>['products'], sort: SortOption) {
  const copy = [...products];
  switch (sort) {
    case 'newest': return copy.sort((a, b) => b.id - a.id);
    case 'price_asc': return copy.sort((a, b) => a.price - b.price);
    case 'price_desc': return copy.sort((a, b) => b.price - a.price);
    case 'popular': return copy.sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));
    default: return copy;
  }
}

export default function CatalogPage() {
  const { user, categories, products, refreshCatalog } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [searchParams, setSearchParams] = useSearchParams();

  const rawCategoryId = searchParams.get('categoryId');
  const parsedCategoryId = rawCategoryId ? Number(rawCategoryId) : null;
  const initCategory = typeof parsedCategoryId === 'number' && Number.isFinite(parsedCategoryId) && parsedCategoryId > 0
    ? parsedCategoryId
    : null;
  const initSearch = searchParams.get('search') || '';
  const initSort = (searchParams.get('sort') as SortOption) || 'newest';

  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>(initCategory ?? 'all');
  const [search, setSearch] = useState(initSearch);
  const [sort, setSort] = useState<SortOption>(initSort);
  const [showSort, setShowSort] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const doRefresh = useCallback(async (s: string, cat: number | 'all') => {
    setLoading(true);
    setCatalogError(null);
    try {
      await refreshCatalog(s, cat);
    } catch (err) {
      setCatalogError(resolveApiErrorMessage(err, t, 'catalog_refresh_failed'));
    } finally {
      setLoading(false);
    }
  }, [refreshCatalog, t]);

  useEffect(() => {
    void doRefresh(initSearch, initCategory ?? 'all');
  }, []);

  useEffect(() => {
    if (activeCategoryId === 'all') {
      return;
    }

    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId('all');
    }
  }, [activeCategoryId, categories]);

  useEffect(() => {
    if (!user?.selectedCityId) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      void doRefresh(search.trim(), activeCategoryId);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [search, activeCategoryId, user?.selectedCityId, doRefresh]);

  // Sync URL params
  useEffect(() => {
    const p: Record<string, string> = {};
    if (activeCategoryId !== 'all') p.categoryId = String(activeCategoryId);
    if (search) p.search = search;
    if (sort !== 'newest') p.sort = sort;
    setSearchParams(p, { replace: true });
  }, [activeCategoryId, search, sort, setSearchParams]);

  const sortedProducts = sortProducts(products, sort);

  const sortLabels: Record<SortOption, string> = {
    newest: t('catalog.sortNewest'),
    price_asc: t('catalog.sortPriceAsc'),
    price_desc: t('catalog.sortPriceDesc'),
    popular: t('catalog.sortPopular'),
  };

  if (!user?.selectedCityId) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg></div>
        <p>{t('city.productsAfterSelection')}</p>
        <button className={styles.cityActionBtn} onClick={() => navigate('/select-city')} type="button">
          {t('city.selectAction')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('catalog.title')}</h1>
        <div className={styles.headerActions}>
          <button className={styles.cityActionBtn} onClick={() => navigate('/select-city')} type="button">
            {t('city.selectAction')}
          </button>
          <button className={styles.sortBtn} onClick={() => setShowSort(true)}>
            ⇅ {sortLabels[sort]}
          </button>
        </div>
      </div>

      <div className={styles.searchWrap}>
        <div className={styles.searchInputWrap}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder={t('catalog.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.length > 0 && (
            <button
              className={styles.clearSearch}
              onClick={() => setSearch('')}
              aria-label={t('catalog.clearSearch')}
              type="button"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className={styles.catScroll}>
        <button
          className={`${styles.catBtn} ${activeCategoryId === 'all' ? styles.catActive : ''}`}
          onClick={() => setActiveCategoryId('all')}
          type="button"
        >
          {t('catalog.allCategories')}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.catBtn} ${activeCategoryId === cat.id ? styles.catActive : ''}`}
            onClick={() => setActiveCategoryId(cat.id)}
            type="button"
          >
            {getLocalizedCategoryName(cat, language)}
          </button>
        ))}
      </div>

      <div className={styles.actionsRow}>
        <button
          className={styles.resetBtn}
          onClick={() => {
            setSearch('');
            setSort('newest');
            setActiveCategoryId('all');
          }}
          type="button"
          disabled={loading}
        >
          {t('catalog.resetFilters')}
        </button>
      </div>

      {catalogError && (
        <div className={styles.errorState}>
          <p>{catalogError}</p>
          <button className={styles.retryBtn} onClick={() => void doRefresh(search, activeCategoryId)} type="button">
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <div className={styles.skeletonImage} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></div>
          <p>{search ? t('catalog.nothingFound') : t('catalog.empty')}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {sortedProducts.map((p) => (
            <ProductCard key={p.productCityId} product={p} onClick={() => navigate(`/shop/product/${p.id}`)} />
          ))}
        </div>
      )}

      {showSort && (
        <div className={styles.overlay} onClick={() => setShowSort(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <p className={styles.sheetTitle}>{t('catalog.sort')}</p>
            {(Object.keys(sortLabels) as SortOption[]).map((s) => (
              <button
                key={s}
                className={`${styles.sortOption} ${sort === s ? styles.sortActive : ''}`}
                onClick={() => { setSort(s); setShowSort(false); }}
              >
                {sortLabels[s]}
                {sort === s && <span className={styles.sortCheck}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
