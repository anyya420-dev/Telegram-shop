import { Product } from '../../types/product';
import styles from './ProductCard.module.css';
import { useTranslation } from 'react-i18next';

interface Props {
  product: Product;
  onClick: () => void;
}

export default function ProductCard({ product, onClick }: Props) {
  const pc = product.productCities[0];
  const { t } = useTranslation();

  return (
    <div className={styles.card} onClick={onClick}>
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
        <div className={styles.bottom}>
          <span className={styles.price}>${product.price}</span>
          {pc && (
            <span className={styles.unit}>{pc.unit}</span>
          )}
        </div>
      </div>
    </div>
  );
}
