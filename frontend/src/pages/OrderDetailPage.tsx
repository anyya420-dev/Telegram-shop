import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language, Order } from '../types';
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

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }

      // Try to find in already-loaded orders first
      const found = orders.find((o) => o.id === Number(id));
      if (found) {
        setOrder(found);
        setLoading(false);
        return;
      }

      // Otherwise fetch all orders to find it
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
    </div>
  );
}
