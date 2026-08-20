import { Link } from 'react-router-dom'
import { ProductCard } from '../components/ProductCard'
import { QuantitySelector } from '../components/QuantitySelector'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n'
import { formatCurrency } from '../lib/format'
import { getLocalizedProductDescription, getLocalizedProductName } from '../lib/localized'

export default function CartPage() {
  const { cart, recommended, updateCartItem, removeCartItem } = useApp()
  const { language, t } = useI18n()

  if (!cart || cart.items.length === 0) {
    return (
      <section className="placeholder-card">
        <span className="eyebrow">{t('cart.badge')}</span>
        <h1>{t('cart.emptyTitle')}</h1>
        <p>{t('cart.emptyDescription')}</p>
        <Link className="primary-button" to="/shop">{t('cart.goToShop')}</Link>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="section-heading">
        <div>
          <span className="eyebrow">{t('cart.badge')}</span>
          <h1>{t('cart.title')}</h1>
        </div>
      </section>

      <section className="cart-list">
        {cart.items.map((item) => (
          <article key={item.id} className="cart-card">
            <img className="cart-card__image" src={item.productCity.image || '/favicon.svg'} alt={getLocalizedProductName(item.productCity, language)} />
            <div className="cart-card__content">
              <div className="cart-card__header">
                <div>
                  <h2>{getLocalizedProductName(item.productCity, language)}</h2>
                  <p>{getLocalizedProductDescription(item.productCity, language)}</p>
                </div>
                <button className="ghost-button" type="button" onClick={() => void removeCartItem(item.id)}>
                  {t('cart.remove')}
                </button>
              </div>
              <QuantitySelector
                minimum={item.productCity.minimumQuantity}
                step={item.productCity.quantityStep}
                maximum={item.productCity.maximumQuantity}
                unit={item.productCity.unit}
                unitTranslations={item.productCity.unitTranslations}
                value={item.quantity}
                onChange={(value) => {
                  void updateCartItem(item.id, value)
                }}
              />
              <div className="cart-card__footer">
                <span>{t('cart.perUnit', { price: formatCurrency(item.productCity.price, language) })}</span>
                <strong>{formatCurrency(item.lineTotal, language)}</strong>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="summary-card">
        <div className="summary-row">
          <span>{t('cart.goodsTotal')}</span>
          <strong>{formatCurrency(cart.subtotal, language)}</strong>
        </div>
        <div className="summary-row muted">
          <span>{t('cart.discounts')}</span>
          <span>{formatCurrency(cart.discount, language)}</span>
        </div>
        <div className="summary-row muted">
          <span>{t('cart.delivery')}</span>
          <span>{formatCurrency(cart.deliveryFee, language)}</span>
        </div>
        <div className="summary-row summary-row--total">
          <span>{t('cart.total')}</span>
          <strong>{formatCurrency(cart.total, language)}</strong>
        </div>
      </section>

      {recommended.length > 0 ? (
        <section className="page-stack">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('cart.recommendedBadge')}</span>
              <h2>{t('cart.recommendedTitle')}</h2>
            </div>
          </div>
          <div className="product-grid">
            {recommended.map((product) => (
              <ProductCard key={product.productCityId} product={product} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
