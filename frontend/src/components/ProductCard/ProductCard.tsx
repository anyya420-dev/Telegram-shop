import { useEffect, useState } from 'react';
import type { Language, ProductSummary } from '../../types';
import styles from './ProductCard.module.css';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../lib/format';
import i18n from '../../lib/i18n';
import { getLocalizedProductDescription, getLocalizedProductName, getLocalizedUnit } from '../../lib/localized';

interface Props {
  product: ProductSummary
  onClick: () => void
}

export default function ProductCard({ product, onClick }: Props) {
  const { t } = useTranslation();
  const { addToCart } = useApp();
  const language = i18n.language as Language;
  const [quantity, setQuantity] = useState(product.minimumQuantity || 1);

  useEffect(() => {
    setQuantity(product.minimumQuantity || 1);
  }, [product.productCityId, product.minimumQuantity]);

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (!product.isAvailable) return;
    await addToCart(product.productCityId, quantity);
  }

  const step = product.quantityStep || 1;
  const minimum = product.minimumQuantity || step;
  const maximum = Math.min(product.maximumQuantity || product.stock, product.stock);
  const localizedName = getLocalizedProductName(product, language);
  const localizedDescription = getLocalizedProductDescription(product, language);
  const localizedUnit = getLocalizedUnit(product.unit, language, product.unitTranslations);

  return (
    <div
      className={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={localizedName}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={localizedName} className={styles.image} loading="lazy" />
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
        <p className={styles.name}>{localizedName}</p>
        <p className={styles.description}>{localizedDescription}</p>
        <p className={styles.stock}>
          {product.isAvailable
            ? t('product.stockAvailable', { count: product.stock, unit: localizedUnit })
            : t('product.outOfStock')}
        </p>
        <div className={styles.bottom}>
          <div className={styles.priceWrap}>
            <span className={styles.price}>{formatCurrency(product.price, language)}</span>
            {localizedUnit && <span className={styles.unit}>/{localizedUnit}</span>}
          </div>
          {product.isAvailable && (
            <div className={styles.actionWrap} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.qtyBtn}
                onClick={() => setQuantity((prev) => Math.max(minimum, prev - step))}
                disabled={quantity <= minimum}
                type="button"
              >
                −
              </button>
              <span className={styles.qtyValue}>{quantity}</span>
              <button
                className={styles.qtyBtn}
                onClick={() => setQuantity((prev) => Math.min(maximum, prev + step))}
                disabled={quantity >= maximum}
                type="button"
              >
                +
              </button>
              <button
                className={styles.addBtn}
                onClick={(e) => void handleAdd(e)}
                title={t('common.addToCart')}
                aria-label={t('common.addToCart')}
                type="button"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
