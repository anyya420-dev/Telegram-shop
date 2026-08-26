import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { formatCurrency } from '../lib/format'
import i18n from '../lib/i18n'
import type { Language, Order } from '../types'
import styles from './OperatorPage.module.css'

const OPERATOR_STATUSES = [
  'waiting_for_delivery_price',
  'ready_for_payment',
  'payment_pending',
  'processing',
  'ready',
  'shipped',
  'delivered',
  'cancelled',
] as const

export default function OperatorPage() {
  const { user, setError } = useApp()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const language = i18n.language as Language

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        setLoading(true)
        const response = await api.getOperatorQueue()
        if (mounted) {
          setOrders(response.orders)
        }
      } catch (error) {
        if (mounted) {
          setError(error instanceof Error ? error.message : 'Failed to load operator orders')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [setError])

  const filteredOrders = useMemo(() => {
    if (!statusFilter) {
      return orders
    }
    return orders.filter((order) => order.status === statusFilter)
  }, [orders, statusFilter])

  async function handleConfirmDelivery(orderId: number) {
    const rawPrice = window.prompt('Delivery price (USDT):', '')
    if (rawPrice == null) return
    const deliveryPrice = Number(rawPrice)
    if (!Number.isFinite(deliveryPrice) || deliveryPrice < 0) {
      setError('Invalid delivery price')
      return
    }
    const reason = window.prompt('Reason:', 'Calculated by operator')
    if (!reason?.trim()) {
      setError('Reason is required')
      return
    }

    try {
      const response = await api.confirmOrderDeliveryPrice(orderId, { deliveryPrice, reason: reason.trim() })
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order : order)))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to confirm delivery price')
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Operator Panel</h1>
      <div className={styles.filterRow}>
        <select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {OPERATOR_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : (
        <div className={styles.list}>
          {filteredOrders.map((order) => (
            <div key={order.id} className={styles.card}>
              <div className={styles.row}>
                <strong>#{order.id}</strong>
                <span>{order.status}</span>
              </div>
              <p className={styles.meta}>{order.city.name} • {new Date(order.createdAt).toLocaleString()}</p>
              <p className={styles.meta}>Subtotal: {formatCurrency(order.subtotal, language)} • Delivery: {formatCurrency(order.deliveryFee ?? 0, language)}</p>
              <p className={styles.meta}>Total: {formatCurrency(order.total, language)}</p>
              {order.status === 'waiting_for_delivery_price' && (
                <button className={styles.button} onClick={() => void handleConfirmDelivery(order.id)}>
                  CONFIRM DELIVERY PRICE
                </button>
              )}
            </div>
          ))}
          {filteredOrders.length === 0 && <p className={styles.loading}>No orders</p>}
        </div>
      )}
      {user?.role ? <p className={styles.meta}>Role: {user.role}</p> : null}
    </div>
  )
}
