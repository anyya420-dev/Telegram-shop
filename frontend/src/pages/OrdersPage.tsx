import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CalendarDays, ChevronRight, MapPin, Package } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTranslation } from 'react-i18next'
import { getErrorMessage } from '../lib/errors'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import { getLocalizedUnit } from '../lib/localized'
import type { Language } from '../types'
import styles from './OrdersPage.module.css'

function statusLabel(status: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    waiting_for_delivery_price: t('orders.statusDeliveryCalculation'),
    ready_for_payment: t('orders.statusWaitingForPayment'),
    pending: t('orders.statusPending'),
    payment_pending: t('orders.statusPaymentPending'),
    confirmed: t('orders.statusConfirmed'),
    processing: t('orders.statusProcessing'),
    ready: t('orders.statusReady'),
    shipped: t('orders.statusShipped'),
    delivered: t('orders.statusDelivered'),
    cancelled: t('orders.statusCancelled'),
  }
  return map[status] ?? status
}

export default function OrdersPage() {
  const { orders, ordersLoading, fetchOrders } = useApp()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const language = i18n.language as Language
  const [ordersError, setOrdersError] = useState<string | null>(null)

  async function loadOrders() {
    try {
      setOrdersError(null)
      await fetchOrders()
    } catch (error) {
      setOrdersError(getErrorMessage(error, t, 'orders_fetch_failed'))
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [])

  if (ordersLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/profile')} type="button">
          <ArrowLeft size={16} strokeWidth={1.8} />
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('orders.title')}</h1>
      </div>

      {ordersError ? (
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>
            <AlertCircle size={18} strokeWidth={1.8} />
          </div>
          <p className={styles.errorText}>{ordersError}</p>
          <button className={styles.retryBtn} onClick={() => void loadOrders()} type="button">
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Package size={28} strokeWidth={1.5} />
          </div>
          <p className={styles.emptyText}>{t('orders.empty')}</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')} type="button">
            {t('orders.goToShop')}
          </button>
        </div>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => {
            const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

            return (
            <button
              key={order.id}
              className={styles.card}
              onClick={() => navigate(`/orders/${order.id}`)}
              type="button"
            >
              <div className={styles.cardTop}>
                <span className={styles.orderId}>#{order.id}</span>
                <span className={`${styles.status} ${styles[`status_${order.status}`] ?? ''}`}>
                  {statusLabel(order.status, t)}
                </span>
              </div>

              <div className={styles.metaList}>
                <div className={styles.metaRow}>
                  <MapPin size={14} strokeWidth={1.7} />
                  <span>{t('orders.city')}</span>
                  <span>{language === 'en' && order.city.nameEn ? order.city.nameEn : order.city.name}</span>
                </div>
                <div className={styles.metaRow}>
                  <Package size={14} strokeWidth={1.7} />
                  <span>{t('orders.itemCount')}</span>
                  <span>{t('cart.itemCount', { count: itemCount })}</span>
                </div>
                <div className={styles.metaRow}>
                  <CalendarDays size={14} strokeWidth={1.7} />
                  <span>{t('orders.createdAt')}</span>
                  <span>{new Date(order.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')}</span>
                </div>
              </div>

              <div className={styles.preview}>
                {order.items.slice(0, 2).map((item) => (
                  <span key={item.id} className={styles.previewLine}>
                    {item.productName} × {item.quantity} {getLocalizedUnit(item.unit, language)}
                  </span>
                ))}
                {order.items.length > 2 ? (
                  <span className={styles.more}>{t('orders.moreItems', { count: order.items.length - 2 })}</span>
                ) : null}
              </div>

              <div className={styles.cardBottom}>
                <span className={styles.total}>{formatCurrency(order.total, language)}</span>
                <ChevronRight size={16} strokeWidth={1.8} />
              </div>
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
