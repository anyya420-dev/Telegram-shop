import { useApp } from '../../context/AppContext'
import { useI18n } from '../../i18n'
import { formatCurrency } from '../../lib/format'
import { Product } from '../../types/product'
import styles from './ProductCard.module.css'

interface Props {
  product: Product
  onClick: () => void
}

export default function ProductCard({ product, onClick }: Props) {
  const { user } = useApp()
  const { language, t } = useI18n()
  const pc = user?.selectedCityId
    ? product.productCities.find((entry) => entry.cityId === user.selectedCityId)
    : undefined

  return (
    <button className={styles.card} onClick={onClick} type="button">
      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.noImage}>📦</div>
        )}
        {pc && !pc.isAvailable ? <div className={styles.outOfStock}>{t('product.outOfStock')}</div> : null}
        {product.isRecommended ? <div className={styles.badge}>🔥</div> : null}
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{product.name}</p>
        <div className={styles.bottom}>
          <span className={styles.price}>{formatCurrency(product.price, language)}</span>
          {pc ? <span className={styles.unit}>{pc.unit}</span> : null}
        </div>
      </div>
    </button>
  )
}
