import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, MapPin, User } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ApiError, api } from '../api/client'
import styles from './CheckoutPage.module.css'
import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../lib/format'
import { getLocalizedCityName, getLocalizedUnit } from '../lib/localized'
import i18n from '../lib/i18n'
import type { DeliveryOption, Language, Order, PaymentMethod } from '../types'

export default function CheckoutPage() {
  const { cart, user, checkout, openCityPicker } = useApp()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([])
  const [deliveryLoading, setDeliveryLoading] = useState(true)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState('')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [copied, setCopied] = useState(false)

  function getErrorMessage(error: unknown, fallbackKey: string) {
    if (error instanceof ApiError && error.code) {
      return t(`errors.${error.code}`)
    }

    return t(`errors.${fallbackKey}`)
  }

  const loadDelivery = useCallback(async () => {
    try {
      setDeliveryLoading(true)
      setDeliveryError(null)
      const response = await api.getDeliveryOptions()
      setDeliveryOptions(response.options)
      setSelectedDeliveryId((prev) => prev ?? response.options[0]?.id ?? null)
    } catch (err) {
      setDeliveryError(getErrorMessage(err, 'request_failed'))
    } finally {
      setDeliveryLoading(false)
    }
  }, [t])

  const loadPaymentMethods = useCallback(async () => {
    try {
      setPaymentLoading(true)
      setPaymentError(null)
      const response = await api.getPaymentMethods()
      setPaymentMethods(response.methods)
      setSelectedPaymentMethodId((prev) => prev ?? response.methods[0]?.id ?? null)
    } catch (err) {
      setPaymentError(getErrorMessage(err, 'request_failed'))
    } finally {
      setPaymentLoading(false)
    }
  }, [t])

  useEffect(() => {
    void Promise.all([loadDelivery(), loadPaymentMethods()])
  }, [loadDelivery, loadPaymentMethods])

  const selectedDelivery = useMemo(
    () => deliveryOptions.find((option) => option.id === selectedDeliveryId) ?? null,
    [deliveryOptions, selectedDeliveryId],
  )

  const cityLabel = user?.selectedCity ? getLocalizedCityName(user.selectedCity, language) : t('profile.cityNotSelected')
  const safeSubtotal = cart?.subtotal ?? 0
  const total = Math.max(0, safeSubtotal - discountAmount + (selectedDelivery?.price ?? 0))

  async function applyDiscount() {
    if (!discountCode.trim() || validatingDiscount || !cart) return
    setValidatingDiscount(true)
    setDiscountError(null)
    try {
      const response = await api.validateDiscount(discountCode.trim().toUpperCase(), cart.subtotal)
      setDiscountAmount(response.discountAmount)
    } catch (err) {
      setDiscountAmount(0)
      setDiscountError(getErrorMessage(err, 'request_failed'))
    } finally {
      setValidatingDiscount(false)
    }
  }

  async function submitCheckout() {
    if (!cart || cart.items.length === 0 || !user?.selectedCityId || submitting) return
    if (deliveryOptions.length > 0 && !selectedDeliveryId) {
      setSubmitError(t('checkout.deliveryRequired'))
      return
    }
    if (!selectedPaymentMethodId) {
      setSubmitError(t('checkout.paymentRequired'))
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const createdOrder = await checkout({
        comment: comment.trim() || undefined,
        discountCode: discountAmount > 0 ? discountCode.trim().toUpperCase() : undefined,
        deliveryOptionId: selectedDeliveryId ?? undefined,
        paymentMethodId: selectedPaymentMethodId,
      })
      setOrder(createdOrder)
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'checkout_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  async function markPaid() {
    if (!order || markingPaid) return
    setMarkingPaid(true)
    setSubmitError(null)
    try {
      const response = await api.markOrderPaid(order.id)
      setOrder(response.order)
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'request_failed'))
    } finally {
      setMarkingPaid(false)
    }
  }

  if (order) {
    const method = order.paymentMethod
    const isCryptoLike = method?.type === 'crypto' || method?.type === 'ton'
    const canShowCryptoAddress = Boolean(isCryptoLike && method?.network && method?.walletAddress)
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('checkout.paymentTitle')}</h1>
        </div>

        <div className={styles.card}>
          <p className={styles.sectionTitle}>{t('checkout.successTitle')}</p>
          <p className={styles.value}>{t('checkout.successText')}</p>
          <div className={styles.sectionDivider} />
          <p className={styles.sectionTitle}>{t('orders.orderTitle', { id: order.id })}</p>
          <div className={styles.infoRow}>
            <MapPin size={14} strokeWidth={1.6} />
            <span>{language === 'en' && order.city.nameEn ? order.city.nameEn : order.city.name}</span>
          </div>
          <div className={styles.infoRow}>
            <User size={14} strokeWidth={1.6} />
            <span>{user?.firstName ?? t('profile.defaultName')}</span>
          </div>
          <div className={styles.line}>
            <span>{t('cart.orderTotal')}</span>
            <span>{formatCurrency(order.total, language)}</span>
          </div>
          <div className={styles.sectionDivider} />
          <p className={styles.sectionTitle}>{t('checkout.items')}</p>
          {order.items.map((item) => (
            <div key={item.id} className={styles.line}>
              <span>{item.productName} × {item.quantity} {item.unit}</span>
              <span>{formatCurrency(item.lineTotal, language)}</span>
            </div>
          ))}
          <div className={styles.sectionDivider} />
          <div className={styles.line}>
            <span>{t('cart.items', { count: order.items.length })}</span>
            <span>{formatCurrency(order.subtotal, language)}</span>
          </div>
          {order.discountAmount > 0 ? (
            <div className={styles.line}>
              <span>{t('cart.discount')}{order.discount ? ` (${order.discount.code})` : ''}</span>
              <span>−{formatCurrency(order.discountAmount, language)}</span>
            </div>
          ) : null}
          <div className={styles.line}>
            <span>{t('cart.delivery')}</span>
            <span>{formatCurrency(order.deliveryFee, language)}</span>
          </div>
          {method && (
            <div className={styles.line}>
              <span>{t('checkout.paymentMethod')}</span>
              <span>{method.title}</span>
            </div>
          )}
          {method?.currency && (
            <div className={styles.line}>
              <span>{t('checkout.currency')}</span>
              <span>{method.currency}</span>
            </div>
          )}
          {method?.type === 'card' && method.cardNumber && (
            <>
              <div className={styles.line}><span>{t('checkout.cardNumber')}</span><span>{method.cardNumber}</span></div>
              {method.cardholderName && <div className={styles.line}><span>{t('checkout.cardholder')}</span><span>{method.cardholderName}</span></div>}
            </>
          )}
          {canShowCryptoAddress && (
            <>
              <div className={styles.line}><span>{t('checkout.network')}</span><span>{method?.network}</span></div>
              <div className={styles.line}><span>{t('checkout.walletAddress')}</span><span>{method?.walletAddress}</span></div>
              <button className={styles.secondaryBtn} type="button" onClick={() => method?.walletAddress && void copyAddress(method.walletAddress)}>
                {copied ? t('checkout.copiedAddress') : t('checkout.copyAddress')}
              </button>
            </>
          )}
          {isCryptoLike && !canShowCryptoAddress && (
            <p className={styles.error}>{t('checkout.cryptoMissingNetwork')}</p>
          )}
          <p className={styles.value}>{order.paymentStatus === 'pending' ? t('checkout.paymentPending') : t('checkout.waitingForPayment')}</p>
          {submitError && <p className={styles.error}>{submitError}</p>}
          {order.paymentStatus !== 'pending' && (
            <button className={styles.primaryBtn} onClick={() => void markPaid()} disabled={markingPaid} type="button">
              {markingPaid ? t('common.loading') : t('checkout.iPaid')}
            </button>
          )}
          <div className={styles.actionGroup}>
            <button className={styles.secondaryBtn} onClick={() => navigate(`/orders/${order.id}`)} type="button">
              {t('checkout.viewOrder')}
            </button>
            <button className={styles.secondaryBtn} onClick={() => navigate('/orders')} type="button">
              {t('checkout.viewOrders')}
            </button>
            <button className={styles.secondaryBtn} onClick={() => navigate('/profile')} type="button">
              {t('checkout.goToProfile')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.title}>{t('checkout.title')}</h1>
        <p className={styles.emptyText}>{t('cart.empty')}</p>
        <button className={styles.primaryBtn} onClick={() => navigate('/catalog')} type="button">
          {t('cart.continueShopping')}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/shop/cart')} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('checkout.title')}</h1>
      </div>

      <div className={styles.card}>
        <p className={styles.label}>{t('profile.city')}</p>
        <div className={styles.infoRow}>
          <MapPin size={14} strokeWidth={1.6} />
          <span>{cityLabel}</span>
        </div>
        {!user?.selectedCityId ? (
          <button className={styles.secondaryBtn} onClick={openCityPicker} type="button">
            {t('checkout.selectCity')}
          </button>
        ) : null}
      </div>

      <div className={styles.card}>
        <p className={styles.label}>{t('checkout.customerInfo')}</p>
        <div className={styles.infoRow}>
          <User size={14} strokeWidth={1.6} />
          <span>{user?.firstName ?? t('profile.defaultName')}</span>
        </div>
        {user?.username ? <p className={styles.value}>@{user.username}</p> : null}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.items')}</p>
        {cart.items.map((item) => (
          <div key={item.id} className={styles.line}>
            <span>{item.productCity.name} × {item.quantity} {getLocalizedUnit(item.productCity.unit, language, item.productCity.unitTranslations)}</span>
            <span>{formatCurrency(item.lineTotal, language)}</span>
          </div>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('cart.discountCode')}</p>
        <div className={styles.discountRow}>
          <input
            className={styles.input}
            value={discountCode}
            onChange={(event) => {
              setDiscountCode(event.target.value.toUpperCase())
              setDiscountAmount(0)
              setDiscountError(null)
            }}
            placeholder={t('cart.discountCode')}
          />
          <button className={styles.secondaryBtn} onClick={() => void applyDiscount()} disabled={validatingDiscount || !discountCode} type="button">
            {t('cart.applyCode')}
          </button>
        </div>
        {discountError && <p className={styles.error}>{discountError}</p>}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('cart.deliveryOption')}</p>
        {deliveryLoading && <p className={styles.value}>{t('common.loading')}</p>}
        {deliveryError && (
          <div className={styles.errorRow}>
            <p className={styles.error}>{deliveryError}</p>
            <button className={styles.secondaryBtn} onClick={() => void loadDelivery()} type="button">
              {t('common.retry')}
            </button>
          </div>
        )}
        {!deliveryLoading && !deliveryError && deliveryOptions.length === 0 && (
          <p className={styles.value}>{t('checkout.noDeliveryOptions')}</p>
        )}
        {deliveryOptions.map((option) => (
          <label key={option.id} className={styles.option}>
            <input
              type="radio"
              checked={selectedDeliveryId === option.id}
              onChange={() => setSelectedDeliveryId(option.id)}
              name="delivery"
            />
            <span>{language === 'en' && option.nameEn ? option.nameEn : option.name}</span>
            <span>{option.price > 0 ? formatCurrency(option.price, language) : t('cart.free')}</span>
          </label>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.paymentMethod')}</p>
        <div className={styles.infoRow}>
          <CreditCard size={14} strokeWidth={1.6} />
          <span>{t('checkout.paymentMethod')}</span>
        </div>
        {paymentLoading && <p className={styles.value}>{t('common.loading')}</p>}
        {paymentError && (
          <div className={styles.errorRow}>
            <p className={styles.error}>{paymentError}</p>
            <button className={styles.secondaryBtn} onClick={() => void loadPaymentMethods()} type="button">
              {t('common.retry')}
            </button>
          </div>
        )}
        {!paymentLoading && !paymentError && paymentMethods.length === 0 && (
          <p className={styles.value}>{t('checkout.noPaymentMethods')}</p>
        )}
        {paymentMethods.map((method) => (
          <label key={method.id} className={styles.option}>
            <input
              type="radio"
              checked={selectedPaymentMethodId === method.id}
              onChange={() => setSelectedPaymentMethodId(method.id)}
              name="payment"
            />
            <span>{method.title}</span>
            <span>{method.currency ?? method.type.toUpperCase()}</span>
          </label>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>{t('checkout.comment')}</p>
        <textarea
          className={styles.textarea}
          placeholder={t('checkout.commentPlaceholder')}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.line}><span>{t('cart.items', { count: cart.items.length })}</span><span>{formatCurrency(safeSubtotal, language)}</span></div>
        {discountAmount > 0 && <div className={styles.line}><span>{t('cart.discount')}</span><span>−{formatCurrency(discountAmount, language)}</span></div>}
        <div className={styles.line}><span>{t('cart.delivery')}</span><span>{selectedDelivery ? formatCurrency(selectedDelivery.price, language) : t('checkout.notSelected')}</span></div>
        <div className={styles.total}><span>{t('cart.orderTotal')}</span><span>{formatCurrency(total, language)}</span></div>
        {submitError && <p className={styles.error}>{submitError}</p>}
        <button className={styles.primaryBtn} onClick={() => void submitCheckout()} disabled={submitting || paymentMethods.length === 0} type="button">
          {submitting ? t('cart.checkingOut') : t('checkout.confirm')}
        </button>
      </div>
    </div>
  )
}
