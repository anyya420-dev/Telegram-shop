import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { AdminStats, Order, SupportTicket, Discount } from '../types';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './AdminPage.module.css';

type Tab = 'stats' | 'orders' | 'discounts' | 'support' | 'audit';

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'];

export default function AdminPage() {
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState('');
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New discount form
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState('percent');
  const [newValue, setNewValue] = useState('');
  const [newMin, setNewMin] = useState('');
  const [creating, setCreating] = useState(false);

  // Support reply
  const [replyText, setReplyText] = useState<Record<number, string>>({});

  // Status update
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);

  useEffect(() => {
    void loadTab(tab);
  }, [tab]);

  async function loadTab(t: Tab) {
    setError(null);
    try {
      if (t === 'stats') {
        const r = await api.getAdminStats();
        setStats(r);
      } else if (t === 'orders') {
        setOrdersLoading(true);
        const r = await api.getAdminOrders(1, orderFilter || undefined);
        setOrders(r.orders);
        setOrdersLoading(false);
      } else if (t === 'discounts') {
        const r = await api.getAdminDiscounts();
        setDiscounts(r.discounts);
      } else if (t === 'support') {
        const r = await api.getAdminSupportTickets();
        setTickets(r.tickets);
      } else if (t === 'audit') {
        const r = await api.getAuditLogs();
        setAuditLogs(r.logs);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    }
  }

  async function handleStatusChange(orderId: number, status: string) {
    setUpdatingOrder(orderId);
    try {
      const r = await api.updateAdminOrderStatus(orderId, status);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? r.order : o)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setUpdatingOrder(null);
    }
  }

  async function handleCreateDiscount() {
    if (creating || !newCode || !newValue) return;
    setCreating(true);
    try {
      const r = await api.createAdminDiscount({
        code: newCode,
        type: newType,
        value: Number(newValue),
        minOrderAmount: newMin ? Number(newMin) : 0,
      });
      setDiscounts((prev) => [r.discount, ...prev]);
      setNewCode(''); setNewValue(''); setNewMin('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create discount');
    } finally {
      setCreating(false);
    }
  }

  async function handleAdminReply(ticketId: number) {
    const msg = replyText[ticketId]?.trim();
    if (!msg) return;
    try {
      const r = await api.adminReplySupportTicket(ticketId, msg);
      setTickets((prev) => prev.map((tk) => (tk.id === ticketId ? r.ticket : tk)));
      setReplyText((prev) => ({ ...prev, [ticketId]: '' }));
    } catch {
      // ignore
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>⚙️ Admin Panel</h1>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tabs}>
        {(['stats', 'orders', 'discounts', 'support', 'audit'] as Tab[]).map((tabName) => (
          <button
            key={tabName}
            className={`${styles.tab} ${tab === tabName ? styles.tabActive : ''}`}
            onClick={() => setTab(tabName)}
          >
            {t(`admin.tab_${tabName}`, { defaultValue: tabName })}
          </button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className={styles.stats}>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.totalOrders}</span><span>{t('admin.totalOrders', { defaultValue: 'Total Orders' })}</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.pendingOrders}</span><span>{t('admin.pendingOrders', { defaultValue: 'Pending' })}</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.totalUsers}</span><span>{t('admin.totalUsers', { defaultValue: 'Users' })}</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{formatCurrency(stats.totalRevenue, language)}</span><span>{t('admin.revenue', { defaultValue: 'Revenue' })}</span></div>
        </div>
      )}

      {tab === 'orders' && (
        <div>
          <div className={styles.filterRow}>
            <select className={styles.filterSelect} value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
              <option value="">{t('admin.allStatuses', { defaultValue: 'All statuses' })}</option>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className={styles.filterBtn} onClick={() => void loadTab('orders')}>
              {t('admin.filter', { defaultValue: 'Filter' })}
            </button>
          </div>
          {ordersLoading ? <p className={styles.loading}>Loading...</p> : (
            <div className={styles.orderList}>
              {orders.map((order) => (
                <div key={order.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>#{order.id}</span>
                    <span className={styles.orderTotal}>{formatCurrency(order.total, language)}</span>
                  </div>
                  <p className={styles.orderMeta}>{new Date(order.createdAt).toLocaleString()} • {order.items.length} items</p>
                  <div className={styles.statusRow}>
                    <select
                      className={styles.statusSelect}
                      value={order.status}
                      onChange={(e) => void handleStatusChange(order.id, e.target.value)}
                      disabled={updatingOrder === order.id}
                    >
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {order.refundStatus && (
                      <span className={styles.refundTag}>Refund: {order.refundStatus}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'discounts' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createDiscount', { defaultValue: 'Create discount code' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Code" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} />
              <select className={styles.select} value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="percent">%</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              <input className={styles.input} type="number" placeholder="Min order" value={newMin} onChange={(e) => setNewMin(e.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateDiscount()} disabled={creating || !newCode || !newValue}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
          <div className={styles.discountList}>
            {discounts.map((d) => (
              <div key={d.id} className={styles.discountCard}>
                <span className={styles.discountCode}>{d.code}</span>
                <span>{d.value}{d.type === 'percent' ? '%' : ' fix'}</span>
                <span>{t('admin.minOrder', { defaultValue: 'Min' })}: {d.minOrderAmount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className={styles.ticketList}>
          {tickets.map((ticket) => (
            <div key={ticket.id} className={styles.ticketCard}>
              <div className={styles.ticketHeader}>
                <span className={styles.ticketSubject}>{ticket.subject}</span>
                <span className={styles.ticketStatus}>{ticket.status}</span>
              </div>
              <p className={styles.ticketMsg}>{ticket.message}</p>
              {ticket.replies.map((r) => (
                <div key={r.id} className={`${styles.reply} ${r.isAdmin ? styles.replyAdmin : styles.replyUser}`}>
                  <strong>{r.isAdmin ? 'Admin' : 'User'}</strong>: {r.message}
                </div>
              ))}
              <div className={styles.replyRow}>
                <input
                  className={styles.input}
                  placeholder="Reply..."
                  value={replyText[ticket.id] ?? ''}
                  onChange={(e) => setReplyText((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                />
                <button className={styles.replyBtn} onClick={() => void handleAdminReply(ticket.id)}>
                  Send
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className={styles.auditList}>
          {auditLogs.map((log) => (
            <div key={log.id} className={styles.auditRow}>
              <span className={styles.auditAction}>{log.action}</span>
              {log.entity && <span className={styles.auditEntity}>{log.entity}#{log.entityId}</span>}
              {log.meta && <span className={styles.auditMeta}>{log.meta}</span>}
              <span className={styles.auditDate}>{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
