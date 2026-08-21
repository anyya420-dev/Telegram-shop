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
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.noImage}>📦</div>
        )}
        {!product.isAvailable && (
          <div className={styles.outOfStock}>{t('product.outOfStock')}</div>
        )}
        {product.isRecommended && (
          <div className={styles.badge}>🔥</div>
        )}
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{product.name}</p>
        {product.description && (
          <p className={styles.desc}>{product.description}</p>
        )}
        <div className={styles.bottom}>
          <div className={styles.priceWrap}>
            <span className={styles.price}>{formatCurrency(product.price, i18n.language as 'ru' | 'en')}</span>
            {product.unit && <span className={styles.unit}>{product.unit}</span>}
          </div>
          {product.isAvailable && (
            <button
              className={styles.addBtn}
              onClick={handleAdd}
              title={t('common.addToCart')}
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
