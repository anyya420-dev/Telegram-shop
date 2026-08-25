import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Package } from 'lucide-react';
import { api } from '../api/client';
import type { WishlistItem } from '../types';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './WishlistPage.module.css';

export default function WishlistPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.language as Language;
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.getWishlist().then((r) => { setItems(r.items); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleRemove(productCityId: number) {
    await api.removeFromWishlist(productCityId);
    setItems((prev) => prev.filter((i) => i.product.productCityId !== productCityId));
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>{t('common.back')}</button>
        <h1 className={styles.title}>{t('wishlist.title')}</h1>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}><Heart size={32} strokeWidth={1.5} /></p>
          <p>{t('wishlist.empty')}</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')}>{t('wishlist.goToShop')}</button>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const p = item.product;
            return (
              <div key={item.id} className={styles.card} onClick={() => navigate(`/shop/product/${p.id}`)}>
                <div className={styles.img}>
                  {p.image ? <img src={p.image} alt={p.name} /> : <Package size={24} strokeWidth={1.5} />}
                </div>
                <div className={styles.info}>
                  <p className={styles.name}>{p.name}</p>
                  <p className={styles.price}>{formatCurrency(p.price, language)}</p>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={(e) => { e.stopPropagation(); void handleRemove(p.productCityId); }}
                >
                  <Heart size={18} strokeWidth={1.5} fill="currentColor" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
