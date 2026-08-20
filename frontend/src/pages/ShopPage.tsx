import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import ProductCard from '../components/ProductCard/ProductCard';
import { Product, ProductCategory } from '../types/product';
import styles from './ShopPage.module.css';

export default function ShopPage() {
  const { selectedCity, cart } = useApp();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const cartCount = cart.items.length;

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
      const suffix = params.toString();
      const data = await api.get<Product[]>(`/products${suffix ? `?${suffix}` : ''}`);
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, [selectedCity, activeCategoryId, search]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Магазин</h1>
          {selectedCity && (
            <span className={styles.city}>📍 {selectedCity.name}</span>
          )}
        </div>
        <button
          className={styles.cartBtn}
          onClick={() => navigate('/shop/cart')}
        >
          🛒
          {cartCount > 0 && (
            <span className={styles.cartBadge}>{cartCount}</span>
          )}
        </button>
      </div>

      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="text"
          placeholder="🔍 Поиск товаров..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.categories}>
        <button
          className={`${styles.catBtn} ${activeCategoryId === null ? styles.catActive : ''}`}
          onClick={() => setActiveCategoryId(null)}
        >
          Все
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.catBtn} ${activeCategoryId === cat.id ? styles.catActive : ''}`}
            onClick={() => setActiveCategoryId(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📦</div>
          <p>Товары не найдены</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => navigate(`/shop/product/${product.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
