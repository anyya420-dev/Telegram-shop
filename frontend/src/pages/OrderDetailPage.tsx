import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language, Order } from '../types';
import { api } from '../api/client';
import styles from './OrderDetailPage.module.css';

function statusLabel(status: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    pending: t('orders.statusPending'),
    confirmed: t('orders.statusConfirmed'),
    processing: t('orders.statusProcessing'),
    ready: t('orders.statusReady'),
    delivered: t('orders.statusDelivered'),
    cancelled: t('orders.statusCancelled'),
  };
  return map[status] ?? status;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orders, fetchOrders } = useApp();
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }
      const found = orders.find((o) => o.id === Number(id));
      if (found) { setOrder(found); setLoading(false); return; }
      await fetchOrders();
      setLoading(false);
    }
    void load();
  }, [id]);

  useEffect(() => {
    if (id && !loading) {
      const found = orders.find((o) => o.id === Number(id));
      if (found) setOrder(found);
    }
  }, [orders, id, loading]);

  async function handleCancel() {
    if (!order || cancelling) return;
    setCancelling(true);
    setActionError(null);
    try {
      const r = await api.cancelOrder(order.id);
      setOrder(r.order);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('orders.cancelFailed'));
    } finally {
      setCancelling(false);
    }
  }

  async function handleRefundRequest() {
    if (!order || refunding) return;
    setRefunding(true);
    setActionError(null);
    try {
      const r = await api.requestRefund(order.id);
      setOrder(r.order);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('orders.refundFailed'));
    } finally {
      setRefunding(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className={styles.notFound}>
        <p>{t('orders.notFound')}</p>
        <button onClick={() => navigate('/orders')}>{t('orders.back')}</button>
      </div>
    );
  }

  const canCancel = ['pending', 'confirmed'].includes(order.status);
  const canRefund = ['delivered', 'cancelled'].includes(order.status) && !order.refundStatus;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/orders')}>
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('orders.orderTitle', { id: order.id })}</h1>
      </div>

      <div className={styles.statusRow}>
        <span className={`${styles.status} ${styles[`status_${order.status}`] ?? ''}`}>
          {statusLabel(order.status, t)}
        </span>
        <span className={styles.date}>
          {new Date(order.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}
        </span>
      </div>

      {/* Status history */}
      {order.statusHistory && order.statusHistory.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('orders.statusHistory')}</h3>
          <div className={styles.historyList}>
            {order.statusHistory.map((entry) => (
              <div key={entry.id} className={styles.historyEntry}>
                <span className={`${styles.historyStatus} ${styles[`status_${entry.status}`] ?? ''}`}>
                  {statusLabel(entry.status, t)}
                </span>
                <span className={styles.historyDate}>
                  {new Date(entry.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}
                </span>
                {entry.comment && <span className={styles.historyComment}>{entry.comment}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('orders.items')}</h3>
        {order.items.map((item) => (
          <div key={item.id} className={styles.item}>
            <div className={styles.itemImg}>
              {item.productImage ? (
                <img src={item.productImage} alt={item.productName} />
              ) : (
                <span>📦</span>
              )}
            </div>
            <div className={styles.itemInfo}>
              <p className={styles.itemName}>{item.productName}</p>
              <p className={styles.itemQty}>{item.quantity} {item.unit} × {formatCurrency(item.price, language)}</p>
            </div>
            <p className={styles.itemTotal}>{formatCurrency(item.lineTotal, language)}</p>
          </div>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t('cart.items', { count: order.items.length })}</span>
          <span>{formatCurrency(order.subtotal, language)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className={styles.summaryRow}>
            <span>{t('cart.discount')}{order.discount ? ` (${order.discount.code})` : ''}</span>
            <span className={styles.discountValue}>−{formatCurrency(order.discountAmount, language)}</span>
          </div>
        )}
        {order.deliveryFee > 0 && (
          <div className={styles.summaryRow}>
            <span>{t('cart.delivery')}{order.deliveryOption ? ` — ${order.deliveryOption.name}` : ''}</span>
            <span>{formatCurrency(order.deliveryFee, language)}</span>
          </div>
        )}
        <div className={`${styles.summaryRow} ${styles.totalRow}`}>
          <span>{t('cart.orderTotal')}</span>
          <span>{formatCurrency(order.total, language)}</span>
        </div>
      </div>

      {order.comment && (
        <div className={styles.comment}>
          <p className={styles.commentLabel}>{t('orders.comment')}</p>
          <p className={styles.commentText}>{order.comment}</p>
        </div>
      )}

      {/* Refund status */}
      {order.refundStatus && (
        <div className={styles.refundBadge}>
          {t(`orders.refund_${order.refundStatus}`, { defaultValue: `Refund: ${order.refundStatus}` })}
        </div>
      )}

      {actionError && <p className={styles.actionError}>{actionError}</p>}

      {/* Action buttons */}
      {canCancel && (
        <button className={styles.cancelBtn} onClick={() => void handleCancel()} disabled={cancelling}>
          {cancelling ? t('orders.cancelling') : t('orders.cancelOrder')}
        </button>
      )}
      {canRefund && (
        <button className={styles.refundBtn} onClick={() => void handleRefundRequest()} disabled={refunding}>
          {refunding ? t('orders.requesting') : t('orders.requestRefund')}
        </button>
      )}
    </div>
  );
}
