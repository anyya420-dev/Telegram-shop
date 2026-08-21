import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard/ProductCard';
import { Product, ProductCategory } from '../types/product';
import { useTranslation } from 'react-i18next';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { selectedCity, cart } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newest, setNewest] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const cartCount = cart.items.length;
  const cityParam = selectedCity ? `cityId=${selectedCity.id}` : '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, feat, newArr] = await Promise.all([
        api.get<ProductCategory[]>('/categories'),
        api.get<Product[]>(`/products?featured=1${cityParam ? `&${cityParam}` : ''}`),
        api.get<Product[]>(`/products?newest=1&sort=newest${cityParam ? `&${cityParam}` : ''}`),
      ]);
      setCategories(cats);
      setFeatured(feat);
      setNewest(newArr);
    } finally {
      setLoading(false);
    }
  }, [cityParam]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(search.trim())}`);
    }
  }

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <h1 className={styles.logo}>{t('home.title')}</h1>
          {selectedCity && (
            <span className={styles.cityBadge}>📍 {selectedCity.name}</span>
          )}
        </div>
        <button className={styles.cartBtn} onClick={() => navigate('/shop/cart')}>
          🛒
          {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('home.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
        </div>
      ) : (
        <>
          {/* Categories */}
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
                    {cat.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Featured */}
          {featured.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{t('home.featured')}</span>
                <button className={styles.viewAll} onClick={() => navigate('/catalog?featured=1')}>
                  {t('home.viewAll')}
                </button>
              </div>
              <div className={styles.hScroll}>
                {featured.map((p) => (
                  <div key={p.id} className={styles.hCard}>
                    <ProductCard product={p} onClick={() => navigate(`/shop/product/${p.id}`)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Newest */}
          {newest.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{t('home.newest')}</span>
                <button className={styles.viewAll} onClick={() => navigate('/catalog?sort=newest')}>
                  {t('home.viewAll')}
                </button>
              </div>
              <div className={styles.grid}>
                {newest.slice(0, 6).map((p) => (
                  <ProductCard
                    key={p.id}
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
