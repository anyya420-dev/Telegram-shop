import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { AdminStats, Category, Order, SupportTicket, Discount, PaymentMethod, UserProfile } from '../types';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { Language } from '../types';
import styles from './AdminPage.module.css';

type Tab = 'stats' | 'orders' | 'products' | 'users' | 'categories' | 'discounts' | 'support' | 'audit' | 'payments';

type AdminProduct = {
  id: number;
  name: string;
  nameEn: string | null;
  description: string;
  price: number;
  isActive: boolean;
  isRecommended: boolean;
  image: string | null;
  category: { name: string };
  productCities: { id: number; cityId: number; stock: number; isAvailable: boolean; city: { name: string } }[];
};

type AdminCategory = Category & { nameEn?: string | null; _count: { products: number } };

const ORDER_STATUSES = ['pending', 'payment_pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'];

export default function AdminPage() {
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState('');
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New discount form
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState('percent');
  const [newValue, setNewValue] = useState('');
  const [newMin, setNewMin] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPaymentType, setNewPaymentType] = useState<PaymentMethod['type']>('card');
  const [newPaymentTitle, setNewPaymentTitle] = useState('');
  const [newPaymentCurrency, setNewPaymentCurrency] = useState('');
  const [newPaymentNetwork, setNewPaymentNetwork] = useState('');
  const [newPaymentWalletAddress, setNewPaymentWalletAddress] = useState('');
  const [newPaymentCardNumber, setNewPaymentCardNumber] = useState('');
  const [newPaymentCardholderName, setNewPaymentCardholderName] = useState('');

  // New category form
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [newCatOrder, setNewCatOrder] = useState('0');
  const [creatingCat, setCreatingCat] = useState(false);

  // Support reply
  const [replyText, setReplyText] = useState<Record<number, string>>({});

  // Status update
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);

  // Product edit
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [productEdits, setProductEdits] = useState<Record<number, Partial<{ name: string; price: string; isActive: boolean; isRecommended: boolean }>>>({});
  const [editingProductCity, setEditingProductCity] = useState<number | null>(null);
  const [productCityEdits, setProductCityEdits] = useState<Record<number, Partial<{ stock: string; isAvailable: boolean }>>>({});

  // Category edit
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [catEdits, setCatEdits] = useState<Record<number, Partial<{ name: string; nameEn: string; isActive: boolean; sortOrder: string }>>>({});

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await api.adminStatus();
        if (!mounted) return;
        setAuthenticated(true);
      } catch {
        if (!mounted) return;
        setAuthenticated(false);
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void loadTab(tab);
  }, [authenticated, tab]);

  async function loadTab(tabName: Tab) {
    setError(null);
    try {
      if (tabName === 'stats') {
        const r = await api.getAdminStats();
        setStats(r);
      } else if (tabName === 'orders') {
        setOrdersLoading(true);
        const r = await api.getAdminOrders(1, orderFilter || undefined);
        setOrders(r.orders);
        setOrdersLoading(false);
      } else if (tabName === 'products') {
        const r = await api.getAdminProducts() as unknown as { products: AdminProduct[] };
        setProducts(r.products);
      } else if (tabName === 'users') {
        const r = await api.getAdminUsers(1);
        setUsers(r.users);
      } else if (tabName === 'categories') {
        const r = await api.getAdminCategories();
        setCategories(r.categories);
      } else if (tabName === 'discounts') {
        const r = await api.getAdminDiscounts();
        setDiscounts(r.discounts);
      } else if (tabName === 'support') {
        const r = await api.getAdminSupportTickets();
        setTickets(r.tickets);
      } else if (tabName === 'audit') {
        const r = await api.getAuditLogs();
        setAuditLogs(r.logs);
      } else if (tabName === 'payments') {
        const r = await api.getAdminPaymentSettings();
        setPaymentMethods(r.methods);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error loading data');
      if (tab === 'orders') setOrdersLoading(false);
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

  async function handleSaveProduct(productId: number) {
    const edits = productEdits[productId];
    if (!edits) return;
    try {
      const data: Parameters<typeof api.updateAdminProduct>[1] = {};
      if (typeof edits.name === 'string') data.name = edits.name;
      if (typeof edits.price === 'string' && edits.price) data.price = Number(edits.price);
      if (typeof edits.isActive === 'boolean') data.isActive = edits.isActive;
      if (typeof edits.isRecommended === 'boolean') data.isRecommended = edits.isRecommended;
      await api.updateAdminProduct(productId, data);
      setEditingProduct(null);
      const r = await api.getAdminProducts() as unknown as { products: AdminProduct[] };
      setProducts(r.products);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update product');
    }
  }

  async function handleSaveProductCity(pcId: number) {
    const edits = productCityEdits[pcId];
    if (!edits) return;
    try {
      const data: { stock?: number; isAvailable?: boolean } = {};
      if (typeof edits.stock === 'string' && edits.stock !== '') data.stock = Number(edits.stock);
      if (typeof edits.isAvailable === 'boolean') data.isAvailable = edits.isAvailable;
      await api.updateProductCity(pcId, data);
      setEditingProductCity(null);
      const r = await api.getAdminProducts() as unknown as { products: AdminProduct[] };
      setProducts(r.products);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update stock');
    }
  }

  async function handleCreateCategory() {
    if (creatingCat || !newCatName.trim()) return;
    setCreatingCat(true);
    try {
      const r = await api.createAdminCategory({
        name: newCatName.trim(),
        nameEn: newCatNameEn.trim() || undefined,
        sortOrder: Number(newCatOrder) || 0,
      });
      setCategories((prev) => [...prev, r.category]);
      setNewCatName(''); setNewCatNameEn(''); setNewCatOrder('0');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create category');
    } finally {
      setCreatingCat(false);
    }
  }

  async function handleSaveCategory(catId: number) {
    const edits = catEdits[catId];
    if (!edits) return;
    try {
      const data: Parameters<typeof api.updateAdminCategory>[1] = {};
      if (typeof edits.name === 'string') data.name = edits.name;
      if (typeof edits.nameEn === 'string') data.nameEn = edits.nameEn;
      if (typeof edits.isActive === 'boolean') data.isActive = edits.isActive;
      if (typeof edits.sortOrder === 'string') data.sortOrder = Number(edits.sortOrder);
      const r = await api.updateAdminCategory(catId, data);
      setCategories((prev) => prev.map((c) => (c.id === catId ? r.category : c)));
      setEditingCat(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update category');
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

  async function handleCreatePaymentMethod() {
    if (!newPaymentTitle.trim()) return;
    try {
      const payload = {
        type: newPaymentType,
        title: newPaymentTitle.trim(),
        currency: newPaymentCurrency.trim() || undefined,
        network: newPaymentNetwork.trim() || undefined,
        walletAddress: newPaymentWalletAddress.trim() || undefined,
        cardNumber: newPaymentCardNumber.trim() || undefined,
        cardholderName: newPaymentCardholderName.trim() || undefined,
      };
      const r = await api.createAdminPaymentSetting(payload);
      setPaymentMethods((prev) => [...prev, r.method]);
      setNewPaymentTitle('');
      setNewPaymentCurrency('');
      setNewPaymentNetwork('');
      setNewPaymentWalletAddress('');
      setNewPaymentCardNumber('');
      setNewPaymentCardholderName('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create payment method');
    }
  }

  async function handleTogglePaymentMethod(id: number) {
    try {
      const r = await api.toggleAdminPaymentSetting(id);
      setPaymentMethods((prev) => prev.map((method) => (method.id === id ? r.method : method)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to toggle payment method');
    }
  }

  async function handleDeletePaymentMethod(id: number) {
    try {
      await api.deleteAdminPaymentSetting(id);
      setPaymentMethods((prev) => prev.filter((method) => method.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete payment method');
    }
  }

  async function handleConfirmPendingPayment(orderId: number) {
    try {
      const r = await api.confirmAdminOrderPayment(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? r.order : o)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to confirm payment');
    }
  }

  async function handleRejectPendingPayment(orderId: number) {
    try {
      const r = await api.rejectAdminOrderPayment(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? r.order : o)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reject payment');
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

  async function handleLogin() {
    if (!password || authLoading) return;
    setError(null);
    setAuthLoading(true);
    try {
      await api.adminLogin({ password });
      setAuthenticated(true);
      setPassword('');
      await loadTab(tab);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setError(null);
    try {
      await api.adminLogout();
    } finally {
      setAuthenticated(false);
    }
  }

  if (!authChecked) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>⚙️ Admin Panel</h1>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>⚙️ Admin Panel</h1>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.form}>
          <h3 className={styles.formTitle}>{t('admin.login', { defaultValue: 'Admin login' })}</h3>
          <input
            className={styles.input}
            type="password"
            placeholder={t('admin.password', { defaultValue: 'Password' })}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
          />
          <button className={styles.createBtn} onClick={() => void handleLogin()} disabled={authLoading || !password}>
            {authLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('common.login', { defaultValue: 'Login' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>⚙️ Admin Panel</h1>
      <div className={styles.filterRow}>
        <button className={styles.filterBtn} onClick={() => void handleLogout()}>
          {t('common.logout', { defaultValue: 'Logout' })}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tabs}>
        {(['stats', 'orders', 'products', 'users', 'categories', 'discounts', 'support', 'audit', 'payments'] as Tab[]).map((tabName) => (
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
                  {order.paymentMethod && (
                    <p className={styles.orderMeta}>
                      {t('checkout.paymentMethod')}: {order.paymentMethod.title}
                      {order.paymentStatus ? ` • ${order.paymentStatus}` : ''}
                    </p>
                  )}
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
                  {order.status === 'payment_pending' && order.paymentStatus === 'pending' && (
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleConfirmPendingPayment(order.id)}>
                        {t('admin.confirmPayment', { defaultValue: 'Confirm payment' })}
                      </button>
                      <button className={styles.replyBtn} onClick={() => void handleRejectPendingPayment(order.id)}>
                        {t('admin.rejectPayment', { defaultValue: 'Reject payment' })}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'products' && (
        <div>
          <div className={styles.filterRow}>
            <button className={styles.filterBtn} onClick={() => void loadTab('products')}>
              {t('admin.refresh', { defaultValue: 'Refresh' })}
            </button>
          </div>
          <div className={styles.orderList}>
            {products.map((product) => (
              <div key={product.id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <span className={styles.orderId}>#{product.id} {product.name}</span>
                  <span className={`${styles.refundTag} ${product.isActive ? styles.tagActive : styles.tagInactive}`}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className={styles.orderMeta}>
                  {product.category.name} • {formatCurrency(product.price, language)}
                  {product.isRecommended ? ' ⭐' : ''}
                </p>

                {editingProduct === product.id ? (
                  <div className={styles.form}>
                    <div className={styles.formRow}>
                      <input
                        className={styles.input}
                        placeholder="Name"
                        value={productEdits[product.id]?.name ?? product.name}
                        onChange={(e) => setProductEdits((prev) => ({ ...prev, [product.id]: { ...prev[product.id], name: e.target.value } }))}
                      />
                      <input
                        className={styles.input}
                        type="number"
                        placeholder="Price"
                        value={productEdits[product.id]?.price ?? String(product.price)}
                        onChange={(e) => setProductEdits((prev) => ({ ...prev, [product.id]: { ...prev[product.id], price: e.target.value } }))}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={productEdits[product.id]?.isActive ?? product.isActive}
                          onChange={(e) => setProductEdits((prev) => ({ ...prev, [product.id]: { ...prev[product.id], isActive: e.target.checked } }))}
                        />
                        {' Active'}
                      </label>
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={productEdits[product.id]?.isRecommended ?? product.isRecommended}
                          onChange={(e) => setProductEdits((prev) => ({ ...prev, [product.id]: { ...prev[product.id], isRecommended: e.target.checked } }))}
                        />
                        {' Recommended'}
                      </label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveProduct(product.id)}>Save</button>
                      <button className={styles.replyBtn} onClick={() => setEditingProduct(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.replyRow}>
                    <button className={styles.replyBtn} onClick={() => { setEditingProduct(product.id); setProductEdits((prev) => ({ ...prev, [product.id]: {} })); }}>
                      {t('admin.editProduct', { defaultValue: 'Edit' })}
                    </button>
                  </div>
                )}

                {product.productCities.length > 0 && (
                  <div className={styles.cityStockList}>
                    {product.productCities.map((pc) => (
                      <div key={pc.id} className={styles.cityStockRow}>
                        <span className={styles.cityName}>{pc.city.name}</span>
                        {editingProductCity === pc.id ? (
                          <>
                            <input
                              className={styles.inputSmall}
                              type="number"
                              placeholder="Stock"
                              value={productCityEdits[pc.id]?.stock ?? String(pc.stock)}
                              onChange={(e) => setProductCityEdits((prev) => ({ ...prev, [pc.id]: { ...prev[pc.id], stock: e.target.value } }))}
                            />
                            <label className={styles.checkLabel}>
                              <input
                                type="checkbox"
                                checked={productCityEdits[pc.id]?.isAvailable ?? pc.isAvailable}
                                onChange={(e) => setProductCityEdits((prev) => ({ ...prev, [pc.id]: { ...prev[pc.id], isAvailable: e.target.checked } }))}
                              />
                              {' Available'}
                            </label>
                            <button className={styles.replyBtn} onClick={() => void handleSaveProductCity(pc.id)}>Save</button>
                            <button className={styles.replyBtn} onClick={() => setEditingProductCity(null)}>✕</button>
                          </>
                        ) : (
                          <>
                            <span>Stock: {pc.stock} • {pc.isAvailable ? '✓ Available' : '✗ Unavailable'}</span>
                            <button className={styles.replyBtn} onClick={() => { setEditingProductCity(pc.id); setProductCityEdits((prev) => ({ ...prev, [pc.id]: {} })); }}>Edit stock</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {products.length === 0 && <p className={styles.loading}>{t('admin.noProducts', { defaultValue: 'No products found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className={styles.filterRow}>
            <button className={styles.filterBtn} onClick={() => void loadTab('users')}>
              {t('admin.refresh', { defaultValue: 'Refresh' })}
            </button>
          </div>
          <div className={styles.orderList}>
            {users.map((user) => (
              <div key={user.id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <span className={styles.orderId}>
                    {user.firstName}{user.username ? ` @${user.username}` : ''}
                  </span>
                  <span className={styles.orderMeta}>ID: {user.telegramId}</span>
                </div>
                {user.selectedCity && (
                  <p className={styles.orderMeta}>📍 {user.selectedCity.name}</p>
                )}
              <p className={styles.orderMeta}>
                  {t('admin.telegramId', { defaultValue: 'Telegram ID' })}: {user.telegramId}
                  {user.language ? ` • ${user.language.toUpperCase()}` : ''}
                </p>
              </div>
            ))}
            {users.length === 0 && <p className={styles.loading}>{t('admin.noUsers', { defaultValue: 'No users found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createCategory', { defaultValue: 'Create category' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Name (RU)" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
              <input className={styles.input} placeholder="Name (EN)" value={newCatNameEn} onChange={(e) => setNewCatNameEn(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Sort order" value={newCatOrder} onChange={(e) => setNewCatOrder(e.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateCategory()} disabled={creatingCat || !newCatName.trim()}>
              {creatingCat ? 'Creating...' : t('admin.createCategory', { defaultValue: 'Create' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {categories.map((cat) => (
              <div key={cat.id} className={styles.discountCard}>
                {editingCat === cat.id ? (
                  <div className={styles.form}>
                    <div className={styles.formRow}>
                      <input
                        className={styles.input}
                        placeholder="Name (RU)"
                        value={catEdits[cat.id]?.name ?? cat.name}
                        onChange={(e) => setCatEdits((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], name: e.target.value } }))}
                      />
                      <input
                        className={styles.input}
                        placeholder="Name (EN)"
                        value={catEdits[cat.id]?.nameEn ?? (cat.nameEn ?? '')}
                        onChange={(e) => setCatEdits((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], nameEn: e.target.value } }))}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <input
                        className={styles.input}
                        type="number"
                        placeholder="Sort order"
                        value={catEdits[cat.id]?.sortOrder ?? String(cat.sortOrder ?? 0)}
                        onChange={(e) => setCatEdits((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], sortOrder: e.target.value } }))}
                      />
                      <label className={styles.checkLabel}>
                        <input
                          type="checkbox"
                          checked={catEdits[cat.id]?.isActive ?? cat.isActive}
                          onChange={(e) => setCatEdits((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], isActive: e.target.checked } }))}
                        />
                        {' Active'}
                      </label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveCategory(cat.id)}>Save</button>
                      <button className={styles.replyBtn} onClick={() => setEditingCat(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={styles.discountCode}>{cat.name}</span>
                      {cat.nameEn && <span> / {cat.nameEn}</span>}
                      <span className={`${styles.refundTag} ${cat.isActive ? styles.tagActive : styles.tagInactive}`}>
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={styles.orderMeta}> • {cat._count.products} products</span>
                    </div>
                    <button className={styles.replyBtn} onClick={() => { setEditingCat(cat.id); setCatEdits((prev) => ({ ...prev, [cat.id]: {} })); }}>Edit</button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className={styles.loading}>{t('admin.noCategories', { defaultValue: 'No categories found.' })}</p>}
          </div>
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

      {tab === 'payments' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.paymentSettings', { defaultValue: 'Payment settings' })}</h3>
            <div className={styles.formRow}>
              <select className={styles.select} value={newPaymentType} onChange={(e) => setNewPaymentType(e.target.value as PaymentMethod['type'])}>
                <option value="card">Card</option>
                <option value="ton">TON</option>
                <option value="crypto">Crypto</option>
              </select>
              <input className={styles.input} placeholder={t('admin.methodTitle', { defaultValue: 'Title' })} value={newPaymentTitle} onChange={(e) => setNewPaymentTitle(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.currency', { defaultValue: 'Currency' })} value={newPaymentCurrency} onChange={(e) => setNewPaymentCurrency(e.target.value)} />
              <input className={styles.input} placeholder={t('checkout.network', { defaultValue: 'Network' })} value={newPaymentNetwork} onChange={(e) => setNewPaymentNetwork(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.walletAddress', { defaultValue: 'Wallet address' })} value={newPaymentWalletAddress} onChange={(e) => setNewPaymentWalletAddress(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.cardNumber', { defaultValue: 'Card number' })} value={newPaymentCardNumber} onChange={(e) => setNewPaymentCardNumber(e.target.value)} />
              <input className={styles.input} placeholder={t('checkout.cardholder', { defaultValue: 'Cardholder (optional)' })} value={newPaymentCardholderName} onChange={(e) => setNewPaymentCardholderName(e.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreatePaymentMethod()} disabled={!newPaymentTitle.trim()}>
              {t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {paymentMethods.map((method) => (
              <div key={method.id} className={styles.discountCard}>
                <div>
                  <div className={styles.discountCode}>{method.title}</div>
                  <div>{method.type.toUpperCase()} {method.currency ? `• ${method.currency}` : ''} {method.network ? `• ${method.network}` : ''}</div>
                </div>
                <div className={styles.replyRow}>
                  <button className={styles.replyBtn} onClick={() => void handleTogglePaymentMethod(method.id)}>
                    {method.isEnabled ? t('admin.disable', { defaultValue: 'Disable' }) : t('admin.enable', { defaultValue: 'Enable' })}
                  </button>
                  <button className={styles.replyBtn} onClick={() => void handleDeletePaymentMethod(method.id)}>
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

