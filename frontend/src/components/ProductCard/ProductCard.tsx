import { Minus, Package, Plus, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../../context/AppContext'
import { formatCurrency } from '../../lib/format'
import { getLocalizedProductCategoryName, getLocalizedProductDescription, getLocalizedProductName, getLocalizedUnit } from '../../lib/localized'
import { clampProductQuantity, getProductQuantityBounds } from '../../lib/storefront'
import i18n from '../../lib/i18n'
import styles from './ProductCard.module.css'
import type { Language, ProductSummary } from '../../types'

interface Props {
  product: ProductSummary
  onClick: () => void
}

export default function ProductCard({ product, onClick }: Props) {
  const { t } = useTranslation()
  const { addToCart } = useApp()
  const language = i18n.language as Language
  const [quantity, setQuantity] = useState(product.minimumQuantity || 1)

  const localizedName = getLocalizedProductName(product, language)
  const localizedDescription = getLocalizedProductDescription(product, language)
  const localizedCategory = getLocalizedProductCategoryName(product, language)
  const localizedUnit = getLocalizedUnit(product.unit, language, product.unitTranslations)
  const { step, minimum, maximum, canOrder } = getProductQuantityBounds(product)

  useEffect(() => {
    setQuantity(clampProductQuantity(product, product.minimumQuantity || 1))
  }, [product])

  async function handleAdd(event: React.MouseEvent) {
    event.stopPropagation()
    if (!canOrder || !product.isAvailable) {
      return
    }
    await addToCart(product.productCityId, quantity)
  }

  return (
    <div
      className={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={localizedName}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onClick()
        }
      }}
    >
      <div className={styles.imageWrap}>
        {product.image ? (
          <img src={product.image} alt={localizedName} className={styles.image} loading="lazy" />
        ) : (
          <div className={styles.noImage}>
            <Package size={28} strokeWidth={1.5} />
          </div>
        )}
        {!product.isAvailable || !canOrder ? (
          <div className={styles.outOfStock}>{t('product.outOfStock')}</div>
        ) : null}
        {product.isRecommended ? <div className={styles.badge}>{t('product.featured', { defaultValue: 'TOP' })}</div> : null}
      </div>
      <div className={styles.info}>
        <div className={styles.metaRow}>
          <p className={styles.category}>{localizedCategory}</p>
          <p className={styles.stock}>
            {product.isAvailable && canOrder ? t('product.stockAvailable', { count: product.stock, unit: localizedUnit }) : t('product.outOfStock')}
          </p>
        </div>
        <p className={styles.name}>{localizedName}</p>
        <p className={styles.description}>{localizedDescription}</p>
        <div className={styles.bottom}>
          <div className={styles.priceWrap}>
            <span className={styles.price}>{formatCurrency(product.price, language)}</span>
            {localizedUnit ? <span className={styles.unit}>/{localizedUnit}</span> : null}
          </div>
          {product.isAvailable && canOrder ? (
            <div className={styles.actionWrap} onClick={(event) => event.stopPropagation()}>
              <button
                className={styles.qtyBtn}
                onClick={() => setQuantity((current) => clampProductQuantity(product, current - step))}
                disabled={quantity <= minimum}
                type="button"
              >
                <Minus size={12} strokeWidth={1.8} />
              </button>
              <span className={styles.qtyValue}>{quantity}</span>
              <button
                className={styles.qtyBtn}
                onClick={() => setQuantity((current) => clampProductQuantity(product, current + step))}
                disabled={quantity >= maximum}
                type="button"
              >
                <Plus size={12} strokeWidth={1.8} />
              </button>
              <button
                className={styles.addBtn}
                onClick={(event) => void handleAdd(event)}
                title={t('common.addToCart')}
                aria-label={t('common.addToCart')}
                type="button"
              >
                <ShoppingBag size={12} strokeWidth={1.8} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
