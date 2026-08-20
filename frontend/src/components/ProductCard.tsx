import { Link } from 'react-router-dom'
import { formatCurrency, formatQuantity } from '../lib/format'
import type { ProductSummary } from '../types'

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className="product-card">
      <img className="product-card__image" src={product.image} alt={product.name} />
      <div className="product-card__content">
        <div className="product-card__meta">
          <span className="tag">{product.categoryName}</span>
          {product.isRecommended ? <span className="tag tag--accent">🔥 Рекомендуем</span> : null}
        </div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-card__footer">
          <div>
            <strong>{formatCurrency(product.price)}</strong>
            <span>
              от {formatQuantity(product.minimumQuantity)} {product.unit}
            </span>
          </div>
          <div className="stock-chip">В наличии: {formatQuantity(product.stock)} {product.unit}</div>
        </div>
        <Link className="primary-button" to={`/product/${product.id}`}>
          Открыть товар
        </Link>
      </div>
    </article>
  )
}
