import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../api/client';
import styles from './ProductPage.module.css';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language, ProductDetail } from '../types';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, addToCart, cart } = useApp();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id || !user?.selectedCityId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { product: data } = await api.getProduct(Number(id), user.selectedCityId);
        setProduct(data);
        setQuantity(data.minimumQuantity || 1);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id, user?.selectedCityId]);

  function increment() {
    if (!product) return;
    const next = quantity + product.quantityStep;
    if (next <= product.maximumQuantity) setQuantity(next);
  }

  function decrement() {
    if (!product) return;
    const next = quantity - product.quantityStep;
    if (next >= product.minimumQuantity) setQuantity(next);
  }

  async function handleAddToCart() {
    if (!product) return;
    setAdding(true);
    try {
      await addToCart(product.productCityId, quantity);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2000);
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.error}>
        <p>{t('product.notFound')}</p>
        <button onClick={() => navigate(-1)}>{t('product.back')}</button>
      </div>
    );
  }

  const itemInCart = cart?.items.find((i) => i.productCity.productCityId === product.productCityId);

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        {t('product.back')}
      </button>

      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.noImage}>📦</div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.categoryTag}>{product.categoryName}</div>
        <h1 className={styles.name}>{product.name}</h1>

        <div className={styles.priceRow}>
          <span className={styles.price}>{formatCurrency(product.price, language)}</span>
          {product.unit && <span className={styles.unit}>/ {product.unit}</span>}
        </div>

        {product.description && (
          <p className={styles.description}>{product.description}</p>
        )}

        <div className={styles.stockRow}>
          <span
            className={`${styles.stockDot} ${product.isAvailable ? styles.inStock : styles.outOfStock}`}
          />
          <span className={styles.stockText}>
            {product.isAvailable
              ? t('product.inStock', { count: product.stock, unit: product.unit })
              : t('product.outOfStock')}
          </span>
        </div>

        {product.isAvailable && (
          <>
            <div className={styles.qtySection}>
              <span className={styles.qtyLabel}>{t('product.quantity')}</span>
              <div className={styles.qtyControl}>
                <button
                  className={styles.qtyBtn}
                  onClick={decrement}
                  disabled={quantity <= product.minimumQuantity}
                >
                  −
                </button>
                <span className={styles.qtyValue}>
                  {quantity} {product.unit}
                </span>
                <button
                  className={styles.qtyBtn}
                  onClick={increment}
                  disabled={quantity >= product.maximumQuantity}
                >
                  +
                </button>
              </div>
            </div>

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>{t('product.total')}</span>
              <span className={styles.totalPrice}>
                {formatCurrency(product.price * quantity, language)}
              </span>
            </div>

            <button
              className={`${styles.addBtn} ${added ? styles.addedBtn : ''}`}
              onClick={handleAddToCart}
              disabled={adding || added}
            >
              {added
                ? t('product.added')
                : adding
                ? t('product.adding')
                : itemInCart
                ? t('product.updateCart')
                : t('product.addToCart')}
            </button>

            {itemInCart && (
              <button
                className={styles.viewCartBtn}
                onClick={() => navigate('/shop/cart')}
              >
                {t('product.goToCart')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
