import { useEffect, useMemo, useState } from 'react';
import { Check, MapPin, Settings, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatCurrency } from '../lib/format';
import i18n from '../lib/i18n';
import type { AdminStats, Category, City, Discount, Language, Order, PaymentMethod, SupportTicket, UserProfile } from '../types';
import styles from './AdminPage.module.css';

type Tab = 'stats' | 'orders' | 'products' | 'users' | 'cities' | 'categories' | 'discounts' | 'support' | 'audit' | 'payments';

type AdminOrder = Order & {
  user?: {
    id: number;
    firstName: string;
    username: string | null;
    telegramId: string;
  };
};

type AdminCity = City & {
  nameEn?: string | null;
  sortOrder: number;
  _count?: {
    users: number;
    productCities: number;
    orders: number;
  };
};

type AdminCategory = Category & {
  nameEn?: string | null;
  _count: {
    products: number;
  };
};

type AdminProductCity = {
  id: number;
  cityId: number;
  stock: number;
  isAvailable: boolean;
  minimumQuantity: number;
  quantityStep: number;
  maximumQuantity: number;
  unit: string;
  city: {
    id?: number;
    name: string;
  };
};

type AdminProduct = {
  id: number;
  name: string;
  nameEn: string | null;
  description: string;
  descriptionEn: string | null;
  price: number;
  isActive: boolean;
  isRecommended: boolean;
  image: string | null;
  categoryId: number;
  category: {
    id?: number;
    name: string;
  };
  productCities: AdminProductCity[];
};

type ProductCityDraft = {
  cityId: string;
  stock: string;
  isAvailable: boolean;
  minimumQuantity: string;
  quantityStep: string;
  maximumQuantity: string;
  unit: string;
};

type ProductEditDraft = Partial<{
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  price: string;
  image: string;
  categoryId: string;
  isActive: boolean;
  isRecommended: boolean;
}>;

type ProductCityEditDraft = Partial<{
  stock: string;
  isAvailable: boolean;
  minimumQuantity: string;
  quantityStep: string;
  maximumQuantity: string;
  unit: string;
}>;

type CategoryEditDraft = Partial<{
  name: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: string;
}>;

type CityEditDraft = Partial<{
  name: string;
  nameEn: string;
  isActive: boolean;
  sortOrder: string;
}>;

const ORDER_STATUSES = ['pending', 'payment_pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'];

function createDefaultProductCityDraft(cityId = ''): ProductCityDraft {
  return {
    cityId,
    stock: '0',
    isAvailable: true,
    minimumQuantity: '1',
    quantityStep: '1',
    maximumQuantity: '1',
    unit: 'шт.',
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function parseNonNegativeNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(label);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(label);
  }
  return parsed;
}

function buildProductCityPayload(draft: ProductCityDraft) {
  const cityId = Number(draft.cityId);
  if (!Number.isInteger(cityId) || cityId <= 0) {
    throw new Error('Choose a valid city');
  }

  const stock = parseNonNegativeNumber(draft.stock, 'Stock must be zero or greater');
  const minimumQuantity = parsePositiveInteger(draft.minimumQuantity, 'Minimum quantity must be a positive integer');
  const quantityStep = parsePositiveInteger(draft.quantityStep, 'Quantity step must be a positive integer');
  const maximumQuantity = parsePositiveInteger(draft.maximumQuantity, 'Maximum quantity must be a positive integer');
  const unit = draft.unit.trim();

  if (!unit) {
    throw new Error('Unit is required');
  }
  if (maximumQuantity < minimumQuantity) {
    throw new Error('Maximum quantity must be greater than or equal to minimum quantity');
  }
  if ((maximumQuantity - minimumQuantity) % quantityStep !== 0) {
    throw new Error('Quantity step must match the minimum and maximum quantity range');
  }
  if (stock > 0 && minimumQuantity > stock) {
    throw new Error('Minimum quantity cannot exceed stock');
  }
  if (stock > 0 && maximumQuantity > stock) {
    throw new Error('Maximum quantity cannot exceed stock');
  }

  return {
    cityId,
    stock,
    isAvailable: draft.isAvailable,
    minimumQuantity,
    quantityStep,
    maximumQuantity,
    unit,
  };
}

export default function AdminPage() {
  const { t } = useTranslation();
  const language = i18n.language as Language;
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [cities, setCities] = useState<AdminCity[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ id: number; action: string; entity: string | null; entityId: number | null; meta: string | null; createdAt: string }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState('percent');
  const [newValue, setNewValue] = useState('');
  const [newMin, setNewMin] = useState('');
  const [creatingDiscount, setCreatingDiscount] = useState(false);

  const [newPaymentType, setNewPaymentType] = useState<PaymentMethod['type']>('card');
  const [newPaymentTitle, setNewPaymentTitle] = useState('');
  const [newPaymentCurrency, setNewPaymentCurrency] = useState('');
  const [newPaymentNetwork, setNewPaymentNetwork] = useState('');
  const [newPaymentWalletAddress, setNewPaymentWalletAddress] = useState('');
  const [newPaymentCardNumber, setNewPaymentCardNumber] = useState('');
  const [newPaymentCardholderName, setNewPaymentCardholderName] = useState('');

  const [newCityName, setNewCityName] = useState('');
  const [newCityNameEn, setNewCityNameEn] = useState('');
  const [newCitySortOrder, setNewCitySortOrder] = useState('0');
  const [newCityIsActive, setNewCityIsActive] = useState(true);
  const [creatingCity, setCreatingCity] = useState(false);
  const [editingCity, setEditingCity] = useState<number | null>(null);
  const [cityEdits, setCityEdits] = useState<Record<number, CityEditDraft>>({});

  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [newCatOrder, setNewCatOrder] = useState('0');
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [catEdits, setCatEdits] = useState<Record<number, CategoryEditDraft>>({});

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdNameEn, setNewProdNameEn] = useState('');
  const [newProdDescription, setNewProdDescription] = useState('');
  const [newProdDescriptionEn, setNewProdDescriptionEn] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdCategoryId, setNewProdCategoryId] = useState('');
  const [newProdImage, setNewProdImage] = useState('');
  const [newProdIsActive, setNewProdIsActive] = useState(true);
  const [newProdIsRecommended, setNewProdIsRecommended] = useState(false);
  const [newProdCities, setNewProdCities] = useState<Record<number, ProductCityDraft>>({});
  const [creatingProd, setCreatingProd] = useState(false);
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [productEdits, setProductEdits] = useState<Record<number, ProductEditDraft>>({});
  const [editingProductCity, setEditingProductCity] = useState<number | null>(null);
  const [productCityEdits, setProductCityEdits] = useState<Record<number, ProductCityEditDraft>>({});
  const [newProductCityDrafts, setNewProductCityDrafts] = useState<Record<number, ProductCityDraft>>({});

  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);

  const tabs = useMemo(
    () => ['stats', 'orders', 'products', 'users', 'cities', 'categories', 'discounts', 'support', 'audit', 'payments'] as Tab[],
    [],
  );

  async function refreshCities() {
    const response = await api.getAdminCities();
    setCities(response.cities as AdminCity[]);
    return response.cities as AdminCity[];
  }

  async function refreshCategories() {
    const response = await api.getAdminCategories();
    setCategories(response.categories);
    return response.categories;
  }

  async function refreshProducts() {
    const response = await api.getAdminProducts() as unknown as { products: AdminProduct[] };
    setProducts(response.products);
    return response.products;
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await api.adminStatus();
        if (mounted) {
          setAuthenticated(true);
        }
      } catch {
        if (mounted) {
          setAuthenticated(false);
        }
      } finally {
        if (mounted) {
          setAuthChecked(true);
        }
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

  useEffect(() => {
    if (!authenticated) return;
    void (async () => {
      try {
        await Promise.all([refreshCities(), refreshCategories()]);
      } catch {
        // data will be loaded again per-tab
      }
    })();
  }, [authenticated]);

  async function loadTab(tabName: Tab) {
    setError(null);
    if (tabName === 'orders') {
      setOrdersLoading(true);
    }

    try {
      if (tabName === 'stats') {
        setStats(await api.getAdminStats());
      } else if (tabName === 'orders') {
        const response = await api.getAdminOrders(1, orderFilter || undefined);
        setOrders(response.orders as AdminOrder[]);
      } else if (tabName === 'products') {
        await Promise.all([refreshProducts(), categories.length === 0 ? refreshCategories() : Promise.resolve(categories), cities.length === 0 ? refreshCities() : Promise.resolve(cities)]);
      } else if (tabName === 'users') {
        const response = await api.getAdminUsers(1);
        setUsers(response.users);
      } else if (tabName === 'cities') {
        await refreshCities();
      } else if (tabName === 'categories') {
        await refreshCategories();
      } else if (tabName === 'discounts') {
        const response = await api.getAdminDiscounts();
        setDiscounts(response.discounts);
      } else if (tabName === 'support') {
        const response = await api.getAdminSupportTickets();
        setTickets(response.tickets);
      } else if (tabName === 'audit') {
        const response = await api.getAuditLogs();
        setAuditLogs(response.logs);
      } else if (tabName === 'payments') {
        const response = await api.getAdminPaymentSettings();
        setPaymentMethods(response.methods);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load admin data'));
    } finally {
      if (tabName === 'orders') {
        setOrdersLoading(false);
      }
    }
  }

  async function handleStatusChange(orderId: number, status: string) {
    setUpdatingOrder(orderId);
    setError(null);
    try {
      const response = await api.updateAdminOrderStatus(orderId, status);
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order as AdminOrder : order)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update status'));
    } finally {
      setUpdatingOrder(null);
    }
  }

  async function handleConfirmPendingPayment(orderId: number) {
    setError(null);
    try {
      const response = await api.confirmAdminOrderPayment(orderId);
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order as AdminOrder : order)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to confirm payment'));
    }
  }

  async function handleRejectPendingPayment(orderId: number) {
    setError(null);
    try {
      const response = await api.rejectAdminOrderPayment(orderId);
      setOrders((current) => current.map((order) => (order.id === orderId ? response.order as AdminOrder : order)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to reject payment'));
    }
  }

  async function handleCreateCity() {
    if (creatingCity || !newCityName.trim()) return;
    setCreatingCity(true);
    setError(null);

    try {
      const response = await api.createAdminCity({
        name: newCityName.trim(),
        nameEn: newCityNameEn.trim() || undefined,
        sortOrder: Number(newCitySortOrder) || 0,
        isActive: newCityIsActive,
      });
      setCities((current) => [...current, response.city as AdminCity].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setNewCityName('');
      setNewCityNameEn('');
      setNewCitySortOrder('0');
      setNewCityIsActive(true);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create city'));
    } finally {
      setCreatingCity(false);
    }
  }

  async function handleSaveCity(cityId: number) {
    const edits = cityEdits[cityId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminCity>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn;
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.sortOrder === 'string') payload.sortOrder = Number(edits.sortOrder);
      const response = await api.updateAdminCity(cityId, payload);
      setCities((current) => current.map((city) => (city.id === cityId ? response.city as AdminCity : city)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setEditingCity(null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update city'));
    }
  }

  async function handleCreateCategory() {
    if (creatingCat || !newCatName.trim()) return;
    setCreatingCat(true);
    setError(null);

    try {
      const response = await api.createAdminCategory({
        name: newCatName.trim(),
        nameEn: newCatNameEn.trim() || undefined,
        sortOrder: Number(newCatOrder) || 0,
      });
      setCategories((current) => [...current, response.category].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setNewCatName('');
      setNewCatNameEn('');
      setNewCatOrder('0');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create category'));
    } finally {
      setCreatingCat(false);
    }
  }

  async function handleSaveCategory(categoryId: number) {
    const edits = catEdits[categoryId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminCategory>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn;
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.sortOrder === 'string') payload.sortOrder = Number(edits.sortOrder);
      const response = await api.updateAdminCategory(categoryId, payload);
      setCategories((current) => current.map((category) => (category.id === categoryId ? response.category : category)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setEditingCat(null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update category'));
    }
  }

  async function handleCreateProduct() {
    if (creatingProd || !newProdName.trim() || !newProdPrice || !newProdCategoryId) return;
    setCreatingProd(true);
    setError(null);

    try {
      const price = parseNonNegativeNumber(newProdPrice, 'Price must be a positive number');
      if (price <= 0) {
        throw new Error('Price must be a positive number');
      }

      const cityPayload = Object.values(newProdCities).map((draft) => buildProductCityPayload(draft));
      await api.createAdminProduct({
        name: newProdName.trim(),
        nameEn: newProdNameEn.trim() || undefined,
        description: newProdDescription.trim() || undefined,
        descriptionEn: newProdDescriptionEn.trim() || undefined,
        price,
        categoryId: Number(newProdCategoryId),
        image: newProdImage.trim() || undefined,
        isActive: newProdIsActive,
        isRecommended: newProdIsRecommended,
        cities: cityPayload,
      });

      setNewProdName('');
      setNewProdNameEn('');
      setNewProdDescription('');
      setNewProdDescriptionEn('');
      setNewProdPrice('');
      setNewProdCategoryId('');
      setNewProdImage('');
      setNewProdIsActive(true);
      setNewProdIsRecommended(false);
      setNewProdCities({});
      setShowNewProduct(false);
      await refreshProducts();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create product'));
    } finally {
      setCreatingProd(false);
    }
  }

  async function handleSaveProduct(productId: number) {
    const edits = productEdits[productId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateAdminProduct>[1] = {};
      if (typeof edits.name === 'string') payload.name = edits.name;
      if (typeof edits.nameEn === 'string') payload.nameEn = edits.nameEn.trim() || null;
      if (typeof edits.description === 'string') payload.description = edits.description;
      if (typeof edits.descriptionEn === 'string') payload.descriptionEn = edits.descriptionEn.trim() || null;
      if (typeof edits.image === 'string') payload.image = edits.image.trim() || null;
      if (typeof edits.categoryId === 'string' && edits.categoryId) payload.categoryId = Number(edits.categoryId);
      if (typeof edits.price === 'string' && edits.price) payload.price = Number(edits.price);
      if (typeof edits.isActive === 'boolean') payload.isActive = edits.isActive;
      if (typeof edits.isRecommended === 'boolean') payload.isRecommended = edits.isRecommended;
      await api.updateAdminProduct(productId, payload);
      setEditingProduct(null);
      await refreshProducts();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update product'));
    }
  }

  async function handleSaveProductCity(productCityId: number) {
    const edits = productCityEdits[productCityId];
    if (!edits) return;
    setError(null);

    try {
      const payload: Parameters<typeof api.updateProductCity>[1] = {};
      if (typeof edits.stock === 'string' && edits.stock !== '') payload.stock = parseNonNegativeNumber(edits.stock, 'Stock must be zero or greater');
      if (typeof edits.isAvailable === 'boolean') payload.isAvailable = edits.isAvailable;
      if (typeof edits.minimumQuantity === 'string' && edits.minimumQuantity !== '') payload.minimumQuantity = parsePositiveInteger(edits.minimumQuantity, 'Minimum quantity must be a positive integer');
      if (typeof edits.quantityStep === 'string' && edits.quantityStep !== '') payload.quantityStep = parsePositiveInteger(edits.quantityStep, 'Quantity step must be a positive integer');
      if (typeof edits.maximumQuantity === 'string' && edits.maximumQuantity !== '') payload.maximumQuantity = parsePositiveInteger(edits.maximumQuantity, 'Maximum quantity must be a positive integer');
      if (typeof edits.unit === 'string') payload.unit = edits.unit;
      await api.updateProductCity(productCityId, payload);
      setEditingProductCity(null);
      await refreshProducts();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update city availability'));
    }
  }

  async function handleAddProductCity(productId: number) {
    const draft = newProductCityDrafts[productId];
    if (!draft) return;
    setError(null);

    try {
      const payload = buildProductCityPayload(draft);
      await api.createAdminProductCity({ productId, ...payload });
      setNewProductCityDrafts((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      await refreshProducts();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to add city availability'));
    }
  }

  async function handleCreateDiscount() {
    if (creatingDiscount || !newCode || !newValue) return;
    setCreatingDiscount(true);
    setError(null);

    try {
      const response = await api.createAdminDiscount({
        code: newCode,
        type: newType,
        value: Number(newValue),
        minOrderAmount: newMin ? Number(newMin) : 0,
      });
      setDiscounts((current) => [response.discount, ...current]);
      setNewCode('');
      setNewValue('');
      setNewMin('');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create discount'));
    } finally {
      setCreatingDiscount(false);
    }
  }

  async function handleCreatePaymentMethod() {
    if (!newPaymentTitle.trim()) return;
    setError(null);

    try {
      const response = await api.createAdminPaymentSetting({
        type: newPaymentType,
        title: newPaymentTitle.trim(),
        currency: newPaymentCurrency.trim() || undefined,
        network: newPaymentNetwork.trim() || undefined,
        walletAddress: newPaymentWalletAddress.trim() || undefined,
        cardNumber: newPaymentCardNumber.trim() || undefined,
        cardholderName: newPaymentCardholderName.trim() || undefined,
      });
      setPaymentMethods((current) => [...current, response.method]);
      setNewPaymentTitle('');
      setNewPaymentCurrency('');
      setNewPaymentNetwork('');
      setNewPaymentWalletAddress('');
      setNewPaymentCardNumber('');
      setNewPaymentCardholderName('');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create payment method'));
    }
  }

  async function handleTogglePaymentMethod(id: number) {
    setError(null);
    try {
      const response = await api.toggleAdminPaymentSetting(id);
      setPaymentMethods((current) => current.map((method) => (method.id === id ? response.method : method)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to toggle payment method'));
    }
  }

  async function handleDeletePaymentMethod(id: number) {
    setError(null);
    try {
      await api.deleteAdminPaymentSetting(id);
      setPaymentMethods((current) => current.filter((method) => method.id !== id));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to delete payment method'));
    }
  }

  async function handleAdminReply(ticketId: number) {
    const message = replyText[ticketId]?.trim();
    if (!message) return;
    setError(null);

    try {
      const response = await api.adminReplySupportTicket(ticketId, message);
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? response.ticket : ticket)));
      setReplyText((current) => ({ ...current, [ticketId]: '' }));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to send reply'));
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
      setError(getErrorMessage(e, 'Login failed'));
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
        <h1 className={styles.title}><Settings size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 8 }} />Admin Panel</h1>
        <p className={styles.loading}>{t('common.loading', { defaultValue: 'Loading...' })}</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}><Settings size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 8 }} />Admin Panel</h1>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.form}>
          <h3 className={styles.formTitle}>{t('admin.login', { defaultValue: 'Admin login' })}</h3>
          <input
            className={styles.input}
            type="password"
            placeholder={t('admin.password', { defaultValue: 'Password' })}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleLogin()}
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
      <h1 className={styles.title}><Settings size={18} strokeWidth={1.5} style={{ verticalAlign: 'middle', marginRight: 8 }} />Admin Panel</h1>
      <div className={styles.filterRow}>
        <button className={styles.filterBtn} onClick={() => void handleLogout()}>
          {t('common.logout', { defaultValue: 'Logout' })}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tabs}>
        {tabs.map((tabName) => (
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
            <select className={styles.filterSelect} value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}>
              <option value="">{t('admin.allStatuses', { defaultValue: 'All statuses' })}</option>
              {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button className={styles.filterBtn} onClick={() => void loadTab('orders')}>
              {t('admin.filter', { defaultValue: 'Filter' })}
            </button>
          </div>
          {ordersLoading ? <p className={styles.loading}>{t('common.loading', { defaultValue: 'Loading...' })}</p> : (
            <div className={styles.orderList}>
              {orders.map((order) => (
                <div key={order.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>#{order.id}</span>
                    <span className={styles.orderTotal}>{formatCurrency(order.total, language)}</span>
                  </div>
                  <p className={styles.orderMeta}>
                    {new Date(order.createdAt).toLocaleString()} • {order.city?.name ?? ''}
                  </p>
                  {order.user && (
                    <p className={styles.orderMeta}>
                      {order.user.firstName}{order.user.username ? ` @${order.user.username}` : ''} • TG: {order.user.telegramId}
                    </p>
                  )}
                  {order.paymentMethod && (
                    <p className={styles.orderMeta}>
                      {t('checkout.paymentMethod', { defaultValue: 'Payment method' })}: {order.paymentMethod.title}
                      {order.paymentStatus ? ` • ${order.paymentStatus}` : ''}
                    </p>
                  )}
                  <div className={styles.statusRow}>
                    <select
                      className={styles.statusSelect}
                      value={order.status}
                      onChange={(event) => void handleStatusChange(order.id, event.target.value)}
                      disabled={updatingOrder === order.id}
                    >
                      {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
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
                  {order.items.length > 0 && (
                    <div>
                      <button
                        className={styles.replyBtn}
                        style={{ marginTop: 6, fontSize: 11 }}
                        onClick={() => setExpandedOrder((current) => (current === order.id ? null : order.id))}
                      >
                        {expandedOrder === order.id ? 'Hide items' : `${order.items.length} items`}
                      </button>
                      {expandedOrder === order.id && (
                        <div className={styles.cityStockList}>
                          {order.items.map((item) => (
                            <div key={item.id} className={styles.cityStockRow}>
                              <span className={styles.cityName}>{item.productName}</span>
                              <span>×{item.quantity}</span>
                              <span>{formatCurrency(item.price, language)}</span>
                              <span>{formatCurrency(item.lineTotal, language)}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
            <button className={styles.filterBtn} onClick={() => void refreshProducts()}>
              {t('admin.refresh', { defaultValue: 'Refresh' })}
            </button>
            <button className={styles.createBtn} onClick={() => setShowNewProduct((current) => !current)}>
              {showNewProduct ? <><X size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('common.cancel', { defaultValue: 'Cancel' })}</> : t('admin.newProduct', { defaultValue: 'New product' })}
            </button>
          </div>

          {showNewProduct && (
            <div className={styles.form}>
              <p className={styles.formTitle}>{t('admin.newProduct', { defaultValue: 'New product' })}</p>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Name *" value={newProdName} onChange={(event) => setNewProdName(event.target.value)} />
                <input className={styles.input} placeholder="Name EN" value={newProdNameEn} onChange={(event) => setNewProdNameEn(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Description" value={newProdDescription} onChange={(event) => setNewProdDescription(event.target.value)} />
                <input className={styles.input} placeholder="Description EN" value={newProdDescriptionEn} onChange={(event) => setNewProdDescriptionEn(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} type="number" placeholder="Price *" value={newProdPrice} onChange={(event) => setNewProdPrice(event.target.value)} />
                <select className={styles.select} value={newProdCategoryId} onChange={(event) => setNewProdCategoryId(event.target.value)}>
                  <option value="">{t('admin.category', { defaultValue: 'Category' })} *</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className={styles.formRow}>
                <input className={styles.input} placeholder="Image URL" value={newProdImage} onChange={(event) => setNewProdImage(event.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.checkLabel}><input type="checkbox" checked={newProdIsActive} onChange={(event) => setNewProdIsActive(event.target.checked)} /> {t('admin.active', { defaultValue: 'Active' })}</label>
                <label className={styles.checkLabel}><input type="checkbox" checked={newProdIsRecommended} onChange={(event) => setNewProdIsRecommended(event.target.checked)} /> {t('admin.recommended', { defaultValue: 'Recommended' })}</label>
              </div>
              {cities.length > 0 && (
                <div>
                  <p className={styles.formTitle} style={{ fontSize: 12 }}>{t('admin.cityAvailability', { defaultValue: 'City availability' })}</p>
                  {cities.map((city) => {
                    const entry = newProdCities[city.id];
                    return (
                      <div key={city.id} className={styles.cityStockRow}>
                        <label className={styles.checkLabel}>
                          <input
                            type="checkbox"
                            checked={Boolean(entry)}
                            onChange={(event) => {
                              setNewProdCities((current) => {
                                const next = { ...current };
                                if (event.target.checked) {
                                  next[city.id] = createDefaultProductCityDraft(String(city.id));
                                } else {
                                  delete next[city.id];
                                }
                                return next;
                              });
                            }}
                          />
                          <span className={styles.cityName}>{city.name}</span>
                        </label>
                        {entry && (
                          <>
                            <input className={styles.inputSmall} type="number" placeholder="Stock" value={entry.stock} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], stock: event.target.value } }))} />
                            <input className={styles.inputSmall} type="number" placeholder="Min" value={entry.minimumQuantity} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], minimumQuantity: event.target.value } }))} />
                            <input className={styles.inputSmall} type="number" placeholder="Step" value={entry.quantityStep} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], quantityStep: event.target.value } }))} />
                            <input className={styles.inputSmall} type="number" placeholder="Max" value={entry.maximumQuantity} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], maximumQuantity: event.target.value } }))} />
                            <input className={styles.inputSmall} placeholder="Unit" value={entry.unit} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], unit: event.target.value } }))} />
                            <label className={styles.checkLabel}>
                              <input type="checkbox" checked={entry.isAvailable} onChange={(event) => setNewProdCities((current) => ({ ...current, [city.id]: { ...current[city.id], isAvailable: event.target.checked } }))} />
                              {t('admin.available', { defaultValue: 'Available' })}
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <button className={styles.createBtn} onClick={() => void handleCreateProduct()} disabled={creatingProd || !newProdName.trim() || !newProdPrice || !newProdCategoryId}>
                {creatingProd ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createProduct', { defaultValue: 'Create product' })}
              </button>
            </div>
          )}

          <div className={styles.orderList}>
            {products.map((product) => {
              const availableCities = cities.filter((city) => !product.productCities.some((productCity) => productCity.cityId === city.id));
              const addCityDraft = newProductCityDrafts[product.id] ?? createDefaultProductCityDraft(availableCities[0] ? String(availableCities[0].id) : '');
              return (
                <div key={product.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <span className={styles.orderId}>#{product.id} {product.name}</span>
                    <span className={`${styles.refundTag} ${product.isActive ? styles.tagActive : styles.tagInactive}`}>
                      {product.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                    </span>
                  </div>
                  <p className={styles.orderMeta}>
                    {product.category.name} • {formatCurrency(product.price, language)}
                    {product.isRecommended ? <Star size={12} strokeWidth={1.5} fill="currentColor" style={{ verticalAlign: 'middle', marginLeft: 4 }} /> : null}
                  </p>
                  {product.image && <p className={styles.orderMeta}>{product.image}</p>}
                  {product.description && <p className={styles.orderMeta}>{product.description}</p>}

                  {editingProduct === product.id ? (
                    <div className={styles.form}>
                      <div className={styles.formRow}>
                        <input className={styles.input} placeholder="Name" value={productEdits[product.id]?.name ?? product.name} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], name: event.target.value } }))} />
                        <input className={styles.input} placeholder="Name EN" value={productEdits[product.id]?.nameEn ?? (product.nameEn ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], nameEn: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <input className={styles.input} placeholder="Description" value={productEdits[product.id]?.description ?? product.description} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], description: event.target.value } }))} />
                        <input className={styles.input} placeholder="Description EN" value={productEdits[product.id]?.descriptionEn ?? (product.descriptionEn ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], descriptionEn: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <input className={styles.input} type="number" placeholder="Price" value={productEdits[product.id]?.price ?? String(product.price)} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], price: event.target.value } }))} />
                        <select className={styles.select} value={productEdits[product.id]?.categoryId ?? String(product.categoryId)} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], categoryId: event.target.value } }))}>
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      </div>
                      <div className={styles.formRow}>
                        <input className={styles.input} placeholder="Image URL" value={productEdits[product.id]?.image ?? (product.image ?? '')} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], image: event.target.value } }))} />
                      </div>
                      <div className={styles.formRow}>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={productEdits[product.id]?.isActive ?? product.isActive} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], isActive: event.target.checked } }))} />
                          {t('admin.active', { defaultValue: 'Active' })}
                        </label>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={productEdits[product.id]?.isRecommended ?? product.isRecommended} onChange={(event) => setProductEdits((current) => ({ ...current, [product.id]: { ...current[product.id], isRecommended: event.target.checked } }))} />
                          {t('admin.recommended', { defaultValue: 'Recommended' })}
                        </label>
                      </div>
                      <div className={styles.replyRow}>
                        <button className={styles.replyBtn} onClick={() => void handleSaveProduct(product.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                        <button className={styles.replyBtn} onClick={() => setEditingProduct(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => { setEditingProduct(product.id); setProductEdits((current) => ({ ...current, [product.id]: {} })); }}>
                        {t('admin.editProduct', { defaultValue: 'Edit' })}
                      </button>
                    </div>
                  )}

                  {product.productCities.length > 0 && (
                    <div className={styles.cityStockList}>
                      {product.productCities.map((productCity) => (
                        <div key={productCity.id} className={styles.cityStockRow}>
                          <span className={styles.cityName}>{productCity.city.name}</span>
                          {editingProductCity === productCity.id ? (
                            <>
                              <input className={styles.inputSmall} type="number" placeholder="Stock" value={productCityEdits[productCity.id]?.stock ?? String(productCity.stock)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], stock: event.target.value } }))} />
                              <input className={styles.inputSmall} type="number" placeholder="Min" value={productCityEdits[productCity.id]?.minimumQuantity ?? String(productCity.minimumQuantity)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], minimumQuantity: event.target.value } }))} />
                              <input className={styles.inputSmall} type="number" placeholder="Step" value={productCityEdits[productCity.id]?.quantityStep ?? String(productCity.quantityStep)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], quantityStep: event.target.value } }))} />
                              <input className={styles.inputSmall} type="number" placeholder="Max" value={productCityEdits[productCity.id]?.maximumQuantity ?? String(productCity.maximumQuantity)} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], maximumQuantity: event.target.value } }))} />
                              <input className={styles.inputSmall} placeholder="Unit" value={productCityEdits[productCity.id]?.unit ?? productCity.unit} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], unit: event.target.value } }))} />
                              <label className={styles.checkLabel}>
                                <input type="checkbox" checked={productCityEdits[productCity.id]?.isAvailable ?? productCity.isAvailable} onChange={(event) => setProductCityEdits((current) => ({ ...current, [productCity.id]: { ...current[productCity.id], isAvailable: event.target.checked } }))} />
                                {t('admin.available', { defaultValue: 'Available' })}
                              </label>
                              <button className={styles.replyBtn} onClick={() => void handleSaveProductCity(productCity.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                              <button className={styles.replyBtn} onClick={() => setEditingProductCity(null)}><X size={14} strokeWidth={2} /></button>
                            </>
                          ) : (
                            <>
                              <span>Stock: {productCity.stock}</span>
                              <span>Min: {productCity.minimumQuantity}</span>
                              <span>Step: {productCity.quantityStep}</span>
                              <span>Max: {productCity.maximumQuantity}</span>
                              <span>Unit: {productCity.unit}</span>
                              <span>{productCity.isAvailable ? <><Check size={12} strokeWidth={2} style={{ verticalAlign: 'middle' }} /> {t('admin.available', { defaultValue: 'Available' })}</> : <><X size={12} strokeWidth={2} style={{ verticalAlign: 'middle' }} /> {t('admin.unavailable', { defaultValue: 'Unavailable' })}</>}</span>
                              <button className={styles.replyBtn} onClick={() => { setEditingProductCity(productCity.id); setProductCityEdits((current) => ({ ...current, [productCity.id]: {} })); }}>{t('admin.editStock', { defaultValue: 'Edit city' })}</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {availableCities.length > 0 && (
                    <div className={styles.form}>
                      <p className={styles.formTitle}>{t('admin.addCityAssignment', { defaultValue: 'Add city availability' })}</p>
                      <div className={styles.formRow}>
                        <select
                          className={styles.select}
                          value={addCityDraft.cityId}
                          onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, cityId: event.target.value } }))}
                        >
                          {availableCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                        </select>
                        <input className={styles.inputSmall} type="number" placeholder="Stock" value={addCityDraft.stock} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, stock: event.target.value } }))} />
                        <input className={styles.inputSmall} type="number" placeholder="Min" value={addCityDraft.minimumQuantity} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, minimumQuantity: event.target.value } }))} />
                        <input className={styles.inputSmall} type="number" placeholder="Step" value={addCityDraft.quantityStep} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, quantityStep: event.target.value } }))} />
                        <input className={styles.inputSmall} type="number" placeholder="Max" value={addCityDraft.maximumQuantity} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, maximumQuantity: event.target.value } }))} />
                        <input className={styles.inputSmall} placeholder="Unit" value={addCityDraft.unit} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, unit: event.target.value } }))} />
                      </div>
                      <div className={styles.replyRow}>
                        <label className={styles.checkLabel}>
                          <input type="checkbox" checked={addCityDraft.isAvailable} onChange={(event) => setNewProductCityDrafts((current) => ({ ...current, [product.id]: { ...addCityDraft, isAvailable: event.target.checked } }))} />
                          {t('admin.available', { defaultValue: 'Available' })}
                        </label>
                        <button className={styles.replyBtn} onClick={() => void handleAddProductCity(product.id)}>
                          {t('admin.addCityAssignment', { defaultValue: 'Add city availability' })}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                    {user.firstName}{user.lastName ? ` ${user.lastName}` : ''}{user.username ? ` @${user.username}` : ''}
                  </span>
                  {user.language && <span className={styles.orderMeta}>{user.language.toUpperCase()}</span>}
                </div>
                <p className={styles.orderMeta}>TG: {user.telegramId}{user.selectedCity ? <> • <MapPin size={12} strokeWidth={1.5} style={{ verticalAlign: 'middle' }} /> {user.selectedCity.name}</> : ''}</p>
                {user.balance != null && <p className={styles.orderMeta}>Balance: {formatCurrency(user.balance, language)}</p>}
                <p className={styles.orderMeta}>{t('orders.title', { defaultValue: 'Orders' })}: {user.orderCount ?? 0}</p>
              </div>
            ))}
            {users.length === 0 && <p className={styles.loading}>{t('admin.noUsers', { defaultValue: 'No users found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'cities' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createCity', { defaultValue: 'Create city' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Name" value={newCityName} onChange={(event) => setNewCityName(event.target.value)} />
              <input className={styles.input} placeholder="Name EN" value={newCityNameEn} onChange={(event) => setNewCityNameEn(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Sort order" value={newCitySortOrder} onChange={(event) => setNewCitySortOrder(event.target.value)} />
              <label className={styles.checkLabel}><input type="checkbox" checked={newCityIsActive} onChange={(event) => setNewCityIsActive(event.target.checked)} /> {t('admin.active', { defaultValue: 'Active' })}</label>
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateCity()} disabled={creatingCity || !newCityName.trim()}>
              {creatingCity ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createCity', { defaultValue: 'Create city' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {cities.map((city) => (
              <div key={city.id} className={styles.discountCard}>
                {editingCity === city.id ? (
                  <div className={styles.form} style={{ marginBottom: 0, width: '100%' }}>
                    <div className={styles.formRow}>
                      <input className={styles.input} placeholder="Name" value={cityEdits[city.id]?.name ?? city.name} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], name: event.target.value } }))} />
                      <input className={styles.input} placeholder="Name EN" value={cityEdits[city.id]?.nameEn ?? (city.nameEn ?? '')} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], nameEn: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} type="number" placeholder="Sort order" value={cityEdits[city.id]?.sortOrder ?? String(city.sortOrder)} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], sortOrder: event.target.value } }))} />
                      <label className={styles.checkLabel}><input type="checkbox" checked={cityEdits[city.id]?.isActive ?? city.isActive} onChange={(event) => setCityEdits((current) => ({ ...current, [city.id]: { ...current[city.id], isActive: event.target.checked } }))} /> {t('admin.active', { defaultValue: 'Active' })}</label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveCity(city.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingCity(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={styles.discountCode}>{city.name}</span>
                      {city.nameEn ? <span> / {city.nameEn}</span> : null}
                      <span className={`${styles.refundTag} ${city.isActive ? styles.tagActive : styles.tagInactive}`}>
                        {city.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                      </span>
                      <span className={styles.orderMeta}> • {t('admin.sortOrder', { defaultValue: 'Sort' })}: {city.sortOrder}</span>
                      {city._count ? <span className={styles.orderMeta}> • {city._count.users} users • {city._count.productCities} product cities • {city._count.orders} orders</span> : null}
                    </div>
                    <button className={styles.replyBtn} onClick={() => { setEditingCity(city.id); setCityEdits((current) => ({ ...current, [city.id]: {} })); }}>{t('common.edit', { defaultValue: 'Edit' })}</button>
                  </>
                )}
              </div>
            ))}
            {cities.length === 0 && <p className={styles.loading}>{t('admin.noCities', { defaultValue: 'No cities found.' })}</p>}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div>
          <div className={styles.form}>
            <h3 className={styles.formTitle}>{t('admin.createCategory', { defaultValue: 'Create category' })}</h3>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Name (RU)" value={newCatName} onChange={(event) => setNewCatName(event.target.value)} />
              <input className={styles.input} placeholder="Name (EN)" value={newCatNameEn} onChange={(event) => setNewCatNameEn(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Sort order" value={newCatOrder} onChange={(event) => setNewCatOrder(event.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateCategory()} disabled={creatingCat || !newCatName.trim()}>
              {creatingCat ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createCategory', { defaultValue: 'Create' })}
            </button>
          </div>

          <div className={styles.discountList}>
            {categories.map((category) => (
              <div key={category.id} className={styles.discountCard}>
                {editingCat === category.id ? (
                  <div className={styles.form}>
                    <div className={styles.formRow}>
                      <input className={styles.input} placeholder="Name (RU)" value={catEdits[category.id]?.name ?? category.name} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], name: event.target.value } }))} />
                      <input className={styles.input} placeholder="Name (EN)" value={catEdits[category.id]?.nameEn ?? (category.nameEn ?? '')} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], nameEn: event.target.value } }))} />
                    </div>
                    <div className={styles.formRow}>
                      <input className={styles.input} type="number" placeholder="Sort order" value={catEdits[category.id]?.sortOrder ?? String(category.sortOrder ?? 0)} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], sortOrder: event.target.value } }))} />
                      <label className={styles.checkLabel}>
                        <input type="checkbox" checked={catEdits[category.id]?.isActive ?? category.isActive} onChange={(event) => setCatEdits((current) => ({ ...current, [category.id]: { ...current[category.id], isActive: event.target.checked } }))} />
                        {t('admin.active', { defaultValue: 'Active' })}
                      </label>
                    </div>
                    <div className={styles.replyRow}>
                      <button className={styles.replyBtn} onClick={() => void handleSaveCategory(category.id)}>{t('common.save', { defaultValue: 'Save' })}</button>
                      <button className={styles.replyBtn} onClick={() => setEditingCat(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className={styles.discountCode}>{category.name}</span>
                      {category.nameEn ? <span> / {category.nameEn}</span> : null}
                      <span className={`${styles.refundTag} ${category.isActive ? styles.tagActive : styles.tagInactive}`}>
                        {category.isActive ? t('admin.active', { defaultValue: 'Active' }) : t('admin.inactive', { defaultValue: 'Inactive' })}
                      </span>
                      <span className={styles.orderMeta}> • {category._count.products} products</span>
                    </div>
                    <button className={styles.replyBtn} onClick={() => { setEditingCat(category.id); setCatEdits((current) => ({ ...current, [category.id]: {} })); }}>{t('common.edit', { defaultValue: 'Edit' })}</button>
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
              <input className={styles.input} placeholder="Code" value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} />
              <select className={styles.select} value={newType} onChange={(event) => setNewType(event.target.value)}>
                <option value="percent">%</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} type="number" placeholder="Value" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
              <input className={styles.input} type="number" placeholder="Min order" value={newMin} onChange={(event) => setNewMin(event.target.value)} />
            </div>
            <button className={styles.createBtn} onClick={() => void handleCreateDiscount()} disabled={creatingDiscount || !newCode || !newValue}>
              {creatingDiscount ? t('common.loading', { defaultValue: 'Loading...' }) : t('admin.createDiscount', { defaultValue: 'Create' })}
            </button>
          </div>
          <div className={styles.discountList}>
            {discounts.map((discount) => (
              <div key={discount.id} className={styles.discountCard}>
                <span className={styles.discountCode}>{discount.code}</span>
                <span>{discount.value}{discount.type === 'percent' ? '%' : ' fixed'}</span>
                <span>{t('admin.minOrder', { defaultValue: 'Min' })}: {discount.minOrderAmount}</span>
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
              {ticket.replies.map((reply) => (
                <div key={reply.id} className={`${styles.reply} ${reply.isAdmin ? styles.replyAdmin : styles.replyUser}`}>
                  <strong>{reply.isAdmin ? 'Admin' : 'User'}</strong>: {reply.message}
                </div>
              ))}
              <div className={styles.replyRow}>
                <input className={styles.input} placeholder="Reply..." value={replyText[ticket.id] ?? ''} onChange={(event) => setReplyText((current) => ({ ...current, [ticket.id]: event.target.value }))} />
                <button className={styles.replyBtn} onClick={() => void handleAdminReply(ticket.id)}>
                  {t('common.send', { defaultValue: 'Send' })}
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
              <select className={styles.select} value={newPaymentType} onChange={(event) => setNewPaymentType(event.target.value as PaymentMethod['type'])}>
                <option value="card">Card</option>
                <option value="ton">TON</option>
                <option value="crypto">Crypto</option>
              </select>
              <input className={styles.input} placeholder={t('admin.methodTitle', { defaultValue: 'Title' })} value={newPaymentTitle} onChange={(event) => setNewPaymentTitle(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.currency', { defaultValue: 'Currency' })} value={newPaymentCurrency} onChange={(event) => setNewPaymentCurrency(event.target.value)} />
              <input className={styles.input} placeholder={t('checkout.network', { defaultValue: 'Network' })} value={newPaymentNetwork} onChange={(event) => setNewPaymentNetwork(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.walletAddress', { defaultValue: 'Wallet address' })} value={newPaymentWalletAddress} onChange={(event) => setNewPaymentWalletAddress(event.target.value)} />
            </div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder={t('checkout.cardNumber', { defaultValue: 'Card number' })} value={newPaymentCardNumber} onChange={(event) => setNewPaymentCardNumber(event.target.value)} />
              <input className={styles.input} placeholder={t('checkout.cardholder', { defaultValue: 'Cardholder (optional)' })} value={newPaymentCardholderName} onChange={(event) => setNewPaymentCardholderName(event.target.value)} />
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
