import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard/ProductCard';
import { Product, ProductCategory } from '../types/product';
import { useTranslation } from 'react-i18next';
import styles from './CatalogPage.module.css';

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popular';

export default function CatalogPage() {
  const { selectedCity } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const initCategory = searchParams.get('categoryId') ? Number(searchParams.get('categoryId')) : null;
  const initSearch = searchParams.get('search') || '';
  const initFeatured = searchParams.get('featured') === '1';
  const initSort = (searchParams.get('sort') as SortOption) || 'newest';

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(initCategory);
  const [search, setSearch] = useState(initSearch);
  const [sort, setSort] = useState<SortOption>(initSort);
  const [featured, setFeatured] = useState(initFeatured);
  const [loading, setLoading] = useState(true);
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    api.get<ProductCategory[]>('/categories').then(setCategories);
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCity) params.set('cityId', String(selectedCity.id));
      if (activeCategoryId) params.set('categoryId', String(activeCategoryId));
      if (search) params.set('search', search);
      if (sort) params.set('sort', sort);
      if (featured) params.set('featured', '1');
      const data = await api.get<Product[]>(`/products?${params.toString()}`);
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, [selectedCity, activeCategoryId, search, sort, featured]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  // Sync URL params
  useEffect(() => {
    const p: Record<string, string> = {};
    if (activeCategoryId) p.categoryId = String(activeCategoryId);
    if (search) p.search = search;
    if (sort !== 'newest') p.sort = sort;
    if (featured) p.featured = '1';
    setSearchParams(p, { replace: true });
  }, [activeCategoryId, search, sort, featured, setSearchParams]);

  const sortLabels: Record<SortOption, string> = {
    newest: t('catalog.sortNewest'),
    price_asc: t('catalog.sortPriceAsc'),
    price_desc: t('catalog.sortPriceDesc'),
    popular: t('catalog.sortPopular'),
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>{t('catalog.title')}</h1>
        <button className={styles.sortBtn} onClick={() => setShowSort(true)}>
          ⇅ {sortLabels[sort]}
        </button>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('catalog.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setFeatured(false);
          }}
        />
      </div>

      {/* Categories */}
      <div className={styles.catScroll}>
        <button
          className={`${styles.catBtn} ${activeCategoryId === null && !featured ? styles.catActive : ''}`}
          onClick={() => { setActiveCategoryId(null); setFeatured(false); }}
        >
          {t('catalog.allCategories')}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.catBtn} ${activeCategoryId === cat.id ? styles.catActive : ''}`}
            onClick={() => { setActiveCategoryId(cat.id); setFeatured(false); }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products */}
      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
        </div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <p>{t('catalog.empty')}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onClick={() => navigate(`/shop/product/${p.id}`)} />
          ))}
        </div>
      )}

      {/* Sort sheet */}
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
