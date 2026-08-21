import { Product } from '../../types/product';
import styles from './ProductCard.module.css';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../lib/format';
import i18n from '../../lib/i18n';

interface Props {
  product: Product
  onClick: () => void
}

export default function ProductCard({ product, onClick }: Props) {
  const { t } = useTranslation();
  const { user, addToCart } = useApp();
  const pc = user?.selectedCityId
    ? product.productCities.find((entry) => entry.cityId === user.selectedCityId)
    : product.productCities[0];

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (!pc || !pc.isAvailable) return;
    await addToCart(product.id, pc.minimumQuantity);
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
        {pc && !pc.isAvailable && (
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
            {pc && <span className={styles.unit}>{pc.unit}</span>}
          </div>
          {pc && pc.isAvailable && (
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
