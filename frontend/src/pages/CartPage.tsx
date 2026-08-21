import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import styles from './CartPage.module.css';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';

export default function CartPage() {
  const { cart, recommended, updateCartItem, removeCartItem, checkout } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout() {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const order = await checkout();
      navigate(`/orders/${order.id}`);
    } catch {
      setCheckoutError(t('cart.checkoutFailed'));
    } finally {
      setCheckingOut(false);
    }
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.empty}>
        <button className={styles.back} onClick={() => navigate('/shop')}>{t('common.back')}</button>
        <div className={styles.emptyContent}>
          <div className={styles.emptyIcon}>🛒</div>
          <h2 className={styles.emptyTitle}>{t('cart.empty')}</h2>
          <p className={styles.emptyText}>{t('cart.emptyHint')}</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')}>
            {t('cart.goToShop')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>{t('cart.back')}</button>
        <h1 className={styles.title}>{t('cart.title')}</h1>
        <span className={styles.count}>
          {t('cart.itemCount', { count: cart.items.length })}
        </span>
      </div>

      <div className={styles.items}>
        {cart.items.map((item) => {
          const pc = item.productCity;
          const step = pc.quantityStep || 1;
          const minimum = pc.minimumQuantity || step;
          const maximum = pc.maximumQuantity;
          const nextDown = item.quantity - step;
          const nextUp = item.quantity + step;

          return (
            <div key={item.id} className={styles.item}>
              <div className={styles.itemImg}>
                {pc.image ? (
                  <img src={pc.image} alt={pc.name} />
                ) : (
                  <span>📦</span>
                )}
              </div>
              <div className={styles.itemInfo}>
                <p className={styles.itemName}>{pc.name}</p>
                <p className={styles.itemPrice}>
                  {pc.unit
                    ? t('cart.pricePerUnit', { price: formatCurrency(pc.price, language), unit: pc.unit })
                    : formatCurrency(pc.price, language)}
                </p>
                <p className={styles.itemTotal}>
                  {t('cart.itemTotal', { total: formatCurrency(item.lineTotal, language) })}
                </p>
              </div>
              <div className={styles.itemActions}>
                <button
                  className={styles.qtyBtn}
                  onClick={() =>
                    nextDown >= minimum
                      ? void updateCartItem(item.id, nextDown)
                      : void removeCartItem(item.id)
                  }
                >
                  {nextDown < minimum ? '🗑' : '−'}
                </button>
                <span className={styles.qty}>{item.quantity}</span>
                <button
                  className={styles.qtyBtn}
                  onClick={() => void updateCartItem(item.id, nextUp)}
                  disabled={maximum !== undefined && nextUp > maximum}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t('cart.items', { count: cart.items.length })}</span>
          <span>{formatCurrency(cart.subtotal, language)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.placeholder}`}>
          <span>{t('cart.discount')}</span>
          <span className={styles.soon}>{formatCurrency(cart.discount, language)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.placeholder}`}>
          <span>{t('cart.delivery')}</span>
          <span className={styles.soon}>{formatCurrency(cart.deliveryFee, language)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.total}`}>
          <span>{t('cart.orderTotal')}</span>
          <span>{formatCurrency(cart.total, language)}</span>
        </div>

        <button
          className={styles.checkoutBtn}
          onClick={() => void handleCheckout()}
          disabled={checkingOut}
        >
          {checkingOut ? t('cart.checkingOut') : t('cart.checkout')}
        </button>
        {checkoutError && (
          <p className={styles.checkoutError}>{checkoutError}</p>
        )}
      </div>

      {recommended && recommended.length > 0 && (
        <div className={styles.recommended}>
          <h3 className={styles.recTitle}>{t('cart.recommended')}</h3>
          <div className={styles.recList}>
            {recommended.map((p) => (
              <div
                key={p.productCityId}
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
                <p className={styles.recPrice}>{formatCurrency(p.price, language)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
