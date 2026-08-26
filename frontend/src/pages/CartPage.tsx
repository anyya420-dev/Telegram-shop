import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, MapPin, Minus, Package, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import styles from './CartPage.module.css';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import { getLocalizedCityName, getLocalizedProductName, getLocalizedUnit } from '../lib/localized';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import { ApiError } from '../api/client';

export default function CartPage() {
  const { cart, cartLoading, recommended, user, updateCartItem, removeCartItem, openCityPicker } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function getErrorMessage(error: unknown, fallbackKey: string) {
    if (error instanceof ApiError && error.code) {
      return t(`errors.${error.code}`);
    }

    return t(`errors.${fallbackKey}`);
  }

  async function handleQuantityChange(itemId: number, action: () => Promise<void>) {
    try {
      setPendingItemId(itemId);
      setActionError(null);
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error, 'cart_update_failed'));
    } finally {
      setPendingItemId(null);
    }
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.empty}>
        <button className={styles.back} onClick={() => navigate('/shop')} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <div className={styles.emptyContent}>
          <div className={styles.emptyIcon}>
            <ShoppingBag size={28} strokeWidth={1.5} />
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
        <button className={styles.back} onClick={() => navigate(-1)} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('cart.title')}</h1>
        <span className={styles.count}>
          {t('cart.itemCount', { count: cart.items.length })}
        </span>
      </div>

      <div className={styles.cityCard}>
        <div>
          <p className={styles.cityLabel}>{t('profile.city')}</p>
          <div className={styles.cityValue}>
            <MapPin size={14} strokeWidth={1.6} />
            <span>
              {user?.selectedCity ? getLocalizedCityName(user.selectedCity, language) : t('profile.cityNotSelected')}
            </span>
          </div>
        </div>
        <button className={styles.changeCityBtn} onClick={openCityPicker} type="button">
          {t('cityPicker.changeCity')}
        </button>
      </div>

      {actionError ? (
        <div className={styles.alert}>
          <AlertCircle size={16} strokeWidth={1.7} />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className={styles.items}>
        {cart.items.map((item) => {
          const pc = item.productCity;
          const localizedName = getLocalizedProductName(pc, language);
          const localizedUnit = getLocalizedUnit(pc.unit, language, pc.unitTranslations);
          const step = pc.quantityStep || 1;
          const minimum = pc.minimumQuantity || step;
          const maximum = pc.maximumQuantity;
          const nextDown = item.quantity - step;
          const nextUp = item.quantity + step;
          const itemBusy = cartLoading || pendingItemId === item.id;
          const canIncrease = pc.isAvailable && nextUp <= maximum && nextUp <= pc.stock;

          return (
            <div key={item.id} className={styles.item}>
              <div className={styles.itemImg}>
                {pc.image ? (
                  <img src={pc.image} alt={pc.name} />
                ) : (
                  <Package size={24} strokeWidth={1.5} />
                )}
              </div>
              <div className={styles.itemInfo}>
                <p className={styles.itemName}>{localizedName}</p>
                <p className={styles.itemPrice}>
                  {localizedUnit
                    ? t('cart.pricePerUnit', { price: formatCurrency(pc.price, language), unit: localizedUnit })
                    : formatCurrency(pc.price, language)}
                </p>
                <p className={styles.itemTotal}>
                  {t('cart.itemTotal', { total: formatCurrency(item.lineTotal, language) })}
                </p>
                {!pc.isAvailable ? (
                  <p className={styles.itemWarning}>{t('cart.itemUnavailable')}</p>
                ) : (
                  <p className={styles.itemMeta}>
                    {t('product.stockAvailable', { count: pc.stock, unit: localizedUnit })}
                  </p>
                )}
              </div>
              <div className={styles.itemActions}>
                <button
                  className={styles.qtyBtn}
                  onClick={() => void handleQuantityChange(
                    item.id,
                    () => nextDown >= minimum ? updateCartItem(item.id, nextDown) : removeCartItem(item.id),
                  )}
                  disabled={itemBusy}
                  type="button"
                >
                  {nextDown < minimum ? <Trash2 size={14} strokeWidth={1.5} /> : <Minus size={14} strokeWidth={1.8} />}
                </button>
                <span className={styles.qty}>{item.quantity}</span>
                <button
                  className={styles.qtyBtn}
                  onClick={() => void handleQuantityChange(item.id, () => updateCartItem(item.id, nextUp))}
                  disabled={itemBusy || !canIncrease}
                  type="button"
                >
                  <Plus size={14} strokeWidth={1.8} />
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
          <button className={styles.continueBtn} onClick={() => navigate('/catalog')} type="button">
            {t('cart.continueShopping')}
          </button>
          <button className={styles.checkoutBtn} onClick={() => navigate('/checkout')} type="button">
            {t('cart.checkout')}
          </button>
        </div>
        {cartLoading ? <p className={styles.summaryNote}>{t('common.loading')}</p> : null}
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
                    <Package size={24} strokeWidth={1.5} />
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
