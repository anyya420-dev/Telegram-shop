import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import styles from './CartPage.module.css';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import { resolveApiErrorMessage } from '../lib/errors';

export default function CartPage() {
  const { cart, recommended, updateCartItem, removeCartItem } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failedItemImages, setFailedItemImages] = useState<Record<string, boolean>>({});

  async function handleDecrease(itemId: number, nextDown: number, minimum: number) {
    if (pendingItemId !== null) return;
    setPendingItemId(itemId);
    setActionError(null);
    try {
      if (nextDown >= minimum) {
        await updateCartItem(itemId, nextDown);
      } else {
        await removeCartItem(itemId);
      }
    } catch (error) {
      setActionError(resolveApiErrorMessage(error, t, 'cart_update_failed'));
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleIncrease(itemId: number, nextUp: number) {
    if (pendingItemId !== null) return;
    setPendingItemId(itemId);
    setActionError(null);
    try {
      await updateCartItem(itemId, nextUp);
    } catch (error) {
      setActionError(resolveApiErrorMessage(error, t, 'cart_update_failed'));
    } finally {
      setPendingItemId(null);
    }
  }

  function markImageFailed(key: string) {
    setFailedItemImages((prev) => ({ ...prev, [key]: true }));
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.empty}>
        <button className={styles.back} onClick={() => navigate('/shop')}>{t('common.back')}</button>
        <div className={styles.emptyContent}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
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
        {actionError && <div className={styles.checkoutError}>{actionError}</div>}
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
                {pc.image && !failedItemImages[`cart-item-${item.id}`] ? (
                  <img src={pc.image} alt={pc.name} onError={() => markImageFailed(`cart-item-${item.id}`)} />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
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
                  onClick={() => void handleDecrease(item.id, nextDown, minimum)}
                  disabled={pendingItemId !== null}
                  type="button"
                >
                  {nextDown < minimum ? '🗑' : '−'}
                </button>
                <span className={styles.qty}>{item.quantity}</span>
                <button
                  className={styles.qtyBtn}
                  onClick={() => void handleIncrease(item.id, nextUp)}
                  disabled={pendingItemId !== null || (maximum !== undefined && nextUp > maximum)}
                  type="button"
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
        <div className={`${styles.summaryRow} ${styles.total}`}>
          <span>{t('cart.orderTotal')}</span>
          <span>{formatCurrency(cart.total, language)}</span>
        </div>

        <div className={styles.summaryActions}>
          <button className={styles.continueBtn} onClick={() => navigate('/catalog')} type="button" disabled={pendingItemId !== null}>
            {t('cart.continueShopping')}
          </button>
          <button className={styles.checkoutBtn} onClick={() => navigate('/checkout')} type="button" disabled={pendingItemId !== null}>
            {t('cart.checkout')}
          </button>
        </div>
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
                  {p.image && !failedItemImages[`recommended-${p.productCityId}`] ? (
                    <img src={p.image} alt={p.name} onError={() => markImageFailed(`recommended-${p.productCityId}`)} />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
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
