import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './OrdersPage.module.css';

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

export default function OrdersPage() {
  const { orders, ordersLoading, fetchOrders } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const language = i18n.language as Language;

  useEffect(() => {
    void fetchOrders();
  }, []);

  if (ordersLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('orders.title')}</h1>
      </div>

      {orders.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <p className={styles.emptyText}>{t('orders.empty')}</p>
          <button className={styles.shopBtn} onClick={() => navigate('/shop')}>
            {t('orders.goToShop')}
          </button>
        </div>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => (
            <div
              key={order.id}
              className={styles.card}
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <div className={styles.cardTop}>
                <span className={styles.orderId}>#{order.id}</span>
                <span className={`${styles.status} ${styles[`status_${order.status}`] ?? ''}`}>
                  {statusLabel(order.status, t)}
                </span>
              </div>
              <div className={styles.cardItems}>
                {order.items.slice(0, 3).map((item) => (
                  <span key={item.id} className={styles.itemName}>
                    {item.productName} × {item.quantity} {item.unit}
                  </span>
                ))}
                {order.items.length > 3 && (
                  <span className={styles.more}>
                    {t('orders.moreItems', { count: order.items.length - 3 })}
                  </span>
                )}
              </div>
              <div className={styles.cardBottom}>
                <span className={styles.date}>
                  {new Date(order.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')}
                </span>
                <span className={styles.total}>{formatCurrency(order.total, language)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
