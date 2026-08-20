import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { roundToStep } from '../lib/utils';
import { Product } from '../types/product';
import styles from './CartPage.module.css';

function getItemsLabel(count: number): string {
  const lastTwo = count % 100;
  const lastOne = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return 'товаров';
  }

  if (lastOne === 1) {
    return 'товар';
  }

  if (lastOne >= 2 && lastOne <= 4) {
    return 'товара';
  }

  return 'товаров';
}

export default function CartPage() {
  const { cart, updateCartItem, removeFromCart, selectedCity } = useApp();
  const navigate = useNavigate();
  const [recommended, setRecommended] = useState<Product[]>([]);

  useEffect(() => {
    const params = selectedCity ? `?cityId=${selectedCity.id}` : '';
    api.get<Product[]>(`/products/recommended/list${params}`).then(setRecommended);
  }, [selectedCity]);

  function renderCartItem(item: typeof cart.items[number]) {
    const productCity = item.product.productCities[0];
    const unit = productCity?.unit || 'шт.';
    const step = productCity?.quantityStep || 1;
    const minimum = productCity?.minimumQuantity || step;
    const maximum = productCity?.maximumQuantity;
    const nextDown = roundToStep(item.quantity - step, step);
    const nextUp = roundToStep(item.quantity + step, step);

    return (
      <div key={item.id} className={styles.item}>
        <div className={styles.itemImg}>
          {item.product.image ? (
            <img src={item.product.image} alt={item.product.name} />
          ) : (
            <span>📦</span>
          )}
        </div>
        <div className={styles.itemInfo}>
          <p className={styles.itemName}>{item.product.name}</p>
          <p className={styles.itemPrice}>${item.product.price} / {unit}</p>
          <p className={styles.itemTotal}>
            Итого: ${(item.product.price * item.quantity).toFixed(2)}
          </p>
        </div>
        <div className={styles.itemActions}>
          <button
            className={styles.qtyBtn}
            onClick={() =>
              nextDown >= minimum
                ? void updateCartItem(item.productId, nextDown)
                : void removeFromCart(item.productId)
            }
          >
            {nextDown < minimum ? '🗑' : '−'}
          </button>
          <span className={styles.qty}>{item.quantity}</span>
          <button
            className={styles.qtyBtn}
            onClick={() => void updateCartItem(item.productId, nextUp)}
            disabled={maximum !== undefined && nextUp > maximum}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className={styles.empty}>
        <button className={styles.back} onClick={() => navigate('/shop')}>← Назад</button>
        <div className={styles.emptyContent}>
          <div className={styles.emptyIcon}>🛒</div>
          <h2 className={styles.emptyTitle}>Корзина пуста</h2>
          <p className={styles.emptyText}>Добавьте товары из каталога</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')}>
            Перейти в магазин
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>←</button>
        <h1 className={styles.title}>Корзина</h1>
        <span className={styles.count}>
          {cart.items.length} {getItemsLabel(cart.items.length)}
        </span>
      </div>

      <div className={styles.items}>
        {cart.items.map(renderCartItem)}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>Товары ({cart.items.length})</span>
          <span>${cart.total.toFixed(2)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.placeholder}`}>
          <span>Скидка</span>
          <span className={styles.soon}>— (скоро)</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.placeholder}`}>
          <span>Доставка</span>
          <span className={styles.soon}>— (скоро)</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.total}`}>
          <span>Итого</span>
          <span>${cart.total.toFixed(2)}</span>
        </div>

        <button className={styles.checkoutBtn} disabled>
          💳 Оформить заказ (скоро)
        </button>
        <p className={styles.checkoutNote}>
          Оплата будет доступна в следующей версии
        </p>
      </div>

      {recommended.length > 0 && (
        <div className={styles.recommended}>
          <h3 className={styles.recTitle}>🔥 Вам может понравиться</h3>
          <div className={styles.recList}>
            {recommended.map((p) => (
              <div
                key={p.id}
                className={styles.recCard}
                onClick={() => navigate(`/shop/product/${p.id}`)}
              >
                <div className={styles.recImg}>
                  {p.image ? (
                    <img src={p.image} alt={p.name} />
                  ) : (
                    <span>📦</span>
                  )}
                </div>
                <p className={styles.recName}>{p.name}</p>
                <p className={styles.recPrice}>${p.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
