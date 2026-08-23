import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import styles from './CartPage.module.css';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language, Discount, DeliveryOption } from '../types';
import { api } from '../api/client';

export default function CartPage() {
  const { cart, recommended, updateCartItem, removeCartItem, checkout } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ discount: Discount; discountAmount: number } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOption | null>(null);

  useEffect(() => {
    void api.getDeliveryOptions().then((r) => setDeliveryOptions(r.options));
  }, []);

  async function applyDiscount() {
    if (!discountCode.trim() || applyingDiscount) return;
    setApplyingDiscount(true);
    setDiscountError(null);
    try {
      const r = await api.validateDiscount(discountCode, cart?.subtotal ?? 0);
      setAppliedDiscount(r);
    } catch (e: unknown) {
      setDiscountError(e instanceof Error ? e.message : t('cart.invalidDiscount'));
      setAppliedDiscount(null);
    } finally {
      setApplyingDiscount(false);
    }
  }

  async function handleCheckout() {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const order = await checkout({
        discountCode: appliedDiscount ? discountCode : undefined,
        deliveryOptionId: selectedDelivery?.id,
      });
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

        {/* Discount code input */}
        <div className={styles.discountRow}>
          <input
            className={styles.discountInput}
            placeholder={t('cart.discountCode')}
            value={discountCode}
            onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setAppliedDiscount(null); }}
          />
          <button className={styles.discountBtn} onClick={() => void applyDiscount()} disabled={applyingDiscount || !discountCode}>
            {t('cart.applyCode')}
          </button>
        </div>
        {discountError && <p className={styles.discountError}>{discountError}</p>}
        {appliedDiscount && (
          <div className={styles.summaryRow}>
            <span>{t('cart.discount')} ({appliedDiscount.discount.code})</span>
            <span className={styles.discountValue}>−{formatCurrency(appliedDiscount.discountAmount, language)}</span>
          </div>
        )}

        {/* Delivery options */}
        {deliveryOptions.length > 0 && (
          <div className={styles.deliverySection}>
            <p className={styles.deliveryLabel}>{t('cart.deliveryOption')}</p>
            {deliveryOptions.map((opt) => (
              <label key={opt.id} className={styles.deliveryOpt}>
                <input
                  type="radio"
                  name="delivery"
                  checked={selectedDelivery?.id === opt.id}
                  onChange={() => setSelectedDelivery(opt)}
                />
                <span>{opt.name}</span>
                <span className={styles.deliveryPrice}>{opt.price > 0 ? formatCurrency(opt.price, language) : t('cart.free')}</span>
              </label>
            ))}
          </div>
        )}

        <div className={`${styles.summaryRow} ${styles.placeholder}`}>
          <span>{t('cart.delivery')}</span>
          <span>{formatCurrency(selectedDelivery?.price ?? 0, language)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.total}`}>
          <span>{t('cart.orderTotal')}</span>
          <span>{formatCurrency(
            Math.max(0, (cart.subtotal ?? 0) - (appliedDiscount?.discountAmount ?? 0) + (selectedDelivery?.price ?? 0)),
            language
          )}</span>
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
