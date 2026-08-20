import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { formatCurrency, formatQuantity } from '../lib/format'
import { getLocalizedProductCategoryName, getLocalizedProductDescription, getLocalizedProductName, getLocalizedUnit } from '../lib/localized'
import type { ProductSummary } from '../types'

export function ProductCard({ product }: { product: ProductSummary }) {
  const { language, t } = useI18n()
  const unit = getLocalizedUnit(product.unit, language, product.unitTranslations)
  const imageSrc = product.image || '/favicon.svg'

  return (
    <article className="product-card">
      <img className="product-card__image" src={imageSrc} alt={getLocalizedProductName(product, language)} />
      <div className="product-card__content">
        <div className="product-card__meta">
          <span className="tag">{getLocalizedProductCategoryName(product, language)}</span>
          {product.isRecommended ? <span className="tag tag--accent">{t('product.recommended')}</span> : null}
        </div>
        <h3>{getLocalizedProductName(product, language)}</h3>
        <p>{getLocalizedProductDescription(product, language)}</p>
        <div className="product-card__footer">
          <div>
            <strong>{formatCurrency(product.price, language)}</strong>
            <span>
              {t('product.from')} {formatQuantity(product.minimumQuantity, language)} {unit}
            </span>
          </div>
          <div className="stock-chip">{t('product.inStock', { value: formatQuantity(product.stock, language), unit })}</div>
        </div>
        <Link className="primary-button" to={`/shop/product/${product.id}`}>
          {t('product.open')}
        </Link>
      </div>
    </article>
  )
}
