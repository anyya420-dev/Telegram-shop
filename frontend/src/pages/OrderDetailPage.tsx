import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CalendarDays, CreditCard, MapPin, Package, RefreshCw, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { getErrorMessage } from '../lib/errors'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import { getLocalizedUnit } from '../lib/localized'
import type { Language, Order } from '../types'
import styles from './OrderDetailPage.module.css'

function statusLabel(status: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    pending: t('orders.statusPending'),
    payment_pending: t('orders.statusPaymentPending'),
    confirmed: t('orders.statusConfirmed'),
    processing: t('orders.statusProcessing'),
    ready: t('orders.statusReady'),
    delivered: t('orders.statusDelivered'),
    cancelled: t('orders.statusCancelled'),
  }
  return map[status] ?? status
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = i18n.language as Language

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [paying, setPaying] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function loadOrder() {
    if (!id) {
      setLoading(false)
      setPageError(t('orders.notFound'))
      return
    }

    try {
      setLoading(true)
      setPageError(null)
      const response = await api.getOrder(Number(id))
      setOrder(response.order)
    } catch (error) {
      setPageError(getErrorMessage(error, t, 'orders_fetch_failed'))
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrder()
  }, [id])

  async function handleCancel() {
    if (!order || cancelling) return
    setCancelling(true)
    setActionError(null)
    try {
      const response = await api.cancelOrder(order.id)
      setOrder(response.order)
    } catch (error) {
      setActionError(getErrorMessage(error, t, 'request_failed'))
    } finally {
      setCancelling(false)
    }
  }

  async function handleRefundRequest() {
    if (!order || refunding) return
    setRefunding(true)
    setActionError(null)
    try {
      const response = await api.requestRefund(order.id)
      setOrder(response.order)
    } catch (error) {
      setActionError(getErrorMessage(error, t, 'request_failed'))
    } finally {
      setRefunding(false)
    }
  }

  async function handlePayNow() {
    if (!order || paying) return
    setPaying(true)
    setActionError(null)
    try {
      const response = await api.createOrderPayment(order.id)
      navigate(`/checkout/payment?orderId=${order.id}&paymentId=${response.payment.id}`)
    } catch (error) {
      setActionError(getErrorMessage(error, t, 'request_failed'))
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (!order) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.back} onClick={() => navigate('/orders')} type="button">
            <ArrowLeft size={16} strokeWidth={1.8} />
            {t('common.back')}
          </button>
          <h1 className={styles.title}>{t('orders.title')}</h1>
        </div>
        <div className={styles.notFound}>
          <div className={styles.notFoundIcon}>
            <AlertCircle size={20} strokeWidth={1.8} />
          </div>
          <p>{pageError ?? t('orders.notFound')}</p>
          <button className={styles.retryBtn} onClick={() => void loadOrder()} type="button">
            <RefreshCw size={16} strokeWidth={1.8} />
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  const canCancel = ['pending', 'confirmed', 'payment_pending'].includes(order.status)
  const canRefund = ['delivered', 'cancelled'].includes(order.status) && !order.refundStatus
  const isAwaitingDeliveryPrice = order.deliveryOption?.type === 'delivery' && !order.deliveryPriceConfirmed && order.paymentStatus !== 'paid'
  const canPayNow = order.deliveryOption?.type === 'delivery' && order.deliveryPriceConfirmed && order.paymentStatus !== 'paid' && order.status !== 'cancelled'
  const localizedCity = language === 'en' && order.city.nameEn ? order.city.nameEn : order.city.name
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const localizedDelivery = order.deliveryOption
    ? language === 'en' && order.deliveryOption.nameEn
      ? order.deliveryOption.nameEn
      : order.deliveryOption.name
    : null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/orders')} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('orders.orderTitle', { id: order.id })}</h1>
      </div>

      {pageError ? (
        <div className={styles.notice}>
          <AlertCircle size={16} strokeWidth={1.8} />
          <span>{pageError}</span>
        </div>
      ) : null}

      <div className={styles.statusRow}>
        <span className={`${styles.status} ${styles[`status_${order.status}`] ?? ''}`}>
          {statusLabel(order.status, t)}
        </span>
        <span className={styles.date}>
          {new Date(order.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}
        </span>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t('cart.orderTotal')}</span>
          <span>{formatCurrency(order.total, language)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>{t('orders.itemCount')}</span>
          <span>{t('cart.itemCount', { count: itemCount })}</span>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('orders.info')}</h2>
        <div className={styles.infoList}>
          <div className={styles.infoRow}>
            <MapPin size={16} strokeWidth={1.7} />
            <span>{t('orders.city')}</span>
            <strong>{localizedCity}</strong>
          </div>
          <div className={styles.infoRow}>
            <CalendarDays size={16} strokeWidth={1.7} />
            <span>{t('orders.createdAt')}</span>
            <strong>{new Date(order.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}</strong>
          </div>
          {order.deliveryOption ? (
            <div className={styles.infoRow}>
              <Truck size={16} strokeWidth={1.7} />
              <span>{t('cart.delivery')}</span>
              <strong>{localizedDelivery}</strong>
            </div>
          ) : null}
          {order.deliveryAddress ? (
            <div className={styles.infoRow}>
              <MapPin size={16} strokeWidth={1.7} />
              <span>{t('checkout.deliveryAddress', 'Адрес')}</span>
              <strong>{order.deliveryAddress}</strong>
            </div>
          ) : null}
          {order.paymentMethod ? (
            <div className={styles.infoRow}>
              <CreditCard size={16} strokeWidth={1.7} />
              <span>{t('checkout.paymentMethod')}</span>
              <strong>{order.paymentMethod.title}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('orders.items')}</h2>
        {order.items.map((item) => (
          <div key={item.id} className={styles.item}>
            <div className={styles.itemImg}>
              {item.productImage ? (
                <img src={item.productImage} alt={item.productName} />
              ) : (
                <Package size={24} strokeWidth={1.5} />
              )}
            </div>
            <div className={styles.itemInfo}>
              <p className={styles.itemName}>{item.productName}</p>
              <p className={styles.itemQty}>
                {item.quantity} {getLocalizedUnit(item.unit, language)} × {formatCurrency(item.price, language)}
              </p>
            </div>
            <p className={styles.itemTotal}>{formatCurrency(item.lineTotal, language)}</p>
            {item.pickupAssignment ? (
              <div className={styles.comment} style={{ marginTop: 8 }}>
                <p className={styles.commentLabel}>Pickup details</p>
                <p className={styles.commentText}>{item.pickupAssignment.address}</p>
                {item.pickupAssignment.instructions ? <p className={styles.commentText}>{item.pickupAssignment.instructions}</p> : null}
                {item.pickupAssignment.photoUrl ? <p className={styles.commentText}>{item.pickupAssignment.photoUrl}</p> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t('cart.items', { count: itemCount })}</span>
          <span>{formatCurrency(order.subtotal, language)}</span>
        </div>
        {order.discountAmount > 0 ? (
          <div className={styles.summaryRow}>
            <span>{t('cart.discount')}{order.discount ? ` (${order.discount.code})` : ''}</span>
            <span className={styles.discountValue}>−{formatCurrency(order.discountAmount, language)}</span>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span>{t('cart.delivery')}{localizedDelivery ? ` — ${localizedDelivery}` : ''}</span>
          <span>{formatCurrency(order.deliveryFee, language)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.totalRow}`}>
          <span>{t('cart.orderTotal')}</span>
          <span>{formatCurrency(order.total, language)}</span>
        </div>
      </div>

      {order.comment ? (
        <div className={styles.comment}>
          <p className={styles.commentLabel}>{t('orders.comment')}</p>
          <p className={styles.commentText}>{order.comment}</p>
        </div>
      ) : null}

      {order.statusHistory?.length ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('orders.statusHistory')}</h2>
          <div className={styles.historyList}>
            {order.statusHistory.map((entry) => (
              <div key={entry.id} className={styles.historyEntry}>
                <span className={`${styles.historyStatus} ${styles[`status_${entry.status}`] ?? ''}`}>
                  {statusLabel(entry.status, t)}
                </span>
                <span className={styles.historyDate}>
                  {new Date(entry.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}
                </span>
                {entry.comment ? <span className={styles.historyComment}>{entry.comment}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {order.refundStatus ? (
        <div className={styles.refundBadge}>
          {t(`orders.refund_${order.refundStatus}`, { defaultValue: order.refundStatus })}
        </div>
      ) : null}

      {actionError ? <p className={styles.actionError}>{actionError}</p> : null}

      {isAwaitingDeliveryPrice ? (
        <div className={styles.awaitingDelivery}>
          <p>{t('orders.awaitingDeliveryPrice', '⏳ Ожидаем подтверждения стоимости доставки от оператора. После подтверждения вы сможете оплатить заказ здесь.')}</p>
        </div>
      ) : null}

      {canPayNow ? (
        <div className={styles.awaitingDelivery}>
          <p>{t('orders.deliveryPriceConfirmed', 'Стоимость доставки подтверждена')}: <strong>{formatCurrency(order.operatorDeliveryPrice ?? order.deliveryFee, language)}</strong></p>
          <p>{t('orders.newTotal', 'Итог к оплате')}: <strong>{formatCurrency(order.total, language)}</strong></p>
          <button className={styles.payBtn} onClick={() => void handlePayNow()} disabled={paying} type="button">
            {paying ? t('common.loading') : t('orders.payNow', 'Оплатить сейчас')}
          </button>
        </div>
      ) : null}

      {canCancel ? (
        <button className={styles.cancelBtn} onClick={() => void handleCancel()} disabled={cancelling} type="button">
          {cancelling ? t('orders.cancelling') : t('orders.cancelOrder')}
        </button>
      ) : null}
      {canRefund ? (
        <button className={styles.refundBtn} onClick={() => void handleRefundRequest()} disabled={refunding} type="button">
          {refunding ? t('orders.requesting') : t('orders.requestRefund')}
        </button>
      ) : null}
    </div>
  )
}
