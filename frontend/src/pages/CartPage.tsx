import { Link } from 'react-router-dom'
import { ProductCard } from '../components/ProductCard'
import { QuantitySelector } from '../components/QuantitySelector'
import { useApp } from '../context/AppContext'
import { formatCurrency } from '../lib/format'

export function CartPage() {
  const { cart, recommended, updateCartItem, removeCartItem } = useApp()

  if (!cart || cart.items.length === 0) {
    return (
      <section className="placeholder-card">
        <span className="eyebrow">Корзина</span>
        <h1>Корзина пока пустая</h1>
        <p>Добавьте товар из каталога, чтобы увидеть стоимость и рекомендации.</p>
        <Link className="primary-button" to="/">Перейти в магазин</Link>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="section-heading">
        <div>
          <span className="eyebrow">Корзина</span>
          <h1>Ваш заказ</h1>
        </div>
      </section>

      <section className="cart-list">
        {cart.items.map((item) => (
          <article key={item.id} className="cart-card">
            <img className="cart-card__image" src={item.productCity.image} alt={item.productCity.name} />
            <div className="cart-card__content">
              <div className="cart-card__header">
                <div>
                  <h2>{item.productCity.name}</h2>
                  <p>{item.productCity.description}</p>
                </div>
                <button className="ghost-button" type="button" onClick={() => void removeCartItem(item.id)}>
                  Удалить
                </button>
              </div>
              <QuantitySelector
                minimum={item.productCity.minimumQuantity}
                step={item.productCity.quantityStep}
                maximum={item.productCity.maximumQuantity}
                unit={item.productCity.unit}
                value={item.quantity}
                onChange={(value) => {
                  void updateCartItem(item.id, value)
                }}
              />
              <div className="cart-card__footer">
                <span>{formatCurrency(item.productCity.price)} за единицу</span>
                <strong>{formatCurrency(item.lineTotal)}</strong>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="summary-card">
        <div className="summary-row">
          <span>Стоимость товаров</span>
          <strong>{formatCurrency(cart.subtotal)}</strong>
        </div>
        <div className="summary-row muted">
          <span>Скидки</span>
          <span>{formatCurrency(cart.discount)}</span>
        </div>
        <div className="summary-row muted">
          <span>Доставка</span>
          <span>{formatCurrency(cart.deliveryFee)}</span>
        </div>
        <div className="summary-row summary-row--total">
          <span>Итого</span>
          <strong>{formatCurrency(cart.total)}</strong>
        </div>
      </section>

      {recommended.length > 0 ? (
        <section className="page-stack">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Рекомендуем</span>
              <h2>🔥 Вам может понравиться</h2>
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
