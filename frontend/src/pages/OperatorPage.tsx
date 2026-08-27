import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Package, Truck } from 'lucide-react'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import { getLocalizedUnit } from '../lib/localized'
import { getTelegramContext } from '../lib/telegram'
import type { Language } from '../types'
import styles from './OperatorPage.module.css'

type OperatorOrderItem = {
  id: number
  productName: string
  productImage: string | null
  quantity: number
  unit: string
  lineTotal: number
}

type OperatorOrder = {
  id: number
  status: string
  subtotal: number
  discountAmount: number
  deliveryFee: number
  total: number
  comment: string | null
  createdAt: string
  operatorDeliveryPrice: number | null
  deliveryPriceConfirmed: boolean
  user: {
    id: number
    firstName: string
    username: string | null
    telegramId: string
  }
  city: {
    id: number
    name: string
    nameEn: string | null
  }
  items: OperatorOrderItem[]
  deliveryOption: {
    id: number
    name: string
    nameEn: string | null
    type: string
  } | null
}

type ApiErrorShape = {
  message?: string
}

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: 'Pending payment',
    payment_pending: 'Payment pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    ready: 'Ready',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }

  return map[status] ?? status
}

export default function OperatorPage() {
  const language = i18n.language as Language
  const telegram = useMemo(() => getTelegramContext(), [])

  const [pendingOrders, setPendingOrders] = useState<OperatorOrder[]>([])
  const [assignedOrders, setAssignedOrders] = useState<OperatorOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submittingOrderId, setSubmittingOrderId] = useState<number | null>(null)
  const [deliveryPrices, setDeliveryPrices] = useState<Record<number, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const request = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')

    if (telegram.initData) {
      headers.set('X-Telegram-Init-Data', telegram.initData)
    }

    const response = await fetch(`${API_BASE_URL}/api/operators${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ApiErrorShape
      throw new Error(payload.message ?? 'Request failed')
    }

    return response.json() as Promise<T>
  }, [telegram.initData])

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [pendingResponse, assignedResponse] = await Promise.all([
        request<{ orders: OperatorOrder[] }>('/pending'),
        request<{ orders: OperatorOrder[] }>('/'),
      ])

      setPendingOrders(pendingResponse.orders)
      setAssignedOrders(assignedResponse.orders)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load operator orders')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  async function acceptOrder(orderId: number) {
    try {
      setSubmittingOrderId(orderId)
      setError(null)
      setSuccessMessage(null)
      await request<{ order: OperatorOrder }>(`/orders/${orderId}/accept`, {
        method: 'POST',
      })
      await loadOrders()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to accept order')
    } finally {
      setSubmittingOrderId(null)
    }
  }

  async function confirmDeliveryPrice(orderId: number) {
    const rawValue = deliveryPrices[orderId] ?? ''
    const deliveryPrice = Number(rawValue)

    if (!Number.isFinite(deliveryPrice) || deliveryPrice < 0) {
      setError('Enter a valid non-negative delivery price')
      return
    }

    try {
      setSubmittingOrderId(orderId)
      setError(null)
      setSuccessMessage(null)
      await request<{ order: OperatorOrder; message: string }>(`/orders/${orderId}/delivery-price`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryPrice }),
      })
      setSuccessMessage(`Delivery price confirmed for order #${orderId}`)
      await loadOrders()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to update delivery price')
    } finally {
      setSubmittingOrderId(null)
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Operator panel</p>
          <h1 className={styles.title}>Orders</h1>
          <p className={styles.subtitle}>
            {telegram.user?.first_name ? `Signed in as ${telegram.user.first_name}` : 'Manage assigned delivery orders'}
          </p>
        </div>
      </div>

      {error ? (
        <div className={styles.noticeError}>
          <AlertCircle size={18} strokeWidth={1.8} />
          <span>{error}</span>
        </div>
      ) : null}

      {successMessage ? (
        <div className={styles.noticeSuccess}>
          <CheckCircle2 size={18} strokeWidth={1.8} />
          <span>{successMessage}</span>
        </div>
      ) : null}

      {!telegram.initData ? (
        <div className={styles.emptyState}>
          <AlertCircle size={22} strokeWidth={1.8} />
          <p>Open this page from Telegram WebApp to authenticate as an operator.</p>
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Truck size={18} strokeWidth={1.8} />
          <h2>Pending orders</h2>
        </div>

        {pendingOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No unassigned confirmed orders.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {pendingOrders.map((order) => (
              <article key={order.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>Order #{order.id}</h3>
                    <p>{order.user.firstName} • {language === 'en' && order.city.nameEn ? order.city.nameEn : order.city.name}</p>
                  </div>
                  <strong>{formatCurrency(order.total, language)}</strong>
                </div>

                <div className={styles.items}>
                  {order.items.map((item) => (
                    <div key={item.id} className={styles.itemRow}>
                      <span>{item.productName}</span>
                      <span>
                        {item.quantity} {getLocalizedUnit(item.unit, language)}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  className={styles.primaryButton}
                  disabled={submittingOrderId === order.id}
                  onClick={() => void acceptOrder(order.id)}
                  type="button"
                >
                  {submittingOrderId === order.id ? 'Accepting…' : 'Accept order'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Package size={18} strokeWidth={1.8} />
          <h2>My orders</h2>
        </div>

        {assignedOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No assigned orders yet.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {assignedOrders.map((order) => (
              <article key={order.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>Order #{order.id}</h3>
                    <p>{statusLabel(order.status)} • {order.user.firstName}</p>
                  </div>
                  <strong>{formatCurrency(order.total, language)}</strong>
                </div>

                <div className={styles.meta}>
                  <span>City: {language === 'en' && order.city.nameEn ? order.city.nameEn : order.city.name}</span>
                  <span>
                    Delivery: {order.deliveryOption?.name ?? 'Not selected'}
                  </span>
                  <span>
                    Confirmed: {order.deliveryPriceConfirmed ? 'Yes' : 'No'}
                  </span>
                </div>

                <div className={styles.items}>
                  {order.items.map((item) => (
                    <div key={item.id} className={styles.itemRow}>
                      <span>{item.productName}</span>
                      <span>{formatCurrency(item.lineTotal, language)}</span>
                    </div>
                  ))}
                </div>

                <div className={styles.priceSummary}>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(order.subtotal, language)}</strong>
                </div>

                {!order.deliveryPriceConfirmed && order.deliveryOption?.type === 'delivery' ? (
                  <div className={styles.deliveryForm}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setDeliveryPrices((current) => ({ ...current, [order.id]: event.target.value }))}
                      placeholder="Delivery price"
                      type="number"
                      value={deliveryPrices[order.id] ?? ''}
                    />
                    <button
                      className={styles.primaryButton}
                      disabled={submittingOrderId === order.id}
                      onClick={() => void confirmDeliveryPrice(order.id)}
                      type="button"
                    >
                      {submittingOrderId === order.id ? 'Saving…' : 'Confirm delivery price'}
                    </button>
                  </div>
                ) : (
                  <div className={styles.confirmedRow}>
                    <CheckCircle2 size={16} strokeWidth={1.8} />
                    <span>
                      Delivery price set to {formatCurrency(order.operatorDeliveryPrice ?? order.deliveryFee, language)}
                    </span>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
