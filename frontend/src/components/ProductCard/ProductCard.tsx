import type { ProductSummary } from '../../types';
import styles from './ProductCard.module.css';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../lib/format';
import i18n from '../../lib/i18n';

interface Props {
  product: ProductSummary
  onClick: () => void
}

export default function ProductCard({ product, onClick }: Props) {
  const { t } = useTranslation();
  const { addToCart } = useApp();

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (!product.isAvailable) return;
    await addToCart(product.productCityId, product.minimumQuantity);
  }

  return (
    <div
      className={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={product.name}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={product.name} className={styles.image} loading="lazy" />
        ) : (
          <div className={styles.noImage}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
        )}
        {!product.isAvailable && (
          <div className={styles.outOfStock}>{t('product.outOfStock')}</div>
        )}
        {product.isRecommended && (
          <div className={styles.badge}>{t('product.featured', { defaultValue: 'TOP' })}</div>
        )}
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{product.name}</p>
        <div className={styles.bottom}>
          <div className={styles.priceWrap}>
            <span className={styles.price}>{formatCurrency(product.price, i18n.language as 'ru' | 'en')}</span>
            {product.unit && <span className={styles.unit}>/{product.unit}</span>}
          </div>
          {product.isAvailable && (
            <button
              className={styles.addBtn}
              onClick={handleAdd}
              title={t('common.addToCart')}
              aria-label={t('common.addToCart')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
