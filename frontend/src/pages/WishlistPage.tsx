import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { WishlistItem } from '../types';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './WishlistPage.module.css';
import { resolveApiErrorMessage } from '../lib/errors';

export default function WishlistPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.language as Language;
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadWishlist() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.getWishlist();
      setItems(response.items);
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, t, 'request_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWishlist();
  }, [t]);

  async function handleRemove(productCityId: number) {
    setActionError(null);
    setRemovingId(productCityId);
    try {
      await api.removeFromWishlist(productCityId);
      setItems((prev) => prev.filter((i) => i.product.productCityId !== productCityId));
    } catch (error) {
      setActionError(resolveApiErrorMessage(error, t, 'request_failed'));
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} aria-hidden="true" /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)} type="button">{t('common.back')}</button>
        <h1 className={styles.title}>{t('wishlist.title')}</h1>
      </div>

      {loadError ? (
        <div className={styles.errorState}>
          <p>{loadError}</p>
          <button className={styles.retryBtn} onClick={() => void loadWishlist()} type="button">
            {t('common.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></p>
          <p>{t('wishlist.empty')}</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')} type="button">{t('wishlist.goToShop')}</button>
        </div>
      ) : (
        <div className={styles.list}>
          {actionError && <p className={styles.actionError}>{actionError}</p>}
          {items.map((item) => {
            const p = item.product;
            return (
              <div key={item.id} className={styles.card} onClick={() => navigate(`/shop/product/${p.id}`)}>
                <div className={styles.img}>
                  {p.image ? <img src={p.image} alt={p.name} /> : <span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg></span>}
                </div>
                <div className={styles.info}>
                  <p className={styles.name}>{p.name}</p>
                  <p className={styles.price}>{formatCurrency(p.price, language)}</p>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={(e) => { e.stopPropagation(); void handleRemove(p.productCityId); }}
                  disabled={removingId === p.productCityId}
                  type="button"
                >
                  {t('cart.remove')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
